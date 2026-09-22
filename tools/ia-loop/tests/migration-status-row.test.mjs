/**
 * MIGRATION_STATUS.md's status TABLE, closed deterministically.
 *
 * The incident this closes: by Goal049 the table had drifted from the
 * closure/planning documentation job's own prose log 26 Goals in a row —
 * a row still reading READY after the Goal was integrated, or missing
 * entirely for a Goal already READY and planned. Every occurrence produced
 * the same refusal at the NEXT Goal's discovery
 * (MIGRATION_STATUS_ROW_MISSING / PREVIOUS_GOAL_NOT_ACCEPTED), fixed by a
 * human hand-patching the table from evidence already on disk.
 *
 * No model is called anywhere here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyMigrationStatusRowAccepted,
  applyMigrationStatusRowInserted,
  ensureMigrationStatusRowAccepted,
  ensureMigrationStatusRowExists,
} from '../lib/migration-status-row.mjs';

const codeIs = (code) => (error) => error.code === code;

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-migration-status-'));
  try { return await run(dir); } finally { await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

const HEADER = '**Baseline aceita vigente:** `0'.repeat(1) + '0'.repeat(39) + '`\n\n'
  + '| Goal | Status | Commit de implementação | Review | Observações |\n'
  + '| --- | --- | --- | --- | --- |\n';

const readyRow049 = () =>
  HEADER
  + '| 049 — A cobertura é ligada por construção | READY | —; baseline aceita `aaaa` | [Prompt049](goals/049-x.md), preparado em 2026-09-22 | **Nasce na v70.** Motivo real. |\n'
  + '| 050 — Outro título | READY | —; baseline aceita `aaaa` | [Prompt050](goals/050-x.md) | prosa |\n';

const acceptedRow049 = () =>
  HEADER
  + '| 049 — A cobertura é ligada por construção | ACCEPTED | `bbbb` (origem `cccc`) | Tech Lead Agent: [rodada 1 ACCEPTED](reviews/049-review.md), 2026-09-22 | **Nasce na v70.** Motivo real. |\n';

const ACCEPT_EVIDENCE = Object.freeze({
  closureCommit: 'd9b2416193194e6fd8eef58e18988a5585c40628',
  originCommit: '1377c2397464099991c43b79863a27ea6c2d9a32',
  reviewSummary: 'rodada 1 ACCEPTED',
  reviewPath: 'reviews/049-review.md',
  reviewDate: '2026-09-22',
});

// ===========================================================================
// applyMigrationStatusRowAccepted — the pure decision
// ===========================================================================

test('1. row already ACCEPTED — no-op', () => {
  const text = acceptedRow049();
  const result = applyMigrationStatusRowAccepted(text, '049', ACCEPT_EVIDENCE);
  assert.equal(result.changed, false);
  assert.equal(result.text, text, 'byte-identical — nothing was rewritten');
});

test('2. row still READY after closure — deterministic transition to ACCEPTED', () => {
  const before = readyRow049();
  const result = applyMigrationStatusRowAccepted(before, '049', ACCEPT_EVIDENCE);
  assert.equal(result.changed, true);
  assert.match(result.text, /\| 049 — A cobertura é ligada por construção \| ACCEPTED \|/);
  assert.match(result.text, /`d9b2416193194e6fd8eef58e18988a5585c40628` \(origem `1377c2397464099991c43b79863a27ea6c2d9a32`\)/);
  assert.match(result.text, /\[rodada 1 ACCEPTED\]\(reviews\/049-review\.md\), 2026-09-22/);
  // Only THIS row moved — the neighbour and the Observações prose survive.
  assert.match(result.text, /\| 050 — Outro título \| READY \|/);
  assert.match(result.text, /\*\*Nasce na v70\.\*\* Motivo real\./);
});

test('3. no row exists for the Goal — refused, never guessed', () => {
  assert.throws(
    () => applyMigrationStatusRowAccepted(HEADER, '049', ACCEPT_EVIDENCE),
    codeIs('MIGRATION_STATUS_ROW_MISSING'),
  );
});

test('4. row in an unexpected status — refused', () => {
  const text = HEADER + '| 049 — X | BLOCKED | — | — | — |\n';
  assert.throws(
    () => applyMigrationStatusRowAccepted(text, '049', ACCEPT_EVIDENCE),
    codeIs('MIGRATION_STATUS_ROW_UNEXPECTED'),
  );
});

test('5. closure commit not proven — refused', () => {
  assert.throws(
    () => applyMigrationStatusRowAccepted(readyRow049(), '049', { ...ACCEPT_EVIDENCE, closureCommit: null }),
    codeIs('MIGRATION_STATUS_ROW_TRANSITION_REFUSED'),
  );
  assert.throws(
    () => applyMigrationStatusRowAccepted(readyRow049(), '049', { ...ACCEPT_EVIDENCE, originCommit: null }),
    codeIs('MIGRATION_STATUS_ROW_TRANSITION_REFUSED'),
  );
});

test('6. a literal pipe inside Observações survives the rewrite untouched', () => {
  const text = HEADER
    + '| 049 — X | READY | —; baseline aceita `aaaa` | [Prompt049](goals/049-x.md) | prosa com tabela: `a \\| b` no meio |\n';
  const result = applyMigrationStatusRowAccepted(text, '049', ACCEPT_EVIDENCE);
  assert.equal(result.changed, true);
  assert.match(result.text, /prosa com tabela: `a \\\| b` no meio/);
});

// ===========================================================================
// applyMigrationStatusRowInserted — the pure decision
// ===========================================================================

test('7. row already exists for the Goal — no-op, never overwrites written prose', () => {
  const text = readyRow049();
  const result = applyMigrationStatusRowInserted(text, {
    goalId: '050', title: 'Outro título (diferente)', newBaseline: 'zzzz',
    promptPath: 'goals/050-x.md', afterGoalId: '049', preparedAfterLabel: 'em 2026-09-22 após o fechamento049',
    developerProfile: 'OPUS_MEDIUM',
  });
  assert.equal(result.changed, false);
  assert.equal(result.text, text);
});

test('8. no row for the Goal — inserted right after the preceding Goal, as READY', () => {
  const text = HEADER
    + '| 049 — A cobertura é ligada por construção | ACCEPTED | `bbbb` | review | prosa049 |\n';
  const result = applyMigrationStatusRowInserted(text, {
    goalId: '050', title: 'A conservação é provada por construção',
    newBaseline: 'd9b2416193194e6fd8eef58e18988a5585c40628',
    promptPath: 'goals/050-a-conservacao.md',
    afterGoalId: '049', preparedAfterLabel: 'em 2026-09-22 após o fechamento049',
    developerProfile: 'OPUS_MEDIUM',
  });
  assert.equal(result.changed, true);
  assert.match(
    result.text,
    /\| 050 — A conservação é provada por construção \| READY \| —; baseline aceita `d9b2416193194e6fd8eef58e18988a5585c40628` \| \[Prompt050\]\(goals\/050-a-conservacao\.md\), preparado em 2026-09-22 após o fechamento049; reviewer: Tech Lead Agent \(D-018\); perfil do Developer: OPUS_MEDIUM \| — \|/,
  );
  // Placed immediately after 049's row, not appended blindly at EOF.
  const idx049 = result.text.indexOf('| 049 —');
  const idx050 = result.text.indexOf('| 050 —');
  assert.ok(idx050 > idx049, 'the new row follows the Goal it comes after');
});

test('9. the preceding Goal has no row at all — refused, never guessed where to insert', () => {
  assert.throws(
    () => applyMigrationStatusRowInserted(HEADER, {
      goalId: '050', title: 'X', newBaseline: 'zzzz', promptPath: 'goals/050-x.md',
      afterGoalId: '049', preparedAfterLabel: 'em 2026-09-22 após o fechamento049', developerProfile: 'OPUS_MEDIUM',
    }),
    codeIs('MIGRATION_STATUS_ROW_INSERT_REFUSED'),
  );
});

// ===========================================================================
// ensureMigrationStatusRowAccepted / ensureMigrationStatusRowExists — I/O
// ===========================================================================

test('ensureMigrationStatusRowAccepted rewrites the real file on disk exactly once', async () => {
  await withDir(async (dir) => {
    const migrationDir = join(dir, 'docs', 'migration');
    await mkdir(migrationDir, { recursive: true });
    const statusFile = join(migrationDir, 'MIGRATION_STATUS.md');
    await writeFile(statusFile, readyRow049(), 'utf8');

    const first = await ensureMigrationStatusRowAccepted({ repoRoot: dir, goalId: '049', ...ACCEPT_EVIDENCE });
    assert.equal(first.changed, true);
    assert.equal(first.path, statusFile);

    const onDisk = await readFile(statusFile, 'utf8');
    assert.match(onDisk, /\| 049 — A cobertura é ligada por construção \| ACCEPTED \|/);

    // Idempotent: calling it again (a second `ia-loop:close -- 049`) touches nothing.
    const second = await ensureMigrationStatusRowAccepted({ repoRoot: dir, goalId: '049', ...ACCEPT_EVIDENCE });
    assert.equal(second.changed, false);
    assert.equal(await readFile(statusFile, 'utf8'), onDisk);
  });
});

test('ensureMigrationStatusRowExists inserts the real file on disk exactly once, reading the title from the Goal document', async () => {
  await withDir(async (dir) => {
    const migrationDir = join(dir, 'docs', 'migration');
    const goalsDir = join(migrationDir, 'goals');
    await mkdir(goalsDir, { recursive: true });
    await writeFile(
      join(migrationDir, 'MIGRATION_STATUS.md'),
      HEADER + '| 049 — A cobertura é ligada por construção | ACCEPTED | `bbbb` | review | prosa049 |\n',
      'utf8',
    );
    await writeFile(
      join(goalsDir, '050-a-conservacao-e-provada-por-construcao.md'),
      '# Goal 050 — A conservação é provada por construção: sítio creditado por prosa não conta\n\n**Status: READY.**\n',
      'utf8',
    );

    const first = await ensureMigrationStatusRowExists({
      repoRoot: dir, goalId: '050',
      nextGoalPath: 'docs/migration/goals/050-a-conservacao-e-provada-por-construcao.md',
      newBaseline: 'd9b2416193194e6fd8eef58e18988a5585c40628',
      afterGoalId: '049', developerProfile: 'OPUS_MEDIUM',
    });
    assert.equal(first.changed, true);

    const onDisk = await readFile(join(migrationDir, 'MIGRATION_STATUS.md'), 'utf8');
    assert.match(onDisk, /\| 050 — A conservação é provada por construção: sítio creditado por prosa não conta \| READY \|/);
    assert.match(onDisk, /\[Prompt050\]\(goals\/050-a-conservacao-e-provada-por-construcao\.md\)/);

    // Idempotent: calling it again touches nothing.
    const second = await ensureMigrationStatusRowExists({
      repoRoot: dir, goalId: '050',
      nextGoalPath: 'docs/migration/goals/050-a-conservacao-e-provada-por-construcao.md',
      newBaseline: 'd9b2416193194e6fd8eef58e18988a5585c40628',
      afterGoalId: '049', developerProfile: 'OPUS_MEDIUM',
    });
    assert.equal(second.changed, false);
    assert.equal(await readFile(join(migrationDir, 'MIGRATION_STATUS.md'), 'utf8'), onDisk);
  });
});

// ===========================================================================
// Wiring in run-close.mjs — proven by source, same pattern as
// goal-status-transition.test.mjs's equivalent check.
// ===========================================================================

test('run-close.mjs applies both table fixes right after planning integration, and commits them standalone', async () => {
  const source = await readFile(new URL('../run-close.mjs', import.meta.url), 'utf8');

  const integrationAt = source.indexOf('planningIntegrationCommit: after');
  const acceptedFixAt = source.indexOf('ensureMigrationStatusRowAccepted({');
  const insertFixAt = source.indexOf('ensureMigrationStatusRowExists({');
  const nextGoalReadyAt = source.indexOf('machine.transitionTo(LOOP_STATES.NEXT_GOAL_READY)');

  assert.ok(integrationAt > 0 && acceptedFixAt > integrationAt,
    'the ACCEPTED row fix must run after planning integration is proven, never before');
  assert.ok(insertFixAt > acceptedFixAt, 'both fixes run together, at the same point');
  assert.ok(nextGoalReadyAt > insertFixAt,
    'both fixes complete before the state machine declares the next Goal READY');

  assert.doesNotMatch(source, /--amend/);
  assert.match(source, /paths:\s*\[acceptedRowFix\.path\]/, 'only the one file this change touches is ever staged');
});
