/**
 * V37 — the daemon's rules, driven tick by tick.
 *
 * Every child is a fake: a "worker" is an object the test makes exit with a
 * given code, a "run-auto" is a function that writes what the real one would
 * leave in autonomous-run.json. The clock is fake, the state directory is a
 * temp dir, and nothing here starts a process, Docker or a toast.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAutonomousStore, LOOP_LEASE_KEY } from '../lib/autonomous-state.mjs';
import { createFakeClock } from '../lib/clock.mjs';
import { createDaemon, crashLoopVerdict, workerRestartPlan } from '../lib/daemon.mjs';
import { readDaemonConfig } from '../lib/daemon-config.mjs';
import { DAEMON_REQUESTS, createDaemonStateStore } from '../lib/daemon-state.mjs';
import {
  ATTACH_HOLDS, DAEMON_EVENTS, DAEMON_INCIDENTS, DAEMON_PAUSE_OWNERS, DAEMON_SHUTDOWN_MESSAGE,
} from '../lib/daemon-vocabulary.mjs';
import { createJobStore } from '../lib/job-store.mjs';
import { createLeaseStore } from '../lib/leases.mjs';
import { LIVENESS } from '../lib/process-inspector.mjs';
import { writeHeartbeat } from '../lib/worker-registry.mjs';
import { WORKER_EXIT } from '../lib/worker-exit.mjs';

const BASE_ENV = Object.freeze({
  IA_LOOP_DAEMON_DOCKER: '0',
  IA_LOOP_DAEMON_MEMORY: '0',
  IA_LOOP_DAEMON_SWEEP: '0',
});

const GOAL_GIT_RACE = `
Blocker: [GIT_FAILED] git worktree add -b failed: Command failed: git worktree add -b ai-loop/goal-072 .ai-worktrees/goal-072 a0dc3bf
error: unable to stat just-written file apps/x.go: No such file or directory
fatal: Could not reset index file to revision 'HEAD'.

Goal 072 needs a human: UNKNOWN_FATAL
`;

async function withStateDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-daemon-core-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

/** Polls (in real time, briefly) until the daemon's background work shows. */
async function waitFor(predicate, what = 'condition') {
  for (let i = 0; i < 400; i += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => { setTimeout(resolve, 5); });
  }
  assert.fail(`timed out waiting for ${what}`);
}

/**
 * One daemon over a temp state dir. `behaviours[name]` runs when a child of
 * that name is spawned (run-auto, run-recover, run-close); workers just stay
 * up until the test ends them.
 */
function harness(dir, {
  env = {}, behaviours = {}, probeMemory, ensureDocker, git, clock = createFakeClock(Date.parse('2026-10-03T12:00:00Z')),
} = {}) {
  const config = readDaemonConfig({ ...BASE_ENV, ...env });
  const spawned = [];
  const killed = [];
  const notes = [];
  let nextPid = 5000;

  const spawnChild = (name, script, args, opts = {}) => {
    let resolveExit;
    const exited = new Promise((resolve) => { resolveExit = resolve; });
    const child = {
      name, script, args, opts, pid: nextPid++, exited, sent: [], alive: true,
      exit(code = 0) {
        if (!child.alive) return;
        child.alive = false;
        resolveExit({ code, signal: null });
      },
      output(text) { opts.onOutput?.(text); },
      send(message) {
        child.sent.push(message);
        if (message === DAEMON_SHUTDOWN_MESSAGE) child.exit(0);
        return true;
      },
    };
    spawned.push(child);
    if (behaviours[name]) {
      queueMicrotask(() => {
        Promise.resolve(behaviours[name](child)).catch((error) => { child.output(String(error)); child.exit(99); });
      });
    }
    return child;
  };

  const inspector = {
    exists: (pid) => (spawned.find((c) => c.pid === pid)?.alive === false ? LIVENESS.GONE : LIVENESS.ALIVE),
  };

  const daemon = createDaemon({
    config,
    stateDir: dir,
    repoRoot: 'E:\\repo',
    clock,
    spawnChild,
    inspector,
    killTree: async (pid) => { killed.push(pid); spawned.find((c) => c.pid === pid)?.exit(1); return true; },
    notifier: async (note) => { notes.push(note); return { shown: true }; },
    probeMemory,
    ensureDocker,
    git: git ?? (async (args) => ({ code: 0, stdout: args[0] === 'rev-list' ? '0\n' : '', stderr: '' })),
    pathExists: async () => false,
  });

  const store = createJobStore(dir);
  return {
    daemon,
    clock,
    config,
    spawned,
    killed,
    notes,
    store,
    auto: createAutonomousStore(dir),
    dstore: createDaemonStateStore(dir),
    live: (name) => spawned.filter((c) => c.name === name && c.alive),
    all: (name) => spawned.filter((c) => c.name === name),
    events: async (type) => (await store.readEvents()).filter((e) => !type || e.type === type),
  };
}

