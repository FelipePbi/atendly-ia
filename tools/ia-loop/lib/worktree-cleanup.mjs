/**
 * IA Loop — removing the worktrees of Goals that are closed and integrated.
 *
 * Every Goal gets `.ai-worktrees/goal-NNN` and every closure creates
 * `.ai-worktrees/plan-after-goal-NNN`. Nothing ever removed either (M-09): by
 * Goal 104 there were ~200 of them, each a full checkout, many with their own
 * installed `node_modules`.
 *
 * Removing one is dangerous in exactly one way, and it is the way that would
 * hurt the most. A worktree may hold a JUNCTION (or symlink) pointing at a
 * real directory somewhere else — `_base089/apps/frontend/node_modules`
 * points into another worktree, and the cheap way to provision a worktree is
 * a junction to the MAIN checkout's `node_modules`. A recursive delete that
 * follows a junction deletes the target's contents. So every link inside the
 * worktree is removed FIRST, as a link (unlink/rmdir on the link itself, never
 * on what it points to), each one verified gone with its target verified
 * still there, and the tree is re-walked to prove no link is left before
 * anything recursive runs.
 *
 * Which worktrees qualify is decided from evidence on main, never from the
 * directory name alone:
 *
 *   - the Goal's MIGRATION_STATUS.md row reads ACCEPTED, and the closure commit
 *     that row names is reachable from main;
 *   - the worktree is a registered git worktree, unlocked, on the branch the
 *     harness gives it (`ai-loop/goal-NNN` / `ai-loop/plan-after-goal-NNN`);
 *   - its HEAD landed on main — an ancestor of main, or cherry-picked onto it
 *     (`-x` leaves "cherry picked from commit <sha>" in the message);
 *   - it has no uncommitted changes outside `graphify-out/` (the closure
 *     commit deliberately leaves `tools/ia-loop/` edits behind; whatever is
 *     left there is for a person to look at, not to throw away);
 *   - it is not the Goal running now, and it is not marked to be kept.
 *
 * Keeping a worktree for inspection. The harness had no marker for this, so
 * there are two, both outside the worktree's own tree (a file INSIDE it would
 * be an untracked file and ride into the Goal's diff):
 *
 *   - `git worktree lock .ai-worktrees/<name> --reason "…"` — git's own;
 *   - an empty file `.ai-worktrees/<name>.keep` next to the directory.
 *
 * Branches are deleted with `git branch -d` only, which refuses anything not
 * merged. Goals are integrated by cherry-pick, so their branches normally ARE
 * "not merged" and stay: a branch costs a ref, a worktree costs gigabytes.
 */

import { access, lstat, readdir, readFile, readlink, rm, rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { SpikeError } from './claude-process.mjs';
import { git } from './git-ops.mjs';
import { assertSafeTempPath } from './resource-paths.mjs';
import { killWorktreeProcesses } from './orphan-processes.mjs';
import { WORKTREE_ROOT } from './worktree-manager.mjs';

export const KEEP_MARKER_SUFFIX = '.keep';

export const CLEANUP_VERDICTS = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  UNKNOWN_DIRECTORY: 'UNKNOWN_DIRECTORY',
  CURRENT_GOAL: 'CURRENT_GOAL',
  KEEP_MARKER: 'KEEP_MARKER',
  NOT_A_REGISTERED_WORKTREE: 'NOT_A_REGISTERED_WORKTREE',
  LOCKED: 'LOCKED',
  UNEXPECTED_BRANCH: 'UNEXPECTED_BRANCH',
  GOAL_NOT_ACCEPTED: 'GOAL_NOT_ACCEPTED',
  CLOSURE_NOT_ON_MAIN: 'CLOSURE_NOT_ON_MAIN',
  HEAD_NOT_INTEGRATED: 'HEAD_NOT_INTEGRATED',
  UNCOMMITTED_CHANGES: 'UNCOMMITTED_CHANGES',
});

/** `goal-NNN` and `plan-after-goal-NNN` are the harness's; anything else is somebody else's. */
export function classifyWorktreeName(name) {
  const goal = /^goal-(\d{3})$/.exec(name);
  if (goal) return { kind: 'goal', goalId: goal[1], branch: `ai-loop/goal-${goal[1]}` };
  const plan = /^plan-after-goal-(\d{3})$/.exec(name);
  if (plan) return { kind: 'planning', goalId: plan[1], branch: `ai-loop/plan-after-goal-${plan[1]}` };
  return { kind: 'unknown', goalId: null, branch: null };
}

