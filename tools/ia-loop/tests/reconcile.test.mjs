/**
 * Reconcile before dispatch.
 *
 * The bug: round selection was derived from job ids recorded in the runtime.
 * Those ids are a hint and were treated as the authority. When the recorded id
 * was missing, the loop concluded nothing had been done, minted a fresh random
 * attempt id, found no result under a name that had never existed, and sent
 * Opus to re-implement Goal 004 round 1 — whose implementation AND review were
 * both already on disk, the review carrying four blockers.
 *
 * These tests state the invariant that makes it impossible: a stage with a
 * terminal result is finished, and no restart, recovery, attach, capacity
 * resume, missing pointer or fresh random id makes another attempt legitimate.
 *
 * No model is called anywhere here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DISPATCH_KINDS, STAGE_STATUS, assertNoDuplicateStageDispatch,
  buildStageLedger, decideNextDispatch, reconcileExecutionState,
} from '../lib/reconcile.mjs';
import { STAGES, roleForStage, stageKey, stageKeyOfJob } from '../lib/stage-identity.mjs';
import { createJobStore } from '../lib/job-store.mjs';
import { createAutonomousStore } from '../lib/autonomous-state.mjs';
import { createHandoffStore } from '../lib/recovery-handoff.mjs';
import { RECOVERY_ACTIONS, planRecovery } from '../lib/recovery-plan.mjs';
import { OWNER_STATUS } from '../lib/orphan-evidence.mjs';
import { LOOP_STATES } from '../lib/loop-state.mjs';
import { PROTOCOL_VERSION_V2 } from '../lib/contracts-v2.mjs';

const codeIs = (code) => (error) => error.code === code;

const GOAL = '004';
const DEV_R1 = '004-r1-developer-d8f21303';
const REV_R1 = '004-r1-tech_lead-4ded365b';
const DUPE_R1 = '004-r1-developer-69a88746';
const EXECUTION_BASE = 'b3a019c94b8e89f48db5ab017866ff9e325d7d82';
const BASELINE = '588b70f575670eeda015750b400a09752ceb5490';

/** The four blockers the real review produced. */
const BLOCKERS = [
  { id: 'B1', title: 'inbox worker sem backoff' },
  { id: 'B2', title: 'outbox sem idempotência' },
  { id: 'B3', title: 'webhook sem verificação de assinatura' },
  { id: 'B4', title: 'migração sem ensaio' },
];

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-reconcile-'));
  try { return await run(dir); } finally { await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

const devJob = (jobId, round, type = 'IMPLEMENTATION') => ({
  role: 'developer', job: { jobId, role: 'developer', goal: GOAL, round, type },
});
const revJob = (jobId, round) => ({
  role: 'tech_lead', job: { jobId, role: 'tech_lead', goal: GOAL, round },
});
const withResult = (entry, result, status = 'COMPLETED') => ({ ...entry, status, result });

/** The exact situation on disk when the duplicate was published. */
const goal004Entries = () => [
  withResult(devJob(DEV_R1, 1), { status: 'REVIEW_REQUIRED', jobId: DEV_R1 }),
  withResult(revJob(REV_R1, 1), { decision: 'CHANGES_REQUIRED', blockers: BLOCKERS, jobId: REV_R1 }),
  { ...devJob(DUPE_R1, 1), status: 'RUNNING', result: null },
];

// ===========================================================================
// Stage identity
// ===========================================================================

test('a stage is named by what it is, not by which attempt ran it', () => {
  assert.equal(stageKey({ goal: GOAL, round: 1, stage: STAGES.IMPLEMENTATION }), '004:r1:implementation');
  assert.equal(stageKey({ goal: GOAL, round: 2, stage: STAGES.CORRECTION }), '004:r2:correction');
  assert.equal(roleForStage(STAGES.REVIEW), 'tech_lead');
  assert.equal(roleForStage(STAGES.CORRECTION), 'developer');
});

test('6. two random attempt ids resolve to the same logical stage', () => {
  // This is precisely what the harness could not see: d8f21303 and 69a88746 are
  // two attempts at one thing.
  const a = stageKeyOfJob({ jobId: DEV_R1, role: 'developer', goal: GOAL, round: 1, type: 'IMPLEMENTATION' });
  const b = stageKeyOfJob({ jobId: DUPE_R1, role: 'developer', goal: GOAL, round: 1, type: 'IMPLEMENTATION' });
  assert.equal(a, b);
  assert.equal(a, '004:r1:implementation');
});

test('a correction and an implementation of the same round are different stages', () => {
  assert.notEqual(
    stageKeyOfJob({ role: 'developer', goal: GOAL, round: 2, type: 'CORRECTION' }),
    stageKeyOfJob({ role: 'developer', goal: GOAL, round: 2, type: 'IMPLEMENTATION' }),
  );
});

test('closure and planning jobs are not round stages', () => {
  assert.equal(stageKeyOfJob({ role: 'tech_lead', goal: GOAL, round: 1, kind: 'CLOSURE_DOCS' }), null);
  assert.equal(stageKeyOfJob({ role: 'tech_lead', goal: GOAL, round: 1, kind: 'PLANNING' }), null);
});

// ===========================================================================
// 1, 2, 9. The ledger, and where Goal004 actually goes next
// ===========================================================================

test('1/2/9. implementation and review both complete: the next step is correction R2 with the four blockers', () => {
  const ledger = buildStageLedger(goal004Entries());
  const next = decideNextDispatch({ ledger, goal: GOAL });

  assert.equal(next.kind, DISPATCH_KINDS.CORRECTION);
  assert.equal(next.round, 2, 'round 2, not a second round 1');
  assert.equal(next.role, 'developer');
  assert.equal(next.stageKey, '004:r2:correction');
  assert.equal(next.blockers.length, 4, 'exactly the four the review produced');
  assert.deepEqual(next.blockers, BLOCKERS, 'carried verbatim, never rediscovered');
  assert.equal(next.fromReviewJobId, REV_R1);
});

test('10/11. neither model is asked to redo round 1', () => {
  const ledger = buildStageLedger(goal004Entries());

  assert.throws(() => assertNoDuplicateStageDispatch({
    ledger, goal: GOAL, round: 1, stage: STAGES.IMPLEMENTATION, jobId: DUPE_R1,
  }), codeIs('DUPLICATE_COMPLETED_STAGE_DISPATCH'), 'Opus must not be called for R1');

  assert.throws(() => assertNoDuplicateStageDispatch({
    ledger, goal: GOAL, round: 1, stage: STAGES.REVIEW, jobId: '004-r1-tech_lead-newid',
  }), codeIs('DUPLICATE_COMPLETED_STAGE_DISPATCH'), 'Fable must not be called for R1');
});

test('12. the only legitimate next model call is the Developer on correction R2', () => {
  const ledger = buildStageLedger(goal004Entries());

  // R2 correction has no result, so dispatching it is allowed.
  assert.equal(assertNoDuplicateStageDispatch({
    ledger, goal: GOAL, round: 2, stage: STAGES.CORRECTION, jobId: 'new-attempt',
  }), true);

  const next = decideNextDispatch({ ledger, goal: GOAL });
  assert.equal(next.role, 'developer');
  assert.equal(next.round, 2);
});

test('5. a completed stage refuses a new attempt; the completing attempt is idempotent', () => {
  const ledger = buildStageLedger(goal004Entries());

  // Re-entering with the id that produced the result is reuse, not duplication.
  assert.equal(assertNoDuplicateStageDispatch({
    ledger, goal: GOAL, round: 1, stage: STAGES.IMPLEMENTATION, jobId: DEV_R1,
  }), true);

  // Any other id is a duplicate.
  for (const jobId of [DUPE_R1, 'anything-else', null]) {
    assert.throws(() => assertNoDuplicateStageDispatch({
      ledger, goal: GOAL, round: 1, stage: STAGES.IMPLEMENTATION, jobId,
    }), codeIs('DUPLICATE_COMPLETED_STAGE_DISPATCH'), String(jobId));
  }
});

test('8. an attempt still RUNNING at a completed stage is a duplicate', () => {
  const ledger = buildStageLedger(goal004Entries());
  const stage = ledger.get('004:r1:implementation');

  assert.equal(stage.status, STAGE_STATUS.COMPLETED);
  assert.equal(stage.completedBy, DEV_R1);
  assert.deepEqual(stage.duplicates, [DUPE_R1], 'the running attempt is named as the duplicate');
});

test('7. a currentJobId pointing at the duplicate does not change any of it', () => {
  // The runtime pointer is not an input to the ledger at all: it cannot make a
  // duplicate authoritative over the original result.
  const ledger = buildStageLedger(goal004Entries());
  const next = decideNextDispatch({ ledger, goal: GOAL });
  assert.equal(next.kind, DISPATCH_KINDS.CORRECTION);
  assert.equal(next.round, 2);
});

// ===========================================================================
// Other paths through the ledger
// ===========================================================================

test('implemented but not reviewed: the next step is the review of that round', () => {
  const ledger = buildStageLedger([
    withResult(devJob(DEV_R1, 1), { status: 'REVIEW_REQUIRED' }),
  ]);
  const next = decideNextDispatch({ ledger, goal: GOAL });
  assert.equal(next.kind, DISPATCH_KINDS.REVIEW);
  assert.equal(next.round, 1);
  assert.equal(next.implementationJobId, DEV_R1);
});

test('ACCEPTED sends the Goal to closure, not to another round', () => {
  const ledger = buildStageLedger([
    withResult(devJob(DEV_R1, 1), { status: 'REVIEW_REQUIRED' }),
    withResult(revJob(REV_R1, 1), { decision: 'ACCEPTED', blockers: [] }),
  ]);
  const next = decideNextDispatch({ ledger, goal: GOAL });
  assert.equal(next.kind, DISPATCH_KINDS.CLOSE_GOAL);
  assert.equal(next.decision, 'ACCEPTED');
});

test('nothing on disk: the Goal starts at implementation round 1', () => {
  const next = decideNextDispatch({ ledger: buildStageLedger([]), goal: GOAL });
  assert.equal(next.kind, DISPATCH_KINDS.IMPLEMENTATION);
  assert.equal(next.round, 1);
});

test('a review with no usable decision asks for a human instead of guessing', () => {
  const ledger = buildStageLedger([
    withResult(devJob(DEV_R1, 1), { status: 'REVIEW_REQUIRED' }),
    withResult(revJob(REV_R1, 1), { decision: 'MAYBE' }),
  ]);
  const next = decideNextDispatch({ ledger, goal: GOAL });
  assert.equal(next.kind, DISPATCH_KINDS.HUMAN_REQUIRED);
  assert.equal(next.reason, 'AGENT_CONTRACT_ERROR');
});

test('the round budget is respected without re-running anything', () => {
  const entries = [
    withResult(devJob(DEV_R1, 1), { status: 'REVIEW_REQUIRED' }),
    withResult(revJob(REV_R1, 1), { decision: 'CHANGES_REQUIRED', blockers: BLOCKERS }),
    withResult(devJob('004-r2-correction-x', 2, 'CORRECTION'), { status: 'REVIEW_REQUIRED' }),
    withResult(revJob('004-r2-tech_lead-y', 2), { decision: 'CHANGES_REQUIRED', blockers: BLOCKERS }),
    withResult(devJob('004-r3-correction-z', 3, 'CORRECTION'), { status: 'REVIEW_REQUIRED' }),
    withResult(revJob('004-r3-tech_lead-w', 3), { decision: 'CHANGES_REQUIRED', blockers: BLOCKERS }),
  ];
  const next = decideNextDispatch({ ledger: buildStageLedger(entries), goal: GOAL, maxRounds: 3 });
  assert.equal(next.kind, DISPATCH_KINDS.HUMAN_REQUIRED);
  assert.equal(next.reason, 'MAX_CORRECTION_ROUNDS_REACHED');
});

// ===========================================================================
// 15, 16. A genuinely interrupted stage may retry
// ===========================================================================

test('15/16. an interrupted stage with no result retries as a NEW attempt of the SAME stage', () => {
  const ledger = buildStageLedger([
    { ...devJob(DEV_R1, 1), status: 'INTERRUPTED', result: null },
  ]);
  const stage = ledger.get('004:r1:implementation');
  assert.notEqual(stage.status, STAGE_STATUS.COMPLETED, 'nothing was learned, so nothing is finished');

  // Dispatch is allowed, and it is the same logical stage.
  const next = decideNextDispatch({ ledger, goal: GOAL });
  assert.equal(next.kind, DISPATCH_KINDS.IMPLEMENTATION);
  assert.equal(next.stageKey, '004:r1:implementation', 'the same stage, a later attempt');
  assert.equal(assertNoDuplicateStageDispatch({
    ledger, goal: GOAL, round: 1, stage: STAGES.IMPLEMENTATION, jobId: 'attempt-2',
  }), true);
});

test('an attempt left in flight is offered back rather than replaced', () => {
  const ledger = buildStageLedger([
    { ...devJob(DEV_R1, 1), status: 'RUNNING', result: null },
  ]);
  const next = decideNextDispatch({ ledger, goal: GOAL });
  assert.equal(next.resumeAttempt, DEV_R1);
});

// ===========================================================================
// 13, 14. The two layers are independent
// ===========================================================================

test('13. with no handoff at all, the persisted results still block a duplicate', async () => {
  await withDir(async (dir) => {
    const handoffs = createHandoffStore(dir);
    assert.equal(await handoffs.read(), null, 'no handoff on disk');

    // The guard does not consult the handoff, by design.
    const ledger = buildStageLedger(goal004Entries());
    assert.throws(() => assertNoDuplicateStageDispatch({
      ledger, goal: GOAL, round: 1, stage: STAGES.IMPLEMENTATION, jobId: 'fresh',
    }), codeIs('DUPLICATE_COMPLETED_STAGE_DISPATCH'));
  });
});

test('14. a corrupt or foreign handoff fails closed and changes no dispatch decision', async () => {
  await withDir(async (dir) => {
    const handoffs = createHandoffStore(dir);
    await handoffs.write({
      autonomousRunId: 'auto-somebody-else', recoveryAttempt: 1,
      recoveredFromState: LOOP_STATES.DEVELOPER_RUNNING,
      nextSafeAction: RECOVERY_ACTIONS.REQUEUE_JOB, jobId: 'whatever',
    });

    const check = await handoffs.validateFor('auto-7b32c56a');
    assert.equal(check.valid, false);
    assert.equal(check.reason, 'HANDOFF_FOR_ANOTHER_RUN');

    // And the ledger still refuses the duplicate regardless of what it said.
    const ledger = buildStageLedger(goal004Entries());
    assert.throws(() => assertNoDuplicateStageDispatch({
      ledger, goal: GOAL, round: 1, stage: STAGES.IMPLEMENTATION, jobId: 'fresh',
    }), codeIs('DUPLICATE_COMPLETED_STAGE_DISPATCH'));
  });
});

// ===========================================================================
// 3, 4. THE INTEGRATION: reboot, recover, attach — and no duplicate
// ===========================================================================

test('THE INTEGRATION: R1 done and reviewed, reboot, recover, attach — next is correction R2', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    const auto = createAutonomousStore(dir);
    const handoffs = createHandoffStore(dir);

    // --- R1 ran and was reviewed, exactly as it really happened ------------
    await store.publishJob('developer', {
      protocolVersion: PROTOCOL_VERSION_V2, jobId: DEV_R1, role: 'developer',
      goal: GOAL, round: 1, type: 'IMPLEMENTATION',
    });
    await store.publishResult('developer', DEV_R1, {
      ok: true,
      result: {
        protocolVersion: PROTOCOL_VERSION_V2, jobId: DEV_R1, goal: GOAL, round: 1,
        status: 'REVIEW_REQUIRED', summary: 'transporte durável', implementationReport: 'R1',
      },
    });
    await store.setJobStatus('developer', DEV_R1, 'COMPLETED');

    await store.publishJob('tech_lead', {
      protocolVersion: PROTOCOL_VERSION_V2, jobId: REV_R1, role: 'tech_lead', goal: GOAL, round: 1,
    });
    await store.publishResult('tech_lead', REV_R1, {
      ok: true,
      result: {
        protocolVersion: PROTOCOL_VERSION_V2, jobId: REV_R1, goal: GOAL, round: 1,
        decision: 'CHANGES_REQUIRED', blockers: BLOCKERS, summary: 'quatro blockers',
      },
    });
    await store.setJobStatus('tech_lead', REV_R1, 'COMPLETED');

    const run = await auto.start({ fromGoal: GOAL, migrationAcceptedBaseline: BASELINE });
    await store.writeRuntime({
      mode: 'REAL_EXECUTION', goal: GOAL, round: 1, state: LOOP_STATES.REVIEWER_RUNNING,
      currentJobId: REV_R1, executionBase: EXECUTION_BASE, worktreeInitialHead: EXECUTION_BASE,
      migrationAcceptedBaseline: BASELINE,
    });

    // --- the machine reboots ------------------------------------------------
    await auto.releaseLoopLease();

    // --- recovery: what does it conclude? -----------------------------------
    const beforeRecovery = await reconcileExecutionState({ store, goal: GOAL });
    const reviewStage = beforeRecovery.ledger.get('004:r1:review');
    assert.equal(reviewStage.status, STAGE_STATUS.COMPLETED);

    const plan = planRecovery({
      runtime: await store.readRuntime(),
      autonomousRun: await auto.read(),
      ownerVerdict: { status: OWNER_STATUS.ORPHAN_CONFIRMED, proof: 'DIFFERENT_BOOT', detail: 'rebooted' },
      leaseExists: false,
      resultExists: reviewStage.status === STAGE_STATUS.COMPLETED,
    });
    assert.equal(plan.action, RECOVERY_ACTIONS.CONSUME_RESULT);

    await handoffs.write({
      autonomousRunId: run.autonomousRunId, recoveryAttempt: 1,
      recoveredFromState: LOOP_STATES.REVIEWER_RUNNING,
      nextSafeAction: plan.action, jobId: REV_R1, agent: 'tech_lead', goal: GOAL, round: 1,
    });

    // --- attach: same run, no new one --------------------------------------
    const attached = await auto.attach();
    assert.equal(attached.attached, true);
    assert.equal(attached.run.autonomousRunId, run.autonomousRunId);
    const check = await handoffs.validateFor(attached.run.autonomousRunId);
    assert.equal(check.valid, true);
    await handoffs.consume({ nonce: check.handoff.nonce, consumedBy: 'orchestrator' });

    // --- and now the assertions that matter ---------------------------------
    const reconciled = await reconcileExecutionState({ store, goal: GOAL });

    assert.equal(reconciled.next.kind, DISPATCH_KINDS.CORRECTION);
    assert.equal(reconciled.next.round, 2, 'correction R2 is next');
    assert.equal(reconciled.next.blockers.length, 4);
    assert.deepEqual(reconciled.next.blockers, BLOCKERS);

    // No R1 developer publish.
    assert.throws(() => assertNoDuplicateStageDispatch({
      ledger: reconciled.ledger, goal: GOAL, round: 1, stage: STAGES.IMPLEMENTATION, jobId: 'would-be-new',
    }), codeIs('DUPLICATE_COMPLETED_STAGE_DISPATCH'));

    // No R1 reviewer publish.
    assert.throws(() => assertNoDuplicateStageDispatch({
      ledger: reconciled.ledger, goal: GOAL, round: 1, stage: STAGES.REVIEW, jobId: 'would-be-new',
    }), codeIs('DUPLICATE_COMPLETED_STAGE_DISPATCH'));

    // Nothing new was published to either worker by any of this.
    const ids = async (role) => (await store.listJobs(role)).map((n) => n.replace(/\.json$/, '')).sort();
    assert.deepEqual(await ids('developer'), [DEV_R1]);
    assert.deepEqual(await ids('tech_lead'), [REV_R1]);
  });
});

