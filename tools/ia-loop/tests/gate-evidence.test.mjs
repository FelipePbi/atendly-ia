/**
 * Gate evidence across a documentation-only correction round.
 *
 * Written from Goal095 round 4 and Goal097 round 3: rounds that changed no
 * code, spent fixing stale counts in CURRENT_STATE / VALIDATION_GATE, that
 * still re-ran every heavy gate — while the Developer, handed only the
 * reviewer's prose, rewrote the numbers from memory.
 *
 * What must hold: a gate is carried over only when its code is PROVABLY the
 * same, the carry-over is visible everywhere a verdict is read, anything else
 * re-runs, and the documentation round is handed the exact gate output.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJobStore } from '../lib/job-store.mjs';
import { LOOP_STATES } from '../lib/loop-state.mjs';
import {
  PROTOCOL_VERSION_V2,
  REVIEW_DECISION_SCHEMA,
  validateDeveloperJob,
  validateReviewDecision,
} from '../lib/contracts-v2.mjs';
import { validateExecutionPlan } from '../lib/work-units.mjs';
import { executeWorkUnitPlan } from '../lib/work-unit-executor.mjs';
import { workUnitConfig } from '../lib/work-unit-config.mjs';
import { deriveGoalGateStatus, summarizeGoalGateStatus } from '../lib/goal-gate-status.mjs';
import { renderReviewPrompt } from '../lib/review-packet.mjs';
import { git } from '../lib/git-ops.mjs';
import {
  GATE_EVIDENCE_REUSED,
  codeFingerprintFromEntries,
  collectGateEvidence,
  computeCodeFingerprint,
  extractGateNumbers,
  findReusableGateResult,
  isDocumentationPath,
  isReusableGateAction,
  renderDocumentationRoundBrief,
} from '../lib/gate-evidence.mjs';

const GOAL = '097';
const WORKTREE = '.ai-worktrees/goal-097';
const BASE = 'a'.repeat(40);

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-gate-evidence-'));
  try { return await run(dir); } finally { await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

// ---------------------------------------------------------------------------
// The proof: a content fingerprint of everything but docs/**/*.md
// ---------------------------------------------------------------------------

test('only markdown under docs/ is documentation; prototypes, JSON and code elsewhere are not', () => {
  assert.equal(isDocumentationPath('docs/migration/CURRENT_STATE.md'), true);
  assert.equal(isDocumentationPath('docs\\migration\\VALIDATION_GATE.md'), true);
  assert.equal(isDocumentationPath('docs/design-reference/claude-design/prototype/project/a.dc.html'), false);
  assert.equal(isDocumentationPath('apps/frontend/README.md'), false);
  assert.equal(isDocumentationPath('apps/frontend/e2e/visual/targets.json'), false);
  assert.equal(isDocumentationPath('tools/ia-loop/README.md'), false);
});

test('git-diff-check and tooling-tests are never reused; the heavy product gates are', () => {
  assert.equal(isReusableGateAction('git-diff-check'), false, 'it inspects the documentation diff too');
  assert.equal(isReusableGateAction('tooling-tests'), false);
  for (const action of ['typecheck', 'lint', 'validate-core', 'validate-ui', 'validate-integration', 'gate-tests']) {
    assert.equal(isReusableGateAction(action), true, action);
  }
  assert.equal(isReusableGateAction('some-future-gate'), false, 'an allowlist: new gates re-run until judged');
});

test('the fingerprint ignores documentation and nothing else', () => {
  const code = [{ path: 'apps/x/a.ts', sha256: '1' }];
  const fp = codeFingerprintFromEntries({ baseSha: BASE, head: BASE, entries: code });
  assert.equal(codeFingerprintFromEntries({
    baseSha: BASE, head: BASE, entries: [...code, { path: 'docs/migration/CURRENT_STATE.md', sha256: '9' }],
  }), fp);
  assert.notEqual(codeFingerprintFromEntries({ baseSha: BASE, head: BASE, entries: [{ path: 'apps/x/a.ts', sha256: '2' }] }), fp);
  assert.notEqual(codeFingerprintFromEntries({ baseSha: BASE, head: BASE, entries: [{ path: 'apps/x/a.ts', sha256: null }] }), fp,
    'a deleted file is not an unchanged one');
  assert.notEqual(codeFingerprintFromEntries({ baseSha: 'b'.repeat(40), head: BASE, entries: code }), fp);
  assert.notEqual(codeFingerprintFromEntries({ baseSha: BASE, head: 'c'.repeat(40), entries: code }), fp);
});