/** `git worktree list --porcelain`, with the fields this module needs. */
export function parseWorktreePorcelain(text) {
  const entries = [];
  let current = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length), head: null, branch: null, locked: false, prunable: false };
    } else if (!current) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
    } else if (line === 'locked' || line.startsWith('locked ')) {
      current.locked = true;
    } else if (line === 'prunable' || line.startsWith('prunable ')) {
      current.prunable = true;
    }
  }
  if (current) entries.push(current);
  return entries;
}

/**
 * Goal id → { status, closureCommit } from MIGRATION_STATUS.md's table.
 * The Commit column reads `` `<closure>` (origem `<source>`) ``; the FIRST sha
 * is the one that landed on main.
 */
export function parseClosureTable(statusText) {
  const rows = new Map();
  for (const line of String(statusText ?? '').split(/\r?\n/)) {
    const row = /^\|\s*(\d{3})\s*[—-][^|]*\|\s*([A-Z_]+)\s*\|([^|]*)\|/.exec(line);
    if (!row) continue;
    const sha = /`([0-9a-f]{7,40})`/.exec(row[3]);
    rows.set(row[1], { status: row[2], closureCommit: sha ? sha[1] : null });
  }
  return rows;
}

/**
 * The whole decision for one directory, over facts already gathered. Pure.
 * The first rule that fails names the reason; only a directory that passes
 * every one is ELIGIBLE.
 */
export function judgeWorktree({
  kind, branch, current = false, keepMarker = false, registered = null,
  closure = null, closureOnMain = false, headIntegrated = false, dirtyFiles = [],
}) {
  const V = CLEANUP_VERDICTS;
  if (kind !== 'goal' && kind !== 'planning') return V.UNKNOWN_DIRECTORY;
  if (current) return V.CURRENT_GOAL;
  if (keepMarker) return V.KEEP_MARKER;
  if (!registered) return V.NOT_A_REGISTERED_WORKTREE;
  if (registered.locked) return V.LOCKED;
  if (registered.branch !== branch) return V.UNEXPECTED_BRANCH;
  if (closure?.status !== 'ACCEPTED' || !closure.closureCommit) return V.GOAL_NOT_ACCEPTED;
  if (!closureOnMain) return V.CLOSURE_NOT_ON_MAIN;
  if (!headIntegrated) return V.HEAD_NOT_INTEGRATED;
  if (dirtyFiles.length > 0) return V.UNCOMMITTED_CHANGES;
  return V.ELIGIBLE;
}

