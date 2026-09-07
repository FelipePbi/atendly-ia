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

import { mkdir, readFile, readdir, rename, writeFile, appendFile } from 'node:fs/promises';
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
    async setJobStatus(role, jobId, status) {
      if (!JOB_STATUSES.includes(status)) {
        fail('INVALID_JOB_STATUS', `Unknown job status ${JSON.stringify(status)}`);
      }
      const path = paths.job(role, jobId);
      const envelope = await readJson(path, { required: true });
      await writeJsonAtomic(path, { ...envelope, status, statusAt: new Date().toISOString() });
      return status;
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
        job,
      });
      return path;
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

    async writeCurrentGoal(goal) {
      await writeJsonAtomic(paths.currentGoal, { storeVersion: STORE_VERSION, updatedAt: new Date().toISOString(), goal });
    },

    async readCurrentGoal() {
      const envelope = await readJson(paths.currentGoal);
      return envelope?.goal ?? null;
    },
  };
}