async function healthyWorkers(dir) {
  const store = createJobStore(dir);
  for (const role of ['developer', 'tech_lead']) {
    await writeHeartbeat(store, role, { state: 'IDLE', model: 'fake', sessionStrategy: 'STATELESS' });
  }
}

async function writeRun(dir, over = {}) {
  return createAutonomousStore(dir).write({
    autonomousRunId: 'auto-1', status: 'RUNNING', currentGoal: '072', pauseRequested: false, pauseAfterGoal: false, ...over,
  });
}

/** A lease file as the given holder would have left it. */
async function writeLease(dir, kind, key, fields) {
  const path = join(dir, 'leases', kind, `${key}.lock`);
  await mkdir(join(dir, 'leases', kind), { recursive: true });
  const now = Date.now();
  await writeFile(path, `${JSON.stringify({
    kind: kind === 'jobs' ? 'job' : 'worker', key, version: 1, status: 'ACTIVE', workerInstanceId: 'other-instance',
    acquiredAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 90_000).toISOString(), ...fields,
  }, null, 2)}\n`, 'utf8');
}

/** What a run-auto leaves behind when it stops for a person. */
function stopsForHuman(dir, { reason = 'UNKNOWN_FATAL', output = GOAL_GIT_RACE, pauseRequested = false } = {}) {
  let n = 0;
  return async (child) => {
    n += 1;
    await writeRun(dir, {
      status: 'PAUSED_FOR_HUMAN', pauseRequested,
      humanRequired: { reason, detail: null, at: new Date(Date.parse('2026-10-03T12:00:00Z') + n * 1000).toISOString() },
    });
    child.output(output);
    child.exit(1);
  };
}

// --- Pure rules ------------------------------------------------------------------

test('restart plan: CODE_CHANGED fast, IDENTITY_CONFLICT after the lease can expire, crashes back off', () => {
  const config = readDaemonConfig({});
  assert.deepEqual(
    [WORKER_EXIT.CODE_CHANGED, WORKER_EXIT.IDENTITY_CONFLICT, WORKER_EXIT.OK].map((code) => {
      const { delayMs, crash } = workerRestartPlan(code, { consecutiveCrashes: 0, config });
      return [delayMs, crash];
    }),
    [[1_000, false], [config.workers.identityRetryMs, false], [config.workers.restartBaseMs, false]],
  );
  const delays = [1, 2, 3, 10].map((n) => workerRestartPlan(WORKER_EXIT.CRASH, { consecutiveCrashes: n, config }).delayMs);
  assert.deepEqual(delays, [5_000, 10_000, 20_000, config.workers.restartMaxMs]);
  assert.equal(crashLoopVerdict([1, 2, 100], { now: 101, limit: 2, windowMs: 50 }).exhausted, false);
  assert.equal(crashLoopVerdict([60, 70, 100], { now: 101, limit: 3, windowMs: 50 }).exhausted, true);
});

// --- Workers ---------------------------------------------------------------------

test('both workers start with an IPC channel and come back after CODE_CHANGED', () => withStateDir(async (dir) => {
  const h = harness(dir);
  await h.daemon.start();
  await h.daemon.tick();
  assert.deepEqual(h.spawned.map((c) => [c.name, c.opts.ipc]), [['developer', true], ['tech-lead', true]]);

  h.live('developer')[0].exit(WORKER_EXIT.CODE_CHANGED);
  await h.daemon.settle();
  await h.daemon.tick();
  assert.equal(h.live('developer').length, 0, 'not before its delay');
  h.clock.advance(1_000);
  await h.daemon.tick();
  assert.equal(h.live('developer').length, 1);
  const exitedEvent = (await h.events(DAEMON_EVENTS.CHILD_EXITED))[0];
  assert.equal(exitedEvent.name, 'CODE_CHANGED');
  assert.equal(h.daemon.state.children.find((c) => c.name === 'developer').restarts, 1);
}));