const samePath = (a, b) => {
  const norm = (p) => {
    const resolved = resolve(String(p));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return norm(a) === norm(b);
};

const exists = (path) => access(path).then(() => true, () => false);

/** Read-only git: `--no-optional-locks` so a dry run never rewrites an index. */
const readGit = (args, cwd) => git(['--no-optional-locks', ...args], { cwd });

/**
 * Gathers the facts for every directory under `.ai-worktrees` (or only
 * `names`) and judges each one. Reads only.
 *
 * @param keep      names that are never eligible (the Goal running now, the
 *                  planning worktree that is still current)
 * @param mainRef   the branch the evidence must be reachable from
 */
export async function planWorktreeCleanup({ repoRoot, names = null, keep = [], mainRef = 'main' }) {
  const worktreesRoot = join(repoRoot, WORKTREE_ROOT);

  let candidates = names;
  if (candidates) {
    const present = [];
    for (const name of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (name && await lstat(join(worktreesRoot, name)).then((info) => info.isDirectory(), () => false)) present.push(name);
    }
    candidates = present;
  } else {
    const entries = await readdir(worktreesRoot, { withFileTypes: true }).catch(() => []);
    candidates = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  }

  const registeredList = parseWorktreePorcelain(await readGit(['worktree', 'list', '--porcelain'], repoRoot));
  const statusText = await readFile(join(repoRoot, 'docs', 'migration', 'MIGRATION_STATUS.md'), 'utf8').catch(() => '');
  const closures = parseClosureTable(statusText);

  // Every source sha main says it cherry-picked, read once.
  const pickedLog = await readGit(['log', mainRef, '--grep', 'cherry picked from commit', '--format=%B'], repoRoot).catch(() => '');
  const cherryPicked = new Set([...pickedLog.matchAll(/cherry picked from commit ([0-9a-f]{40})/g)].map((m) => m[1]));

  const ancestorCache = new Map();
  const reachable = async (sha) => {
    if (!sha) return false;
    if (!ancestorCache.has(sha)) {
      ancestorCache.set(sha, await readGit(['merge-base', '--is-ancestor', sha, mainRef], repoRoot).then(() => true, () => false));
    }
    return ancestorCache.get(sha);
  };

  const items = [];
  for (const name of candidates) {
    const { kind, goalId, branch } = classifyWorktreeName(name);
    const path = join(worktreesRoot, name);
    const facts = {
      kind,
      branch,
      current: keep.includes(name),
      // eslint-disable-next-line no-await-in-loop -- one directory at a time keeps git calls serial
      keepMarker: await exists(join(worktreesRoot, `${name}${KEEP_MARKER_SUFFIX}`)),
      registered: registeredList.find((entry) => samePath(entry.path, path)) ?? null,
      closure: goalId ? closures.get(goalId) ?? null : null,
    };

    // Only spend git calls on what the cheap facts did not already rule out.
    let verdict = judgeWorktree({ ...facts, closureOnMain: true, headIntegrated: true });
    if (verdict === CLEANUP_VERDICTS.ELIGIBLE) {
      // eslint-disable-next-line no-await-in-loop
      facts.closureOnMain = await reachable(facts.closure.closureCommit);
      const head = facts.registered.head;
      // eslint-disable-next-line no-await-in-loop
      facts.headIntegrated = Boolean(head) && (cherryPicked.has(head) || await reachable(head));
      verdict = judgeWorktree(facts);
    }
    if (verdict === CLEANUP_VERDICTS.ELIGIBLE) {
      // eslint-disable-next-line no-await-in-loop
      const status = await readGit(['status', '--porcelain', '--', '.', ':(exclude)graphify-out'], path)
        .catch((error) => `?? <status failed: ${error.message}>`);
      facts.dirtyFiles = status === '' ? [] : status.split('\n').filter(Boolean);
      verdict = judgeWorktree(facts);
    }

    items.push({
      name, path, kind, goalId, branch,
      head: facts.registered?.head ?? null,
      registered: Boolean(facts.registered),
      closureCommit: facts.closure?.closureCommit ?? null,
      dirtyFiles: facts.dirtyFiles ?? [],
      verdict,
      eligible: verdict === CLEANUP_VERDICTS.ELIGIBLE,
    });
  }
  return items;
}

/**
 * Every symlink/junction under `dir`, never descending into one.
 *
 * `readdir` reports a junction as a symbolic link on Windows (libuv marks
 * every reparse point that way), so the walk sees it without following it.
 */
export async function findLinks(dir) {
  const links = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      // eslint-disable-next-line no-await-in-loop -- a depth-first walk, one directory at a time
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new SpikeError('WORKTREE_WALK_FAILED', `Cannot read ${current}: ${error.message}`);
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) links.push(full);
      else if (entry.isDirectory()) stack.push(full);
    }
  }
  return links;
}

/**
 * Removes one link as a link. Proves, before and after, that it really is a
 * link and that what it pointed to is still there afterwards.
 */
export async function removeLink(linkPath) {
  const info = await lstat(linkPath);
  if (!info.isSymbolicLink()) {
    throw new SpikeError('NOT_A_LINK', `${linkPath} is not a symlink/junction; refusing to remove it as one.`);
  }
  const raw = await readlink(linkPath).catch(() => null);
  const target = raw ? resolve(dirname(linkPath), raw) : null;
  const targetExisted = target ? await stat(linkPath).then(() => true, () => false) : false;

  // unlink removes a file symlink, and on Windows also a junction or a
  // directory symlink (libuv opens the reparse point itself). rmdir is the
  // fallback for platforms where a directory link needs it. Neither follows.
  try {
    await unlink(linkPath);
  } catch (error) {
    if (!['EPERM', 'EISDIR', 'EACCES'].includes(error.code)) throw error;
    await rmdir(linkPath);
  }

  const gone = await lstat(linkPath).then(() => false, (error) => error.code === 'ENOENT');
  if (!gone) throw new SpikeError('LINK_NOT_REMOVED', `${linkPath} is still there after removing it.`);
  if (targetExisted && !await exists(target)) {
    throw new SpikeError('LINK_TARGET_VANISHED',
      `Removing the link ${linkPath} took its target ${target} with it. Stopping all cleanup.`);
  }
  return { link: linkPath, target };
}

