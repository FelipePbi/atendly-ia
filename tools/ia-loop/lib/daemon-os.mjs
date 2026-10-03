/**
 * IA Loop — the daemon's contact points with the operating system.
 *
 * Everything here touches the machine (PowerShell, schtasks, a detached
 * process), so everything here is small, never throws, and is replaced by a
 * fake in every test. The daemon itself only ever calls these through the
 * functions it was given.
 */

import { spawn } from 'node:child_process';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Runs a command and resolves `{ code, stdout, stderr }`. Never rejects.
 *
 * stdin is closed, not a pipe left open: a command that unexpectedly prompts
 * (schtasks asking for a password) must fail at once instead of hanging the
 * daemon until the timeout. `windowsHide` matters because the daemon runs
 * without a console, and every console child would otherwise open a window.
 */
export function runCommand(command, args = [], { timeoutMs = 60_000, cwd, env } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };

    let child;
    try {
      child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      finish({ code: -1, stdout: '', stderr: error.message });
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      finish({ code: -1, stdout, stderr: `${stderr}\n[timed out after ${timeoutMs}ms]` });
    }, timeoutMs);
    timer.unref?.();
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); finish({ code: -1, stdout, stderr: error.message }); });
    child.on('close', (code) => { clearTimeout(timer); finish({ code: code ?? -1, stdout, stderr }); });
  });
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/**
 * A Windows toast through the WinRT API Windows PowerShell 5.1 already ships.
 * Title and text travel as environment variables, never inside the script, so
 * no character in a Goal title can be read as PowerShell.
 */
const TOAST_SCRIPT = [
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;',
  '$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);',
  '$x = $t.GetElementsByTagName("text");',
  '$x.Item(0).AppendChild($t.CreateTextNode($env:IA_LOOP_TOAST_TITLE)) > $null;',
  '$x.Item(1).AppendChild($t.CreateTextNode($env:IA_LOOP_TOAST_TEXT)) > $null;',
  '$n = [Windows.UI.Notifications.ToastNotification]::new($t);',
  // The AppUserModelID of Windows PowerShell: always registered, so the toast
  // shows without the harness having to register an app of its own.
  '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(',
  '"{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe").Show($n)',
].join(' ');

export function createToastSender({ run = runCommand, platform = process.platform } = {}) {
  return async ({ title, text }) => {
    if (platform !== 'win32') return { shown: false, reason: 'NOT_WINDOWS' };
    const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', TOAST_SCRIPT], {
      timeoutMs: 20_000,
      env: { ...process.env, IA_LOOP_TOAST_TITLE: String(title).slice(0, 120), IA_LOOP_TOAST_TEXT: String(text).slice(0, 400) },
    });
    return { shown: result.code === 0, reason: result.code === 0 ? null : (result.stderr || '').trim().slice(0, 200) };
  };
}

// ---------------------------------------------------------------------------
// Committed memory
// ---------------------------------------------------------------------------

/**
 * Commit charge and commit limit, the two numbers Task Manager shows as
 * "Committed". Physical memory can look fine while the commit charge is at
 * its limit — and that is the state in which reads of `.state/` started
 * failing with UNKNOWN/EPERM (V35) and the machine ran out of memory.
 */
const MEMORY_SCRIPT = [
  '$m = Get-CimInstance Win32_PerfRawData_PerfOS_Memory;',
  '[pscustomobject]@{ committed = [uint64]$m.CommittedBytes; limit = [uint64]$m.CommitLimit } | ConvertTo-Json -Compress',
].join(' ');

export function createMemoryProbe({ run = runCommand, platform = process.platform } = {}) {
  return async () => {
    if (platform !== 'win32') return null;
    const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', MEMORY_SCRIPT], { timeoutMs: 30_000 });
    if (result.code !== 0) return null;
    try {
      const parsed = JSON.parse(result.stdout.trim());
      const committedBytes = Number(parsed.committed);
      const limitBytes = Number(parsed.limit);
      if (!(committedBytes > 0) || !(limitBytes > 0)) return null;
      return { committedBytes, limitBytes, percent: (committedBytes / limitBytes) * 100 };
    } catch {
      return null;
    }
  };
}

// ---------------------------------------------------------------------------
// Scheduled Task (boot)
// ---------------------------------------------------------------------------

/**
 * The command the logon task runs. `npm run` rather than `node` directly, so
 * the daemon and every child carry `npm_execpath` exactly as when the operator
 * starts it by hand (windows-command-resolver.mjs prefers it). PowerShell with
 * a hidden window, because a task running as the logged-on user otherwise
 * shows a console for the second the launcher lives.
 */
