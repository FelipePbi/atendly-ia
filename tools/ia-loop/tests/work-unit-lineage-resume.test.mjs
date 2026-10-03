/**
 * Resuming a round whose gate already failed, was corrected and re-ran.
 *
 * Goal 103, correction round 2: WU-06 (validate-core) FAILED, DIAG-001
 * diagnosed it, WU-06-g2 PASSED; then WU-07 FAILED and DIAG-002 ended FAILED
 * before the machine went down. The resume re-dispatched WU-06 under its
 * original id and died on STAGE_NOT_RETRYABLE, because the DAG did not know
 * the -g2 job and the DIAG unit were the rest of that unit's story.
 *
 * The fixture under `fixtures/goal-103-r2-lineage` is that store, as the
 * operator quarantined it (plus the units that had completed before it, and
 * the two FIX_CREATED events of the round). The properties pinned here:
 *
 *   - a FAILED unit is replayed, never retried: its attempt is untouched;
 *   - a corrective unit comes back under the id it ran as, and the gate comes
 *     back as the -gN job it already is, so a passed re-run is reused;
 *   - a diagnosis that did not finish resumes as the diagnosis, not as the
 *     gate it was created for;
 *   - nothing re-emits the FIX_CREATED link outcome attribution counts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJobStore, WORK_UNIT_NAMESPACE } from '../lib/job-store.mjs';
import { LOOP_STATES } from '../lib/loop-state.mjs';
import { PROTOCOL_VERSION_V2 } from '../lib/contracts-v2.mjs';
import { validateExecutionPlan } from '../lib/work-units.mjs';
import { executeWorkUnitPlan, workUnitJobId } from '../lib/work-unit-executor.mjs';
import { workUnitConfig } from '../lib/work-unit-config.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/goal-103-r2-lineage/', import.meta.url));

// validate-integration declares databases; with them present the executor
// runs the (fake) action directly instead of provisioning a cluster.
const INTEGRATION_ENV = [
  'BFF_TEST_DATABASE_URL',
  'AI_TEST_DATABASE_URL',
  'EVOLUTION_TEST_DATABASE_URL',
  'SCHEDULING_TEST_DATABASE_URL',
];

async function withEnv(run) {
  const saved = INTEGRATION_ENV.map((name) => [name, process.env[name]]);
  for (const name of INTEGRATION_ENV) process.env[name] = 'postgres://fake/test';
  try {
    return await run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function withStore(run, { fixture = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-lineage-'));
  try {
    if (fixture) await cp(FIXTURE, dir, { recursive: true });
    return await withEnv(() => run(createJobStore(dir), dir));
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

function ok(payload, validatePayload) {
  if (validatePayload) validatePayload(payload);
  return { error: null, structuredOutput: true, available: true, payload };
}

const completed = (goal, round, unitJobId, unit, over = {}) => ({
  protocolVersion: PROTOCOL_VERSION_V2,
  jobId: unitJobId,
  goal,
  round,
  workUnitId: unit.id,
  status: 'COMPLETED',
  summary: `${unit.id} feito`,
  report: `relatório de ${unit.id}`,
  changedFiles: [],
  acceptance: unit.acceptanceCriteria.map((criterion) => ({ criterion, met: true })),
  ...over,
});

const fakeAction = (passes, { stderr = '' } = {}) => ({
  ok: passes,
  exitCode: passes ? 0 : 1,
  signal: null,
  error: null,
  durationMs: 5,
  stdout: '',
  stderr,
});

const gate = (id, action, dependencies, over = {}) => ({
  id,
  objective: `Rodar ${action}`,
  type: 'DETERMINISTIC',
  action,
  dependencies,
  acceptanceCriteria: [],
  ...over,
});

// ===========================================================================
// The Goal 103 store, as it was found
// ===========================================================================

const G103 = '103';
const R2 = 2;
const ROUND_JOB = { jobId: '103-r2-correction-e12a1c81', goal: G103, round: R2 };

/** The correction plan the round resolved, in the order its events recorded. */
const plan103 = () => validateExecutionPlan({
  goal: G103,
  workUnits: [
    {
      id: 'FIX-001',
      objective: 'Corrigir o que a review apontou',
      type: 'STANDARD',
      dependencies: [],
      acceptanceCriteria: ['Correção entregue'],
    },
    gate('WU-03', 'typecheck', ['FIX-001'], { scope: 'apps/scheduling-service' }),
    gate('WU-04', 'typecheck', ['FIX-001'], { scope: 'apps/bff' }),
    gate('WU-05', 'targeted-tests', ['FIX-001'], { scope: 'apps/scheduling-service', pattern: 'goal103' }),
    gate('WU-09', 'git-diff-check', ['FIX-001']),
    gate('WU-06', 'validate-core', ['WU-03', 'WU-04', 'WU-05']),
    gate('WU-07', 'validate-integration', ['WU-06']),
  ],
}, { goal: G103 });

