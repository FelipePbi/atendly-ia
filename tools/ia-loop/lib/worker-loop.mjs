/**
 * IA Loop — shared worker plumbing.
 *
 * The two workers share transport, heartbeat and the job polling loop. They do
 * NOT share session lifecycle: that difference lives in each worker and is the
 * whole point of the hybrid architecture.
 */

import { mkdir } from 'node:fs/promises';

import { startHeartbeat } from './worker-registry.mjs';
import {
  attemptIdFor,
  canStartNewAttempt,
  createLeaseStore,
  startLeaseHeartbeat,
  workerInstanceId,
} from './leases.mjs';
import { isClaimableJobStatus } from './job-store.mjs';

/** Moderate polling. No file watcher needed at this cadence, no busy loop. */
export const POLL_INTERVAL_MS = 1_000;

export function banner({ title, model, sessionLine, extra = [] }) {
  return [
    '',
    `ATENDLY IA LOOP — ${title}`,
    '',
    `Model: ${model}`,
    ...extra,
    sessionLine,
    'State: IDLE',
    '',
  ].join('\n');
}

export function log(tag, message = '') {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`${time} [${tag}]${message ? ` ${message}` : ''}`);
}

// Deliberately NOT unref'd: this timer is what keeps the worker process alive
// between polls. The heartbeat timer is unref'd precisely because it must not
// be the thing holding the process open.
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Runs the worker until the process is asked to stop.
 *
 * `handleJob(job)` is called for each queued job; the worker returns to IDLE
 * afterwards regardless of the outcome, so one bad job never wedges the loop.
 */
export async function runWorkerLoop({
  store,
  role,
  getStatus,
  handleJob,
  pollIntervalMs = POLL_INTERVAL_MS,
  leaseStore = createLeaseStore(store.paths.root),
}) {
  await mkdir(store.paths.jobsDir(role), { recursive: true });
  log('WORKER', `instance ${workerInstanceId()}`);

  const stopHeartbeat = startHeartbeat(store, role, getStatus);
  let running = true;

  const shutdown = async (signal) => {
    if (!running) return;
    running = false;
    log('STOPPING', `signal ${signal}`);
    await stopHeartbeat();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  const seen = new Set();

  while (running) {
    let files = [];
    try {
      files = await store.listJobs(role);
    } catch (error) {
      log('ERROR', `cannot list jobs: ${error.message}`);
    }

    // Seen is keyed by ATTEMPT, not by job. Keyed by job, a skip was
    // permanent: a job refused once because an orphaned lease made it
    // unclaimable was never looked at again, so the attempt recovery later
    // materialised for it was never picked up, and the worker stayed IDLE
    // against work that was waiting for it.
    for (const file of files) {
      const jobId = file.replace(/\.json$/, '');
      const attemptNumber = await store.readJobAttempt(role, jobId);
      const seenKey = `${jobId}#a${attemptNumber}`;
      if (seen.has(seenKey)) continue;
      let claimed = null;
      let stopLeaseHeartbeat = null;
      try {
        // A job that already reached a terminal status is never re-run. Before
        // this check, a restart re-executed a FAILED job and spent a second
        // inference on work a human had not yet looked at. Only an explicit
        // transition may create a NEW jobId for a retry or correction round.
        if (!(await store.isJobClaimable(role, jobId))) {
          const status = await store.readJobStatus(role, jobId);
          // Terminal for this attempt: remembering it is correct.
          seen.add(seenKey);
          log('SKIP', `${jobId} is ${status}`);
          continue;
        }

        // A job whose CURRENT ATTEMPT is not itself claimable is not ready,
        // whatever the job-level status says. Not remembered: the next
        // attempt is exactly what this worker is waiting for.
        const attemptState = await store.readAttemptState(role, jobId);
        if (attemptState && !isClaimableJobStatus(attemptState.attemptStatus)) {
          log('SKIP', `${attemptState.attemptId} is ${attemptState.attemptStatus}`);
          continue;
        }

        const job = await store.readJob(role, jobId);

        // Ownership, decided by the filesystem rather than by a check.
        const existing = await leaseStore.readJobLease(jobId);
        const verdict = canStartNewAttempt({
          lease: existing,
          jobStatus: await store.readJobStatus(role, jobId),
        });
        if (!verdict.allowed) {
          log('SKIP', `${jobId}: ${verdict.reason} — ${verdict.detail ?? ''}`);
          if (verdict.escalate) {
            await store.appendEvent({ type: 'ORPHANED_EXECUTION_UNCERTAIN', role, jobId, detail: verdict.detail });
          }
          // Deliberately not remembered. This is a state recovery can change,
          // and a worker that stopped looking would never notice it had.
          continue;
        }

        seen.add(seenKey);

        // The attempt number lives on the job. Hardcoding 1 meant a second
        // attempt at an interrupted stage would have carried the first
        // attempt's id, and result fencing could not have told them apart.
        const attemptId = attemptIdFor(jobId, attemptNumber);
        claimed = await leaseStore.claimJob(jobId, {
          attemptId, agent: role, goal: job.goal, round: job.round, worktree: job.worktree,
        });
        if (!claimed.acquired) {
          // Another worker won the race. Exactly one claim survives.
          log('SKIP', `${jobId}: ${claimed.reason} by ${claimed.heldBy?.workerInstanceId ?? 'unknown'}`);
          continue;
        }

        // A job that may WRITE also needs exclusive ownership of the worktree.
        if (job.worktree) {
          const wt = await leaseStore.claimWorktree(job.worktree, { attemptId, jobId, agent: role });
          if (!wt.acquired) {
            log('SKIP', `${jobId}: WORKTREE_BUSY (held by ${wt.heldBy?.attemptId ?? 'unknown'})`);
            await leaseStore.releaseJob(jobId);
            claimed = null;
            continue;
          }
        }

        // Renewed throughout the inference, however long it runs.
        stopLeaseHeartbeat = startLeaseHeartbeat(leaseStore, { jobId, worktreePath: job.worktree });

        await handleJob({ ...job, attemptId, workerInstanceId: workerInstanceId() });
      } catch (error) {
        log('ERROR', `job ${jobId}: [${error.code ?? 'UNEXPECTED'}] ${error.message}`);
        await store.appendEvent({ type: 'JOB_FAILED', role, jobId, code: error.code ?? 'UNEXPECTED', message: error.message });
      } finally {
        // Released only once the execution really ended, so nothing else can
        // start while this attempt might still be writing.
        if (stopLeaseHeartbeat) await stopLeaseHeartbeat();
        if (claimed?.acquired) {
          const job = await store.readJob(role, jobId).catch(() => null);
          if (job?.worktree) await leaseStore.releaseWorktree(job.worktree).catch(() => {});
          await leaseStore.releaseJob(jobId).catch(() => {});
        }
      }
      log('IDLE');
    }

    await sleep(pollIntervalMs);
  }
}
