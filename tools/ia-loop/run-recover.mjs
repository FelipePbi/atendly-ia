#!/usr/bin/env node
/**
 * IA Loop — recovery after a process restart.
 *
 *   npm run ia-loop:recover            inspect and recover
 *   npm run ia-loop:recover -- --dry-run   inspect only, change nothing
 *
 * For the case a crash actually leaves behind: the machine rebooted, the
 * terminal was closed, the orchestrator was killed. The lease is still on disk,
 * its heartbeat has aged, the runtime still says an agent was running, and
 * nothing can move.
 *
 * This is deliberately NOT ia-loop:resume. Resume is for a run parked by a
 * usage limit, where nothing was interrupted and the deadline decides when work
 * continues. Recovery is for a run whose owner disappeared. Folding them
 * together would make "the model is rate-limited" and "the process died" the
 * same event, and they need opposite answers.
 *
 * It never deletes a lease to get moving. A lease is taken over only when the
 * old holder is PROVEN unable to write again, and the swap is atomic.
 *
 * It calls no model, and never resolves a human gate.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { createJobStore } from './lib/job-store.mjs';
import { createLeaseStore } from './lib/leases.mjs';
import { createAutonomousStore, LOOP_LEASE_KEY } from './lib/autonomous-state.mjs';
import { createProcessInspector } from './lib/process-inspector.mjs';
import { OWNER_STATUS, collectOwnerEvidence, isRecoveryEligible, judgeOwner } from './lib/orphan-evidence.mjs';
import { RECOVERY_ACTIONS, planRecovery } from './lib/recovery-plan.mjs';
import { readRuntimeStrict } from './lib/capacity-state.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '.state');

const emit = (line = '') => console.log(line);

function parseArgs(argv) {
  const args = argv.slice(2);
  return { dryRun: args.includes('--dry-run') };
}

/** The next command to run, once the state is consistent again. */
function continuationFor(plan) {
  if (plan.phase === 'close') return 'npm run ia-loop:auto';
  if (plan.phase === 'auto') return 'npm run ia-loop:auto';
  return 'npm run ia-loop:auto';
}