test('on a real worktree: a doc edit keeps the fingerprint, any code edit, new file or rename changes it', async () => {
  await withDir(async (dir) => {
    await mkdir(join(dir, 'docs', 'migration'), { recursive: true });
    await mkdir(join(dir, 'apps'), { recursive: true });
    await writeFile(join(dir, 'docs', 'migration', 'CURRENT_STATE.md'), '1628 testes\n');
    await writeFile(join(dir, 'apps', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(dir, 'apps', 'keep.ts'), 'export const k = 1;\n');
    await git(['init', '-q', '-b', 'main'], { cwd: dir });
    await git(['config', 'user.email', 't@t'], { cwd: dir });
    await git(['config', 'user.name', 'test'], { cwd: dir });
    await git(['config', 'core.autocrlf', 'false'], { cwd: dir });
    await git(['add', '-A'], { cwd: dir });
    await git(['commit', '-qm', 'base'], { cwd: dir });
    const base = await git(['rev-parse', 'HEAD'], { cwd: dir });
    const fp = () => computeCodeFingerprint({ worktree: dir, baseSha: base });

    // The accepted implementation.
    await writeFile(join(dir, 'apps', 'a.ts'), 'export const a = 2;\n');
    const implemented = await fp();

    // The documentation-only correction.
    await writeFile(join(dir, 'docs', 'migration', 'CURRENT_STATE.md'), '1693 testes\n');
    await writeFile(join(dir, 'docs', 'migration', 'NEW.md'), 'nota\n');
    assert.equal(await fp(), implemented, 'documentation does not move the fingerprint');

    await writeFile(join(dir, 'apps', 'a.ts'), 'export const a = 3;\n');
    assert.notEqual(await fp(), implemented, 'a code edit does');
    await writeFile(join(dir, 'apps', 'a.ts'), 'export const a = 2;\n');
    assert.equal(await fp(), implemented, 'and reverting it restores it: content, not history');

    await writeFile(join(dir, 'apps', 'b.ts'), 'export {};\n');
    assert.notEqual(await fp(), implemented, 'an untracked code file does');
    await rm(join(dir, 'apps', 'b.ts'));

    // A rename must count the deletion of the old path, not only the new one.
    await git(['add', '-A'], { cwd: dir });
    const beforeRename = await fp();
    await rename(join(dir, 'apps', 'keep.ts'), join(dir, 'apps', 'moved.ts'));
    await git(['add', '-A'], { cwd: dir });
    const renamed = await fp();
    await writeFile(join(dir, 'apps', 'keep.ts'), 'export const k = 1;\n');
    await git(['add', '-A'], { cwd: dir });
    assert.notEqual(await fp(), renamed, 'old path present again is a different tree');
    assert.notEqual(renamed, beforeRename);
  });
});

// ---------------------------------------------------------------------------
// The executor: reuse only on proof, visibly, and never for the excluded gates
// ---------------------------------------------------------------------------

const plan = (units) => validateExecutionPlan({ goal: GOAL, workUnits: units }, { goal: GOAL });

const gate = (id, action, over = {}) => ({
  id,
  objective: `Rodar ${action}`,
  type: 'DETERMINISTIC',
  action,
  ...(['typecheck', 'lint'].includes(action) ? { scope: 'apps/frontend' } : {}),
  dependencies: [],
  acceptanceCriteria: [],
  ...over,
});

const fix = {
  id: 'FIX-001',
  objective: 'Corrigir os blockers da rodada anterior',
  type: 'STANDARD',
  dependencies: [],
  acceptanceCriteria: ['Blocker 1 resolvido'],
};

const VITEST_TAIL = [
  ' Test Files  142 passed (142)',
  '      Tests  1628 passed (1628)',
  '   Start at  10:00:00',
].join('\n');

const countingAction = (calls, { ok = true, stdout = VITEST_TAIL } = {}) => async ({ unit }) => {
  calls.push(unit.action);
  return {
    unitId: unit.id, action: unit.action, label: unit.action, argv: ['fake', unit.action], cwd: WORKTREE,
    durationMs: 5, ok, exitCode: ok ? 0 : 1, signal: null, error: null, stdout, stderr: ok ? '' : 'boom',
  };
};

/** The real finder over the real store; only the fingerprint is supplied. */
const policy = (store, round, fingerprint) => ({
  enabled: true,
  fingerprint: async () => fingerprint,
  findReusable: async ({ unit, codeFingerprint }) => findReusableGateResult({
    store, events: await store.readEvents(), goal: GOAL, round, unit, codeFingerprint,
  }),
});

const completedUnit = (unitJobId, unit, round) => ({
  error: null,
  structuredOutput: true,
  available: true,
  payload: {
    protocolVersion: PROTOCOL_VERSION_V2,
    jobId: unitJobId, goal: GOAL, round, workUnitId: unit.id,
    status: 'COMPLETED', summary: 'docs corrigidos', report: 'CURRENT_STATE atualizado',
    changedFiles: [],
    acceptance: unit.acceptanceCriteria.map((criterion) => ({ criterion, met: true })),
  },
});

function runRound(store, { round, units, fingerprint, calls, packets = [], correctionBrief = null, action }) {
  return executeWorkUnitPlan({
    store,
    plan: plan(units),
    job: { jobId: `${GOAL}-r${round}-developer-x`, goal: GOAL, round, worktree: WORKTREE },
    goal: GOAL,
    round,
    worktree: WORKTREE,
    executionBase: BASE,
    goalPath: 'docs/migration/goals/097-x.md',
    goalSummary: 'resumo',
    resumeFrom: LOOP_STATES.CORRECTION_RUNNING,
    changedFilesSnapshot: async () => new Set(),
    runAction: action ?? countingAction(calls),
    config: workUnitConfig({}),
    gateEvidence: fingerprint === undefined ? null : policy(store, round, fingerprint),
    correctionBrief,
    invokeUnit: async ({ unit, unitJobId, packet, prompt }) => {
      packets.push({ unitId: unit.id, packet, prompt });
      return completedUnit(unitJobId, unit, round);
    },
  });
}

const correctionUnits = () => [
  fix,
  gate('VERIFY-001', 'typecheck', { dependencies: ['FIX-001'] }),
  gate('VERIFY-002', 'validate-core', { dependencies: ['FIX-001'] }),
  gate('VERIFY-003', 'git-diff-check', { dependencies: ['FIX-001'] }),
];

test('identical code: the heavy gates are carried over, git diff --check still runs, and it is said everywhere', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    const calls = [];
    await runRound(store, {
      round: 1,
      units: [gate('VERIFY-001', 'typecheck'), gate('VERIFY-002', 'validate-core'), gate('VERIFY-003', 'git-diff-check')],
      fingerprint: 'code-v1:A', calls,
    });
    assert.deepEqual(calls, ['typecheck', 'validate-core', 'git-diff-check']);

    calls.length = 0;
    const outcome = await runRound(store, { round: 2, units: correctionUnits(), fingerprint: 'code-v1:A', calls });
    assert.deepEqual(calls, ['git-diff-check'], 'only the gate that reads documentation re-ran');
    assert.equal(outcome.aggregate.status, 'REVIEW_REQUIRED');

    const reused = (await store.readEvents()).filter((event) => event.type === GATE_EVIDENCE_REUSED);
    assert.deepEqual(reused.map((event) => [event.workUnitId, event.round, event.reusedFromRound]),
      [['VERIFY-001', 2, 1], ['VERIFY-002', 2, 1]]);
    for (const event of reused) assert.equal(event.codeFingerprint, 'code-v1:A');

    const typecheck = outcome.aggregate.validations.find((entry) => entry.name === 'typecheck');
    assert.equal(typecheck.passed, true);
    assert.match(typecheck.detail, /reaproveitado da rodada 1, código idêntico/);
    assert.match(outcome.aggregate.implementationReport, /REAPROVEITADO da rodada 1/);
    assert.deepEqual(outcome.telemetry.reusedGateEvidence, ['VERIFY-001', 'VERIFY-002']);

    // The reviewer's table: PASSED, in this round, and where the answer came from.
    const rows = deriveGoalGateStatus({
      declaredGates: [{ id: 'VERIFY-001', action: 'typecheck' }, { id: 'VERIFY-002', action: 'validate-core' },
        { id: 'VERIFY-003', action: 'git-diff-check' }],
      events: await store.readEvents(),
      currentRound: 2,
    });
    assert.deepEqual(rows.map((row) => [row.id, row.outcome, row.round, row.reusedFromRound]), [
      ['VERIFY-001', 'PASSED', 2, 1],
      ['VERIFY-002', 'PASSED', 2, 1],
      ['VERIFY-003', 'PASSED', 2, null],
    ]);
    assert.match(summarizeGoalGateStatus(rows), /2 reaproveitado\(s\) de rodada anterior sobre código idêntico/);

    const prompt = renderReviewPrompt({
      goal: GOAL, goalPath: 'g.md', round: 2, changedFiles: [], previousBlockers: [], validations: [],
      goalGates: rows, goalGatesSummary: summarizeGoalGateStatus(rows),
    });
    assert.match(prompt, /VERIFY-002 validate-core: PASSED \(rodada 2\) — reaproveitado da execução da rodada 1/);
    assert.match(prompt, /o comando não rodou de novo/);
    assert.match(prompt, /VERIFY-003 git-diff-check: PASSED \(rodada 2\)\n/, 'a gate that ran is not labelled reused');
    assert.match(prompt, /correctionScope/);

    // A third documentation round chains to the run that actually executed.
    calls.length = 0;
    const third = await runRound(store, { round: 3, units: correctionUnits(), fingerprint: 'code-v1:A', calls });
    assert.deepEqual(calls, ['git-diff-check']);
    const persisted = [...third.records.values()].find((record) => record.id === 'VERIFY-002');
    assert.equal(persisted.reusedFrom.round, 2);
    assert.equal(persisted.reusedFrom.originRound, 1);
  });
});