test('IDENTITY_CONFLICT waits for the role lease to be able to expire', () => withStateDir(async (dir) => {
  const h = harness(dir);
  await h.daemon.start();
  await h.daemon.tick();
  h.live('tech-lead')[0].exit(WORKER_EXIT.IDENTITY_CONFLICT);
  await h.daemon.settle();
  h.clock.advance(h.config.workers.identityRetryMs - 1);
  await h.daemon.tick();
  assert.equal(h.live('tech-lead').length, 0);
  h.clock.advance(1);
  await h.daemon.tick();
  assert.equal(h.live('tech-lead').length, 1);
}));

test('crashes back off, and a crash loop is announced and cooled down', () => withStateDir(async (dir) => {
  const h = harness(dir, { env: { IA_LOOP_DAEMON_CRASH_LIMIT: '3' } });
  await h.daemon.start();
  await h.daemon.tick();

  for (const delay of [5_000, 10_000]) {
    h.live('developer')[0].exit(WORKER_EXIT.CRASH);
    await h.daemon.settle();
    h.clock.advance(delay - 1);
    await h.daemon.tick();
    assert.equal(h.live('developer').length, 0, `still backing off before ${delay}ms`);
    h.clock.advance(1);
    await h.daemon.tick();
    assert.equal(h.live('developer').length, 1);
  }

  h.live('developer')[0].exit(WORKER_EXIT.CRASH);
  await h.daemon.settle();
  const [loopEvent] = await h.events(DAEMON_EVENTS.WORKER_CRASH_LOOP);
  assert.equal(loopEvent.child, 'developer');
  assert.equal(loopEvent.crashes, 3);
  assert.match(h.notes.at(-1).title, /developer em crash loop/);

  h.clock.advance(h.config.workers.crashLoopCooldownMs - 1);
  await h.daemon.tick();
  assert.equal(h.live('developer').length, 0, 'cooling down');
  h.clock.advance(1);
  await h.daemon.tick();
  assert.equal(h.live('developer').length, 1);
  assert.equal(h.live('tech-lead').length, 1, 'the other worker was never touched');
}));

test('the role lease of a worker the daemon saw die is retired, so the next one starts at once', () => withStateDir(async (dir) => {
  const h = harness(dir);
  const leases = createLeaseStore(dir);
  await h.daemon.start();
  await h.daemon.tick();
  const developer = h.live('developer')[0];
  await writeLease(dir, 'workers', 'developer', { role: 'developer', pid: developer.pid });
  // A lease that names someone else is never touched.
  await writeLease(dir, 'workers', 'tech_lead', { role: 'tech_lead', pid: 1 });

  developer.exit(WORKER_EXIT.CRASH);
  h.live('tech-lead')[0].exit(WORKER_EXIT.CRASH);
  await h.daemon.settle();
  assert.equal(await leases.readWorkerLease('developer'), null);
  assert.notEqual(await leases.readWorkerLease('tech_lead'), null);
}));

// --- Attaching -------------------------------------------------------------------

test('a RUNNING run is attached with no arguments, and a worker dying does not touch it', () => withStateDir(async (dir) => {
  await writeRun(dir);
  await healthyWorkers(dir);
  const h = harness(dir);
  await h.daemon.start();
  await h.daemon.tick();
  await waitFor(() => h.live('run-auto').length === 1, 'run-auto');
  assert.deepEqual(h.live('run-auto')[0].args, []);
  assert.equal(h.live('run-auto')[0].opts.ipc, false);

  h.live('developer')[0].exit(WORKER_EXIT.CRASH);
  // settle() would wait for run-auto too, which never exits here.
  const developerState = () => h.daemon.state.children.find((c) => c.name === 'developer');
  await waitFor(() => developerState().lastExit && developerState().nextStartAt, 'the restart plan');
  h.clock.advance(5_000);
  await h.daemon.tick();
  await h.daemon.tick();
  assert.equal(h.all('run-auto').length, 1, 'never a second run-auto');
  assert.equal(h.live('run-auto').length, 1);
  assert.equal(h.killed.length, 0);
  await waitFor(() => h.live('developer').length === 1, 'developer back');
}));

