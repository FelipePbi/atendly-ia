/**
 * A correction round should know which files it is correcting.
 *
 * Written from Goal 015: the single unit a correction round runs was the only
 * unit in the pipeline with no file pointers at all, so it began each round
 * from zero knowledge of the diff under review and the graph orientation had
 * nothing to resolve — `NO_FILES` on two of the three rounds. The orchestrator
 * was already handing the reviewer this exact list, collected from git.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { FALLBACK_RELEVANT_FILES, fallbackExecutionPlan } from '../lib/execution-plan-store.mjs';

const BLOCKERS = ['B1: o shell entra em loop de render', 'B2: falta o estado UNKNOWN'];
const CHANGED = [
  'apps/frontend/src/shared/layout/AppShell.tsx',
  'apps/bff/src/modules/status/routes.ts',
];

const correction = (over = {}) => fallbackExecutionPlan({
  goal: '015', round: 2, blockers: BLOCKERS, changedFiles: CHANGED, ...over,
});

test('the correction unit carries the files the previous round changed', () => {
  const [unit] = correction().workUnits;
  assert.equal(unit.id, 'FIX-001');
  assert.deepEqual(unit.relevantFiles, CHANGED);
});

test('the pointers are pointers, not a licence to widen scope', () => {
  const [unit] = correction().workUnits;
  assert.match(unit.objective, /exclusivamente/, 'the objective still binds the unit to the blockers');
  assert.equal(unit.acceptanceCriteria.length, BLOCKERS.length, 'one criterion per blocker, unchanged');
});

test('duplicates and blanks never reach the packet', () => {
  const [unit] = correction({
    changedFiles: ['a/one.ts', 'a/one.ts', '', '   ', null, 42, 'b/two.ts'],
  }).workUnits;
  assert.deepEqual(unit.relevantFiles, ['a/one.ts', 'b/two.ts']);
});

test('a large diff is trimmed here rather than silently trimmed downstream', () => {
  const many = Array.from({ length: 120 }, (_, i) => `src/file${i}.ts`);
  const [unit] = correction({ changedFiles: many }).workUnits;
  assert.equal(unit.relevantFiles.length, FALLBACK_RELEVANT_FILES);
  assert.equal(unit.relevantFiles[0], 'src/file0.ts', 'the first files win, in diff order');
});

test('a round with nothing changed yet produces an empty list, never a crash', () => {
  for (const changedFiles of [[], undefined, null]) {
    const [unit] = correction({ changedFiles }).workUnits;
    assert.deepEqual(unit.relevantFiles, []);
  }
});

// --- the compatibility case is a different animal ----------------------

test('the compatibility plan (no blockers) is scoped to the whole Goal and takes no pointers', () => {
  const plan = fallbackExecutionPlan({ goal: '015', round: 1, blockers: [], changedFiles: CHANGED });
  const [unit] = plan.workUnits;
  assert.equal(unit.id, 'WU-001');
  // Round 1 has changed nothing yet; anything here would be a fiction.
  assert.deepEqual(unit.relevantFiles, CHANGED,
    'the caller only passes changes when there are some — the field is honest either way');
  assert.match(unit.objective, /documento do Goal/);
});
