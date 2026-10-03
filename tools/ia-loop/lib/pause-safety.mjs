/**
 * IA Loop — "is it safe to touch the main checkout now?"
 *
 * `ia-loop:pause` records a request and returns at once; the loop stops at its
 * next safe boundary, which can be an hour away. An operator who wants to
 * commit to main has to know when that boundary has actually been reached —
 * and "the run says PAUSED" is not enough on its own. The incident this
 * answers: an operator committed to main while a Tech Lead criteria-coverage
 * job was still running beside the Developer correction, and the round died
 * as MAIN_CHECKOUT_MUTATED. Nothing had told them a job was still in flight.
 *
 * So the window is judged on every fact that can still write, and only on
 * those that can be read from disk without asking anyone:
 *
 *   the run          not RUNNING (PAUSED, PAUSED_FOR_HUMAN or COMPLETED)
 *   the orchestrator no loop lease: run-auto is gone, not just idle
 *   the jobs         no job lease of any role: nothing is executing
 *   the worktrees    no worktree lease: nobody is writing a Goal's tree
 *   the workers      none WORKING / PUBLISHING / waiting out a capacity limit
 *
 * Leases are the authority, not job statuses: a job's status file can say
 * QUEUED for the whole time its attempt runs, and old Goals leave RUNNING
 * entries behind that nothing will ever finish. A lease exists exactly while
 * an execution holds it, which is the question being asked.
 *
 * A stale lease counts as busy. Expiry is not proof that the holder stopped
 * (see leases.mjs) — and for this question a false "busy" costs a wait, while
 * a false "safe" costs a round.
 *
 * The judgement is pure; the reading and the waiting are separate so both can
 * be tested without a clock or a filesystem.
 */

import { RUN_STATUS, LOOP_LEASE_KEY, createAutonomousStore } from './autonomous-state.mjs';
import { createJobStore } from './job-store.mjs';
import { classifyLease, createLeaseStore } from './leases.mjs';
import { readWorkerHealth, WORKER_HEALTH } from './worker-registry.mjs';

export const SAFE_WINDOW_BLOCKERS = Object.freeze({
  /** The run is still RUNNING and an orchestrator holds the loop. */
  RUN_RUNNING: 'RUN_RUNNING',
  /**
   * RUNNING with nobody holding the loop. Nothing will move it to PAUSED by
   * itself, so waiting cannot end — said separately so the operator is told
   * to look rather than left watching a countdown.
   */
  RUN_RUNNING_WITHOUT_ORCHESTRATOR: 'RUN_RUNNING_WITHOUT_ORCHESTRATOR',
  /** run-auto (or a stale copy of its lease) still holds the loop. */
  ORCHESTRATOR_HOLDS_LOOP: 'ORCHESTRATOR_HOLDS_LOOP',
  /** A job of some role is executing. */
  JOB_LEASE_HELD: 'JOB_LEASE_HELD',
  /** Something is writing a Goal worktree. */
  WORKTREE_LEASE_HELD: 'WORKTREE_LEASE_HELD',
  /** A worker reports it is mid-job, publishing, or waiting to retry one. */
  WORKER_BUSY: 'WORKER_BUSY',
  /**
   * The state could not be read (a lease mid-write past its settle window, a
   * file locked by the OS). Not knowing is never "safe"; the wait goes on.
   */
  STATE_UNREADABLE: 'STATE_UNREADABLE',
});

/** Worker states that mean a job is in this worker's hands. */
const BUSY_WORKER_STATES = Object.freeze(['WORKING', 'PUBLISHING', 'WAITING_FOR_CAPACITY']);

function leaseLabel(lease, now) {
  let status = 'UNKNOWN';
  try {
    status = classifyLease(lease, { now }).status;
  } catch {
    // An unparseable heartbeat is still a lease on disk: busy, and named.
  }
  return status;
}

/**
 * Pure: is the window open, and if not, what is still holding it shut.
 *
 * Every blocker is returned, not just the first: an operator watching the
 * wait should see "1 job lease" disappear and the orchestrator remain, not a
 * single reason that changes underneath them.
 */
