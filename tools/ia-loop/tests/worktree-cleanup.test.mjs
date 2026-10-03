/**
 * M-09: removing the worktrees of closed, integrated Goals — and never
 * anything a junction inside them points at. Git is exercised against
 * throwaway repositories; the junctions are real (Windows `junction`, a
 * directory symlink elsewhere) and point at directories OUTSIDE the worktree
 * that must survive.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { access, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git } from '../lib/git-ops.mjs';
import {
  CLEANUP_VERDICTS,
  applyWorktreeCleanup,
  classifyWorktreeName,
  cleanupAfterClosure,
  findLinks,
  judgeWorktree,
  parseClosureTable,
  parseWorktreePorcelain,
  planWorktreeCleanup,
  removeLink,
  removeWorktree,
} from '../lib/worktree-cleanup.mjs';

const V = CLEANUP_VERDICTS;
const exists = (path) => access(path).then(() => true, () => false);
const noKill = async () => ({ killed: [], reported: [], failed: [] });

async function withTemp(run) {
  const root = await mkdtemp(join(tmpdir(), 'ia-loop-wt-cleanup-'));
  try { return await run(root); } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}

/** A junction on Windows (no privilege needed), a directory symlink elsewhere. */
const link = (target, path) => symlink(target, path, process.platform === 'win32' ? 'junction' : 'dir');

// ---------------------------------------------------------------------------
// Pure parts
// ---------------------------------------------------------------------------

test('only goal-NNN and plan-after-goal-NNN are the harness\'s', () => {
  assert.deepEqual(classifyWorktreeName('goal-095'), { kind: 'goal', goalId: '095', branch: 'ai-loop/goal-095' });
  assert.deepEqual(classifyWorktreeName('plan-after-goal-094'),
    { kind: 'planning', goalId: '094', branch: 'ai-loop/plan-after-goal-094' });
  for (const name of ['_base089', 'plan-next-goal', 'goal-95', 'goal-0950']) {
    assert.equal(classifyWorktreeName(name).kind, 'unknown', name);
  }
});

test('git worktree porcelain is read with head, branch and lock', () => {
  const entries = parseWorktreePorcelain([
    'worktree E:/repo', 'HEAD aaaa', 'branch refs/heads/main', '',
    'worktree E:/repo/.ai-worktrees/goal-001', 'HEAD bbbb', 'branch refs/heads/ai-loop/goal-001', 'locked inspection', '',
    'worktree E:/repo/.ai-worktrees/x', 'HEAD cccc', 'detached', 'prunable gitdir file points to non-existent location', '',
  ].join('\n'));
  assert.deepEqual(entries.map((e) => [e.path, e.head, e.branch, e.locked, e.prunable]), [
    ['E:/repo', 'aaaa', 'main', false, false],
    ['E:/repo/.ai-worktrees/goal-001', 'bbbb', 'ai-loop/goal-001', true, false],
    ['E:/repo/.ai-worktrees/x', 'cccc', null, false, true],
  ]);
});

test('the closure table yields status and the sha that landed on main', () => {
  const rows = parseClosureTable([
    '| Goal | Status | Commit | Review | Observações |',
    '| --- | --- | --- | --- | --- |',
    '| 095 — Serviços | ACCEPTED | `7393eda88312a1f287031c4ee945729befd29323` (origem `c521df0b0efbd8203be2f0f479a0aecaff5aa674`) | r | o |',
    '| 106 — WhatsApp | READY | — | — | o |',
  ].join('\n'));
  assert.deepEqual(rows.get('095'), { status: 'ACCEPTED', closureCommit: '7393eda88312a1f287031c4ee945729befd29323' });
  assert.deepEqual(rows.get('106'), { status: 'READY', closureCommit: null });
});

test('every rule is checked, in order, and only a worktree passing all of them is ELIGIBLE', () => {
  const ok = {
    kind: 'goal', branch: 'ai-loop/goal-001', registered: { branch: 'ai-loop/goal-001', locked: false },
    closure: { status: 'ACCEPTED', closureCommit: 'abc1234' }, closureOnMain: true, headIntegrated: true, dirtyFiles: [],
  };
  assert.equal(judgeWorktree(ok), V.ELIGIBLE);
  assert.equal(judgeWorktree({ ...ok, kind: 'unknown' }), V.UNKNOWN_DIRECTORY);
  assert.equal(judgeWorktree({ ...ok, current: true }), V.CURRENT_GOAL);
  assert.equal(judgeWorktree({ ...ok, keepMarker: true }), V.KEEP_MARKER);
  assert.equal(judgeWorktree({ ...ok, registered: null }), V.NOT_A_REGISTERED_WORKTREE);
  assert.equal(judgeWorktree({ ...ok, registered: { ...ok.registered, locked: true } }), V.LOCKED);
  assert.equal(judgeWorktree({ ...ok, registered: { ...ok.registered, branch: 'main' } }), V.UNEXPECTED_BRANCH);
  assert.equal(judgeWorktree({ ...ok, closure: { status: 'READY', closureCommit: null } }), V.GOAL_NOT_ACCEPTED);
  assert.equal(judgeWorktree({ ...ok, closure: null }), V.GOAL_NOT_ACCEPTED);
  assert.equal(judgeWorktree({ ...ok, closureOnMain: false }), V.CLOSURE_NOT_ON_MAIN);
  assert.equal(judgeWorktree({ ...ok, headIntegrated: false }), V.HEAD_NOT_INTEGRATED);
  assert.equal(judgeWorktree({ ...ok, dirtyFiles: ['M tools/ia-loop/x.mjs'] }), V.UNCOMMITTED_CHANGES);
});

