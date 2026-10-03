/**
 * IA Loop — daemon configuration.
 *
 * Same pattern as loop-config.mjs: every knob is a named value with a
 * default, and an environment variable overrides it. A malformed override
 * falls back to the default instead of turning into NaN or a zero that would
 * make the daemon spin.
 *
 * The defaults reproduce what the external supervisor scripts did by hand
 * (supervisor2.sh, supervisor-guard.sh, worker-keeper.sh, pause-maint.sh).
 */

function intFrom(env, name, fallback, { min = 0 } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min ? value : fallback;
}

function percentFrom(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : fallback;
}

/** On unless explicitly `0`/`false`/`off`. */
function enabledFrom(env, name) {
  const raw = String(env[name] ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(raw);
}

function listFrom(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined) return fallback;
  return Object.freeze(String(raw).split(',').map((item) => item.trim()).filter(Boolean));
}

export const DEFAULT_CONTAINERS = Object.freeze(['atendly_postgres_dev']);
export const DEFAULT_DOCKER_DESKTOP = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
export const DEFAULT_TASK_NAME = 'IA Loop Daemon';

export function readDaemonConfig(env = process.env) {
  // A low threshold at or above the high one would request and clear the
  // same pause on every sample; both fall back to the defaults instead.
  let memoryHigh = percentFrom(env, 'IA_LOOP_DAEMON_MEMORY_HIGH', 95);
  let memoryLow = percentFrom(env, 'IA_LOOP_DAEMON_MEMORY_LOW', 85);
  if (memoryLow >= memoryHigh) { memoryHigh = 95; memoryLow = 85; }

  return Object.freeze({
    /** How often the daemon looks at everything. Cheap: files and a pid table. */
    tickMs: intFrom(env, 'IA_LOOP_DAEMON_TICK_MS', 5_000, { min: 250 }),

    workers: Object.freeze({
      /** First restart delay; doubles with each consecutive crash. */
      restartBaseMs: intFrom(env, 'IA_LOOP_DAEMON_RESTART_BASE_MS', 5_000),
      restartMaxMs: intFrom(env, 'IA_LOOP_DAEMON_RESTART_MAX_MS', 5 * 60_000),
      /** This many crashes inside the window is a crash loop, not bad luck. */
      crashLimit: intFrom(env, 'IA_LOOP_DAEMON_CRASH_LIMIT', 5, { min: 1 }),
      crashWindowMs: intFrom(env, 'IA_LOOP_DAEMON_CRASH_WINDOW_MS', 10 * 60_000),
      /** A crash loop is escalated, then retried after this cool-down. */
      crashLoopCooldownMs: intFrom(env, 'IA_LOOP_DAEMON_CRASH_COOLDOWN_MS', 15 * 60_000),
      /**
       * Exit 20: another process holds the role, or the previous holder's
       * lease has not aged out yet (it reads ACTIVE for 90s after a hard
       * kill). Retrying sooner just repeats the refusal.
       */
      identityRetryMs: intFrom(env, 'IA_LOOP_DAEMON_IDENTITY_RETRY_MS', 60_000),
      /** How long a graceful stop waits for a worker before killing its tree. */
      stopGraceMs: intFrom(env, 'IA_LOOP_DAEMON_WORKER_STOP_GRACE_MS', 20_000),
    }),

    attach: Object.freeze({
      /** run-auto that exits with the run still RUNNING is re-attached with backoff. */
      backoffBaseMs: intFrom(env, 'IA_LOOP_DAEMON_ATTACH_BACKOFF_MS', 30_000),
      backoffMaxMs: intFrom(env, 'IA_LOOP_DAEMON_ATTACH_BACKOFF_MAX_MS', 10 * 60_000),
      /** Consecutive failed attaches before the operator is told. */
      failureLimit: intFrom(env, 'IA_LOOP_DAEMON_ATTACH_FAILURE_LIMIT', 5, { min: 1 }),
    }),

    incidents: Object.freeze({
      /** How long a heartbeat-lost retry waits for a worker of that role to come back. */
      workerReturnTimeoutMs: intFrom(env, 'IA_LOOP_DAEMON_WORKER_RETURN_TIMEOUT_MS', 5 * 60_000),
    }),

    docker: Object.freeze({
      enabled: enabledFrom(env, 'IA_LOOP_DAEMON_DOCKER'),
      desktopPath: env.IA_LOOP_DAEMON_DOCKER_DESKTOP || DEFAULT_DOCKER_DESKTOP,
      /** Wait for `docker info` after starting Docker Desktop, before the stale-socket fix. */
      startTimeoutMs: intFrom(env, 'IA_LOOP_DAEMON_DOCKER_START_TIMEOUT_MS', 4 * 60_000),
      containers: listFrom(env, 'IA_LOOP_DAEMON_CONTAINERS', DEFAULT_CONTAINERS),
      healthTimeoutMs: intFrom(env, 'IA_LOOP_DAEMON_CONTAINER_HEALTH_TIMEOUT_MS', 3 * 60_000),
      /** Re-check while running; a failure only holds the next attach. */
      checkIntervalMs: intFrom(env, 'IA_LOOP_DAEMON_DOCKER_CHECK_INTERVAL_MS', 5 * 60_000),
      pollMs: intFrom(env, 'IA_LOOP_DAEMON_DOCKER_POLL_MS', 5_000, { min: 1 }),
    }),

    memory: Object.freeze({
      enabled: enabledFrom(env, 'IA_LOOP_DAEMON_MEMORY'),
      /** Commit charge / commit limit, in percent, that requests a pause. */
      highPercent: memoryHigh,
      /** Below this for `clearAfterMs`, the daemon's own pause is withdrawn. */
      lowPercent: memoryLow,
      clearAfterMs: intFrom(env, 'IA_LOOP_DAEMON_MEMORY_CLEAR_AFTER_MS', 10 * 60_000),
      intervalMs: intFrom(env, 'IA_LOOP_DAEMON_MEMORY_INTERVAL_MS', 60_000, { min: 1 }),
    }),

    sweep: Object.freeze({
      // The worker's own switch turns this off too: one decision, not two.
      enabled: enabledFrom(env, 'IA_LOOP_DAEMON_SWEEP') && enabledFrom(env, 'IA_LOOP_ORPHAN_SWEEP'),
      intervalMs: intFrom(env, 'IA_LOOP_DAEMON_SWEEP_INTERVAL_MS', 10 * 60_000, { min: 1 }),
    }),

    reload: Object.freeze({
      /** Reload the daemon by itself when its own code changes; off: only tell the operator. */
      enabled: enabledFrom(env, 'IA_LOOP_DAEMON_RELOAD'),
      /** How often the daemon fingerprints its own code (a few hundred stat calls). */
      checkIntervalMs: intFrom(env, 'IA_LOOP_DAEMON_CODE_CHECK_INTERVAL_MS', 60_000, { min: 1 }),
      /** How long a pending reload may hold back a new attach while work drains. */
      holdAttachMs: intFrom(env, 'IA_LOOP_DAEMON_RELOAD_HOLD_MS', 10 * 60_000),
    }),

    notify: Object.freeze({
      toast: enabledFrom(env, 'IA_LOOP_DAEMON_TOAST'),
    }),

    logs: Object.freeze({
      maxBytes: intFrom(env, 'IA_LOOP_DAEMON_LOG_MAX_BYTES', 10 * 1024 * 1024, { min: 1024 }),
      keep: intFrom(env, 'IA_LOOP_DAEMON_LOG_KEEP', 3, { min: 1 }),
    }),

    taskName: env.IA_LOOP_DAEMON_TASK_NAME || DEFAULT_TASK_NAME,
  });
}

export const DAEMON_CONFIG = readDaemonConfig();
