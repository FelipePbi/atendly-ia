/**
 * An error escaping a job handler must leave the job somewhere the
 * orchestrator can see.
 *
 * The incident, Goal 103 R2, 2026-10-03: after recovery requeued the round as
 * attempt a2, the Developer claimed it and the Work Unit executor threw
 * `[STAGE_NOT_RETRYABLE] Attempt 103-r2-unit-wu-06-a1 is FAILED`. The worker
 * loop logged JOB_FAILED, released the lease — and that was all. The job
 * stayed QUEUED (a2), the worker had cached that exact state as "evaluated"
 * and never looked at it again, and the orchestrator waited for a result that
 * nobody was going to produce. Removing the cause changed nothing; only
 * killing the worker did.
 *
 * Goal 101 R3 is the same defect in another shape: the capacity runner wrote
 * WAITING_FOR_CAPACITY, then threw CAPACITY_STATE_CORRUPT, and the job sat in
 * a capacity wait nobody was waiting on.
 *
 * No model is called anywhere in this file.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SpikeError } from '../lib/claude-process.mjs';
import { createJobStore } from '../lib/job-store.mjs';
import { createLeaseStore } from '../lib/leases.mjs';
import { evaluateJobEligibility, settleAttemptAfterError } from '../lib/worker-loop.mjs';
import { waitForResult } from '../lib/result-waiter.mjs';
import { requiresHuman } from '../lib/autonomous-state.mjs';

const ROLE = 'developer';
const JOB = '103-r2-correction-e12a1c81';
const a = (n) => `${JOB}-a${n}`;

async function withStore(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-settle-'));
  try {
    return await run(createJobStore(dir), dir);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

/** The job exactly as recovery left it: a1 INTERRUPTED, a2 QUEUED. */
async function seedRequeued(store) {
  await store.publishJob(ROLE, { jobId: JOB, role: ROLE, goal: '103', round: 2, worktree: 'W' });
  await store.setJobStatus(ROLE, JOB, 'INTERRUPTED');
  await store.startNextAttempt(ROLE, JOB, { reason: 'DIFFERENT_BOOT' });
  return a(2);
}

const notRetryable = () => new SpikeError('STAGE_NOT_RETRYABLE',
  'Attempt 103-r2-unit-wu-06-a1 is FAILED; a new attempt is not something a restart may assume.');

test('Goal 103 R2: the QUEUED attempt becomes FAILED with a HUMAN_REQUIRED result', async () => {
  await withStore(async (store) => {
    const attemptId = await seedRequeued(store);

    const settled = await settleAttemptAfterError({ store, role: ROLE, jobId: JOB, error: notRetryable() });

    assert.equal(settled.settled, true);
    assert.equal(settled.previousStatus, 'QUEUED');
    assert.equal(settled.attemptId, attemptId);

    const state = await store.readAttemptState(ROLE, JOB);
    assert.equal(state.status, 'FAILED');
    assert.equal(state.attemptStatus, 'FAILED');

    const result = await store.readResult(ROLE, JOB, { expectedAttemptId: attemptId });
    assert.equal(result.ok, false);
    assert.equal(result.escalation, 'HUMAN_REQUIRED');
    assert.equal(result.code, 'HARNESS_ERROR', 'STAGE_NOT_RETRYABLE is a harness code');
    assert.equal(result.errorCode, 'STAGE_NOT_RETRYABLE', 'and the original code is kept');
    assert.match(result.message, /103-r2-unit-wu-06-a1 is FAILED/);
    assert.ok(requiresHuman(result.code), 'run-auto files it under a reason it knows, not UNKNOWN_FATAL by default');

    const human = (await store.readEvents()).find((e) => e.type === 'HUMAN_REQUIRED');
    assert.equal(human.jobId, JOB);
    assert.equal(human.attemptId, attemptId);
    assert.equal(human.goal, '103', 'attributed to its Goal, so metrics read the Goal as paused for a human');
    assert.equal(human.errorCode, 'STAGE_NOT_RETRYABLE');
  });
});

test('the orchestrator waiting on that attempt gets the failure at once', async () => {
  await withStore(async (store) => {
    const attemptId = await seedRequeued(store);
    await settleAttemptAfterError({ store, role: ROLE, jobId: JOB, error: notRetryable() });

    const observed = await waitForResult(store, ROLE, JOB, {
      expectedAttemptId: attemptId, sleep: async () => { throw new Error('must not need to wait'); },
    });

    assert.equal(observed.envelope.ok, false);
    assert.equal(observed.attemptId, attemptId);
  });
});

