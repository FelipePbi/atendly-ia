/**
 * The Goal's own "**Status:**" line rides inside the closure commit.
 *
 * Written from the closure history: forty Goals were followed on main by a
 * separate `docs(migration): mark Goal NNN ACCEPTED (closure documentation
 * omitted it)` commit, because whether the closure documentation model
 * touched the status line was luck (Goal104's did; Goal097's and Goal103's
 * did not). The harness knew the answer all along; it now writes it into
 * `feat(migration): complete goal NNN` itself, and the post-integration
 * repair is left as the safety net that main ENDS ACCEPTED.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyClosureCommitStatusTransition,
  ensureGoalAcceptedStatus,
  flipGoalStatusForClosureCommit,
} from '../lib/goal-status-transition.mjs';
import { git, stageAndCommit, collectWorktreeChanges } from '../lib/git-ops.mjs';

const codeIs = (code) => (error) => error.code === code;
const EVIDENCE = Object.freeze({ reviewDecision: 'ACCEPTED', closureDocsJobId: '097-r3-tech_lead-1a2b3c4d' });

const readyDoc = `# Goal 097 — Agenda\n\n**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent.\n\nCorpo.\n`;

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-closure-status-'));
  try { return await run(dir); } finally { await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

// ---------------------------------------------------------------------------
// The pure decision
// ---------------------------------------------------------------------------

test('READY becomes ACCEPTED with the review and the closure docs recorded; the sentence survives', () => {
  const { text, changed } = applyClosureCommitStatusTransition(readyDoc, EVIDENCE);
  assert.equal(changed, true);
  assert.equal(text, readyDoc.replace('**Status: READY.**', '**Status: ACCEPTED.**'),
    'only the status word moved');
});

test('already ACCEPTED (the closure docs did it, as in Goal104) is a byte-identical no-op', () => {
  const doc = readyDoc.replace('READY.**', 'ACCEPTED** na rodada 2 (review).');
  const result = applyClosureCommitStatusTransition(doc, EVIDENCE);
  assert.equal(result.changed, false);
  assert.equal(result.text, doc);
});

test('refused without an ACCEPTED review or without closure documentation recorded', () => {
  assert.throws(() => applyClosureCommitStatusTransition(readyDoc, { ...EVIDENCE, reviewDecision: 'CHANGES_REQUIRED' }),
    codeIs('STATUS_TRANSITION_REFUSED'));
  assert.throws(() => applyClosureCommitStatusTransition(readyDoc, { ...EVIDENCE, closureDocsJobId: null }),
    codeIs('STATUS_TRANSITION_REFUSED'));
});

test('a status other than READY or ACCEPTED fails closed; an unknown line shape is reported, not guessed', () => {
  assert.throws(() => applyClosureCommitStatusTransition(readyDoc.replace('READY', 'DRAFT'), EVIDENCE),
    codeIs('GOAL_STATUS_UNEXPECTED'));
  assert.throws(() => applyClosureCommitStatusTransition('# Goal\n\nStatus: READY\n', EVIDENCE),
    codeIs('GOAL_STATUS_LINE_UNRECOGNISED'));
});

// ---------------------------------------------------------------------------
// End to end on a real repository: one commit, no follow-up
// ---------------------------------------------------------------------------

test('the flip lands in the feat commit, and the post-integration repair then has nothing to do', async () => {
  await withDir(async (dir) => {
    const goalsDir = join(dir, 'docs', 'migration', 'goals');
    await mkdir(goalsDir, { recursive: true });
    const goalPath = join(goalsDir, '097-agenda-igual-ao-prototipo.md');
    await writeFile(goalPath, readyDoc, 'utf8');
    await writeFile(join(dir, 'app.txt'), 'v1\n', 'utf8');
    await git(['init', '-q', '-b', 'main'], { cwd: dir });
    await git(['config', 'user.email', 't@t'], { cwd: dir });
    await git(['config', 'user.name', 'test'], { cwd: dir });
    await git(['config', 'core.autocrlf', 'false'], { cwd: dir });
    await git(['add', '-A'], { cwd: dir });
    await git(['commit', '-qm', 'init'], { cwd: dir });
    const base = await git(['rev-parse', 'HEAD'], { cwd: dir });

    // The accepted implementation, as the Developer left it.
    await writeFile(join(dir, 'app.txt'), 'v2\n', 'utf8');

    // run-close's order: flip, then collect, then the one closure commit.
    const flip = await flipGoalStatusForClosureCommit({ worktreeRoot: dir, goalId: '097', ...EVIDENCE });
    assert.equal(flip.changed, true);
    const changes = await collectWorktreeChanges(dir, base);
    const { sha } = await stageAndCommit({
      cwd: dir, paths: changes.changedFiles, message: 'feat(migration): complete goal 097 - Agenda',
    });

    const inCommit = await git(['show', '--name-only', '--format=', sha], { cwd: dir });
    assert.match(inCommit, /docs\/migration\/goals\/097-agenda-igual-ao-prototipo\.md/);
    assert.match(await git(['show', `${sha}:docs/migration/goals/097-agenda-igual-ao-prototipo.md`], { cwd: dir }),
      /\*\*Status: ACCEPTED\.\*\*/);

    // The safety net, once integration has proven the rest of the evidence.
    const repair = await ensureGoalAcceptedStatus({
      repoRoot: dir, goalId: '097', ...EVIDENCE,
      integratedClosureCommit: sha, newMigrationBaseline: sha,
    });
    assert.equal(repair.changed, false, 'no separate "omitted it" commit is needed');
    assert.equal(await git(['status', '--porcelain'], { cwd: dir }), '');

    // A crash between the flip and the commit, resumed: the flip is a no-op.
    const again = await flipGoalStatusForClosureCommit({ worktreeRoot: dir, goalId: '097', ...EVIDENCE });
    assert.equal(again.changed, false);
    assert.equal(await readFile(goalPath, 'utf8'), readyDoc.replace('READY.**', 'ACCEPTED.**'));
  });
});

// ---------------------------------------------------------------------------
// Wiring in run-close.mjs, proven by source as the sibling tests do
// ---------------------------------------------------------------------------

test('run-close flips the status on the WORKTREE before collecting and committing the closure', async () => {
  const source = await readFile(new URL('../run-close.mjs', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('// ---------- Source commit on the Goal branch'),
    source.indexOf('// ---------- Integrate into the main checkout'));

  const flipAt = block.indexOf('flipGoalStatusForClosureCommit({');
  const collectAt = block.indexOf('collectWorktreeChanges(absWorktree');
  const commitAt = block.indexOf('feat(migration): complete goal');
  assert.ok(flipAt > 0, 'the flip is called in the source-commit block');
  assert.ok(flipAt < collectAt && collectAt < commitAt, 'flip, then collect, then commit');
  assert.match(block.slice(flipAt, collectAt), /worktreeRoot:\s*absWorktree/, 'never the main checkout');
  assert.match(block.slice(flipAt, collectAt), /GOAL_STATUS_LINE_UNRECOGNISED/,
    'an unrecognised line is tolerated here, as in the post-integration repair');

  // The safety net is still there, after integration.
  const integrateAt = source.indexOf('// ---------- Integrate into the main checkout');
  const repairAt = source.indexOf('await commitAcceptedStatusIfMissing({', integrateAt);
  assert.ok(repairAt > integrateAt, 'the post-integration repair still runs');
});