async function main() {
  const { dryRun } = parseArgs(process.argv);
  const store = createJobStore(STATE_DIR);
  const leaseStore = createLeaseStore(STATE_DIR);
  const auto = createAutonomousStore(STATE_DIR);
  const inspector = createProcessInspector();

  const runtime = await readRuntimeStrict(store);
  const autonomousRun = await auto.read();
  const lease = await leaseStore.readJobLease(LOOP_LEASE_KEY);
  const now = Date.now();

  emit('');
  emit('ATENDLY IA LOOP — RECOVERY');
  emit('');
  emit(`Goal: ${runtime?.goal ?? 'n/a'}`);
  emit(`Round: ${runtime?.round ?? 'n/a'}`);
  emit(`Stored state: ${runtime?.state ?? 'n/a'}`);
  if (autonomousRun) emit(`Autonomous run: ${autonomousRun.autonomousRunId} (${autonomousRun.status})`);
  emit('');

  // --- Who held the loop, and can they still write? -------------------------
  let verdict = null;
  if (lease) {
    emit('Lease:');
    emit(`  Owner: ${lease.workerInstanceId ?? 'unknown'}`);
    emit(`  Attempt: ${lease.attemptId ?? 'not recorded (lease predates attempt ids)'}`);
    emit(`  Last heartbeat: ${lease.heartbeatAt}`);
    emit('');
    emit('Checking previous owner…');

    const evidence = await collectOwnerEvidence(lease, inspector, { now });
    verdict = judgeOwner({ lease, evidence, now });

    emit(`  Process ${evidence.leasePid ?? '?'}: ${evidence.pidLiveness ?? 'not checked'}`);
    emit(`  Boot: lease ${lease.acquiredAt} · machine booted ${evidence.currentBootAt}`);
    emit('');
    emit(`${verdict.status}${verdict.proof ? ` (${verdict.proof})` : ''}`);
    emit(`  ${verdict.detail}`);
    emit('');

    // Recorded only when we are actually acting: --dry-run writes nothing,
    // not even history, so it is safe to run at any moment.
    if (!dryRun) await store.appendEvent({
      type: verdict.status === OWNER_STATUS.ORPHAN_CONFIRMED
        ? 'ORCHESTRATOR_ORPHAN_CONFIRMED' : 'ORCHESTRATOR_ORPHAN_SUSPECTED',
      goal: runtime?.goal ?? null,
      round: runtime?.round ?? null,
      state: runtime?.state ?? null,
      runId: autonomousRun?.autonomousRunId ?? null,
      attemptId: lease.attemptId ?? null,
      owner: lease.workerInstanceId ?? null,
      proof: verdict.proof ?? null,
      detail: verdict.detail,
    });
  } else {
    emit('Lease: none on disk.');
    emit('');
  }

  // --- What is the safe next step? ------------------------------------------
  const jobId = runtime?.currentJobId ?? null;
  const roleForState = runtime?.state?.startsWith('REVIEWER') || runtime?.state === 'CLOSURE_DOCUMENTING'
    || runtime?.state === 'NEXT_GOAL_PLANNING' ? 'tech_lead' : 'developer';

  const resultExists = jobId ? await store.hasCompletedResult(roleForState, jobId) : false;
  const jobStatus = jobId ? await store.readJobStatus(roleForState, jobId).catch(() => null) : null;

  const plan = planRecovery({
    runtime,
    autonomousRun,
    ownerVerdict: verdict,
    leaseExists: Boolean(lease),
    resultExists,
    jobStatus,
  });

  if (plan.action === RECOVERY_ACTIONS.NOTHING_TO_RECOVER) {
    emit(plan.message);
    return 0;
  }

  if (plan.action === RECOVERY_ACTIONS.BLOCKED) {
    emit('RECOVERY_BLOCKED');
    emit(`  ${plan.reason}: ${plan.message}`);
    if (!dryRun) await store.appendEvent({
      type: 'RECOVERY_BLOCKED',
      goal: runtime?.goal ?? null, round: runtime?.round ?? null, state: runtime?.state ?? null,
      runId: autonomousRun?.autonomousRunId ?? null, reason: plan.reason,
    });
    return 1;
  }

  emit(`${plan.agent === 'tech_lead' ? 'ReviewResult' : plan.agent === 'developer' ? 'DeveloperResult' : 'Phase'}:`);
  emit(`  ${plan.message}`);
  emit('');
  emit('Next safe action:');
  emit(`  ${plan.action}${plan.jobId ? ` — ${plan.jobId}` : ''}`);
  emit('');

  if (dryRun) {
    emit('--dry-run: nothing was changed, no lease was taken.');
    return 0;
  }

  // --- Take the loop over, atomically ---------------------------------------
  if (lease) {
    if (!isRecoveryEligible(verdict)) {
      emit('RECOVERY_BLOCKED');
      emit('  Abandonment was not proven; the lease stays where it is.');
      return 1;
    }

    const taken = await auto.takeoverLoopLease({ expected: lease, proof: verdict.proof });
    if (!taken.acquired) {
      emit('RECOVERY_BLOCKED');
      emit(`  LEASE_TAKEOVER_FAILED: ${taken.reason}. Another process is recovering this run.`);
      await store.appendEvent({
        type: 'LEASE_TAKEOVER_FAILED',
        runId: autonomousRun?.autonomousRunId ?? null, reason: taken.reason, oldOwner: lease.workerInstanceId ?? null,
      });
      return 1;
    }

    await store.appendEvent({
      type: 'LEASE_TAKEOVER_SUCCEEDED',
      runId: autonomousRun?.autonomousRunId ?? null,
      oldOwner: lease.workerInstanceId ?? null,
      newOwner: taken.lease.workerInstanceId,
      attemptId: taken.lease.attemptId,
      proof: verdict.proof,
    });
    emit(`Lease acquired by: ${taken.lease.workerInstanceId} (${taken.lease.attemptId})`);
  }

  await store.appendEvent({
    type: 'RECOVERY_STARTED',
    goal: runtime.goal, round: runtime.round, state: runtime.state,
    runId: autonomousRun?.autonomousRunId ?? null, action: plan.action, jobId: plan.jobId ?? null,
  });

  // --- Put the interrupted work into a state the loop can continue from -----
  if (plan.action === RECOVERY_ACTIONS.CONSUME_RESULT) {
    // Nothing to change: the result is on disk and the runner reuses it by job
    // id. Saying so explicitly is the point — this is the case that used to
    // cost a second inference.
    await store.appendEvent({
      type: 'JOB_RESULT_REUSED', role: plan.agent, jobId: plan.jobId,
      goal: runtime.goal, round: runtime.round, runId: autonomousRun?.autonomousRunId ?? null,
    });
  }

  if (plan.action === RECOVERY_ACTIONS.REQUEUE_JOB) {
    // The old attempt is recorded as INTERRUPTED — not FAILED, because nothing
    // was learned about the work — and the SAME job is queued again.
    await store.setJobStatus(plan.agent, plan.jobId, 'INTERRUPTED');
    await store.appendEvent({
      type: 'JOB_INTERRUPTED', role: plan.agent, jobId: plan.jobId,
      goal: runtime.goal, round: runtime.round, runId: autonomousRun?.autonomousRunId ?? null,
    });
    await store.setJobStatus(plan.agent, plan.jobId, 'QUEUED');
    await store.appendEvent({
      type: 'JOB_REQUEUED_AFTER_RECOVERY', role: plan.agent, jobId: plan.jobId,
      goal: runtime.goal, round: runtime.round, runId: autonomousRun?.autonomousRunId ?? null,
    });
  }

  // The stored state is left exactly as it was: the runner re-enters it and
  // decides from the artefacts. Recovery restores ownership and consistency; it
  // does not move the state machine on the runner's behalf.
  await store.writeRuntime({
    ...(await store.readRuntime()),
    recovery: {
      at: new Date().toISOString(),
      fromState: runtime.state,
      action: plan.action,
      proof: verdict?.proof ?? null,
      attempt: (autonomousRun?.recoveryCount ?? 0) + (lease ? 1 : 0),
    },
  });

  await store.appendEvent({
    type: 'RECOVERY_COMPLETED',
    goal: runtime.goal, round: runtime.round, state: runtime.state,
    runId: autonomousRun?.autonomousRunId ?? null, action: plan.action, jobId: plan.jobId ?? null,
  });

  emit('');
  emit('RECOVERY COMPLETE');
  emit('');
  emit(`Continue with: ${continuationFor(plan)}`);
  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
    console.error(`\nATENDLY IA LOOP — RECOVERY\n\nBlocker: [${code}] ${error.message}`);
    process.exitCode = 1;
  });
