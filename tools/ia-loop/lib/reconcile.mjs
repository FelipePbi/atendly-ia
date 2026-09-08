/**
 * IA Loop — reconcile before dispatch.
 *
 * The rule this file exists to enforce: nothing is dispatched to an agent
 * until the orchestrator has read what is already on disk and worked out what
 * is genuinely left to do.
 *
 * The bug that made it necessary: round selection was derived from job ids
 * recorded in the runtime. Those ids were a hint, and the code treated them as
 * the authority. When the recorded id was missing — a state file written before
 * the field existed — the loop concluded that nothing had been done, minted a
 * fresh random attempt id, found no result under a name that had never existed,
 * and sent Opus to re-implement round 1. Its result was on disk. So was the
 * review of it, with four blockers.
 *
 * The fix is to stop asking "what id did I write down?" and start asking "what
 * is finished?". Completion is derived from the RESULTS, which are the only
 * durable proof that an inference happened. Ids are attempts; results are facts.
 *
 * Two independent layers, on purpose:
 *
 *   the recovery handoff  says where a recovered run should continue
 *   the result store      proves what has already finished
 *
 * The handoff can be missing, stale or corrupt; the results still block a
 * duplicate. That is why the guard does not depend on the handoff at all.
 */

import { SpikeError } from './claude-process.mjs';
import { STAGES, roleForStage, stageKey, stageKeyOfJob } from './stage-identity.mjs';

export const STAGE_STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  IN_FLIGHT: 'IN_FLIGHT',
  NOT_STARTED: 'NOT_STARTED',
});

export const DISPATCH_KINDS = Object.freeze({
  IMPLEMENTATION: 'IMPLEMENTATION',
  CORRECTION: 'CORRECTION',
  REVIEW: 'REVIEW',
  CONSUME_REVIEW: 'CONSUME_REVIEW',
  CLOSE_GOAL: 'CLOSE_GOAL',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
});

/**
 * Builds the picture of what has actually happened for one Goal.
 *
 * @param jobs     [{ role, job, status, result }] every stored job for the Goal
 * @param goal     when given, jobs of any other Goal are not merely irrelevant
 *                 here — they are excluded, so no lookup can reach them. The
 *                 ledger is the authority on what to dispatch, and an authority
 *                 that can see a closed Goal's stages is how one of them became
 *                 the next Goal's first dispatch.
 * @returns Map<stageKey, {status, attempts, completedBy, result, duplicates}>
 */
export function buildStageLedger(jobs, { goal = null } = {}) {
  const ledger = new Map();

  for (const entry of jobs) {
    if (goal && entry.job?.goal !== goal) continue;
    const key = stageKeyOfJob(entry.job);
    if (!key) continue;

    if (!ledger.has(key)) {
      ledger.set(key, {
        stageKey: key,
        goal: entry.job.goal,
        round: Number(entry.job.round),
        role: entry.role,
        status: STAGE_STATUS.NOT_STARTED,
        attempts: [],
        completedBy: null,
        result: null,
        duplicates: [],
      });
    }

    const stage = ledger.get(key);
    stage.attempts.push({
      jobId: entry.job.jobId,
      status: entry.status,
      // The attempt is the thing that can be claimed. A job saying QUEUED
      // while its attempt is INTERRUPTED is not queued at all.
      attemptId: entry.attemptId ?? null,
      attemptStatus: entry.attemptStatus ?? entry.status,
      hasResult: Boolean(entry.result),
    });

    if (entry.result) {
      if (stage.completedBy && stage.completedBy !== entry.job.jobId) {
        // Two successful results for one stage should be impossible. Record it
        // rather than silently picking one.
        stage.duplicates.push(entry.job.jobId);
      } else {
        stage.completedBy = entry.job.jobId;
        stage.result = entry.result;
        stage.status = STAGE_STATUS.COMPLETED;
      }
    }
  }

  // An attempt that is RUNNING or QUEUED at a stage already completed by
  // another attempt is a duplicate, whatever the runtime points at.
  for (const stage of ledger.values()) {
    if (stage.status !== STAGE_STATUS.COMPLETED) {
      // In flight means an ATTEMPT is genuinely waiting or working. Judged
      // on the job status alone, an interrupted attempt looked in flight and
      // the loop waited for something nobody was going to do.
      const live = stage.attempts.find((a) => a.attemptStatus === 'RUNNING' || a.attemptStatus === 'QUEUED');
      if (live) stage.status = STAGE_STATUS.IN_FLIGHT;
      continue;
    }
    for (const attempt of stage.attempts) {
      if (attempt.jobId !== stage.completedBy && !attempt.hasResult
        && (attempt.status === 'RUNNING' || attempt.status === 'QUEUED')) {
        stage.duplicates.push(attempt.jobId);
      }
    }
  }

  return ledger;
}