test('a run with no healthy workers is not attached', () => withStateDir(async (dir) => {
  await writeRun(dir);
  const h = harness(dir);
  await h.daemon.start();
  await h.daemon.tick();
  assert.equal(h.all('run-auto').length, 0);
  assert.match(h.daemon.state.attachHold, new RegExp(ATTACH_HOLDS.WORKERS_NOT_HEALTHY));
}));

test('PAUSED is never attached until a resume is asked for', () => withStateDir(async (dir) => {
  await writeRun(dir, { status: 'PAUSED', pauseRequested: true, pauseReason: 'operator' });
  await healthyWorkers(dir);
  const h = harness(dir);
  await h.daemon.start();
  await h.daemon.tick();
  await h.daemon.tick();
  assert.equal(h.all('run-auto').length, 0);
  assert.match(h.daemon.state.attachHold, new RegExp(ATTACH_HOLDS.RUN_PAUSED));

  await h.dstore.writeRequest(DAEMON_REQUESTS.RESUME, {});
  await h.daemon.tick();
  await waitFor(() => h.live('run-auto').length === 1, 'run-auto');
  assert.ok((await h.events(DAEMON_EVENTS.RESUMED)).length);
}));

test('RUNNING with a pause requested is held, the operator is told once, and a resume clears it', () => withStateDir(async (dir) => {
  await writeRun(dir, { pauseRequested: true });
  await healthyWorkers(dir);
  const h = harness(dir);
  await h.daemon.start();
  await h.daemon.tick();
  await h.daemon.tick();
  assert.equal(h.all('run-auto').length, 0);
  assert.equal(h.notes.filter((n) => /pausa pedida/.test(n.title)).length, 1);

  await h.dstore.writeRequest(DAEMON_REQUESTS.RESUME, {});
  await h.daemon.tick();
  await waitFor(() => h.live('run-auto').length === 1, 'run-auto');
  assert.equal((await h.auto.read()).pauseRequested, false);
}));

test('a live loop lease means another orchestrator: the daemon does not attach beside it', () => withStateDir(async (dir) => {
  await writeRun(dir);
  await healthyWorkers(dir);
  await writeLease(dir, 'jobs', LOOP_LEASE_KEY, { jobId: LOOP_LEASE_KEY, pid: 1 });
  const h = harness(dir);
  await h.daemon.start();
  await h.daemon.tick();
  assert.equal(h.spawned.filter((c) => c.name.startsWith('run-')).length, 0);
  assert.match(h.daemon.state.attachHold, new RegExp(ATTACH_HOLDS.ORCHESTRATOR_ELSEWHERE));
}));

test('a stale loop lease (reboot, crash) goes through run-recover before the attach', () => withStateDir(async (dir) => {
  await writeRun(dir);
  await healthyWorkers(dir);
  const old = new Date(Date.now() - 3_600_000).toISOString();
  await writeLease(dir, 'jobs', LOOP_LEASE_KEY, { jobId: LOOP_LEASE_KEY, pid: 1, heartbeatAt: old, expiresAt: old });
  const h = harness(dir, {
    behaviours: {
      'run-recover': async (child) => {
        await rm(join(dir, 'leases', 'jobs', `${LOOP_LEASE_KEY}.lock`), { force: true });
        child.exit(0);
      },
    },
  });
  await h.daemon.start();
  await h.daemon.tick();
  await h.daemon.settle();
  assert.equal(h.all('run-recover').length, 1);
  assert.equal(h.all('run-auto').length, 0, 'not in the same breath as the recovery');

  await h.daemon.tick();
  await waitFor(() => h.live('run-auto').length === 1, 'run-auto');
  assert.deepEqual(h.spawned.filter((c) => c.name.startsWith('run-')).map((c) => c.name), ['run-recover', 'run-auto']);
  assert.ok((await h.events(DAEMON_EVENTS.RECOVERY_FINISHED)).length);
}));