test('changed code re-runs every gate; so does a gate whose last run failed', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    const calls = [];
    await runRound(store, { round: 1, units: [gate('VERIFY-001', 'typecheck'), gate('VERIFY-002', 'validate-core')],
      fingerprint: 'code-v1:A', calls });

    calls.length = 0;
    await runRound(store, { round: 2, units: correctionUnits().slice(0, 3), fingerprint: 'code-v1:B', calls });
    assert.deepEqual(calls, ['typecheck', 'validate-core'], 'the code moved: nothing is carried');
    assert.equal((await store.readEvents()).filter((event) => event.type === GATE_EVIDENCE_REUSED).length, 0);
  });

  await withDir(async (dir) => {
    const store = createJobStore(dir);
    const calls = [];
    await executeWorkUnitPlan({
      store, plan: plan([gate('VERIFY-001', 'typecheck')]),
      job: { jobId: `${GOAL}-r1-developer-x`, goal: GOAL, round: 1, worktree: WORKTREE },
      goal: GOAL, round: 1, worktree: WORKTREE, executionBase: BASE, goalPath: 'x.md',
      resumeFrom: LOOP_STATES.DEVELOPER_RUNNING, changedFilesSnapshot: async () => new Set(),
      runAction: countingAction(calls, { ok: false }),
      config: { ...workUnitConfig({}), maxFixUnitsPerRound: 0 },
      gateEvidence: policy(store, 1, 'code-v1:A'),
      invokeUnit: async () => { throw new Error('unreachable'); },
    });

    calls.length = 0;
    await runRound(store, { round: 2, units: correctionUnits().slice(0, 2), fingerprint: 'code-v1:A', calls });
    assert.deepEqual(calls, ['typecheck'], 'a red gate is asked again, never assumed fixed');
  });
});

