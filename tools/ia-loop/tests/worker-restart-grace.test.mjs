/**
 * Restarting a worker must not stop the run.
 *
 * The incident, Goal 103 R2, 2026-10-03: the Developer worker was restarted
 * (a keeper relaunches it). Its replacement only starts heartbeating once it
 * holds the role, has judged its predecessor and swept orphans — about two
 * minutes that day. The orchestrator stopped at the FIRST offline reading:
 * "The developer worker is no longer heartbeating", then "Goal 103 needs a
 * human: UNKNOWN_FATAL" — while the new worker claimed the queued attempt and
 * ran it normally.
 *
 * The observer now tolerates a bounded outage: a replacement that comes back
 * and carries the attempt ends it; no worker for the whole window, or one that
 * comes back unable to carry the attempt, still stops the run as before.
 *
 * No model is called; the observer's clock is a fake the test advances.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createJobStore } from '../lib/job-store.mjs';
import { createLeaseStore } from '../lib/leases.mjs';
import {
  DEFAULT_WORKER_RESTART_GRACE_MS,
  attemptProgress,
  createWorkerOutageGuard,
  waitForResult,
} from '../lib/result-waiter.mjs';
import { WORKER_HEALTH, writeHeartbeat, OFFLINE_AFTER_MS } from '../lib/worker-registry.mjs';

const ROLE = 'developer';
const JOB = '103-r2-correction-e12a1c81';
const a = (n) => `${JOB}-a${n}`;
const GRACE = 180_000;
const POLL = 5_000;

async function withStore(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-restart-'));
  try {
    return await run(createJobStore(dir), createLeaseStore(dir), dir);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

async function seedJob(store) {
  await store.publishJob(ROLE, { jobId: JOB, role: ROLE, goal: '103', round: 2, worktree: 'W' });
  return a(1);
}

const beat = (store) => writeHeartbeat(store, ROLE, { state: 'IDLE', model: 'm', sessionStrategy: 'STATELESS' });

/**
 * A clock the observer reads, advanced by its own sleeps. `script[n]` runs
 * after the n-th sleep — that is where the "world" changes under the waiter.
 */
function scriptedClock(script = {}) {
  let t = Date.parse('2026-10-03T06:39:44.000Z');
  let sleeps = 0;
  return {
    now: () => t,
    sleeps: () => sleeps,
    sleep: async (ms) => {
      t += ms;
      sleeps += 1;
      if (sleeps > 10_000) throw new Error('the waiter never stopped');
      await script[sleeps]?.();
    },
  };
}

/** A lease left by the worker that was killed: still warm, someone else's pid. */
async function writeForeignLease(leaseStore, { attemptId }) {
  const path = leaseStore.paths.pathFor('job', JOB);
  await mkdir(dirname(path), { recursive: true });
  const now = new Date().toISOString();
  await writeFile(path, `${JSON.stringify({
    jobId: JOB, key: JOB, kind: 'job', attemptId, agent: ROLE,
    workerInstanceId: '24708-e6697d13', pid: 24708, hostname: 'Borges',
    status: 'ACTIVE', version: 3, acquiredAt: now, heartbeatAt: now,
  }, null, 2)}\n`, 'utf8');
}

test('the default restart window is three minutes, wider than the offline threshold', () => {
  if (process.env.IA_LOOP_WORKER_RESTART_GRACE_MS === undefined) {
    assert.equal(DEFAULT_WORKER_RESTART_GRACE_MS, 180_000);
  }
  assert.ok(DEFAULT_WORKER_RESTART_GRACE_MS > OFFLINE_AFTER_MS);
});

test('Goal 103 R2: a restarted worker that claims the queued attempt keeps the run alive', async () => {
  await withStore(async (store, leaseStore) => {
    const attemptId = await seedJob(store);
    const clock = scriptedClock({
      // ~2 minutes of silence, then the replacement starts heartbeating…
      24: () => beat(store),
      // …claims the attempt, and answers.
      30: async () => {
        await leaseStore.claimJob(JOB, { attemptId, agent: ROLE });
        await store.setJobStatus(ROLE, JOB, 'RUNNING');
      },
      40: () => store.publishResult(ROLE, JOB, { ok: true, result: { status: 'DONE' } }, { attemptId }),
    });

    const observed = await waitForResult(store, ROLE, JOB, {
      expectedAttemptId: attemptId, leaseStore, pollMs: POLL, workerRestartGraceMs: GRACE,
      sleep: clock.sleep, now: clock.now, goal: '103', round: 2,
    });

    assert.equal(observed.workerOffline, undefined, 'the outage did not stop the observer');
    assert.equal(observed.envelope.result.status, 'DONE');

    const events = await store.readEvents();
    const lost = events.filter((e) => e.type === 'WORKER_HEARTBEAT_LOST');
    const back = events.filter((e) => e.type === 'WORKER_RETURNED');
    assert.equal(lost.length, 1, 'one outage, reported once');
    assert.equal(back.length, 1);
    assert.equal(back[0].how, 'QUEUED');
    assert.ok(back[0].outageMs < GRACE);
  });
});

test('no worker for the whole window: the observer stops exactly as before, just later', async () => {
  await withStore(async (store, leaseStore) => {
    const attemptId = await seedJob(store);
    const clock = scriptedClock();

    const observed = await waitForResult(store, ROLE, JOB, {
      expectedAttemptId: attemptId, leaseStore, pollMs: POLL, workerRestartGraceMs: GRACE,
      sleep: clock.sleep, now: clock.now,
    });

    assert.equal(observed.workerOffline, true);
    assert.equal(observed.attemptId, attemptId);
    assert.ok(observed.outageMs >= GRACE);
    assert.ok(clock.sleeps() <= GRACE / POLL + 1, 'and not a poll longer than the window');
    assert.equal((await store.readAttemptState(ROLE, JOB)).status, 'QUEUED', 'nothing was failed or requeued');
  });
});

