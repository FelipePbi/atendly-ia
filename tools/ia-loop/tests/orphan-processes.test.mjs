import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  activeWorktreesFromRuntime,
  citesPath,
  isNonInteractiveShell,
  killProcessTreeSoon,
  killWorktreeProcesses,
  normalisePath,
  planOrphanSweep,
  planWorktreeProcessKill,
  sweepOrphanProcesses,
} from '../lib/orphan-processes.mjs';

// Forward slashes on purpose: the selector normalises both separators, and a
// backslash in a JS string literal is an escape waiting to happen.
const REPO = 'E:/Projetos/atendly-ia';
const ROOT = `${REPO}/.ai-worktrees`;
const SELF = 1;

const T0 = Date.parse('2026-10-03T04:00:00.000Z');
let clock = 0;
/** A process row as listProcesses returns it; each one starts a second after the previous. */
const proc = (pid, ppid, name, cmd, extra = {}) => ({
  pid, ppid, name, cmd, mb: 50, createdAt: new Date(T0 + (clock += 1000)).toISOString(), ...extra,
});

/** The harness itself: the sweeping worker, started by a live terminal. */
const harness = () => [
  proc(900, 0, 'WindowsTerminal.exe', 'WindowsTerminal.exe'),
  proc(SELF, 900, 'node.exe', 'node  tools/ia-loop/workers/developer.mjs'),
];

/**
 * The M-08 shape, exactly as observed: the Developer's Bash tool ran
 * `npx tsx src/server.ts`, the Claude CLI that owned the shell is gone, and
 * only the grandchildren cite the worktree.
 */
