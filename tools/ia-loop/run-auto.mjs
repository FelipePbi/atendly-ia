#!/usr/bin/env node
/**
 * IA Loop — autonomous goal-to-goal execution.
 *
 *   npm run ia-loop:auto -- --from 004
 *   npm run ia-loop:auto              (continues an existing run)
 *
 * Carries the migration forward without a human in the normal path:
 *
 *   Goal READY → Developer → review → corrections → ACCEPTED → closure
 *   → commit → integration → new baseline → planning → next Goal → repeat
 *
 * It stops only for a real reason: a condition that needs a person, a requested
 * pause, or the migration being declared complete.
 *
 * Each phase runs as its own process, reusing run-goal and run-close unchanged.
 * That keeps every guarantee already proven — leases, snapshots, idempotency —
 * instead of reimplementing them here.
 */

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { createJobStore } from './lib/job-store.mjs';
import { discoverGoal, parseMigrationStatus } from './lib/goal-discovery.mjs';
import { evaluateGoalBoundary } from './lib/goal-boundary.mjs';
import { createGitProbe } from './lib/git-ops.mjs';
import { readWorkerHealth, WORKER_HEALTH } from './lib/worker-registry.mjs';
import {
  RUN_STATUS,
  createAutonomousStore,
  isCapacityWait,
  requiresHuman,
  shouldPauseAt,
} from './lib/autonomous-state.mjs';
import { startLeaseHeartbeat } from './lib/leases.mjs';
import { readFile } from 'node:fs/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const STATE_DIR = join(HERE, '.state');

const probe = createGitProbe(REPO_ROOT);

/** Releases the loop lease only when this process is the one holding it. */
async function releaseHeldIfMine(auto, attached) {
  if (attached?.attached) await auto.releaseLoopLease({ force: true }).catch(() => {});
}
const emit = (line = '') => console.log(line);

function parseArgs(argv) {
  const args = argv.slice(2);
  const valueOf = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] ?? null : null;
  };
  return {
    fromGoal: valueOf('--from'),
    // Declaring a HUMAN_REQUIRED stop resolved is a person's decision, stated
    // explicitly and recorded. The loop can never do it for itself.
    resolvedNote: valueOf('--resolved'),
  };
}

