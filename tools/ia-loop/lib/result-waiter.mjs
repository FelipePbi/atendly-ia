/**
 * IA Loop — waiting for a worker to publish a result.
 *
 * A timeout here is an OBSERVER timeout, never a job failure. The waiter is a
 * spectator: the work belongs to the attempt that holds the lease. Treating
 * the wait as a failure is what once queued a second correction while the
 * first was still running, putting two agents on one worktree.
 *
 * So on timeout this returns instead of throwing, and the caller stops
 * watching without failing the job, without releasing the lease and without
 * creating a new attempt.
 *
 * Reads are fenced by attempt (`store.readResult(..., { expectedAttemptId })`,
 * see job-store.mjs): "the first non-null envelope" was the bug that let a
 * dead attempt's failure be read as the live attempt's answer. But fencing on
 * its own has a second failure mode — Goal 005 R2 hit it — when the attempt
 * being waited for is superseded by an AUTHORISED successor (a capacity retry,
 * a recovery, a harness repair) while this loop is asleep: the fence then
 * holds forever against an attempt that will never answer again, while its
 * successor's result sits on disk unread. `findAuthorizedSuccessor`
 * (attempt-handoff.mjs) is what tells the difference between that and an
 * ordinary stale result — a chain the job itself proves, never "whatever is
 * newest".
 */

import { classifyLease } from './leases.mjs';
import { findAuthorizedSuccessor } from './attempt-handoff.mjs';
import { readWorkerHealth, WORKER_HEALTH } from './worker-registry.mjs';

export const DEFAULT_RESULT_TIMEOUT_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_POLL_MS = 5_000;

/**
 * How long a worker may be silent before the observer gives up on it.
 *
 * Restarting a worker is routine — a code change, a keeper relaunching a
 * killed process — and the replacement only starts heartbeating once it holds
 * the role, has judged its predecessor's lease and swept orphans. On Goal 103
 * R2 that took about two minutes; the orchestrator, which stopped at the first
 * OFFLINE reading, had already filed the Goal as UNKNOWN_FATAL while the new
 * worker picked the attempt up and ran it normally. Several times
 * OFFLINE_AFTER_MS wide, so a real restart fits and a dead worker still stops
 * the run within minutes.
 */
export const DEFAULT_WORKER_RESTART_GRACE_MS = Number(process.env.IA_LOOP_WORKER_RESTART_GRACE_MS ?? 180_000);

const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Is the attempt being carried by the worker that is heartbeating NOW?
 *
 * Asked only after an outage, because "a worker of this role is back" is not
 * the same as "our attempt is in hand". It is when the attempt is QUEUED (the
 * new worker will claim it through the ordinary lease check) or held under a
 * live lease by that very process. A lease still warm from the process that
 * DIED does not count — it is about to expire, and the new worker will then
 * refuse the attempt as uncertain; waiting on that would turn a quick human
 * escalation into hours of silence.
 */
export async function attemptProgress({ store, leaseStore = null, role, jobId, attemptId = null, workerPid = null, now = Date.now() }) {
  const state = await store.readAttemptState(role, jobId);
  const isOurs = !attemptId || state?.attemptId === attemptId;

  if (isOurs && state?.attemptStatus === 'QUEUED') {
    return { progressing: true, how: 'QUEUED', attemptId: state.attemptId };
  }

  // The job lease is per job, not per attempt: a capacity retry materialises
  // its successor under the lease the worker already holds. So the holder's
  // identity is what counts — the process heartbeating right now.
  const lease = leaseStore ? await leaseStore.readJobLease(jobId).catch(() => null) : null;
  if (lease && classifyLease(lease, { now }).live && Number.isInteger(workerPid) && lease.pid === workerPid) {
    return { progressing: true, how: 'LEASED', attemptId: state?.attemptId ?? lease.attemptId ?? null };
  }

  return {
    progressing: false,
    detail: `${state?.attemptId ?? jobId} is ${state?.attemptStatus ?? 'unknown'}`
      + (lease ? `, lease held by pid ${lease.pid ?? '?'} (worker pid ${workerPid ?? '?'})` : ', no lease'),
  };
}

