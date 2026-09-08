#!/usr/bin/env node
/**
 * IA Loop — orchestrator entry point.
 *
 *   npm run ia-loop:goal -- 003 --dry-run   plan only, no side effects
 *   npm run ia-loop:goal -- 003             real supervised execution
 *
 * The orchestrator is the ONLY component that decides who works next. The
 * models never call each other: every hand-off is validated and recorded here.
 *
 * V4 automates the correction rounds. A run keeps going while the reviewer asks
 * for changes and the round budget lasts, then stops at AWAITING_HUMAN whatever
 * the verdict. It never commits the Goal, never updates the migration baseline,
 * never creates the next Goal and never removes the worktree.
 */

import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { JOB_DISPATCH, createJobStore } from './lib/job-store.mjs';
import {
  DISPATCH_KINDS, assertNoDuplicateStageDispatch, reconcileExecutionState,
} from './lib/reconcile.mjs';
import {
  assertBelongsToGoal, goalExecutionOf, initializeGoalExecutionState,
  jobIdForGoal, readJobForGoal, staleGoalPointers,
} from './lib/goal-execution.mjs';
import { STAGES } from './lib/stage-identity.mjs';
import { fullWorktreeFingerprint } from './lib/worktree-fingerprint.mjs';
import { discoverGoal } from './lib/goal-discovery.mjs';
import { planWorktree, createWorktreeForGoal, branchNameFor } from './lib/worktree-manager.mjs';
import { readWorkerHealth, WORKER_HEALTH, SESSION_STRATEGY } from './lib/worker-registry.mjs';
import { LOOP_STATES, createLoopStateMachine, stateForDecision } from './lib/loop-state.mjs';
import { LOOP_CONFIG, planAfterReview } from './lib/loop-config.mjs';
import { PROTOCOL_VERSION_V2, validateDeveloperJob, validateReviewJob } from './lib/contracts-v2.mjs';
import {
  createGitProbe,
  createWorktree as gitCreateWorktree,
  collectWorktreeChanges,
  worktreeFingerprint,
} from './lib/git-ops.mjs';
import { captureSnapshot, checkDeveloperPolicy, checkReviewerPolicy, formatViolations } from './lib/policy-guards.mjs';
import { createLeaseStore } from './lib/leases.mjs';
import { buildReviewPacket } from './lib/review-packet.mjs';
import { createDeveloperProfileStore } from './lib/developer-profiles.mjs';
import { PROFILE_SOURCES, resolveProfileForRound, toExecutionRecord } from './lib/profile-routing.mjs';
import { isDirectExecution } from './lib/direct-execution.mjs';
import { waitForResult } from './lib/result-waiter.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const STATE_DIR = join(HERE, '.state');

const TECH_LEAD_MODEL = process.env.IA_LOOP_TECH_LEAD_MODEL ?? 'claude-fable-5-1';
const DEVELOPER_MODEL = process.env.IA_LOOP_DEVELOPER_MODEL ?? 'claude-opus-5';
const REVIEW_LEVEL = LOOP_CONFIG.reviewLevel;

const RESULT_TIMEOUT_MS = Number(process.env.IA_LOOP_RESULT_TIMEOUT_MS ?? 6 * 60 * 60 * 1000);

const probe = createGitProbe(REPO_ROOT);

function parseArgs(argv) {
  const args = argv.slice(2);
  const goalId = args.find((a) => /^\d{3}$/.test(a));
  if (!goalId) throw new SpikeError('INVALID_ARGS', 'Usage: npm run ia-loop:goal -- <goalId> [--dry-run]');
  return { goalId, dryRun: args.includes('--dry-run') };
}

function formatHealth(h) {
  if (h.health === WORKER_HEALTH.OFFLINE) return 'OFFLINE (worker not running)';
  const age = h.ageMs === null ? '?' : `${Math.round(h.ageMs / 1000)}s ago`;
  return `${h.health} (state ${h.state}, heartbeat ${age})`;
}

/** Says what a dispatch actually did, so the log never claims more than it did. */
function dispatchMessage(dispatched, label) {
  switch (dispatched.outcome) {
    case JOB_DISPATCH.PUBLISHED:
      return `${label} job published: ${dispatched.jobId}`;
    case JOB_DISPATCH.NEW_ATTEMPT:
      return `${label} job ${dispatched.jobId} — attempt ${dispatched.attempt} after an interrupted one.`;
    case JOB_DISPATCH.ALREADY_QUEUED:
      return `${label} job ${dispatched.jobId} is already queued; waiting rather than publishing it twice.`;
    case JOB_DISPATCH.ALREADY_RUNNING:
      return `${label} job ${dispatched.jobId} is already running; waiting for that attempt.`;
    default:
      return `${label} job ${dispatched.jobId}: ${dispatched.outcome}`;
  }
}

/** Job ids recorded for one round, by role. */
function jobIdsFor(runtime, round) {
  return runtime?.jobIdsByRound?.[String(round)] ?? {};
}

/** Records a role's job id for a round without disturbing the others. */
function withJobId(runtime, round, role, jobId) {
  const byRound = { ...(runtime?.jobIdsByRound ?? {}) };
  byRound[String(round)] = { ...(byRound[String(round)] ?? {}), [role]: jobId };
  return { jobIdsByRound: byRound };
}

