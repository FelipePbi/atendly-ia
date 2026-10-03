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
  retireAttemptLeases,
  startLeaseHeartbeat,
  workerInstanceId,
} from './leases.mjs';
import { RETRYABLE_JOB_STATUSES, isClaimableJobStatus, isTerminalJobStatus } from './job-store.mjs';
import { collectOwnerEvidence, isWorkerReclaimEligible, judgeOwner } from './orphan-evidence.mjs';
import { createProcessInspector } from './process-inspector.mjs';
import { FAILURE_FAMILIES, familyFor } from './failure-taxonomy.mjs';
import { createResourceRegistry } from './resource-registry.mjs';
import { cleanupResourcesForAttempt, scavengeOrphans } from './resource-lifecycle.mjs';
import { activeWorktreesFromRuntime, sweepOrphanProcesses } from './orphan-processes.mjs';
import { logResourceEvent } from './shutdown-hooks.mjs';
import { colorizeLogLine, createPaint } from './relay-logger.mjs';

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

const logPaint = createPaint();

export function log(tag, message = '') {
  const time = new Date().toISOString().slice(11, 19);
  console.log(colorizeLogLine(`${time} [${tag}]${message ? ` ${message}` : ''}`, logPaint));
}

// Deliberately NOT unref'd: this timer is what keeps the worker process alive
// between polls. The heartbeat timer is unref'd precisely because it must not
// be the thing holding the process open.
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Decides whether a job is worth looking at again, and names why when it is
 * not — persisted state, never an in-memory Set, decides eligibility.
 *
 * `seen` is a cache of "nothing has changed here since I last looked", keyed
 * by the exact persisted facts that decide eligibility. It is deliberately NOT
 * "this worker has permanently dealt with this job" — that reading is what let
 * a job repaired from outside the process (ia-loop:reclassify moving FAILED to
 * WAITING_FOR_CAPACITY, ia-loop:resume moving that to QUEUED, all on the SAME
 * attempt number) go silently unnoticed by a worker that never restarted: the
 * old key was jobId+attempt alone, so the SAME key it had already cached at
 * claim time for attempt 1 matched again after the repair, and the job was
 * skipped at the very first line, before any status was even re-read.
 *
 * The key is attempt + status + statusAt, not attempt + status alone — status
 * by itself is not enough, because a repaired job legitimately returns to the
 * EXACT SAME status string it started at: QUEUED is both "freshly dispatched,
 * never attempted" and "just requeued by ia-loop:resume after a repair", and
 * attempt does not change either — creating attempt 2 is what the resumed
 * attempt is FOR, via startNextAttempt, not something that has already
 * happened by the time this job is looked at again. `statusAt` is what tells
 * the two apart: every write that changes status — setJobStatus, and the
 * repair's own direct write — stamps a fresh one, so a job that went
 * QUEUED -> RUNNING -> FAILED -> WAITING_FOR_CAPACITY -> QUEUED never revisits
 * a `statusAt` it already used, however many times `status` itself repeats.
 *
 * Any of the three changing produces a different key, so the cache misses and
 * the job is evaluated fresh from disk — no restart required, and the
 * persisted job/attempt/lease state is what actually decides, exactly as it
 * does for a request that arrives while the worker was never polling at all.
 * Concurrency safety does not come from this cache at all: it comes from
 * `canStartNewAttempt`'s lease check below, which is authoritative across
 * processes and untouched by anything cached in memory.
 */
