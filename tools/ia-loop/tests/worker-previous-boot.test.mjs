/**
 * The worker and a lease left behind by a reboot.
 *
 * The incident, Goal 103 R2, 2026-10-03: the machine rebooted at 03:22 while
 * the Developer held the job lease it took during the 00:14 boot. The worker
 * started after the reboot logged ORPHANED_EXECUTION_UNCERTAIN every second and
 * never picked the job up — `canStartNewAttempt` only trusts the worker's own
 * heartbeat and fails closed — until ia-loop:recover, seven minutes later,
 * retired that same lease with proof DIFFERENT_BOOT. The worker had the same
 * proof available all along; it just never asked.
 *
 * And the noise next to it: a Goal 101 job left WAITING_FOR_CAPACITY with no
 * lease wrote the same refusal to the event log ~59 000 times.
 *
 * No model is called, and nothing depends on the machine running the suite:
 * boot instant and hostname come from an injected fake.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createJobStore } from '../lib/job-store.mjs';
import { createLeaseStore } from '../lib/leases.mjs';
import { evaluateJobEligibility, reclaimFromPreviousBoot } from '../lib/worker-loop.mjs';
import { waitForResult } from '../lib/result-waiter.mjs';
import { writeHeartbeat } from '../lib/worker-registry.mjs';
import { WORKER_RECLAIM_PROOFS, isWorkerReclaimEligible } from '../lib/orphan-evidence.mjs';

const ROLE = 'developer';
const JOB = '103-r2-correction-e12a1c81';
const a = (n) => `${JOB}-a${n}`;
const HOST = 'Borges';
const BOOT_OLD = '2026-10-03T00:14:34.558Z';
const BOOT_NEW = '2026-10-03T03:22:10.000Z';
const NOW = Date.parse('2026-10-03T03:26:32.000Z');
const WORKTREE = 'E:/Projetos/atendly-ia/.ai-worktrees/goal-103';

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-prevboot-'));
  try { return await run(dir); } finally { await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

/**
 * A machine that answers only boot and hostname. Asking it about a process is
 * a test failure: the worker polls every second and can only act on a reboot,
 * so a process query per poll would be pure cost.
 */
function bootOnlyInspector({ host = HOST, bootAt = BOOT_NEW } = {}) {
  const refuse = () => { throw new Error('the worker path must not query processes'); };
  return {
    hostname: () => host,
    bootAt: () => bootAt,
    self: () => ({ hostname: host, bootAt, pid: 1, processStartedAt: bootAt }),
    exists: refuse,
    startedAt: refuse,
  };
}

/** The lease the incident left on disk, aged relative to NOW. */
function deadLease({ ageMs = 6 * 60_000, bootAt = BOOT_OLD, hostname = HOST, attempt = 1 } = {}) {
  return {
    jobId: JOB, attemptId: a(attempt), agent: ROLE, goal: '103', round: 2, worktree: WORKTREE,
    kind: 'job', key: JOB,
    workerInstanceId: '25484-e0847ea9', hostname, bootAt, pid: 25484,
    processStartedAt: '2026-10-03T00:17:35.588Z',
    status: 'ACTIVE', version: 261,
    acquiredAt: '2026-10-03T02:36:48.901Z',
    heartbeatAt: new Date(NOW - ageMs).toISOString(),
    expiresAt: new Date(NOW - ageMs + 90_000).toISOString(),
  };
}

