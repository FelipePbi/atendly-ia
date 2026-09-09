/**
 * IA Loop — shared worker plumbing.
 *
 * The two workers share transport, heartbeat and the job polling loop. They do
 * NOT share session lifecycle: that difference lives in each worker and is the
 * whole point of the hybrid architecture.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './claude-process.mjs';
import { startHeartbeat } from './worker-registry.mjs';
import {
  acquireWorkerIdentity,
  codeChangedSince,
  computeCodeVersion,
  describeHolder,
  startWorkerIdentityHeartbeat,
} from './worker-identity.mjs';
import {
  attemptIdFor,
  canStartNewAttempt,
  createLeaseStore,
  startLeaseHeartbeat,
  workerInstanceId,
} from './leases.mjs';
import { isClaimableJobStatus } from './job-store.mjs';
import { createResourceRegistry } from './resource-registry.mjs';
import { cleanupResourcesForAttempt, scavengeOrphans } from './resource-lifecycle.mjs';
import { logResourceEvent } from './shutdown-hooks.mjs';

/** Moderate polling. No file watcher needed at this cadence, no busy loop. */
export const POLL_INTERVAL_MS = 1_000;

/** The ia-loop package root, used to fingerprint the code this worker runs. */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The idle banner.
 *
 * A worker whose model is fixed prints it. A worker whose model is chosen per
 * job prints the profiles it CAN execute instead — stating a single model
 * there would be a claim the worker is not entitled to make.
 */