test('a different scope or pattern is a different gate, and no policy means the old behaviour', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    const calls = [];
    await runRound(store, { round: 1, units: [gate('VERIFY-001', 'typecheck')], fingerprint: 'code-v1:A', calls });

    calls.length = 0;
    await runRound(store, {
      round: 2,
      units: [fix, gate('VERIFY-001', 'typecheck', { scope: 'apps/bff', dependencies: ['FIX-001'] })],
      fingerprint: 'code-v1:A', calls,
    });
    assert.deepEqual(calls, ['typecheck']);

    calls.length = 0;
    await runRound(store, { round: 3, units: correctionUnits().slice(0, 2), calls });
    assert.deepEqual(calls, ['typecheck'], 'without a policy every gate runs, as before');
  });
});

// ---------------------------------------------------------------------------
// The numbers, for the documentation round
// ---------------------------------------------------------------------------

test('count lines are extracted verbatim from every runner format in use', () => {
  const nodeTest = 'ok\n\u001b[34mℹ tests 233\u001b[39m\nℹ pass 233\nℹ fail 0\nℹ duration_ms 812';
  assert.deepEqual(extractGateNumbers(nodeTest), ['ℹ tests 233', 'ℹ pass 233', 'ℹ fail 0']);
  assert.deepEqual(extractGateNumbers(VITEST_TAIL), ['Test Files  142 passed (142)', 'Tests  1628 passed (1628)']);
  assert.deepEqual(extractGateNumbers('  21 skipped\n  169 passed (44.9s)\nretries: 0'),
    ['21 skipped', '169 passed (44.9s)', 'retries: 0']);
  const summary = '{\n  "gate": "validate:integration",\n  "total": 36,\n  "passed": 36,\n  "failed": 0,\n  "skipped": 0\n}\n'
    + 'validate:integration PASSED in 412s';
  assert.deepEqual(extractGateNumbers(summary), [
    '"gate": "validate:integration"', '"total": 36', '"passed": 36', '"failed": 0', '"skipped": 0',
    'validate:integration PASSED in 412s',
  ]);
  assert.deepEqual(extractGateNumbers(''), []);
});

