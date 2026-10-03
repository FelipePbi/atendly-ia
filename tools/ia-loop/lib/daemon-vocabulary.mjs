/**
 * IA Loop — the daemon's names, defined once.
 *
 * The daemon (run-daemon.mjs) replaces the external supervisor scripts that
 * kept the loop alive by hand. It writes events, keeps children, owns pauses
 * and recognises a catalogue of known transient stops. Every one of those has
 * a name that a test, the status screen and the README all read, so the names
 * live here and only here: this codebase has a history of bugs from the same
 * word being spelled twice in two places.
 */

/** Every event the daemon appends to `events.jsonl`. Always DAEMON_*. */
export const DAEMON_EVENTS = Object.freeze({
  STARTED: 'DAEMON_STARTED',
  STOP_REQUESTED: 'DAEMON_STOP_REQUESTED',
  STOP_PAUSE_REQUESTED: 'DAEMON_STOP_PAUSE_REQUESTED',
  STOPPED: 'DAEMON_STOPPED',
  CHILD_STARTED: 'DAEMON_CHILD_STARTED',
  CHILD_EXITED: 'DAEMON_CHILD_EXITED',
  WORKER_CRASH_LOOP: 'DAEMON_WORKER_CRASH_LOOP',
  ATTACHED: 'DAEMON_ATTACHED',
  ATTACH_HELD: 'DAEMON_ATTACH_HELD',
  ATTACH_FAILING: 'DAEMON_ATTACH_FAILING',
  RECOVERY_STARTED: 'DAEMON_RECOVERY_STARTED',
  RECOVERY_FINISHED: 'DAEMON_RECOVERY_FINISHED',
  HUMAN_REQUIRED: 'DAEMON_HUMAN_REQUIRED',
  INCIDENT_DETECTED: 'DAEMON_INCIDENT_DETECTED',
  INCIDENT_RETRY: 'DAEMON_INCIDENT_RETRY',
  INCIDENT_GAVE_UP: 'DAEMON_INCIDENT_GAVE_UP',
  INCIDENT_LIMIT_REACHED: 'DAEMON_INCIDENT_LIMIT_REACHED',
  INCIDENT_HELD: 'DAEMON_INCIDENT_HELD',
  BRANCH_REMOVED: 'DAEMON_BRANCH_REMOVED',
  REPLAN_AUTHORIZED: 'DAEMON_REPLAN_AUTHORIZED',
  RUN_COMPLETED: 'DAEMON_RUN_COMPLETED',
  RESUME_REQUESTED: 'DAEMON_RESUME_REQUESTED',
  RESUMED: 'DAEMON_RESUMED',
  DOCKER_UNAVAILABLE: 'DAEMON_DOCKER_UNAVAILABLE',
  DOCKER_STALE_SOCKET_FIX: 'DAEMON_DOCKER_STALE_SOCKET_FIX',
  DOCKER_READY: 'DAEMON_DOCKER_READY',
  DOCKER_FAILED: 'DAEMON_DOCKER_FAILED',
  CONTAINER_STARTED: 'DAEMON_CONTAINER_STARTED',
  MEMORY_HIGH: 'DAEMON_MEMORY_HIGH',
  MEMORY_PAUSE_REQUESTED: 'DAEMON_MEMORY_PAUSE_REQUESTED',
  MEMORY_PAUSE_CLEARED: 'DAEMON_MEMORY_PAUSE_CLEARED',
  PAUSE_HANDED_TO_OPERATOR: 'DAEMON_PAUSE_HANDED_TO_OPERATOR',
  ORPHAN_SWEEP: 'DAEMON_ORPHAN_SWEEP',
  NOTIFICATION: 'DAEMON_NOTIFICATION',
  /** A stop or resume request that was not acted on, and why. */
  REQUEST_IGNORED: 'DAEMON_REQUEST_IGNORED',
  /** A resume the operator cancelled by asking for a pause after it. */
  RESUME_CANCELLED: 'DAEMON_RESUME_CANCELLED',
  /** The loop lease on disk cannot be parsed. */
  LOOP_LEASE_CORRUPT: 'DAEMON_LOOP_LEASE_CORRUPT',
  /** The daemon's own code changed on disk since it started. */
  CODE_CHANGED: 'DAEMON_CODE_CHANGED',
  /** The daemon stops to hand over to a copy of itself running the new code. */
  RELOADING: 'DAEMON_RELOADING',
});

/**
 * The processes the daemon owns, by the name their log file carries.
 * Workers are kept alive for the daemon's whole life; the others run on demand.
 */
export const DAEMON_CHILDREN = Object.freeze({
  DEVELOPER: 'developer',
  TECH_LEAD: 'tech-lead',
  RUN_AUTO: 'run-auto',
  RUN_CLOSE: 'run-close',
  RUN_RECOVER: 'run-recover',
});

/** Child name → the worker role the job store and the leases use. */
export const DAEMON_WORKER_ROLES = Object.freeze({
  [DAEMON_CHILDREN.DEVELOPER]: 'developer',
  [DAEMON_CHILDREN.TECH_LEAD]: 'tech_lead',
});