/**
 * Tolerates a bounded worker outage instead of failing on its first sign.
 *
 * One definition for every observer — run-goal's waiter and run-close's own —
 * so "how long is a restart allowed to take" cannot drift between them.
 *
 * `check(health, { attemptId })` returns `{ offline: true, ... }` only when
 * the role has been without a usable worker for the whole grace window:
 *
 *   - OFFLINE at the start of the window, and still OFFLINE at its end, is the
 *     old behaviour, just later;
 *   - back, and carrying the attempt (see attemptProgress), ends the outage;
 *   - back but NOT carrying it keeps the clock running, so a replacement that
 *     can only refuse the attempt does not hold the run hostage.
 */
export function createWorkerOutageGuard({
  store, leaseStore = null, role, jobId,
  graceMs = DEFAULT_WORKER_RESTART_GRACE_MS,
  now = () => Date.now(),
  emit = () => {},
  goal = null,
  round = null,
}) {
  let outageStartedAt = null;

  return {
    get outageStartedAt() { return outageStartedAt; },

    async check(health, { attemptId = null } = {}) {
      const at = now();

      if (health.health !== WORKER_HEALTH.OFFLINE && outageStartedAt === null) return { offline: false };

      if (health.health === WORKER_HEALTH.OFFLINE) {
        if (outageStartedAt === null) {
          outageStartedAt = at;
          emit(`  … ${role} is not heartbeating; waiting up to ${Math.round(graceMs / 1000)}s for a restarted worker.`);
          await store.appendEvent({
            type: 'WORKER_HEARTBEAT_LOST', role, jobId, attemptId, goal, round, graceMs,
          }).catch(() => {});
        }
        if (at - outageStartedAt >= graceMs) {
          return { offline: true, outageMs: at - outageStartedAt, detail: `${role} stayed offline` };
        }
        return { offline: false, waiting: true };
      }

      // Heartbeating again after an outage.
      const progress = await attemptProgress({
        store, leaseStore, role, jobId, attemptId, workerPid: health.pid ?? null, now: at,
      });
      if (progress.progressing) {
        emit(`  … ${role} is back (pid ${health.pid ?? '?'}); ${progress.attemptId ?? jobId} is ${progress.how}.`);
        await store.appendEvent({
          type: 'WORKER_RETURNED', role, jobId, attemptId: progress.attemptId ?? attemptId, goal, round,
          pid: health.pid ?? null, how: progress.how, outageMs: at - outageStartedAt,
        }).catch(() => {});
        outageStartedAt = null;
        return { offline: false, recovered: true };
      }
      if (at - outageStartedAt >= graceMs) {
        return { offline: true, outageMs: at - outageStartedAt, detail: `${role} came back without the attempt: ${progress.detail}` };
      }
      return { offline: false, waiting: true };
    },
  };
}

/**
 * @param store          the job store
 * @param role           'developer' | 'tech_lead'
 * @param jobId          the logical job to watch
 * @param emit           progress line sink
 * @param leaseStore     for reporting lease status on an observer stop
 * @param expectedAttemptId  the attempt this call starts out waiting for
 * @param goal, round    carried onto ATTEMPT_WAIT_HANDOFF for the audit trail
 * @param resultTimeoutMs, pollMs, sleep, now  overridable for tests
 * @param workerRestartGraceMs  how long the worker may be offline before the
 *                       observer stops (see createWorkerOutageGuard)
 * @returns `{ envelope, attemptId }` on success; `{ observerTimeout, ... }` or
 *          `{ workerOffline, ... }` when the loop stopped without one. The
 *          returned `attemptId` is always the attempt actually settled on —
 *          the caller's original `expectedAttemptId` after zero or more
 *          authorised handoffs.
 */
