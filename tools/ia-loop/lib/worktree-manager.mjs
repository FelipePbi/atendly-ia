/**
 * IA Loop — worktree planning.
 *
 * Plans an isolated git worktree for a Goal and refuses to act on anything
 * ambiguous. In V2 the plan is produced but NEVER executed: `--dry-run` is the
 * only supported mode, and real creation will be an explicit separate option.
 *
 * Hard rules, enforced here rather than trusted to the caller:
 * the main checkout is not modified, the user's branch does not change, main is
 * never reset, nothing is forced, no existing branch or unknown worktree is
 * removed.
 */

import { SpikeError } from './claude-process.mjs';

export const WORKTREE_ROOT = '.ai-worktrees';

function fail(code, message, details = {}) {
  throw new SpikeError(code, message, details);
}

export function worktreePathFor(goalId) {
  return `${WORKTREE_ROOT}/goal-${goalId}`;
}

export function branchNameFor(goalId) {
  return `ai-loop/goal-${goalId}`;
}

/**
 * Builds the plan and lists every blocking condition found.
 *
 * `git` is an injected read-only probe so tests need no repository:
 *   { currentBranch, isDirty, branchExists(name), worktrees(), pathExists(p) }
 */
export async function planWorktree({ goalId, executionBase, git }) {
  if (!/^\d{3}$/.test(goalId)) {
    fail('INVALID_GOAL_ID', `Goal id must be three digits, got ${JSON.stringify(goalId)}`);
  }

  const path = worktreePathFor(goalId);
  const branch = branchNameFor(goalId);

  const [currentBranch, isDirty, branchExists, worktrees, pathExists] = await Promise.all([
    git.currentBranch(),
    git.isDirty(),
    git.branchExists(branch),
    git.worktrees(),
    git.pathExists(path),
  ]);

  const blockers = [];

  // A dirty main checkout means the plan cannot claim it leaves the tree
  // untouched, so we surface it rather than working around it.
  if (isDirty) {
    blockers.push({
      code: 'MAIN_CHECKOUT_DIRTY',
      message: 'The main checkout has uncommitted changes; resolve or stash them before creating the worktree.',
    });
  }

  if (branchExists) {
    blockers.push({
      code: 'BRANCH_ALREADY_EXISTS',
      message: `Branch "${branch}" already exists. It will not be deleted, reset or forced; decide explicitly what to do with it.`,
    });
  }

  const registered = worktrees.find((w) => w.path.replace(/\\/g, '/').endsWith(path));
  if (registered) {
    blockers.push({
      code: 'WORKTREE_ALREADY_REGISTERED',
      message: `A worktree is already registered at "${path}" (branch ${registered.branch ?? 'unknown'}). It will not be removed automatically.`,
    });
  }

  if (pathExists && !registered) {
    blockers.push({
      code: 'PATH_OCCUPIED_BY_UNKNOWN',
      message: `"${path}" exists on disk but is not a registered worktree. Refusing to touch an unknown directory.`,
    });
  }

  return Object.freeze({
    goalId,
    path,
    branch,
    executionBase,
    currentBranch,
    // The command a human (or a future explicit non-dry-run mode) would run.
    // Recorded for auditability; never executed in V2.
    plannedCommand: `git worktree add -b ${branch} ${path} ${executionBase}`,
    blockers: Object.freeze(blockers),
    safe: blockers.length === 0,
  });
}

/**
 * V2 guard: creating a worktree is not implemented.
 *
 * Exists so the boundary is explicit in code and covered by a test, rather than
 * being an absence someone could fill in by accident.
 */
export function createWorktree() {
  fail(
    'WORKTREE_CREATION_NOT_IMPLEMENTED',
    'V2 only plans worktrees. Real creation is a separate, explicit step that has not been authorised yet.',
  );
}
