/**
 * IA Loop — Docker before the loop.
 *
 * The gates need the development PostgreSQL, and after a reboot Docker
 * Desktop either is not up yet or comes up broken: `docker info` keeps
 * failing because the sockets the previous session left in
 * `%LOCALAPPDATA%\docker-secrets-engine` and `%LOCALAPPDATA%\Docker\run` are
 * stale. The operator fixed that by hand (pause-maint.sh): stop Docker
 * Desktop, rename both directories aside, start it again. This is that
 * procedure, in order, each step only when the previous one did not work:
 *
 *   1. `docker info` answers                → nothing to do
 *   2. start Docker Desktop, wait           → it was just not running
 *   3. stale-socket fix, start again, wait  → it was up but broken
 *   4. start each declared container and wait until it is healthy
 *
 * The directories are renamed to `*.stale-<timestamp>`, never deleted: if the
 * diagnosis was wrong, nothing is lost. `wsl --shutdown` is deliberately not
 * part of it — it kills every WSL distribution the person is using.
 *
 * Every command goes through the injected `run`; nothing here can touch the
 * machine in a test.
 */

import { join } from 'node:path';

import { DAEMON_EVENTS } from './daemon-vocabulary.mjs';

/** `yyyyMMddHHmmss`, the suffix pause-maint.sh used. */
export function staleSuffix(now) {
  return new Date(now).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/** The two directories the stale-socket fix moves aside. */
export function staleSocketDirs(localAppData) {
  if (!localAppData) return [];
  return [join(localAppData, 'docker-secrets-engine'), join(localAppData, 'Docker', 'run')];
}

/**
 * `running healthy`, `running` (no healthcheck), `exited`, … or null when the
 * container does not exist.
 */
async function containerState(run, name) {
  const result = await run('docker', ['inspect', '-f', '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}', name], { timeoutMs: 30_000 });
  if (result.code !== 0) return null;
  const [status, health = null] = result.stdout.trim().split(/\s+/);
  return { status, health: health || null };
}

const isReady = (state) => state?.status === 'running' && (state.health === null || state.health === 'healthy');

/**
 * @returns {{ ready: boolean, stage: string, detail: string }}
 */
export async function ensureDocker({
  config,
  run,
  startDesktop,
  renamePath,
  pathExists,
  localAppData = process.env.LOCALAPPDATA,
  clock,
  emit = async () => {},
  log = () => {},
  /**
   * Whether the destructive step (killing Docker Desktop for the stale-socket
   * fix) may run now. The daemon allows it at boot and while the loop is
   * idle; mid-job it would pull the database out from under a gate.
   */
  mayRepair = async () => true,
}) {
  const dockerUp = async () => (await run('docker', ['info'], { timeoutMs: 30_000 })).code === 0;

  const waitForDocker = async () => {
    const deadline = clock.now() + config.startTimeoutMs;
    for (;;) {
      if (await dockerUp()) return true;
      if (clock.now() >= deadline) return false;
      await clock.sleep(config.pollMs);
    }
  };

  if (!(await dockerUp())) {
    log('DOCKER', '`docker info` failed; starting Docker Desktop');
    await emit({ type: DAEMON_EVENTS.DOCKER_UNAVAILABLE, stage: 'START_DESKTOP' });
    await startDesktop(config.desktopPath);

    if (!(await waitForDocker())) {
      if (!(await mayRepair())) {
        const detail = 'Docker is down and the stale-socket fix (which kills Docker Desktop) waits until no job is running';
        log('DOCKER', detail);
        await emit({ type: DAEMON_EVENTS.DOCKER_FAILED, stage: 'REPAIR_DEFERRED', detail });
        return { ready: false, stage: 'REPAIR_DEFERRED', detail };
      }
      log('DOCKER', `still down after ${Math.round(config.startTimeoutMs / 1000)}s; applying the stale-socket fix`);
      const suffix = `stale-${staleSuffix(clock.now())}`;
      for (const image of ['Docker Desktop.exe', 'com.docker.backend.exe']) {
        await run('taskkill', ['/IM', image, '/F'], { timeoutMs: 30_000 });
      }
      await clock.sleep(5_000);
      const renamed = [];
      for (const dir of staleSocketDirs(localAppData)) {
        if (!(await pathExists(dir))) continue;
        try {
          await renamePath(dir, `${dir}.${suffix}`);
          renamed.push(`${dir}.${suffix}`);
        } catch (error) {
          log('DOCKER', `could not rename ${dir}: ${error.message}`);
        }
      }
      await emit({ type: DAEMON_EVENTS.DOCKER_STALE_SOCKET_FIX, renamed });
      await startDesktop(config.desktopPath);

      if (!(await waitForDocker())) {
        const detail = 'Docker did not answer `docker info` after starting Docker Desktop and after the stale-socket fix';
        await emit({ type: DAEMON_EVENTS.DOCKER_FAILED, stage: 'DOCKER_INFO', detail });
        return { ready: false, stage: 'DOCKER_INFO', detail };
      }
    }
  }

  for (const name of config.containers) {
    let state = await containerState(run, name);
    if (!state) {
      const detail = `container ${name} does not exist`;
      await emit({ type: DAEMON_EVENTS.DOCKER_FAILED, stage: 'CONTAINER', container: name, detail });
      return { ready: false, stage: 'CONTAINER', detail };
    }
    if (state.status !== 'running') {
      const started = await run('docker', ['start', name], { timeoutMs: 120_000 });
      await emit({ type: DAEMON_EVENTS.CONTAINER_STARTED, container: name, ok: started.code === 0 });
      log('DOCKER', `docker start ${name} → ${started.code === 0 ? 'ok' : started.stderr.trim().slice(0, 160)}`);
    }

    const deadline = clock.now() + config.healthTimeoutMs;
    for (;;) {
      state = await containerState(run, name);
      if (isReady(state)) break;
      if (clock.now() >= deadline) {
        const detail = `container ${name} is not healthy (${state?.status ?? 'missing'}${state?.health ? `/${state.health}` : ''})`;
        await emit({ type: DAEMON_EVENTS.DOCKER_FAILED, stage: 'CONTAINER', container: name, detail });
        return { ready: false, stage: 'CONTAINER', detail };
      }
      await clock.sleep(config.pollMs);
    }
  }

  return { ready: true, stage: 'READY', detail: `docker up; ${config.containers.length} container(s) healthy` };
}