export async function evaluateJobEligibility({
  store, leaseStore, role, jobId, seen,
  inspector = defaultInspector(),
  now = Date.now(),
}) {
  const attemptState = await store.readAttemptState(role, jobId);
  if (!attemptState) {
    // The file does not exist yet, or is mid-write between listJobs() and this
    // read. Not a state worth caching: it resolves itself on the next poll.
    return { eligible: false, cache: false, reason: 'JOB_FILE_UNREADABLE' };
  }

  const seenKey = `${jobId}#a${attemptState.attempt}:${attemptState.attemptStatus}@${attemptState.statusAt}`;
  if (seen.has(seenKey)) {
    // Already evaluated and already logged, for this exact persisted state.
    // Silence here is correct, not a gap: nothing has changed to report.
    return { eligible: false, cache: 'HIT', seenKey, attemptState, reason: 'ALREADY_EVALUATED' };
  }

  // A job that reached a terminal status is never re-run: only an explicit
  // transition (a new jobId, or a repair tool moving the SAME attempt back to
  // a claimable status) may make it eligible again, and either one changes
  // this attemptState and therefore this key.
  if (!isClaimableJobStatus(attemptState.status)) {
    return {
      eligible: false, cache: 'ADD', seenKey, attemptState,
      reason: 'TERMINAL', detail: `${jobId} is ${attemptState.status}`,
    };
  }

  // The CURRENT ATTEMPT may be unclaimable even when the job-level status
  // looks fine (a REROUTED job mid-transition, for instance). Not cached: the
  // next attempt materialising is exactly what this worker should notice
  // without needing the status to change first.
  if (!isClaimableJobStatus(attemptState.attemptStatus)) {
    return {
      eligible: false, cache: false, seenKey, attemptState,
      reason: 'ATTEMPT_NOT_CLAIMABLE',
      detail: `${attemptState.attemptId} is ${attemptState.attemptStatus}`,
    };
  }

  // Ownership, decided by the filesystem lease rather than by anything cached
  // here. This is the actual concurrency guard — the one thing two workers (or
  // two polls) racing for the same job cannot both win.
  const lease = await leaseStore.readJobLease(jobId);
  const verdict = canStartNewAttempt({ lease, jobStatus: attemptState.status, now });
  if (!verdict.allowed) {
    // An expired lease taken during an EARLIER boot of this machine is not
    // uncertain at all: nothing that held it survived the reboot, child
    // process included. Judged by the same `judgeOwner` ia-loop:recover uses,
    // so "different boot" is defined once; only the proofs that also rule out
    // a surviving child count here (WORKER_RECLAIM_PROOFS). Every other
    // uncertain case still fails closed below. Without this, a worker started
    // after a reboot logged ORPHANED_EXECUTION_UNCERTAIN every second against
    // a lease whose holder could not possibly exist.
    if (lease && verdict.escalate) {
      const evidence = await collectOwnerEvidence(lease, inspector, { now, processQueries: false });
      const owner = judgeOwner({ lease, evidence, now });
      if (isWorkerReclaimEligible(owner)) {
        return {
          eligible: false, cache: false, seenKey, attemptState, lease, verdict, owner,
          reason: 'ORPHAN_FROM_PREVIOUS_BOOT',
          detail: `${jobId}: ${owner.proof} — ${owner.detail}`,
        };
      }
    }
    return {
      eligible: false, cache: false, seenKey, attemptState, lease, verdict,
      reason: 'LEASE_BLOCKED',
      detail: `${jobId}: ${verdict.reason} — ${verdict.detail ?? ''}`,
      // What makes this refusal a NEW fact worth logging: the persisted job
      // state, the refusal, and the exact lease version it was judged on. The
      // detail line carries the lease's age and so changes every poll; keying
      // the report on it is what wrote the same refusal to the event log
      // tens of thousands of times for one dead job.
      reportKey: `${seenKey}|${verdict.reason}|${lease?.workerInstanceId ?? 'no-lease'}#${lease?.version ?? lease?.heartbeatAt ?? '-'}`,
    };
  }

  return { eligible: true, cache: 'ADD', seenKey, attemptState, lease, verdict };
}

let sharedInspector = null;
function defaultInspector() {
  sharedInspector ??= createProcessInspector();
  return sharedInspector;
}

/**
 * Takes a job back from an attempt the machine's reboot killed.
 *
 * Exactly what ia-loop:recover's REQUEUE_JOB does for the same proof, and
 * nothing more: the dead attempt's leases are retired (archived, never
 * deleted), an attempt cut short while RUNNING is recorded as INTERRUPTED, and
 * the next attempt is materialised through `startNextAttempt` — the one door
 * that creates successors, so the orchestrator's waiter follows it as an
 * authorised handoff. The runtime and the loop lease are not touched; those
 * belong to the orchestrator.
 *
 * Nothing is claimed here. The new attempt is QUEUED and the next poll claims
 * it through the ordinary path, lease check included.
 */
