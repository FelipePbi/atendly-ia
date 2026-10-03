/**
 * V37 — the daemon's command line and its contact points with Windows:
 * start/stop/resume, the single-instance lock, the logon task, the toast, the
 * memory probe and how children are spawned. Every OS call is a fake; no test
 * here starts a process, a scheduled task or a toast.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLeaseStore } from '../lib/leases.mjs';
import { LIVENESS } from '../lib/process-inspector.mjs';
import { acquireWorkerIdentity } from '../lib/worker-identity.mjs';
import {
  buildInstallCommand, buildUninstallCommand, createChildSpawner, createMemoryProbe, createToastSender,
  renderCommand, startDetached, taskAction,
} from '../lib/daemon-os.mjs';
import {
  DAEMON_REQUESTS, createDaemonStateStore, judgeDaemonLease, renderDaemonStatus,
} from '../lib/daemon-state.mjs';
import { DAEMON_CHILD_ENV, DAEMON_LEASE_ROLE } from '../lib/daemon-vocabulary.mjs';
import {
  parseDaemonArgs, resumeCommand, startCommand, stopCommand, taskCommand,
} from '../run-daemon.mjs';

async function withStateDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-daemon-cli-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

/** An inspector that knows only what the test tells it. */
const inspectorWith = (liveness = LIVENESS.ALIVE) => ({
  self: () => ({}),
  bootAt: () => new Date(Date.now() - 3_600_000).toISOString(),
  hostname: () => 'host',
  exists: () => liveness,
  startedAt: async () => null,
});

const collect = () => {
  const lines = [];
  return { out: (line) => lines.push(line), text: () => lines.join('\n') };
};

// --- Arguments ------------------------------------------------------------

test('parseDaemonArgs: every command and its flags', () => {
  const parse = (...args) => parseDaemonArgs(['node', 'run-daemon.mjs', ...args]);
  assert.equal(parse('start').command, 'start');
  assert.equal(parse('start', '--foreground').foreground, true);
  assert.equal(parse('stop', '--now').now, true);
  assert.equal(parse('stop', '--timeout', '2h').timeoutMs, 2 * 3_600_000);
  assert.deepEqual(
    (({ command, from, resolved }) => ({ command, from, resolved }))(parse('--resume', '--from', '094', '--resolved', 'fixed it')),
    { command: 'resume', from: '094', resolved: 'fixed it' },
  );
  assert.equal(parse('--install', '--dry-run').dryRun, true);
  assert.equal(parse('--uninstall').command, 'uninstall');
  assert.equal(parse().command, null);
});

test('parseDaemonArgs refuses what makes no sense', () => {
  const parse = (...args) => () => parseDaemonArgs(['node', 'run-daemon.mjs', ...args]);
  assert.throws(parse('--resume', '--from', '12'), /three-digit/);
  assert.throws(parse('start', '--from', '094'), /only apply with --resume/);
  assert.throws(parse('start', '--dry-run'), /--dry-run only applies/);
  assert.throws(parse('--install', '--uninstall'), /Choose one/);
  assert.throws(parse('--resume', '--resolved'), /needs a value/);
  assert.throws(parse('--bogus'), /Unknown argument/);
});

// --- Logon task -----------------------------------------------------------

test('install: ONLOGON task for the current user, hidden, running npm run ia-loop:start', () => {
  const command = buildInstallCommand({ taskName: 'IA Loop Daemon', repoRoot: 'E:\\Projetos\\atendly-ia' });
  assert.equal(command.command, 'schtasks.exe');
  assert.deepEqual(command.args.slice(0, 4), ['/Create', '/TN', 'IA Loop Daemon', '/SC']);
  assert.ok(command.args.includes('ONLOGON'));
  assert.ok(!command.args.includes('/RU'), 'no /RU: no password is stored or asked for');
  const action = command.args.at(-1);
  assert.equal(action, taskAction({ repoRoot: 'E:\\Projetos\\atendly-ia' }));
  assert.match(action, /-WindowStyle Hidden/);
  assert.match(action, /Set-Location -LiteralPath 'E:\\Projetos\\atendly-ia'; npm run ia-loop:start/);
  assert.deepEqual(buildUninstallCommand({ taskName: 'X' }).args, ['/Delete', '/TN', 'X', '/F']);
});