const run103 = (store, over = {}) => executeWorkUnitPlan({
  store,
  plan: plan103(),
  job: ROUND_JOB,
  goal: G103,
  round: R2,
  worktree: '.ai-worktrees/goal-103',
  executionBase: 'a'.repeat(40),
  goalPath: 'docs/migration/goals/103-x.md',
  goalSummary: 'resumo curto do Goal',
  resumeFrom: LOOP_STATES.DEVELOPER_RUNNING,
  changedFilesSnapshot: async () => new Set(),
  config: workUnitConfig({}),
  ...over,
});

const jobId103 = (unitId, generation = 1) => workUnitJobId({ goal: G103, round: R2, unitId, generation });

test('M-02: the Goal 103 resume walks the recorded lineage instead of re-dispatching WU-06', async () => {
  await withStore(async (store) => {
    const actions = [];
    const models = [];

    const outcome = await run103(store, {
      runAction: async ({ unit }) => {
        actions.push(unit.id);
        return fakeAction(true);
      },
      invokeUnit: async ({ unit }) => {
        models.push(unit.id);
        throw new Error(`no model may run on this resume (${unit.id})`);
      },
    });

    // The only thing that runs is the step after the last thing that ended:
    // DIAG-002 ended FAILED, so WU-07 is re-run as its second generation.
    assert.deepEqual(models, [], 'no model is called: every model unit is reused or replayed');
    assert.deepEqual(actions, ['WU-07'], 'only WU-07-g2 runs; WU-06 is not re-executed');

    const ids = [...outcome.records.keys()];
    assert.deepEqual(ids, ['FIX-001', 'WU-03', 'WU-04', 'WU-05', 'WU-09', 'WU-06', 'DIAG-001', 'WU-07', 'DIAG-002']);

    // WU-06 is resolved by its -g2 run, which passed.
    assert.equal(outcome.records.get('WU-06').state, 'COMPLETED');
    assert.equal(outcome.records.get('WU-06').reused, true);
    assert.equal(outcome.records.get('DIAG-001').state, 'COMPLETED');
    assert.equal(outcome.records.get('DIAG-001').reused, true);

    // DIAG-002's FAILED attempt is history: replayed, with the reason it ended.
    const diag2 = outcome.records.get('DIAG-002');
    assert.equal(diag2.state, 'FAILED');
    assert.equal(diag2.replayed, true);
    assert.equal(diag2.blockedReason, 'UNKNOWN_FATAL');
    assert.equal(diag2.model, 'sonnet');

    assert.equal(outcome.records.get('WU-07').state, 'COMPLETED');
    // A corrective unit that did not finish keeps the round out of review,
    // exactly as it would have in the process that ran it.
    assert.equal(outcome.aggregate.status, 'BLOCKED');
    // FIX-001 is the correction round's own planned unit; the id pattern counts it too.
    assert.deepEqual(outcome.telemetry.dynamicUnits, ['FIX-001', 'DIAG-001', 'DIAG-002']);

    // Nothing FAILED was given a new attempt.
    const wu06 = await store.readAttemptState(WORK_UNIT_NAMESPACE, jobId103('WU-06'));
    assert.equal(wu06.attempt, 1);
    assert.equal(wu06.attemptStatus, 'FAILED');
    const wu07 = await store.readAttemptState(WORK_UNIT_NAMESPACE, jobId103('WU-07'));
    assert.equal(wu07.attempt, 1);
    assert.equal(wu07.attemptStatus, 'FAILED');
    const d2 = await store.readAttemptState(WORK_UNIT_NAMESPACE, jobId103('DIAG-002'));
    assert.equal(d2.attempt, 2);
    assert.equal(d2.attemptStatus, 'FAILED');

    // One new job — the gate's next generation — and no twin corrective.
    const jobs = await store.listJobs(WORK_UNIT_NAMESPACE);
    assert.equal(jobs.length, 11);
    assert.ok(jobs.includes(`${jobId103('WU-07', 2)}.json`));

    const events = await store.readEvents();
    assert.equal(events.filter((event) => event.type === 'WORK_UNIT_FIX_CREATED').length, 2,
      'the two links of the first run, and no new one');
    assert.equal(events.filter((event) => event.type === 'WORK_UNIT_VERIFICATION_FAILED').length, 0);
    assert.deepEqual(
      events.filter((event) => event.type === 'WORK_UNIT_FIX_RESUMED').map((event) => [event.workUnitId, event.forVerification]),
      [['DIAG-001', 'WU-06'], ['DIAG-002', 'WU-07']],
    );
    assert.deepEqual(
      events.filter((event) => event.type === 'WORK_UNIT_REPLAYED').map((event) => event.jobId),
      [jobId103('WU-06'), jobId103('WU-07'), jobId103('DIAG-002')],
    );
  }, { fixture: true });
});

