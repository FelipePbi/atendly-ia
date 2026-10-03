/**
 * M-11: a pause "at the next safe boundary" was only honoured after ACCEPTED.
 *
 * run-auto consulted the pause after a Goal's decision and at the Goal
 * boundary, but correction rounds run inside run-goal, a child process. On
 * 2026-10-03 a pause requested during R1 of Goal 106 crossed review R1,
 * correction R2, review R2 and correction R3 without stopping.
 *
 * The fix adds BEFORE_CORRECTION: after a CHANGES_REQUIRED decision is on disk
 * and before the next correction job exists. run-goal detects it and exits
 * cleanly; run-auto records the pause; `ia-loop:auto` resumes the SAME Goal at
 * the queued round through reconciliation, with nothing re-reviewed and
 * nothing re-published.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  PAUSE_BOUNDARIES,
  RUN_STATUS,
  createAutonomousStore,
  pauseBeforeCorrection,
  recordGoalPhasePause,
  shouldPauseAt,
} from '../lib/autonomous-state.mjs';
import { STORE_VERSION, clearPerGoalRuntime, createJobStore, writeJsonAtomic } from '../lib/job-store.mjs';
import { DISPATCH_KINDS, reconcileExecutionState, resolveStageJobId } from '../lib/reconcile.mjs';
import { STAGES } from '../lib/stage-identity.mjs';
import { PROTOCOL_VERSION_V2 } from '../lib/contracts-v2.mjs';
import { LOOP_STATES } from '../lib/loop-state.mjs';

const GOAL = '106';
const BASELINE = 'b'.repeat(40);
const DEV_R1 = '106-r1-developer-aaaa1111';
const REV_R1 = '106-r1-tech_lead-bbbb2222';
const R1_BLOCKERS = ['R1-01 (P1): the empty state does not match the prototype'];

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-m11-'));
  try { return await run(dir); } finally { await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

const jobRecord = (jobId, role, round, status) => ({
  storeVersion: STORE_VERSION,
  publishedAt: '2026-10-03T10:00:00.000Z',
  status, attempt: 1, currentAttemptId: `${jobId}-a1`, attemptStatus: status, attemptHistory: [],
  job: {
    protocolVersion: PROTOCOL_VERSION_V2, jobId, role, goal: GOAL, round,
    type: role === 'developer' ? (round === 1 ? 'IMPLEMENTATION' : 'CORRECTION') : undefined,
  },
});

/** Goal 106 right after review R1 asked for changes: R2 not dispatched yet. */
async function seedReviewedR1(store) {
  for (const role of ['developer', 'tech_lead']) {
    await mkdir(store.paths.jobsDir(role), { recursive: true });
    await mkdir(store.paths.resultsDir(role), { recursive: true });
  }
  await writeJsonAtomic(store.paths.job('developer', DEV_R1), jobRecord(DEV_R1, 'developer', 1, 'COMPLETED'));
  await store.publishResult('developer', DEV_R1, {
    ok: true, result: { protocolVersion: PROTOCOL_VERSION_V2, jobId: DEV_R1, goal: GOAL, round: 1, status: 'REVIEW_REQUIRED' },
  }, { attemptId: `${DEV_R1}-a1` });

  await writeJsonAtomic(store.paths.job('tech_lead', REV_R1), jobRecord(REV_R1, 'tech_lead', 1, 'COMPLETED'));
  await store.publishResult('tech_lead', REV_R1, {
    ok: true, result: {
      protocolVersion: PROTOCOL_VERSION_V2, jobId: REV_R1, goal: GOAL, round: 1,
      decision: 'CHANGES_REQUIRED', blockers: R1_BLOCKERS,
      nextDeveloperProfile: 'OPUS_HIGH', nextDeveloperProfileReason: 'layout fidelity needs the stronger model',
      correctionScope: 'CODE_OR_EVIDENCE',
    },
  }, { attemptId: `${REV_R1}-a1` });

  // What run-goal persisted in the CHANGES_REQUIRED branch, before the pause.
  await store.writeRuntime({
    mode: 'REAL_EXECUTION', goal: GOAL, state: LOOP_STATES.CORRECTION_QUEUED, round: 1,
    decision: 'CHANGES_REQUIRED', blockers: R1_BLOCKERS,
    nextDeveloperProfile: { profile: 'OPUS_HIGH', reason: 'layout fidelity needs the stronger model', round: 2, selectedBy: 'tech_lead' },
    pausedAtBoundary: null,
  });
}