test('the worker does not pick a failed job up again on its own', async () => {
  await withStore(async (store, dir) => {
    await seedRequeued(store);
    await settleAttemptAfterError({ store, role: ROLE, jobId: JOB, error: notRetryable() });

    const eligibility = await evaluateJobEligibility({
      store, leaseStore: createLeaseStore(dir), role: ROLE, jobId: JOB, seen: new Set(),
    });

    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.reason, 'TERMINAL', 'a FAILED attempt is a person\'s decision, not a retry loop');
  });
});

test('Goal 101 R3: a capacity wait the handler abandoned is settled too', async () => {
  await withStore(async (store) => {
    await store.publishJob(ROLE, { jobId: JOB, role: ROLE, goal: '101', round: 3, worktree: 'W' });
    await store.setJobStatus(ROLE, JOB, 'WAITING_FOR_CAPACITY');

    const settled = await settleAttemptAfterError({
      store, role: ROLE, jobId: JOB,
      error: new SpikeError('CAPACITY_STATE_CORRUPT', 'resumeFrom "REVIEW_REQUIRED" is not a resumable state'),
    });

    assert.equal(settled.settled, true);
    assert.equal(settled.previousStatus, 'WAITING_FOR_CAPACITY');
    assert.equal((await store.readAttemptState(ROLE, JOB)).status, 'FAILED');
  });
});

test('an error nobody classified is UNKNOWN_FATAL, still with its own code', async () => {
  await withStore(async (store) => {
    await seedRequeued(store);

    await settleAttemptAfterError({ store, role: ROLE, jobId: JOB, error: new TypeError('x is not a function') });

    const result = await store.readResult(ROLE, JOB, { expectedAttemptId: a(2) });
    assert.equal(result.code, 'UNKNOWN_FATAL');
    assert.equal(result.errorCode, 'UNEXPECTED');
    assert.match(result.message, /x is not a function/);
  });
});

test('a job the handler already settled is never touched', async () => {
  await withStore(async (store) => {
    await seedRequeued(store);
    await store.publishResult(ROLE, JOB, { ok: true, result: { status: 'DONE' } }, { attemptId: a(2) });
    await store.setJobStatus(ROLE, JOB, 'COMPLETED');

    const settled = await settleAttemptAfterError({ store, role: ROLE, jobId: JOB, error: notRetryable() });

    assert.equal(settled.settled, false);
    assert.equal(settled.reason, 'ALREADY_TERMINAL');
    assert.equal((await store.readResult(ROLE, JOB, { expectedAttemptId: a(2) })).ok, true);
  });
});

test('a result already on disk for the attempt is never overwritten', async () => {
  await withStore(async (store) => {
    await seedRequeued(store);
    await store.setJobStatus(ROLE, JOB, 'RUNNING');
    // The handler answered, then failed before marking the job COMPLETED.
    await store.publishResult(ROLE, JOB, { ok: true, result: { status: 'DONE' } }, { attemptId: a(2) });

    const settled = await settleAttemptAfterError({ store, role: ROLE, jobId: JOB, error: notRetryable() });

    assert.equal(settled.settled, false);
    assert.equal(settled.reason, 'RESULT_ON_DISK');
    assert.equal((await store.readResult(ROLE, JOB, { expectedAttemptId: a(2) })).ok, true, 'the answer survives');
  });
});

test('the worker loop settles a claimed attempt and re-evaluates one it never claimed', async () => {
  const source = await readFile(new URL('../lib/worker-loop.mjs', import.meta.url), 'utf8');
  const catchAt = source.indexOf("await store.appendEvent({ type: 'JOB_FAILED'");
  const finallyAt = source.indexOf('} finally {', catchAt);
  assert.ok(catchAt > 0 && finallyAt > catchAt);
  const handler = source.slice(catchAt, finallyAt);
  assert.match(handler, /if \(claimed\?\.acquired\)/);
  assert.match(handler, /settleAttemptAfterError\(/);
  assert.match(handler, /seen\.delete\(eligibility\.seenKey\)/,
    'an attempt that was not settled must not stay cached as evaluated');
  // Settled BEFORE the finally releases the lease: there is never a window in
  // which the job is QUEUED or RUNNING with nobody holding it.
  assert.ok(source.indexOf('settleAttemptAfterError(', catchAt) < finallyAt);
});