const leakedServer = (base, goal, app = 'bff') => [
  proc(base, 77777, 'bash.exe', '"C:\\Program Files\\Git\\usr\\bin\\bash.exe" /c/Users/x/node/npx tsx src/server.ts'),
  proc(base + 1, base, 'bash.exe', '"C:\\Program Files\\Git\\usr\\bin\\bash.exe" /c/Users/x/node/npx tsx src/server.ts'),
  proc(base + 2, base + 1, 'node.exe', 'C:\\Users\\x\\node\\node.exe C:\\Users\\x\\node/node_modules/npm/bin/npx-cli.js tsx src/server.ts'),
  proc(base + 3, base + 2, 'cmd.exe', 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c tsx src/server.ts'),
  proc(base + 4, base + 3, 'node.exe', `"node" "${ROOT}/${goal}/apps/${app}/node_modules/.bin/../tsx/dist/cli.mjs" src/server.ts`),
  proc(base + 5, base + 4, 'node.exe', `node.exe --import file:///${ROOT}/${goal}/apps/${app}/node_modules/tsx/dist/loader.mjs src/server.ts`),
];

test('M-08: an orphan shell whose DESCENDANT cites a worktree is killed as a whole tree', () => {
  const table = [...harness(), ...leakedServer(100, 'goal-095')];
  const { kill, report } = planOrphanSweep(table, { roots: [ROOT], repoRoot: REPO, selfPid: SELF });
  assert.deepEqual(kill.map((k) => [k.pid, k.reason, k.treeSize]), [[100, 'ORPHAN_TREE_CITES_WORKTREE', 6]]);
  assert.equal(kill[0].evidence.pid, 104);
  assert.deepEqual(report, []);
});

test('the V34 rule still holds: an orphan that itself cites a worktree is killed; unrelated orphans are not', () => {
  const table = [
    ...harness(),
    proc(10, 555, 'node.exe', `"node" ${ROOT}/goal-090/apps/frontend/node_modules/next/dist/bin/next dev -p 5100`),
    proc(12, 555, 'node.exe', 'E:/Projetos/relay-ia/packages/daemon/bin/relay.mjs serve'),
    proc(13, 555, 'esbuild.exe', `${ROOT}/goal-090/apps/bff/node_modules/@esbuild/win32-x64/esbuild.exe --service`),
  ];
  const { kill } = planOrphanSweep(table, { roots: [ROOT], repoRoot: REPO, selfPid: SELF });
  assert.deepEqual(kill.map((k) => k.pid).sort(), [10, 13]);
});

test('a main-checkout service is reported, never killed: nothing proves the loop started it', () => {
  const table = [
    ...harness(),
    proc(30, 555, 'bash.exe', '"bash.exe" /c/Users/x/node/npx tsx src/server.ts'),
    proc(31, 30, 'node.exe', `"node" "${REPO}/apps/ai-orchestrator/node_modules/.bin/../tsx/dist/cli.mjs" src/server.ts`),
  ];
  const { kill, report } = planOrphanSweep(table, { roots: [ROOT], repoRoot: REPO, selfPid: SELF });
  assert.deepEqual(kill, []);
  assert.equal(report.length, 1);
  assert.equal(report[0].reason, 'MAIN_CHECKOUT_PROCESS_UNPROVEN');
  assert.match(report[0].detail, /repository service/);
});

test('a dev server in an unrelated directory is neither killed nor reported', () => {
  const table = [
    ...harness(),
    proc(40, 555, 'bash.exe', 'bash.exe -c "npm run dev"'),
    proc(41, 40, 'node.exe', 'node E:/Projetos/other-app/node_modules/vite/bin/vite.js src/server.ts'),
  ];
  assert.deepEqual(planOrphanSweep(table, { roots: [ROOT], repoRoot: REPO, selfPid: SELF }), { kill: [], report: [] });
});

test('a tree holding a Claude session is reported, not killed', () => {
  const table = [
    ...harness(),
    proc(50, 555, 'bash.exe', 'bash.exe --login -i'),
    proc(51, 50, 'claude.exe', 'C:/Users/x/.local/bin/claude.exe'),
    proc(52, 51, 'node.exe', `node ${ROOT}/goal-095/apps/bff/node_modules/tsx/dist/cli.mjs src/server.ts`),
  ];
  const { kill, report } = planOrphanSweep(table, { roots: [ROOT], repoRoot: REPO, selfPid: SELF });
  assert.deepEqual(kill, []);
  assert.deepEqual(report.map((r) => [r.pid, r.reason]), [[50, 'PROTECTED_PROCESS']]);
});

test('an orphaned WORKER tree is live loop work: skipped silently, even when its unit cites a worktree', () => {
  // Observed live: the developer worker launched through `npm run`, whose
  // launching bash lost its own parent. Its relative command line is the
  // only harness evidence there is.
  const table = [
    proc(60, 555, 'bash.exe', '"bash.exe" /c/Users/x/node/npm run ia-loop:developer'),
    proc(61, 60, 'node.exe', 'node.exe C:/Users/x/node/node_modules/npm/bin/npm-cli.js run ia-loop:developer'),
    proc(62, 61, 'cmd.exe', 'cmd.exe /d /s /c node tools/ia-loop/workers/developer.mjs'),
    proc(63, 62, 'node.exe', 'node  tools/ia-loop/workers/developer.mjs'),
    proc(64, 63, 'claude.exe', `claude.exe --print --add-dir ${ROOT}/goal-106`),
  ];
  assert.deepEqual(planOrphanSweep(table, { roots: [ROOT], repoRoot: REPO, selfPid: 999 }), { kill: [], report: [] });
});

test('descendant-only evidence pointing at the RUNNING Goal is left for its closure', () => {
  const table = [...harness(), ...leakedServer(100, 'goal-106'), ...leakedServer(200, 'goal-095', 'scheduling-service')];
  const { kill } = planOrphanSweep(table, {
    roots: [ROOT], repoRoot: REPO, selfPid: SELF, activeWorktrees: [`${ROOT}/goal-106`],
  });
  assert.deepEqual(kill.map((k) => k.pid), [200]);
});

test('a recycled parent pid does not make a child look owned', () => {
  // The parent id now belongs to a process that started AFTER the child:
  // the real parent is gone, so the child is an orphan root.
  const child = proc(70, 71, 'node.exe', `node ${ROOT}/goal-080/x.mjs`);
  const impostor = proc(71, 900, 'svchost.exe', 'svchost.exe -k netsvcs');
  const { kill } = planOrphanSweep([...harness(), child, impostor], { roots: [ROOT], selfPid: SELF });
  assert.deepEqual(kill.map((k) => k.pid), [70]);
});

test('a parentless Playwright Chromium is killed wherever it runs; a user Chrome is not', () => {
  const table = [
    proc(20, 555, 'chrome-headless-shell.exe', 'C:/Users/x/AppData/Local/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell.exe --headless'),
    proc(21, 555, 'chrome.exe', '"C:/Program Files/Google/Chrome/Application/chrome.exe" --no-startup-window'),
  ];
  assert.deepEqual(planOrphanSweep(table, { roots: [ROOT], selfPid: SELF }).kill.map((o) => o.pid), [20]);
});

test('the sweeping process never selects itself', () => {
  const table = [proc(30, 555, 'node.exe', `node ${ROOT}/goal-1/x.mjs`)];
  assert.deepEqual(planOrphanSweep(table, { roots: [ROOT], selfPid: 30 }).kill, []);
});

test('closure: everything citing the closed worktree is killed from its wrapper down, orphan or not', () => {
  const table = [
    ...harness(),
    // Still owned by a live Claude CLI: not an orphan, killed anyway because
    // the Goal is closed. The climb stops below the protected CLI.
    proc(300, 900, 'claude.exe', 'claude.exe --print'),
    proc(301, 300, 'bash.exe', 'bash.exe -c "cd /e/x && npm run dev"'),
    proc(302, 301, 'node.exe', `node ${ROOT}/goal-095/apps/frontend/node_modules/next/dist/bin/next dev`),
    ...leakedServer(400, 'goal-095'),
    // A person's interactive terminal running something in that worktree:
    // the command dies, the terminal does not.
    proc(500, 900, 'pwsh.exe', '"C:/Program Files/PowerShell/7/pwsh.exe" -NoLogo'),
    proc(501, 500, 'node.exe', `node ${ROOT}/goal-095/scripts/watch.mjs`),
    // Another Goal, and a worktree whose name merely starts the same way.
    ...leakedServer(600, 'goal-096'),
    proc(700, 555, 'node.exe', `node ${ROOT}/goal-0950/x.mjs`),
  ];
  const { kill, report } = planWorktreeProcessKill(table, {
    worktreePaths: [`${ROOT}/goal-095`], worktreesRoot: ROOT, selfPid: SELF,
  });
  assert.deepEqual(kill.map((k) => k.pid).sort((a, b) => a - b), [301, 400, 501]);
  assert.deepEqual(report, []);
});

test('closure: a protected process citing the worktree is reported, and its tree left alone', () => {
  const table = [
    ...harness(),
    proc(800, 555, 'claude.exe', `claude.exe --add-dir ${ROOT}/goal-095`),
    proc(810, 555, 'bash.exe', `bash.exe -c "cd ${ROOT}/goal-095 && claude"`),
    proc(811, 810, 'claude.exe', 'claude.exe'),
  ];
  const { kill, report } = planWorktreeProcessKill(table, {
    worktreePaths: [`${ROOT}/goal-095`], worktreesRoot: ROOT, selfPid: SELF,
  });
  assert.deepEqual(kill, []);
  assert.deepEqual(report.map((r) => [r.pid, r.reason]).sort(), [[800, 'PROTECTED_PROCESS'], [810, 'PROTECTED_PROCESS']]);
});

test('closure never climbs into this process or its ancestors', () => {
  const table = [
    proc(900, 0, 'bash.exe', 'bash.exe -c "node tools/ia-loop/run-auto.mjs"'),
    proc(SELF, 900, 'node.exe', 'node tools/ia-loop/run-close.mjs 095'),
    proc(2, SELF, 'node.exe', `node ${ROOT}/goal-095/x.mjs`),
  ];
  const { kill, report } = planWorktreeProcessKill(table, {
    worktreePaths: [`${ROOT}/goal-095`], worktreesRoot: ROOT, selfPid: SELF,
  });
  assert.deepEqual(kill.map((k) => k.pid), [2]);
  assert.deepEqual(report, []);
});

test('a path is cited only as a whole segment', () => {
  const path = normalisePath(`${ROOT}/goal-09`);
  assert.equal(citesPath(`node ${ROOT}/goal-095/x.mjs`, path), false);
  assert.equal(citesPath(`node ${ROOT}/goal-09/x.mjs`, path), true);
  assert.equal(citesPath(`node "${ROOT}/goal-09"`, path), true);
  assert.equal(citesPath(`--import file:///${ROOT}/goal-09/loader.mjs`, path), true);
});

test('non-interactive shells are told apart from somebody\'s terminal', () => {
  const yes = [
    ['bash.exe', 'bash.exe -c "npm run dev"'],
    ['bash.exe', '"C:\\Program Files\\Git\\usr\\bin\\bash.exe" -lc "x"'],
    ['bash.exe', '"C:\\Program Files\\Git\\usr\\bin\\bash.exe" /c/Users/x/node/npx tsx src/server.ts'],
    ['cmd.exe', 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c tsx src/server.ts'],
    ['pwsh.exe', 'pwsh.exe -NoProfile -Command "npm run dev"'],
    ['powershell.exe', 'powershell.exe -ExecutionPolicy Bypass -File run.ps1'],
  ];
  const no = [
    ['bash.exe', 'bash.exe --login -i'],
    ['bash.exe', '"C:\\Program Files\\Git\\bin\\bash.exe"'],
    ['cmd.exe', 'cmd.exe /k echo hi'],
    ['pwsh.exe', '"C:/Program Files/PowerShell/7/pwsh.exe" -NoLogo'],
    ['powershell.exe', 'powershell.exe -ExecutionPolicy Bypass'],
    ['pwsh.exe', 'pwsh.exe -NoExit -Command "cd x"'],
    ['node.exe', 'node -c x'],
  ];
  for (const [name, cmd] of yes) assert.equal(isNonInteractiveShell(name, cmd), true, cmd);
  for (const [name, cmd] of no) assert.equal(isNonInteractiveShell(name, cmd), false, cmd);
});

test('a kill happens only after the target\'s start time is re-read and matches', async () => {
  const table = [...harness(), ...leakedServer(100, 'goal-095'), ...leakedServer(200, 'goal-094')];
  const killedPids = [];
  const outcome = await sweepOrphanProcesses({
    roots: [ROOT], repoRoot: REPO, selfPid: SELF, platform: 'win32',
    list: async () => table,
    // 200 was recycled between listing and killing.
    startedAt: async (pid) => (pid === 200 ? '2026-10-03T09:00:00.000Z' : table.find((p) => p.pid === pid).createdAt),
    kill: async (pid) => { killedPids.push(pid); return true; },
  });
  assert.deepEqual(killedPids, [100]);
  assert.deepEqual(outcome.killed.map((k) => k.pid), [100]);
  assert.deepEqual(outcome.failed.map((f) => [f.pid, f.failure]), [[200, 'IDENTITY_NOT_CONFIRMED']]);
});

test('killWorktreeProcesses wires the closure plan to the verified kill', async () => {
  const table = [...harness(), ...leakedServer(100, 'goal-095'), ...leakedServer(200, 'goal-096')];
  const killedPids = [];
  const outcome = await killWorktreeProcesses({
    worktreePaths: [`${ROOT}/goal-095`], worktreesRoot: ROOT, selfPid: SELF, platform: 'win32',
    list: async () => table,
    startedAt: async (pid) => table.find((p) => p.pid === pid).createdAt,
    kill: async (pid) => { killedPids.push(pid); return true; },
  });
  assert.deepEqual(killedPids, [100]);
  assert.deepEqual(outcome.reported, []);
});

test('off Windows both sweeps are no-ops that never list or kill', async () => {
  const never = async () => { throw new Error('must not be called'); };
  const empty = { killed: [], reported: [], failed: [] };
  assert.deepEqual(await sweepOrphanProcesses({ roots: [ROOT], platform: 'linux', list: never, kill: never }), empty);
  assert.deepEqual(await killWorktreeProcesses({ worktreePaths: [ROOT], platform: 'linux', list: never, kill: never }), empty);
});

test('the running Goal\'s worktrees come from runtime.json, and a closed Goal has none', () => {
  assert.deepEqual(
    activeWorktreesFromRuntime({ goal: '106', goalClosed: false, worktreePath: '.ai-worktrees/goal-106' }, '/repo')
      .map((p) => p.replace(/\\/g, '/')),
    ['/repo/.ai-worktrees/goal-106', '/repo/.ai-worktrees/plan-after-goal-106'],
  );
  assert.deepEqual(activeWorktreesFromRuntime({ goal: '106', goalClosed: true }, '/repo'), []);
  assert.deepEqual(activeWorktreesFromRuntime(null, '/repo'), []);
});

test('a test double is killed directly, never handed to taskkill', () => {
  const fake = new EventEmitter();
  fake.pid = 4242;
  let signal = null;
  fake.kill = (s) => { signal = s; };
  killProcessTreeSoon(fake);
  assert.equal(signal, 'SIGKILL');
});