export async function waitForResult(store, role, jobId, {
  emit = () => {},
  leaseStore = null,
  expectedAttemptId = null,
  goal = null,
  round = null,
  resultTimeoutMs = DEFAULT_RESULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
  workerRestartGraceMs = DEFAULT_WORKER_RESTART_GRACE_MS,
  sleep = defaultSleep,
  now = () => Date.now(),
} = {}) {
  const startedAt = now();
  const outage = createWorkerOutageGuard({
    store, leaseStore, role, jobId, graceMs: workerRestartGraceMs, now, emit, goal, round,
  });
  let lastState = null;
  // Reported once per distinct stale attempt, so a five-second poll does not
  // fill the terminal and the event log with the same fact.
  const reportedStale = new Set();
  // Reassigned on an authorised handoff. Every subsequent read is fenced by
  // the NEW attempt — never by the one this call started with.
  let currentAttemptId = expectedAttemptId;

  for (;;) {
    const envelope = await store.readResult(role, jobId, {
      expectedAttemptId: currentAttemptId,
      onStale: ({ foundAttemptId }) => {
        if (reportedStale.has(foundAttemptId)) return;
        reportedStale.add(foundAttemptId);
        emit(`  … ignoring a result left by ${foundAttemptId ?? 'an unnamed attempt'}; waiting for ${currentAttemptId}.`);
        void store.appendEvent({
          type: 'STALE_RESULT_IGNORED',
          role, jobId, expectedAttemptId: currentAttemptId, foundAttemptId: foundAttemptId ?? null,
        }).catch(() => {});
      },
    });
    if (envelope) return { envelope, attemptId: currentAttemptId };

    // The attempt this loop is waiting for may have ended while it slept — a
    // capacity retry, a recovery, a harness repair. Follow it, but only
    // through a chain the job itself proves; anything else keeps waiting on
    // the attempt it was told to wait for.
    if (currentAttemptId) {
      // eslint-disable-next-line no-await-in-loop
      const attemptState = await store.readAttemptState(role, jobId);
      const successor = findAuthorizedSuccessor(attemptState, currentAttemptId);
      if (successor?.authorized) {
        emit(`  … ${currentAttemptId} ended (${successor.endedReason}); following authorized successor ${successor.attemptId}.`);
        // eslint-disable-next-line no-await-in-loop
        await store.appendEvent({
          type: 'ATTEMPT_WAIT_HANDOFF',
          goal, round, role, jobId,
          fromAttemptId: currentAttemptId, toAttemptId: successor.attemptId,
          reason: successor.endedReason, hops: successor.hops,
        });
        currentAttemptId = successor.attemptId;
        // Re-check immediately: the successor's result may already be on disk.
        continue;
      }
    }

    if (now() - startedAt > resultTimeoutMs) {
      const lease = await leaseStore?.readJobLease(jobId);
      const { status, ageMs } = lease ? classifyLease(lease) : { status: null, ageMs: null };
      return {
        observerTimeout: true,
        lease,
        leaseStatus: status,
        leaseAgeMs: ageMs,
        attemptId: currentAttemptId,
      };
    }

    const health = await readWorkerHealth(store, role);
    if (health.state !== lastState) {
      lastState = health.state;
      const suffix = health.capacityReason ? ` (${health.capacityReason})` : '';
      emit(`  … ${role}: ${health.state ?? 'unknown'}${suffix}`);
    }
    // A worker restart is not a dead worker: the outage guard gives a
    // replacement a bounded window to come back and carry the attempt.
    const outageVerdict = await outage.check(health, { attemptId: currentAttemptId });
    if (outageVerdict.offline) {
      // The worker is gone. Whether its child died with it is NOT knowable
      // here, so this is reported, not resolved: no new attempt is started.
      return {
        workerOffline: true, attemptId: currentAttemptId,
        outageMs: outageVerdict.outageMs, detail: outageVerdict.detail,
      };
    }

    await sleep(pollMs);
  }
}