test('M-02: a diagnosis that was interrupted resumes as the diagnosis, not as the gate', async () => {
  await withStore(async (store, dir) => {
    // What the lease layer writes once it proves DIAG-002's owner is gone.
    await store.setJobStatus(WORK_UNIT_NAMESPACE, jobId103('DIAG-002'), 'INTERRUPTED');

    const actions = [];
    const models = [];
    const outcome = await run103(store, {
      runAction: async ({ unit }) => {
        actions.push(unit.id);
        return fakeAction(true);
      },
      invokeUnit: async ({ unit, unitJobId, validatePayload }) => {
        models.push(unit.id);
        return ok(completed(G103, R2, unitJobId, unit), validatePayload);
      },
    });

    assert.deepEqual(models, ['DIAG-002'], 'the diagnosis is what resumes');
    assert.deepEqual(actions, ['WU-07'], 'then the gate re-runs as its next generation; WU-06 never runs');
    assert.equal(outcome.records.get('DIAG-002').state, 'COMPLETED');
    assert.equal(outcome.records.get('WU-07').state, 'COMPLETED');
    assert.equal(outcome.aggregate.status, 'REVIEW_REQUIRED');

    // The successor attempt of the SAME job, its predecessors kept.
    const d2 = await store.readAttemptState(WORK_UNIT_NAMESPACE, jobId103('DIAG-002'));
    assert.equal(d2.attempt, 3);
    assert.deepEqual(d2.history.map((entry) => entry.status), ['WAITING_FOR_CAPACITY', 'INTERRUPTED']);

    // The gate's own failed run is still on disk as it was.
    const wu07 = JSON.parse(await readFile(join(dir, 'jobs', WORK_UNIT_NAMESPACE, `${jobId103('WU-07')}.json`), 'utf8'));
    assert.equal(wu07.attemptStatus, 'FAILED');
    assert.equal(wu07.attempt, 1);
  }, { fixture: true });
});

