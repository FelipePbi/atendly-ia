/**
 * IA Loop — shared worker plumbing.
 *
 * The two workers share transport, heartbeat and the job polling loop. They do
 * NOT share session lifecycle: that difference lives in each worker and is the
 * whole point of the hybrid architecture.
 */

import { mkdir } from 'node:fs/promises';

import { startHeartbeat } from './worker-registry.mjs';

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
}) {
  await mkdir(store.paths.jobsDir(role), { recursive: true });

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

    const pending = files.filter((f) => !seen.has(f));
    for (const file of pending) {
      seen.add(file);
      const jobId = file.replace(/\.json$/, '');
      try {
        // A job that already reached a terminal status is never re-run. Before
        // this check, a restart re-executed a FAILED job and spent a second
        // inference on work a human had not yet looked at. Only an explicit
        // transition may create a NEW jobId for a retry or correction round.
        if (!(await store.isJobClaimable(role, jobId))) {
          const status = await store.readJobStatus(role, jobId);
          log('SKIP', `${jobId} is ${status}`);
          continue;
        }
        const job = await store.readJob(role, jobId);
        await handleJob(job);
      } catch (error) {
        log('ERROR', `job ${jobId}: [${error.code ?? 'UNEXPECTED'}] ${error.message}`);
        await store.appendEvent({ type: 'JOB_FAILED', role, jobId, code: error.code ?? 'UNEXPECTED', message: error.message });
      }
      log('IDLE');
    }

    await sleep(pollIntervalMs);
  }
}
