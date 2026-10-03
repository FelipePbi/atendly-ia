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
import { dirname, join, win32 } from 'node:path';

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
 * What the logon task executes: node itself, by absolute path, on
 * run-daemon.mjs — no npm in between.
 *
 * `npm` from a task means npm.ps1 under Windows PowerShell 5.1, and with no
 * ExecutionPolicy set (the default, Restricted) that script refuses to load:
 * the task would fail at every logon without a word. node.exe is a plain
 * executable, so no policy applies. Children still find npm without
 * `npm_execpath`: windows-command-resolver.mjs falls back to the npm-cli.js
 * that ships beside node.exe.
 *
 * PowerShell stays only as a host with a hidden window (a task running as
 * the logged-on user otherwise shows a console for the 20s `start` waits);
 * `-ExecutionPolicy Bypass` keeps it indifferent to the machine's policy.
 */
export function taskLaunch({ repoRoot, nodePath = process.execPath }) {
  const script = win32.join(repoRoot, 'tools', 'ia-loop', 'run-daemon.mjs');
  const ps = (value) => `'${String(value).replace(/'/g, "''")}'`;
  return {
    command: 'powershell.exe',
    arguments: '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden '
      + `-Command "& ${ps(nodePath)} ${ps(script)} start"`,
    workingDirectory: repoRoot,
  };
}

const xmlText = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** DOMAIN\user of whoever installs the task: the task runs as that user, at that user's logon. */
export function currentUserId(env = process.env) {
  const user = env.USERNAME || 'unknown';
  return env.USERDOMAIN ? `${env.USERDOMAIN}\\${user}` : user;
}

/**
 * The task definition, in Task Scheduler's own XML.
 *
 * XML rather than `/SC ONLOGON` flags because the flags cannot say what this
 * task needs:
 *
 * - The logon trigger names the user. A logon trigger without a user means
 *   "any user", and creating that requires an elevated prompt; one scoped to
 *   the installing user, run with that user's interactive token and least
 *   privilege, is a task the user may create for themselves.
 * - Battery: schtasks' defaults refuse to start on battery and kill the task
 *   when the power cable is pulled. A laptop running the loop must not.
 * - No execution time limit (the default is 72h, then the task's processes
 *   are terminated), and a second instance is never started beside a first.
 *
 * InteractiveToken stores no password and needs none: the task only ever runs
 * while the user is logged on, which is exactly when the daemon is wanted.
 */
export function buildTaskXml({ repoRoot, userId = currentUserId(), nodePath = process.execPath, delay = 'PT1M' }) {
  const launch = taskLaunch({ repoRoot, nodePath });
  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    '  <RegistrationInfo>',
    '    <Description>IA Loop daemon: starts tools/ia-loop/run-daemon.mjs at logon.</Description>',
    '  </RegistrationInfo>',
    '  <Triggers>',
    '    <LogonTrigger>',
    '      <Enabled>true</Enabled>',
    `      <UserId>${xmlText(userId)}</UserId>`,
    `      <Delay>${delay}</Delay>`,
    '    </LogonTrigger>',
    '  </Triggers>',
    '  <Principals>',
    '    <Principal id="Author">',
    `      <UserId>${xmlText(userId)}</UserId>`,
    '      <LogonType>InteractiveToken</LogonType>',
    '      <RunLevel>LeastPrivilege</RunLevel>',
    '    </Principal>',
    '  </Principals>',
    '  <Settings>',
    '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
    '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
    '    <AllowHardTerminate>true</AllowHardTerminate>',
    '    <StartWhenAvailable>true</StartWhenAvailable>',
    '    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>',
    '    <IdleSettings>',
    '      <StopOnIdleEnd>false</StopOnIdleEnd>',
    '      <RestartOnIdle>false</RestartOnIdle>',
    '    </IdleSettings>',
    '    <AllowStartOnDemand>true</AllowStartOnDemand>',
    '    <Enabled>true</Enabled>',
    '    <Hidden>false</Hidden>',
    '    <RunOnlyIfIdle>false</RunOnlyIfIdle>',
    '    <WakeToRun>false</WakeToRun>',
    '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
    '    <Priority>7</Priority>',
    '  </Settings>',
    '  <Actions Context="Author">',
    '    <Exec>',
    `      <Command>${xmlText(launch.command)}</Command>`,
    `      <Arguments>${xmlText(launch.arguments)}</Arguments>`,
    `      <WorkingDirectory>${xmlText(launch.workingDirectory)}</WorkingDirectory>`,
    '    </Exec>',
    '  </Actions>',
    '</Task>',
    '',
  ].join('\r\n');
}

/** schtasks reads /XML as UTF-16 LE with a byte-order mark, as Task Scheduler exports it. */
export function encodeTaskXml(xml) {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
}

/** `schtasks /Create /XML`: /F replaces an older definition of the same name. */
export function buildInstallCommand({ taskName, xmlPath }) {
  return { command: 'schtasks.exe', args: ['/Create', '/TN', taskName, '/XML', xmlPath, '/F'] };
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
 * Starts a GUI program (Docker Desktop) so that it belongs to nobody.
 *
 * Spawned directly, the program's parent pid is the daemon, and
 * `taskkill /T` on the daemon (`stop --now` when the daemon is stuck) walks
 * parent pids and takes Docker Desktop down with it — the very database the
 * next start needs. `cmd /c start` launches it and exits at once, so its
 * parent is a process that no longer exists and no tree reaches it.
 * `detached` keeps the short-lived cmd outside the daemon's job object.
 */
export function startDetachedProgram(path, { spawnImpl = spawn } = {}) {
  try {
    const child = spawnImpl('cmd.exe', ['/d', '/s', '/c', `start "" "${path}"`], {
      detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true,
    });
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