test('Docker not ready holds the attach; once it is up the loop attaches', () => withStateDir(async (dir) => {
  await writeRun(dir);
  await healthyWorkers(dir);
  let up = false;
  const h = harness(dir, {
    env: { IA_LOOP_DAEMON_DOCKER: '1' },
    ensureDocker: async () => (up ? { ready: true, stage: 'READY', detail: 'ok' } : { ready: false, stage: 'DOCKER_INFO', detail: 'docker down' }),
  });
  await h.daemon.start();
  await h.daemon.tick();
  await h.daemon.settle();
  await h.daemon.tick();
  assert.equal(h.all('run-auto').length, 0);
  assert.match(h.daemon.state.attachHold, new RegExp(ATTACH_HOLDS.DOCKER_NOT_READY));
  assert.equal(h.notes.filter((n) => /Docker/.test(n.title)).length, 1);

  up = true;
  h.clock.advance(h.config.docker.checkIntervalMs);
  await h.daemon.tick();
  await waitFor(() => h.daemon.state.docker.ready, 'Docker ready');
  await h.daemon.tick();
  await waitFor(() => h.live('run-auto').length === 1, 'run-auto');
  assert.ok((await h.events(DAEMON_EVENTS.DOCKER_READY)).length);
}));

// --- Stops for a person ------------------------------------------------------------

test('a catalogued stop is remedied and retried with --from --resolved, up to its limit', () => withStateDir(async (dir) => {
  await writeRun(dir);
  await healthyWorkers(dir);
  const gitCalls = [];
  const h = harness(dir, {
    behaviours: { 'run-auto': stopsForHuman(dir) },
    git: async (args) => { gitCalls.push(args.join(' ')); return { code: 0, stdout: args[0] === 'rev-list' ? '0\n' : '', stderr: '' }; },
  });
  await h.daemon.start();

  for (let i = 0; i < 6; i += 1) {
    await h.daemon.tick();
    await h.daemon.settle();
  }

  const autos = h.all('run-auto');
  assert.equal(autos.length, 4, 'the first attach and three retries');
  assert.deepEqual(autos[0].args, []);
  for (const retry of autos.slice(1)) {
    assert.deepEqual(retry.args.slice(0, 3), ['--from', '072', '--resolved']);
    assert.match(retry.args[3], /GOAL_GIT_TRANSIENT/);
  }
  assert.equal(gitCalls.filter((c) => c === 'branch -D ai-loop/goal-072').length, 3);
  assert.equal((await h.events(DAEMON_EVENTS.INCIDENT_RETRY)).length, 3);
  const [limit] = await h.events(DAEMON_EVENTS.INCIDENT_LIMIT_REACHED);
  assert.equal(limit.kind, DAEMON_INCIDENTS.GOAL_GIT_TRANSIENT);
  assert.equal(h.notes.filter((n) => /precisa de você/.test(n.title)).length, 1);
  assert.match(h.daemon.state.attachHold, new RegExp(ATTACH_HOLDS.HUMAN_REQUIRED));
}));

test('a stop outside the catalogue goes to the operator, once', () => withStateDir(async (dir) => {
  await writeRun(dir);
  await healthyWorkers(dir);
  const h = harness(dir, {
    behaviours: { 'run-auto': stopsForHuman(dir, { reason: 'POLICY_VIOLATION', output: 'Goal 072 needs a human: POLICY_VIOLATION\n' }) },
  });
  await h.daemon.start();
  for (let i = 0; i < 4; i += 1) {
    await h.daemon.tick();
    await h.daemon.settle();
  }
  assert.equal(h.all('run-auto').length, 1);
  assert.equal(h.notes.filter((n) => /precisa de você/.test(n.title)).length, 1);
  assert.equal((await h.events(DAEMON_EVENTS.HUMAN_REQUIRED)).length, 1);
  assert.equal((await h.events(DAEMON_EVENTS.INCIDENT_RETRY)).length, 0);
}));

test('a PAUSED_FOR_HUMAN found at start, and resolved by the operator through the daemon', () => withStateDir(async (dir) => {
  await writeRun(dir, { status: 'PAUSED_FOR_HUMAN', humanRequired: { reason: 'PRODUCT_DECISION', at: '2026-10-03T11:00:00.000Z' } });
  await healthyWorkers(dir);
  const h = harness(dir);
  await h.daemon.start();
  await h.daemon.tick();
  assert.equal(h.all('run-auto').length, 0);
  assert.equal(h.notes.length, 1);

  await h.dstore.writeRequest(DAEMON_REQUESTS.RESUME, { from: '073', resolved: 'decidido pelo PO' });
  await h.daemon.tick();
  await waitFor(() => h.live('run-auto').length === 1, 'run-auto');
  assert.deepEqual(h.live('run-auto')[0].args, ['--from', '073', '--resolved', 'decidido pelo PO']);
}));

