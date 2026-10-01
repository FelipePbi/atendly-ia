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
 * Two tools:
 *
 *   killProcessTree(pid)  what `kill` should have meant: the process AND its
 *                         descendants (`taskkill /T /F`).
 *   sweepOrphanProcesses  after an attempt ends, kill every process that has
 *                         lost its parent AND belongs to a worktree (its
 *                         command line names the worktree path), or is a
 *                         Playwright Chromium. Requiring BOTH "orphan" and
 *                         "ours" is what makes this safe to run while other
 *                         work is alive: a process still owned by a running
 *                         unit has a living parent, and nothing outside the
 *                         loop's worktrees matches.
 *
 * Windows only. Elsewhere `kill` on a process group is the platform's answer,
 * and both functions degrade to a plain kill / a no-op.
 */

import { ChildProcess, execFile } from 'node:child_process';
import { promisify } from 'node:util';

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

const LIST_SCRIPT = [
  '$all = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize;',
  '$ids = @{}; foreach ($p in $all) { $ids[[int]$p.ProcessId] = $true }',
  '$all | Where-Object { $_.Name -match "^(node|chrome|chrome-headless-shell|headless_shell|cmd|bash|sh)\\.exe$" -and -not $ids[[int]$_.ParentProcessId] } |',
  '  ForEach-Object { [pscustomobject]@{ pid = [int]$_.ProcessId; name = $_.Name; mb = [math]::Round($_.WorkingSetSize / 1MB); cmd = [string]$_.CommandLine } } |',
  '  ConvertTo-Json -Compress',
].join(' ');

/** Processes on this machine whose parent no longer exists. */
export async function listOrphanProcesses({ exec = execFileAsync } = {}) {
  if (!IS_WINDOWS) return [];
  const { stdout } = await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', LIST_SCRIPT], {
    timeout: 30_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  const text = stdout.trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

const normalise = (value) => String(value ?? '').replace(/\//g, '\\').toLowerCase();

/**
 * Which orphans are the loop's to kill. Pure, so the rule is testable without
 * a process table.
 */
export function selectLoopOrphans(orphans, { roots = [], selfPid = process.pid } = {}) {
  const wanted = roots.filter(Boolean).map(normalise);
  return orphans.filter((entry) => {
    if (entry.pid === selfPid) return false;
    const cmd = normalise(entry.cmd);
    if (wanted.some((root) => cmd.includes(root))) return true;
    // A Playwright Chromium is never legitimately parentless: its driver owns
    // it for its whole life.
    return /chrom/.test(entry.name.toLowerCase()) && cmd.includes('ms-playwright');
  });
}

/**
 * Kills the loop's orphaned processes. `roots` are the paths that make a
 * process "ours" — normally `<repo>\.ai-worktrees`. Returns what it killed.
 */
export async function sweepOrphanProcesses({ roots, exec = execFileAsync, kill = killProcessTree } = {}) {
  if (!IS_WINDOWS) return [];
  const orphans = await listOrphanProcesses({ exec });
  const targets = selectLoopOrphans(orphans, { roots });
  const killed = [];
  for (const target of targets) {
    if (await kill(target.pid, { exec })) killed.push(target);
  }
  return killed;
}
