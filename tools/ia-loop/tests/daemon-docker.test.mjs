/**
 * V37 — Docker before the loop: start Docker Desktop, then the stale-socket
 * fix, then the containers, each step only when the previous one did not
 * work. Every command goes through a fake runner; nothing here can touch
 * Docker, a process or a directory of this machine.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureDocker, staleSocketDirs, staleSuffix } from '../lib/daemon-docker.mjs';
import { DAEMON_EVENTS } from '../lib/daemon-vocabulary.mjs';
import { createFakeClock } from '../lib/clock.mjs';

const CONFIG = Object.freeze({
  desktopPath: 'C:\\Docker Desktop.exe', startTimeoutMs: 60_000, containers: ['atendly_postgres_dev'],
  healthTimeoutMs: 60_000, pollMs: 5_000,
});

/** A fake machine: `docker info` answers per the script, containers per their state. */
function fakeMachine({ infoOk = () => true, container = 'running healthy', startedContainer = 'running healthy' } = {}) {
  const calls = [];
  const renamed = [];
  let starts = 0;
  let fixed = false;
  let containerState = container;
  const run = async (command, args) => {
    calls.push(`${command} ${args.join(' ')}`);
    if (command === 'docker' && args[0] === 'info') {
      const ok = infoOk({ starts, fixed });
      return { code: ok ? 0 : 1, stdout: '', stderr: ok ? '' : 'error during connect' };
    }
    if (command === 'docker' && args[0] === 'inspect') {
      if (containerState === null) return { code: 1, stdout: '', stderr: 'No such object' };
      return { code: 0, stdout: `${containerState}\n`, stderr: '' };
    }
    if (command === 'docker' && args[0] === 'start') {
      containerState = startedContainer;
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  return {
    calls,
    renamed,
    run,
    startDesktop: async () => { starts += 1; },
    renamePath: async (from, to) => { renamed.push([from, to]); fixed = true; },
    pathExists: async () => true,
    get starts() { return starts; },
  };
}

async function ensure(machine, over = {}) {
  const events = [];
  const result = await ensureDocker({
    config: CONFIG,
    run: machine.run,
    startDesktop: machine.startDesktop,
    renamePath: machine.renamePath,
    pathExists: machine.pathExists,
    localAppData: 'C:\\Users\\u\\AppData\\Local',
    clock: createFakeClock(Date.parse('2026-10-03T12:00:00Z')),
    emit: async (event) => { events.push(event); },
    ...over,
  });
  return { result, events };
}

test('Docker already up and the container healthy: nothing is started', async () => {
  const machine = fakeMachine();
  const { result } = await ensure(machine);
  assert.equal(result.ready, true);
  assert.equal(machine.starts, 0);
  assert.ok(!machine.calls.some((c) => c.startsWith('taskkill')));
});

test('Docker down: Docker Desktop is started and waited for', async () => {
  const machine = fakeMachine({ infoOk: ({ starts }) => starts >= 1 });
  const { result, events } = await ensure(machine);
  assert.equal(result.ready, true);
  assert.equal(machine.starts, 1);
  assert.equal(events[0].type, DAEMON_EVENTS.DOCKER_UNAVAILABLE);
  assert.equal(machine.renamed.length, 0, 'no stale-socket fix when a start was enough');
});

test('still down after starting: the stale-socket fix stops Docker, renames both dirs aside and starts again', async () => {
  const machine = fakeMachine({ infoOk: ({ fixed, starts }) => fixed && starts >= 2 });
  const { result, events } = await ensure(machine);
  assert.equal(result.ready, true);
  assert.equal(machine.starts, 2);
  assert.ok(machine.calls.includes('taskkill /IM Docker Desktop.exe /F'));
  assert.ok(machine.calls.includes('taskkill /IM com.docker.backend.exe /F'));
  assert.deepEqual(machine.renamed.map(([from]) => from), staleSocketDirs('C:\\Users\\u\\AppData\\Local'));
  for (const [from, to] of machine.renamed) assert.match(to, new RegExp(`^${from.replace(/\\/g, '\\\\')}\\.stale-\\d{14}$`));
  assert.ok(events.some((e) => e.type === DAEMON_EVENTS.DOCKER_STALE_SOCKET_FIX));
});

test('mid-run the stale-socket fix is deferred: Docker Desktop is never killed while work may be using it', async () => {
  const machine = fakeMachine({ infoOk: () => false });
  let asked = 0;
  const { result, events } = await ensure(machine, { mayRepair: async () => { asked += 1; return false; } });
  assert.equal(asked, 1);
  assert.equal(result.ready, false);
  assert.equal(result.stage, 'REPAIR_DEFERRED');
  assert.ok(!machine.calls.some((c) => c.startsWith('taskkill')), 'no taskkill');
  assert.deepEqual(machine.renamed, [], 'no rename');
  assert.ok(events.some((e) => e.type === DAEMON_EVENTS.DOCKER_FAILED && e.stage === 'REPAIR_DEFERRED'));
});

test('still down after the fix: not ready, and the loop is not attached', async () => {
  const machine = fakeMachine({ infoOk: () => false });
  const { result, events } = await ensure(machine);
  assert.equal(result.ready, false);
  assert.equal(result.stage, 'DOCKER_INFO');
  assert.ok(events.some((e) => e.type === DAEMON_EVENTS.DOCKER_FAILED));
});

test('a stopped container is started and waited for until healthy', async () => {
  const machine = fakeMachine({ container: 'exited', startedContainer: 'running healthy' });
  const { result, events } = await ensure(machine);
  assert.equal(result.ready, true);
  assert.ok(machine.calls.includes('docker start atendly_postgres_dev'));
  assert.ok(events.some((e) => e.type === DAEMON_EVENTS.CONTAINER_STARTED));
});

test('a container without a healthcheck counts as ready once running', async () => {
  const machine = fakeMachine({ container: 'running' });
  assert.equal((await ensure(machine)).result.ready, true);
});

test('a container that never turns healthy, or does not exist, is a failure', async () => {
  const unhealthy = fakeMachine({ container: 'running starting' });
  assert.equal((await ensure(unhealthy)).result.ready, false);
  const missing = fakeMachine({ container: null });
  const { result } = await ensure(missing);
  assert.equal(result.ready, false);
  assert.match(result.detail, /does not exist/);
});

test('the stale suffix is the yyyyMMddHHmmss pause-maint.sh used', () => {
  assert.equal(staleSuffix(Date.parse('2026-10-03T04:05:06Z')), '20261003040506');
});