async function startRun(dir, { pause = null } = {}) {
  const auto = createAutonomousStore(dir);
  await auto.start({ fromGoal: GOAL, migrationAcceptedBaseline: BASELINE });
  if (pause === 'plain') await auto.requestPause();
  if (pause === 'after-goal') await auto.requestPause({ afterGoal: true });
  return auto;
}

// ---------------------------------------------------------------------------
// The boundary itself
// ---------------------------------------------------------------------------

test('BEFORE_CORRECTION is part of the one pause vocabulary', () => {
  assert.equal(PAUSE_BOUNDARIES.BEFORE_CORRECTION, 'BEFORE_CORRECTION');
  assert.equal(PAUSE_BOUNDARIES.AFTER_DECISION, 'AFTER_DECISION');
  assert.equal(PAUSE_BOUNDARIES.GOAL_BOUNDARY, 'GOAL_BOUNDARY');
  assert.ok(Object.isFrozen(PAUSE_BOUNDARIES));
});

test('a plain pause stops before a correction; an --after-goal pause does not', () => {
  const at = { boundary: PAUSE_BOUNDARIES.BEFORE_CORRECTION };
  assert.deepEqual(shouldPauseAt({ pauseRequested: true, pauseAfterGoal: false }, at),
    { pause: true, reason: 'PAUSE_REQUESTED' });
  assert.deepEqual(shouldPauseAt({ pauseRequested: true, pauseAfterGoal: true }, at), { pause: false });
  assert.deepEqual(shouldPauseAt({ pauseRequested: false }, at), { pause: false });
});

// ---------------------------------------------------------------------------
// run-goal's half: detect and leave a marker, nothing else
// ---------------------------------------------------------------------------

test('a plain pause is honoured before the correction round, with a marker for run-auto', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    await seedReviewedR1(store);
    const auto = await startRun(dir, { pause: 'plain' });

    const pause = await pauseBeforeCorrection({
      auto, store, goal: GOAL, round: 2, state: LOOP_STATES.CORRECTION_QUEUED, autonomous: true,
    });
    assert.equal(pause.pause, true);
    assert.equal(pause.boundary, PAUSE_BOUNDARIES.BEFORE_CORRECTION);

    const runtime = await store.readRuntime();
    assert.equal(runtime.state, LOOP_STATES.CORRECTION_QUEUED);
    assert.equal(runtime.pausedAtBoundary.boundary, PAUSE_BOUNDARIES.BEFORE_CORRECTION);
    assert.equal(runtime.pausedAtBoundary.goal, GOAL);
    assert.equal(runtime.pausedAtBoundary.round, 2);
    assert.equal(runtime.pausedAtBoundary.reason, 'PAUSE_REQUESTED');
    // The decision run-goal already persisted is untouched.
    assert.equal(runtime.decision, 'CHANGES_REQUIRED');
    assert.deepEqual(runtime.blockers, R1_BLOCKERS);
    assert.equal(runtime.nextDeveloperProfile.profile, 'OPUS_HIGH');

    // Detecting is not recording: the run itself is still RUNNING until run-auto says so.
    assert.equal((await auto.read()).status, RUN_STATUS.RUNNING);
  });
});

test('an --after-goal pause is NOT honoured before a correction', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    await seedReviewedR1(store);
    const auto = await startRun(dir, { pause: 'after-goal' });
    const before = await store.readRuntime();

    const pause = await pauseBeforeCorrection({ auto, store, goal: GOAL, round: 2, autonomous: true });
    assert.equal(pause.pause, false);
    assert.deepEqual(await store.readRuntime(), before, 'no marker, no write');
  });
});

test('no pause requested: nothing changes', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    await seedReviewedR1(store);
    const auto = await startRun(dir);
    const before = await store.readRuntime();

    const pause = await pauseBeforeCorrection({ auto, store, goal: GOAL, round: 2, autonomous: true });
    assert.equal(pause.pause, false);
    assert.deepEqual(await store.readRuntime(), before);

    const recorded = await recordGoalPhasePause({
      auto, store, runtime: await store.readRuntime(), goalId: GOAL, autonomousRunId: (await auto.read()).autonomousRunId,
    });
    assert.equal(recorded.paused, false);
    assert.equal((await auto.read()).status, RUN_STATUS.RUNNING);
    assert.equal((await store.readEvents()).filter((e) => e.type === 'AUTONOMOUS_RUN_PAUSED').length, 0);
  });
});