export async function reclaimFromPreviousBoot({ store, leaseStore, role, jobId, lease, owner }) {
  if (!isWorkerReclaimEligible(owner)) {
    return { reclaimed: false, reason: 'NOT_PROVEN' };
  }

  const retired = await retireAttemptLeases(leaseStore, lease, { proof: owner.proof });
  if (!retired.retired) return { reclaimed: false, reason: retired.reason };

  const before = await store.readAttemptState(role, jobId);
  await store.appendEvent({
    type: 'ORPHANED_LEASE_RETIRED', role, jobId,
    goal: lease.goal ?? null, round: lease.round ?? null,
    attemptId: lease.attemptId ?? null, jobStatus: before?.status ?? null,
    owner: lease.workerInstanceId ?? null, proof: owner.proof,
    worktree: lease.worktree ?? null, retiredBy: 'WORKER',
  });

  // A result that landed before the reboot is the answer, not something to
  // redo: the orchestrator consumes it by attempt. Requeuing would archive it.
  if (await store.hasCompletedResult(role, jobId, { expectedAttemptId: before?.attemptId ?? null })) {
    return { reclaimed: true, requeued: false, reason: 'RESULT_ON_DISK' };
  }

  if (before?.attemptStatus === 'RUNNING') {
    await store.setJobStatus(role, jobId, 'INTERRUPTED');
    await store.appendEvent({
      type: 'JOB_INTERRUPTED', role, jobId, attemptId: before.attemptId,
      goal: lease.goal ?? null, round: lease.round ?? null, proof: owner.proof,
    });
  }

  const current = await store.readAttemptState(role, jobId);
  if (!RETRYABLE_JOB_STATUSES.includes(current?.attemptStatus)) {
    // QUEUED (claimed, never started) is already claimable once the lease is
    // gone; anything else is not this function's to move.
    return { reclaimed: true, requeued: false, attemptStatus: current?.attemptStatus ?? null };
  }

  const started = await store.startNextAttempt(role, jobId, {
    reason: owner.proof,
    detail: { interruptedBy: owner.proof, previousOwner: lease.workerInstanceId ?? null },
  });
  if (started.created) {
    await store.appendEvent({
      type: 'JOB_ATTEMPT_MATERIALISED', role, jobId,
      attemptId: started.attemptId, attempt: started.attempt, previousAttemptId: started.previousAttemptId,
      goal: lease.goal ?? null, round: lease.round ?? null, reason: owner.proof,
    });
  }
  return { reclaimed: true, requeued: Boolean(started.created), attemptId: started.attemptId ?? current.attemptId };
}

/**
 * Puts an attempt whose handler threw into a state the orchestrator can see.
 *
 * The handler settles its own attempt on every path it knows about —
 * COMPLETED, FAILED with a result, a capacity wait. An exception escaping it
 * means it did not, and the job was left at whatever it last wrote: QUEUED
 * (Goal 103 R2, STAGE_NOT_RETRYABLE before the round started) or a capacity
 * wait with nobody waiting (Goal 101 R3, CAPACITY_STATE_CORRUPT). Either way
 * the orchestrator watched a job that would never answer, and the worker —
 * which had cached that exact state as evaluated — never looked at it again.
 *
 * FAILED, plus a HUMAN_REQUIRED result fenced to the current attempt, is the
 * shape the capacity runner already gives a failure a person must look at, so
 * the orchestrator reads it on its existing path and the repair tools
 * (ia-loop:authorize-retry, ia-loop:reclassify) recognise it. Not a retry:
 * whether to run a FAILED attempt again is a person's decision, and an error
 * that repeats would otherwise loop once a second.
 *
 * Leaves the job alone when it already reached a terminal status, or when a
 * result for the current attempt is already on disk — the handler got as far
 * as answering, and overwriting that answer would destroy it.
 */