async function main() {
  const emit = (line = '') => console.log(line);
  const { goalId, dryRun } = parseArgs(process.argv);
  const store = createJobStore(STATE_DIR);
  const leaseStore = createLeaseStore(STATE_DIR);
  const profileStore = createDeveloperProfileStore(STATE_DIR);
  const machine = createLoopStateMachine();

  emit('');
  emit('IA Loop — Goal Runner');
  emit('');
  emit(`Mode:\n${dryRun ? 'DRY_RUN' : 'REAL_EXECUTION'}`);
  emit('');

  const goal = await discoverGoal({
    repoRoot: REPO_ROOT, goalId, resolveSha: (sha) => probe.commitExists(sha),
  });
  machine.transitionTo(LOOP_STATES.GOAL_READY, { goal: goal.goalId });

  emit('Goal discovery:');
  emit('PASS');
  emit(`  goal: ${goal.goalId} — ${goal.title}`);
  emit(`  status: ${goal.status}`);
  emit(`  previous goal: ${goal.previousGoalId ?? 'n/a'} (${goal.previousGoalStatus ?? 'n/a'})`);
  emit('');

  const headNow = await probe.head();
  emit('Migration baseline (accepted):');
  emit(`  ${goal.migrationAcceptedBaseline}`);
  emit('Execution base (current HEAD):');
  emit(`  ${headNow}`);
  emit('');
  emit(`Tech Lead:\n  ${TECH_LEAD_MODEL}\n  ${SESSION_STRATEGY.PERSISTENT}`);
  emit(`Developer:\n  ${DEVELOPER_MODEL}\n  ${SESSION_STRATEGY.STATELESS}`);
  emit('');

  // ======================= DRY RUN ========================================
  if (dryRun) {
    machine.transitionTo(LOOP_STATES.PREPARING_WORKTREE);
    const plan = await planWorktree({ goalId, executionBase: headNow, git: probe });

    emit('Worktree plan:');
    emit(`  path: ${plan.path}`);
    emit(`  branch: ${plan.branch}`);
    emit(`  base: ${plan.executionBase}`);
    emit(`  current branch (untouched): ${plan.currentBranch}`);
    emit('  created: NO (dry run)');
    if (plan.blockers.length > 0) {
      emit('  blockers:');
      for (const b of plan.blockers) emit(`    - [${b.code}] ${b.message}`);
    } else emit('  blockers: none');
    emit('');

    if (plan.safe) machine.transitionTo(LOOP_STATES.WORKTREE_READY);

    const [tl, dev] = await Promise.all([
      readWorkerHealth(store, 'tech_lead'), readWorkerHealth(store, 'developer'),
    ]);
    emit(`Workers:\n  tech-lead: ${formatHealth(tl)}\n  developer: ${formatHealth(dev)}`);
    emit('');
    emit(`Review:\n  ${REVIEW_LEVEL}`);
    emit('');

    await store.appendEvent({ type: 'DRY_RUN_COMPLETED', goal: goal.goalId, state: machine.state, worktreeSafe: plan.safe });

    const devJobs = await store.listJobs('developer');
    const revJobs = await store.listJobs('tech_lead');
    emit('Goal executed:\nNO');
    emit('');
    emit('Overall:');
    const passed = goal.status === 'READY';
    emit(passed ? 'PASS' : 'FAIL');
    return passed ? 0 : 1;
  }

  // ===================== REAL EXECUTION ===================================
  const [tlHealth, devHealth] = await Promise.all([
    readWorkerHealth(store, 'tech_lead'), readWorkerHealth(store, 'developer'),
  ]);
  emit(`Workers:\n  tech-lead: ${formatHealth(tlHealth)}\n  developer: ${formatHealth(devHealth)}`);
  emit('');
  if (tlHealth.health === WORKER_HEALTH.OFFLINE || devHealth.health === WORKER_HEALTH.OFFLINE) {
    throw new SpikeError('WORKERS_NOT_RUNNING',
      'Both workers must be running: npm run ia-loop:tech-lead and npm run ia-loop:developer');
  }

  // --- Worktree: reuse when an execution is already in progress ------------
  machine.transitionTo(LOOP_STATES.PREPARING_WORKTREE);
  const persistedRuntime = await store.readRuntime();

  // THE read gate. Everything below that wants to know what already happened
  // asks this, never the persisted runtime: it is null unless the state on disk
  // is this Goal's own. A closed Goal's execution is history — readable in the
  // store and in the archive, never an input to what happens next.
  const priorGoalExecution = goalExecutionOf(persistedRuntime, goal.goalId);

  const leaked = staleGoalPointers(persistedRuntime, goal.goalId);
  if (leaked.length > 0) {
    // Not a repair and not a failure: the pointers are simply not used, and the
    // fact that they were there is recorded with what they named.
    emit(persistedRuntime.goal === goal.goalId
      ? `Execution state carries ${leaked.length} pointer(s) from another Goal; they are history and are not used.`
      : `Execution state on disk belongs to Goal ${persistedRuntime.goal}; it is history, not this Goal's state.`);
    for (const pointer of leaked.slice(0, 8)) {
      emit(`  stale: ${pointer.field} = ${pointer.value}${pointer.goal ? ` (Goal ${pointer.goal})` : ''}`);
    }
    await store.appendEvent({
      type: 'CROSS_GOAL_STATE_LEAK_DETECTED',
      goal: goal.goalId, previousGoal: persistedRuntime.goal,
      pointers: leaked.map(({ field, value, goal: owner }) => ({ field, value, goal: owner })),
    });
    emit('');
  }

  const resuming = priorGoalExecution?.mode === 'REAL_EXECUTION'
    && Boolean(priorGoalExecution.worktreeInitialHead)
    && Boolean(priorGoalExecution.worktreePath)
    && await probe.pathExists(priorGoalExecution.worktreePath);

  let worktree;
  if (resuming) {
    emit('Resuming an execution already in progress — the worktree is reused, not recreated.');
    worktree = {
      path: priorGoalExecution.worktreePath,
      branch: branchNameFor(goalId),
      worktreeInitialHead: priorGoalExecution.worktreeInitialHead,
      absolutePath: join(REPO_ROOT, priorGoalExecution.worktreePath),
    };
  } else {
    emit('Creating worktree…');
    worktree = await createWorktreeForGoal({
      goalId, executionBase: headNow, git: probe, repoRoot: REPO_ROOT, createFn: gitCreateWorktree,
    });
  }
  machine.transitionTo(LOOP_STATES.WORKTREE_READY);

  // The base of record never moves, even though the tooling checkout advanced.
  const executionBase = resuming
    ? (priorGoalExecution.executionBase ?? worktree.worktreeInitialHead)
    : headNow;
  const absWorktree = worktree.absolutePath;

  emit('Worktree:');
  emit(`  path: ${worktree.path}`);
  emit(`  branch: ${worktree.branch}`);
  emit(`  initialHead: ${worktree.worktreeInitialHead}`);
  emit(`  executionBase (original): ${executionBase}`);
  emit('');

  await store.writeCurrentGoal({
    goalId: goal.goalId, title: goal.title, status: goal.status, goalPath: goal.goalPath,
    migrationAcceptedBaseline: goal.migrationAcceptedBaseline, executionBase,
    worktreePath: worktree.path, worktreeInitialHead: worktree.worktreeInitialHead,
  });
  await store.appendEvent({
    type: resuming ? 'WORKTREE_REUSED' : 'WORKTREE_CREATED',
    goal: goal.goalId, path: worktree.path, branch: worktree.branch,
    initialHead: worktree.worktreeInitialHead,
  });

  const baseRuntime = {
    mode: 'REAL_EXECUTION', goal: goal.goalId, state: machine.state,
    migrationAcceptedBaseline: goal.migrationAcceptedBaseline, executionBase,
    worktreePath: worktree.path, worktreeInitialHead: worktree.worktreeInitialHead,
    reviewLevel: REVIEW_LEVEL, goalExecuted: false,
  };
  // Continuing THIS Goal keeps its own execution state; starting a Goal builds
  // a new one explicitly. The difference matters more than it looks: a spread
  // of the previous runtime keeps every field nobody thought about, and that is
  // exactly how Goal 004's job ids arrived in Goal 005's dispatch.
  if (priorGoalExecution) {
    await store.writeRuntime({ ...priorGoalExecution, ...baseRuntime });
  } else {
    if (persistedRuntime?.goal) {
      const archived = await store.archiveGoalExecution(persistedRuntime);
      await store.appendEvent({
        type: 'GOAL_EXECUTION_ARCHIVED',
        previousGoal: persistedRuntime.goal, nextGoal: goal.goalId,
        baseline: goal.migrationAcceptedBaseline, archived: archived.archived,
      });
    }
    await store.writeRuntime(initializeGoalExecutionState({
      previousRuntime: persistedRuntime, goal: goal.goalId, execution: baseRuntime,
    }));
    await store.appendEvent({
      type: 'NEXT_GOAL_EXECUTION_INITIALIZED',
      previousGoal: persistedRuntime?.goal ?? null, nextGoal: goal.goalId,
      baseline: goal.migrationAcceptedBaseline, round: 1,
    });
  }

  // --- Reconcile before dispatch -------------------------------------------
  //
  // Where the round comes from. It used to be read off ids recorded in the
  // runtime, which are a hint and were treated as the authority: when the
  // recorded id was missing, the loop concluded nothing had been done, minted a
  // fresh attempt id, found no result under a name that had never existed, and
  // sent Opus to re-implement a round whose work AND review were both already
  // on disk.
  //
  // Completion is now derived from the results, the only durable proof that an
  // inference happened.
  const reconciled = await reconcileExecutionState({
    store, goal: goal.goalId, maxRounds: LOOP_CONFIG.maxCorrectionRounds,
  });

  for (const duplicate of reconciled.duplicates) {
    // An attempt that should never have existed is recorded as superseded, not
    // deleted: what the harness did wrong stays readable.
    emit(`Superseding duplicate attempt ${duplicate.jobId} — ${duplicate.stageKey} completed as ${duplicate.completedBy}.`);
    const role = duplicate.stageKey.endsWith(STAGES.REVIEW) ? 'tech_lead' : 'developer';
    await store.setJobStatus(role, duplicate.jobId, 'SUPERSEDED').catch(() => {});
    await store.appendEvent({
      type: 'DUPLICATE_STAGE_ATTEMPT_SUPERSEDED', goal: goal.goalId,
      jobId: duplicate.jobId, stageKey: duplicate.stageKey, completedBy: duplicate.completedBy,
    });
  }

  emit(`Reconciled: next is ${reconciled.next.kind}${reconciled.next.round ? ` at round ${reconciled.next.round}` : ''}.`);
  emit('');

  if (reconciled.next.kind === DISPATCH_KINDS.HUMAN_REQUIRED) {
    machine.transitionTo(LOOP_STATES.HUMAN_REQUIRED);
    machine.transitionTo(LOOP_STATES.AWAITING_HUMAN);
    emit(`Goal ${goal.goalId} needs a human: ${reconciled.next.reason}`);
    if (reconciled.next.detail) emit(`  ${reconciled.next.detail}`);
    await store.writeRuntime({
      ...(await store.readRuntime()),
      state: machine.state,
      humanRequired: {
        reason: reconciled.next.reason,
        note: reconciled.next.detail ?? null,
        at: new Date().toISOString(),
      },
    });
    return 0;
  }

  if (reconciled.next.kind === DISPATCH_KINDS.CLOSE_GOAL) {
    emit(`Round ${reconciled.next.round} was ACCEPTED; the Goal is ready for closure.`);
    machine.transitionTo(LOOP_STATES.ACCEPTED);
    await store.writeRuntime({
      ...(await store.readRuntime()),
      state: machine.state, round: reconciled.next.round, decision: 'ACCEPTED',
    });
    return 0;
  }

  let round = reconciled.next.round;
  // Blockers travel with the review that produced them; they are never
  // rediscovered by asking the Tech Lead again.
  // `let`, because the loop below reassigns both when a review asks for a
  // correction round. They were `const`, which made the in-process continuation
  // after CHANGES_REQUIRED throw before it could start the next round.
  let pendingBlockers = reconciled.next.blockers ?? [];
  let startAsCorrection = reconciled.next.kind === DISPATCH_KINDS.CORRECTION;

  // The Developer profile the Tech Lead chose for this Goal when it planned it.
  // Read once: `run-goal` never asks a model which profile to use.
  const plannedProfile = await profileStore.read(goal.goalId);
  // Carried across rounds inside this process. A review may replace it; silence
  // preserves it. Nothing here promotes on round number.
  //
  // Seeded from disk: a run interrupted between "the Tech Lead escalated" and
  // "the correction round started" must resume on the escalated profile, not on
  // the one the previous round happened to use.
  const persistedEscalation = priorGoalExecution?.nextDeveloperProfile ?? null;
  let pendingProfileEscalation = persistedEscalation?.round === round ? persistedEscalation : null;

  if (startAsCorrection && pendingBlockers.length > 0) {
    emit(`Correction round ${round} carries ${pendingBlockers.length} blocker(s) from review ${reconciled.next.fromReviewJobId ?? 'on disk'}.`);
    emit('');
  }


  const roundsRun = [];
  let finalDecision = null;
  let finalReason = null;
  let lastChanges = null;
  let lastDevResult = null;

  for (;;) {
    const isCorrection = startAsCorrection || round > 1;
    const phaseQueued = isCorrection ? LOOP_STATES.CORRECTION_QUEUED : LOOP_STATES.DEVELOPER_QUEUED;
    const phaseRunning = isCorrection ? LOOP_STATES.CORRECTION_RUNNING : LOOP_STATES.DEVELOPER_RUNNING;

    emit(`── Round ${round} ${isCorrection ? '(correction)' : '(implementation)'} ──`);

    // --- Developer routing -------------------------------------------------
    // Resolved BEFORE the job is built, from state only. A recovered round
    // re-reads the profile it already had; it is never recalculated, so a
    // promotion to OPUS_HIGH cannot be downgraded by a restart.
    const currentExecution = goalExecutionOf(await store.readRuntime(), goal.goalId);
    const routing = resolveProfileForRound({
      goalExecution: currentExecution,
      round,
      techLeadEscalation: pendingProfileEscalation,
      planningRecord: plannedProfile,
      declaredInGoal: goal.declaredDeveloperProfile,
    });
    const profileRecord = toExecutionRecord(routing, { goal: goal.goalId, round });

    if (routing.source !== PROFILE_SOURCES.PERSISTED) {
      await store.writeRuntime({
        ...(await store.readRuntime()), developerProfile: profileRecord, nextDeveloperProfile: null,
      });
      await store.appendEvent({
        type: routing.changed ? 'DEVELOPER_PROFILE_CHANGED' : 'DEVELOPER_PROFILE_SELECTED',
        goal: goal.goalId,
        round,
        stage: isCorrection ? STAGES.CORRECTION : STAGES.IMPLEMENTATION,
        profile: routing.profile.name,
        previousProfile: routing.previousProfile,
        model: routing.profile.model,
        effort: routing.profile.effort,
        selectedBy: routing.selectedBy,
        source: routing.source,
        // Short by contract: the audit trail records a choice, not an argument.
        reason: routing.reason,
      });
    }
    // Consumed: an escalation applies to exactly one round.
    pendingProfileEscalation = null;

    emit(`Developer profile: ${routing.profile.name} (${routing.profile.model}, effort ${routing.profile.effort ?? 'CLI default'}) — ${routing.source}`);
    if (routing.reason) emit(`  reason: ${routing.reason}`);

    const beforeDev = await captureSnapshot({ probe });


    // A distinct job id per round is what makes idempotency meaningful — and it
    // is recorded per ROLE, not just per round. A single currentJobId could not
    // survive a crash during review: the id left on disk was the reviewer's, so
    // on resume the Developer step adopted it, found no Developer result under
    // it, and would have re-run Opus under a job id that belonged to the Tech
    // Lead. Two inferences, one of them already paid for.
    // The attempt to use: the one the ledger says already completed this stage,
    // then whichever was left in flight, then a new one. The recorded id is a
    // hint now; the ledger is the authority.
    //
    // Every candidate is scoped to this Goal before it is considered. The
    // ledger and the reconciled resume point already are; the recorded hint is
    // read through `priorGoalExecution`, which is null for any other Goal, and
    // `jobIdForGoal` drops an id whose own name says it belongs elsewhere. A
    // freshly minted id is the answer whenever nothing legitimate survives —
    // never an inherited one.
    const devStage = isCorrection ? STAGES.CORRECTION : STAGES.IMPLEMENTATION;
    const devLedger = reconciled.ledger.get(`${goal.goalId}:r${round}:${devStage}`);
    const devJobId = devLedger?.completedBy
      ?? reconciled.next.resumeAttempt
      ?? jobIdForGoal(jobIdsFor(priorGoalExecution, round).developer, goal.goalId)
      ?? store.newJobId(goal.goalId, round, isCorrection ? 'correction' : 'developer');
    assertBelongsToGoal(devJobId, goal.goalId, `developer job ${devJobId}`);
    await readJobForGoal(store, 'developer', devJobId, goal.goalId);

    const alreadyDone = await store.hasCompletedResult('developer', devJobId);

    const devJob = validateDeveloperJob({
      protocolVersion: PROTOCOL_VERSION_V2,
      jobId: devJobId,
      role: 'developer',
      goal: goal.goalId,
      round,
      type: isCorrection ? 'CORRECTION' : 'IMPLEMENTATION',
      migrationAcceptedBaseline: goal.migrationAcceptedBaseline,
      executionBase,
      worktreeInitialHead: worktree.worktreeInitialHead,
      worktree: absWorktree,
      goalPath: goal.goalPath,
      blockers: isCorrection ? pendingBlockers.map(blockerText) : [],
      previousImplementationReport: lastDevResult?.implementationReport ?? priorGoalExecution?.lastImplementationReport ?? null,
      previousDecision: isCorrection ? 'CHANGES_REQUIRED' : undefined,
      changedFiles: lastChanges?.changedFiles ?? [],
      // The job is what the worker reads. Putting the profile here — rather
      // than letting the worker decide — is what makes a restart, a capacity
      // retry and a recovery all run on the same model.
      developerProfile: routing.profile.name,
      developerProfileReason: routing.reason,
    });

    machine.transitionTo(phaseQueued);
    await store.writeRuntime({
      ...(await store.readRuntime()), state: machine.state, round,
      currentJobId: devJobId, ...withJobId(await store.readRuntime(), round, 'developer', devJobId),
    });

    let devEnvelope;
    if (alreadyDone) {
      emit(`Developer already completed ${devJobId} — reusing the persisted result. The model is NOT called again.`);
      machine.transitionTo(phaseRunning);
      devEnvelope = await store.readResult('developer', devJobId);
    } else {
      // Fails closed rather than paying for an inference already on disk.
      assertNoDuplicateStageDispatch({
        ledger: reconciled.ledger, goal: goal.goalId, round, stage: devStage, jobId: devJobId,
      });
      // Dispatch, not publish: the job for this stage may already exist —
      // queued, or interrupted and owed another attempt. Publishing blindly
      // is what turned every resume into DUPLICATE_JOB.
      const dispatched = await store.dispatchJob('developer', devJob, {
        reason: 'RECOVERED_INTERRUPTED_ATTEMPT',
      });
      emit(dispatchMessage(dispatched, isCorrection ? 'Correction' : 'Developer'));

      // The complete content identity of the tree this attempt is handed,
      // captured before the model runs and named by ATTEMPT. A single
      // worktree-fingerprint-before.json was overwritten on every pass, so the
      // state a given attempt actually started from was lost the moment the
      // next one ran — and reconstructing that is the whole reason to capture
      // it. Earlier snapshots are never rewritten.
      const attemptNumber = dispatched.attempt ?? 1;
      const fingerprintBefore = await fullWorktreeFingerprint(absWorktree, executionBase, {
        worktreeInitialHead: worktree.worktreeInitialHead,
      });
      await fs.mkdir(join(STATE_DIR, 'artefacts', `${goal.goalId}-r${round}`), { recursive: true });
      await fs.writeFile(
        join(STATE_DIR, 'artefacts', `${goal.goalId}-r${round}`, `worktree-fingerprint-before-a${attemptNumber}.json`),
        JSON.stringify({ ...fingerprintBefore, attempt: attemptNumber, jobId: devJobId }, null, 2), 'utf8',
      );
      await store.appendEvent({
        type: 'WORKTREE_FINGERPRINT_CAPTURED', goal: goal.goalId, round,
        phase: 'BEFORE_DEVELOPER', attempt: attemptNumber, jobId: devJobId,
        contentHash: fingerprintBefore.contentHash,
        trackedDiffHash: fingerprintBefore.trackedDiffHash,
        untrackedHash: fingerprintBefore.untrackedHash,
        untrackedFileCount: fingerprintBefore.untrackedFileCount,
      });
      if (dispatched.outcome === JOB_DISPATCH.NEW_ATTEMPT) {
        await store.appendEvent({
          type: 'JOB_ATTEMPT_STARTED', role: 'developer', jobId: devJobId,
          goal: goal.goalId, round, stage: devStage, attempt: dispatched.attempt,
        });
      }
      machine.transitionTo(phaseRunning);
      emit('Waiting for the Developer…');
      // Which attempt this run is waiting on, read from the job the dispatch
      // just settled. Without it the wait would accept any attempt's result.
      const devAttemptId = (await store.readAttemptState('developer', devJobId))?.attemptId ?? null;
      emit(`  attempt: ${devAttemptId ?? 'unknown'}`);
      const observed = await waitForResult(store, 'developer', devJobId, {
        emit, leaseStore, expectedAttemptId: devAttemptId,
        goal: goal.goalId, round, resultTimeoutMs: RESULT_TIMEOUT_MS,
      });
      if (observed.observerTimeout || observed.workerOffline) {
        await reportObserverStop({ store, emit, role: 'developer', jobId: devJobId, observed, goal: goal.goalId, round });
        return 0;
      }
      devEnvelope = observed.envelope;
    }

    if (!devEnvelope.ok) {
      emit(`Developer failed: [${devEnvelope.code}] ${devEnvelope.message}`);
      machine.transitionTo(LOOP_STATES.HUMAN_REQUIRED);
      finalDecision = 'HUMAN_REQUIRED';
      finalReason = devEnvelope.code;
      break;
    }

    lastDevResult = devEnvelope.result;
    emit(`Developer result: ${lastDevResult.status}`);

    // --- Real state, collected from git -----------------------------------
    const changes = await collectWorktreeChanges(absWorktree, worktree.worktreeInitialHead);
    lastChanges = changes;
    const afterDev = await captureSnapshot({ probe });
    const devViolations = checkDeveloperPolicy({
      before: beforeDev, after: afterDev,
      worktreeInitialHead: worktree.worktreeInitialHead, changes,
    });

    emit(`  changed files: ${changes.changedFiles.length} · commits: ${changes.commits.length} · violations: ${devViolations.length}`);
    for (const v of formatViolations(devViolations)) emit(`    - ${v}`);

    const artefactDir = join(STATE_DIR, 'artefacts', `${goal.goalId}-r${round}`);
    await fs.mkdir(artefactDir, { recursive: true });
    const diffPath = join(artefactDir, 'implementation.patch');
    await fs.writeFile(diffPath, changes.diff, 'utf8');

    if (devViolations.length > 0) {
      await store.appendEvent({ type: 'POLICY_VIOLATION', goal: goal.goalId, round, agent: 'developer', violations: devViolations });
      machine.transitionTo(LOOP_STATES.HUMAN_REQUIRED);
      finalDecision = 'HUMAN_REQUIRED';
      finalReason = 'POLICY_VIOLATION';
      break;
    }

    machine.transitionTo(LOOP_STATES.REVIEW_REQUIRED);

    // --- Review ------------------------------------------------------------
    const packet = buildReviewPacket({
      goal: goal.goalId, goalPath: goal.goalPath, round, reviewLevel: REVIEW_LEVEL,
      migrationAcceptedBaseline: goal.migrationAcceptedBaseline,
      executionBase, worktreeInitialHead: worktree.worktreeInitialHead,
      worktreePath: absWorktree, changes, developerResult: lastDevResult,
      previousBlockers: pendingBlockers.map(blockerText), diffPath,
      // So the reviewer decides an escalation against the profile that
      // actually ran, not against an assumption.
      developerProfile: routing.profile.name,
    });
    // The exact tree being reviewed, hashed in full. The review packet already
    // carried the tracked diff; what was missing was the content of untracked
    // files, which is why a later forensic comparison could only reach a verdict
    // for part of the tree.
    const reviewedFingerprint = await fullWorktreeFingerprint(absWorktree, executionBase, {
      worktreeInitialHead: worktree.worktreeInitialHead,
    });
    const fingerprintPath = join(artefactDir, 'worktree-fingerprint-reviewed.json');
    await fs.writeFile(fingerprintPath, JSON.stringify(reviewedFingerprint, null, 2), 'utf8');

    const packetPath = join(artefactDir, 'review-packet.json');
    await fs.writeFile(
      packetPath,
      JSON.stringify({ ...packet, worktreeFingerprint: reviewedFingerprint, fingerprintPath }, null, 2),
      'utf8',
    );
    await store.appendEvent({
      type: 'WORKTREE_FINGERPRINT_CAPTURED', goal: goal.goalId, round, phase: 'REVIEWED',
      contentHash: reviewedFingerprint.contentHash,
      trackedDiffHash: reviewedFingerprint.trackedDiffHash,
      untrackedHash: reviewedFingerprint.untrackedHash,
      untrackedFileCount: reviewedFingerprint.untrackedFileCount,
    });

    // The reviewer's job id was previously minted fresh on every pass, so any
    // resume re-published the review and called Fable again — even when its
    // answer was already on disk. It is now recorded and reused like the
    // Developer's.
    const revLedger = reconciled.ledger.get(`${goal.goalId}:r${round}:${STAGES.REVIEW}`);
    const revJobId = revLedger?.completedBy
      ?? jobIdForGoal(jobIdsFor(priorGoalExecution, round).tech_lead, goal.goalId)
      ?? store.newJobId(goal.goalId, round, 'tech_lead');
    assertBelongsToGoal(revJobId, goal.goalId, `review job ${revJobId}`);
    await readJobForGoal(store, 'tech_lead', revJobId, goal.goalId);
    const reviewAlreadyDone = await store.hasCompletedResult('tech_lead', revJobId);
    const revJob = validateReviewJob({
      protocolVersion: PROTOCOL_VERSION_V2,
      jobId: revJobId, role: 'tech_lead', goal: goal.goalId, round,
      reviewLevel: REVIEW_LEVEL,
      migrationAcceptedBaseline: goal.migrationAcceptedBaseline,
      executionBase, worktreeInitialHead: worktree.worktreeInitialHead,
      worktree: absWorktree, goalPath: goal.goalPath,
      changedFiles: changes.changedFiles, diffStat: changes.diffStat,
      implementationReport: lastDevResult.implementationReport,
      validations: lastDevResult.validations,
      previousBlockers: pendingBlockers.map(blockerText),
      packetPath,
    });

    const beforeReview = await captureSnapshot({ probe, worktreePath: absWorktree, fingerprint: worktreeFingerprint });

    machine.transitionTo(LOOP_STATES.REVIEWER_QUEUED);
    await store.writeRuntime({
      ...(await store.readRuntime()), state: machine.state, round,
      currentJobId: revJobId, ...withJobId(await store.readRuntime(), round, 'tech_lead', revJobId),
    });

    let revEnvelope;
    if (reviewAlreadyDone) {
      emit(`Tech Lead already completed ${revJobId} — reusing the persisted review. The model is NOT called again.`);
      machine.transitionTo(LOOP_STATES.REVIEWER_RUNNING);
      revEnvelope = await store.readResult('tech_lead', revJobId);
      await store.appendEvent({ type: 'JOB_RESULT_REUSED', role: 'tech_lead', jobId: revJobId, goal: goal.goalId, round });
    } else {
      assertNoDuplicateStageDispatch({
        ledger: reconciled.ledger, goal: goal.goalId, round, stage: STAGES.REVIEW, jobId: revJobId,
      });
      const dispatchedReview = await store.dispatchJob('tech_lead', revJob, {
        reason: 'RECOVERED_INTERRUPTED_ATTEMPT',
      });
      emit(dispatchMessage(dispatchedReview, 'Review'));
      if (dispatchedReview.outcome === JOB_DISPATCH.NEW_ATTEMPT) {
        await store.appendEvent({
          type: 'JOB_ATTEMPT_STARTED', role: 'tech_lead', jobId: revJobId,
          goal: goal.goalId, round, stage: STAGES.REVIEW, attempt: dispatchedReview.attempt,
        });
      }
      machine.transitionTo(LOOP_STATES.REVIEWER_RUNNING);
      emit('Waiting for the Tech Lead…');

      const revAttemptId = (await store.readAttemptState('tech_lead', revJobId))?.attemptId ?? null;
      emit(`  attempt: ${revAttemptId ?? 'unknown'}`);
      const observedReview = await waitForResult(store, 'tech_lead', revJobId, {
        emit, leaseStore, expectedAttemptId: revAttemptId,
        goal: goal.goalId, round, resultTimeoutMs: RESULT_TIMEOUT_MS,
      });
      if (observedReview.observerTimeout || observedReview.workerOffline) {
        await reportObserverStop({ store, emit, role: 'tech_lead', jobId: revJobId, observed: observedReview, goal: goal.goalId, round });
        return 0;
      }
      revEnvelope = observedReview.envelope;
    }
    const afterReview = await captureSnapshot({ probe, worktreePath: absWorktree, fingerprint: worktreeFingerprint });
    const revViolations = checkReviewerPolicy({ before: beforeReview, after: afterReview });

    if (revViolations.length > 0) {
      await store.appendEvent({ type: 'POLICY_VIOLATION', goal: goal.goalId, round, agent: 'tech_lead', violations: revViolations });
      emit('REVIEWER_MUTATED_WORKTREE — the review is not accepted.');
      machine.transitionTo(LOOP_STATES.HUMAN_REQUIRED);
      finalDecision = 'HUMAN_REQUIRED';
      finalReason = 'REVIEWER_MUTATED_WORKTREE';
      break;
    }

    if (!revEnvelope.ok) {
      emit(`Review failed: [${revEnvelope.code}] ${revEnvelope.message}`);
      machine.transitionTo(LOOP_STATES.HUMAN_REQUIRED);
      finalDecision = 'HUMAN_REQUIRED';
      finalReason = revEnvelope.code;
      break;
    }

    const decision = revEnvelope.result;
    emit(`Decision R${round}: ${decision.decision}`);
    emit('');
    roundsRun.push({ round, decision: decision.decision, blockers: decision.blockers.length, changedFiles: changes.changedFiles.length });

    await store.writeRuntime({
      ...(await store.readRuntime()),
      round, decision: decision.decision, blockers: decision.blockers,
      lastImplementationReport: lastDevResult.implementationReport,
    });

    // --- What follows -----------------------------------------------------
    const plan = planAfterReview({ decision: decision.decision, round });

    if (plan.action === 'CORRECT') {
      machine.transitionTo(LOOP_STATES.CHANGES_REQUIRED);
      machine.transitionTo(LOOP_STATES.CORRECTION_QUEUED);

      // The Tech Lead's escalation for the NEXT round, if it made one. Absent
      // means the correction keeps the profile it is on — the round number
      // decides nothing.
      pendingProfileEscalation = decision.nextDeveloperProfile
        ? { profile: decision.nextDeveloperProfile, reason: decision.nextDeveloperProfileReason ?? null }
        : null;
      if (pendingProfileEscalation) {
        emit(`Tech Lead selected ${pendingProfileEscalation.profile} for round ${plan.nextRound}.`);
        // Persisted before the next round starts, so a crash in between does
        // not lose the escalation and resume the correction on the old profile.
        await store.writeRuntime({
          ...(await store.readRuntime()),
          nextDeveloperProfile: { ...pendingProfileEscalation, round: plan.nextRound, selectedBy: 'tech_lead' },
        });
      }

      await store.appendEvent({
        type: 'CORRECTION_ROUND_STARTED', goal: goal.goalId,
        fromRound: round, toRound: plan.nextRound, blockers: decision.blockers.length,
        nextDeveloperProfile: decision.nextDeveloperProfile ?? null,
      });
      pendingBlockers = decision.blockers;
      round = plan.nextRound;
      startAsCorrection = true;
      // The machine is already in CORRECTION_QUEUED; the next iteration
      // transitions from there.
      continue;
    }

    finalDecision = plan.decision;
    finalReason = plan.reason;
    if (plan.reason === 'MAX_CORRECTION_ROUNDS_REACHED') {
      emit(plan.note);
      machine.transitionTo(LOOP_STATES.HUMAN_REQUIRED);
    } else {
      machine.transitionTo(stateForDecision(plan.decision));
    }
    break;
  }

  machine.transitionTo(LOOP_STATES.AWAITING_HUMAN);

  const previous = (await store.readRuntime()) ?? {};
  await store.writeRuntime({
    ...previous,
    state: machine.state,
    round,
    decision: finalDecision,
    escalationReason: finalReason,
    roundsRun,
    goalExecuted: true,
    goalCommitted: false,
    migrationBaselineUpdated: false,
    nextGoalCreated: false,
  });
  await store.appendEvent({
    type: 'SUPERVISED_STOP', goal: goal.goalId, state: machine.state,
    decision: finalDecision, reason: finalReason, rounds: roundsRun.length,
  });

  emit('State:');
  for (const t of machine.history) emit(`  ${t.from} -> ${t.to}`);
  emit('');
  emit(`Goal: ${goal.goalId}`);
  emit(`Final round: ${round}`);
  for (const r of roundsRun) emit(`  R${r.round}: ${r.decision} (${r.blockers} blockers, ${r.changedFiles} files)`);
  emit(`Worktree: ${worktree.path} (branch ${worktree.branch})`);
  emit(`Migration baseline: ${goal.migrationAcceptedBaseline}`);
  emit(`Execution base (original): ${executionBase}`);
  emit(`Decision: ${finalDecision}`);
  if (finalReason) emit(`Reason: ${finalReason}`);

  const lastRound = roundsRun[roundsRun.length - 1];
  if (lastRound && lastRound.blockers > 0) {
    const runtime = await store.readRuntime();
    emit('Blockers:');
    for (const b of runtime.blockers ?? []) emit(`  - ${blockerText(b)}`);
  }

  emit('');
  emit(`State: ${machine.state}`);
  emit('');
  emit('Goal committed: NO');
  emit('Migration baseline updated: NO');
  emit('Next Goal created: NO');
  emit('Worktree kept for human inspection.');

  return 0;
}