// ---------------------------------------------------------------------------
// Links: removed as links, never followed
// ---------------------------------------------------------------------------

test('a junction is found without being followed, and removing it leaves its target intact', async () => {
  await withTemp(async (root) => {
    const realModules = join(root, 'main-checkout', 'node_modules');
    await mkdir(join(realModules, 'pkg'), { recursive: true });
    await writeFile(join(realModules, 'pkg', 'index.js'), 'sentinel', 'utf8');

    const worktree = join(root, 'wt');
    await mkdir(join(worktree, 'apps', 'bff'), { recursive: true });
    await link(realModules, join(worktree, 'node_modules'));
    await link(realModules, join(worktree, 'apps', 'bff', 'node_modules'));

    const links = (await findLinks(worktree)).sort();
    assert.deepEqual(links, [join(worktree, 'apps', 'bff', 'node_modules'), join(worktree, 'node_modules')].sort());

    for (const found of links) await removeLink(found);
    assert.deepEqual(await findLinks(worktree), []);
    assert.equal(await readFile(join(realModules, 'pkg', 'index.js'), 'utf8'), 'sentinel');
  });
});

test('removeLink refuses a real directory', async () => {
  await withTemp(async (root) => {
    await mkdir(join(root, 'real'));
    await assert.rejects(removeLink(join(root, 'real')), (error) => error.code === 'NOT_A_LINK');
    assert.equal(await exists(join(root, 'real')), true);
  });
});

// ---------------------------------------------------------------------------
// A throwaway repository shaped like the real one
// ---------------------------------------------------------------------------

async function makeRepo(root) {
  const repo = join(root, 'repo');
  await mkdir(join(repo, 'docs', 'migration'), { recursive: true });
  await git(['init', '-q', '-b', 'main'], { cwd: repo });
  await git(['config', 'user.email', 't@t'], { cwd: repo });
  await git(['config', 'user.name', 'test'], { cwd: repo });
  await writeFile(join(repo, '.gitignore'), '.ai-worktrees/\nnode_modules/\n', 'utf8');
  await writeFile(join(repo, 'docs', 'migration', 'MIGRATION_STATUS.md'), '| Goal | Status | Commit | Review | Obs |\n| --- | --- | --- | --- | --- |\n', 'utf8');
  await git(['add', '-A'], { cwd: repo });
  await git(['commit', '-qm', 'init'], { cwd: repo });
  // The main checkout's real dependencies, which a junction may point at.
  await mkdir(join(repo, 'node_modules', 'pkg'), { recursive: true });
  await writeFile(join(repo, 'node_modules', 'pkg', 'index.js'), 'sentinel', 'utf8');
  return repo;
}

const head = (cwd) => git(['rev-parse', 'HEAD'], { cwd });

async function addWorktree(repo, name, branch) {
  await git(['worktree', 'add', '-q', '-b', branch, `.ai-worktrees/${name}`, 'main'], { cwd: repo });
  return join(repo, '.ai-worktrees', name);
}

async function appendRow(repo, row) {
  const path = join(repo, 'docs', 'migration', 'MIGRATION_STATUS.md');
  await writeFile(path, `${await readFile(path, 'utf8')}${row}\n`, 'utf8');
  await git(['add', '--', 'docs/migration/MIGRATION_STATUS.md'], { cwd: repo });
  await git(['commit', '-qm', `docs: row ${row.slice(2, 5)}`], { cwd: repo });
}

/** A Goal that ran, was committed on its branch, cherry-picked onto main and recorded ACCEPTED. */
async function acceptedGoal(repo, goalId) {
  const wt = await addWorktree(repo, `goal-${goalId}`, `ai-loop/goal-${goalId}`);
  await writeFile(join(wt, `feature-${goalId}.txt`), goalId, 'utf8');
  await git(['add', '-A'], { cwd: wt });
  await git(['commit', '-qm', `feat: goal ${goalId}`], { cwd: wt });
  const source = await head(wt);
  await git(['cherry-pick', '-x', source], { cwd: repo });
  const closure = await head(repo);
  await appendRow(repo, `| ${goalId} — Goal ${goalId} | ACCEPTED | \`${closure}\` (origem \`${source}\`) | r | o |`);
  return wt;
}