const get = (ledger, goal, round, stage) => ledger.get(stageKey({ goal, round, stage })) ?? null;

/**
 * The attempt a dispatch should reuse for a stage, if there is one.
 *
 * A live attempt first, then an interrupted one. Interrupted used to be
 * invisible here, so a stage whose only attempt had been cut short got a
 * brand new random id — the same work under two names, which is exactly the
 * confusion the stage ledger exists to remove. The jobId IS the stage's job;
 * what changes between tries is the attempt number.
 */
function reusableAttempt(stage) {
  const attempts = stage?.attempts ?? [];
  const live = attempts.find((a) => a.attemptStatus === 'RUNNING' || a.attemptStatus === 'QUEUED');
  if (live) return live;
  return attempts.find((a) => a.attemptStatus === 'INTERRUPTED') ?? null;
}

/**
 * Does this stage need a new attempt before anything can happen?
 *
 * True when the stage is unfinished and no attempt is actually claimable —
 * including the state that caused the failure this was written for: the job
 * reads QUEUED while the attempt it points at is INTERRUPTED, so a worker
 * considers the job, finds nothing to claim, and waits forever.
 */
export function needsNewAttempt(stage) {
  if (!stage || stage.status === STAGE_STATUS.COMPLETED) return false;
  const attempts = stage.attempts ?? [];
  if (attempts.length === 0) return false;
  return !attempts.some((a) => a.attemptStatus === 'RUNNING' || a.attemptStatus === 'QUEUED');
}

/**
 * Works out the one thing that should happen next.
 *
 * Reads only from the ledger — never from currentJobId, which is a pointer that
 * a crash can leave aimed at a job that should not exist.
 */
export function decideNextDispatch({ ledger, goal, maxRounds = 3 }) {
  const rounds = [...ledger.values()].map((s) => s.round);
  const highest = rounds.length > 0 ? Math.max(...rounds) : 1;

  for (let round = 1; round <= highest; round += 1) {
    const implementation = get(ledger, goal, round, round === 1 ? STAGES.IMPLEMENTATION : STAGES.CORRECTION);
    const review = get(ledger, goal, round, STAGES.REVIEW);

    // The work of the round has not finished: that is what to do.
    if (!implementation || implementation.status !== STAGE_STATUS.COMPLETED) {
      const stage = round === 1 ? STAGES.IMPLEMENTATION : STAGES.CORRECTION;
      return {
        kind: round === 1 ? DISPATCH_KINDS.IMPLEMENTATION : DISPATCH_KINDS.CORRECTION,
        goal, round, stage, role: roleForStage(stage),
        stageKey: stageKey({ goal, round, stage }),
        resumeAttempt: reusableAttempt(implementation)?.jobId ?? null,
        resumeAttemptStatus: reusableAttempt(implementation)?.attemptStatus ?? null,
        needsNewAttempt: needsNewAttempt(implementation),
      };
    }

    // Implemented but not reviewed.
    if (!review || review.status !== STAGE_STATUS.COMPLETED) {
      return {
        kind: DISPATCH_KINDS.REVIEW,
        goal, round, stage: STAGES.REVIEW, role: 'tech_lead',
        stageKey: stageKey({ goal, round, stage: STAGES.REVIEW }),
        implementationJobId: implementation.completedBy,
        resumeAttempt: reusableAttempt(review)?.jobId ?? null,
        resumeAttemptStatus: reusableAttempt(review)?.attemptStatus ?? null,
        needsNewAttempt: needsNewAttempt(review),
      };
    }

    // Reviewed. The decision decides where the Goal goes, and it is READ, never
    // asked for again.
    const decision = review.result?.decision;

    if (decision === 'ACCEPTED') {
      return {
        kind: DISPATCH_KINDS.CLOSE_GOAL, goal, round,
        reviewJobId: review.completedBy, decision,
      };
    }

    if (decision === 'CHANGES_REQUIRED') {
      const blockers = review.result?.blockers ?? [];
      const nextRound = round + 1;

      // Is the correction of the next round already done? The loop continues
      // there; otherwise this is where it goes.
      const nextCorrection = get(ledger, goal, nextRound, STAGES.CORRECTION);
      if (!nextCorrection || nextCorrection.status !== STAGE_STATUS.COMPLETED) {
        if (nextRound > maxRounds) {
          return {
            kind: DISPATCH_KINDS.HUMAN_REQUIRED, goal, round,
            reason: 'MAX_CORRECTION_ROUNDS_REACHED',
            detail: `Round ${round} asked for changes and the round budget is ${maxRounds}.`,
          };
        }
        return {
          kind: DISPATCH_KINDS.CORRECTION,
          goal, round: nextRound, stage: STAGES.CORRECTION, role: 'developer',
          stageKey: stageKey({ goal, round: nextRound, stage: STAGES.CORRECTION }),
          // Carried from the review that produced them. Never rediscovered.
          blockers,
          fromReviewJobId: review.completedBy,
          resumeAttempt: reusableAttempt(nextCorrection)?.jobId ?? null,
          resumeAttemptStatus: reusableAttempt(nextCorrection)?.attemptStatus ?? null,
          needsNewAttempt: needsNewAttempt(nextCorrection),
        };
      }
      continue;
    }

    if (decision === 'HUMAN_REQUIRED') {
      return {
        kind: DISPATCH_KINDS.HUMAN_REQUIRED, goal, round,
        reason: 'REVIEWER_ASKED_FOR_HUMAN', reviewJobId: review.completedBy,
      };
    }

    return {
      kind: DISPATCH_KINDS.HUMAN_REQUIRED, goal, round,
      reason: 'AGENT_CONTRACT_ERROR',
      detail: `The review of round ${round} carries no usable decision (${JSON.stringify(decision)}).`,
    };
  }

  // Nothing recorded at all: the Goal starts at the beginning.
  return {
    kind: DISPATCH_KINDS.IMPLEMENTATION,
    goal, round: 1, stage: STAGES.IMPLEMENTATION, role: 'developer',
    stageKey: stageKey({ goal, round: 1, stage: STAGES.IMPLEMENTATION }),
    resumeAttempt: null,
  };
}