test('--dry-run prints the exact command and runs nothing', async () => {
  const { out, text } = collect();
  let ran = false;
  const code = await taskCommand({ action: 'install', dryRun: true, run: async () => { ran = true; }, taskName: 'IA Loop Daemon', repoRoot: 'E:\\r', out });
  assert.equal(code, 0);
  assert.equal(ran, false);
  assert.equal(text(), renderCommand(buildInstallCommand({ taskName: 'IA Loop Daemon', repoRoot: 'E:\\r' })));
  assert.match(text(), /^schtasks\.exe \/Create \/TN "IA Loop Daemon"/);
});

test('install and uninstall go through the runner, and a failure is reported', async () => {
  const calls = [];
  const ok = async (command, args) => { calls.push([command, ...args]); return { code: 0, stdout: 'SUCCESS', stderr: '' }; };
  assert.equal(await taskCommand({ action: 'install', run: ok, taskName: 'T', repoRoot: 'E:\\r', platform: 'win32', out: () => {} }), 0);
  assert.equal(await taskCommand({ action: 'uninstall', run: ok, taskName: 'T', repoRoot: 'E:\\r', platform: 'win32', out: () => {} }), 0);
  assert.deepEqual(calls.map((c) => c[1]), ['/Create', '/Delete']);

  const { out, text } = collect();
  const denied = async () => ({ code: 1, stdout: '', stderr: 'ERROR: Access is denied.' });
  assert.equal(await taskCommand({ action: 'install', run: denied, taskName: 'T', repoRoot: 'E:\\r', platform: 'win32', out }), 1);
  assert.match(text(), /Access is denied/);
});

// --- Toast and memory probe -----------------------------------------------

test('the toast passes title and text through the environment, never inside the script', async () => {
  let seen;
  const send = createToastSender({ platform: 'win32', run: async (command, args, options) => { seen = { command, args, options }; return { code: 0, stdout: '', stderr: '' }; } });
  const result = await send({ title: "Goal 'x'; Remove-Item", text: 'corpo' });
  assert.equal(result.shown, true);
  assert.equal(seen.command, 'powershell.exe');
  assert.ok(!seen.args.join(' ').includes('Remove-Item'));
  assert.equal(seen.options.env.IA_LOOP_TOAST_TITLE, "Goal 'x'; Remove-Item");
  assert.deepEqual(await createToastSender({ platform: 'linux', run: async () => assert.fail() })({ title: 'a', text: 'b' }),
    { shown: false, reason: 'NOT_WINDOWS' });
});

test('the memory probe reads commit charge over commit limit', async () => {
  const probe = createMemoryProbe({ platform: 'win32', run: async () => ({ code: 0, stdout: '{"committed":9500,"limit":10000}', stderr: '' }) });
  assert.deepEqual(await probe(), { committedBytes: 9500, limitBytes: 10000, percent: 95 });
  assert.equal(await createMemoryProbe({ platform: 'win32', run: async () => ({ code: 1, stdout: '', stderr: 'x' }) })(), null);
  assert.equal(await createMemoryProbe({ platform: 'win32', run: async () => ({ code: 0, stdout: 'garbage', stderr: '' }) })(), null);
});

// --- Spawning ---------------------------------------------------------------

function fakeSpawnImpl() {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter();
    child.pid = 4242;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.connected = true;
    child.sent = [];
    child.send = (message) => { child.sent.push(message); return true; };
    child.unref = () => { child.unrefed = true; };
    calls.push({ command, args, options, child });
    return child;
  };
  return { spawnImpl, calls };
}

test('startDetached: detached, hidden, output to the boot log, unref’d', () => withStateDir(async (dir) => {
  const { spawnImpl, calls } = fakeSpawnImpl();
  const child = startDetached({ script: 'run-daemon.mjs', args: ['run'], cwd: dir, bootLogPath: join(dir, 'daemon', 'boot.log'), spawnImpl, execPath: 'node.exe' });
  assert.equal(child.pid, 4242);
  const { options, args } = calls[0];
  assert.equal(options.detached, true);
  assert.equal(options.windowsHide, true);
  assert.equal(options.stdio[0], 'ignore');
  assert.deepEqual(args, ['run-daemon.mjs', 'run']);
  assert.equal(child.unrefed, true);
}));