test('the backlog plan judges every directory from evidence on main', async () => {
  await withTemp(async (root) => {
    const repo = await makeRepo(root);
    await acceptedGoal(repo, '001');
    const planning = await addWorktree(repo, 'plan-after-goal-001', 'ai-loop/plan-after-goal-001');
    await addWorktree(repo, 'goal-002', 'ai-loop/goal-002'); // never accepted
    await acceptedGoal(repo, '003');
    await writeFile(join(repo, '.ai-worktrees', 'goal-003.keep'), '', 'utf8');
    const locked = await acceptedGoal(repo, '004');
    await git(['worktree', 'lock', locked], { cwd: repo });
    const dirty = await acceptedGoal(repo, '005');
    await writeFile(join(dirty, 'notes.txt'), 'for a person', 'utf8');
    const ahead = await acceptedGoal(repo, '006');
    await writeFile(join(ahead, 'later.txt'), 'x', 'utf8');
    await git(['add', '-A'], { cwd: ahead });
    await git(['commit', '-qm', 'not integrated'], { cwd: ahead });
    await mkdir(join(repo, '.ai-worktrees', '_base089'));
    await mkdir(join(repo, '.ai-worktrees', 'goal-007'));
    await acceptedGoal(repo, '008');

    const items = await planWorktreeCleanup({ repoRoot: repo, keep: ['goal-008'] });
    const verdicts = Object.fromEntries(items.map((item) => [item.name, item.verdict]));
    assert.deepEqual(verdicts, {
      _base089: V.UNKNOWN_DIRECTORY,
      'goal-001': V.ELIGIBLE,
      'goal-002': V.GOAL_NOT_ACCEPTED,
      'goal-003': V.KEEP_MARKER,
      'goal-004': V.LOCKED,
      'goal-005': V.UNCOMMITTED_CHANGES,
      'goal-006': V.HEAD_NOT_INTEGRATED,
      'goal-007': V.NOT_A_REGISTERED_WORKTREE,
      'goal-008': V.CURRENT_GOAL,
      'plan-after-goal-001': V.ELIGIBLE,
    });
    assert.equal(await exists(planning), true, 'planning never touches anything');
    await git(['worktree', 'unlock', locked], { cwd: repo });
  });
});

test('removal unlinks junctions first: the main checkout\'s node_modules survives, the worktree does not', async () => {
  await withTemp(async (root) => {
    const repo = await makeRepo(root);
    const goalWt = await acceptedGoal(repo, '001');
    const planWt = await addWorktree(repo, 'plan-after-goal-001', 'ai-loop/plan-after-goal-001');
    await link(join(repo, 'node_modules'), join(goalWt, 'node_modules'));
    await mkdir(join(goalWt, 'apps', 'bff'), { recursive: true });
    await link(join(repo, 'node_modules'), join(goalWt, 'apps', 'bff', 'node_modules'));
    // A real, installed node_modules inside the worktree goes with it.
    await mkdir(join(planWt, 'apps', 'web', 'node_modules', 'dep'), { recursive: true });
    await writeFile(join(planWt, 'apps', 'web', 'node_modules', 'dep', 'x.js'), 'x', 'utf8');

    const items = await planWorktreeCleanup({ repoRoot: repo });
    assert.deepEqual(items.filter((i) => i.eligible).map((i) => i.name), ['goal-001', 'plan-after-goal-001']);

    const lines = [];
    const results = await applyWorktreeCleanup({ repoRoot: repo, items, emit: (l) => lines.push(l), killProcesses: noKill });

    assert.deepEqual(results.map((r) => [r.name, r.removed]), [['goal-001', true], ['plan-after-goal-001', true]]);
    assert.equal(results[0].linksRemoved.length, 2);
    assert.equal(await exists(goalWt), false);
    assert.equal(await exists(planWt), false);
    assert.equal(await readFile(join(repo, 'node_modules', 'pkg', 'index.js'), 'utf8'), 'sentinel');

    const listed = await git(['worktree', 'list', '--porcelain'], { cwd: repo });
    assert.doesNotMatch(listed, /\.ai-worktrees/);
    // Cherry-picked, so "not merged": the Goal branch stays. The planning
    // branch never moved off main, so `branch -d` may delete it.
    assert.equal(results[0].branchDeleted, false);
    assert.match(results[0].branchDetail, /not merged/);
    assert.equal(results[1].branchDeleted, true);
    assert.notEqual(await git(['branch', '--list', 'ai-loop/goal-001'], { cwd: repo }), '');
  });
});