/**
 * Removes a worktree whose eligibility was already established. Order:
 * containment check → every link removed as a link → re-walk proves none is
 * left → `git worktree remove --force` → (fallback) plain recursive delete of
 * a tree that is now link-free + `git worktree prune` → `git branch -d`.
 */
export async function removeWorktree({ repoRoot, path, branch }) {
  const worktreesRoot = join(repoRoot, WORKTREE_ROOT);

  // The directory itself must be a real directory, strictly inside
  // .ai-worktrees once every link on the way is resolved.
  const own = await lstat(path);
  if (own.isSymbolicLink() || !own.isDirectory()) {
    throw new SpikeError('WORKTREE_NOT_A_DIRECTORY', `${path} is not a plain directory; refusing to remove it.`);
  }
  const contained = await assertSafeTempPath(path, worktreesRoot);
  if (!contained.safe) {
    throw new SpikeError('WORKTREE_OUTSIDE_ROOT', `${path} does not resolve inside ${worktreesRoot} (${contained.reason}).`);
  }

  const linksRemoved = [];
  for (const link of await findLinks(path)) {
    // eslint-disable-next-line no-await-in-loop -- each link is removed and verified before the next
    linksRemoved.push(await removeLink(link));
  }
  const leftover = await findLinks(path);
  if (leftover.length > 0) {
    throw new SpikeError('WORKTREE_LINKS_REMAIN', `${leftover.length} link(s) still inside ${path}; not deleting.`);
  }

  let method = 'git worktree remove';
  try {
    await git(['worktree', 'remove', '--force', path], { cwd: repoRoot, timeoutMs: 600_000 });
  } catch (error) {
    // Long paths inside node_modules, a file held open: git gives up part
    // way. What is left is a link-free tree, so a plain recursive delete
    // cannot reach outside it.
    if (!await exists(path)) throw error;
    if ((await findLinks(path)).length > 0) {
      throw new SpikeError('WORKTREE_LINKS_REMAIN', `git could not remove ${path} and links reappeared; not deleting.`);
    }
    await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    await git(['worktree', 'prune'], { cwd: repoRoot });
    method = `rm + git worktree prune (git: ${error.message.split('\n')[0]})`;
  }
  if (await exists(path)) throw new SpikeError('WORKTREE_NOT_REMOVED', `${path} still exists after removal.`);

  let branchDeleted = false;
  let branchDetail = null;
  if (branch) {
    try {
      await git(['branch', '-d', branch], { cwd: repoRoot });
      branchDeleted = true;
    } catch (error) {
      branchDetail = /not fully merged/i.test(error.message)
        ? 'kept: not merged (integrated by cherry-pick)'
        : `kept: ${error.message.split('\n')[0]}`;
    }
  }
  return { linksRemoved, method, branchDeleted, branchDetail };
}

/**
 * Kills what still runs out of each eligible worktree, then removes it. One
 * failure never stops the rest; each item says what happened to it.
 */
export async function applyWorktreeCleanup({
  repoRoot, items, emit = () => {}, killProcesses = killWorktreeProcesses, remove = removeWorktree,
}) {
  const results = [];
  for (const item of items.filter((entry) => entry.eligible)) {
    const result = { name: item.name, removed: false };
    try {
      // eslint-disable-next-line no-await-in-loop -- serial on purpose: one worktree's processes, then its files
      const processes = await killProcesses({
        worktreePaths: [item.path], worktreesRoot: join(repoRoot, WORKTREE_ROOT),
      });
      result.processesKilled = processes.killed.length;
      result.processesReported = processes.reported;
      // eslint-disable-next-line no-await-in-loop
      Object.assign(result, await remove({ repoRoot, path: item.path, branch: item.branch }));
      result.removed = true;
      emit(`  removed ${item.name} (${result.linksRemoved.length} link(s) unlinked first; ${result.method}; `
        + `branch ${result.branchDeleted ? 'deleted' : result.branchDetail}`
        + `${result.processesKilled ? `; ${result.processesKilled} process tree(s) killed` : ''})`);
    } catch (error) {
      result.error = `[${error.code ?? 'ERROR'}] ${error.message}`;
      emit(`  NOT removed ${item.name}: ${result.error}`);
      // A link that took its target with it means the protection failed in
      // a way nobody anticipated. Nothing more is touched.
      if (error.code === 'LINK_TARGET_VANISHED') {
        results.push(result);
        throw error;
      }
    }
    results.push(result);
  }
  return results;
}