test('M-02: a lineage event of another round job is not followed', async () => {
  await withStore(async (store, dir) => {
    // Same (goal, round), different round job: a stale record, not this
    // round's history. The recomputed id must win.
    await writeFile(join(dir, 'events.jsonl'), `${JSON.stringify({
      at: '2026-10-03T05:55:26.846Z', type: 'WORK_UNIT_FIX_CREATED', goal: G103, round: R2,
      jobId: '103-r2-correction-00000000', workUnitId: 'DIAG-007', forVerification: 'WU-06',
      attributedTo: null, ambiguous: false,
    })}\n`, 'utf8');

    const outcome = await run103(store, {
      runAction: async () => fakeAction(true),
      invokeUnit: async ({ unit, unitJobId, validatePayload }) => ok(completed(G103, R2, unitJobId, unit), validatePayload),
    });

    assert.ok(!outcome.records.has('DIAG-007'));
    assert.ok(outcome.records.has('DIAG-001'));
  }, { fixture: true });
});

// ===========================================================================
// The same properties, from a store this test writes itself
// ===========================================================================

const GOAL = '008';
const ROUND = 1;
const JOB = { jobId: '008-r1-developer-aaaa1111', goal: GOAL, round: ROUND };

const plan = (units) => validateExecutionPlan({ goal: GOAL, workUnits: units }, { goal: GOAL });

const standard = (id, over = {}) => ({
  id,
  objective: `Implementar ${id}`,
  type: 'STANDARD',
  dependencies: [],
  acceptanceCriteria: [`${id} entregue`],
  ...over,
});

const run = (store, over = {}) => executeWorkUnitPlan({
  store,
  job: JOB,
  goal: GOAL,
  round: ROUND,
  worktree: '.ai-worktrees/goal-008',
  executionBase: 'a'.repeat(40),
  goalPath: 'docs/migration/goals/008-x.md',
  goalSummary: 'resumo curto do Goal',
  resumeFrom: LOOP_STATES.DEVELOPER_RUNNING,
  changedFilesSnapshot: async () => new Set(),
  config: workUnitConfig({}),
  ...over,
});

test('a round whose gate failed and was corrected runs again as a no-op, under the ids it ran as', async () => {
  await withStore(async (store) => {
    const built = plan([
      standard('WU-001', { expectedFiles: ['src/a.ts'] }),
      gate('VERIFY-001', 'typecheck', ['WU-001'], { scope: 'apps/bff' }),
    ]);

    // First process. git sees WU-001 write src/a.ts, but WU-001 does not
    // report it — so the first attribution names WU-001 (FIX-001), while a
    // recomputation from the reused record would find no suspect (DIAG-001).
    let snapshots = 0;
    let verifyRuns = 0;
    const first = await run(store, {
      plan: built,
      changedFilesSnapshot: async () => {
        snapshots += 1;
        return new Set(snapshots >= 2 ? ['src/a.ts'] : []);
      },
      runAction: async () => {
        verifyRuns += 1;
        return fakeAction(verifyRuns > 1, { stderr: 'src/a.ts(1,1): error TS2345: ...' });
      },
      invokeUnit: async ({ unit, unitJobId, validatePayload }) => ok(completed(GOAL, ROUND, unitJobId, unit), validatePayload),
    });
    assert.ok(first.records.has('FIX-001'));
    assert.equal(first.aggregate.status, 'REVIEW_REQUIRED');

    // Second process: same plan, same store. Before the lineage was read this
    // died on STAGE_NOT_RETRYABLE at VERIFY-001's failed first run.
    const second = await run(store, {
      plan: built,
      runAction: async () => { throw new Error('no gate may run again'); },
      invokeUnit: async ({ unit }) => { throw new Error(`no model may run again (${unit.id})`); },
    });

    // A gate keeps its first position; its re-run replaces the record in place.
    assert.deepEqual([...second.records.keys()], ['WU-001', 'VERIFY-001', 'FIX-001']);
    assert.equal(second.records.get('VERIFY-001').state, 'COMPLETED');
    assert.equal(second.aggregate.status, 'REVIEW_REQUIRED');
    assert.equal((await store.listJobs(WORK_UNIT_NAMESPACE)).length, 4, 'WU-001, VERIFY-001, FIX-001, VERIFY-001-g2');

    const created = (await store.readEvents()).filter((event) => event.type === 'WORK_UNIT_FIX_CREATED');
    assert.equal(created.length, 1);
    assert.equal(created[0].jobId, JOB.jobId, 'the link names the round job, for the next resume');
  });
});