test('a catalogued stop under a requested pause is held, and remedied only after the resume', () => withStateDir(async (dir) => {
  await writeRun(dir);
  await healthyWorkers(dir);
  const gitCalls = [];
  const h = harness(dir, {
    behaviours: { 'run-auto': stopsForHuman(dir, { pauseRequested: true }) },
    git: async (args) => { gitCalls.push(args.join(' ')); return { code: 0, stdout: args[0] === 'rev-list' ? '0\n' : '', stderr: '' }; },
  });
  await h.daemon.start();
  await h.daemon.tick();
  await h.daemon.settle();
  await h.daemon.tick();
  assert.equal(gitCalls.length, 0, 'the remedy waits for the pause');
  assert.equal(h.all('run-auto').length, 1);
  assert.equal((await h.events(DAEMON_EVENTS.INCIDENT_HELD)).length, 1);
  assert.match(h.daemon.state.attachHold, new RegExp(ATTACH_HOLDS.PAUSE_REQUESTED));

  await h.dstore.writeRequest(DAEMON_REQUESTS.RESUME, {});
  await h.daemon.tick();
  await h.daemon.settle();
  assert.equal((await h.auto.read()).pauseRequested, false);
  assert.ok(gitCalls.includes('branch -D ai-loop/goal-072'));
  await h.daemon.tick();
  await waitFor(() => h.all('run-auto').length === 2, 'the retry');
  assert.deepEqual(h.all('run-auto')[1].args.slice(0, 2), ['--from', '072']);
  await h.daemon.settle();
}));

// --- Memory ----------------------------------------------------------------------

const MEMORY_ENV = Object.freeze({
  IA_LOOP_DAEMON_MEMORY: '1', IA_LOOP_DAEMON_MEMORY_INTERVAL_MS: '1', IA_LOOP_DAEMON_MEMORY_CLEAR_AFTER_MS: '60000',
});

test('high memory requests a pause the daemon owns; low memory for long enough withdraws it and resumes', () => withStateDir(async (dir) => {
  await writeRun(dir);
  await healthyWorkers(dir);
  let percent = 96;
  const h = harness(dir, { env: MEMORY_ENV, probeMemory: async () => ({ percent }) });
  await h.daemon.start();
  await h.daemon.tick();
  assert.equal((await h.auto.read()).pauseRequested, true);
  assert.equal(h.all('run-auto').length, 0, 'not attached into a memory peak');
  assert.equal(h.daemon.state.ownedPause.by, DAEMON_PAUSE_OWNERS.MEMORY);
  assert.equal((await h.events(DAEMON_EVENTS.MEMORY_PAUSE_REQUESTED)).length, 1);

  // run-auto (elsewhere) reached the boundary.
  await h.auto.markPaused('pause requested');
  percent = 90;
  h.clock.advance(120_000);
  await h.daemon.tick();
  assert.equal(h.daemon.state.ownedPause.by, DAEMON_PAUSE_OWNERS.MEMORY, 'between thresholds: kept');

  percent = 70;
  h.clock.advance(1);
  await h.daemon.tick();
  h.clock.advance(59_999);
  await h.daemon.tick();
  assert.notEqual(h.daemon.state.ownedPause, null, 'not low for long enough yet');
  h.clock.advance(1);
  await h.daemon.tick();
  assert.equal(h.daemon.state.ownedPause, null);
  assert.equal((await h.events(DAEMON_EVENTS.MEMORY_PAUSE_CLEARED)).length, 1);
  await waitFor(() => h.live('run-auto').length === 1, 'the resume');
}));