test('a supervised run-goal never consults an autonomous pause request', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    await seedReviewedR1(store);
    const auto = await startRun(dir, { pause: 'plain' });

    const pause = await pauseBeforeCorrection({ auto, store, goal: GOAL, round: 2, autonomous: false });
    assert.equal(pause.pause, false);
    assert.equal((await store.readRuntime()).pausedAtBoundary, null);
  });
});

// ---------------------------------------------------------------------------
// run-auto's half: record the pause, never read it as a failed Goal
// ---------------------------------------------------------------------------

test('run-auto records the phase pause with the existing status and event', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    await seedReviewedR1(store);
    const auto = await startRun(dir, { pause: 'plain' });
    await pauseBeforeCorrection({ auto, store, goal: GOAL, round: 2, autonomous: true });

    const run = await auto.read();
    const recorded = await recordGoalPhasePause({
      auto, store, runtime: await store.readRuntime(), goalId: GOAL, autonomousRunId: run.autonomousRunId,
    });
    assert.equal(recorded.paused, true);
    assert.equal(recorded.round, 2);

    const paused = await auto.read();
    assert.equal(paused.status, RUN_STATUS.PAUSED);
    assert.equal(paused.pauseReason, 'PAUSE_REQUESTED');
    assert.equal(paused.currentGoal, GOAL, 'the run still points at the same Goal');

    const events = (await store.readEvents()).filter((e) => e.type === 'AUTONOMOUS_RUN_PAUSED');
    assert.equal(events.length, 1);
    assert.equal(events[0].boundary, PAUSE_BOUNDARIES.BEFORE_CORRECTION);
    assert.equal(events[0].goal, GOAL);
    assert.equal(events[0].round, 2);
  });
});

test('a marker from another Goal, or one cleared by a new phase, pauses nothing', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    const auto = await startRun(dir, { pause: 'plain' });
    const { autonomousRunId } = await auto.read();
    const marker = { boundary: PAUSE_BOUNDARIES.BEFORE_CORRECTION, reason: 'PAUSE_REQUESTED', goal: '105', round: 2 };

    for (const runtime of [
      { goal: '105', pausedAtBoundary: marker },
      { goal: GOAL, pausedAtBoundary: marker },
      { goal: GOAL, pausedAtBoundary: null },
      null,
    ]) {
      const recorded = await recordGoalPhasePause({ auto, store, runtime, goalId: GOAL, autonomousRunId });
      assert.equal(recorded.paused, false);
    }
    assert.equal((await auto.read()).status, RUN_STATUS.RUNNING);
    assert.equal(clearPerGoalRuntime({ pausedAtBoundary: marker }).pausedAtBoundary, undefined,
      'the marker never crosses a Goal boundary');
  });
});

// ---------------------------------------------------------------------------
// Resume: same Goal, queued round, persisted data, nothing re-run
// ---------------------------------------------------------------------------