test('a worktree that is itself a link is refused before anything is removed', async () => {
  await withTemp(async (root) => {
    const repo = await makeRepo(root);
    await mkdir(join(repo, '.ai-worktrees'), { recursive: true });
    await link(join(repo, 'node_modules'), join(repo, '.ai-worktrees', 'goal-009'));
    await assert.rejects(
      removeWorktree({ repoRoot: repo, path: join(repo, '.ai-worktrees', 'goal-009'), branch: 'ai-loop/goal-009' }),
      (error) => error.code === 'WORKTREE_NOT_A_DIRECTORY',
    );
    assert.equal((await lstat(join(repo, '.ai-worktrees', 'goal-009'))).isSymbolicLink(), true);
    assert.equal(await readFile(join(repo, 'node_modules', 'pkg', 'index.js'), 'utf8'), 'sentinel');
  });
});

test('one failed removal does not stop the rest; a vanished link target stops everything', async () => {
  const items = ['a', 'b', 'c'].map((name) => ({ name, path: `/x/${name}`, branch: null, eligible: true }));
  const calls = [];
  const results = await applyWorktreeCleanup({
    repoRoot: '/x', items, killProcesses: noKill,
    remove: async ({ path }) => {
      calls.push(path);
      if (path.endsWith('a')) throw Object.assign(new Error('busy'), { code: 'GIT_FAILED' });
      return { linksRemoved: [], method: 'fake', branchDeleted: false, branchDetail: null };
    },
  });
  assert.deepEqual(results.map((r) => r.removed), [false, true, true]);

  const stopped = [];
  await assert.rejects(applyWorktreeCleanup({
    repoRoot: '/x', items, killProcesses: noKill,
    remove: async ({ path }) => {
      stopped.push(path);
      throw Object.assign(new Error('gone'), { code: 'LINK_TARGET_VANISHED' });
    },
  }), (error) => error.code === 'LINK_TARGET_VANISHED');
  assert.equal(stopped.length, 1);
});

test('closure releases the closed Goal and the planning worktree that produced it, never the new one', async () => {
  const seen = {};
  const summary = await cleanupAfterClosure({
    repoRoot: '/repo', goalId: '095', previousGoalId: '094', env: {},
    killProcesses: async ({ worktreePaths }) => {
      seen.killed = worktreePaths.map((p) => p.replace(/\\/g, '/'));
      return { killed: [{ pid: 7, name: 'bash.exe', treeSize: 6, treeMb: 900, cmd: 'x' }], reported: [], failed: [] };
    },
    plan: async ({ names, keep }) => {
      seen.names = names;
      seen.keep = keep;
      return [
        { name: 'goal-095', path: '/repo/.ai-worktrees/goal-095', eligible: true },
        { name: 'plan-after-goal-094', path: '/repo/.ai-worktrees/plan-after-goal-094', eligible: false, verdict: V.KEEP_MARKER },
      ];
    },
    apply: async ({ items }) => items.filter((i) => i.eligible).map((i) => ({ name: i.name, removed: true })),
  });
  assert.deepEqual(seen.killed, ['/repo/.ai-worktrees/goal-095', '/repo/.ai-worktrees/plan-after-goal-094']);
  assert.deepEqual(seen.names, ['goal-095', 'plan-after-goal-094']);
  assert.deepEqual(seen.keep, ['plan-after-goal-095']);
  assert.deepEqual(summary.removed, ['goal-095']);
  assert.deepEqual(summary.kept, [{ name: 'plan-after-goal-094', verdict: V.KEEP_MARKER }]);
  assert.equal(summary.processesKilled.length, 1);
});

test('closure cleanup honours its switches and never fails the closure, except for a vanished link target', async () => {
  const never = async () => { throw new Error('must not be called'); };
  const off = await cleanupAfterClosure({
    repoRoot: '/repo', goalId: '095', env: { IA_LOOP_ORPHAN_SWEEP: '0', IA_LOOP_WORKTREE_CLEANUP: '0' },
    killProcesses: never, plan: never, apply: never,
  });
  assert.deepEqual(off, { processesKilled: [], processesReported: [], removed: [], kept: [], errors: [] });

  const failing = await cleanupAfterClosure({
    repoRoot: '/repo', goalId: '095', env: {},
    killProcesses: async () => { throw new Error('powershell missing'); },
    plan: async () => { throw new Error('git broke'); },
  });
  assert.equal(failing.errors.length, 2);

  await assert.rejects(cleanupAfterClosure({
    repoRoot: '/repo', goalId: '095', env: {}, killProcesses: noKill,
    plan: async () => [{ name: 'goal-095', eligible: true }],
    apply: async () => { throw Object.assign(new Error('gone'), { code: 'LINK_TARGET_VANISHED' }); },
  }), (error) => error.code === 'LINK_TARGET_VANISHED');
});
