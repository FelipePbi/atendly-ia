/**
 * `ia-loop:pause --wait`: when is it safe to commit to the main checkout?
 *
 * Written from the incident where an operator committed to main while a Tech
 * Lead criteria-coverage job was still running beside the Developer
 * correction. The round died as MAIN_CHECKOUT_MUTATED: nothing had told the
 * operator that "PAUSED" was not yet true, or that a second job was alive.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RUN_STATUS, LOOP_LEASE_KEY, createAutonomousStore } from '../lib/autonomous-state.mjs';
import { createJobStore } from '../lib/job-store.mjs';
import { createLeaseStore } from '../lib/leases.mjs';
import { writeHeartbeat } from '../lib/worker-registry.mjs';
import {
  SAFE_WINDOW_BLOCKERS as B,
  judgeSafeWindow,
  parseDuration,
  readSafeWindowFacts,
  waitForSafeWindow,
} from '../lib/pause-safety.mjs';
import {
  DEFAULT_WAIT_TIMEOUT_MS,
  EXIT_WAIT_TIMED_OUT,
  parsePauseArgs,
  waitAndReport,
} from '../run-pause.mjs';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const fresh = (over = {}) => ({ heartbeatAt: new Date(NOW - 1_000).toISOString(), ...over });
const codes = (judgement) => judgement.blockers.map((b) => b.code);

async function withStateDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-pause-safety-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

// ---------------------------------------------------------------------------
// The judgement
// ---------------------------------------------------------------------------

test('paused, no orchestrator, no lease and idle workers: safe', () => {
  const judgement = judgeSafeWindow({
    run: { autonomousRunId: 'auto-1', status: RUN_STATUS.PAUSED },
    workers: [{ role: 'tech_lead', health: 'RUNNING', state: 'IDLE' }],
    now: NOW,
  });
  assert.equal(judgement.safe, true);
  assert.deepEqual(judgement.blockers, []);
});

test('PAUSED is not enough while the orchestrator still holds the loop', () => {
  // run-auto marks the run PAUSED and only then releases its lease on the way
  // out; between the two it can still write.
  const judgement = judgeSafeWindow({
    run: { autonomousRunId: 'auto-1', status: RUN_STATUS.PAUSED },
    loopLease: fresh({ jobId: LOOP_LEASE_KEY, workerInstanceId: 'host:1' }),
    jobLeases: [fresh({ jobId: LOOP_LEASE_KEY })],
    now: NOW,
  });
  assert.equal(judgement.safe, false);
  assert.deepEqual(codes(judgement), [B.ORCHESTRATOR_HOLDS_LOOP],
    'the loop lease is reported once, not again as a job lease');
});

test('the incident: run paused but a Tech Lead job still leased is NOT safe', () => {
  const judgement = judgeSafeWindow({
    run: { autonomousRunId: 'auto-1', status: RUN_STATUS.PAUSED },
    jobLeases: [fresh({ jobId: '106-r1-criteria-coverage', agent: 'tech_lead' })],
    worktreeLeases: [fresh({ worktreePath: 'E:/x/.ai-worktrees/goal-106', key: 'k' })],
    now: NOW,
  });
  assert.equal(judgement.safe, false);
  assert.deepEqual(codes(judgement), [B.JOB_LEASE_HELD, B.WORKTREE_LEASE_HELD]);
  assert.match(judgement.blockers[0].detail, /106-r1-criteria-coverage.*tech_lead.*ACTIVE/);
});

test('a STALE lease still blocks: expiry is not proof the holder stopped', () => {
  const judgement = judgeSafeWindow({
    run: { autonomousRunId: 'auto-1', status: RUN_STATUS.PAUSED },
    jobLeases: [{ jobId: '106-r1', agent: 'developer', heartbeatAt: new Date(NOW - 3_600_000).toISOString() }],
    now: NOW,
  });
  assert.equal(judgement.safe, false);
  assert.match(judgement.blockers[0].detail, /SUSPECTED_ORPHAN/);
});

test('a RUNNING run blocks, and one with no orchestrator says waiting cannot end', () => {
  const driven = judgeSafeWindow({
    run: { autonomousRunId: 'auto-1', status: RUN_STATUS.RUNNING, pauseRequested: true },
    loopLease: fresh({ jobId: LOOP_LEASE_KEY }),
    now: NOW,
  });
  assert.deepEqual(codes(driven), [B.RUN_RUNNING, B.ORCHESTRATOR_HOLDS_LOOP]);
  assert.match(driven.blockers[0].detail, /pause requested/);

  const orphan = judgeSafeWindow({ run: { autonomousRunId: 'auto-1', status: RUN_STATUS.RUNNING }, now: NOW });
  assert.deepEqual(codes(orphan), [B.RUN_RUNNING_WITHOUT_ORCHESTRATOR]);
  assert.match(orphan.blockers[0].detail, /nothing will move it to PAUSED/);
});

test('PAUSED_FOR_HUMAN, COMPLETED and no run do not block on the run itself', () => {
  for (const run of [
    { autonomousRunId: 'a', status: RUN_STATUS.PAUSED_FOR_HUMAN },
    { autonomousRunId: 'a', status: RUN_STATUS.COMPLETED },
    null,
  ]) {
    assert.equal(judgeSafeWindow({ run, now: NOW }).safe, true, JSON.stringify(run));
  }
});

test('a busy worker blocks even without a lease; an OFFLINE one never does', () => {
  // WAITING_FOR_CAPACITY releases nothing it will not take back: the job is
  // retried by itself when the limit lifts.
  const judgement = judgeSafeWindow({
    run: { autonomousRunId: 'a', status: RUN_STATUS.PAUSED },
    workers: [
      { role: 'developer', health: 'RUNNING', state: 'WAITING_FOR_CAPACITY' },
      { role: 'tech_lead', health: 'OFFLINE', state: 'WORKING' },
    ],
    now: NOW,
  });
  assert.deepEqual(codes(judgement), [B.WORKER_BUSY]);
  assert.match(judgement.blockers[0].detail, /developer worker is WAITING_FOR_CAPACITY/);
});

// ---------------------------------------------------------------------------
// Reading the facts from disk
// ---------------------------------------------------------------------------

test('reads run, loop lease, job and worktree leases and workers from the state dir', async () => {
  await withStateDir(async (dir) => {
    const auto = createAutonomousStore(dir);
    const leases = createLeaseStore(dir);
    const store = createJobStore(dir);

    let facts = await readSafeWindowFacts(dir);
    assert.equal(judgeSafeWindow(facts).safe, true, 'an empty state dir is safe');

    await auto.start({ fromGoal: '106', migrationAcceptedBaseline: 'b'.repeat(40) });
    await leases.claimJob('106-r1-criteria', { attemptId: '106-r1-criteria-a1', agent: 'tech_lead' });
    await leases.claimWorktree('E:/x/.ai-worktrees/goal-106', { jobId: '106-r1-criteria', agent: 'tech_lead' });
    await writeHeartbeat(store, 'developer', { state: 'WORKING', model: 'm', sessionStrategy: 'STATELESS' });
    // History and markers next to the live files are not holders.
    await mkdir(leases.paths.worktreesDir, { recursive: true });
    await writeFile(join(leases.paths.worktreesDir, 'old.lock.superseded'), '{}');

    facts = await readSafeWindowFacts(dir);
    assert.deepEqual(codes(judgeSafeWindow(facts)), [
      B.RUN_RUNNING, B.ORCHESTRATOR_HOLDS_LOOP, B.JOB_LEASE_HELD, B.WORKTREE_LEASE_HELD, B.WORKER_BUSY,
    ]);

    await auto.markPaused('OPERATOR_REQUESTED');
    await auto.releaseLoopLease();
    await leases.releaseJob('106-r1-criteria', { force: true });
    await leases.releaseWorktree('E:/x/.ai-worktrees/goal-106', { force: true });
    await writeHeartbeat(store, 'developer', { state: 'IDLE', model: 'm', sessionStrategy: 'STATELESS' });

    facts = await readSafeWindowFacts(dir);
    assert.equal(judgeSafeWindow(facts).safe, true, JSON.stringify(judgeSafeWindow(facts).blockers));
  });
});

// ---------------------------------------------------------------------------
// The wait
// ---------------------------------------------------------------------------

function fakeClock() {
  let t = NOW;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

test('the wait ends as soon as the last holder lets go, reporting only real changes', async () => {
  const clock = fakeClock();
  const states = [
    { run: { autonomousRunId: 'a', status: RUN_STATUS.RUNNING }, loopLease: fresh({ jobId: LOOP_LEASE_KEY }) },
    { run: { autonomousRunId: 'a', status: RUN_STATUS.RUNNING }, loopLease: fresh({ jobId: LOOP_LEASE_KEY }) },
    { run: { autonomousRunId: 'a', status: RUN_STATUS.PAUSED }, jobLeases: [fresh({ jobId: 'j', agent: 'tech_lead' })] },
    { run: { autonomousRunId: 'a', status: RUN_STATUS.PAUSED } },
  ];
  let reads = 0;
  const progress = [];
  const outcome = await waitForSafeWindow({
    read: async () => states[Math.min(reads++, states.length - 1)],
    timeoutMs: 3_600_000,
    pollMs: 10_000,
    ...clock,
    onProgress: (j) => progress.push(j.safe ? 'SAFE' : codes(j).join('+')),
  });
  assert.equal(outcome.safe, true);
  assert.equal(reads, 4);
  assert.equal(outcome.waitedMs, 30_000);
  assert.deepEqual(progress, ['RUN_RUNNING+ORCHESTRATOR_HOLDS_LOOP', 'JOB_LEASE_HELD', 'SAFE'],
    'the identical second poll printed nothing');
});

test('the wait times out with the remaining blockers, and an unreadable state never counts as safe', async () => {
  const clock = fakeClock();
  let calls = 0;
  const outcome = await waitForSafeWindow({
    read: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('half-written'), { code: 'LEASE_CORRUPT' });
      return { run: { autonomousRunId: 'a', status: RUN_STATUS.PAUSED }, jobLeases: [fresh({ jobId: 'j' })] };
    },
    timeoutMs: 60_000,
    pollMs: 25_000,
    ...clock,
  });
  assert.equal(outcome.safe, false);
  assert.equal(outcome.timedOut, true);
  assert.equal(outcome.waitedMs, 60_000, 'the last sleep is clipped to the deadline');
  assert.deepEqual(outcome.blockers.map((b) => b.code), [B.JOB_LEASE_HELD]);

  const unreadable = await waitForSafeWindow({
    read: async () => { throw Object.assign(new Error('locked'), { code: 'LEASE_IO_FAILED' }); },
    timeoutMs: 1, pollMs: 1, ...fakeClock(),
  });
  assert.equal(unreadable.safe, false);
  assert.equal(unreadable.blockers[0].code, B.STATE_UNREADABLE);
});

test('the operator output: one SAFE line and exit 0, or NOT SAFE with blockers and exit 2', async () => {
  const lines = [];
  const safe = await waitAndReport({
    read: async () => ({ run: { autonomousRunId: 'a', status: RUN_STATUS.PAUSED } }),
    timeoutMs: 60_000, pollMs: 10_000, log: (l) => lines.push(l), ...fakeClock(),
  });
  assert.equal(safe, 0);
  assert.ok(lines.some((l) => l.startsWith('SAFE TO CHANGE THE MAIN CHECKOUT')), lines.join('\n'));
  assert.ok(lines.some((l) => l.includes('npm run ia-loop:auto')), 'a pause is resumed by ia-loop:auto');

  const out = [];
  const stuck = await waitAndReport({
    read: async () => ({ run: { autonomousRunId: 'a', status: RUN_STATUS.PAUSED }, jobLeases: [fresh({ jobId: 'j-9' })] }),
    timeoutMs: 30_000, pollMs: 10_000, log: (l) => out.push(l), ...fakeClock(),
  });
  assert.equal(stuck, EXIT_WAIT_TIMED_OUT);
  assert.notEqual(stuck, 0);
  assert.ok(out.some((l) => l.startsWith('NOT SAFE')), out.join('\n'));
  assert.ok(out.some((l) => l.includes('j-9')));
  assert.ok(!out.some((l) => l.startsWith('SAFE TO CHANGE')));
});

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

test('flags: --wait with defaults, explicit timeout and poll, and loud failures', () => {
  assert.deepEqual(parsePauseArgs([]),
    { afterGoal: false, wait: false, timeoutMs: DEFAULT_WAIT_TIMEOUT_MS, pollMs: 10_000 });
  assert.deepEqual(parsePauseArgs(['--after-goal', '--wait', '--timeout', '90m', '--poll', '5']),
    { afterGoal: true, wait: true, timeoutMs: 90 * 60_000, pollMs: 5_000 });
  assert.equal(parsePauseArgs(['--wait', '--timeout', '2h']).timeoutMs, 7_200_000);

  assert.throws(() => parsePauseArgs(['--wait', '--timeout', '2hours']), /--timeout must be like/);
  assert.throws(() => parsePauseArgs(['--wait', '--timeout']), /needs a value/);
  assert.throws(() => parsePauseArgs(['--timeout', '1h']), /only apply with --wait/);
  assert.throws(() => parsePauseArgs(['--wiat']), /Unknown option/);
});

test('durations: minutes by default, s/m/h/ms suffixes, nonsense rejected', () => {
  assert.equal(parseDuration('30'), 30 * 60_000);
  assert.equal(parseDuration('300s'), 300_000);
  assert.equal(parseDuration('1.5h'), 5_400_000);
  assert.equal(parseDuration('250ms'), 250);
  assert.equal(parseDuration('0'), null);
  assert.equal(parseDuration('-5m'), null);
  assert.equal(parseDuration('soon'), null);
});