export function judgeSafeWindow({
  run = null,
  loopLease = null,
  jobLeases = [],
  worktreeLeases = [],
  workers = [],
  now = Date.now(),
} = {}) {
  const blockers = [];

  if (run?.status === RUN_STATUS.RUNNING) {
    blockers.push(loopLease
      ? {
        code: SAFE_WINDOW_BLOCKERS.RUN_RUNNING,
        detail: `run ${run.autonomousRunId} is RUNNING`
          + `${run.pauseRequested ? ' (pause requested; it stops at the next safe boundary)' : ' (no pause requested)'}`,
      }
      : {
        code: SAFE_WINDOW_BLOCKERS.RUN_RUNNING_WITHOUT_ORCHESTRATOR,
        detail: `run ${run.autonomousRunId} is RUNNING but no orchestrator holds the loop, so nothing will `
          + 'move it to PAUSED by itself — check npm run ia-loop:status',
      });
  }

  if (loopLease) {
    blockers.push({
      code: SAFE_WINDOW_BLOCKERS.ORCHESTRATOR_HOLDS_LOOP,
      detail: `the orchestrator still holds the loop (lease ${leaseLabel(loopLease, now)}, `
        + `owner ${loopLease.workerInstanceId ?? 'unknown'})`,
    });
  }

  for (const lease of jobLeases.filter(Boolean).filter((l) => l.jobId !== LOOP_LEASE_KEY)) {
    blockers.push({
      code: SAFE_WINDOW_BLOCKERS.JOB_LEASE_HELD,
      detail: `job ${lease.jobId} is executing (${lease.agent ?? lease.role ?? 'unknown role'}, `
        + `lease ${leaseLabel(lease, now)})`,
    });
  }

  for (const lease of worktreeLeases.filter(Boolean)) {
    blockers.push({
      code: SAFE_WINDOW_BLOCKERS.WORKTREE_LEASE_HELD,
      detail: `worktree ${lease.worktreePath ?? lease.key} is leased (lease ${leaseLabel(lease, now)})`,
    });
  }

  for (const worker of workers.filter(Boolean)) {
    if (worker.health === WORKER_HEALTH.OFFLINE) continue;
    if (!BUSY_WORKER_STATES.includes(worker.state)) continue;
    blockers.push({
      code: SAFE_WINDOW_BLOCKERS.WORKER_BUSY,
      detail: `${worker.role} worker is ${worker.state}`,
    });
  }

  return Object.freeze({ safe: blockers.length === 0, blockers: Object.freeze(blockers) });
}

/** Reads every fact `judgeSafeWindow` needs from the state directory. */
export async function readSafeWindowFacts(stateDir) {
  const auto = createAutonomousStore(stateDir);
  const store = createJobStore(stateDir);
  const leaseStore = createLeaseStore(stateDir);

  const [run, loopLease, jobLeases, worktreeLeases, techLead, developer] = await Promise.all([
    auto.read(),
    auto.readLoopLease(),
    leaseStore.listJobLeases(),
    leaseStore.listWorktreeLeases(),
    readWorkerHealth(store, 'tech_lead'),
    readWorkerHealth(store, 'developer'),
  ]);

  return { run, loopLease, jobLeases, worktreeLeases, workers: [techLead, developer] };
}

/**
 * Polls until the window is open or the deadline passes.
 *
 * `read`, `sleep` and `now` are injected: the loop is the part worth testing,
 * and it must be testable without waiting.
 *
 * `onProgress` fires only when the set of blockers CHANGES, so a long wait
 * prints a line per real event instead of one per poll.
 */
export async function waitForSafeWindow({
  read,
  timeoutMs,
  pollMs = 10_000,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
  onProgress = () => {},
}) {
  const startedAt = now();
  let lastSignature = null;

  for (;;) {
    let judgement;
    try {
      judgement = judgeSafeWindow({ ...(await read()), now: now() });
    } catch (error) {
      judgement = {
        safe: false,
        blockers: [{
          code: SAFE_WINDOW_BLOCKERS.STATE_UNREADABLE,
          detail: `cannot read the loop state: ${error.code ? `[${error.code}] ` : ''}${error.message}`,
        }],
      };
    }
    const signature = judgement.blockers.map((b) => `${b.code}:${b.detail}`).join('\n');
    if (signature !== lastSignature) {
      lastSignature = signature;
      onProgress(judgement);
    }

    const waitedMs = now() - startedAt;
    if (judgement.safe) return { safe: true, waitedMs, blockers: [] };
    if (waitedMs >= timeoutMs) return { safe: false, waitedMs, blockers: judgement.blockers, timedOut: true };

    await sleep(Math.min(pollMs, Math.max(0, timeoutMs - waitedMs)));
  }
}

/**
 * `90m`, `2h`, `300s`, or a bare number of minutes.
 *
 * Minutes by default because that is the unit an operator thinks in when the
 * thing being waited for is the end of a Goal round.
 */
export function parseDuration(raw) {
  if (raw === undefined || raw === null) return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)?\s*$/i.exec(String(raw));
  if (!match) return null;
  const value = Number(match[1]);
  const unit = (match[2] ?? 'm').toLowerCase();
  const factor = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit];
  const ms = Math.round(value * factor);
  return ms > 0 ? ms : null;
}
