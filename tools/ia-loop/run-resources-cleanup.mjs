#!/usr/bin/env node
/**
 * IA Loop — manual, safe cleanup of leaked temporary resources.
 *
 *   npm run ia-loop:resources:cleanup -- --dry-run   (default; mutates nothing)
 *   npm run ia-loop:resources:cleanup -- --apply     (acts, CONFIRMED ownership only)
 *
 * `--apply` never touches a resource whose ownership is not CONFIRMED (or,
 * for a resource already gone, PROCESS_GONE/PID_REUSED — nothing left to
 * kill, just a directory to reclaim). UNKNOWN, EXECUTABLE_MISMATCH and
 * DATA_DIR_MISMATCH are always left alone: this tool fails closed by design,
 * per the absolute rule that ownership must be PROVEN, never assumed from a
 * process name or a port number.
 *
 * Two more kinds of leak, same dry-run-first contract:
 *
 *   … -- --worktrees [--apply]   the backlog of .ai-worktrees (M-09). Lists
 *                                every directory with its verdict; --apply
 *                                removes ONLY the ELIGIBLE ones (Goal ACCEPTED,
 *                                closure commit reachable from main, HEAD
 *                                integrated, clean, not current, not kept —
 *                                see lib/worktree-cleanup.mjs), unlinking every
 *                                junction inside first and killing whatever
 *                                still runs out of it.
 *   … -- --processes [--apply]   leaked process trees (M-08): what the
 *                                post-attempt sweep would kill and what it can
 *                                only report (e.g. a main-checkout service).
 *
 * To keep a worktree for inspection: `git worktree lock <path>` or an empty
 * `.ai-worktrees/<name>.keep` file.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { createResourceRegistry, LIVE_RESOURCE_STATUSES } from './lib/resource-registry.mjs';
import { createProcessInspector } from './lib/process-inspector.mjs';
import { provePostgresOwnership, isCleanable } from './lib/postgres-ownership.mjs';
import { RESOURCE_TYPE_POSTGRES, stopTemporaryPostgres } from './lib/temporary-postgres.mjs';
import { tempRootFor } from './lib/resource-paths.mjs';
import { isDirectExecution } from './lib/direct-execution.mjs';
import { createJobStore } from './lib/job-store.mjs';
import { WORKTREE_ROOT } from './lib/worktree-manager.mjs';
import { applyWorktreeCleanup, CLEANUP_VERDICTS, planWorktreeCleanup } from './lib/worktree-cleanup.mjs';
import {
  activeWorktreesFromRuntime, listProcesses, planOrphanSweep, sweepOrphanProcesses,
} from './lib/orphan-processes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '.state');
const REPO_ROOT = resolve(HERE, '..', '..');

export async function planCleanup({ registry, inspector, commandLineFn }) {
  const live = (await registry.list()).filter((r) => LIVE_RESOURCE_STATUSES.includes(r.status));

  const plan = [];
  for (const resource of live) {
    if (resource.resourceType !== RESOURCE_TYPE_POSTGRES) {
      plan.push({ resource, ownership: 'UNKNOWN', detail: `No ownership proof implemented for resourceType ${resource.resourceType}`, safeToClean: false });
      continue; // eslint-disable-line no-continue
    }
    // eslint-disable-next-line no-await-in-loop -- cleanup planning is not on a hot path
    const proof = await provePostgresOwnership(resource, inspector, commandLineFn ? { commandLineFn } : {});
    plan.push({ resource, ownership: proof.ownership, detail: proof.detail, safeToClean: isCleanable(proof) });
  }
  return plan;
}

export function renderPlan(plan, { apply }) {
  const out = [];
  if (plan.length === 0) {
    out.push('No live temporary resources found.');
    return out.join('\n');
  }

  for (const item of plan) {
    const { resource } = item;
    out.push(`Resource:`);
    out.push(`  ${resource.resourceId}`);
    out.push(`Owner:`);
    out.push(`  ${[resource.goalId, resource.round ? `R${resource.round}` : null, resource.role, resource.attemptId].filter(Boolean).join(' ') || 'unattributed'}`);
    if (resource.metadata?.postgresPid) out.push(`PID:\n  ${resource.metadata.postgresPid}`);
    if (resource.metadata?.port) out.push(`Port:\n  ${resource.metadata.port}`);
    if (resource.metadata?.dataDirectory) out.push(`PGDATA:\n  ${resource.metadata.dataDirectory}`);
    out.push(`Ownership:\n  ${item.safeToClean ? 'CONFIRMED' : item.ownership}`);
    out.push(`Reason:\n  ${item.detail}`);
    out.push(item.safeToClean
      ? `Would:\n  pg_ctl stop\n  wait\n  remove temp dir`
      : 'Would:\n  (nothing — ownership not proven; left untouched)');
    if (apply && item.safeToClean) out.push('Applied: yes');
    else if (apply) out.push('Applied: no (UNKNOWN ownership skipped)');
    out.push('');
  }
  return out.join('\n').trimEnd();
}

/**
 * Worktrees that belong to the work in progress and are never removed: the
 * running Goal's own, and the planning worktrees of the running and of the
 * last closed Goal. Derived from runtime.json; null when it cannot be read.
 */
export function keepSetFromRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object') return null;
  const keep = new Set();
  if (runtime.goal) {
    if (!runtime.goalClosed) keep.add(`goal-${runtime.goal}`);
    keep.add(`plan-after-goal-${runtime.goal}`);
  }
  if (runtime.closure?.goal) keep.add(`plan-after-goal-${runtime.closure.goal}`);
  return [...keep];
}