test('a FAILED model unit is replayed on resume, not retried, and blocks what depends on it', async () => {
  await withStore(async (store) => {
    const built = plan([standard('WU-001'), standard('WU-002', { dependencies: ['WU-001'] })]);
    const unitJob = workUnitJobId({ goal: GOAL, round: ROUND, unitId: 'WU-001' });

    // What the capacity runner leaves behind on HUMAN_REQUIRED.
    await store.dispatchJob(WORK_UNIT_NAMESPACE, {
      protocolVersion: PROTOCOL_VERSION_V2, jobId: unitJob, role: WORK_UNIT_NAMESPACE, goal: GOAL, round: ROUND,
      workUnitId: 'WU-001', unitType: 'STANDARD', routing: { modelKey: 'sonnet', effort: 'high' },
    });
    await store.setJobStatus(WORK_UNIT_NAMESPACE, unitJob, 'FAILED');
    await store.publishResult(WORK_UNIT_NAMESPACE, unitJob, {
      ok: false, code: 'UNKNOWN_FATAL', message: 'Unrecoverable failure; a human must look at it.', escalation: 'HUMAN_REQUIRED',
    }, { attemptId: `${unitJob}-a1` });

    const models = [];
    const invoke = async ({ unit, unitJobId, validatePayload }) => {
      models.push(unit.id);
      return ok(completed(GOAL, ROUND, unitJobId, unit), validatePayload);
    };

    const outcome = await run(store, { plan: built, invokeUnit: invoke });
    assert.deepEqual(models, [], 'a FAILED attempt is never silently retried');
    assert.equal(outcome.records.get('WU-001').state, 'FAILED');
    assert.equal(outcome.records.get('WU-001').blockedReason, 'UNKNOWN_FATAL');
    assert.equal(outcome.records.get('WU-002').state, 'BLOCKED');
    assert.equal(outcome.aggregate.status, 'BLOCKED');
    const state = await store.readAttemptState(WORK_UNIT_NAMESPACE, unitJob);
    assert.equal(state.attempt, 1);
    assert.equal(state.attemptStatus, 'FAILED');

    // A person deciding it deserves another try is what makes it retryable.
    await store.setJobStatus(WORK_UNIT_NAMESPACE, unitJob, 'WAITING_FOR_CAPACITY');
    const retried = await run(store, { plan: built, invokeUnit: invoke });
    assert.deepEqual(models, ['WU-001', 'WU-002']);
    assert.equal(retried.aggregate.status, 'REVIEW_REQUIRED');
    assert.equal((await store.readAttemptState(WORK_UNIT_NAMESPACE, unitJob)).attempt, 2);
  });
});

test('a SKIPPED gate is replayed on resume instead of refused as not retryable', async () => {
  await withStore(async (store) => {
    const built = plan([gate('VERIFY-001', 'typecheck', [], { scope: 'apps/bff' })]);
    let runs = 0;
    const skipping = async () => {
      runs += 1;
      return { ...fakeAction(false), skipped: true, missingEnv: ['X_URL'], exitCode: null };
    };

    const first = await run(store, { plan: built, runAction: skipping, invokeUnit: async () => { throw new Error('unreachable'); } });
    assert.equal(first.records.get('VERIFY-001').state, 'SKIPPED');

    const second = await run(store, { plan: built, runAction: skipping, invokeUnit: async () => { throw new Error('unreachable'); } });
    assert.equal(runs, 1);
    assert.equal(second.records.get('VERIFY-001').state, 'SKIPPED');
    const skips = (await store.readEvents()).filter((event) => event.type === 'WORK_UNIT_VERIFICATION_SKIPPED');
    assert.equal(skips.length, 1, 'the skip is reported once, by the process that skipped');
  });
});