test('the same integration with the duplicate already published classifies it', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);

    for (const [role, jobId, extra] of [
      ['developer', DEV_R1, { type: 'IMPLEMENTATION' }],
      ['tech_lead', REV_R1, {}],
      ['developer', DUPE_R1, { type: 'IMPLEMENTATION' }],
    ]) {
      await store.publishJob(role, {
        protocolVersion: PROTOCOL_VERSION_V2, jobId, role, goal: GOAL, round: 1, ...extra,
      });
    }
    await store.publishResult('developer', DEV_R1, {
      ok: true,
      result: {
        protocolVersion: PROTOCOL_VERSION_V2, jobId: DEV_R1, goal: GOAL, round: 1,
        status: 'REVIEW_REQUIRED', summary: 's',
      },
    });
    await store.setJobStatus('developer', DEV_R1, 'COMPLETED');
    await store.publishResult('tech_lead', REV_R1, {
      ok: true,
      result: {
        protocolVersion: PROTOCOL_VERSION_V2, jobId: REV_R1, goal: GOAL, round: 1,
        decision: 'CHANGES_REQUIRED', blockers: BLOCKERS, summary: 's',
      },
    });
    await store.setJobStatus('tech_lead', REV_R1, 'COMPLETED');
    await store.setJobStatus('developer', DUPE_R1, 'RUNNING');

    const reconciled = await reconcileExecutionState({ store, goal: GOAL });

    assert.deepEqual(reconciled.duplicates, [
      { jobId: DUPE_R1, stageKey: '004:r1:implementation', completedBy: DEV_R1 },
    ]);
    assert.equal(reconciled.next.kind, DISPATCH_KINDS.CORRECTION);
    assert.equal(reconciled.next.round, 2);
  });
});