export function taskAction({ repoRoot }) {
  const root = String(repoRoot).replace(/'/g, "''");
  return `powershell.exe -NoProfile -WindowStyle Hidden -Command "Set-Location -LiteralPath '${root}'; npm run ia-loop:start"`;
}

/**
 * `schtasks /Create`: at logon of the current user (no /RU, so no password is
 * stored or asked for), limited rights, a one-minute delay so the desktop and
 * Docker Desktop get going first, /F to replace an older definition.
 */
export function buildInstallCommand({ taskName, repoRoot }) {
  return {
    command: 'schtasks.exe',
    args: ['/Create', '/TN', taskName, '/SC', 'ONLOGON', '/DELAY', '0001:00', '/RL', 'LIMITED', '/IT', '/F', '/TR', taskAction({ repoRoot })],
  };
}

export function buildUninstallCommand({ taskName }) {
  return { command: 'schtasks.exe', args: ['/Delete', '/TN', taskName, '/F'] };
}

/** How a command is shown to the operator: quoted the way cmd would need it. */
export function renderCommand({ command, args }) {
  const quote = (value) => (/[\s"]/.test(value) ? `"${String(value).replace(/"/g, '\\"')}"` : value);
  return [command, ...args].map(quote).join(' ');
}

// ---------------------------------------------------------------------------
// Detached start
// ---------------------------------------------------------------------------

/**
 * Starts `node <script> <args>` so that it outlives this process and the
 * terminal it was typed in.
 *
 * `detached` is what makes it survive: Node puts every non-detached child in
 * a job object that kills it when the parent exits, and a detached child is
 * created outside that job and outside the console. `windowsHide` keeps it
 * from opening a window of its own. Its early output (before it opens its own
 * logs) goes to `bootLogPath`, so a daemon that dies on startup says why.
 */
export function startDetached({ script, args = [], cwd, env = process.env, bootLogPath, spawnImpl = spawn, execPath = process.execPath }) {
  mkdirSync(dirname(bootLogPath), { recursive: true });
  const out = openSync(bootLogPath, 'a');
  try {
    const child = spawnImpl(execPath, [script, ...args], {
      cwd, env, detached: true, windowsHide: true, stdio: ['ignore', out, out],
    });
    child.unref?.();
    return child;
  } finally {
    closeSync(out);
  }
}

/**
 * Starts a GUI program (Docker Desktop) outside the daemon's job object.
 * Non-detached children die with the daemon; Docker Desktop must not.
 */
export function startDetachedProgram(path, { spawnImpl = spawn } = {}) {
  try {
    const child = spawnImpl(path, [], { detached: true, stdio: 'ignore' });
    child.on?.('error', () => {});
    child.unref?.();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Daemon children
// ---------------------------------------------------------------------------

/**
 * Spawns `node tools/ia-loop/<script>` as a daemon child and returns the
 * handle the daemon works with: `{ pid, exited, send }`.
 *
 * - cwd is the repository root, as under `npm run`.
 * - stdout and stderr go to the child's rotating log and to `onOutput`.
 * - `ipc` opens the channel a worker listens on for a graceful shutdown.
 * - Not detached: Node puts the child in a job object that dies with the
 *   daemon, so a daemon killed hard never leaves a worker behind.
 *
 * `exited` settles on 'close' (every byte of output read) or, failing that,
 * shortly after 'exit': a grandchild still holding the pipe must not keep the
 * daemon from seeing that run-auto itself has finished.
 */
export function createChildSpawner({
  repoRoot, toolsDir, logFor, env = process.env, childEnv = {}, spawnImpl = spawn, execPath = process.execPath,
  closeGraceMs = 2_000,
}) {
  return (name, script, args = [], { ipc = false, onOutput = null } = {}) => {
    const log = logFor(name);
    const child = spawnImpl(execPath, [join(toolsDir, script), ...args], {
      cwd: repoRoot,
      env: { ...env, ...childEnv },
      stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])],
      windowsHide: true,
    });
    const forward = (chunk) => {
      const text = String(chunk);
      log.write(text);
      try { onOutput?.(text); } catch { /* a capture must never break the pipe */ }
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);

    const exited = new Promise((resolve) => {
      let result = null;
      let settled = false;
      const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
      child.on('exit', (code, signal) => {
        result = { code: code ?? -1, signal: signal ?? null };
        const timer = setTimeout(() => finish(result), closeGraceMs);
        timer.unref?.();
      });
      child.on('close', (code, signal) => finish(result ?? { code: code ?? -1, signal: signal ?? null }));
      child.on('error', (error) => finish({ code: -1, signal: null, error: error.message }));
    });

    return {
      pid: child.pid ?? null,
      exited,
      send(message) {
        try { return child.connected ? child.send(message) : false; } catch { return false; }
      },
    };
  };
}
