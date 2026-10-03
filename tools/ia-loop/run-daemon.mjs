#!/usr/bin/env node
/**
 * IA Loop — the daemon: one command brings the whole loop up.
 *
 *   npm run ia-loop:start                     start detached (survives the terminal)
 *   npm run ia-loop:start -- --foreground     run attached to this terminal
 *   npm run ia-loop:stop                      pause at the next safe boundary, then stop
 *   npm run ia-loop:stop -- --now             stop at once; leases are left for recovery
 *   npm run ia-loop:daemon -- --resume [--from <goal>] [--resolved "<note>"]
 *   npm run ia-loop:daemon -- --install [--dry-run]     logon task (Windows)
 *   npm run ia-loop:daemon -- --uninstall [--dry-run]
 *   npm run ia-loop:status                    has a "Daemon:" section
 *
 * The daemon itself is `run-daemon.mjs run`, started by `start`. Everything
 * it does is in lib/daemon.mjs; this file is the command line and the wiring
 * of the real processes, Docker, memory probe, notifier and git.
 *
 * The CLI never talks to a running daemon directly: it writes a request under
 * `.state/daemon/requests/` and watches the daemon's lease and snapshot, so a
 * daemon that is busy or gone cannot hang it.
 */

import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { systemClock } from './lib/clock.mjs';
import { createJobStore } from './lib/job-store.mjs';
import { createLeaseStore } from './lib/leases.mjs';
import { createProcessInspector } from './lib/process-inspector.mjs';
import { activeWorktreesFromRuntime, killProcessTree, sweepOrphanProcesses } from './lib/orphan-processes.mjs';
import { WORKTREE_ROOT } from './lib/worktree-manager.mjs';
import { acquireWorkerIdentity, describeHolder, startWorkerIdentityHeartbeat } from './lib/worker-identity.mjs';
import { parseDuration } from './lib/pause-safety.mjs';
import { isDirectExecution } from './lib/direct-execution.mjs';
import { createDaemon } from './lib/daemon.mjs';
import { readDaemonConfig } from './lib/daemon-config.mjs';
import { ensureDocker } from './lib/daemon-docker.mjs';
import { createRotatingLog, stampLine } from './lib/daemon-logs.mjs';
import {
  buildInstallCommand, buildUninstallCommand, createChildSpawner, createMemoryProbe, createToastSender,
  renderCommand, runCommand, startDetached, startDetachedProgram,
} from './lib/daemon-os.mjs';
import {
  DAEMON_REQUESTS, createDaemonStateStore, judgeDaemonLease, retireDeadDaemonLease,
} from './lib/daemon-state.mjs';
import { DAEMON_CHILD_ENV, DAEMON_LEASE_ROLE } from './lib/daemon-vocabulary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const STATE_DIR = join(HERE, '.state');

const USAGE = [
  'Usage:',
  '  npm run ia-loop:start [-- --foreground]',
  '  npm run ia-loop:stop [-- --now] [--timeout 6h]',
  '  npm run ia-loop:daemon -- --resume [--from <goal>] [--resolved "<what was resolved>"]',
  '  npm run ia-loop:daemon -- --install | --uninstall [--dry-run]',
].join('\n');

/** How long `start` waits to see the detached daemon take its lease. */
const START_CONFIRM_MS = 20_000;
/** How long `stop --now` waits before killing the daemon's tree itself. */
const STOP_NOW_GRACE_MS = 30_000;
/** Default patience of a graceful `stop`: a Goal round can take hours. */
const STOP_DEFAULT_TIMEOUT_MS = 6 * 60 * 60_000;

