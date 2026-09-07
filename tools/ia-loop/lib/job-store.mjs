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

      await writeJsonAtomic(path, { storeVersion: STORE_VERSION, publishedAt: new Date().toISOString(), job });
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

    async publishResult(role, jobId, result) {
      assertRole(role);
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
      await writeJsonAtomic(paths.runtime, { storeVersion: STORE_VERSION, updatedAt: new Date().toISOString(), ...snapshot });
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