export function banner({ title, model = null, supportedProfiles = null, sessionLine, extra = [] }) {
  const identity = supportedProfiles
    ? ['Supported profiles:', ...supportedProfiles.map((profile) => `  ${profile}`)]
    : [`Model: ${model}`];

  return [
    '',
    `ATENDLY IA LOOP — ${title}`,
    '',
    ...identity,
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
  resourceRegistry = createResourceRegistry(store.paths.root),
  /**
   * The role's singleton guard. On by default and only ever disabled by a test
   * that drives the loop directly: two workers of one role is precisely the
   * condition this exists to make impossible.
   */
  enforceIdentity = true,
  packageRoot = PACKAGE_ROOT,
  /**
   * Announces the worker as ready. Called ONLY once the role lease is held,
   * because a process that is about to refuse to start must not first print a
   * banner saying it is waiting for work.
   */
  onStarted = () => {},
}) {
  await mkdir(store.paths.jobsDir(role), { recursive: true });
  log('WORKER', `instance ${workerInstanceId()}`);

  // Claimed BEFORE anything else this worker does. A second process of the
  // same role must fail here, loudly, rather than coexist: on 2026-09-09 two
  // Tech Leads polled the same queue for five hours, each correctly refusing
  // the other's jobs, and the work silently landed in the older one.
  let releaseIdentity = async () => {};
  let bootCodeVersion = null;
  if (enforceIdentity) {
    const codeVersion = await computeCodeVersion({ root: packageRoot });
    bootCodeVersion = codeVersion.version;

    const identity = await acquireWorkerIdentity({
      leaseStore, role, repoRoot: packageRoot, codeVersion,
    });
    if (!identity.acquired) {
      log('REFUSING TO START', `${identity.reason} — held by ${describeHolder(identity.heldBy)}`);
      throw new SpikeError(
        identity.reason,
        `Another ${role} worker holds this role (${describeHolder(identity.heldBy)}). `
        + `Stop it before starting another, or run ia-loop:recover if it is gone. [${identity.verdict}: ${identity.detail}]`,
      );
    }
    if (identity.tookOver) {
      log('IDENTITY', `took over from ${describeHolder(identity.replaced)} — ${identity.verdict}`);
      await store.appendEvent({
        type: 'WORKER_IDENTITY_TAKEOVER', role,
        from: identity.replaced?.workerInstanceId ?? null,
        verdict: identity.verdict,
      }).catch(() => {});
    }
    log('IDENTITY', `${role} held by ${workerInstanceId()} · code ${bootCodeVersion} (${codeVersion.fileCount} files)`);

    const stopIdentityHeartbeat = startWorkerIdentityHeartbeat(leaseStore, role, {
      onError: (error) => log('ERROR', `identity heartbeat: ${error.message}`),
    });
    releaseIdentity = async () => {
      await stopIdentityHeartbeat();
      await leaseStore.releaseWorker(role).catch(() => {});
    };
  }

  // Crash recovery: anything a PREVIOUS instance of this worker left ACTIVE
  // (a crash, a killed terminal, a reboot — none of which run a `finally`)
  // is judged and, if provably orphaned, cleaned before this instance claims
  // any work. Best-effort: a scavenger failure must never block startup.
  try {
    const { report } = await scavengeOrphans(resourceRegistry, { stateDir: store.paths.root });
    for (const entry of report) {
      if (entry.verdict === 'ORPHAN_CONFIRMED') {
        logResourceEvent(log, 'TEMP_RESOURCE_ORPHAN_CONFIRMED', `${entry.resourceId} cleaned=${entry.cleaned}`);
      } else if (entry.verdict === 'ORPHAN_SUSPECTED') {
        logResourceEvent(log, 'TEMP_RESOURCE_ORPHAN_SUSPECTED', `${entry.resourceId} — ${entry.detail}`);
      }
    }
  } catch (error) {
    log('ERROR', `startup resource scavenger failed: ${error.message}`);
  }

  // Past this point the role is genuinely ours, so saying so is true.
  onStarted();

  const stopHeartbeat = startHeartbeat(store, role, getStatus);
  let running = true;

  // Tracks the attempt currently in flight (if any) so a signal mid-attempt
  // can clean up what THAT attempt owns instead of exiting and leaving it
  // behind. Cleared the moment the normal per-attempt cleanup already ran.
  let inFlightAttemptId = null;

  const shutdown = async (signal) => {
    if (!running) return;
    running = false;
    log('STOPPING', `signal ${signal}`);
    if (inFlightAttemptId) {
      try {
        const { results } = await cleanupResourcesForAttempt(resourceRegistry, inFlightAttemptId, { stateDir: store.paths.root });
        for (const result of results) logResourceEvent(log, 'TEMP_RESOURCE_CLEANUP_STARTED', `${result.resourceId} (shutdown)`);
      } catch (error) {
        log('ERROR', `resource cleanup on shutdown failed: ${error.message}`);
      }
    }
    await stopHeartbeat();
    // Released last, so nothing can claim the role while this process is still
    // cleaning up what its attempt owned.
    await releaseIdentity();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  const seen = new Set();
  /**
   * A reason to stop that is NOT a crash, carried out of the loop so the
   * process can exit with a code that says so. Thrown after the loop unwinds,
   * never from inside it: the per-job catch there would log it as a failed job.
   */
  let fatal = null;

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
      // Declared here, not inside the try: the finally block below needs it
      // to clean up this attempt's resources, and a `const` scoped to the
      // try would not be visible there.
      let attemptId = null;
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

        // The last gate before this worker commits to executing something.
        //
        // Checked here rather than every poll because it costs a directory
        // walk, and here it costs one only when there is actually work to
        // take. A worker whose sources changed underneath it keeps its lease
        // and stops accepting jobs: it must not execute a version nobody can
        // reason about, and it must not release the role to a process that
        // would then race it.
        if (bootCodeVersion) {
          const { changed, current } = await codeChangedSince({ root: packageRoot, bootVersion: bootCodeVersion });
          if (changed) {
            log('CODE CHANGED', `booted with ${bootCodeVersion}, on disk ${current?.version} — stopping before taking this job`);
            await store.appendEvent({
              type: 'WORKER_CODE_STALE', role,
              bootCodeVersion, currentCodeVersion: current?.version ?? null,
            }).catch(() => {});
            // Stopping rather than idling forever: a worker that keeps its role
            // while refusing every job is a role nobody else can take. Exiting
            // releases it, and the dedicated exit code stops a supervisor from
            // restarting into code the operator has not chosen to deploy.
            fatal = new SpikeError(
              'WORKER_CODE_CHANGED',
              `ia-loop code changed since this ${role} booted `
              + `(${bootCodeVersion} -> ${current?.version ?? 'unknown'}). Restart the worker to pick it up.`,
            );
            running = false;
            break;
          }
        }

        seen.add(seenKey);

        // The attempt number lives on the job. Hardcoding 1 meant a second
        // attempt at an interrupted stage would have carried the first
        // attempt's id, and result fencing could not have told them apart.
        attemptId = attemptIdFor(jobId, attemptNumber);
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

        // Visible to shutdown() for the duration of the inference, so a
        // signal arriving mid-attempt cleans up what THIS attempt owns
        // instead of exiting and leaving it running.
        inFlightAttemptId = attemptId;

        await handleJob({ ...job, attemptId, workerInstanceId: workerInstanceId() });
      } catch (error) {
        log('ERROR', `job ${jobId}: [${error.code ?? 'UNEXPECTED'}] ${error.message}`);
        await store.appendEvent({ type: 'JOB_FAILED', role, jobId, code: error.code ?? 'UNEXPECTED', message: error.message });
      } finally {
        // Whatever this attempt created — however it ended: COMPLETED,
        // FAILED, WAITING_FOR_CAPACITY, or the catch above — is cleaned up
        // before the lease is released. A resource must never outlive the
        // attempt that owns it, and this `finally` runs on every path out.
        if (attemptId) {
          try {
            const { results } = await cleanupResourcesForAttempt(resourceRegistry, attemptId, { stateDir: store.paths.root });
            for (const result of results) logResourceEvent(log, 'TEMP_RESOURCE_CLEANUP_STARTED', `${result.resourceId} (attempt ended)`);
          } catch (error) {
            log('ERROR', `resource cleanup for ${attemptId} failed: ${error.message}`);
          }
        }
        inFlightAttemptId = null;

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

    if (running) await sleep(pollIntervalMs);
  }

  // Reached only by a deliberate stop; `shutdown` exits the process directly.
  await stopHeartbeat();
  await releaseIdentity();
  if (fatal) throw fatal;
}