export function renderWorktreePlan(items, { apply }) {
  const out = [];
  const eligible = items.filter((item) => item.eligible);
  const kept = items.filter((item) => !item.eligible);

  const counts = new Map();
  for (const item of items) counts.set(item.verdict, (counts.get(item.verdict) ?? 0) + 1);
  out.push(`Worktrees under ${WORKTREE_ROOT}: ${items.length}`);
  for (const [verdict, count] of [...counts].sort()) out.push(`  ${verdict}: ${count}`);
  out.push('');

  out.push(apply ? `Removing (${eligible.length}):` : `Would remove (${eligible.length}):`);
  for (const item of eligible) {
    out.push(`  ${item.name}  branch ${item.branch}  head ${String(item.head).slice(0, 10)}  closure ${String(item.closureCommit).slice(0, 10)}`);
  }
  out.push('');
  out.push(`Kept (${kept.length}):`);
  for (const item of kept) {
    const extra = item.verdict === CLEANUP_VERDICTS.UNCOMMITTED_CHANGES
      ? ` — ${item.dirtyFiles.length} file(s): ${item.dirtyFiles.slice(0, 3).join(', ')}`
      : '';
    out.push(`  ${item.name}: ${item.verdict}${extra}`);
  }
  return out.join('\n');
}

export function renderProcessPlan(plan, { apply }) {
  const out = [];
  const line = (entry) => `  pid ${entry.pid} ${entry.name} (${entry.treeSize ?? 1} proc, ${entry.treeMb ?? entry.mb} MB) ${entry.reason}\n`
    + `    ${String(entry.cmd).slice(0, 160)}`
    + (entry.evidence && entry.evidence.pid !== entry.pid ? `\n    evidence: pid ${entry.evidence.pid} ${String(entry.evidence.cmd).slice(0, 140)}` : '')
    + (entry.detail ? `\n    ${entry.detail}` : '');
  out.push(`${apply ? 'Killed' : 'Would kill'} (${plan.kill.length} tree(s)):`);
  for (const entry of plan.kill) out.push(line(entry));
  out.push(`Reported only, never killed (${plan.report.length}):`);
  for (const entry of plan.report) out.push(line(entry));
  return out.join('\n');
}

async function mainWorktrees({ apply }) {
  const runtime = await createJobStore(STATE_DIR).readRuntime().catch(() => null);
  const keep = keepSetFromRuntime(runtime);
  if (!keep && apply) {
    console.error('Cannot read runtime.json, so the running Goal is unknown. Refusing to --apply.');
    return 2;
  }
  const items = await planWorktreeCleanup({ repoRoot: REPO_ROOT, keep: keep ?? [] });
  console.log(renderWorktreePlan(items, { apply }));
  if (!apply) {
    console.log('\nDry run — nothing was changed. Re-run with --worktrees --apply to remove the ELIGIBLE ones only.');
    return 0;
  }
  console.log('');
  const results = await applyWorktreeCleanup({ repoRoot: REPO_ROOT, items, emit: (text) => console.log(text) });
  const failed = results.filter((result) => !result.removed);
  console.log(`\nRemoved ${results.length - failed.length} of ${results.length}.`);
  return failed.length > 0 ? 1 : 0;
}

async function mainProcesses({ apply }) {
  const runtime = await createJobStore(STATE_DIR).readRuntime().catch(() => null);
  const options = {
    roots: [join(REPO_ROOT, WORKTREE_ROOT)], repoRoot: REPO_ROOT,
    activeWorktrees: activeWorktreesFromRuntime(runtime, REPO_ROOT),
  };
  if (!apply) {
    console.log(renderProcessPlan(planOrphanSweep(await listProcesses(), options), { apply }));
    console.log('\nDry run — nothing was killed. Re-run with --processes --apply to kill the listed trees.');
    return 0;
  }
  const { killed, reported, failed } = await sweepOrphanProcesses(options);
  console.log(renderProcessPlan({ kill: killed, report: reported }, { apply }));
  for (const entry of failed) console.log(`  NOT killed pid ${entry.pid} ${entry.name}: ${entry.failure}`);
  return failed.length > 0 ? 1 : 0;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const explicitDryRun = args.includes('--dry-run');
  if (apply && explicitDryRun) {
    console.error('Pass either --dry-run or --apply, not both.');
    return 2;
  }
  if (args.includes('--worktrees') && args.includes('--processes')) {
    console.error('Pass either --worktrees or --processes, not both.');
    return 2;
  }
  if (args.includes('--worktrees')) return mainWorktrees({ apply });
  if (args.includes('--processes')) return mainProcesses({ apply });

  const registry = createResourceRegistry(STATE_DIR);
  const inspector = createProcessInspector();
  const tempRoot = tempRootFor(STATE_DIR);

  const plan = await planCleanup({ registry, inspector });
  console.log(renderPlan(plan, { apply }));

  if (!apply) {
    console.log('\nDry run — nothing was changed. Re-run with --apply to act on CONFIRMED resources only.');
    return 0;
  }

  for (const item of plan.filter((p) => p.safeToClean)) {
    // eslint-disable-next-line no-await-in-loop -- cleanups are applied one at a time, deliberately serial
    await stopTemporaryPostgres(registry, item.resource.resourceId, { tempRoot, inspector });
  }
  return 0;
}

if (isDirectExecution(import.meta.url)) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
      console.error(`ATENDLY IA LOOP — resources cleanup\n\n[${code}] ${error.message}`);
      process.exitCode = 1;
    });
}