export async function settleAttemptAfterError({ store, role, jobId, error }) {
  const state = await store.readAttemptState(role, jobId);
  if (!state) return { settled: false, reason: 'JOB_UNREADABLE' };
  if (isTerminalJobStatus(state.status)) return { settled: false, reason: 'ALREADY_TERMINAL', status: state.status };

  const existing = await store.readResult(role, jobId, { expectedAttemptId: state.attemptId });
  if (existing) return { settled: false, reason: 'RESULT_ON_DISK', status: state.status };

  const errorCode = error?.code ?? 'UNEXPECTED';
  // Named the way the rest of the loop names a stop, so run-auto files it
  // under a reason it knows instead of a code it has never seen.
  const reason = familyFor({ code: errorCode }) === FAILURE_FAMILIES.HARNESS ? 'HARNESS_ERROR' : 'UNKNOWN_FATAL';
  const diagnostic = `[${errorCode}] ${error?.message ?? String(error)}`;

  let job = null;
  try { job = await store.readJob(role, jobId); } catch { /* the envelope is enough */ }

  await store.setJobStatus(role, jobId, 'FAILED');
  await store.publishResult(role, jobId, {
    ok: false,
    code: reason,
    errorCode,
    message: `The ${role} worker failed before the attempt produced a result: ${diagnostic}`,
    escalation: 'HUMAN_REQUIRED',
  }, { attemptId: state.attemptId });
  await store.appendEvent({
    type: 'HUMAN_REQUIRED', agent: role, jobId, attemptId: state.attemptId,
    goal: job?.goal ?? null, round: job?.round ?? null,
    reason, errorCode, previousStatus: state.status, diagnostic, source: 'WORKER_LOOP',
  });
  return { settled: true, reason, errorCode, attemptId: state.attemptId, previousStatus: state.status };
}

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

  await sweepLoopOrphans('worker start', store);

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
   * Refusals already logged, keyed by evaluateJobEligibility's `reportKey`.
   * Evaluation still happens every poll — only the REPORT is de-duplicated, so
   * a lease that changes, or a job that moves, is reported again at once.
   */
  const reported = new Set();
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

    // Eligibility is decided fresh from persisted state every time — see
    // evaluateJobEligibility. `seen` only remembers "nothing has changed since
    // I looked", keyed by attempt AND status, so a repair applied from outside
    // this process (ia-loop:reclassify, ia-loop:resume) is never invisible to
    // a worker that never restarted: it changes the status, which changes the
    // key, which is exactly what makes the cache miss and the job get looked
    // at again.
    for (const file of files) {
      const jobId = file.replace(/\.json$/, '');
      const eligibility = await evaluateJobEligibility({ store, leaseStore, role, jobId, seen });

      if (eligibility.cache === 'HIT') continue;

      if (!eligibility.eligible) {
        if (eligibility.cache === 'ADD') seen.add(eligibility.seenKey);
        if (eligibility.reason === 'ORPHAN_FROM_PREVIOUS_BOOT') {
          log('ORPHAN CONFIRMED', eligibility.detail);
          try {
            const reclaimed = await reclaimFromPreviousBoot({
              store, leaseStore, role, jobId, lease: eligibility.lease, owner: eligibility.owner,
            });
            log('RECLAIMED', `${jobId}: ${reclaimed.reclaimed
              ? (reclaimed.requeued ? `next attempt ${reclaimed.attemptId} queued` : (reclaimed.reason ?? reclaimed.attemptStatus ?? 'lease retired'))
              : `not reclaimed (${reclaimed.reason})`}`);
          } catch (error) {
            log('ERROR', `reclaim of ${jobId} failed: [${error.code ?? 'UNEXPECTED'}] ${error.message}`);
          }
        } else if (eligibility.reason === 'LEASE_BLOCKED') {
          if (!reported.has(eligibility.reportKey)) {
            reported.add(eligibility.reportKey);
            log('SKIP', eligibility.detail);
            if (eligibility.verdict?.escalate) {
              await store.appendEvent({ type: 'ORPHANED_EXECUTION_UNCERTAIN', role, jobId, detail: eligibility.verdict.detail });
            }
          }
        } else if (eligibility.detail) {
          // TERMINAL and ATTEMPT_NOT_CLAIMABLE both carry a ready-made detail
          // line; JOB_FILE_UNREADABLE carries none because it is transient —
          // the file existing or not by the next poll is the only fact that
          // matters, and logging a race on every listing would be noise, not
          // observability.
          log('SKIP', eligibility.detail);
        }
        continue;
      }

      const { attemptState } = eligibility;
      let claimed = null;
      let stopLeaseHeartbeat = null;
      // Declared here, not inside the try: the finally block below needs it
      // to clean up this attempt's resources, and a `const` scoped to the
      // try would not be visible there.
      let attemptId = null;
      try {
        const job = await store.readJob(role, jobId);

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

        seen.add(eligibility.seenKey);

        // The attempt number lives on the job. Hardcoding 1 meant a second
        // attempt at an interrupted stage would have carried the first
        // attempt's id, and result fencing could not have told them apart.
        attemptId = attemptIdFor(jobId, attemptState.attempt);
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
        await store.appendEvent({ type: 'JOB_FAILED', role, jobId, code: error.code ?? 'UNEXPECTED', message: error.message })
          .catch(() => {});

        if (claimed?.acquired) {
          // The attempt was ours and the handler did not settle it. Leaving
          // it as it was is what kept Goal 103 R2 QUEUED with an IDLE worker
          // and an orchestrator waiting forever — see settleAttemptAfterError.
          try {
            const settled = await settleAttemptAfterError({ store, role, jobId, error });
            if (settled.settled) {
              log('FAILED', `${jobId} (${settled.attemptId}) → FAILED, ${settled.reason}; a human decides whether it runs again`);
            }
          } catch (settleError) {
            log('ERROR', `could not record the failure of ${jobId}: ${settleError.message}`);
            // Not settled, so not "nothing changed": look at it again.
            seen.delete(eligibility.seenKey);
          }
        } else {
          // Never claimed (a lease I/O error, typically), so nothing ran and
          // nothing needs settling — but the job must not stay cached as
          // evaluated, or a transient error would strand it like a real one.
          seen.delete(eligibility.seenKey);
        }
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
        await sweepLoopOrphans('attempt ended', store);

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

/**
 * Processes an attempt left behind in a Goal worktree (lib/orphan-processes.mjs).
 * Best-effort: a sweep that fails is logged and never fails the worker.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKTREES_ROOT = join(REPO_ROOT, '.ai-worktrees');

/** Pids already reported, so a long-lived unproven service is named once per worker, not after every attempt. */
const reportedOrphanPids = new Set();

async function sweepLoopOrphans(reason, store) {
  // Not under `node --test`: a worker-loop test must not scan (or kill) the
  // real process table of the machine running the suite.
  if (process.env.NODE_TEST_CONTEXT || process.env.IA_LOOP_ORPHAN_SWEEP === '0') return;
  try {
    const { killed, reported, failed } = await sweepOrphanProcesses({
      roots: [WORKTREES_ROOT], repoRoot: REPO_ROOT,
      activeWorktrees: activeWorktreesFromRuntime(await store?.readRuntime?.().catch(() => null), REPO_ROOT),
    });
    for (const entry of killed) {
      log('ORPHAN PROCESS KILLED', `pid ${entry.pid} ${entry.name} tree ${entry.treeSize ?? 1} proc ${entry.treeMb ?? entry.mb} MB `
        + `${entry.reason} (${reason}) — ${String(entry.cmd).slice(0, 140)}`);
    }
    for (const entry of failed) {
      log('ORPHAN PROCESS NOT KILLED', `pid ${entry.pid} ${entry.name} ${entry.failure} (${reason})`);
    }
    for (const entry of reported) {
      if (reportedOrphanPids.has(entry.pid)) continue;
      reportedOrphanPids.add(entry.pid);
      log('ORPHAN PROCESS REPORTED', `pid ${entry.pid} ${entry.name} ${entry.treeMb ?? entry.mb} MB ${entry.reason} — ${entry.detail}`);
    }
  } catch (error) {
    log('ERROR', `orphan process sweep failed: ${error.message}`);
  }
}