test('a DOCUMENTATION_ONLY round is handed the exact gate output, and only its declared unit gets it', async () => {
  await withDir(async (dir) => {
    const store = createJobStore(dir);
    await runRound(store, { round: 1, units: [gate('VERIFY-001', 'typecheck'), gate('VERIFY-002', 'validate-core')],
      fingerprint: 'code-v1:A', calls: [] });

    const gates = await collectGateEvidence({ store, goal: GOAL, beforeRound: 2 });
    assert.deepEqual(gates.map((row) => [row.unitId, row.round, row.exitCode]), [['VERIFY-001', 1, 0], ['VERIFY-002', 1, 0]]);
    assert.deepEqual(gates[1].numbers, ['Test Files  142 passed (142)', 'Tests  1628 passed (1628)']);

    const brief = renderDocumentationRoundBrief({ round: 2, gates });
    assert.match(brief, /DOCUMENTATION_ONLY/);
    assert.match(brief, /Tests {2}1628 passed \(1628\)/);
    assert.match(brief, /VERIFY-002 validate-core: PASS exit 0 \(rodada 1\)/);
    assert.match(brief, /docs\/\*\*\/\*\.md/);

    const packets = [];
    await runRound(store, {
      round: 2, units: correctionUnits(), fingerprint: 'code-v1:A', calls: [], packets, correctionBrief: brief,
    });
    const fixPacket = packets.find((entry) => entry.unitId === 'FIX-001');
    assert.equal(fixPacket.packet.correctionBrief, brief);
    assert.match(fixPacket.prompt, /RODADA SÓ DE DOCUMENTAÇÃO/);
  });
});

test('a round with no gate history says so instead of inventing numbers', () => {
  const brief = renderDocumentationRoundBrief({ round: 2, gates: [] });
  assert.match(brief, /não há números do harness para citar/);
  const silent = renderDocumentationRoundBrief({
    round: 3, gates: [{ unitId: 'V', action: 'build', round: 2, originRound: 1, status: 'COMPLETED', exitCode: 0, numbers: [] }],
  });
  assert.match(silent, /rodada 2, executado de fato na rodada 1/);
  assert.match(silent, /não traz contagem; não invente uma/);
});