test('resume continues the same Goal at the queued round with the persisted review data', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    await seedReviewedR1(store);
    const auto = await startRun(dir, { pause: 'plain' });

    await pauseBeforeCorrection({ auto, store, goal: GOAL, round: 2, autonomous: true });
    await recordGoalPhasePause({
      auto, store, runtime: await store.readRuntime(), goalId: GOAL, autonomousRunId: (await auto.read()).autonomousRunId,
    });
    // run-auto exits; its finally gives the loop lease back.
    await auto.releaseLoopLease();
    const jobsAtPause = {
      developer: await store.listJobs('developer'), tech_lead: await store.listJobs('tech_lead'),
    };

    // `npm run ia-loop:auto` with no args: attach, then clear the pause.
    const attached = await auto.attach();
    assert.equal(attached.attached, true);
    assert.equal(attached.run.status, RUN_STATUS.PAUSED);
    const resumed = await auto.clearPause();
    assert.equal(resumed.status, RUN_STATUS.RUNNING);
    assert.equal(resumed.currentGoal, GOAL);

    // run-goal starts again for the same Goal and clears the stale marker.
    await store.writeRuntime({ ...(await store.readRuntime()), pausedAtBoundary: null });

    // Reconciliation lands on the queued correction round, carrying the review's data.
    const reconciled = await reconcileExecutionState({ store, goal: GOAL, maxRounds: 3 });
    assert.equal(reconciled.next.kind, DISPATCH_KINDS.CORRECTION);
    assert.equal(reconciled.next.round, 2);
    assert.deepEqual(reconciled.next.blockers, R1_BLOCKERS);
    assert.equal(reconciled.next.nextDeveloperProfile, 'OPUS_HIGH');
    assert.equal(reconciled.next.correctionScope, 'CODE_OR_EVIDENCE');
    assert.equal(reconciled.next.fromReviewJobId, REV_R1, 'the review is read, never re-run');
    // The escalation run-goal persisted is what it seeds the round from.
    assert.equal((await store.readRuntime()).nextDeveloperProfile.round, reconciled.next.round);

    // Nothing was published while paused, and the correction is still a fresh dispatch.
    assert.deepEqual({
      developer: await store.listJobs('developer'), tech_lead: await store.listJobs('tech_lead'),
    }, jobsAtPause);
    assert.equal(resolveStageJobId({
      ledger: reconciled.ledger, goal: GOAL, round: 2, stage: STAGES.CORRECTION,
    }).jobId, null);

    // And the boundary does not stop the resumed run a second time.
    const again = await pauseBeforeCorrection({ auto, store, goal: GOAL, round: 2, autonomous: true });
    assert.equal(again.pause, false);
    assert.equal((await store.readRuntime()).pausedAtBoundary, null);
  });
});

test('a correction already dispatched is not a pause point: its attempt is in flight', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    await seedReviewedR1(store);
    const dev2 = '106-r2-correction-cccc3333';
    await writeJsonAtomic(store.paths.job('developer', dev2), jobRecord(dev2, 'developer', 2, 'RUNNING'));

    const reconciled = await reconcileExecutionState({ store, goal: GOAL, maxRounds: 3 });
    assert.equal(resolveStageJobId({
      ledger: reconciled.ledger, goal: GOAL, round: 2, stage: STAGES.CORRECTION,
    }).jobId, dev2, 'run-goal gates the pause on this being null');
  });
});

// ---------------------------------------------------------------------------
// Wiring: where the two halves sit in the entry points
// ---------------------------------------------------------------------------

test('run-goal consults the boundary only for an undispatched correction, before any dispatch', async () => {
  const source = await readFile(new URL('../run-goal.mjs', import.meta.url), 'utf8');
  const loopStart = source.indexOf('for (;;) {');
  const check = source.indexOf('pauseBeforeCorrection({');
  const routing = source.indexOf('resolveProfileForRound({', loopStart);
  const firstDispatch = source.indexOf("store.dispatchJob('developer'", loopStart);
  assert.ok(loopStart > 0 && check > loopStart, 'checked inside the round loop');
  assert.ok(check < routing, 'before the round consumes the profile escalation');
  assert.ok(check < firstDispatch, 'before any correction job is published');
  assert.match(source, /isCorrection && !resolveStageJobId\(\{\s*ledger: reconciled\.ledger, goal: goal\.goalId, round, stage: STAGES\.CORRECTION,/);
  assert.match(source, /autonomous: process\.env\.IA_LOOP_AUTONOMOUS === '1'/);
  assert.match(source, /pausedAtBoundary: null/, 'every new phase clears the previous marker');
});

test('run-auto records a phase pause before reading the Goal as failed', async () => {
  const source = await readFile(new URL('../run-auto.mjs', import.meta.url), 'utf8');
  const record = source.indexOf('recordGoalPhasePause({');
  const failure = source.indexOf("if (goalPhase.code !== 0 || decision !== 'ACCEPTED')");
  assert.ok(record > 0 && record < failure);
  assert.doesNotMatch(source, /boundary: '(AFTER_DECISION|GOAL_BOUNDARY|BEFORE_CORRECTION)'/,
    'boundaries come from PAUSE_BOUNDARIES, never a second spelling');
});