test('daemon children: repo cwd, hidden, an IPC channel only for workers, output to log and capture', async () => {
  const { spawnImpl, calls } = fakeSpawnImpl();
  const logs = {};
  const spawnChild = createChildSpawner({
    repoRoot: 'E:\\repo', toolsDir: 'E:\\repo\\tools\\ia-loop', env: { PATH: 'x' }, childEnv: { [DAEMON_CHILD_ENV]: '1' },
    logFor: (name) => ({ write: (text) => { logs[name] = (logs[name] ?? '') + text; } }),
    spawnImpl, execPath: 'node.exe', closeGraceMs: 10,
  });
  let captured = '';
  const worker = spawnChild('developer', 'workers/developer.mjs', [], { ipc: true });
  const auto = spawnChild('run-auto', 'run-auto.mjs', ['--from', '094'], { onOutput: (text) => { captured += text; } });

  assert.equal(calls[0].options.cwd, 'E:\\repo');
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.detached, undefined, 'not detached: children die with the daemon');
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe', 'ipc']);
  assert.deepEqual(calls[1].options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(calls[0].options.env[DAEMON_CHILD_ENV], '1');
  assert.equal(calls[0].args[0], join('E:\\repo\\tools\\ia-loop', 'workers/developer.mjs'));

  calls[1].child.stdout.emit('data', Buffer.from('Goal 094 needs a human: X\n'));
  assert.equal(captured, 'Goal 094 needs a human: X\n');
  assert.equal(logs['run-auto'], 'Goal 094 needs a human: X\n');

  assert.equal(worker.send('IA_LOOP_DAEMON_SHUTDOWN'), true);
  assert.deepEqual(calls[0].child.sent, ['IA_LOOP_DAEMON_SHUTDOWN']);

  // 'exit' without 'close' (a grandchild holds the pipe) still settles.
  calls[1].child.emit('exit', 1, null);
  assert.deepEqual(await auto.exited, { code: 1, signal: null });
});

// --- Lock, start, stop, resume ------------------------------------------------

test('a second start reports the running daemon and exits 0 without launching', () => withStateDir(async (dir) => {
  const leaseStore = createLeaseStore(dir);
  const held = await acquireWorkerIdentity({ leaseStore, role: DAEMON_LEASE_ROLE, inspector: inspectorWith() });
  assert.equal(held.acquired, true);

  const { out, text } = collect();
  let launched = false;
  const code = await startCommand({ stateDir: dir, inspector: inspectorWith(LIVENESS.ALIVE), launch: () => { launched = true; }, out });
  assert.equal(code, 0);
  assert.equal(launched, false);
  assert.match(text(), new RegExp(`already running: pid ${process.pid}`));
}));

test('start launches detached and confirms once the daemon holds its lease', () => withStateDir(async (dir) => {
  const leaseStore = createLeaseStore(dir);
  const { out, text } = collect();
  const code = await startCommand({
    stateDir: dir,
    inspector: inspectorWith(),
    launch: () => ({ pid: process.pid }),
    // The "daemon" takes its lease while start polls.
    wait: async () => { await acquireWorkerIdentity({ leaseStore, role: DAEMON_LEASE_ROLE, inspector: inspectorWith() }); },
    out,
  });
  assert.equal(code, 0);
  assert.match(text(), /daemon started/);
  assert.match(text(), /Logs: .*daemon/);
}));

test('a lease whose pid is gone is not a running daemon', async () => {
  const lease = { pid: 999_999, heartbeatAt: new Date().toISOString(), acquiredAt: new Date().toISOString(), bootAt: new Date().toISOString() };
  assert.equal((await judgeDaemonLease({ lease, inspector: inspectorWith(LIVENESS.GONE) })).running, false);
  assert.equal((await judgeDaemonLease({ lease, inspector: inspectorWith(LIVENESS.ALIVE) })).running, true);
  assert.equal((await judgeDaemonLease({ lease: null, inspector: inspectorWith() })).running, false);
});

test('stop with no daemon running says so', () => withStateDir(async (dir) => {
  const { out, text } = collect();
  assert.equal(await stopCommand({ stateDir: dir, inspector: inspectorWith(), out }), 0);
  assert.match(text(), /not running/);
}));

test('stop writes the request and returns once the daemon released its lease', () => withStateDir(async (dir) => {
  const leaseStore = createLeaseStore(dir);
  await acquireWorkerIdentity({ leaseStore, role: DAEMON_LEASE_ROLE, inspector: inspectorWith() });
  const dstore = createDaemonStateStore(dir);
  const { out, text } = collect();
  const code = await stopCommand({
    stateDir: dir,
    inspector: inspectorWith(LIVENESS.ALIVE),
    out,
    wait: async () => {
      const requests = await dstore.takeRequests();
      assert.deepEqual(Object.keys(requests), [DAEMON_REQUESTS.STOP]);
      assert.equal(requests.stop.mode, 'graceful');
      await leaseStore.releaseWorker(DAEMON_LEASE_ROLE);
    },
  });
  assert.equal(code, 0);
  assert.match(text(), /Stopped\./);
}));