export function parseDaemonArgs(argv) {
  const args = argv.slice(2);
  const options = {
    command: null, foreground: false, now: false, timeoutMs: STOP_DEFAULT_TIMEOUT_MS,
    from: null, resolved: null, dryRun: false,
  };
  const valueOf = (i, flag) => {
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new SpikeError('INVALID_ARGS', `${flag} needs a value\n\n${USAGE}`);
    return value;
  };
  const setCommand = (command) => {
    if (options.command && options.command !== command) {
      throw new SpikeError('INVALID_ARGS', `Choose one of start, stop, --resume, --install, --uninstall\n\n${USAGE}`);
    }
    options.command = command;
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === 'start' || arg === 'stop' || arg === 'run') setCommand(arg);
    else if (arg === '--resume') setCommand('resume');
    else if (arg === '--install') setCommand('install');
    else if (arg === '--uninstall') setCommand('uninstall');
    else if (arg === '--foreground') options.foreground = true;
    else if (arg === '--now') options.now = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--from') { options.from = valueOf(i, '--from'); i += 1; }
    else if (arg === '--resolved') { options.resolved = valueOf(i, '--resolved'); i += 1; }
    else if (arg === '--timeout') {
      const ms = parseDuration(valueOf(i, '--timeout'));
      if (!ms) throw new SpikeError('INVALID_ARGS', `--timeout must be like 90m, 2h or 300s; got "${args[i + 1]}"`);
      options.timeoutMs = ms;
      i += 1;
    } else {
      throw new SpikeError('INVALID_ARGS', `Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }

  if (options.from !== null && !/^\d{3}$/.test(options.from)) {
    throw new SpikeError('INVALID_ARGS', `--from must be a three-digit Goal id; got "${options.from}"`);
  }
  if ((options.from !== null || options.resolved !== null) && options.command !== 'resume') {
    throw new SpikeError('INVALID_ARGS', '--from and --resolved only apply with --resume');
  }
  if (options.resolved !== null && options.resolved.trim() === '') {
    throw new SpikeError('INVALID_ARGS', '--resolved needs a note saying what was resolved');
  }
  if (options.dryRun && !['install', 'uninstall'].includes(options.command)) {
    throw new SpikeError('INVALID_ARGS', '--dry-run only applies with --install or --uninstall');
  }
  return options;
}

const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });

/** Is a daemon running right now, judged on its lease? */
async function currentDaemon({ stateDir, inspector }) {
  const dstore = createDaemonStateStore(stateDir);
  const lease = await dstore.readLease();
  return judgeDaemonLease({ lease, inspector });
}

function describeRunning(judgement, paths) {
  const lease = judgement.lease;
  return [
    `IA Loop daemon already running: pid ${lease.pid}, since ${lease.acquiredAt ?? lease.startedAt}.`,
    `  Logs: ${paths.root}`,
    '  Status: npm run ia-loop:status · Stop: npm run ia-loop:stop',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

export async function startCommand({
  stateDir = STATE_DIR,
  foreground = false,
  inspector = createProcessInspector(),
  launch = (bootLogPath) => startDetached({
    script: fileURLToPath(import.meta.url), args: ['run'], cwd: REPO_ROOT, bootLogPath,
  }),
  runInForeground = () => runDaemonProcess({ stateDir, foreground: true }),
  confirmMs = START_CONFIRM_MS,
  pollMs = 250,
  wait = sleep,
  out = console.log,
} = {}) {
  const dstore = createDaemonStateStore(stateDir);
  const judgement = await currentDaemon({ stateDir, inspector });
  if (judgement.running) {
    out(describeRunning(judgement, dstore.paths));
    return 0;
  }
  if (foreground) return runInForeground();

  const child = launch(dstore.paths.bootLog);
  const deadline = Date.now() + confirmMs;
  while (Date.now() < deadline) {
    await wait(pollMs);
    const lease = await dstore.readLease();
    if (lease?.pid === child.pid) {
      out([
        `IA Loop daemon started: pid ${child.pid}.`,
        `  Logs: ${dstore.paths.root} (daemon.log, developer.log, tech-lead.log, run-auto.log)`,
        '  Status: npm run ia-loop:status',
        '  Stop:   npm run ia-loop:stop   (or -- --now)',
      ].join('\n'));
      return 0;
    }
    if (lease && lease.pid !== child.pid) {
      // Another start won the race; the one launched here exits by itself.
      out(describeRunning({ lease }, dstore.paths));
      return 0;
    }
  }
  out(`The daemon (pid ${child.pid}) did not confirm within ${Math.round(confirmMs / 1000)}s. See ${dstore.paths.bootLog}.`);
  return 1;
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

export async function stopCommand({
  stateDir = STATE_DIR,
  now: immediate = false,
  timeoutMs = STOP_DEFAULT_TIMEOUT_MS,
  inspector = createProcessInspector(),
  killTree = (pid) => killProcessTree(pid),
  pollMs = 2_000,
  graceMs = STOP_NOW_GRACE_MS,
  wait = sleep,
  clockNow = () => Date.now(),
  out = console.log,
} = {}) {
  const dstore = createDaemonStateStore(stateDir);
  const judgement = await currentDaemon({ stateDir, inspector });
  if (!judgement.running) {
    if (judgement.lease) await retireDeadDaemonLease({ leaseStore: dstore.leases, judgement });
    out('The IA Loop daemon is not running.');
    return 0;
  }
  const { lease } = judgement;
  await dstore.writeRequest(DAEMON_REQUESTS.STOP, { mode: immediate ? 'now' : 'graceful' });
  out(immediate
    ? `Stop requested (now): the daemon (pid ${lease.pid}) kills its children and exits.`
    : `Stop requested: the daemon (pid ${lease.pid}) pauses the loop at the next safe boundary, then stops.`);

  const released = async () => {
    const current = await dstore.readLease();
    return !current || current.workerInstanceId !== lease.workerInstanceId;
  };
  const startedAt = clockNow();
  const limit = immediate ? graceMs : timeoutMs;
  let lastWaiting = null;

  while (clockNow() - startedAt < limit) {
    if (await released()) {
      out('Stopped.');
      return 0;
    }
    if (!immediate) {
      const snapshot = await dstore.readSnapshot();
      const waiting = (snapshot?.stopBlockers ?? []).join('; ');
      if (waiting && waiting !== lastWaiting) {
        lastWaiting = waiting;
        out(`  waiting for: ${waiting}`);
      }
    }
    await wait(pollMs);
  }

  if (!immediate) {
    out(`Still stopping after ${Math.round(timeoutMs / 60_000)} min. The daemon keeps waiting for the safe boundary; `
      + 'check npm run ia-loop:status, or stop at once with npm run ia-loop:stop -- --now.');
    return 2;
  }

  // The daemon did not exit on its own. Kill its tree — but only after
  // confirming the pid is still that daemon, never a recycled number.
  const again = await currentDaemon({ stateDir, inspector });
  if (again.running && again.lease?.workerInstanceId === lease.workerInstanceId) {
    const startedNow = await inspector.startedAt(lease.pid).catch(() => null);
    if (!startedNow || !lease.processStartedAt
      || Math.abs(Date.parse(startedNow) - Date.parse(lease.processStartedAt)) <= 2_000) {
      out(`The daemon did not exit in ${Math.round(graceMs / 1000)}s; killing its process tree (pid ${lease.pid}).`);
      await killTree(lease.pid);
      const after = await currentDaemon({ stateDir, inspector });
      await retireDeadDaemonLease({ leaseStore: dstore.leases, judgement: after });
    }
  }
  out('Stopped. Leases the loop held are left for run-recover, which the next start runs.');
  return 0;
}

// ---------------------------------------------------------------------------
// resume
// ---------------------------------------------------------------------------

export async function resumeCommand({ stateDir = STATE_DIR, from = null, resolved = null, inspector = createProcessInspector(), out = console.log } = {}) {
  const dstore = createDaemonStateStore(stateDir);
  await dstore.writeRequest(DAEMON_REQUESTS.RESUME, { from, resolved });
  const judgement = await currentDaemon({ stateDir, inspector });
  out(judgement.running
    ? 'Resume requested; the daemon acts on it at its next tick. Follow with: npm run ia-loop:status'
    : 'Resume recorded. The daemon is not running: it acts on it when started (npm run ia-loop:start).');
  return 0;
}

// ---------------------------------------------------------------------------
// install / uninstall
// ---------------------------------------------------------------------------

export async function taskCommand({
  action, dryRun = false, run = runCommand, taskName = readDaemonConfig().taskName,
  repoRoot = REPO_ROOT, platform = process.platform, out = console.log,
}) {
  const command = action === 'install' ? buildInstallCommand({ taskName, repoRoot }) : buildUninstallCommand({ taskName });
  if (dryRun) {
    out(renderCommand(command));
    return 0;
  }
  if (platform !== 'win32') {
    out('The logon task is a Windows Scheduled Task; on this platform start the daemon with your own service manager.');
    return 1;
  }
  const result = await run(command.command, command.args, { timeoutMs: 60_000 });
  if (result.code !== 0) {
    out(`schtasks failed (exit ${result.code}): ${(result.stderr || result.stdout || '').trim()}`);
    return 1;
  }
  out(action === 'install'
    ? `Scheduled Task "${taskName}" installed: at your logon it runs npm run ia-loop:start (hidden).`
    : `Scheduled Task "${taskName}" removed.`);
  return 0;
}

// ---------------------------------------------------------------------------
// run: the daemon process itself
// ---------------------------------------------------------------------------

export async function runDaemonProcess({ stateDir = STATE_DIR, foreground = false } = {}) {
  const config = readDaemonConfig();
  const dstore = createDaemonStateStore(stateDir);
  const leaseStore = createLeaseStore(stateDir);
  const inspector = createProcessInspector();
  const clock = systemClock();
  await mkdir(dstore.paths.root, { recursive: true });

  const daemonLog = createRotatingLog(dstore.paths.log, config.logs);
  const log = (tag, message) => {
    const line = stampLine(Date.now(), tag, message);
    daemonLog.write(line);
    if (foreground) process.stdout.write(line);
  };

  // --- One daemon per state directory ---------------------------------------
  const existing = await judgeDaemonLease({ lease: await dstore.readLease(), inspector });
  if (existing.running) {
    console.log(describeRunning(existing, dstore.paths));
    return 0;
  }
  if (existing.lease) await retireDeadDaemonLease({ leaseStore, judgement: existing });
  const identity = await acquireWorkerIdentity({ leaseStore, role: DAEMON_LEASE_ROLE, repoRoot: REPO_ROOT, inspector });
  if (!identity.acquired) {
    console.log(`IA Loop daemon already running (${identity.reason}): ${describeHolder(identity.heldBy)}`);
    return 0;
  }
  const stopLeaseHeartbeat = startWorkerIdentityHeartbeat(leaseStore, DAEMON_LEASE_ROLE, {
    onError: (error) => log('ERROR', `daemon lease renew failed: ${error.message}`),
  });

  const store = createJobStore(stateDir);
  const childLogs = new Map();
  const logFor = (name) => {
    if (!childLogs.has(name)) childLogs.set(name, createRotatingLog(dstore.paths.childLog(name), config.logs));
    return childLogs.get(name);
  };
  const pathExists = (path) => access(path).then(() => true, () => false);

  const daemon = createDaemon({
    config,
    stateDir,
    repoRoot: REPO_ROOT,
    clock,
    inspector,
    log,
    logDir: dstore.paths.root,
    spawnChild: createChildSpawner({
      repoRoot: REPO_ROOT, toolsDir: HERE, logFor, childEnv: { [DAEMON_CHILD_ENV]: '1' },
    }),
    killTree: (pid) => killProcessTree(pid),
    ensureDocker: () => ensureDocker({
      config: config.docker,
      run: runCommand,
      startDesktop: async (path) => startDetachedProgram(path),
      renamePath: rename,
      pathExists,
      clock,
      emit: (event) => store.appendEvent(event).catch(() => {}),
      log,
    }),
    probeMemory: createMemoryProbe(),
    notifier: createToastSender(),
    sweepOrphans: (runtime) => sweepOrphanProcesses({
      roots: [join(REPO_ROOT, WORKTREE_ROOT)],
      repoRoot: REPO_ROOT,
      activeWorktrees: activeWorktreesFromRuntime(runtime, REPO_ROOT),
    }),
    git: (args) => runCommand('git', args, { cwd: REPO_ROOT, timeoutMs: 120_000 }),
    savePatch: async (name, content) => {
      await mkdir(dstore.paths.incidents, { recursive: true });
      await writeFile(join(dstore.paths.incidents, name), content, 'utf8');
    },
    pathExists,
  });

  // In the foreground, Ctrl+C reaches every child on the console too: the
  // only honest answer is the immediate stop. A second Ctrl+C exits at once.
  let interrupted = false;
  const onInterrupt = () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    log('STOP', 'interrupted; stopping now');
    void daemon.requestStop('now');
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onInterrupt);
  process.on('unhandledRejection', (error) => log('ERROR', `unhandled rejection: ${error?.stack ?? error}`));

  const result = await daemon.runForever().catch((error) => {
    log('ERROR', `daemon failed: ${error.stack ?? error.message}`);
    return { mode: 'crashed' };
  });
  await stopLeaseHeartbeat();
  await leaseStore.releaseWorker(DAEMON_LEASE_ROLE).catch(() => {});
  log('EXIT', `daemon exiting (${result?.mode ?? 'unknown'})`);
  // Pending timers (a grace period, a probe) must not keep a stopped daemon up.
  return process.exit(result?.mode === 'crashed' ? 1 : 0);
}

// ---------------------------------------------------------------------------

async function main() {
  const options = parseDaemonArgs(process.argv);
  switch (options.command) {
    case 'start': return startCommand({ foreground: options.foreground });
    case 'stop': return stopCommand({ now: options.now, timeoutMs: options.timeoutMs });
    case 'run': return runDaemonProcess({ foreground: false });
    case 'resume': return resumeCommand({ from: options.from, resolved: options.resolved });
    case 'install':
    case 'uninstall': return taskCommand({ action: options.command, dryRun: options.dryRun });
    default:
      console.log(USAGE);
      return 0;
  }
}

if (isDirectExecution(import.meta.url)) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
      console.error(`ATENDLY IA LOOP — DAEMON\n\n[${code}] ${error.message}`);
      process.exitCode = 1;
    });
}
