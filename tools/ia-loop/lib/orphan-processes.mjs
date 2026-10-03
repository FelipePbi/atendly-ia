/**
 * IA Loop — processes that outlive the job that started them.
 *
 * On Windows, `child.kill()` terminates ONE process. Everything that process
 * started keeps running, re-parented to nobody:
 *
 *   - a `next dev` the comparison script started, when the model's Bash call
 *     timed out and killed the script (ia-loop V33);
 *   - `next start` and the Chromium a Playwright gate drove, when the gate hit
 *     its own timeout;
 *   - vitest workers, servers a Developer started "to check", the Claude CLI's
 *     own tool subprocesses when the CLI was killed.
 *
 * None of them ever exits by itself, so the machine fills up over a long run
 * (measured: a night of Goals ended with the computer out of memory).
 *
 * Three tools:
 *
 *   killProcessTree(pid)    what `kill` should have meant: the process AND its
 *                           descendants (`taskkill /T /F`).
 *   sweepOrphanProcesses    after an attempt ends, kill every process TREE
 *                           whose root has lost its parent and which provably
 *                           belongs to a loop worktree.
 *   killWorktreeProcesses   when a Goal closes, kill everything still running
 *                           out of that Goal's worktree, orphan or not.
 *
 * Why trees and not single processes (M-08). The V34 sweep required "orphan"
 * and "cites the worktree" on the SAME process. A server a Developer starts
 * through the Bash tool does not look like that:
 *
 *   bash.exe -c "npx tsx src/server.ts"          orphan, cites nothing
 *     node …/.ai-worktrees/goal-095/…/tsx/cli    cites the worktree, has a parent
 *       node --import …/loader.mjs src/server.ts  has a parent
 *
 * The root is the orphan and a descendant carries the evidence, so neither
 * half of the old rule matched any single process and BFF + Scheduling of
 * Goal 095 kept running for hours after the Goal closed. The evidence is now
 * judged over the whole tree and the whole tree is killed.
 *
 * What keeps this safe while other work is alive, and safe for the person
 * using the machine:
 *
 *   - A tree is killed only on PATH evidence: some member's command line
 *     names a loop worktree. Nothing outside `.ai-worktrees` matches, so a dev
 *     server in an unrelated directory is never touched.
 *   - A tree that contains a protected process — a Claude session, an editor,
 *     Docker/WSL, a terminal host, the harness itself, or this very process —
 *     is never killed, only reported. `taskkill /T` would take them with it.
 *   - A service running out of the MAIN checkout (`<repo>/apps/*`) cites no
 *     worktree, and nothing on disk proves the loop started it: the resource
 *     registry only records temporary PostgreSQL clusters. It is reported,
 *     never killed — it may just as well be the user's own `npm run dev`.
 *   - Every kill re-reads the target's start time first, so a pid recycled
 *     between listing and killing is left alone.
 *
 * Windows only. Elsewhere `kill` on a process group is the platform's answer,
 * and the sweeps degrade to a no-op.
 */