test('stop --now kills the daemon tree itself if it does not exit, then frees the lock', () => withStateDir(async (dir) => {
  const leaseStore = createLeaseStore(dir);
  await acquireWorkerIdentity({ leaseStore, role: DAEMON_LEASE_ROLE, inspector: inspectorWith() });
  let t = 0;
  let killed = null;
  let alive = true;
  const inspector = { ...inspectorWith(), exists: () => (alive ? LIVENESS.ALIVE : LIVENESS.GONE) };
  const code = await stopCommand({
    stateDir: dir, now: true, inspector, graceMs: 1_000, pollMs: 500,
    wait: async (ms) => { t += ms; }, clockNow: () => t,
    killTree: async (pid) => { killed = pid; alive = false; },
    out: () => {},
  });
  assert.equal(code, 0);
  assert.equal(killed, process.pid);
  assert.equal(await leaseStore.readWorkerLease(DAEMON_LEASE_ROLE), null, 'the dead daemon lease is retired');
}));

test('resume is recorded as a request, even before the daemon starts', () => withStateDir(async (dir) => {
  const { out, text } = collect();
  await resumeCommand({ stateDir: dir, from: '094', resolved: 'resolvido', inspector: inspectorWith(), out });
  const body = JSON.parse(await readFile(createDaemonStateStore(dir).paths.request(DAEMON_REQUESTS.RESUME), 'utf8'));
  assert.equal(body.from, '094');
  assert.equal(body.resolved, 'resolvido');
  assert.match(text(), /not running/);
}));

test('a request is acted on once', () => withStateDir(async (dir) => {
  const dstore = createDaemonStateStore(dir);
  await dstore.writeRequest(DAEMON_REQUESTS.STOP, { mode: 'now' });
  assert.equal((await dstore.takeRequests()).stop.mode, 'now');
  assert.deepEqual(await dstore.takeRequests(), {});
}));

// --- Status -------------------------------------------------------------------

test('status: not running, with the command that starts it', () => {
  const lines = renderDaemonStatus({ lease: null, snapshot: { stoppedAt: '2026-10-03T10:00:00.000Z', stopMode: 'graceful' } });
  assert.match(lines.join('\n'), /State: NOT RUNNING/);
  assert.match(lines.join('\n'), /npm run ia-loop:start/);
  assert.match(lines.join('\n'), /Last stopped: 2026-10-03T10:00:00.000Z \(graceful\)/);
});

test('status: pid, uptime, children, restarts, last incident and memory', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const lease = { pid: 77, acquiredAt: '2026-10-03T10:00:00.000Z', heartbeatAt: '2026-10-03T11:59:58.000Z', expiresAt: '2026-10-03T12:01:28.000Z' };
  const snapshot = {
    children: [
      { name: 'developer', pid: 101, startedAt: '2026-10-03T11:00:00.000Z', restarts: 2, lastExit: { name: 'CODE_CHANGED' } },
      { name: 'tech-lead', pid: null, nextStartAt: '2026-10-03T12:00:30.000Z', restarts: 1 },
      { name: 'run-auto', pid: 103, startedAt: '2026-10-03T11:30:00.000Z', restarts: 0 },
    ],
    memory: { percent: 71.25, at: '2026-10-03T11:59:00.000Z' },
    docker: { ready: true, detail: 'docker up' },
    lastIncident: { kind: 'GOAL_GIT_TRANSIENT', goal: '072', outcome: 'RETRIED', at: '2026-10-03T11:10:00.000Z' },
    logDir: 'E:\\x\\.state\\daemon',
  };
  const text = renderDaemonStatus({ lease, snapshot, now }).join('\n');
  assert.match(text, /State: RUNNING/);
  assert.match(text, /Pid: 77 · up 2h 0m/);
  assert.match(text, /developer: pid 101, up 1h 0m · restarts 2 · last exit CODE_CHANGED/);
  assert.match(text, /tech-lead: down, restart at 2026-10-03T12:00:30.000Z · restarts 1/);
  assert.match(text, /run-auto: pid 103/);
  assert.match(text, /Memory committed: 71\.3%/);
  assert.match(text, /Last incident: GOAL_GIT_TRANSIENT Goal 072 → RETRIED/);
  assert.match(text, /Logs: E:\\x\\.state\\daemon/);
});