// ===========================================================================
// 17–25. Everything that must keep holding
// ===========================================================================

test('18/19/20. reconciliation touches no base and no checkpoint', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    await store.writeRuntime({
      mode: 'REAL_EXECUTION', goal: GOAL, round: 1, state: LOOP_STATES.REVIEWER_RUNNING,
      executionBase: EXECUTION_BASE, worktreeInitialHead: EXECUTION_BASE,
      migrationAcceptedBaseline: BASELINE,
      mainGuardCheckpoint: { head: 'd03580a', reason: 'ORCHESTRATOR_ATTACH' },
    });

    await reconcileExecutionState({ store, goal: GOAL });

    const runtime = await store.readRuntime();
    assert.equal(runtime.executionBase, EXECUTION_BASE);
    assert.equal(runtime.worktreeInitialHead, EXECUTION_BASE);
    assert.equal(runtime.migrationAcceptedBaseline, BASELINE);
    assert.notEqual(runtime.mainGuardCheckpoint.head, runtime.executionBase);
  });
});

test('the runner never assigns the main checkpoint as an execution base', async () => {
  const source = await readFile(new URL('../run-goal.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /executionBase\s*[:=]\s*mainGuardCheckpoint/);
  assert.doesNotMatch(source, /executionBase\s*[:=]\s*mainHead/);
});

test('21/22/23. the gates recovery never opened are still shut', () => {
  const base = {
    mode: 'REAL_EXECUTION', goal: GOAL, round: 1, currentJobId: REV_R1,
    executionBase: EXECUTION_BASE, worktreeInitialHead: EXECUTION_BASE,
  };
  assert.equal(planRecovery({ runtime: { ...base, state: LOOP_STATES.HUMAN_REQUIRED } }).reason, 'HUMAN_REQUIRED');
  assert.equal(planRecovery({
    runtime: { ...base, state: LOOP_STATES.REVIEWER_RUNNING },
    autonomousRun: { autonomousRunId: 'auto-1', status: 'PAUSED_FOR_HUMAN' },
  }).reason, 'HUMAN_REQUIRED');
  assert.equal(planRecovery({ runtime: { ...base, state: LOOP_STATES.WAITING_FOR_CAPACITY } }).reason, 'CAPACITY_WAIT');
});

test('24. graceful shutdown gives back only the orchestrator lease, never another', async () => {
  const source = await readFile(new URL('../run-auto.mjs', import.meta.url), 'utf8');

  // Ctrl+C left the loop lease behind, because the finally block never runs on
  // a signal — which is how migration-loop-a3 became an orphan.
  assert.match(source, /process\.on\('SIGINT'/);
  assert.match(source, /process\.on\('SIGTERM'/);
  assert.doesNotMatch(source, /releaseLoopLease\(\{\s*force:\s*true/);
  // Job and worktree leases belong to work that may still be writing.
  assert.doesNotMatch(source, /releaseWorktree|releaseJob\(/);
});

test('25. nothing in the reconciliation path can reach a model', async () => {
  for (const file of ['../lib/reconcile.mjs', '../lib/stage-identity.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /runAgent|spawnClaude|--model|claude-opus|claude-fable|claude-sonnet|claude-haiku/,
      `${file} must not be able to invoke a model`);
  }
});

// ===========================================================================
// The invariant, stated once and checked against every route into a dispatch
// ===========================================================================

test('INVARIANT: a completed stage is never dispatched again, by any route', () => {
  const ledger = buildStageLedger(goal004Entries());

  // Each of these is a real path that has, at some point, produced a job id.
  const routes = {
    'a fresh random id': '004-r1-developer-ffffffff',
    'the duplicate that was actually published': DUPE_R1,
    'an id from a stale runtime pointer': '004-r1-tech_lead-4ded365b',
    'no id at all': null,
    'an id from a capacity resume': '004-r1-developer-capacity',
  };

  for (const [route, jobId] of Object.entries(routes)) {
    assert.throws(
      () => assertNoDuplicateStageDispatch({
        ledger, goal: GOAL, round: 1, stage: STAGES.IMPLEMENTATION, jobId,
      }),
      codeIs('DUPLICATE_COMPLETED_STAGE_DISPATCH'),
      `${route} must not reach a completed stage`,
    );
  }

  // The one exception, and only this one: the attempt that produced the result.
  assert.equal(assertNoDuplicateStageDispatch({
    ledger, goal: GOAL, round: 1, stage: STAGES.IMPLEMENTATION, jobId: DEV_R1,
  }), true);
});

test('7b. the recovery plan names the attempt that owns the stage, not the pointer', () => {
  // planRecovery used to read runtime.currentJobId itself, so it reported the
  // duplicate as the thing whose result was on disk — the same "trust the
  // pointer" mistake one level down.
  const runtime = {
    mode: 'REAL_EXECUTION', goal: GOAL, round: 1, state: LOOP_STATES.DEVELOPER_RUNNING,
    currentJobId: DUPE_R1, executionBase: EXECUTION_BASE, worktreeInitialHead: EXECUTION_BASE,
  };

  const withPointer = planRecovery({ runtime, resultExists: true, leaseExists: false });
  assert.equal(withPointer.jobId, DUPE_R1, 'the fallback is still the pointer');

  const reconciledPlan = planRecovery({ runtime, resultExists: true, leaseExists: false, jobId: DEV_R1 });
  assert.equal(reconciledPlan.action, RECOVERY_ACTIONS.CONSUME_RESULT);
  assert.equal(reconciledPlan.jobId, DEV_R1, 'the attempt that actually produced the result');
  assert.match(reconciledPlan.message, new RegExp(DEV_R1));
});
