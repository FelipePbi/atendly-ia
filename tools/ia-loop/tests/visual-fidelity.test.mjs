import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  developerVisualInstructions,
  extractPrototypeFrames,
  reviewerVisualInstructions,
  touchesFrontend,
} from '../lib/visual-fidelity.mjs';
import { buildWorkUnitContextPacket, buildWorkUnitPrompt } from '../lib/work-unit-context.mjs';
import { buildReviewPacket, renderReviewPrompt } from '../lib/review-packet.mjs';

test('a Goal opts in with one "Quadros do protótipo" line', () => {
  const goal = '# Goal 090\n\nQuadros do protótipo: `A6`, Agenda:A1, CL1 e H1.\n\nResto.';
  assert.deepEqual(extractPrototypeFrames(goal), ['A6', 'Agenda:A1', 'CL1', 'H1']);
  assert.deepEqual(extractPrototypeFrames('- **Quadros do prototipo:** 2.I3; 4.1'), ['2.I3', '4.1']);
});

test('a Goal without the line, or with prose after it, declares nothing it did not name', () => {
  assert.deepEqual(extractPrototypeFrames('# Goal sem tela'), []);
  assert.deepEqual(extractPrototypeFrames(null), []);
  assert.deepEqual(extractPrototypeFrames('Quadros do protótipo: nenhum quadro aplicável'), []);
});

test('both roles are told to run the comparison and look at the images', () => {
  const developer = developerVisualInstructions(['A6']).join('\n');
  const reviewer = reviewerVisualInstructions(['A6']).join('\n');
  for (const text of [developer, reviewer]) {
    assert.match(text, /npm run visual:compare -- --target A6/);
    assert.match(text, /side-by-side\.png/);
    assert.match(text, /Read/);
  }
  assert.match(developer, /PORTE esse markup/);
  assert.match(reviewer, /CHANGES_REQUIRED/);
  assert.deepEqual(developerVisualInstructions([]), []);
  assert.deepEqual(reviewerVisualInstructions([]), []);
});

test('only units that work on the frontend are held to the frames', () => {
  assert.equal(touchesFrontend({ expectedFiles: ['apps/frontend/src/x.tsx'] }), true);
  assert.equal(touchesFrontend({ expectedFiles: ['apps/bff/src/x.ts'] }), false);
});

const UNIT = Object.freeze({
  id: 'WU-01',
  title: 'Tela',
  objective: 'Portar o quadro',
  type: 'STANDARD',
  complexity: 'MEDIUM',
  risk: 'LOW',
  dependencies: [],
  acceptanceCriteria: ['igual ao quadro A6'],
  expectedFiles: ['apps/frontend/src/features/agenda/New.tsx'],
  relevantFiles: [],
});

test('the work unit prompt carries the visual block only when frames are declared', () => {
  const job = { jobId: 'j', goal: '090', round: 1, worktree: 'w' };
  const base = { goal: '090', goalPath: 'g.md', round: 1, unit: UNIT, worktree: 'w' };
  const plain = buildWorkUnitPrompt(buildWorkUnitContextPacket(base), job);
  assert.doesNotMatch(plain, /FIDELIDADE VISUAL/);
  const visual = buildWorkUnitPrompt(buildWorkUnitContextPacket({ ...base, prototypeFrames: ['A6'] }), job);
  assert.match(visual, /FIDELIDADE VISUAL/);
  assert.ok(visual.indexOf('FIDELIDADE VISUAL') < visual.indexOf('WorkUnitResult'), 'the contract must stay last');
});

test('the review prompt makes the comparison an acceptance criterion', () => {
  const packet = buildReviewPacket({
    goal: '090',
    goalPath: 'g.md',
    round: 1,
    reviewLevel: 'DEEP',
    worktreeInitialHead: 'abc',
    worktreePath: 'w',
    changes: { diff: '', diffStat: '', changedFiles: [], untracked: [], commits: [] },
    developerResult: null,
    prototypeFrames: ['A6'],
  });
  const prompt = renderReviewPrompt(packet);
  assert.match(prompt, /FIDELIDADE VISUAL — CRITÉRIO DE ACEITE/);
  assert.match(prompt, /npm run visual:compare -- --target A6/);
});
