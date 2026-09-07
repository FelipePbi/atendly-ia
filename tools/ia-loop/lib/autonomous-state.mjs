/**
 * IA Loop — autonomous run state.
 *
 * An autonomous run carries the migration from one Goal to the next without a
 * human in the normal path. It survives the process: the run lives on disk, and
 * a restart re-attaches to it rather than starting a second one.
 *
 * Three things are kept apart on purpose:
 *
 *   orchestrator lease  who is allowed to decide global transitions
 *   job / worktree lease (V6)  who owns one execution
 *   pause request       a voluntary, resumable stop
 *
 * PAUSED is a decision. PAUSED_FOR_HUMAN is a problem. They are never the same.
 */

import { randomUUID } from 'node:crypto';

import { SpikeError } from './claude-process.mjs';
import { readJson, writeJsonAtomic } from './job-store.mjs';
import { createLeaseStore, classifyLease, LEASE_STATUS } from './leases.mjs';

export const RUN_MODES = Object.freeze({ SUPERVISED: 'SUPERVISED', AUTONOMOUS: 'AUTONOMOUS' });

export const RUN_STATUS = Object.freeze({
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  PAUSED_FOR_HUMAN: 'PAUSED_FOR_HUMAN',
  COMPLETED: 'COMPLETED',
});

/** The orchestrator lease is a single, well-known key. */
const LOOP_LEASE_KEY = 'migration-loop';

/**
 * Conditions that genuinely need a person. Everything else keeps going.
 *
 * Capacity limits are deliberately absent: a rate or usage limit is a wait, not
 * an intervention, and treating it as one would stop the loop every night.
 */
export const HUMAN_REQUIRED_REASONS = Object.freeze([
  'REVIEWER_ASKED_FOR_HUMAN',
  'MAX_CORRECTION_ROUNDS_REACHED',
  'AUTH_ERROR',
  'BILLING_ERROR',
  'MODEL_UNAVAILABLE',
  'UNKNOWN_FATAL',
  'HARNESS_ERROR',
  'AGENT_CONTRACT_ERROR',
  'POLICY_VIOLATION',
  'CHERRY_PICK_CONFLICT',
  'ACCEPTED_WORKTREE_CHANGED',
  'ORPHANED_EXECUTION_UNCERTAIN',
  'GOAL_BOUNDARY_AMBIGUOUS',
  'BASELINE_INCONSISTENT',
  'PRODUCT_DECISION',
  'ARCHITECTURE_DECISION',
]);

export function requiresHuman(reason) {
  return HUMAN_REQUIRED_REASONS.includes(reason);
}

/** Capacity waits never stop an autonomous run. */
export function isCapacityWait(reason) {
  return reason === 'RATE_LIMIT' || reason === 'USAGE_LIMIT';
}

