/**
 * IA Loop — what the daemon keeps on disk, and how others read it.
 *
 *   .state/daemon/state.json      snapshot the daemon rewrites every tick:
 *                                 children, restarts, last incident, memory,
 *                                 plus the few facts that must survive a
 *                                 daemon restart (retry counts, owned pause)
 *   .state/daemon/requests/*.json stop / resume asked by the CLI, consumed by
 *                                 the daemon on its next tick
 *   .state/daemon/*.log           the daemon's log and one per child
 *   .state/leases/workers/daemon.lock
 *                                 the single-instance lease — the same
 *                                 primitive and the same takeover rules as a
 *                                 worker role (worker-identity.mjs)
 *
 * The CLI never talks to the daemon over a socket: it writes a request file
 * and reads the snapshot, so a daemon that is busy or gone cannot hang it.
 */

import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { readJson, writeJsonAtomic } from './job-store.mjs';
import { classifyLease, createLeaseStore, LEASE_STATUS } from './leases.mjs';
import { DAEMON_LEASE_ROLE } from './daemon-vocabulary.mjs';
import { LIVENESS } from './process-inspector.mjs';
import { IDENTITY_VERDICTS, judgeWorkerLease } from './worker-identity.mjs';

export const DAEMON_REQUESTS = Object.freeze({ STOP: 'stop', RESUME: 'resume' });

export function daemonPaths(stateDir) {
  const root = join(stateDir, 'daemon');
  return {
    root,
    state: join(root, 'state.json'),
    requests: join(root, 'requests'),
    request: (name) => join(root, 'requests', `${name}.json`),
    log: join(root, 'daemon.log'),
    bootLog: join(root, 'daemon-boot.log'),
    childLog: (name) => join(root, `${name}.log`),
    incidents: join(root, 'incidents'),
  };
}

export function createDaemonStateStore(stateDir) {
  const paths = daemonPaths(stateDir);
  const leases = createLeaseStore(stateDir);

  return {
    paths,
    leases,
    readSnapshot: () => readJson(paths.state).catch(() => null),
    writeSnapshot: (snapshot) => writeJsonAtomic(paths.state, snapshot),
    readLease: () => leases.readWorkerLease(DAEMON_LEASE_ROLE).catch(() => null),

    async writeRequest(name, body) {
      await mkdir(paths.requests, { recursive: true });
      await writeJsonAtomic(paths.request(name), { ...body, requestedAt: new Date().toISOString() });
    },

    /** Reads and removes every pending request. A request is acted on once. */
    async takeRequests() {
      let names = [];
      try { names = await readdir(paths.requests); } catch { return {}; }
      const taken = {};
      for (const file of names.filter((name) => name.endsWith('.json'))) {
        const path = join(paths.requests, file);
        const body = await readJson(path).catch(() => null);
        await rm(path, { force: true }).catch(() => {});
        if (body) taken[file.replace(/\.json$/, '')] = body;
      }
      return taken;
    },
  };
}

/**
 * Is a daemon running? Judged on its lease exactly like a worker role: alive
 * and heartbeating, or provably gone. "Alive but silent" counts as running —
 * starting a second daemon beside a stalled first one is the thing the lock
 * exists to prevent.
 *
 * One addition to the worker rule: a lease still inside its expiry window
 * whose pid is provably GONE is not a running daemon. A daemon killed from
 * Task Manager would otherwise block `ia-loop:start` for the whole window.
 */
export async function judgeDaemonLease({ lease, inspector, now = Date.now() }) {
  if (!lease) return { running: false, verdict: IDENTITY_VERDICTS.AVAILABLE, lease: null };
  const judgement = await judgeWorkerLease({ lease, inspector, now });
  if (judgement.verdict === IDENTITY_VERDICTS.HELD_BY_LIVE_WORKER
    && Number.isInteger(lease.pid) && inspector.exists(lease.pid) === LIVENESS.GONE) {
    return { running: false, verdict: IDENTITY_VERDICTS.HOLDER_GONE, detail: `pid ${lease.pid} no longer exists`, lease };
  }
  const gone = [IDENTITY_VERDICTS.HOLDER_GONE, IDENTITY_VERDICTS.STALE_AFTER_REBOOT, IDENTITY_VERDICTS.PID_RECYCLED]
    .includes(judgement.verdict);
  return { running: !gone, verdict: judgement.verdict, detail: judgement.detail, lease };
}

/**
 * Retires the lease of a daemon proven gone, so the next start can claim the
 * role at once. Same compare-and-swap as every other takeover: a lease that
 * moved since it was judged is left alone.
 */