import { ChildProcess, execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { processStartedAt } from './process-inspector.mjs';
import { WORKTREE_ROOT } from './worktree-manager.mjs';

const execFileAsync = promisify(execFile);
const IS_WINDOWS = process.platform === 'win32';

/** Kills a process and every descendant. Never throws. */
export async function killProcessTree(pid, { exec = execFileAsync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (!IS_WINDOWS) {
    try { process.kill(pid, 'SIGKILL'); return true; } catch { return false; }
  }
  try {
    await exec('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 15_000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** Synchronous variant for timeout callbacks that cannot await. */
export function killProcessTreeSoon(child) {
  // Only a real child process has a tree to kill. A test double (or a child
  // that never got a pid) gets the plain kill it always got — and a fake pid
  // must never reach taskkill, where it could name somebody else's process.
  if (!IS_WINDOWS || !(child instanceof ChildProcess) || !child.pid) {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
    return;
  }
  execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {
    // taskkill failing means the tree is already gone; fall back to the
    // direct kill so the caller's promise still settles on 'close'.
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  });
}

// The whole table, not just the orphans: tree evidence needs the children.
// CreationDate travels with every row so parent/child order (pid reuse) and
// the pre-kill identity check have something to compare.
const LIST_SCRIPT = [
  '$all = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize,CreationDate;',
  '$all | ForEach-Object { [pscustomobject]@{',
  '  pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name;',
  '  mb = [math]::Round($_.WorkingSetSize / 1MB); cmd = [string]$_.CommandLine;',
  '  created = $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString("o") } else { $null }) } } |',
  '  ConvertTo-Json -Compress',
].join(' ');

const toIso = (value) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
};

/** Every process on this machine: pid, ppid, name, mb, cmd, createdAt. */
export async function listProcesses({ exec = execFileAsync } = {}) {
  if (!IS_WINDOWS) return [];
  const { stdout } = await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', LIST_SCRIPT], {
    timeout: 60_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  const text = stdout.trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({
    pid: row.pid, ppid: row.ppid, name: row.name ?? '', mb: row.mb ?? 0, cmd: row.cmd ?? '', createdAt: toIso(row.created),
  }));
}

// ---------------------------------------------------------------------------
// Pure selection. Everything below takes a process table and returns a plan,
// so every rule is testable without touching the machine's processes.
// ---------------------------------------------------------------------------

/** Lower-case, backslash-separated, no trailing separator. */
export const normalisePath = (value) => String(value ?? '').replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');

/**
 * Does a command line name `path` (normalised) as a whole path segment?
 * `goal-09` must not match `goal-095`, so the character after the match has
 * to end the segment.
 */
export function citesPath(cmd, path) {
  if (!path) return false;
  const haystack = normalisePath(cmd);
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(path, from);
    if (at < 0) return false;
    const next = haystack[at + path.length];
    if (next === undefined || /[\\"'\s:;,]/.test(next)) return true;
    from = at + 1;
  }
}

/**
 * Processes that are never killed and whose trees are never killed: the
 * person's own sessions and tools, and the harness that is doing the killing.
 */
const PROTECTED_NAME = /^(claude|code|code - insiders|cursor|windsurf|devenv|idea64|webstorm64|windowsterminal|wt|openconsole|explorer|docker|docker desktop|dockerd|com\.docker\.[\w.-]+|wsl|wslhost|wslservice|vmmem\w*|vmcompute)\.exe$/i;
const CLAUDE_CLI = /@anthropic-ai[\\/]claude-code|[\\/]claude-code[\\/]cli\.m?js/i;
// Workers are started as `node  tools/ia-loop/workers/developer.mjs` — a
// RELATIVE path, so the match cannot require a separator in front.
const HARNESS = /(^|[\s"'\\/])tools[\\/]ia-loop[\\/]/i;

/** Shells and Chromium: the only kinds an orphan root may be when only a DESCENDANT carries the evidence. */
const ROOT_NAME = /^(node|bash|sh|cmd|powershell|pwsh|chrome|chrome-headless-shell|headless_shell)\.exe$/i;

/** A node process that only wraps another: npm/npx/pnpm/yarn's own CLI. */
const PACKAGE_RUNNER = /[\\/](npm-cli|npx-cli|pnpm|pnpm\.cjs|yarn|yarn\.js|corepack)(\.c?js)?["'\s]/i;

/** Splits a Windows command line into tokens, honouring double quotes. Good enough to read switches. */
export function tokenizeCommandLine(cmd) {
  const tokens = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(String(cmd ?? ''))) !== null) tokens.push(match[1] ?? match[2]);
  return tokens;
}

/**
 * A shell that exists only to run one command or script — `bash -c …`,
 * `bash /path/to/npx …` (what Git Bash runs for `npx`), `cmd /d /s /c …`,
 * `pwsh -Command …` — as opposed to somebody's interactive terminal
 * (`bash --login -i`, a bare `pwsh.exe -NoLogo`, `cmd /k`, `-NoExit`).
 * Only the former is safe to kill as part of the job it wraps.
 */
export function isNonInteractiveShell(name, cmd) {
  const shell = String(name ?? '').toLowerCase().replace(/\.exe$/, '');
  const args = tokenizeCommandLine(cmd).slice(1).map((token) => token.toLowerCase());
  // Switches that take a value: the value is not a script or a command.
  const positionals = (valued, isSwitch) => args.filter((arg, at) => !isSwitch(arg) && !valued.includes(args[at - 1]));

  if (shell === 'bash' || shell === 'sh') {
    if (args.includes('-i')) return false;
    if (args.some((arg) => /^-[a-z]*c$/.test(arg))) return true;
    return positionals(['-o', '+o', '--rcfile', '--init-file'], (arg) => /^[-+]/.test(arg)).length > 0;
  }
  if (shell === 'cmd') return args.includes('/c') && !args.includes('/k');
  if (shell === 'powershell' || shell === 'pwsh') {
    if (args.includes('-noexit')) return false;
    if (args.some((arg) => ['-c', '-command', '-ec', '-encodedcommand', '-f', '-file'].includes(arg))) return true;
    // A positional argument is a script (pwsh) or a command (Windows PowerShell).
    const valued = ['-executionpolicy', '-ep', '-windowstyle', '-w', '-outputformat', '-of', '-inputformat', '-if',
      '-configurationname', '-workingdirectory', '-wd', '-version', '-v', '-psconsolefile', '-settingsfile'];
    return positionals(valued, (arg) => arg.startsWith('-') || arg.startsWith('/')).length > 0;
  }
  return false;
}

/** The repository's own services, by the convention every app follows. */
const SERVER_ENTRY = /(^|[\\/\s"'])src[\\/]server\.[cm]?[jt]s(["'\s]|$)/i;

/**
 * Parent/children lookups over one snapshot of the process table.
 *
 * A parent that started AFTER its child is not its parent: Windows recycled
 * the id. The child is treated as an orphan, which is what it really is.
 */
export function indexProcesses(processes = []) {
  const byPid = new Map();
  for (const entry of processes) {
    if (Number.isInteger(entry?.pid)) byPid.set(entry.pid, entry);
  }

  const parentOf = (entry) => {
    if (!entry || !Number.isInteger(entry.ppid) || entry.ppid === entry.pid) return null;
    const parent = byPid.get(entry.ppid);
    if (!parent) return null;
    const parentAt = Date.parse(parent.createdAt ?? '');
    const childAt = Date.parse(entry.createdAt ?? '');
    if (!Number.isNaN(parentAt) && !Number.isNaN(childAt) && parentAt > childAt) return null;
    return parent;
  };

  const children = new Map();
  for (const entry of byPid.values()) {
    const parent = parentOf(entry);
    if (!parent) continue;
    if (!children.has(parent.pid)) children.set(parent.pid, []);
    children.get(parent.pid).push(entry);
  }

  /** The process and every descendant, root first. Cycle-safe. */
  const treeOf = (entry) => {
    const out = [];
    const seen = new Set();
    const stack = [entry];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || seen.has(current.pid)) continue;
      seen.add(current.pid);
      out.push(current);
      for (const child of children.get(current.pid) ?? []) stack.push(child);
    }
    return out;
  };

  /** Pids of the process and all its ancestors. */
  const lineageOf = (pid) => {
    const out = new Set();
    let current = byPid.get(pid);
    while (current && !out.has(current.pid)) {
      out.add(current.pid);
      current = parentOf(current);
    }
    if (Number.isInteger(pid)) out.add(pid);
    return out;
  };

  return { byPid, parentOf, treeOf, lineageOf };
}

function makeContext({ worktreesRoot, repoRoot, selfPid }, index) {
  const root = normalisePath(worktreesRoot);
  const repo = normalisePath(repoRoot);
  const selfLineage = index.lineageOf(selfPid);
  const citesLoop = (entry) => Boolean(root) && citesPath(entry.cmd, root);

  const isProtected = (entry) => {
    if (selfLineage.has(entry.pid)) return 'SELF_OR_ANCESTOR';
    if (PROTECTED_NAME.test(entry.name ?? '')) return 'PROTECTED_PROCESS';
    const cmd = String(entry.cmd ?? '');
    if (CLAUDE_CLI.test(cmd)) return 'CLAUDE_SESSION';
    // The live harness (workers, orchestrator, this closure) runs out of the
    // main checkout. A copy of tools/ia-loop inside a Goal worktree is just
    // another file in that worktree, and is not protected.
    if (HARNESS.test(cmd) && !citesLoop(entry)) return 'HARNESS';
    return null;
  };

  /**
   * The protected process a tree holds, if any. The harness (or this process)
   * wins over any other reason: a tree that holds it is the loop's own live
   * work, which callers skip silently instead of reporting.
   */
  const protectedMember = (tree) => {
    let first = null;
    for (const member of tree) {
      const why = isProtected(member);
      if (why === 'HARNESS' || why === 'SELF_OR_ANCESTOR') return { member, why };
      if (why && !first) first = { member, why };
    }
    return first;
  };

  return { root, repo, citesLoop, isProtected, protectedMember };
}

const describe = (entry) => ({
  pid: entry.pid, name: entry.name, mb: entry.mb ?? 0, cmd: entry.cmd ?? '', createdAt: entry.createdAt ?? null,
});

const treeSummary = (tree) => ({
  treeSize: tree.length,
  treeMb: tree.reduce((sum, member) => sum + (Number(member.mb) || 0), 0),
});

/**
 * What the post-attempt sweep may kill, and what it can only report.
 *
 * A candidate is an ORPHAN ROOT (its parent is gone). Its tree is killed when:
 *   - the root itself names a loop worktree (the V34 rule), or
 *   - the root is a shell/node/Chromium and some descendant names one (M-08);
 * and no member of the tree is protected. A parentless Playwright Chromium is
 * killed wherever it runs, as before: its driver owns it for its whole life.
 *
 * Not touched: a tree whose only evidence is a descendant citing one of
 * `activeWorktrees` (the Goal running now) — see below.
 *
 * Reported, never killed: a tree with loop evidence that also holds a
 * protected process (other than the harness itself, whose orphaned tree is
 * live work), and a tree running out of the MAIN checkout's `apps/`
 * (`<repo>/apps/<app>/…`), whose provenance cannot be proven. Orphans of any
 * other kind (explorer after a restart, service hosts) are not looked at.
 *
 * @returns {{ kill: object[], report: object[] }}
 */
export function planOrphanSweep(processes, {
  roots = [], repoRoot = null, activeWorktrees = [], selfPid = process.pid,
} = {}) {
  const index = indexProcesses(processes);
  const active = activeWorktrees.filter(Boolean).map(normalisePath);
  const ctx = makeContext({ worktreesRoot: roots.filter(Boolean)[0] ?? null, repoRoot, selfPid }, index);
  const extraRoots = roots.filter(Boolean).slice(1).map(normalisePath);
  const cites = (entry) => ctx.citesLoop(entry) || extraRoots.some((root) => citesPath(entry.cmd, root));
  const repoApps = ctx.repo ? `${ctx.repo}\\apps` : null;

  const kill = [];
  const report = [];

  for (const entry of index.byPid.values()) {
    if (index.parentOf(entry)) continue; // not an orphan root
    if (entry.pid === 0 || entry.pid === 4) continue; // System Idle / System

    const name = String(entry.name ?? '');
    const playwright = /chrom/i.test(name) && normalisePath(entry.cmd).includes('ms-playwright');
    const selfEvidence = cites(entry);
    // Anything else parentless — explorer after a restart, a service host —
    // roots trees of the person's own programs, and is not a shape a leaked
    // job leaves behind. Not even worth a report line.
    if (!playwright && !selfEvidence && !ROOT_NAME.test(name)) continue;

    const tree = index.treeOf(entry);
    const evidence = selfEvidence ? entry : tree.find((member) => member !== entry && cites(member));

    if (!playwright && !evidence) {
      // No loop evidence anywhere in the tree. Still worth a line when it is
      // one of the repository's own services running out of the main
      // checkout: that is the M-08 `ai-orchestrator`, which nothing proves
      // the loop started.
      const repoMember = repoApps ? tree.find((member) => citesPath(member.cmd, repoApps)) : null;
      if (repoMember && !ctx.protectedMember(tree)) {
        const looksLikeService = tree.some((member) => SERVER_ENTRY.test(String(member.cmd ?? '')));
        report.push({
          ...describe(entry), ...treeSummary(tree),
          reason: 'MAIN_CHECKOUT_PROCESS_UNPROVEN',
          detail: `${looksLikeService ? 'A repository service' : 'A process'} running out of the main checkout `
            + `(pid ${repoMember.pid} cites ${repoApps}); nothing proves the loop started it, so it is not killed.`,
        });
      }
      continue;
    }

    // Evidence that only a DESCENDANT carries, all of it pointing at the Goal
    // that is running right now, is ambiguous: a server the current unit
    // started in the background (and is using) looks exactly like one a
    // finished unit forgot. It is left alone here and killed when that Goal
    // closes (`killWorktreeProcesses`), when it is provably nobody's.
    if (!playwright && !selfEvidence && active.length > 0) {
      const evidenceMembers = tree.filter((member) => cites(member));
      if (evidenceMembers.every((member) => active.some((path) => citesPath(member.cmd, path)))) continue;
    }

    const guard = ctx.protectedMember(tree);
    if (guard) {
      // A worker (or this process) that lost its own launcher is an orphan
      // root whose tree is the LIVE unit it is running. That is the loop
      // working, not a leak: nothing to kill and nothing to report.
      if (guard.why === 'HARNESS' || guard.why === 'SELF_OR_ANCESTOR') continue;
      report.push({
        ...describe(entry), ...treeSummary(tree),
        reason: guard.why,
        detail: `Tree holds protected pid ${guard.member.pid} (${guard.member.name}); not killed.`,
      });
      continue;
    }

    kill.push({
      ...describe(entry), ...treeSummary(tree),
      reason: playwright ? 'ORPHAN_PLAYWRIGHT_BROWSER' : (selfEvidence ? 'ORPHAN_CITES_WORKTREE' : 'ORPHAN_TREE_CITES_WORKTREE'),
      evidence: evidence ? { pid: evidence.pid, cmd: evidence.cmd } : null,
    });
  }

  return { kill, report };
}

/**
 * What to kill when a Goal closes: everything still running out of its
 * worktree(s), whether or not it has a parent.
 *
 * Each process whose command line names one of `worktreePaths` is a target.
 * From there the plan climbs to the wrapper that exists only to run it — a
 * `bash -c`/`cmd /c`/`pwsh -Command` shell or an npm/npx runner — because
 * killing just the `node` leaves the wrapper waiting on nothing. It never
 * climbs into an interactive shell (no command switch), a protected process,
 * or this process's own ancestry: those are somebody's terminal, session or
 * caller. Each resulting tree is killed whole unless it holds a protected
 * process, in which case it is reported.
 *
 * @returns {{ kill: object[], report: object[] }}
 */
export function planWorktreeProcessKill(processes, {
  worktreePaths = [], worktreesRoot = null, selfPid = process.pid,
} = {}) {
  const index = indexProcesses(processes);
  const ctx = makeContext({ worktreesRoot, repoRoot: null, selfPid }, index);
  const paths = worktreePaths.filter(Boolean).map(normalisePath);
  const citesTarget = (entry) => paths.some((path) => citesPath(entry.cmd, path));

  const isWrapper = (entry) => {
    const name = String(entry.name ?? '');
    const cmd = String(entry.cmd ?? '');
    if (/^node\.exe$/i.test(name)) return PACKAGE_RUNNER.test(`${cmd} `);
    return isNonInteractiveShell(name, cmd);
  };

  const tops = new Map();
  const report = [];

  for (const entry of index.byPid.values()) {
    if (!citesTarget(entry)) continue;
    const why = ctx.isProtected(entry);
    if (why) {
      report.push({ ...describe(entry), reason: why, detail: 'Cites the closed worktree but is protected; not killed.' });
      continue;
    }
    let top = entry;
    for (;;) {
      const parent = index.parentOf(top);
      if (!parent || ctx.isProtected(parent) || !isWrapper(parent)) break;
      top = parent;
    }
    if (!tops.has(top.pid)) tops.set(top.pid, { top, evidence: entry });
  }

  // A top inside another top's tree is already covered by that kill.
  const covered = new Set();
  for (const { top } of tops.values()) {
    for (const member of index.treeOf(top)) if (member !== top) covered.add(member.pid);
  }

  const kill = [];
  for (const { top, evidence } of tops.values()) {
    if (covered.has(top.pid)) continue;
    const tree = index.treeOf(top);
    const guard = ctx.protectedMember(tree);
    if (guard) {
      report.push({
        ...describe(top), ...treeSummary(tree),
        reason: guard.why,
        detail: `Tree holds protected pid ${guard.member.pid} (${guard.member.name}); not killed.`,
      });
      continue;
    }
    kill.push({
      ...describe(top), ...treeSummary(tree),
      reason: 'CITES_CLOSED_WORKTREE',
      evidence: { pid: evidence.pid, cmd: evidence.cmd },
    });
  }

  return { kill, report };
}

/**
 * Kills each planned tree after proving its root is still the process that
 * was listed: same pid AND same start time. A pid that was recycled in the
 * meantime, or whose start time cannot be read, is skipped.
 */
async function executeKills(targets, { exec, kill, startedAt }) {
  const killed = [];
  const failed = [];
  for (const target of targets) {
    // eslint-disable-next-line no-await-in-loop -- one tree at a time, deliberately serial
    const observed = await startedAt(target.pid);
    if (!target.createdAt || !observed || observed !== target.createdAt) {
      failed.push({ ...target, failure: 'IDENTITY_NOT_CONFIRMED' });
      continue; // eslint-disable-line no-continue
    }
    // eslint-disable-next-line no-await-in-loop
    if (await kill(target.pid, { exec })) killed.push(target);
    else failed.push({ ...target, failure: 'KILL_FAILED' });
  }
  return { killed, failed };
}

/**
 * The worktrees of the Goal still running, from runtime.json. A tree whose
 * only evidence points there may be a server the current unit is using; the
 * closure of that Goal kills it instead (run-close.mjs → killWorktreeProcesses).
 */
export function activeWorktreesFromRuntime(runtime, repoRoot) {
  if (!runtime?.goal || runtime.goalClosed) return [];
  return [
    runtime.worktreePath ? join(repoRoot, runtime.worktreePath) : null,
    join(repoRoot, WORKTREE_ROOT, `plan-after-goal-${runtime.goal}`),
  ].filter(Boolean);
}

/**
 * Kills the loop's orphaned process trees. `roots` are the paths that make a
 * process "ours" — normally `[<repo>\.ai-worktrees]`; `repoRoot` lets the
 * plan recognise (and only report) services of the main checkout.
 *
 * @returns {{ killed: object[], reported: object[], failed: object[] }}
 */
export async function sweepOrphanProcesses({
  roots, repoRoot = null, activeWorktrees = [], exec = execFileAsync, kill = killProcessTree,
  list = listProcesses, startedAt = processStartedAt, selfPid = process.pid, platform = process.platform,
} = {}) {
  if (platform !== 'win32') return { killed: [], reported: [], failed: [] };
  const processes = await list({ exec });
  const plan = planOrphanSweep(processes, { roots, repoRoot, activeWorktrees, selfPid });
  const { killed, failed } = await executeKills(plan.kill, { exec, kill, startedAt });
  return { killed, reported: plan.report, failed };
}

/**
 * Kills everything still running out of the given worktrees (a closed Goal's
 * worktree and the planning worktree that produced it).
 *
 * @returns {{ killed: object[], reported: object[], failed: object[] }}
 */
export async function killWorktreeProcesses({
  worktreePaths, worktreesRoot, exec = execFileAsync, kill = killProcessTree,
  list = listProcesses, startedAt = processStartedAt, selfPid = process.pid, platform = process.platform,
} = {}) {
  if (platform !== 'win32') return { killed: [], reported: [], failed: [] };
  const processes = await list({ exec });
  const plan = planWorktreeProcessKill(processes, { worktreePaths, worktreesRoot, selfPid });
  const { killed, failed } = await executeKills(plan.kill, { exec, kill, startedAt });
  return { killed, reported: plan.report, failed };
}