export function createAutonomousStore(stateDir) {
  const path = `${stateDir}/autonomous-run.json`;
  const leases = createLeaseStore(stateDir);

  return {
    path,
    leases,

    async read() {
      return readJson(path);
    },

    async write(run) {
      await writeJsonAtomic(path, run);
      return run;
    },

    /**
     * Starts a run, but only if no healthy orchestrator already owns the loop.
     * The claim is the same atomic filesystem primitive used for jobs.
     */
    async start({ fromGoal, migrationAcceptedBaseline }) {
      const existing = await this.read();
      const lease = await leases.readJobLease(LOOP_LEASE_KEY);

      if (lease) {
        const { status } = classifyLease(lease);
        if (status === LEASE_STATUS.ACTIVE) {
          throw new SpikeError(
            'AUTONOMOUS_RUN_ALREADY_ACTIVE',
            `Run ${lease.autonomousRunId} already owns the loop (heartbeat is healthy). `
            + 'A second autonomous orchestrator would race it for Goals.',
          );
        }
        // A stale loop lease is not proof the other orchestrator stopped.
        throw new SpikeError(
          'ORPHANED_EXECUTION_UNCERTAIN',
          `A loop lease from run ${lease.autonomousRunId} is stale but not confirmably dead. `
          + 'Resolve it before starting a new autonomous run.',
        );
      }

      if (existing?.status === RUN_STATUS.RUNNING) {
        throw new SpikeError(
          'AUTONOMOUS_RUN_ALREADY_ACTIVE',
          `Run ${existing.autonomousRunId} is recorded as RUNNING without a lease; resolve it first.`,
        );
      }

      const autonomousRunId = `auto-${randomUUID().slice(0, 8)}`;
      const claim = await leases.claimJob(LOOP_LEASE_KEY, { autonomousRunId, kind: 'orchestrator' });
      if (!claim.acquired) {
        throw new SpikeError('AUTONOMOUS_RUN_ALREADY_ACTIVE',
          `Another orchestrator claimed the loop first (${claim.heldBy?.autonomousRunId ?? 'unknown'}).`);
      }

      const run = {
        runMode: RUN_MODES.AUTONOMOUS,
        autonomousRunId,
        status: RUN_STATUS.RUNNING,
        startedAt: new Date().toISOString(),
        currentGoal: fromGoal,
        completedGoals: [],
        migrationAcceptedBaseline,
        pauseRequested: false,
        pauseAfterGoal: false,
      };
      await this.write(run);
      return run;
    },

    /** Re-attaches after a restart. Never creates a second run. */
    async attach() {
      const run = await this.read();
      if (!run || run.status === RUN_STATUS.COMPLETED) return null;

      const lease = await leases.readJobLease(LOOP_LEASE_KEY);
      if (lease) {
        const { status } = classifyLease(lease);
        if (status === LEASE_STATUS.ACTIVE) {
          return { run, attached: false, reason: 'AUTONOMOUS_RUN_ALREADY_ACTIVE', lease };
        }
        // The previous orchestrator is gone; taking over the LOOP lease is safe
        // because it only governs decisions, not in-flight executions — those
        // keep their own V6 leases.
        await leases.releaseJob(LOOP_LEASE_KEY, { force: true });
      }

      const claim = await leases.claimJob(LOOP_LEASE_KEY, {
        autonomousRunId: run.autonomousRunId, kind: 'orchestrator',
      });
      if (!claim.acquired) {
        return { run, attached: false, reason: 'AUTONOMOUS_RUN_ALREADY_ACTIVE', lease: claim.heldBy };
      }
      return { run, attached: true };
    },

    renewLoopLease() { return leases.renewJob(LOOP_LEASE_KEY).catch(() => null); },
    readLoopLease() { return leases.readJobLease(LOOP_LEASE_KEY); },
    releaseLoopLease(options) { return leases.releaseJob(LOOP_LEASE_KEY, options); },

    async requestPause({ afterGoal = false } = {}) {
      const run = await this.read();
      if (!run) throw new SpikeError('NO_AUTONOMOUS_RUN', 'There is no autonomous run to pause');
      // A pause request is a flag, never a kill: an inference in flight finishes.
      return this.write({ ...run, pauseRequested: true, pauseAfterGoal: afterGoal });
    },

    async markPaused(reason) {
      const run = await this.read();
      return this.write({
        ...run, status: RUN_STATUS.PAUSED, pausedAt: new Date().toISOString(), pauseReason: reason ?? null,
      });
    },

    async markHumanRequired(reason, detail) {
      const run = await this.read();
      return this.write({
        ...run,
        status: RUN_STATUS.PAUSED_FOR_HUMAN,
        humanRequired: { reason, detail: detail ?? null, at: new Date().toISOString() },
      });
    },

    async markCompleted(reason) {
      const run = await this.read();
      return this.write({
        ...run, status: RUN_STATUS.COMPLETED, completedAt: new Date().toISOString(), completionReason: reason ?? null,
      });
    },

    async recordGoalCompleted(goalId, baseline) {
      const run = await this.read();
      const completedGoals = [...(run.completedGoals ?? [])];
      // Idempotent: a resumed run must not count the same Goal twice.
      if (!completedGoals.includes(goalId)) completedGoals.push(goalId);
      return this.write({ ...run, completedGoals, migrationAcceptedBaseline: baseline });
    },

    async setCurrentGoal(goalId) {
      const run = await this.read();
      return this.write({ ...run, currentGoal: goalId });
    },

    async clearPause() {
      const run = await this.read();
      return this.write({
        ...run, status: RUN_STATUS.RUNNING, pauseRequested: false, pauseAfterGoal: false, pauseReason: null,
      });
    },
  };
}

/**
 * Decides whether the loop may cross a safe boundary.
 *
 * Called only AT boundaries, never mid-inference: a pause must not interrupt a
 * write or kill a child process.
 */
export function shouldPauseAt(run, { boundary }) {
  if (!run?.pauseRequested) return { pause: false };

  if (run.pauseAfterGoal) {
    // Wait for the whole Goal to finish, which is what makes the tree
    // inspectable when the loop stops.
    if (boundary === 'GOAL_BOUNDARY') {
      return { pause: true, reason: 'PAUSE_REQUESTED_AFTER_GOAL' };
    }
    return { pause: false };
  }

  return { pause: true, reason: 'PAUSE_REQUESTED' };
}