async function writeRawLease(leaseStore, kind, key, lease) {
  const path = leaseStore.paths.pathFor(kind, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
}

async function seed(dir, { status = 'RUNNING', lease = deadLease(), worktreeLease = true } = {}) {
  const store = createJobStore(dir);
  const leaseStore = createLeaseStore(dir);
  await store.publishJob(ROLE, { jobId: JOB, role: ROLE, goal: '103', round: 2, worktree: WORKTREE });
  if (status !== 'QUEUED') await store.setJobStatus(ROLE, JOB, status);
  if (lease) {
    await writeRawLease(leaseStore, 'job', JOB, lease);
    if (worktreeLease) {
      const { worktreeKey } = await import('../lib/leases.mjs');
      await writeRawLease(leaseStore, 'worktree', worktreeKey(WORKTREE), {
        ...lease, kind: 'worktree', key: worktreeKey(WORKTREE), worktreePath: WORKTREE,
      });
    }
  }
  return { store, leaseStore };
}

const evaluate = (store, leaseStore, { now = NOW, inspector = bootOnlyInspector(), seen = new Set() } = {}) =>
  evaluateJobEligibility({ store, leaseStore, role: ROLE, jobId: JOB, seen, inspector, now });

// ===========================================================================
// Recognising the lease
// ===========================================================================

test('a lease taken during an earlier boot is a confirmed orphan in the worker path', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir);

    const eligibility = await evaluate(store, leaseStore);

    assert.equal(eligibility.eligible, false, 'not claimed in the same breath: the leases are retired first');
    assert.equal(eligibility.reason, 'ORPHAN_FROM_PREVIOUS_BOOT');
    assert.equal(eligibility.owner.status, 'ORPHAN_CONFIRMED');
    assert.equal(eligibility.owner.proof, 'DIFFERENT_BOOT');
    assert.equal(eligibility.cache, false);
  });
});

test('the same expired lease in the SAME boot still fails closed — a child may be writing', async () => {
  await withDir(async (dir) => {
    // Acquired after the current boot: the holder may be alive, or its child
    // may be. Nothing the worker can see settles it.
    const { store, leaseStore } = await seed(dir, {
      lease: { ...deadLease({ bootAt: BOOT_NEW }), acquiredAt: '2026-10-03T03:23:00.000Z' },
    });

    const eligibility = await evaluate(store, leaseStore);

    assert.equal(eligibility.reason, 'LEASE_BLOCKED');
    assert.equal(eligibility.verdict.reason, 'ORPHANED_EXECUTION_UNCERTAIN');
    assert.equal(eligibility.verdict.escalate, true);
  });
});

test('a fresh heartbeat is never second-guessed by the boot check', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir, { lease: deadLease({ ageMs: 5_000 }) });

    const eligibility = await evaluate(store, leaseStore);

    assert.equal(eligibility.reason, 'LEASE_BLOCKED');
    assert.equal(eligibility.verdict.reason, 'ATTEMPT_ALREADY_RUNNING');
  });
});

test('a lease written by another machine is not ours to judge', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir, { lease: deadLease({ hostname: 'OTHER-HOST' }) });

    const eligibility = await evaluate(store, leaseStore);

    assert.equal(eligibility.reason, 'LEASE_BLOCKED');
    assert.equal(eligibility.verdict.reason, 'ORPHANED_EXECUTION_UNCERTAIN');
  });
});

test('only a reboot is proof enough for a worker; a vanished pid is not', () => {
  assert.deepEqual([...WORKER_RECLAIM_PROOFS], ['DIFFERENT_BOOT']);
  assert.equal(isWorkerReclaimEligible({ status: 'ORPHAN_CONFIRMED', proof: 'DIFFERENT_BOOT' }), true);
  assert.equal(isWorkerReclaimEligible({ status: 'ORPHAN_CONFIRMED', proof: 'PROCESS_GONE' }), false,
    'the worker pid being gone says nothing about the claude child it spawned');
  assert.equal(isWorkerReclaimEligible({ status: 'ORPHAN_CONFIRMED', proof: 'PID_REUSED' }), false);
  assert.equal(isWorkerReclaimEligible({ status: 'SUSPECTED_ORPHAN', proof: null }), false);
});