/**
 * Reports that the OBSERVER stopped watching, leaving the job untouched.
 *
 * Nothing is failed, nothing is released, nothing is re-queued: the attempt
 * keeps ownership and `ia-loop:resume` re-attaches to it.
 */
async function reportObserverStop({ store, emit, role, jobId, observed, goal, round }) {
  await store.appendEvent({
    type: 'OBSERVER_STOPPED', goal, round, role, jobId,
    reason: observed.workerOffline ? 'WORKER_OFFLINE' : 'OBSERVER_TIMEOUT',
    leaseStatus: observed.leaseStatus ?? null,
  });

  emit('');
  emit(observed.workerOffline
    ? `The ${role} worker is no longer heartbeating.`
    : `Stopped observing ${jobId} after the observer window.`);
  emit('');
  emit('The job was NOT failed and NOT re-queued. The attempt keeps its lease.');
  if (observed.lease) {
    emit(`  attempt: ${observed.lease.attemptId} · lease: ${observed.leaseStatus} `
      + `(heartbeat ${Math.round((observed.leaseAgeMs ?? 0) / 1000)}s ago)`);
  }
  emit('');
  emit('Check with:  npm run ia-loop:status');
  emit('Re-attach with:  npm run ia-loop:resume');
}

/** Blockers may be plain strings or structured records; both must render. */
function blockerText(blocker) {
  if (typeof blocker === 'string') return blocker;
  const id = blocker.id ? `${blocker.id}: ` : '';
  const severity = blocker.severity ? `[${blocker.severity}] ` : '';
  const scope = blocker.correctionScope ? ` — escopo: ${blocker.correctionScope}` : '';
  return `${severity}${id}${blocker.description ?? JSON.stringify(blocker)}${scope}`;
}

// Only when this file IS the program. Importing it — from a test, a doc
// generator, or an agent reading the tooling — must never start anything.
if (isDirectExecution(import.meta.url)) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
      console.error(`\nIA Loop — Goal Runner\n\nBlocker: [${code}] ${error.message}\n\nOverall:\nFAIL`);
      process.exitCode = 1;
    });
}