test('a worker that comes back without the attempt does not hold the run hostage', async () => {
  await withStore(async (store, leaseStore) => {
    const attemptId = await seedJob(store);
    await store.setJobStatus(ROLE, JOB, 'RUNNING');
    // The killed worker's lease is still on disk; the replacement can only
    // refuse the attempt as uncertain once it expires.
    await writeForeignLease(leaseStore, { attemptId });
    const clock = scriptedClock({ 6: () => beat(store) });

    const observed = await waitForResult(store, ROLE, JOB, {
      expectedAttemptId: attemptId, leaseStore, pollMs: POLL, workerRestartGraceMs: GRACE,
      sleep: clock.sleep, now: clock.now,
    });

    assert.equal(observed.workerOffline, true);
    assert.match(observed.detail, /came back without the attempt/);
    assert.equal((await store.readEvents()).filter((e) => e.type === 'WORKER_RETURNED').length, 0);
  });
});

test('a worker that comes back holding the attempt under its own lease is waited on', async () => {
  await withStore(async (store, leaseStore) => {
    const attemptId = await seedJob(store);
    const clock = scriptedClock({
      3: async () => {
        await beat(store);
        // Claimed by THIS process — the same pid the heartbeat carries.
        await leaseStore.claimJob(JOB, { attemptId, agent: ROLE });
        await store.setJobStatus(ROLE, JOB, 'RUNNING');
      },
      60: () => store.publishResult(ROLE, JOB, { ok: true, result: { status: 'DONE' } }, { attemptId }),
    });

    const observed = await waitForResult(store, ROLE, JOB, {
      expectedAttemptId: attemptId, leaseStore, pollMs: POLL, workerRestartGraceMs: GRACE,
      sleep: clock.sleep, now: clock.now,
    });

    assert.equal(observed.envelope.result.status, 'DONE', 'waited well past the window once the attempt was in hand');
    const back = (await store.readEvents()).find((e) => e.type === 'WORKER_RETURNED');
    assert.equal(back.how, 'LEASED');
  });
});

test('a worker that never went away produces no outage at all', async () => {
  await withStore(async (store, leaseStore) => {
    const attemptId = await seedJob(store);
    await beat(store);
    const clock = scriptedClock({
      2: () => store.publishResult(ROLE, JOB, { ok: true, result: { status: 'DONE' } }, { attemptId }),
    });

    const observed = await waitForResult(store, ROLE, JOB, {
      expectedAttemptId: attemptId, leaseStore, pollMs: POLL, sleep: clock.sleep, now: clock.now,
    });

    assert.equal(observed.envelope.result.status, 'DONE');
    const types = (await store.readEvents()).map((e) => e.type);
    assert.ok(!types.includes('WORKER_HEARTBEAT_LOST'));
  });
});

// ===========================================================================
// The guard on its own
// ===========================================================================

const OFFLINE = { health: WORKER_HEALTH.OFFLINE, pid: null };

test('a second outage gets a fresh window', async () => {
  await withStore(async (store, leaseStore) => {
    await seedJob(store);
    let t = 0;
    const guard = createWorkerOutageGuard({ store, leaseStore, role: ROLE, jobId: JOB, graceMs: 100, now: () => t });

    assert.deepEqual(await guard.check(OFFLINE, { attemptId: a(1) }), { offline: false, waiting: true });
    t = 90;
    const back = await guard.check({ health: WORKER_HEALTH.RUNNING, pid: process.pid }, { attemptId: a(1) });
    assert.equal(back.recovered, true, 'QUEUED attempt: the worker is back and carries it');
    assert.equal(guard.outageStartedAt, null);

    t = 150;
    assert.equal((await guard.check(OFFLINE, { attemptId: a(1) })).offline, false, 'the clock restarted at 150');
    t = 249;
    assert.equal((await guard.check(OFFLINE, { attemptId: a(1) })).offline, false);
    t = 250;
    assert.equal((await guard.check(OFFLINE, { attemptId: a(1) })).offline, true);
  });
});

test('a STALE worker inside an outage is not yet back', async () => {
  await withStore(async (store, leaseStore) => {
    await seedJob(store);
    await store.setJobStatus(ROLE, JOB, 'RUNNING');
    let t = 0;
    const guard = createWorkerOutageGuard({ store, leaseStore, role: ROLE, jobId: JOB, graceMs: 100, now: () => t });
    await guard.check(OFFLINE);
    t = 50;
    // RUNNING with no lease: nobody carries it, whatever the heartbeat says.
    assert.deepEqual(await guard.check({ health: WORKER_HEALTH.STALE, pid: 1 }), { offline: false, waiting: true });
    t = 100;
    assert.equal((await guard.check({ health: WORKER_HEALTH.RUNNING, pid: 1 })).offline, true);
  });
});

test('attemptProgress: a queued successor of a DIFFERENT chain is not our attempt', async () => {
  await withStore(async (store, leaseStore) => {
    await seedJob(store);
    const progress = await attemptProgress({ store, leaseStore, role: ROLE, jobId: JOB, attemptId: a(7), workerPid: process.pid });
    assert.equal(progress.progressing, false);
  });
});

test('run-close observes with the same guard, not a copy of it', async () => {
  const source = await readFile(new URL('../run-close.mjs', import.meta.url), 'utf8');
  assert.match(source, /createWorkerOutageGuard\(/);
  assert.doesNotMatch(source, /health\.health === WORKER_HEALTH\.OFFLINE/);
});