test('the worker does not define boot time itself', async () => {
  // History: vocabulary defined in two places is the bug this harness keeps
  // paying for. The boot judgement must be orphan-evidence's, nobody else's.
  const source = await readFile(new URL('../lib/worker-loop.mjs', import.meta.url), 'utf8');
  assert.match(source, /judgeOwner\(/);
  assert.doesNotMatch(source, /uptime\(|sameBoot\(|BOOT_TOLERANCE_MS/);
});

// ===========================================================================
// Taking the job back
// ===========================================================================

test('reclaim retires both leases, records the interruption and queues the next attempt', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir);
    const eligibility = await evaluate(store, leaseStore);

    const reclaimed = await reclaimFromPreviousBoot({
      store, leaseStore, role: ROLE, jobId: JOB, lease: eligibility.lease, owner: eligibility.owner,
    });

    assert.equal(reclaimed.reclaimed, true);
    assert.equal(reclaimed.requeued, true);
    assert.equal(reclaimed.attemptId, a(2));

    assert.equal(await leaseStore.readJobLease(JOB), null, 'the dead lease is gone');
    assert.equal(await leaseStore.readWorktreeLease(WORKTREE), null, 'and the worktree is free');
    const archived = JSON.parse(await readFile(`${leaseStore.paths.pathFor('job', JOB)}.superseded`, 'utf8'));
    assert.equal(archived.supersededProof, 'DIFFERENT_BOOT', 'archived with its proof, never just deleted');

    const state = await store.readAttemptState(ROLE, JOB);
    assert.equal(state.attemptId, a(2));
    assert.equal(state.attemptStatus, 'QUEUED');
    assert.equal(state.history[0].attemptId, a(1));
    assert.equal(state.history[0].status, 'INTERRUPTED');
    assert.equal(state.history[0].reason, 'DIFFERENT_BOOT');

    const types = (await store.readEvents()).map((e) => e.type);
    assert.ok(types.includes('ORPHANED_LEASE_RETIRED'));
    assert.ok(types.includes('JOB_INTERRUPTED'));
    assert.ok(types.includes('JOB_ATTEMPT_MATERIALISED'));

    // And the next poll claims it through the ordinary path.
    const next = await evaluate(store, leaseStore);
    assert.equal(next.eligible, true);
    assert.equal(next.attemptState.attemptId, a(2));
  });
});

test('a reboot during a capacity wait queues the successor too, instead of stranding it', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir, { status: 'WAITING_FOR_CAPACITY' });
    const eligibility = await evaluate(store, leaseStore);
    assert.equal(eligibility.reason, 'ORPHAN_FROM_PREVIOUS_BOOT');

    const reclaimed = await reclaimFromPreviousBoot({
      store, leaseStore, role: ROLE, jobId: JOB, lease: eligibility.lease, owner: eligibility.owner,
    });

    assert.equal(reclaimed.requeued, true);
    const state = await store.readAttemptState(ROLE, JOB);
    assert.equal(state.attemptStatus, 'QUEUED');
    assert.equal(state.history[0].status, 'WAITING_FOR_CAPACITY', 'the wait stays in the record as what it was');
  });
});

test('a result that landed before the reboot is left for the orchestrator, not redone', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir);
    await store.publishResult(ROLE, JOB, { ok: true, result: { status: 'DONE' } }, { attemptId: a(1) });
    const eligibility = await evaluate(store, leaseStore);

    const reclaimed = await reclaimFromPreviousBoot({
      store, leaseStore, role: ROLE, jobId: JOB, lease: eligibility.lease, owner: eligibility.owner,
    });

    assert.equal(reclaimed.requeued, false);
    assert.equal(reclaimed.reason, 'RESULT_ON_DISK');
    assert.equal((await store.readAttemptState(ROLE, JOB)).attemptId, a(1), 'no successor archived the answer');
    assert.ok(await store.hasCompletedResult(ROLE, JOB, { expectedAttemptId: a(1) }));
  });
});

test('reclaim refuses anything short of a worker-grade proof', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir);
    const reclaimed = await reclaimFromPreviousBoot({
      store, leaseStore, role: ROLE, jobId: JOB, lease: deadLease(),
      owner: { status: 'ORPHAN_CONFIRMED', proof: 'PROCESS_GONE' },
    });
    assert.equal(reclaimed.reclaimed, false);
    assert.ok(await leaseStore.readJobLease(JOB), 'the lease is untouched');
  });
});

test('a lease that moved after it was judged is not retired', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir);
    const eligibility = await evaluate(store, leaseStore);
    await writeRawLease(leaseStore, 'job', JOB, { ...deadLease(), version: 262 });

    const reclaimed = await reclaimFromPreviousBoot({
      store, leaseStore, role: ROLE, jobId: JOB, lease: eligibility.lease, owner: eligibility.owner,
    });

    assert.equal(reclaimed.reclaimed, false);
    assert.equal(reclaimed.reason, 'LEASE_CHANGED_SINCE_JUDGEMENT');
    assert.equal((await store.readAttemptState(ROLE, JOB)).attemptStatus, 'RUNNING', 'the job is untouched too');
  });
});

