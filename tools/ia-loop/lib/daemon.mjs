/**
 * IA Loop — the daemon: one process that keeps the whole loop running.
 *
 * Until V37 the loop was three terminals (two workers and run-auto) plus a set
 * of shell scripts an operator ran beside them: one restarted workers, one
 * re-attached run-auto and retried the stops it recognised, one paused the
 * loop when memory ran out, one revived Docker after a reboot. Each of those
 * duties lives here now, as a tick:
 *
 *   workers     both are kept alive; every exit is followed by a restart, with
 *               a backoff and a crash-loop limit that tells the operator
 *   the loop    run-auto is attached while the run is RUNNING and nothing asks
 *               for a pause; a stale loop lease goes through run-recover first
 *   stops       a PAUSED_FOR_HUMAN is classified against a closed catalogue
 *               (daemon-incidents.mjs); a catalogued one is remedied and
 *               retried within its limit, anything else waits for a person
 *   Docker      the database the gates need is up before anything attaches
 *   memory      a committed-memory peak requests a pause the daemon owns, and
 *               the daemon withdraws only a pause it owns
 *   orphans     the V36 tree sweep runs periodically
 *
 * Long operations (Docker, a remedy, a recovery) run as tasks, so a worker
 * that dies in the middle of one is still restarted on the next tick.
 *
 * Nothing in here touches the machine directly: processes, Docker, memory,
 * git and notifications all arrive as functions (run-daemon.mjs wires the real
 * ones), and the clock is injected, so every rule is tested with fakes.
 */

import { open as openFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LOOP_LEASE_KEY, RUN_STATUS, createAutonomousStore } from './autonomous-state.mjs';
import { createJobStore } from './job-store.mjs';
import { classifyLease, createLeaseStore, LEASE_STATUS } from './leases.mjs';
import { judgeSafeWindow, readSafeWindowFacts, SAFE_WINDOW_BLOCKERS } from './pause-safety.mjs';
import { LIVENESS } from './process-inspector.mjs';
import { readWorkerHealth, WORKER_HEALTH } from './worker-registry.mjs';
import { WORKER_EXIT, nameForExitCode } from './worker-exit.mjs';
import { WORKERS } from '../run-worker.mjs';
import { createOutputCapture } from './daemon-logs.mjs';
import { createDaemonStateStore } from './daemon-state.mjs';
import {
  classifyHumanStop, incidentBudget, incidentKey, remedyIncident, resolvedNoteFor,
} from './daemon-incidents.mjs';
import {
  ATTACH_HOLDS, DAEMON_CHILDREN, DAEMON_EVENTS, DAEMON_PAUSE_OWNERS, DAEMON_PAUSE_REQUESTER, DAEMON_SHUTDOWN_MESSAGE,
  DAEMON_WORKER_ROLES, HELD_STAGES,
} from './daemon-vocabulary.mjs';
import { WORKTREE_ROOT } from './worktree-manager.mjs';
import { activeWorktreesFromRuntime } from './orphan-processes.mjs';