/**
 * What a closure releases once its Goal is integrated (run-close.mjs):
 *
 *   1. every process still running out of the closed Goal's worktree and out
 *      of the planning worktree that produced the Goal — orphan or not, they
 *      serve a Goal that no longer exists (M-08);
 *   2. those two worktrees themselves, when `planWorktreeCleanup` finds them
 *      eligible (M-09). The planning worktree this closure just created is
 *      the current one and stays until the NEXT closure.
 *
 * `IA_LOOP_ORPHAN_SWEEP=0` skips step 1, `IA_LOOP_WORKTREE_CLEANUP=0` step 2.
 * Never throws, except when a link removal took its target with it — that
 * is the one failure that must stop the loop for a person.
 */
export async function cleanupAfterClosure({
  repoRoot, goalId, previousGoalId = null, emit = () => {}, env = process.env,
  killProcesses = killWorktreeProcesses, plan = planWorktreeCleanup, apply = applyWorktreeCleanup,
}) {
  const worktreesRoot = join(repoRoot, WORKTREE_ROOT);
  const names = [`goal-${goalId}`, previousGoalId ? `plan-after-goal-${previousGoalId}` : null].filter(Boolean);
  const summary = { processesKilled: [], processesReported: [], removed: [], kept: [], errors: [] };

  if (env.IA_LOOP_ORPHAN_SWEEP !== '0') {
    try {
      const outcome = await killProcesses({ worktreePaths: names.map((name) => join(worktreesRoot, name)), worktreesRoot });
      summary.processesKilled = outcome.killed.map((entry) => ({ pid: entry.pid, name: entry.name, treeSize: entry.treeSize, treeMb: entry.treeMb }));
      summary.processesReported = outcome.reported.map((entry) => ({ pid: entry.pid, name: entry.name, reason: entry.reason }));
      for (const entry of outcome.killed) {
        emit(`  killed process tree ${entry.pid} ${entry.name} (${entry.treeSize} proc, ${entry.treeMb} MB) — ${String(entry.evidence?.cmd ?? entry.cmd).slice(0, 120)}`);
      }
      for (const entry of outcome.failed ?? []) emit(`  process ${entry.pid} ${entry.name} not killed: ${entry.failure}`);
      for (const entry of outcome.reported) emit(`  process ${entry.pid} ${entry.name} left running: ${entry.reason} — ${entry.detail}`);
    } catch (error) {
      summary.errors.push(`process kill: ${error.message}`);
      emit(`  process kill failed: ${error.message}`);
    }
  }

  if (env.IA_LOOP_WORKTREE_CLEANUP === '0') return summary;

  try {
    const items = await plan({ repoRoot, names, keep: [`plan-after-goal-${goalId}`] });
    for (const item of items.filter((entry) => !entry.eligible)) {
      summary.kept.push({ name: item.name, verdict: item.verdict });
      emit(`  kept ${item.name}: ${item.verdict}`);
    }
    // Processes were already handled above, under their own switch.
    const results = await apply({
      repoRoot, items, emit, killProcesses: async () => ({ killed: [], reported: [], failed: [] }),
    });
    for (const result of results) {
      if (result.removed) summary.removed.push(result.name);
      else summary.errors.push(`${result.name}: ${result.error}`);
    }
  } catch (error) {
    if (error.code === 'LINK_TARGET_VANISHED') throw error;
    summary.errors.push(`worktree cleanup: ${error.message}`);
    emit(`  worktree cleanup failed: ${error.message}`);
  }
  return summary;
}