test('an orchestrator waiting on the dead attempt follows the reclaimed successor to its result', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir);
    const eligibility = await evaluate(store, leaseStore);
    await reclaimFromPreviousBoot({
      store, leaseStore, role: ROLE, jobId: JOB, lease: eligibility.lease, owner: eligibility.owner,
    });
    await store.publishResult(ROLE, JOB, { ok: true, result: { status: 'DONE' } }, { attemptId: a(2) });
    await writeHeartbeat(store, ROLE, { state: 'IDLE', model: 'm', sessionStrategy: 'STATELESS' });

    const observed = await waitForResult(store, ROLE, JOB, {
      expectedAttemptId: a(1), sleep: async () => {}, workerRestartGraceMs: 0,
    });

    assert.equal(observed.attemptId, a(2), 'INTERRUPTED is an authorised end; the waiter hands off');
    assert.equal(observed.envelope.result.status, 'DONE');
  });
});

// ===========================================================================
// The noise
// ===========================================================================

test('the same refusal has the same report key on every poll, however old the lease gets', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir, {
      lease: { ...deadLease({ bootAt: BOOT_NEW }), acquiredAt: '2026-10-03T03:23:00.000Z' },
    });

    const first = await evaluate(store, leaseStore, { now: NOW });
    const later = await evaluate(store, leaseStore, { now: NOW + 60_000 });

    assert.notEqual(first.detail, later.detail, 'the detail carries the age, so it changes');
    assert.equal(first.reportKey, later.reportKey, 'the fact being reported does not');
  });
});

test('Goal 101: a capacity wait with no lease is reported once, not once a second', async () => {
  await withDir(async (dir) => {
    const { store, leaseStore } = await seed(dir, { status: 'WAITING_FOR_CAPACITY', lease: null });

    const first = await evaluate(store, leaseStore, { now: NOW });
    const later = await evaluate(store, leaseStore, { now: NOW + 3_600_000 });

    assert.equal(first.reason, 'LEASE_BLOCKED');
    assert.equal(first.verdict.reason, 'ORPHANED_EXECUTION_UNCERTAIN', 'still refused — only the report is quieter');
    assert.equal(first.reportKey, later.reportKey);
  });
});

test('a lease that moves is a new fact and is reported again', async () => {
  await withDir(async (dir) => {
    const lease = { ...deadLease({ bootAt: BOOT_NEW }), acquiredAt: '2026-10-03T03:23:00.000Z' };
    const { store, leaseStore } = await seed(dir, { lease });

    const first = await evaluate(store, leaseStore);
    await writeRawLease(leaseStore, 'job', JOB, { ...lease, version: lease.version + 1 });
    const moved = await evaluate(store, leaseStore);

    assert.notEqual(first.reportKey, moved.reportKey);
  });
});

test('the worker loop reports a refusal once per report key', async () => {
  const source = await readFile(new URL('../lib/worker-loop.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(!reported\.has\(eligibility\.reportKey\)\)/);
  assert.match(source, /reclaimFromPreviousBoot\(/, 'and acts on a previous-boot lease instead of reporting it');
});

test('run-recover attaches to an attempt a worker already took back, instead of blocking on its live lease', async () => {
  // Once a worker reclaims a previous-boot job on its own, the lease on disk
  // is the LIVE lease of the job's current attempt. run-recover used to judge
  // it as "the old attempt's lease", find it ACTIVE and stop at
  // RECOVERY_BLOCKED — the exact opposite of what had happened.
  const source = await readFile(new URL('../run-recover.mjs', import.meta.url), 'utf8');
  assert.match(source, /heldByOldAttempt\.attemptId === before\?\.attemptId/);
  assert.match(source, /liveVerdict\.status === OWNER_STATUS\.ACTIVE/);
  assert.match(source, /type: 'JOB_ALREADY_RESUMED'/);
  assert.match(source, /if \(heldByOldAttempt && !resumedByWorker\)/, 'the retire-or-block path is skipped');
  assert.match(source, /if \(!resumedByWorker && before\?\.attemptStatus !== 'INTERRUPTED'\)/,
    'and a live attempt is never marked INTERRUPTED');
});