/**
 * The guard. Fails closed immediately before a job would be published.
 *
 * This is the invariant that the duplicate R1 violated: a stage with a
 * successful result is finished, and no restart, recovery, attach, capacity
 * resume, missing pointer or freshly minted id makes another attempt at it
 * legitimate.
 */
export function assertNoDuplicateStageDispatch({ ledger, goal, round, stage, jobId }) {
  const key = stageKey({ goal, round, stage });
  const recorded = ledger.get(key);
  if (!recorded || recorded.status !== STAGE_STATUS.COMPLETED) return true;

  // Re-publishing the SAME attempt that produced the result is not a duplicate;
  // it is idempotence, and the runner reuses the result rather than the model.
  if (jobId && jobId === recorded.completedBy) return true;

  throw new SpikeError(
    'DUPLICATE_COMPLETED_STAGE_DISPATCH',
    `Refusing to dispatch ${key}: it already completed as ${recorded.completedBy}. `
    + `Publishing ${jobId ?? 'a new attempt'} would pay for an inference that is already on disk.`,
    { stageKey: key, completedBy: recorded.completedBy, attempted: jobId ?? null },
  );
}

/**
 * Reads every job and result for a Goal and reconciles them.
 *
 * Called after attach, after recovery, after a restart, and before any
 * dispatch — never "publish first and deduplicate later".
 */
export async function reconcileExecutionState({ store, goal, maxRounds = 3 }) {
  if (!goal) throw new SpikeError('INVALID_ARGS', 'reconcileExecutionState needs a goal');

  const entries = [];
  for (const role of ['developer', 'tech_lead']) {
    // listJobs returns file names; the id is the name without its extension.
    const jobIds = (await store.listJobs(role)).map((name) => name.replace(/\.json$/, ''));
    for (const jobId of jobIds) {
      const job = await store.readJob(role, jobId).catch(() => null);
      if (!job || job.goal !== goal) continue;

      const status = await store.readJobStatus(role, jobId).catch(() => null);
      const envelope = (await store.hasCompletedResult(role, jobId))
        ? await store.readResult(role, jobId)
        : null;

      const attemptState = await store.readAttemptState(role, jobId).catch(() => null);
      entries.push({
        role, job, status,
        attemptId: attemptState?.attemptId ?? null,
        attemptStatus: attemptState?.attemptStatus ?? status,
        result: envelope?.result ?? envelope ?? null,
      });
    }
  }

  // Scoped twice, on purpose: the read above skips other Goals' jobs, and the
  // ledger refuses to hold one even if a future caller hands it some. Every
  // stage key here begins with this Goal.
  const ledger = buildStageLedger(entries, { goal });
  const next = decideNextDispatch({ ledger, goal, maxRounds });

  // Attempts that should never have been created, so a caller can record them
  // as superseded instead of leaving them looking live.
  const duplicates = [...ledger.values()].flatMap((s) => s.duplicates.map((jobId) => ({
    jobId, stageKey: s.stageKey, completedBy: s.completedBy,
  })));

  return { ledger, next, duplicates };
}