export async function retireDeadDaemonLease({ leaseStore, judgement }) {
  if (!judgement?.lease || judgement.running) return false;
  const result = await leaseStore.retireWorker(DAEMON_LEASE_ROLE, {
    expected: judgement.lease,
    proof: { verdict: judgement.verdict, detail: judgement.detail ?? null },
  }).catch(() => ({ retired: false }));
  return result.retired === true;
}

function age(fromIso, now) {
  const started = Date.parse(fromIso);
  if (Number.isNaN(started)) return 'unknown';
  const s = Math.max(0, Math.round((now - started) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * The daemon block of `ia-loop:status`. Pure, so the wording is tested.
 * The lease decides whether a daemon is running; the snapshot only says what
 * it was doing when it last wrote.
 */
export function renderDaemonStatus({ lease, snapshot, now = Date.now() }) {
  const lines = ['Daemon:'];
  const leaseStatus = lease ? classifyLease(lease, { now }).status : null;

  if (!lease) {
    lines.push('  State: NOT RUNNING');
    lines.push('  Start with: npm run ia-loop:start');
    if (snapshot?.stoppedAt) lines.push(`  Last stopped: ${snapshot.stoppedAt}${snapshot.stopMode ? ` (${snapshot.stopMode})` : ''}`);
    return lines;
  }

  lines.push(`  State: ${leaseStatus === LEASE_STATUS.ACTIVE ? (snapshot?.stopping ? 'STOPPING' : 'RUNNING') : `NOT CONFIRMABLY RUNNING (lease ${leaseStatus})`}`);
  lines.push(`  Pid: ${lease.pid} · up ${age(lease.acquiredAt, now)} · heartbeat ${age(lease.heartbeatAt, now)} ago`);
  if (!snapshot) return lines;

  for (const child of snapshot.children ?? []) {
    const state = child.pid ? `pid ${child.pid}, up ${age(child.startedAt, now)}` : (child.nextStartAt ? `down, restart at ${child.nextStartAt}` : 'not running');
    const restarts = child.restarts ? ` · restarts ${child.restarts}` : '';
    const last = child.lastExit ? ` · last exit ${child.lastExit.name ?? child.lastExit.code}` : '';
    lines.push(`  ${child.name}: ${state}${restarts}${last}`);
  }
  if (snapshot.attachHold) lines.push(`  Loop: not attached — ${snapshot.attachHold}`);
  if (snapshot.stopping) {
    lines.push(`  Stopping (${snapshot.stopping.mode}) since ${snapshot.stopping.at}`);
    for (const blocker of snapshot.stopBlockers ?? []) lines.push(`    waiting for: ${blocker}`);
  }
  if (snapshot.docker) lines.push(`  Docker: ${snapshot.docker.ready ? 'READY' : (snapshot.docker.checking ? 'CHECKING' : 'NOT READY')}${snapshot.docker.detail ? ` — ${snapshot.docker.detail}` : ''}`);
  if (snapshot.memory?.percent !== undefined && snapshot.memory?.percent !== null) {
    lines.push(`  Memory committed: ${snapshot.memory.percent.toFixed(1)}% (at ${snapshot.memory.at})`);
  }
  if (snapshot.code?.changed) {
    lines.push(`  Code: changed at ${snapshot.code.changed.at} — ${snapshot.code.reload
      ? 'the daemon reloads itself at the next safe window'
      : 'automatic reload is off; restart with npm run ia-loop:stop, then npm run ia-loop:start'}`);
  }
  if (snapshot.ownedPause) lines.push(`  Pause requested by the daemon: ${snapshot.ownedPause.by} since ${snapshot.ownedPause.requestedAt}`);
  if (snapshot.heldIncident) lines.push(`  Held incident: ${snapshot.heldIncident.kind} (Goal ${snapshot.heldIncident.goal}) — resume with npm run ia-loop:daemon -- --resume`);
  if (snapshot.lastIncident) {
    const i = snapshot.lastIncident;
    lines.push(`  Last incident: ${i.kind ?? 'UNCATALOGUED'} Goal ${i.goal ?? '?'} → ${i.outcome} at ${i.at}`);
  }
  lines.push(`  Logs: ${snapshot.logDir ?? '.state/daemon/'}`);
  return lines;
}

/** The daemon block, read from disk. Never throws: status must always print. */
export async function readDaemonStatusLines(stateDir, { now = Date.now() } = {}) {
  try {
    const dstore = createDaemonStateStore(stateDir);
    const [lease, snapshot] = await Promise.all([dstore.readLease(), dstore.readSnapshot()]);
    return renderDaemonStatus({ lease, snapshot, now });
  } catch (error) {
    return ['Daemon:', `  State: unknown (${error.message})`];
  }
}