test('an operator pause is never withdrawn by the memory rule', () => withStateDir(async (dir) => {
  await writeRun(dir);
  let percent = 96;
  const h = harness(dir, { env: MEMORY_ENV, probeMemory: async () => ({ percent }) });
  await h.daemon.start();
  await h.daemon.tick();
  assert.equal(h.daemon.state.ownedPause.by, DAEMON_PAUSE_OWNERS.MEMORY);

  // The operator asks for a pause too: from now on it is theirs.
  await h.store.appendEvent({ type: 'AUTONOMOUS_RUN_PAUSE_REQUESTED', afterGoal: false });
  h.clock.advance(1);
  await h.daemon.tick();
  assert.equal(h.daemon.state.ownedPause, null);
  assert.equal((await h.events(DAEMON_EVENTS.PAUSE_HANDED_TO_OPERATOR)).length, 1);

  percent = 50;
  h.clock.advance(1);
  await h.daemon.tick();
  h.clock.advance(120_000);
  await h.daemon.tick();
  assert.equal((await h.auto.read()).pauseRequested, true);
  assert.equal((await h.events(DAEMON_EVENTS.MEMORY_PAUSE_CLEARED)).length, 0);
}));

test('a pause already requested when memory peaks is not taken over', () => withStateDir(async (dir) => {
  await writeRun(dir, { pauseRequested: true });
  const h = harness(dir, { env: MEMORY_ENV, probeMemory: async () => ({ percent: 99 }) });
  await h.daemon.start();
  await h.daemon.tick();
  assert.equal(h.daemon.state.ownedPause, null);
  assert.equal((await h.events(DAEMON_EVENTS.MEMORY_HIGH)).length, 1);
}));

// --- Stopping --------------------------------------------------------------------

test('a graceful stop pauses at the boundary, asks the workers to stop, and the next start resumes', () => withStateDir(async (dir) => {
  await writeRun(dir);
  await healthyWorkers(dir);
  const h = harness(dir);
  await h.daemon.start();
  await h.daemon.tick();
  await waitFor(() => h.live('run-auto').length === 1, 'run-auto');

  await h.dstore.writeRequest(DAEMON_REQUESTS.STOP, { mode: 'graceful' });
  await h.daemon.tick();
  assert.equal((await h.auto.read()).pauseRequested, true);
  assert.equal(h.daemon.state.ownedPause.by, DAEMON_PAUSE_OWNERS.STOP);
  assert.equal(h.daemon.stopped, false, 'run-auto has not reached the boundary yet');
  assert.match(h.daemon.state.stopBlockers.join('\n'), /run-auto is still running/);

  // run-auto reaches the boundary and leaves.
  await h.auto.markPaused('pause requested');
  h.live('run-auto')[0].exit(0);
  await h.daemon.settle();
  await h.daemon.tick();
  assert.deepEqual(await h.daemon.done, { mode: 'graceful' });
  for (const name of ['developer', 'tech-lead']) assert.deepEqual(h.all(name)[0].sent, [DAEMON_SHUTDOWN_MESSAGE]);
  assert.equal(h.killed.length, 0, 'everyone left when asked');
  assert.equal(h.spawned.filter((c) => c.alive).length, 0);
  assert.equal((await h.dstore.readSnapshot()).stopMode, 'graceful');
  assert.equal(h.notes.length, 0, 'the daemon’s own pause is not announced as a pause');

  // The next start withdraws the pause the stop asked for and re-attaches.
  const next = harness(dir);
  await next.daemon.start();
  assert.equal(next.daemon.state.ownedPause, null);
  await next.daemon.tick();
  await waitFor(() => next.live('run-auto').length === 1, 'run-auto after restart');
}));

test('stop --now kills every tree and leaves the leases for recovery', () => withStateDir(async (dir) => {
  await writeRun(dir);
  await healthyWorkers(dir);
  const h = harness(dir);
  await h.daemon.start();
  await h.daemon.tick();
  await waitFor(() => h.live('run-auto').length === 1, 'run-auto');
  const developer = h.live('developer')[0];
  await writeLease(dir, 'workers', 'developer', { role: 'developer', pid: developer.pid });

  await h.dstore.writeRequest(DAEMON_REQUESTS.STOP, { mode: 'now' });
  await h.daemon.tick();
  assert.deepEqual(await h.daemon.done, { mode: 'now' });
  assert.equal(h.killed.length, 3);
  assert.equal(h.spawned.filter((c) => c.alive).length, 0);
  assert.notEqual(await createLeaseStore(dir).readWorkerLease('developer'), null, 'left for recover');
  assert.equal((await h.auto.read()).pauseRequested, false, 'no pause was asked for');
}));