const ANSI = /\u001b\[[0-9;]*m/g;

/** The worker scripts, relative to tools/ia-loop: run-worker.mjs's table, by child name. */
export const DEFAULT_WORKER_SCRIPTS = Object.freeze(Object.fromEntries(
  Object.entries(DAEMON_WORKER_ROLES).map(([child, role]) => [child, WORKERS[role]]),
));

/** A run-auto that lived this long before failing was not failing to attach. */
const ATTACH_HEALTHY_AFTER_MS = 5 * 60_000;
/** How many notification keys are remembered across restarts. */
const NOTIFIED_KEEP = 100;
/**
 * A resume asked for while the daemon was down still counts — that is how
 * `--resume` before `start` works — but not forever: a request a day old
 * describes a situation nobody remembers.
 */
export const RESUME_REQUEST_MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * The worktrees the periodic orphan sweep must never touch: those of the
 * running Goal (orphan-processes.mjs's own rule) plus the planning worktree
 * of the Goal being closed. activeWorktreesFromRuntime returns nothing once
 * `goalClosed` is set, which is exactly when that planning worktree is busy.
 */
export function daemonProtectedWorktrees(runtime, repoRoot) {
  const paths = new Set(activeWorktreesFromRuntime(runtime, repoRoot));
  for (const goal of [runtime?.goal, runtime?.closure?.goal]) {
    if (goal) paths.add(join(repoRoot, WORKTREE_ROOT, `plan-after-goal-${goal}`));
  }
  return [...paths];
}

/** Crashes inside the window, and whether they are too many. Same rule as run-worker.mjs. */
export function crashLoopVerdict(timestamps, { now, limit, windowMs }) {
  const recent = timestamps.filter((at) => now - at < windowMs);
  return { recent, exhausted: recent.length >= limit };
}

/**
 * What the daemon does after a worker exits, by exit code.
 *
 * run-worker.mjs refuses to restart CODE_CHANGED and IDENTITY_CONFLICT,
 * because there a person restarts by hand. Here there is no person: a
 * changed codebase is exactly when a fresh worker is wanted, and a role held
 * by a stale lease frees itself once the lease expires.
 */
export function workerRestartPlan(exitCode, { consecutiveCrashes, config }) {
  switch (exitCode) {
    case WORKER_EXIT.CODE_CHANGED:
      return { delayMs: 1_000, crash: false, reason: 'the ia-loop code changed; starting the new code' };
    case WORKER_EXIT.IDENTITY_CONFLICT:
      return { delayMs: config.workers.identityRetryMs, crash: false, reason: 'the role lease is still held; retrying once it can expire' };
    case WORKER_EXIT.OK:
      return { delayMs: config.workers.restartBaseMs, crash: false, reason: 'exited cleanly without being asked to' };
    default: {
      const delayMs = Math.min(
        config.workers.restartBaseMs * (2 ** Math.max(0, consecutiveCrashes - 1)),
        config.workers.restartMaxMs,
      );
      return { delayMs, crash: true, reason: `exited ${nameForExitCode(exitCode)}` };
    }
  }
}

export function createDaemon(deps) {
  const {
    config,
    stateDir,
    repoRoot,
    clock,
    spawnChild,
    killTree = async () => false,
    inspector,
    ensureDocker = async () => ({ ready: true, stage: 'READY', detail: 'not checked' }),
    probeMemory = async () => null,
    sweepOrphans = async () => ({ killed: [], reported: [], failed: [] }),
    notifier = async () => ({ shown: false }),
    git = async () => ({ code: 1, stdout: '', stderr: 'git not wired' }),
    savePatch = async () => {},
    pathExists = async () => false,
    log = () => {},
    workerScripts = DEFAULT_WORKER_SCRIPTS,
    pid = process.pid,
    logDir = null,
    /** The fingerprint of the daemon's own code; null turns the reload off. */
    codeVersion = null,
  } = deps;

  const store = createJobStore(stateDir);
  const auto = createAutonomousStore(stateDir);
  const dstore = createDaemonStateStore(stateDir);
  const leaseStore = createLeaseStore(stateDir);

  const iso = (ms = clock.now()) => new Date(ms).toISOString();
  const startedAt = iso();
  /** Request files are stamped with wall-clock time by the CLI, so they are judged by it. */
  const startedAtWallMs = Date.now();

  /** What must survive a daemon restart. Loaded from the last snapshot. */
  let persisted = {
    incidentCounts: {},
    ownedPause: null,
    heldIncident: null,
    lastIncident: null,
    notified: {},
    resumePending: null,
    pendingStart: null,
  };

  const workers = Object.fromEntries(Object.entries(workerScripts).map(([name, script]) => [name, {
    name,
    role: DAEMON_WORKER_ROLES[name],
    script,
    handle: null,
    startedAtMs: null,
    restarts: 0,
    crashes: [],
    consecutiveCrashes: 0,
    nextStartAt: 0,
    lastExit: null,
  }]));

  const loop = { task: null, child: null };
  /** Worker exits still being handled (lease retired, restart planned). */
  const pendingExits = new Set();
  const docker = {
    ready: !config.docker.enabled,
    checking: false,
    detail: config.docker.enabled ? 'not checked yet' : 'check disabled',
    checkedAt: null,
    task: null,
  };
  const memory = { percent: null, at: null, high: false, lowSince: null, lastSampleAt: null, task: null };
  /** The daemon's own code: what it booted with and whether that moved. */
  const code = { boot: null, changed: null, lastCheckAt: null, task: null };
  /** Docker repairs that kill Docker Desktop are allowed at boot, and later only while the loop is idle. */
  let dockerChecks = 0;
  const sweep = { lastAt: null, task: null };
  const attach = { failures: 0, nextAt: 0, hold: null, holdDetail: null };
  let stopping = null;
  let finishing = false;
  let stopped = false;
  let ticking = false;
  let lastStopSignature = null;
  let stopBlockers = [];
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  // -------------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------------

  async function emit(event) {
    try {
      await store.appendEvent(event);
    } catch (error) {
      log('ERROR', `cannot append ${event.type}: ${error.message}`);
    }
  }

  /**
   * Toast + log line + event. A key makes it once-only, across restarts: the
   * same stop must not toast every five seconds, nor again after a reboot.
   */
  async function notify({ title, text, key = null }) {
    if (key) {
      if (persisted.notified[key]) return false;
      persisted.notified[key] = iso();
      const keys = Object.keys(persisted.notified);
      for (const old of keys.slice(0, Math.max(0, keys.length - NOTIFIED_KEEP))) delete persisted.notified[old];
    }
    log('NOTIFY', `${title} — ${text}`);
    await emit({ type: DAEMON_EVENTS.NOTIFICATION, title, text });
    if (config.notify.toast) {
      try { await notifier({ title, text }); } catch (error) { log('ERROR', `toast failed: ${error.message}`); }
    }
    return true;
  }

  const readRun = () => auto.read().catch(() => null);

  async function eventsSize() {
    let handle;
    try {
      handle = await openFile(store.paths.events, 'r');
      return (await handle.stat()).size;
    } catch {
      return 0;
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  /**
   * The events appended since a byte offset. The log grows for the life of
   * the loop; reading it whole on every check would cost more than the check.
   */
  async function readEventsSince(offset) {
    let handle;
    try {
      handle = await openFile(store.paths.events, 'r');
      const { size } = await handle.stat();
      const from = offset <= size ? offset : 0;
      const buffer = Buffer.alloc(size - from);
      if (buffer.length) await handle.read(buffer, 0, buffer.length, from);
      return buffer.toString('utf8').split('\n').filter(Boolean).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    } catch {
      return [];
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  function setHold(reason, detail = null) {
    if (attach.hold !== reason || attach.holdDetail !== detail) {
      attach.hold = reason;
      attach.holdDetail = detail;
      log('HOLD', `${reason}${detail ? ` — ${detail}` : ''}`);
      void emit({ type: DAEMON_EVENTS.ATTACH_HELD, reason, detail });
    }
  }

  function clearHold() {
    attach.hold = null;
    attach.holdDetail = null;
  }

  /**
   * Starts a loop task and returns nothing on purpose: the tick that starts
   * it must not wait for it. run-auto lives for hours, and a tick awaiting it
   * would stop restarting workers, reading requests and checking memory.
   */
  function startLoopTask(fn) {
    clearHold();
    loop.task = (async () => {
      try {
        await fn();
      } catch (error) {
        log('ERROR', `loop task failed: ${error.stack ?? error.message}`);
      } finally {
        loop.task = null;
      }
    })();
  }

  // -------------------------------------------------------------------------
  // Workers
  // -------------------------------------------------------------------------

  function spawnWorker(worker) {
    let handle;
    try {
      handle = spawnChild(worker.name, worker.script, [], { ipc: true });
    } catch (error) {
      log('ERROR', `cannot start ${worker.name}: ${error.message}`);
      worker.nextStartAt = clock.now() + config.workers.restartBaseMs;
      return;
    }
    worker.handle = handle;
    worker.startedAtMs = clock.now();
    log('CHILD', `${worker.name} started (pid ${handle.pid})`);
    void emit({ type: DAEMON_EVENTS.CHILD_STARTED, child: worker.name, pid: handle.pid });
    handle.exited.then((exit) => {
      const handled = onWorkerExit(worker, handle, exit)
        .catch((error) => log('ERROR', `handling the exit of ${worker.name} failed: ${error.message}`))
        .finally(() => pendingExits.delete(handled));
      pendingExits.add(handled);
    });
  }

  /**
   * The role lease of a worker the daemon just watched die.
   *
   * Left alone it reads ACTIVE for the whole expiry window, and the next
   * worker refuses to start (IDENTITY_CONFLICT) until it lapses. The daemon
   * holds positive proof the holder is gone — it saw the exit — so it retires
   * the lease with the same compare-and-swap recovery uses, and only if the
   * lease still names that exact pid and the pid is gone.
   */
  async function retireDeadWorkerLease(worker, deadPid, exitName) {
    try {
      const lease = await leaseStore.readWorkerLease(worker.role);
      if (!lease || lease.pid !== deadPid) return;
      if (inspector.exists(deadPid) !== LIVENESS.GONE) return;
      await leaseStore.retireWorker(worker.role, {
        expected: lease,
        proof: { verdict: 'HOLDER_GONE', detail: `daemon child pid ${deadPid} exited (${exitName})` },
      });
    } catch (error) {
      log('WARN', `could not retire the ${worker.role} lease: ${error.message}`);
    }
  }

  async function onWorkerExit(worker, handle, exit) {
    if (worker.handle !== handle) return;
    worker.handle = null;
    // No restart until this handler has decided when: a tick running during
    // the awaits below must not start the worker again with no backoff.
    worker.nextStartAt = Number.POSITIVE_INFINITY;
    const now = clock.now();
    const name = nameForExitCode(exit.code);
    worker.lastExit = { code: exit.code, name, signal: exit.signal ?? null, at: iso(now) };
    log('CHILD', `${worker.name} exited ${name}${exit.signal ? ` (signal ${exit.signal})` : ''}`);
    await emit({ type: DAEMON_EVENTS.CHILD_EXITED, child: worker.name, pid: handle.pid, code: exit.code, name });
    // A graceful stop still needs both workers to reach its boundary, so only
    // the final shutdown ends the restarts.
    if (finishing || stopped) return;

    await retireDeadWorkerLease(worker, handle.pid, name);

    // A worker that ran for a whole crash window was healthy; its crash is a
    // new incident, not the next step of a loop.
    if (worker.startedAtMs !== null && now - worker.startedAtMs >= config.workers.crashWindowMs) {
      worker.consecutiveCrashes = 0;
    }
    const crashed = ![WORKER_EXIT.CODE_CHANGED, WORKER_EXIT.IDENTITY_CONFLICT, WORKER_EXIT.OK].includes(exit.code);
    if (crashed) {
      worker.consecutiveCrashes += 1;
      worker.crashes.push(now);
    }
    const plan = workerRestartPlan(exit.code, { consecutiveCrashes: worker.consecutiveCrashes, config });
    let { delayMs } = plan;

    if (plan.crash) {
      const verdict = crashLoopVerdict(worker.crashes, {
        now, limit: config.workers.crashLimit, windowMs: config.workers.crashWindowMs,
      });
      worker.crashes = verdict.recent;
      if (verdict.exhausted) {
        delayMs = Math.max(delayMs, config.workers.crashLoopCooldownMs);
        worker.crashes = [];
        await emit({
          type: DAEMON_EVENTS.WORKER_CRASH_LOOP, child: worker.name, crashes: verdict.recent.length,
          windowMs: config.workers.crashWindowMs, nextStartAt: iso(now + delayMs),
        });
        await notify({
          title: `IA Loop: ${worker.name} em crash loop`,
          text: `${verdict.recent.length} quedas em ${Math.round(config.workers.crashWindowMs / 60_000)} min (último: ${name}). `
            + `Nova tentativa às ${iso(now + delayMs).slice(11, 19)} UTC. Veja .state/daemon/${worker.name}.log.`,
        });
      }
    }

    worker.restarts += 1;
    worker.nextStartAt = now + delayMs;
    log('CHILD', `${worker.name}: ${plan.reason}; restart in ${Math.round(delayMs / 1000)}s`);
  }

  function ensureWorkers() {
    if (finishing || stopped) return;
    for (const worker of Object.values(workers)) {
      if (!worker.handle && clock.now() >= worker.nextStartAt) spawnWorker(worker);
    }
  }

  // -------------------------------------------------------------------------
  // Docker
  // -------------------------------------------------------------------------

  /**
   * No job and no worktree is leased: nothing is using the database or a
   * container right now. Leases are the evidence, not the run status, because
   * a worker mid-job is exactly what a killed Docker Desktop would break.
   */
  async function loopIsQuiet() {
    try {
      const [jobs, worktrees] = await Promise.all([leaseStore.listJobLeases(), leaseStore.listWorktreeLeases()]);
      return !jobs.filter(Boolean).some((lease) => (lease.jobId ?? lease.key) !== LOOP_LEASE_KEY)
        && !worktrees.filter(Boolean).length;
    } catch {
      return false;
    }
  }

  function maybeCheckDocker() {
    if (!config.docker.enabled || docker.task || stopping) return;
    if (docker.checkedAt !== null && clock.now() - docker.checkedAt < config.docker.checkIntervalMs) return;
    docker.checking = true;
    dockerChecks += 1;
    const atBoot = dockerChecks === 1;
    docker.task = (async () => {
      let result;
      try {
        // The stale-socket fix kills Docker Desktop. At boot nothing can be
        // using it yet; later only an idle loop may lose it. Mid-run the
        // check just reports, and the next idle check repairs.
        result = await ensureDocker({ mayRepair: async () => atBoot || (!loop.task && await loopIsQuiet()) });
      } catch (error) {
        result = { ready: false, stage: 'ERROR', detail: error.message };
      }
      const wasReady = docker.ready;
      docker.ready = result.ready;
      docker.detail = result.detail;
      docker.checking = false;
      docker.checkedAt = clock.now();
      if (result.ready) {
        for (const key of Object.keys(persisted.notified)) if (key.startsWith('docker:')) delete persisted.notified[key];
        if (!wasReady) await emit({ type: DAEMON_EVENTS.DOCKER_READY, detail: result.detail });
      } else {
        log('DOCKER', `not ready: ${result.detail}`);
        await notify({
          title: 'IA Loop: Docker indisponível',
          text: `${result.detail}. O loop não será anexado até o banco subir.`,
          key: `docker:${result.stage}`,
        });
      }
    })().finally(() => { docker.task = null; });
  }

  // -------------------------------------------------------------------------
  // Pauses the daemon owns
  // -------------------------------------------------------------------------

  async function requestOwnedPause(by, run) {
    const eventsOffset = await eventsSize();
    await auto.requestPause({ afterGoal: false, by: DAEMON_PAUSE_REQUESTER });
    persisted.ownedPause = { by, requestedAt: iso(), runId: run.autonomousRunId, eventsOffset };
  }

  /** Whether the operator asked for a pause after a byte offset of events.jsonl. */
  async function operatorPausedSince(offset) {
    const since = await readEventsSince(offset ?? 0);
    return since.some((event) => event.type === 'AUTONOMOUS_RUN_PAUSE_REQUESTED');
  }

  /**
   * Withdraws a pause the daemon asked for. A PAUSED run is resumed by the
   * next attach (run-auto clears the pause itself); a run that has not
   * reached its boundary yet just loses the request.
   *
   * Ownership is checked again first, right before acting: an operator who
   * asked for a pause a moment ago must not lose it to a memory reading that
   * happened to come back low in the same tick.
   */
  async function releaseOwnedPause(eventType, detail = null) {
    await reconcileOwnedPause();
    const owned = persisted.ownedPause;
    if (!owned) return false;
    persisted.ownedPause = null;
    const run = await readRun();
    if (run && run.autonomousRunId === owned.runId) {
      if (run.status === RUN_STATUS.PAUSED) {
        // The attach that resumes it checks the same offset again.
        persisted.resumePending = { runId: run.autonomousRunId, eventsOffset: owned.eventsOffset ?? 0 };
      } else if (run.pauseRequested) {
        await auto.withdrawPauseRequest({ onlyIfRequestedBy: DAEMON_PAUSE_REQUESTER });
      }
    }
    await emit({ type: eventType, by: owned.by, runId: owned.runId, detail });
    log('PAUSE', `pause owned by ${owned.by} released${detail ? `: ${detail}` : ''}`);
    return true;
  }

  /**
   * Ownership ends the moment a person touches the pause: they asked for one
   * too (it is theirs now), resumed the run themselves, or replaced the run.
   * From then on the daemon never withdraws it.
   */
  async function reconcileOwnedPause() {
    const owned = persisted.ownedPause;
    if (!owned) return;
    const run = await readRun();
    const handOver = async (reason) => {
      persisted.ownedPause = null;
      await emit({ type: DAEMON_EVENTS.PAUSE_HANDED_TO_OPERATOR, by: owned.by, runId: owned.runId, reason });
      log('PAUSE', `pause handed to the operator: ${reason}`);
    };
    if (!run || run.autonomousRunId !== owned.runId) return handOver('RUN_REPLACED');
    if (await operatorPausedSince(owned.eventsOffset)) return handOver('OPERATOR_REQUESTED_PAUSE');
    // run-pause writes the run before it appends its event; the mark closes
    // that gap from the other side.
    if (run.pauseRequested && run.pauseRequestedBy && run.pauseRequestedBy !== DAEMON_PAUSE_REQUESTER) {
      return handOver('OPERATOR_REQUESTED_PAUSE');
    }
    if (!run.pauseRequested && run.status !== RUN_STATUS.PAUSED) return handOver('PAUSE_WITHDRAWN_ELSEWHERE');
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Memory
  // -------------------------------------------------------------------------

  /**
   * A task, like the Docker check: the probe is a PowerShell process that can
   * take seconds (30s at worst), and the tick that restarts workers must not
   * wait for it.
   */
  function maybeSampleMemory() {
    if (!config.memory.enabled || memory.task) return;
    if (memory.lastSampleAt !== null && clock.now() - memory.lastSampleAt < config.memory.intervalMs) return;
    memory.lastSampleAt = clock.now();
    memory.task = (async () => {
      const sample = await probeMemory().catch(() => null);
      await applyMemorySample(sample);
    })().catch((error) => log('ERROR', `memory check failed: ${error.message}`)).finally(() => { memory.task = null; });
  }

  async function applyMemorySample(sample) {
    if (!sample || !Number.isFinite(sample.percent)) return;
    memory.percent = sample.percent;
    memory.at = iso();
    const { highPercent, lowPercent, clearAfterMs } = config.memory;

    if (sample.percent >= highPercent) {
      memory.lowSince = null;
      if (!memory.high) {
        memory.high = true;
        await emit({ type: DAEMON_EVENTS.MEMORY_HIGH, percent: sample.percent, threshold: highPercent });
      }
      if (persisted.ownedPause || stopping) return;
      const run = await readRun();
      if (run?.status === RUN_STATUS.RUNNING && !run.pauseRequested) {
        await requestOwnedPause(DAEMON_PAUSE_OWNERS.MEMORY, run);
        await emit({ type: DAEMON_EVENTS.MEMORY_PAUSE_REQUESTED, runId: run.autonomousRunId, percent: sample.percent });
        await notify({
          title: 'IA Loop: memória alta, pausa pedida',
          text: `Memória comprometida em ${sample.percent.toFixed(1)}% (limite ${highPercent}%). `
            + `O loop para na próxima fronteira segura e retoma sozinho abaixo de ${lowPercent}%.`,
        });
      }
      return;
    }

    if (sample.percent < lowPercent) {
      memory.high = false;
      memory.lowSince ??= clock.now();
      if (persisted.ownedPause?.by === DAEMON_PAUSE_OWNERS.MEMORY && clock.now() - memory.lowSince >= clearAfterMs) {
        if (await releaseOwnedPause(DAEMON_EVENTS.MEMORY_PAUSE_CLEARED, `memory at ${sample.percent.toFixed(1)}%`)) {
          await notify({ title: 'IA Loop: memória normalizada', text: `Memória em ${sample.percent.toFixed(1)}%; a pausa da memória foi retirada.` });
        }
      }
      return;
    }

    // Between the thresholds: neither high enough to pause nor low enough to
    // count towards clearing.
    memory.lowSince = null;
  }

  // -------------------------------------------------------------------------
  // Orphan sweep
  // -------------------------------------------------------------------------

  function maybeSweep() {
    if (!config.sweep.enabled || sweep.task || finishing) return;
    if (sweep.lastAt !== null && clock.now() - sweep.lastAt < config.sweep.intervalMs) return;
    sweep.lastAt = clock.now();
    sweep.task = (async () => {
      // A unit mid-attempt can own a server whose parent just exited; the
      // V36 sweep is safe at the end of an attempt, not in the middle of one.
      // Busy now: look again in a minute rather than a whole interval.
      if (!(await loopIsQuiet())) {
        sweep.lastAt = clock.now() - config.sweep.intervalMs + Math.min(60_000, config.sweep.intervalMs);
        return;
      }
      const runtime = await store.readRuntime().catch(() => null);
      const result = await sweepOrphans(runtime);
      if (result.killed.length || result.failed.length) {
        await emit({
          type: DAEMON_EVENTS.ORPHAN_SWEEP,
          killed: result.killed.map((p) => ({ pid: p.pid, name: p.name ?? null })),
          failed: result.failed.length,
        });
        log('SWEEP', `killed ${result.killed.length} orphan process(es)${result.failed.length ? `, ${result.failed.length} failed` : ''}`);
      }
    })().catch((error) => log('ERROR', `orphan sweep failed: ${error.message}`)).finally(() => { sweep.task = null; });
  }

  // -------------------------------------------------------------------------
  // The loop: run-auto, run-recover, run-close
  // -------------------------------------------------------------------------

  async function runLoopChild(name, args = []) {
    const capture = createOutputCapture();
    const eventsOffset = await eventsSize();
    const startedAtMs = clock.now();
    let handle;
    try {
      handle = spawnChild(name, `${name}.mjs`, args, {
        ipc: false,
        onOutput: (text) => capture.append(String(text).replace(ANSI, '')),
      });
    } catch (error) {
      // A spawn that throws is a failed attempt like any other: the caller
      // counts it and backs off, instead of retrying it on every tick.
      log('ERROR', `cannot start ${name}: ${error.message}`);
      return { code: -1, output: `cannot start ${name}: ${error.message}`, eventsOffset, startedAtMs };
    }
    loop.child = { name, handle, startedAtMs, args };
    log('CHILD', `${name}${args.length ? ` ${args.join(' ')}` : ''} started (pid ${handle.pid})`);
    await emit({ type: DAEMON_EVENTS.CHILD_STARTED, child: name, pid: handle.pid, args });
    const exit = await handle.exited;
    loop.child = null;
    log('CHILD', `${name} exited ${exit.code}`);
    await emit({ type: DAEMON_EVENTS.CHILD_EXITED, child: name, pid: handle.pid, code: exit.code });
    return { code: exit.code, output: capture.text(), eventsOffset, startedAtMs };
  }

  async function countAttachFailure(result, run) {
    if (clock.now() - (result.startedAtMs ?? clock.now()) >= ATTACH_HEALTHY_AFTER_MS) attach.failures = 0;
    attach.failures += 1;
    const delayMs = Math.min(config.attach.backoffBaseMs * (2 ** (attach.failures - 1)), config.attach.backoffMaxMs);
    attach.nextAt = clock.now() + delayMs;
    const lastLine = String(result.output ?? '').trim().split('\n').filter(Boolean).at(-1)?.trim().slice(0, 300) ?? null;
    log('ATTACH', `attempt ${attach.failures} failed (exit ${result.code}): ${lastLine ?? 'no output'}; next in ${Math.round(delayMs / 1000)}s`);
    if (attach.failures >= config.attach.failureLimit) {
      await emit({ type: DAEMON_EVENTS.ATTACH_FAILING, failures: attach.failures, code: result.code, lastLine });
      await notify({
        title: 'IA Loop: o loop não consegue anexar',
        text: `${attach.failures} tentativas falharam. Última: ${lastLine ?? `exit ${result.code}`}`,
        key: `attach-failing:${run?.autonomousRunId ?? 'none'}:${Math.floor(attach.failures / config.attach.failureLimit)}`,
      });
    }
  }

  const humanKey = (run) => `human:${run.autonomousRunId}:${run.humanRequired?.at ?? ''}`;

  /** Once per stop: the stop that a catalogue entry already reported is not reported twice. */
  function markHumanReported(run) {
    persisted.notified[humanKey(run)] ??= iso();
  }

  async function reportHumanStop(run, reason, goal) {
    if (persisted.notified[humanKey(run)]) return;
    persisted.lastIncident = { kind: null, goal: goal ?? run.currentGoal ?? null, outcome: 'HUMAN_REQUIRED', reason, at: iso() };
    await emit({ type: DAEMON_EVENTS.HUMAN_REQUIRED, runId: run.autonomousRunId, goal: goal ?? run.currentGoal ?? null, reason });
    await notify({
      title: 'IA Loop precisa de você',
      text: `Goal ${goal ?? run.currentGoal ?? '?'} parou: ${reason}. Veja npm run ia-loop:status; `
        + 'retome com npm run ia-loop:daemon -- --resume --resolved "<o que foi resolvido>".',
      key: humanKey(run),
    });
  }

  async function holdIncident(incident, run, stage, extra = {}) {
    persisted.heldIncident = { ...incident, ...extra, runId: run.autonomousRunId, stage, at: iso() };
    persisted.lastIncident = { kind: incident.kind, goal: incident.goal, outcome: 'HELD', at: iso() };
    await emit({ type: DAEMON_EVENTS.INCIDENT_HELD, kind: incident.kind, goal: incident.goal, stage, runId: run.autonomousRunId });
    if (stopping) return;
    await notify({
      title: 'IA Loop: falha transitória aguardando',
      text: `${incident.kind} no Goal ${incident.goal}: há uma pausa pedida, então a nova tentativa espera. `
        + 'Retome com npm run ia-loop:daemon -- --resume.',
      key: `held:${incidentKey(incident)}:${run.autonomousRunId}`,
    });
  }

  /** A run that stopped PAUSED_FOR_HUMAN while the daemon watched. */
  async function handleHumanStop(run, result) {
    const events = await readEventsSince(result.eventsOffset);
    const runtime = await store.readRuntime().catch(() => null);
    const incident = classifyHumanStop({ run, output: result.output, events, runtime });
    if (!incident.kind) return reportHumanStop(run, incident.reason, incident.goal);

    log('INCIDENT', `${incident.kind} on Goal ${incident.goal}: ${incident.evidence ?? ''}`);
    await emit({ type: DAEMON_EVENTS.INCIDENT_DETECTED, kind: incident.kind, goal: incident.goal, evidence: incident.evidence ?? null, runId: run.autonomousRunId });

    const budget = incidentBudget(incident, persisted.incidentCounts);
    if (!budget.allowed) {
      markHumanReported(run);
      persisted.lastIncident = { kind: incident.kind, goal: incident.goal, outcome: 'LIMIT_REACHED', at: iso() };
      await emit({ type: DAEMON_EVENTS.INCIDENT_LIMIT_REACHED, kind: incident.kind, goal: incident.goal, used: budget.used, limit: budget.limit });
      await notify({
        title: 'IA Loop precisa de você',
        text: `${incident.kind} no Goal ${incident.goal} já foi tentado ${budget.used}/${budget.limit} vezes. `
          + 'Resolva e retome com npm run ia-loop:daemon -- --resume --resolved "<nota>".',
        key: `limit:${incidentKey(incident)}:${run.autonomousRunId}`,
      });
      return undefined;
    }

    // A requested pause wins over a retry (LICOES_DO_SUPERVISOR rule 4): the
    // retry would start the very work the operator asked to stop.
    if (run.pauseRequested || stopping) return holdIncident(incident, run, HELD_STAGES.REMEDY);
    return remedyAndQueueRetry(incident, run);
  }

  async function remedyAndQueueRetry(incident, run) {
    const budget = incidentBudget(incident, persisted.incidentCounts);
    if (!budget.allowed) {
      persisted.heldIncident = null;
      return reportHumanStop(run, `${incident.kind} (limit ${budget.limit} reached)`, incident.goal);
    }
    persisted.incidentCounts[incidentKey(incident)] = budget.attempt;
    persisted.heldIncident = null;
    await writeSnapshot();
    log('INCIDENT', `remedying ${incident.kind} on Goal ${incident.goal} (${budget.attempt}/${budget.limit})`);
    await emit({ type: DAEMON_EVENTS.INCIDENT_RETRY, kind: incident.kind, goal: incident.goal, attempt: budget.attempt, limit: budget.limit });

    const outcome = await remedyIncident(incident, {
      git,
      runScript: (name, args) => runLoopChild(name, args),
      readRuntime: () => store.readRuntime(),
      writeRuntime: (runtime) => store.writeRuntime(runtime),
      pathExists,
      sleep: (ms) => clock.sleep(ms),
      emit,
      repoRoot,
      savePatch,
      readWorkerHealth: (role) => readWorkerHealth(store, role),
      now: () => clock.now(),
      workerReturnTimeoutMs: config.incidents.workerReturnTimeoutMs,
    });

    if (outcome.action !== 'RETRY') {
      markHumanReported(run);
      persisted.lastIncident = { kind: incident.kind, goal: incident.goal, outcome: 'GAVE_UP', reason: outcome.reason, at: iso() };
      await emit({ type: DAEMON_EVENTS.INCIDENT_GAVE_UP, kind: incident.kind, goal: incident.goal, reason: outcome.reason });
      await notify({
        title: 'IA Loop precisa de você',
        text: `${incident.kind} no Goal ${incident.goal}: a correção automática não resolveu (${outcome.reason}).`,
        key: `gave-up:${incidentKey(incident)}:${budget.attempt}`,
      });
      return undefined;
    }

    // The retry itself waits for the same gates as any attach (workers,
    // Docker, no pause): decideAttach picks it up from here.
    const note = resolvedNoteFor(incident, { attempt: budget.attempt, limit: budget.limit, nextGoal: outcome.from });
    persisted.heldIncident = { ...incident, runId: run.autonomousRunId, stage: HELD_STAGES.RETRY, from: outcome.from, note, at: iso() };
    persisted.lastIncident = { kind: incident.kind, goal: incident.goal, outcome: 'REMEDIED', from: outcome.from, at: iso() };
    return undefined;
  }

  /** What happened to the run while run-auto was attached, read after it exits. */
  async function afterRunAuto(result) {
    if (stopping?.mode === 'now' || finishing) return undefined;
    const run = await readRun();
    if (!run) return countAttachFailure(result, null);

    switch (run.status) {
      case RUN_STATUS.COMPLETED:
        attach.failures = 0;
        await emit({ type: DAEMON_EVENTS.RUN_COMPLETED, runId: run.autonomousRunId });
        return notify({ title: 'IA Loop: migração concluída', text: `Run ${run.autonomousRunId} COMPLETED.`, key: `completed:${run.autonomousRunId}` });
      case RUN_STATUS.PAUSED:
        attach.failures = 0;
        if (persisted.ownedPause?.runId === run.autonomousRunId) return undefined;
        return notify({
          title: 'IA Loop pausado',
          text: `Run pausado em ${run.pauseReason ?? 'uma fronteira segura'}. Retome com npm run ia-loop:daemon -- --resume.`,
          key: `paused:${run.autonomousRunId}:${run.pausedAt ?? ''}`,
        });
      case RUN_STATUS.PAUSED_FOR_HUMAN:
        attach.failures = 0;
        return handleHumanStop(run, result);
      default:
        return countAttachFailure(result, run);
    }
  }

  async function attachRun(args, why) {
    log('ATTACH', `run-auto${args.length ? ` ${args.join(' ')}` : ''} (${why})`);
    await emit({ type: DAEMON_EVENTS.ATTACHED, args, reason: why });
    const result = await runLoopChild(DAEMON_CHILDREN.RUN_AUTO, args);
    await afterRunAuto(result);
  }

  /**
   * A loop lease that cannot be parsed. Neither attaching nor recovering is
   * safe on top of it, so the loop holds, and the operator hears about it
   * once per distinct lease rather than once per tick.
   */
  async function holdCorruptLease(run, error) {
    const detail = `${error.code ?? 'LEASE_CORRUPT'}: ${error.message}`;
    const key = `lease-corrupt:${run.autonomousRunId}:${error.message}`;
    if (!persisted.notified[key]) {
      persisted.lastIncident = { kind: null, goal: run.currentGoal ?? null, outcome: 'LOOP_LEASE_CORRUPT', reason: detail, at: iso() };
      await emit({ type: DAEMON_EVENTS.LOOP_LEASE_CORRUPT, runId: run.autonomousRunId, detail });
      await notify({
        title: 'IA Loop: lease do loop corrompido',
        text: `${detail}. Inspecione .state/leases/jobs/${LOOP_LEASE_KEY}.lock; o daemon não anexa nem recupera até ele ser legível.`,
        key,
      });
    }
    return setHold(ATTACH_HOLDS.LOOP_LEASE_CORRUPT, detail);
  }

  const sameLease = (a, b) => Boolean(a && b)
    && a.workerInstanceId === b.workerInstanceId && a.version === b.version && a.heartbeatAt === b.heartbeatAt;

  async function recoverRun(lease) {
    log('RECOVER', `loop lease of ${lease.workerInstanceId ?? 'unknown'} is stale; running run-recover`);
    await emit({ type: DAEMON_EVENTS.RECOVERY_STARTED, owner: lease.workerInstanceId ?? null, heartbeatAt: lease.heartbeatAt ?? null });
    const result = await runLoopChild(DAEMON_CHILDREN.RUN_RECOVER, []);
    await emit({ type: DAEMON_EVENTS.RECOVERY_FINISHED, code: result.code });
    if (result.code !== 0) return countAttachFailure(result, await readRun());
    // run-recover can succeed without retiring the lease (it judged the holder
    // possibly alive, say). The next tick would find the same lease and run it
    // again five seconds later, forever; an unchanged lease is a failed try.
    const after = await auto.readLoopLease().catch(() => null);
    if (sameLease(lease, after)) {
      return countAttachFailure({ ...result, output: `${result.output}\nrun-recover exited 0 but the loop lease is unchanged` }, await readRun());
    }
    return undefined;
  }

  const bothWorkersRunning = async () => {
    const healths = await Promise.all(Object.values(workers).map((w) => readWorkerHealth(store, w.role).catch(() => null)));
    return healths.every((h) => h?.health === WORKER_HEALTH.RUNNING);
  };

  /**
   * Whether to attach now, and how. Every "no" is a named hold, so the status
   * screen says why the loop is not moving instead of leaving it to be
   * guessed.
   */
  async function decideAttach() {
    if (loop.task || stopped) return undefined;
    if (stopping) return setHold(ATTACH_HOLDS.STOPPING);

    const run = await readRun();
    let args = [];
    let why = 'run is RUNNING';

    if (!run || run.status === RUN_STATUS.COMPLETED) {
      if (!persisted.pendingStart) {
        return setHold(run ? ATTACH_HOLDS.RUN_COMPLETED : ATTACH_HOLDS.NO_RUN,
          'start a run with npm run ia-loop:daemon -- --resume --from <goal>');
      }
      args = persisted.pendingStart.args;
      why = 'operator asked for a new run';
    } else if (run.status === RUN_STATUS.PAUSED_FOR_HUMAN) {
      const held = persisted.heldIncident?.runId === run.autonomousRunId ? persisted.heldIncident : null;
      if (!held) {
        // A stop the daemon did not watch happen (it was down, or it started
        // after): nothing to classify it with, so it goes to the operator.
        await reportHumanStop(run, run.humanRequired?.reason ?? 'UNKNOWN', run.currentGoal);
        return setHold(ATTACH_HOLDS.HUMAN_REQUIRED, run.humanRequired?.reason ?? null);
      }
      if (run.pauseRequested) return setHold(ATTACH_HOLDS.PAUSE_REQUESTED, `held ${held.kind ?? 'resolution'} waits for the pause to be withdrawn`);
      if (memory.high) return setHold(ATTACH_HOLDS.MEMORY_HIGH);
      if (held.stage === HELD_STAGES.REMEDY) return startLoopTask(() => remedyAndQueueRetry(held, run));
      args = ['--from', held.from, '--resolved', held.note];
      why = held.kind ? `retry of ${held.kind}` : 'operator resolved the stop';
    } else if (run.status === RUN_STATUS.PAUSED) {
      const pending = persisted.resumePending;
      if (pending?.runId !== run.autonomousRunId) return setHold(ATTACH_HOLDS.RUN_PAUSED, run.pauseReason ?? null);
      // run-auto clears whatever pause is on the run when it attaches. A
      // pause the operator asked for after this resume was decided is newer
      // than the resume, and attaching would silently undo it.
      if (await operatorPausedSince(pending.eventsOffset)) {
        persisted.resumePending = null;
        log('RESUME', `resume of ${run.autonomousRunId} cancelled: the operator asked for a pause after it`);
        await emit({ type: DAEMON_EVENTS.RESUME_CANCELLED, runId: run.autonomousRunId, reason: 'OPERATOR_REQUESTED_PAUSE' });
        return setHold(ATTACH_HOLDS.RUN_PAUSED, run.pauseReason ?? null);
      }
      why = 'resuming a pause';
    } else if (run.pauseRequested) {
      // RUNNING with a pause requested and nobody attached: attaching would
      // walk straight past the stop the operator asked for.
      if (!persisted.ownedPause) {
        await notify({
          title: 'IA Loop parado com pausa pedida',
          text: `Run ${run.autonomousRunId} está RUNNING com pausa pedida e sem orquestrador. Retome com npm run ia-loop:daemon -- --resume.`,
          key: `pause-unattached:${run.autonomousRunId}`,
        });
      }
      return setHold(ATTACH_HOLDS.PAUSE_REQUESTED);
    }

    if (memory.high) return setHold(ATTACH_HOLDS.MEMORY_HIGH);
    // The probe runs as a task; the very first attach waits for its answer
    // instead of starting work into a peak it has not seen yet.
    if (config.memory.enabled && memory.task && memory.percent === null) return setHold(ATTACH_HOLDS.MEMORY_CHECKING);

    let lease = null;
    if (run) {
      try {
        lease = await auto.readLoopLease();
      } catch (error) {
        // Unreadable is not absent: attaching over a lease nobody could read
        // would start a second orchestrator beside a possibly live one.
        if (error.code === 'LEASE_CORRUPT') return holdCorruptLease(run, error);
        return setHold(ATTACH_HOLDS.LOOP_LEASE_UNREADABLE, error.message);
      }
    }
    if (lease && run && run.status !== RUN_STATUS.COMPLETED) {
      // Leases are stamped with wall-clock time, so they are judged by it too.
      let leaseStatus;
      try {
        leaseStatus = classifyLease(lease, { now: Date.now() }).status;
      } catch (error) {
        return holdCorruptLease(run, error);
      }
      if (leaseStatus === LEASE_STATUS.ACTIVE) {
        return setHold(ATTACH_HOLDS.ORCHESTRATOR_ELSEWHERE, `held by ${lease.workerInstanceId ?? 'unknown'} (pid ${lease.pid ?? '?'})`);
      }
      if (clock.now() < attach.nextAt) return setHold(ATTACH_HOLDS.BACKING_OFF, `until ${iso(attach.nextAt)}`);
      return startLoopTask(() => recoverRun(lease));
    }

    if (!(await bothWorkersRunning())) return setHold(ATTACH_HOLDS.WORKERS_NOT_HEALTHY);
    if (config.docker.enabled && !docker.ready) return setHold(ATTACH_HOLDS.DOCKER_NOT_READY, docker.detail);
    if (clock.now() < attach.nextAt) return setHold(ATTACH_HOLDS.BACKING_OFF, `until ${iso(attach.nextAt)}`);

    const heldRetry = run?.status === RUN_STATUS.PAUSED_FOR_HUMAN ? persisted.heldIncident : null;
    if (heldRetry) {
      persisted.heldIncident = null;
      if (heldRetry.kind) persisted.lastIncident = { kind: heldRetry.kind, goal: heldRetry.goal, outcome: 'RETRIED', from: heldRetry.from, at: iso() };
    }
    if (run?.status === RUN_STATUS.PAUSED) persisted.resumePending = null;
    if (!run || run.status === RUN_STATUS.COMPLETED) persisted.pendingStart = null;
    return startLoopTask(() => attachRun(args, why));
  }

  // -------------------------------------------------------------------------
  // Requests from the CLI
  // -------------------------------------------------------------------------

  async function handleResume(request) {
    const from = request.from ?? null;
    const resolved = request.resolved ?? null;
    await emit({ type: DAEMON_EVENTS.RESUME_REQUESTED, from, resolved: resolved !== null });
    const run = await readRun();
    // The operator resuming ends every pause the daemon held for them.
    persisted.ownedPause = null;
    attach.failures = 0;
    attach.nextAt = 0;

    if (!run || run.status === RUN_STATUS.COMPLETED) {
      if (!from) {
        log('RESUME', 'no run to resume; pass --from <goal> to start one');
        return;
      }
      persisted.pendingStart = { args: ['--from', from, ...(resolved ? ['--resolved', resolved] : [])], at: iso() };
    } else if (run.status === RUN_STATUS.PAUSED) {
      // The offset lets the attach see a pause asked for after this resume.
      persisted.resumePending = { runId: run.autonomousRunId, eventsOffset: await eventsSize() };
    } else if (run.status === RUN_STATUS.RUNNING) {
      if (run.pauseRequested) await auto.clearPause();
    } else if (run.status === RUN_STATUS.PAUSED_FOR_HUMAN) {
      if (run.pauseRequested) await auto.withdrawPauseRequest();
      if (resolved) {
        const goal = from ?? run.currentGoal;
        persisted.heldIncident = {
          kind: null, goal, runId: run.autonomousRunId, stage: HELD_STAGES.RETRY, from: goal, note: resolved, at: iso(),
        };
      } else if (persisted.heldIncident?.runId !== run.autonomousRunId) {
        log('RESUME', `run ${run.autonomousRunId} is PAUSED_FOR_HUMAN; pass --resolved "<what was resolved>"`);
        return;
      }
    }
    await emit({ type: DAEMON_EVENTS.RESUMED, runId: run?.autonomousRunId ?? null, status: run?.status ?? null });
    log('RESUME', `resume accepted (${run?.status ?? 'no run'})`);
  }

  async function requestStop(mode) {
    if (stopping && !(mode === 'now' && stopping.mode !== 'now')) return;
    stopping = { mode, at: iso() };
    await emit({ type: DAEMON_EVENTS.STOP_REQUESTED, mode });
    log('STOP', `stop requested (${mode})`);
    if (mode === 'now') {
      await finish('now');
      return;
    }
    const run = await readRun();
    if (run?.status === RUN_STATUS.RUNNING && !run.pauseRequested) {
      await requestOwnedPause(DAEMON_PAUSE_OWNERS.STOP, run);
      await emit({ type: DAEMON_EVENTS.STOP_PAUSE_REQUESTED, runId: run.autonomousRunId });
    } else if (persisted.ownedPause?.by === DAEMON_PAUSE_OWNERS.MEMORY) {
      // Memory may well be fine by the next start; the start decides again.
      persisted.ownedPause = { ...persisted.ownedPause, by: DAEMON_PAUSE_OWNERS.STOP };
    }
  }

  async function ignoreRequest(name, request, reason) {
    log('REQUEST', `${name} request ignored: ${reason}`);
    await emit({ type: DAEMON_EVENTS.REQUEST_IGNORED, request: name, requestedAt: request.requestedAt ?? null, reason });
  }

  /**
   * A request file outlives the process it was meant for: `stop --now` that
   * had to kill a stuck daemon, say, leaves its request behind. A stop asked
   * before this daemon started was meant for an earlier one. A resume asked
   * while the daemon was down is legitimate (`--resume` before `start`), up
   * to an age.
   */
  async function handleRequests() {
    const requests = await dstore.takeRequests().catch(() => ({}));
    const at = (request) => Date.parse(request?.requestedAt ?? '');
    if (requests.stop) {
      if (at(requests.stop) < startedAtWallMs) {
        await ignoreRequest('stop', requests.stop, `asked at ${requests.stop.requestedAt}, before this daemon started at ${new Date(startedAtWallMs).toISOString()}`);
      } else {
        await requestStop(requests.stop.mode === 'now' ? 'now' : 'graceful');
      }
    }
    if (requests.resume) {
      if (Date.now() - at(requests.resume) > RESUME_REQUEST_MAX_AGE_MS) {
        await ignoreRequest('resume', requests.resume, `asked at ${requests.resume.requestedAt}, older than ${RESUME_REQUEST_MAX_AGE_MS / 3_600_000}h`);
      } else if (stopping) {
        await ignoreRequest('resume', requests.resume, `the daemon is stopping (${stopping.mode})`);
        await notify({
          title: 'IA Loop: retomada ignorada',
          text: 'O daemon está parando; a retomada foi descartada. Depois de iniciar de novo, rode npm run ia-loop:daemon -- --resume.',
        });
      } else {
        await handleResume(requests.resume);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stopping
  // -------------------------------------------------------------------------

  /**
   * A graceful stop finishes only once the loop is at rest: run-auto has
   * reached the boundary and exited, and no job, worktree or busy worker is
   * left (pause-safety.mjs, the same judgement `ia-loop:pause -- --wait` uses).
   * "RUNNING without an orchestrator" is not a blocker here: with no run-auto
   * child there is nothing that could move the run, so there is nothing to
   * wait for.
   */
  /**
   * The safe-window blockers that matter to a daemon with no loop task.
   *
   * With no run-auto child, a RUNNING run cannot move, so it is not waited
   * for. Neither is a loop lease that is no longer ACTIVE: its run-auto is
   * dead (killed, rebooted), nothing will ever release it, and the next start
   * recovers it. An ACTIVE lease the daemon did not take is a live
   * orchestrator elsewhere, and that one is waited for.
   */
  async function safeWindowBlockers() {
    try {
      const facts = await readSafeWindowFacts(stateDir);
      const now = Date.now();
      let orphanLease = false;
      if (facts.loopLease && !loop.task) {
        try { orphanLease = classifyLease(facts.loopLease, { now }).status !== LEASE_STATUS.ACTIVE; } catch { orphanLease = false; }
      }
      return judgeSafeWindow({ ...facts, now }).blockers.filter((b) => b.code !== SAFE_WINDOW_BLOCKERS.RUN_RUNNING_WITHOUT_ORCHESTRATOR
        && !(orphanLease && [SAFE_WINDOW_BLOCKERS.RUN_RUNNING, SAFE_WINDOW_BLOCKERS.ORCHESTRATOR_HOLDS_LOOP].includes(b.code)));
    } catch (error) {
      return [{ code: SAFE_WINDOW_BLOCKERS.STATE_UNREADABLE, detail: error.message }];
    }
  }

  async function progressStop() {
    if (stopping?.mode !== 'graceful' || finishing) return;
    if (loop.task) {
      stopBlockers = [`${loop.child?.name ?? 'a loop task'} is still running (it stops at the next safe boundary)`];
      return;
    }
    const blockers = await safeWindowBlockers();
    const signature = blockers.map((b) => b.code).join(',');
    stopBlockers = blockers.map((b) => b.detail);
    if (blockers.length) {
      if (signature !== lastStopSignature) {
        lastStopSignature = signature;
        log('STOP', `waiting for a safe window: ${blockers.map((b) => b.detail).join('; ')}`);
      }
      return;
    }
    await finish('graceful');
  }

  async function waitForExit(handle, ms) {
    return Promise.race([handle.exited.then(() => true), clock.sleep(ms).then(() => false)]);
  }

  async function finish(mode) {
    if (finishing) return;
    finishing = true;
    const live = Object.values(workers).filter((w) => w.handle);

    if (mode === 'graceful' || mode === 'reload') {
      // Asked, then waited for: a worker that releases its own role lease
      // lets the next start begin at once.
      const handles = live.map((worker) => worker.handle);
      for (const handle of handles) handle.send?.(DAEMON_SHUTDOWN_MESSAGE);
      await Promise.all(handles.map(async (handle) => {
        if (!(await waitForExit(handle, config.workers.stopGraceMs))) {
          log('STOP', `pid ${handle.pid} did not stop in time; killing its tree`);
          await killTree(handle.pid);
        }
      }));
      if (loop.child?.handle?.pid) await killTree(loop.child.handle.pid);
    } else {
      // Leases are left exactly as they are: the next start recovers them.
      const pids = [loop.child?.handle?.pid, ...live.map((w) => w.handle?.pid)].filter(Number.isInteger);
      await Promise.all(pids.map((p) => killTree(p)));
    }

    stopped = true;
    await writeSnapshot({ stoppedAt: iso(), stopMode: mode });
    await emit({ type: DAEMON_EVENTS.STOPPED, mode });
    log('STOP', `stopped (${mode})`);
    resolveDone({ mode, ...(mode === 'reload' ? { codeVersion: code.changed?.version ?? null } : {}) });
  }

  // -------------------------------------------------------------------------
  // The daemon's own code
  // -------------------------------------------------------------------------

  async function readCodeVersion() {
    if (!codeVersion) return null;
    try {
      return (await codeVersion()) ?? null;
    } catch (error) {
      log('WARN', `cannot fingerprint the daemon code: ${error.message}`);
      return null;
    }
  }

  /**
   * A running process keeps executing the code it loaded at start, so an
   * edited daemon never runs its fix until someone restarts it. Workers have
   * the same problem and exit WORKER_CODE_CHANGED; the daemon notices the
   * same way, by fingerprint, and reloads itself (maybeReload).
   */
  function maybeCheckCode() {
    if (!codeVersion || code.task || code.changed || finishing) return;
    if (code.lastCheckAt !== null && clock.now() - code.lastCheckAt < config.reload.checkIntervalMs) return;
    code.lastCheckAt = clock.now();
    code.task = (async () => {
      const version = await readCodeVersion();
      if (!version || !code.boot || version === code.boot) return;
      code.changed = { version, at: iso(), holdUntil: clock.now() + config.reload.holdAttachMs };
      log('RELOAD', `daemon code changed (${code.boot} -> ${version})`);
      await emit({ type: DAEMON_EVENTS.CODE_CHANGED, from: code.boot, to: version, reload: config.reload.enabled });
      await notify({
        title: 'IA Loop: o código do daemon mudou',
        text: config.reload.enabled
          ? 'O daemon se reinicia sozinho na próxima janela segura (sem run-auto nem job ativo).'
          : 'A recarga automática está desligada: reinicie com npm run ia-loop:stop e npm run ia-loop:start.',
        key: `code:${version}`,
      });
    })().catch((error) => log('ERROR', `code check failed: ${error.message}`)).finally(() => { code.task = null; });
  }

  /**
   * Reloads once the loop is at rest: no run-auto child (a run-auto lives
   * for a whole run and is never cut short for this) and the same safe
   * window a graceful stop waits for. While the window is shut by work that
   * is finishing, no new run-auto is attached, so the window can open — but
   * only for `holdAttachMs`: a window held shut by something that does not
   * end must not stop the loop. After that the loop attaches as usual and the
   * reload waits for run-auto to exit.
   */
  async function maybeReload() {
    if (!code.changed || !config.reload.enabled || loop.task || stopping) return false;
    const blockers = await safeWindowBlockers();
    if (blockers.length) {
      if (clock.now() < code.changed.holdUntil) {
        setHold(ATTACH_HOLDS.RELOAD_PENDING, blockers.map((b) => b.detail).join('; '));
        return true;
      }
      return false;
    }
    log('RELOAD', `reloading the daemon (code ${code.boot} -> ${code.changed.version})`);
    await emit({ type: DAEMON_EVENTS.RELOADING, from: code.boot, to: code.changed.version });
    await finish('reload');
    return true;
  }

  // -------------------------------------------------------------------------
  // Snapshot
  // -------------------------------------------------------------------------

  function snapshot(extra = {}) {
    const children = Object.values(workers).map((w) => ({
      name: w.name,
      pid: w.handle?.pid ?? null,
      startedAt: w.handle && w.startedAtMs !== null ? iso(w.startedAtMs) : null,
      restarts: w.restarts,
      lastExit: w.lastExit,
      nextStartAt: !w.handle && !stopped && Number.isFinite(w.nextStartAt) ? iso(Math.max(w.nextStartAt, clock.now())) : null,
    }));
    if (loop.child) {
      children.push({ name: loop.child.name, pid: loop.child.handle.pid ?? null, startedAt: iso(loop.child.startedAtMs), restarts: 0, lastExit: null });
    }
    return {
      pid,
      startedAt,
      updatedAt: iso(),
      logDir,
      stopping: stopping && !stopped ? stopping : null,
      stopBlockers: stopping && !stopped ? stopBlockers : [],
      children: stopped ? [] : children,
      attachHold: attach.hold ? `${attach.hold}${attach.holdDetail ? ` — ${attach.holdDetail}` : ''}` : null,
      attachFailures: attach.failures,
      docker: config.docker.enabled
        ? { ready: docker.ready, checking: docker.checking, detail: docker.detail, checkedAt: docker.checkedAt === null ? null : iso(docker.checkedAt) }
        : null,
      memory: { percent: memory.percent, at: memory.at, high: memory.high },
      code: { boot: code.boot, changed: code.changed ? { version: code.changed.version, at: code.changed.at } : null, reload: config.reload.enabled },
      ...persisted,
      ...extra,
    };
  }

  async function writeSnapshot(extra = {}) {
    try {
      await dstore.writeSnapshot(snapshot(extra));
    } catch (error) {
      log('ERROR', `cannot write the daemon snapshot: ${error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async function start() {
    const previous = await dstore.readSnapshot();
    if (previous) {
      for (const key of Object.keys(persisted)) {
        if (previous[key] !== undefined) persisted[key] = previous[key];
      }
      persisted.incidentCounts ??= {};
      persisted.notified ??= {};
    }
    code.boot = await readCodeVersion();
    log('START', `daemon pid ${pid} started${code.boot ? ` (code ${code.boot})` : ''}`);
    await emit({ type: DAEMON_EVENTS.STARTED, pid, docker: config.docker.enabled, memory: config.memory.enabled, sweep: config.sweep.enabled });

    // A pause the previous daemon asked for to stop cleanly is this start's to
    // withdraw — unless a person took it over meanwhile.
    await reconcileOwnedPause();
    if (persisted.ownedPause?.by === DAEMON_PAUSE_OWNERS.STOP) {
      await releaseOwnedPause(DAEMON_EVENTS.RESUMED, 'the pause requested by ia-loop:stop is withdrawn at start');
    }
    await writeSnapshot();
  }

  async function tick() {
    if (stopped || ticking) return;
    ticking = true;
    try {
      await handleRequests();
      if (stopped || finishing) return;
      ensureWorkers();
      maybeCheckDocker();
      // Ownership first: a memory reading must never act on a pause the
      // operator has taken over since the last tick.
      if (persisted.ownedPause) await reconcileOwnedPause();
      maybeSampleMemory();
      maybeSweep();
      maybeCheckCode();
      if (stopping) await progressStop();
      else if (!(await maybeReload())) await decideAttach();
    } catch (error) {
      log('ERROR', `tick failed: ${error.stack ?? error.message}`);
    } finally {
      // Even a failed tick leaves a fresh snapshot: status must show the
      // daemon is alive and what it last held on.
      if (!stopped && !finishing) await writeSnapshot();
      ticking = false;
    }
  }

  /** Runs until stopped. The real entry point; tests drive tick() instead. */
  async function runForever() {
    await start();
    while (!stopped) {
      await tick();
      if (stopped) break;
      await clock.sleep(config.tickMs);
    }
    return done;
  }

  /** Waits for every task in flight. For tests and for a clean exit. */
  async function settle() {
    for (let i = 0; i < 50; i += 1) {
      // Exit handlers are queued as microtasks; let them start first.
      await new Promise((resolve) => { setImmediate(resolve); });
      const pending = [loop.task, docker.task, memory.task, sweep.task, code.task, ...pendingExits].filter(Boolean);
      if (!pending.length) return;
      await Promise.all(pending);
    }
  }

  return {
    start,
    tick,
    runForever,
    settle,
    done,
    requestStop,
    get state() { return snapshot(); },
    get stopped() { return stopped; },
  };
}
