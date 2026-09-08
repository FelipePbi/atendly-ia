/**
 * IA Loop — local file protocol between the orchestrator and the workers.
 *
 * Fable never writes into Opus's stdin, nor the reverse. Every hand-off goes
 * through the orchestrator and lands here as a validated, durable record. That
 * is what makes the loop auditable.
 *
 * Layout under tools/ia-loop/.state (git-ignored):
 *
 *   runtime.json        current run snapshot
 *   current-goal.json   discovered Goal snapshot
 *   events.jsonl        append-only event log
 *   workers/<role>.json worker heartbeat
 *   jobs/<role>/<id>.json      queued jobs
 *   results/<role>/<id>.json   published results
 *
 * All writes are atomic (temp file + rename), so a crash mid-write can never
 * leave a partially readable job. Corrupt files are refused, never zeroed.
 */

import { mkdir, open, readFile, readdir, rename, rm, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { SpikeError } from './claude-process.mjs';
import { ROLES } from './contracts-v2.mjs';

export const STORE_VERSION = 1;

/** Lifecycle of a single job, persisted alongside it. */
export const JOB_STATUSES = Object.freeze([
  'QUEUED', 'RUNNING', 'WAITING_FOR_CAPACITY', 'INTERRUPTED', 'COMPLETED', 'FAILED', 'SUPERSEDED',
]);

/**
 * Terminal statuses. A job that reached one of these is never picked up again
 * by a restarting worker: retrying it would repeat work or, worse, re-run a
 * failed inference that a human has not looked at yet. Only an explicit
 * transition may create a NEW jobId for a retry or a correction round.
 */
export const TERMINAL_JOB_STATUSES = Object.freeze(['COMPLETED', 'FAILED', 'SUPERSEDED']);

export function isTerminalJobStatus(status) {
  return TERMINAL_JOB_STATUSES.includes(status);
}

/**
 * INTERRUPTED: the attempt was cut short by something outside the job — a
 * crash, a closed terminal, a reboot — and produced no result.
 *
 * It is deliberately NOT FAILED. FAILED means the work was attempted and did
 * not succeed, and a human looks at those; INTERRUPTED means nothing was
 * learned, and the same job may legitimately run again. Collapsing the two
 * would either hide real failures or silently re-run them.
 *
 * A worker never picks one up on its own: whether an interrupted job is
 * re-queued, superseded, or consumed from a result that did land is the
 * orchestrator's decision, made once and in the open.
 */
export const NON_CLAIMABLE_JOB_STATUSES = Object.freeze([...TERMINAL_JOB_STATUSES, 'INTERRUPTED']);


/**
 * How a dispatch resolved against what was already on disk.
 *
 * publishJob refuses to overwrite an existing job, which is right — it is what
 * stops an accidental second write to a job someone else owns. But the runner
 * called it even when it had DELIBERATELY chosen to reuse an existing job id,
 * so every resume of a stage whose job existed died with DUPLICATE_JOB. The
 * two halves disagreed about who owns the job's existence.
 */
export const JOB_DISPATCH = Object.freeze({
  PUBLISHED: 'PUBLISHED',
  ALREADY_QUEUED: 'ALREADY_QUEUED',
  ALREADY_RUNNING: 'ALREADY_RUNNING',
  NEW_ATTEMPT: 'NEW_ATTEMPT',
  ALREADY_COMPLETED: 'ALREADY_COMPLETED',
});

/**
 * Statuses a job may legitimately be attempted again from.
 *
 * INTERRUPTED only. FAILED is deliberately absent: the work was attempted and
 * did not succeed, and whether to try again is a policy decision a person
 * makes — not something a restart assumes.
 */
export const RETRYABLE_JOB_STATUSES = Object.freeze(['INTERRUPTED']);

/**
 * The id of one attempt at a job.
 *
 * The job names the logical stage; the attempt names one try at it. Keeping
 * them apart is what lets an interrupted try be superseded by a successor
 * instead of by a second job under a different random name.
 */
export function attemptIdOf(jobId, attempt) {
  return `${jobId}-a${attempt}`;
}

/**
 * A state no job should ever be in.
 *
 * The job says QUEUED — so a worker considers it — while the attempt it points
 * at is INTERRUPTED, so nothing is actually waiting to be picked up. Recovery
 * produced exactly this by requeuing the logical job without materialising the
 * next attempt, and the Developer sat IDLE against a job that looked ready.
 */
export function isInconsistentAttemptState(envelope) {
  if (!envelope) return false;
  const attemptStatus = envelope.attemptStatus ?? null;
  if (!attemptStatus) return false;
  return (envelope.status === 'QUEUED' || envelope.status === 'RUNNING')
    && (attemptStatus === 'INTERRUPTED' || attemptStatus === 'SUPERSEDED');
}
export function isClaimableJobStatus(status) {
  return status === null || status === undefined || !NON_CLAIMABLE_JOB_STATUSES.includes(status);
}

function fail(code, message, details = {}) {
  throw new SpikeError(code, message, details);
}

function assertRole(role) {
  if (!ROLES.includes(role)) {
    fail('UNKNOWN_ROLE', `Unknown role ${JSON.stringify(role)} (expected one of: ${ROLES.join(', ')})`);
  }
  return role;
}

/** Atomic write: a reader sees either the old file or the complete new one. */
export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, path);
}