/** Runs one phase as a child process, inheriting stdio so progress is visible. */
function runPhase(script, args) {
  return new Promise((resolvePhase) => {
    const child = spawn(process.execPath, [join(HERE, script), ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, IA_LOOP_AUTONOMOUS: '1' },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('close', (code) => resolvePhase({ code }));
    child.on('error', (error) => resolvePhase({ code: 1, error }));
  });
}

/**
 * Gathers the facts a Goal boundary is judged on. The judgement itself lives in
 * lib/goal-boundary.mjs so it can be tested without a repository.
 */
async function goalBoundaryPreflight({ goalId, expectedBaseline }) {
  let discoveryError = null;
  const goal = await discoverGoal({
    repoRoot: REPO_ROOT, goalId, resolveSha: (sha) => probe.commitExists(sha),
  }).catch((error) => { discoveryError = error.message; return null; });

  const dirtyFiles = await probe.isDirty() ? await probe.relevantDirtyFiles() : [];

  const { problems, resuming } = evaluateGoalBoundary({
    goalId,
    goal,
    discoveryError,
    expectedBaseline,
    dirtyFiles,
    branchExists: await probe.branchExists(`ai-loop/goal-${goalId}`),
    worktreeExists: await probe.pathExists(`.ai-worktrees/goal-${goalId}`),
  });

  return { goal, problems, resuming };
}

async function main() {
  const { fromGoal, resolvedNote } = parseArgs(process.argv);
  const store = createJobStore(STATE_DIR);
  const auto = createAutonomousStore(STATE_DIR);

  emit('');
  emit('ATENDLY IA LOOP — AUTONOMOUS');
  emit('');

  // Both workers must be up: they are the execution interface.
  const [tl, dev] = await Promise.all([
    readWorkerHealth(store, 'tech_lead'), readWorkerHealth(store, 'developer'),
  ]);
  if (tl.health === WORKER_HEALTH.OFFLINE || dev.health === WORKER_HEALTH.OFFLINE) {
    throw new SpikeError('WORKERS_NOT_RUNNING',
      'Both workers must be running: npm run ia-loop:tech-lead and npm run ia-loop:developer');
  }

  // --- Acquire or re-attach to the run ------------------------------------
  let run;
  const attached = await auto.attach();

  // From here on the loop lease may be held — by attach() above or by start()
  // below — so every exit has to go through releaseHeld(). A run that throws
  // before its own try block once left the lease behind and locked the loop out
  // of itself: the next start was refused by a lease nobody was holding.
  const releaseHeld = async () => { await auto.releaseLoopLease({ force: true }).catch(() => {}); };

  if (attached && !attached.attached) {
    // Nothing was claimed in this case, but be explicit rather than lucky.
    await releaseHeldIfMine(auto, attached);
    throw new SpikeError('AUTONOMOUS_RUN_ALREADY_ACTIVE',
      `Run ${attached.lease?.autonomousRunId ?? attached.run.autonomousRunId} owns the loop. `
      + 'A second orchestrator would race it for Goals.');
  }

  if (attached?.attached) {
    run = attached.run;
    emit(`Re-attached to run ${run.autonomousRunId} (started ${run.startedAt}).`);
    if (run.status === RUN_STATUS.PAUSED) {
      run = await auto.clearPause();
      await store.appendEvent({ type: 'AUTONOMOUS_RUN_RESUMED', autonomousRunId: run.autonomousRunId });
      emit('Resuming from PAUSED.');
    }
    if (run.status === RUN_STATUS.PAUSED_FOR_HUMAN) {
      // Resume must not walk past an unresolved problem — only an explicit
      // human statement that it was resolved retires the stopped run.
      if (!resolvedNote) {
        await releaseHeld();
        throw new SpikeError('HUMAN_REQUIRED',
          `Run ${run.autonomousRunId} is stopped for a human: ${run.humanRequired?.reason}. `
          + 'Resolve it, then start a new run with --from <goal> --resolved "<what was resolved>".');
      }
      const archived = await auto.archiveRun({ resolvedBy: 'operator', note: resolvedNote });
      // attach() took the loop lease for the retired run; the new run claims
      // its own, so this one has to go first.
      await auto.releaseLoopLease({ force: true });
      await store.appendEvent({
        type: 'AUTONOMOUS_RUN_ARCHIVED', autonomousRunId: archived.autonomousRunId,
        reason: archived.humanRequired?.reason ?? null, note: resolvedNote,
      });
      emit(`Run ${archived.autonomousRunId} retired: ${resolvedNote}`);
      run = null;
    }
  }

  // A fresh run: no run existed, or the stopped one was just retired.
  if (!run) {
    const migrationText = await readFile(join(REPO_ROOT, 'docs/migration/MIGRATION_STATUS.md'), 'utf8');
    const { acceptedBaseline } = parseMigrationStatus(migrationText);
    const startGoal = fromGoal ?? null;
    if (!startGoal) {
      await releaseHeld();
      throw new SpikeError('INVALID_ARGS', 'Pass --from <goalId> to start a new autonomous run');
    }

    run = await auto.start({ fromGoal: startGoal, migrationAcceptedBaseline: acceptedBaseline });
    await store.appendEvent({
      type: 'AUTONOMOUS_RUN_STARTED', autonomousRunId: run.autonomousRunId,
      fromGoal: startGoal, baseline: acceptedBaseline,
    });
    emit(`Started run ${run.autonomousRunId} from Goal ${startGoal}.`);
  }

  // The loop lease is renewed for as long as this orchestrator lives.
  const stopLeaseHeartbeat = startLeaseHeartbeat(auto.leases, { jobId: 'migration-loop' });
  const finish = async () => { await stopLeaseHeartbeat(); await auto.releaseLoopLease().catch(() => {}); };

  emit(`Baseline: ${run.migrationAcceptedBaseline}`);
  emit('');

  try {
    // ===================== The loop ========================================
    for (;;) {
      const goalId = run.currentGoal;
      emit('');
      emit(`══ Goal ${goalId} ══`);

      // --- Boundary preflight ---------------------------------------------
      const preflight = await goalBoundaryPreflight({
        goalId, expectedBaseline: run.migrationAcceptedBaseline,
      });
      if (preflight.problems.length > 0) {
        await auto.markHumanRequired('GOAL_BOUNDARY_AMBIGUOUS', preflight.problems.join(' | '));
        await store.appendEvent({
          type: 'AUTONOMOUS_RUN_HUMAN_REQUIRED', autonomousRunId: run.autonomousRunId,
          goal: goalId, reason: 'GOAL_BOUNDARY_AMBIGUOUS', problems: preflight.problems,
        });
        emit('Goal boundary is ambiguous; stopping instead of guessing:');
        for (const p of preflight.problems) emit(`  - ${p}`);
        return 1;
      }

      await store.appendEvent({ type: 'GOAL_STARTED', autonomousRunId: run.autonomousRunId, goal: goalId });

      // --- Implementation, review and corrections --------------------------
      const goalPhase = await runPhase('run-goal.mjs', [goalId]);
      const runtimeAfterGoal = await store.readRuntime();
      // A decision counts only if it belongs to the Goal that just ran. Reading
      // one left by an earlier Goal is how a loop congratulates itself for work
      // it did not do.
      const decision = runtimeAfterGoal?.goal === goalId ? (runtimeAfterGoal.decision ?? null) : null;

      if (goalPhase.code !== 0 || decision !== 'ACCEPTED') {
        const reason = runtimeAfterGoal?.escalationReason ?? decision ?? 'UNKNOWN_FATAL';

        if (isCapacityWait(reason)) {
          // Never an intervention: the workers wait it out themselves.
          emit(`Waiting for capacity (${reason}); the run stays active.`);
          continue;
        }

        const humanReason = requiresHuman(reason) ? reason
          : decision === 'HUMAN_REQUIRED' ? 'REVIEWER_ASKED_FOR_HUMAN'
            : 'UNKNOWN_FATAL';
        await auto.markHumanRequired(humanReason, `Goal ${goalId} ended as ${decision ?? 'failed'}`);
        await store.appendEvent({
          type: 'AUTONOMOUS_RUN_HUMAN_REQUIRED', autonomousRunId: run.autonomousRunId,
          goal: goalId, reason: humanReason,
        });
        emit('');
        emit(`Goal ${goalId} needs a human: ${humanReason}`);
        return 1;
      }

      await store.appendEvent({ type: 'GOAL_ACCEPTED', autonomousRunId: run.autonomousRunId, goal: goalId });
      emit(`Goal ${goalId}: ACCEPTED`);

      // Safe boundary: after a decision, before any further inference.
      const pauseAfterDecision = shouldPauseAt(await auto.read(), { boundary: 'AFTER_DECISION' });
      if (pauseAfterDecision.pause) {
        await auto.markPaused(pauseAfterDecision.reason);
        await store.appendEvent({ type: 'AUTONOMOUS_RUN_PAUSED', autonomousRunId: run.autonomousRunId, boundary: 'AFTER_DECISION' });
        emit('Paused at a safe boundary, after the review decision.');
        return 0;
      }

      // --- Closure, integration and planning -------------------------------
      const closePhase = await runPhase('run-close.mjs', [goalId]);
      const runtimeAfterClose = await store.readRuntime();
      // Same rule for the closure: a closure record for another Goal proves
      // nothing about this one, and its baseline would be the wrong one.
      const recorded = runtimeAfterClose?.closure ?? {};
      const closure = recorded.goal === goalId ? recorded : {};

      if (closePhase.code !== 0) {
        const reason = runtimeAfterClose?.humanRequired?.reason ?? 'UNKNOWN_FATAL';
        if (isCapacityWait(reason)) { emit('Waiting for capacity during closure.'); continue; }

        await auto.markHumanRequired(requiresHuman(reason) ? reason : 'UNKNOWN_FATAL',
          `Closure of Goal ${goalId} did not complete`);
        await store.appendEvent({
          type: 'AUTONOMOUS_RUN_HUMAN_REQUIRED', autonomousRunId: run.autonomousRunId,
          goal: goalId, reason, phase: 'CLOSURE',
        });
        emit(`Closure of Goal ${goalId} needs a human: ${reason}`);
        return 1;
      }

      const newBaseline = closure.newMigrationBaseline ?? runtimeAfterClose?.migrationAcceptedBaseline;
      run = await auto.recordGoalCompleted(goalId, newBaseline);
      await store.appendEvent({
        type: 'MIGRATION_BASELINE_UPDATED', autonomousRunId: run.autonomousRunId,
        goal: goalId, baseline: newBaseline,
      });
      emit(`Goal ${goalId} closed. New baseline: ${newBaseline}`);

      // --- What did planning decide? ---------------------------------------
      if (closure.migrationComplete) {
        await auto.markCompleted(closure.migrationCompleteReason ?? 'Declared by the Tech Lead');
        await store.appendEvent({ type: 'MIGRATION_COMPLETE', autonomousRunId: run.autonomousRunId, goal: goalId });
        emit('');
        emit('MIGRATION COMPLETE — declared by the Tech Lead and verified against the repository.');
        return 0;
      }

      const nextGoalId = closure.nextGoalId;
      if (!nextGoalId) {
        // Absence of a next Goal is never read as completion.
        await auto.markHumanRequired('BASELINE_INCONSISTENT',
          'Planning produced neither a next Goal nor an explicit MIGRATION_COMPLETE');
        emit('Planning produced no next Goal and did not declare completion; stopping.');
        return 1;
      }

      // Safe boundary: the whole Goal is finished and the tree is inspectable.
      const pauseAfterGoal = shouldPauseAt(await auto.read(), { boundary: 'GOAL_BOUNDARY' });
      if (pauseAfterGoal.pause) {
        run = await auto.setCurrentGoal(nextGoalId);
        await auto.markPaused(pauseAfterGoal.reason);
        await store.appendEvent({ type: 'AUTONOMOUS_RUN_PAUSED', autonomousRunId: run.autonomousRunId, boundary: 'GOAL_BOUNDARY' });
        emit(`Paused after Goal ${goalId}. The next Goal (${nextGoalId}) is READY and will start on resume.`);
        return 0;
      }

      await store.appendEvent({
        type: 'GOAL_TRANSITION', autonomousRunId: run.autonomousRunId,
        from: goalId, to: nextGoalId, baseline: newBaseline,
      });
      run = await auto.setCurrentGoal(nextGoalId);
      emit(`→ Continuing automatically with Goal ${nextGoalId}.`);
    }
  } finally {
    await finish();
  }
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
    console.error(`\nATENDLY IA LOOP — AUTONOMOUS\n\nBlocker: [${code}] ${error.message}`);
    process.exitCode = 1;
  });