/**
 * The known transient stops the daemon may retry by itself. Anything not in
 * this list stays PAUSED_FOR_HUMAN and the operator is notified.
 *
 *   GOAL_GIT_TRANSIENT       the Goal stopped on GIT_FAILED with a Windows
 *                            filesystem race ("unable to stat just-written
 *                            file", "unable to create file") — including the
 *                            `git worktree add` of the Goal's own worktree.
 *   PLANNING_WORKTREE_ADD    the closure stopped creating the planning
 *                            worktree (`git worktree add -b ai-loop/plan-…`).
 *   CLOSURE_GIT_TRANSIENT    the closure stopped on a transient GIT_FAILED,
 *                            `git rev-parse HEAD` included.
 *   PLANNING_MODEL_CONFLICT  planning refused by PRIMARY_MODEL_EVIDENCE_CONFLICT
 *                            (the server switched models mid-stream).
 *   WORKER_HEARTBEAT_LOST    UNKNOWN_FATAL because a worker stopped
 *                            heartbeating — retried only once a worker of
 *                            that role is alive again.
 */
export const DAEMON_INCIDENTS = Object.freeze({
  GOAL_GIT_TRANSIENT: 'GOAL_GIT_TRANSIENT',
  PLANNING_WORKTREE_ADD: 'PLANNING_WORKTREE_ADD',
  CLOSURE_GIT_TRANSIENT: 'CLOSURE_GIT_TRANSIENT',
  PLANNING_MODEL_CONFLICT: 'PLANNING_MODEL_CONFLICT',
  WORKER_HEARTBEAT_LOST: 'WORKER_HEARTBEAT_LOST',
});

/**
 * Who asked for a pause the daemon may later withdraw. A pause the operator
 * asked for has no owner here, and the daemon never withdraws it.
 */
export const DAEMON_PAUSE_OWNERS = Object.freeze({
  /** Committed memory crossed the high threshold. */
  MEMORY: 'MEMORY',
  /** `ia-loop:stop` asked for it; the next `ia-loop:start` resumes. */
  STOP: 'STOP',
});

/**
 * What the daemon writes in the run's `pauseRequestedBy` when it asks for a
 * pause. Any other value (`operator`, or none) is somebody else's pause, and
 * the daemon never withdraws it.
 */
export const DAEMON_PAUSE_REQUESTER = 'daemon';

/**
 * Where a held stop is in its handling. A catalogued incident found while a
 * pause was requested waits at REMEDY; one whose remedy already ran (or that
 * the operator resolved with `--resume --resolved`) waits at RETRY, and only
 * the `run-auto --from … --resolved …` is left to do.
 */
export const HELD_STAGES = Object.freeze({
  REMEDY: 'REMEDY',
  RETRY: 'RETRY',
});

/** Why the daemon is not attaching run-auto right now, for status and events. */
export const ATTACH_HOLDS = Object.freeze({
  NO_RUN: 'NO_RUN',
  RUN_COMPLETED: 'RUN_COMPLETED',
  RUN_PAUSED: 'RUN_PAUSED',
  PAUSE_REQUESTED: 'PAUSE_REQUESTED',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
  WORKERS_NOT_HEALTHY: 'WORKERS_NOT_HEALTHY',
  DOCKER_NOT_READY: 'DOCKER_NOT_READY',
  /** Committed memory is above the high threshold: no new work starts. */
  MEMORY_HIGH: 'MEMORY_HIGH',
  /** The first memory reading is still running: nothing starts before it is known. */
  MEMORY_CHECKING: 'MEMORY_CHECKING',
  ORCHESTRATOR_ELSEWHERE: 'ORCHESTRATOR_ELSEWHERE',
  BACKING_OFF: 'BACKING_OFF',
  STOPPING: 'STOPPING',
  /** The loop lease on disk is unreadable: a person has to look at it. */
  LOOP_LEASE_CORRUPT: 'LOOP_LEASE_CORRUPT',
  /** The loop lease could not be read right now (locked, mid-write); the next tick reads again. */
  LOOP_LEASE_UNREADABLE: 'LOOP_LEASE_UNREADABLE',
  /** The daemon's own code changed: no new attach until it has reloaded. */
  RELOAD_PENDING: 'RELOAD_PENDING',
});

/**
 * The IPC message that asks a daemon-owned worker to stop gracefully.
 *
 * On Windows every "signal" Node can send is TerminateProcess, so a worker
 * killed by signal never releases its role lease — and the next worker then
 * refuses to start for the 90s the stale lease still reads ACTIVE. The daemon
 * starts workers with an IPC channel and asks over it instead.
 */
export const DAEMON_SHUTDOWN_MESSAGE = 'IA_LOOP_DAEMON_SHUTDOWN';

/** Set in a daemon child's environment, so a child knows the channel is ours. */
export const DAEMON_CHILD_ENV = 'IA_LOOP_DAEMON_CHILD';

/** The role key of the daemon's single-instance lease (`leases/workers/daemon.lock`). */
export const DAEMON_LEASE_ROLE = 'daemon';