/** Reads JSON, distinguishing "absent" from "corrupt". */
export async function readJson(path, { required = false } = {}) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      if (required) fail('FILE_MISSING', `Expected file not found: ${path}`);
      return null;
    }
    fail('FILE_UNREADABLE', `Cannot read ${path}: ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    // Deliberately not repaired or reset: silently zeroing state would hide
    // the very failure the operator needs to see.
    fail('FILE_CORRUPT', `${path} is not valid JSON: ${error.message}`);
  }
}

/**
 * Runtime fields that describe ONE Goal's execution.
 *
 * They must never cross a Goal boundary. Before V7 nothing crossed one
 * automatically, so inheriting them was harmless; the moment the loop started
 * the next Goal by itself, a leftover `round: 2` from the previous Goal turned
 * the first implementation round of the new Goal into a correction round with
 * no blockers, which is not even a valid job.
 *
 * The list is explicit rather than a filter, so adding a per-Goal field is a
 * decision someone makes here instead of a bug found in production.
 */
export const PER_GOAL_RUNTIME_FIELDS = Object.freeze([
  'round', 'blockers', 'decision', 'currentJobId', 'escalationReason', 'roundsRun',
  'goalExecuted', 'goalCommitted', 'migrationBaselineUpdated', 'nextGoalCreated',
  'closure', 'goalClosed', 'nextGoalExecuted', 'humanRequired', 'jobIdsByRound',
  'policyViolations', 'deferredNextAction',
  // The previous Goal's implementation report must never reach the next Goal's
  // reviewer: it would describe work that is not in the tree under review.
  'lastImplementationReport',
  // A capacity block belongs to the execution that was blocked.
  'capacity', 'blockedAgent', 'blockedJobId', 'resumeFrom', 'capacityClearedAt',
  // The attempt, the review and the correction are one Goal's, and so is a
  // recovery continuation: "resume what was interrupted" is meaningless once
  // the Goal that was interrupted has been closed.
  'currentAttemptId', 'currentDeveloperJobId', 'currentReviewJobId',
  'reviewDecision', 'correction', 'acceptedSnapshot', 'recovery',
]);

/** Returns the runtime with every per-Goal field dropped. */
export function clearPerGoalRuntime(runtime) {
  if (!runtime) return {};
  const next = { ...runtime };
  for (const field of PER_GOAL_RUNTIME_FIELDS) delete next[field];
  return next;
}

export function createJobStore(stateDir) {
  const paths = {
    root: stateDir,
    runtime: join(stateDir, 'runtime.json'),
    currentGoal: join(stateDir, 'current-goal.json'),
    goalExecution: (goalId) => join(stateDir, 'goal-executions', `${goalId}.json`),
    events: join(stateDir, 'events.jsonl'),
    worker: (role) => join(stateDir, 'workers', `${assertRole(role)}.json`),
    jobsDir: (role) => join(stateDir, 'jobs', assertRole(role)),
    job: (role, jobId) => join(stateDir, 'jobs', assertRole(role), `${jobId}.json`),
    resultsDir: (role) => join(stateDir, 'results', assertRole(role)),
    result: (role, jobId) => join(stateDir, 'results', assertRole(role), `${jobId}.json`),
  };

  return {
    paths,

    /**
     * Marks where a job is in its lifecycle. Combined with a result persisted
     * per jobId, this is what makes a retry safe: a job that already COMPLETED
     * is never re-sent to a model.
     */
    /**
     * The job's status IS the current attempt's status. They are written
     * together because letting them drift is what produced a job that said
     * QUEUED while the attempt it pointed at was INTERRUPTED.
     */
    async setJobStatus(role, jobId, status) {
      if (!JOB_STATUSES.includes(status)) {
        fail('INVALID_JOB_STATUS', `Unknown job status ${JSON.stringify(status)}`);
      }
      const path = paths.job(role, jobId);
      const envelope = await readJson(path, { required: true });
      const attempt = Number.isInteger(envelope.attempt) && envelope.attempt >= 1 ? envelope.attempt : 1;
      await writeJsonAtomic(path, {
        ...envelope,
        status,
        // Written together, always. A job whose status said QUEUED while the
        // attempt it pointed at was INTERRUPTED is what left a worker waiting
        // forever on something that was never claimable.
        attempt,
        currentAttemptId: envelope.currentAttemptId ?? attemptIdOf(jobId, attempt),
        attemptStatus: status,
        statusAt: new Date().toISOString(),
      });
      return status;
    },

    /**
     * Which attempt of this job is current.
     *
     * The worker used to hardcode 1, so a second attempt at an interrupted
     * stage would have worn the first attempt's id and result fencing could not
     * have told the two apart.
     */
    async readJobAttempt(role, jobId) {
      const envelope = await readJson(paths.job(role, jobId));
      const attempt = envelope?.attempt;
      return Number.isInteger(attempt) && attempt >= 1 ? attempt : 1;
    },

    async readJobStatus(role, jobId) {
      const envelope = await readJson(paths.job(role, jobId));
      return envelope?.status ?? null;
    },

    /**
     * Whether a worker may pick this job up.
     *
     * History is preserved: a terminal job keeps its file and its result, it is
     * simply no longer eligible for execution.
     */
    async isJobClaimable(role, jobId) {
      return isClaimableJobStatus(await this.readJobStatus(role, jobId));
    },

    /**
     * True when a successful result is already on disk for this job.
     *
     * Guards the dangerous window: retry fires, the model answers, the process
     * dies before the state is advanced, and the restart would otherwise call
     * the model again for work that is already done.
     */
    async hasCompletedResult(role, jobId) {
      const envelope = await readJson(paths.result(role, jobId));
      return envelope?.result?.ok === true;
    },

    newJobId(goal, round, role) {
      return `${goal}-r${round}-${role}-${randomUUID().slice(0, 8)}`;
    },

    /** Append-only event log. Never rewritten, so history cannot be lost. */
    async appendEvent(event) {
      if (!event?.type) fail('INVALID_EVENT', 'Event must carry a "type"');
      await mkdir(stateDir, { recursive: true });
      const record = { at: new Date().toISOString(), ...event };
      await appendFile(paths.events, `${JSON.stringify(record)}\n`, 'utf8');
      return record;
    },

    async readEvents() {
      let raw;
      try {
        raw = await readFile(paths.events, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        fail('FILE_UNREADABLE', `Cannot read ${paths.events}: ${error.message}`);
      }
      return raw
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line, index) => {
          try {
            return JSON.parse(line);
          } catch (error) {
            fail('EVENT_LOG_CORRUPT', `Event log line ${index + 1} is not valid JSON: ${error.message}`);
          }
          return null;
        });
    },

    /**
     * Publishes a job for one role.
     *
     * The job must already be contract-validated by the caller; this layer
     * enforces addressing and uniqueness only.
     */
    async publishJob(role, job) {
      assertRole(role);
      if (!job?.jobId) fail('INVALID_JOB', 'Job must carry a jobId');
      if (job.role !== role) {
        fail('ROLE_MISMATCH', `Job targets role ${JSON.stringify(job.role)} but was published to "${role}"`);
      }
      if (!job.goal) fail('INVALID_JOB', 'Job must carry a goal');

      const path = paths.job(role, job.jobId);
      const existing = await readJson(path);
      if (existing) {
        fail('DUPLICATE_JOB', `Job ${job.jobId} already exists for role "${role}"`);
      }

      await writeJsonAtomic(path, {
        storeVersion: STORE_VERSION,
        publishedAt: new Date().toISOString(),
        status: 'QUEUED',
        attempt: 1,
        currentAttemptId: attemptIdOf(job.jobId, 1),
        attemptStatus: 'QUEUED',
        attemptHistory: [],
        job,
      });
      return path;
    },


    /**
     * Dispatches a job, whether or not it already exists.
     *
     * One logical stage, many attempts. The jobId stays the same — it IS the
     * stage's job — and an interrupted attempt is superseded by a numbered
     * successor rather than by a second job with a different random name.
     * Creating a new id would mean the same work under two names, which is the
     * confusion the stage ledger exists to remove.
     *
     * Refuses everything the guards refuse: a completed stage, a job that
     * failed and has not been looked at, an attempt that is genuinely running.
     */
    async dispatchJob(role, job, { reason = null } = {}) {
      assertRole(role);
      if (!job?.jobId) fail('INVALID_JOB', 'Job must carry a jobId');

      const path = paths.job(role, job.jobId);
      const existing = await readJson(path);

      if (!existing) {
        await this.publishJob(role, job);
        return { outcome: JOB_DISPATCH.PUBLISHED, attempt: 1, jobId: job.jobId };
      }

      // The id names a job that already exists — but of WHICH Goal? A pointer
      // inherited across a Goal boundary looks exactly like a resume from here,
      // and reusing the record would have started a "next attempt" at Goal
      // 004's superseded round 1 while executing Goal 005. The stored job is
      // the authority on what it is; a disagreement is a harness bug, not a
      // retry.
      if (existing.job && existing.job.goal !== job.goal) {
        fail('CROSS_GOAL_STATE_LEAK',
          `Job ${job.jobId} on disk belongs to Goal ${existing.job.goal}, but it was dispatched for Goal ${job.goal}. `
          + 'An attempt from a closed Goal is history; it is never the next attempt of another one.',
          { jobId: job.jobId, storedGoal: existing.job.goal, dispatchedGoal: job.goal, role });
      }

      if (await this.hasCompletedResult(role, job.jobId)) {
        return { outcome: JOB_DISPATCH.ALREADY_COMPLETED, attempt: existing.attempt ?? 1, jobId: job.jobId };
      }

      // The ATTEMPT decides, not the job-level status. A job that says QUEUED
      // while the attempt it points at is INTERRUPTED is not queued at all —
      // nothing is waiting to be claimed — and reading that as ALREADY_QUEUED
      // is what left a worker IDLE forever against work it was meant to do.
      const state = await this.readAttemptState(role, job.jobId);
      const attemptStatus = state?.attemptStatus ?? existing.status ?? null;

      if (attemptStatus === 'RUNNING') {
        // Whether that attempt is really alive is the lease's question, not
        // this one's. Dispatch simply does not create a second attempt beside
        // one that still looks live.
        return {
          outcome: JOB_DISPATCH.ALREADY_RUNNING,
          attempt: state?.attempt ?? 1, attemptId: state?.attemptId ?? null, jobId: job.jobId,
        };
      }
      if (attemptStatus === 'QUEUED') {
        return {
          outcome: JOB_DISPATCH.ALREADY_QUEUED,
          attempt: state?.attempt ?? 1, attemptId: state?.attemptId ?? null, jobId: job.jobId,
        };
      }

      // One implementation of "make the next attempt", shared with recovery.
      const started = await this.startNextAttempt(role, job.jobId, { reason });
      if (started.created) {
        return {
          outcome: JOB_DISPATCH.NEW_ATTEMPT,
          attempt: started.attempt, attemptId: started.attemptId,
          previousAttemptId: started.previousAttemptId, jobId: job.jobId,
        };
      }
      return {
        outcome: started.reason === 'ATTEMPT_RUNNING'
          ? JOB_DISPATCH.ALREADY_RUNNING : JOB_DISPATCH.ALREADY_QUEUED,
        attempt: started.attempt ?? 1, attemptId: started.attemptId ?? null,
        jobId: job.jobId, raced: true,
      };
    },


    /**
     * Reads the attempt the job currently points at.
     *
     * A job written before attempts were modelled reports attempt 1 with its
     * own status, which is what it effectively was.
     */
    async readAttemptState(role, jobId) {
      const envelope = await readJson(paths.job(role, jobId));
      if (!envelope) return null;
      const attempt = Number.isInteger(envelope.attempt) && envelope.attempt >= 1 ? envelope.attempt : 1;
      return {
        attempt,
        attemptId: envelope.currentAttemptId ?? attemptIdOf(jobId, attempt),
        attemptStatus: envelope.attemptStatus ?? envelope.status ?? null,
        status: envelope.status ?? null,
        history: envelope.attemptHistory ?? [],
        inconsistent: isInconsistentAttemptState(envelope),
      };
    },

    /**
     * Materialises the next attempt at a job.
     *
     * This is what "requeue" actually means, and conflating the two is the bug
     * it was written for: recovery set the job back to QUEUED while it still
     * pointed at the interrupted attempt, so there was nothing new for a worker
     * to claim and the Developer waited forever against a job that looked ready.
     *
     * Requeuing a logical job and creating its next attempt are different acts.
     * Only this one produces something claimable.
     */
    async startNextAttempt(role, jobId, { reason = null } = {}) {
      assertRole(role);
      const path = paths.job(role, jobId);

      if (await this.hasCompletedResult(role, jobId)) {
        return { created: false, reason: 'STAGE_ALREADY_COMPLETED' };
      }

      // Exactly one new attempt, even if two recoveries race. The loser rereads
      // and finds the attempt the winner made, rather than adding a third.
      const marker = `${path}.attempt`;
      let handle;
      try {
        handle = await open(marker, 'wx');
      } catch (error) {
        if (error.code === 'EEXIST') {
          const settled = await this.readAttemptState(role, jobId);
          return { created: false, reason: 'ATTEMPT_IN_PROGRESS', ...settled };
        }
        fail('FILE_UNREADABLE', `Cannot start the next attempt for ${jobId}: ${error.message}`);
      }

      try {
        const current = await readJson(path);
        if (!current) fail('UNKNOWN_JOB', `Job ${jobId} does not exist for role "${role}"`);

        const attempt = Number.isInteger(current.attempt) && current.attempt >= 1 ? current.attempt : 1;
        const attemptStatus = current.attemptStatus ?? current.status ?? null;
        const attemptId = current.currentAttemptId ?? attemptIdOf(jobId, attempt);

        // Already claimable, and genuinely so: nothing to do.
        if (attemptStatus === 'QUEUED' || attemptStatus === 'RUNNING') {
          return {
            created: false, reason: attemptStatus === 'RUNNING' ? 'ATTEMPT_RUNNING' : 'ATTEMPT_ALREADY_QUEUED',
            attempt, attemptId, attemptStatus,
          };
        }

        if (!RETRYABLE_JOB_STATUSES.includes(attemptStatus)) {
          fail('STAGE_NOT_RETRYABLE',
            `Attempt ${attemptId} is ${attemptStatus}; a new attempt is not something a restart may assume.`,
            { jobId, attemptId, attemptStatus });
        }

        const next = attempt + 1;
        const nextAttemptId = attemptIdOf(jobId, next);
        await writeJsonAtomic(path, {
          ...current,
          status: 'QUEUED',
          attempt: next,
          currentAttemptId: nextAttemptId,
          attemptStatus: 'QUEUED',
          // Appended, never rewritten: the interrupted attempt stays in the
          // record as what it was.
          attemptHistory: [
            ...(current.attemptHistory ?? []),
            { attempt, attemptId, status: attemptStatus, reason: reason ?? null, endedAt: new Date().toISOString() },
          ],
          requeuedAt: new Date().toISOString(),
          job: current.job,
        });

        return { created: true, attempt: next, attemptId: nextAttemptId, previousAttemptId: attemptId };
      } finally {
        await handle.close();
        await rm(marker, { force: true });
      }
    },

    /** Lists pending job ids for a role, oldest first by name. */
    async listJobs(role) {
      assertRole(role);
      try {
        const entries = await readdir(paths.jobsDir(role));
        return entries.filter((n) => n.endsWith('.json')).sort();
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        fail('FILE_UNREADABLE', `Cannot list jobs for "${role}": ${error.message}`);
      }
      return [];
    },

    async readJob(role, jobId) {
      const envelope = await readJson(paths.job(role, jobId), { required: true });
      if (envelope.storeVersion !== STORE_VERSION) {
        fail('STORE_VERSION_MISMATCH', `Job ${jobId} has store version ${envelope.storeVersion}, expected ${STORE_VERSION}`);
      }
      return envelope.job;
    },

    /**
     * Publishes a result, fenced by attempt.
     *
     * A late result from a superseded attempt is kept for audit under a
     * distinct name and never overwrites the authorised one.
     */
    async publishResult(role, jobId, result, { attemptId = null, expectedAttemptId = null } = {}) {
      assertRole(role);

      if (expectedAttemptId && attemptId && attemptId !== expectedAttemptId) {
        const stalePath = join(stateDir, 'results', role, `${jobId}.stale-${attemptId}.json`);
        await writeJsonAtomic(stalePath, {
          storeVersion: STORE_VERSION, publishedAt: new Date().toISOString(),
          staleAttemptId: attemptId, expectedAttemptId, result,
        });
        fail('STALE_ATTEMPT_RESULT',
          `Result from attempt ${attemptId} rejected; ${expectedAttemptId} is the authorised attempt`);
      }
      if (attemptId) result = { ...result, attemptId };
      await writeJsonAtomic(paths.result(role, jobId), {
        storeVersion: STORE_VERSION,
        publishedAt: new Date().toISOString(),
        result,
      });
    },

    async readResult(role, jobId) {
      const envelope = await readJson(paths.result(role, jobId));
      return envelope?.result ?? null;
    },

    async writeRuntime(snapshot) {
      // updatedAt goes AFTER the spread: every caller merges the previous
      // runtime, which carries its own updatedAt, so a leading field would be
      // overwritten by the old timestamp and the status of an unattended loop
      // would always look stale.
      await writeJsonAtomic(paths.runtime, { storeVersion: STORE_VERSION, ...snapshot, updatedAt: new Date().toISOString() });
    },

    readRuntime() {
      return readJson(paths.runtime);
    },

    /**
     * Files a finished Goal's execution state away, once.
     *
     * Archiving is what makes the boundary safe to cross: after this, nothing
     * of that Goal is "current" any more, and the record of what it did is
     * still readable. It never overwrites — a second crossing of the same
     * boundary after a restart must not rewrite history with whatever the
     * runtime happens to hold now.
     */
    async archiveGoalExecution(runtime) {
      const goalId = runtime?.goal;
      if (!goalId) return { archived: false, reason: 'NO_GOAL_EXECUTION' };

      const path = paths.goalExecution(goalId);
      if (await readJson(path)) return { archived: false, reason: 'ALREADY_ARCHIVED', path };

      await writeJsonAtomic(path, {
        storeVersion: STORE_VERSION, archivedAt: new Date().toISOString(), goal: goalId, execution: runtime,
      });
      return { archived: true, path };
    },

    async readArchivedGoalExecution(goalId) {
      const envelope = await readJson(paths.goalExecution(goalId));
      return envelope?.execution ?? null;
    },

    async writeCurrentGoal(goal) {
      await writeJsonAtomic(paths.currentGoal, { storeVersion: STORE_VERSION, updatedAt: new Date().toISOString(), goal });
    },

    async readCurrentGoal() {
      const envelope = await readJson(paths.currentGoal);
      return envelope?.goal ?? null;
    },
  };
}