// ---------------------------------------------------------------------------
// The reviewer's classification, end to end through the contracts
// ---------------------------------------------------------------------------

const review = (over = {}) => ({
  protocolVersion: PROTOCOL_VERSION_V2,
  jobId: 'r', goal: GOAL, round: 2,
  decision: 'CHANGES_REQUIRED', blockers: ['CURRENT_STATE cita 1628 testes; o gate imprimiu 1693'],
  nextAction: 'RETURN_TO_DEVELOPER',
  ...over,
});

test('correctionScope: optional, only with CHANGES_REQUIRED, only the two known values', () => {
  const ids = { jobId: 'r', goal: GOAL, round: 2 };
  assert.equal(validateReviewDecision(review(), ids).correctionScope, null);
  assert.equal(validateReviewDecision(review({ correctionScope: 'DOCUMENTATION_ONLY' }), ids).correctionScope,
    'DOCUMENTATION_ONLY');
  assert.throws(() => validateReviewDecision(review({ correctionScope: 'DOCS' }), ids), /correctionScope must be one of/);
  assert.throws(() => validateReviewDecision(review({
    decision: 'ACCEPTED', blockers: [], nextAction: 'STOP', correctionScope: 'DOCUMENTATION_ONLY',
  }), ids), /only applies to CHANGES_REQUIRED/);
  assert.deepEqual(REVIEW_DECISION_SCHEMA.properties.correctionScope.enum, ['DOCUMENTATION_ONLY', 'CODE_OR_EVIDENCE']);
});

test('the developer job carries it on a CORRECTION and refuses it on an IMPLEMENTATION', () => {
  const job = {
    protocolVersion: PROTOCOL_VERSION_V2, jobId: '097-r2-correction-x', role: 'developer', goal: GOAL, round: 2,
    type: 'CORRECTION', migrationAcceptedBaseline: BASE, executionBase: BASE,
    worktree: WORKTREE, goalPath: 'docs/migration/goals/097-x.md', blockers: ['b'],
  };
  assert.equal(validateDeveloperJob({ ...job, correctionScope: 'DOCUMENTATION_ONLY' }).correctionScope, 'DOCUMENTATION_ONLY');
  assert.equal(validateDeveloperJob(job).correctionScope, null);
  assert.throws(() => validateDeveloperJob({
    ...job, type: 'IMPLEMENTATION', round: 1, blockers: [], correctionScope: 'DOCUMENTATION_ONLY',
  }), /only applies to CORRECTION/);
});

test('wiring: the scope survives a cold resume and reaches the job; the worker builds the brief only for it', async () => {
  const reconcile = await readFile(new URL('../lib/reconcile.mjs', import.meta.url), 'utf8');
  assert.match(reconcile, /correctionScope: review\.result\?\.correctionScope \?\? null/);

  const runGoal = await readFile(new URL('../run-goal.mjs', import.meta.url), 'utf8');
  assert.match(runGoal, /let pendingCorrectionScope = reconciled\.next\.correctionScope \?\? null/);
  assert.match(runGoal, /pendingCorrectionScope = decision\.correctionScope \?\? null/);
  assert.match(runGoal, /correctionScope: isCorrection \? pendingCorrectionScope : null/);

  const developer = await readFile(new URL('../workers/developer.mjs', import.meta.url), 'utf8');
  assert.match(developer, /job\.correctionScope !== 'DOCUMENTATION_ONLY'\) return null/);
  assert.match(developer, /gateEvidence: createGateEvidenceReuse\(/);
  assert.match(developer, /enabled: WORK_UNIT_CONFIG\.gateEvidenceReuse/);

  assert.equal(workUnitConfig({}).gateEvidenceReuse, true);
  assert.equal(workUnitConfig({ IA_LOOP_GATE_EVIDENCE_REUSE: '0' }).gateEvidenceReuse, false);
});
