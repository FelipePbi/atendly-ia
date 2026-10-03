/**
 * IA Loop — the catalogue of stops the daemon may retry by itself.
 *
 * A run that stops PAUSED_FOR_HUMAN is a person's problem by default. Over
 * two days of supervision, five kinds of stop turned out to be nothing of the
 * sort: Windows filesystem races inside git, a planning worktree that failed
 * to materialise, a `git rev-parse` that failed once, a server that switched
 * models mid-stream, and a worker that was restarted under a running round.
 * The supervisor (supervisor2.sh) recognised them from run-auto's output and
 * retried them with `--from <goal> --resolved "<note>"`. This is the same
 * catalogue, and nothing outside it is ever retried.
 *
 * Classification is pure — run, output, events, runtime in; a verdict out — so
 * every entry is tested against the real text the harness prints. The
 * remedies take their side effects (git, run-close, sleeps) as functions.
 */

import { join } from 'node:path';

import { DAEMON_EVENTS, DAEMON_INCIDENTS } from './daemon-vocabulary.mjs';
import { WORKER_HEALTH } from './worker-registry.mjs';

/**
 * Per-incident limits and settle delays. The limit counts retries of one kind
 * for one Goal; past it the stop goes to the operator.
 */
export const INCIDENT_CATALOGUE = Object.freeze({
  [DAEMON_INCIDENTS.PLANNING_MODEL_CONFLICT]: Object.freeze({ limit: 2, settleMs: 30_000 }),
  [DAEMON_INCIDENTS.PLANNING_WORKTREE_ADD]: Object.freeze({ limit: 3, settleMs: 15_000 }),
  [DAEMON_INCIDENTS.CLOSURE_GIT_TRANSIENT]: Object.freeze({ limit: 3, settleMs: 15_000 }),
  [DAEMON_INCIDENTS.GOAL_GIT_TRANSIENT]: Object.freeze({ limit: 3, settleMs: 20_000 }),
  [DAEMON_INCIDENTS.WORKER_HEARTBEAT_LOST]: Object.freeze({ limit: 3, settleMs: 0 }),
});

/** Inner attempts of `run-close` inside one closure incident (supervisor2.sh: 3). */
export const CLOSURE_REDO_ATTEMPTS = 3;

/**
 * The Windows filesystem races git reports. Seen verbatim: "unable to stat
 * just-written file", "unable to create file …: No such file or directory",
 * "Could not reset index file", plus the antivirus/indexer pair.
 */
export const TRANSIENT_FS_PATTERN = /unable to stat|No such file or directory|unable to create file|Could not reset index|Permission denied|being used by another process/;

const GOAL_STOP = /Goal (\d{3}) needs a human: ([A-Z_]+)/g;
const CLOSURE_STOP = /Closure of Goal (\d{3}) needs a human: ([A-Z_]+)/g;
const PLANNING_WORKTREE_ADD = /git worktree add -b ai-loop\/plan-after-goal-(\d{3})/g;
const GIT_FAILED_BLOCKER = /Blocker: \[GIT_FAILED\]/;
const REV_PARSE_FAILED = /git rev-parse[^\n]*failed/;
const HEARTBEAT_LOST_LINE = /The (tech_lead|developer) worker is no longer heartbeating/g;

const lastMatch = (pattern, text) => {
  let last = null;
  for (const match of text.matchAll(pattern)) last = match;
  return last;
};

/**
 * The part of the output that explains the stop: what came before the last
 * "needs a human" line, bounded. An earlier GIT_FAILED that a phase retried
 * on its own and got past must not classify a later, unrelated stop.
 */
function evidenceWindow(output, stopIndex) {
  const upTo = stopIndex >= 0 ? output.slice(0, stopIndex + 200) : output;
  return upTo.slice(-12_000);
}

/** The first line matching a pattern, trimmed, for the `--resolved` note. */
function firstLine(text, pattern) {
  const line = text.split('\n').find((candidate) => pattern.test(candidate));
  return line ? line.trim().slice(0, 200) : null;
}

/**
 * Which catalogued stop this is, if any.
 *
 * @param run      the autonomous run, PAUSED_FOR_HUMAN
 * @param output   everything the run-auto invocation printed (its children included)
 * @param events   events.jsonl records appended since that invocation started
 * @param runtime  runtime.json now
 * @returns {{ kind, goal, evidence, role?, planningJobId? } | { kind: null, goal, reason }}
 */
export function classifyHumanStop({ run, output = '', events = [], runtime = null }) {
  const reason = run?.humanRequired?.reason ?? null;
  const goalStop = lastMatch(GOAL_STOP, output);
  const closureStop = lastMatch(CLOSURE_STOP, output);
  // The closure line also matches the Goal pattern ("…of Goal 101 needs…");
  // whichever came last is the stop.
  const closureIsLast = closureStop && (!goalStop || closureStop.index + 'Closure of '.length >= goalStop.index);
  const stop = closureIsLast ? closureStop : goalStop;
  const goal = stop?.[1] ?? run?.currentGoal ?? null;
  const window = evidenceWindow(output, stop?.index ?? -1);

  if (closureIsLast) {
    const closedGoal = closureStop[1];

    // Planning refused because the stream named two models.
    const planningJobId = runtime?.closure?.goal === closedGoal ? runtime.closure.planningJobId ?? null : null;
    if (closureStop[2] === 'HARNESS_ERROR' && planningJobId) {
      const conflict = events.some((event) => {
        const text = JSON.stringify(event);
        return text.includes(planningJobId) && text.includes('PRIMARY_MODEL_EVIDENCE_CONFLICT');
      });
      if (conflict) {
        return {
          kind: DAEMON_INCIDENTS.PLANNING_MODEL_CONFLICT, goal: closedGoal, planningJobId,
          evidence: `planning job ${planningJobId} refused: PRIMARY_MODEL_EVIDENCE_CONFLICT`,
        };
      }
    }

    if (GIT_FAILED_BLOCKER.test(window)) {
      const planning = lastMatch(PLANNING_WORKTREE_ADD, window);
      if (planning) {
        return {
          kind: DAEMON_INCIDENTS.PLANNING_WORKTREE_ADD, goal: planning[1],
          evidence: firstLine(window, TRANSIENT_FS_PATTERN) ?? firstLine(window, /git worktree add/),
        };
      }
      if (REV_PARSE_FAILED.test(window) || TRANSIENT_FS_PATTERN.test(window)) {
        return {
          kind: DAEMON_INCIDENTS.CLOSURE_GIT_TRANSIENT, goal: closedGoal,
          evidence: firstLine(window, REV_PARSE_FAILED) ?? firstLine(window, TRANSIENT_FS_PATTERN),
        };
      }
    }
  } else if (goalStop && GIT_FAILED_BLOCKER.test(window) && TRANSIENT_FS_PATTERN.test(window)) {
    return {
      kind: DAEMON_INCIDENTS.GOAL_GIT_TRANSIENT, goal,
      evidence: firstLine(window, TRANSIENT_FS_PATTERN),
    };
  }

  if (stop && (stop[2] === 'UNKNOWN_FATAL' || reason === 'UNKNOWN_FATAL')) {
    // run-goal records why it stopped watching (OBSERVER_STOPPED); the
    // printed line is the fallback for an event log that could not be read.
    const observed = events.filter((event) => event.type === 'OBSERVER_STOPPED'
      && event.reason === 'WORKER_OFFLINE' && (!event.goal || event.goal === goal));
    const printed = lastMatch(HEARTBEAT_LOST_LINE, window);
    const role = observed.at(-1)?.role ?? printed?.[1] ?? null;
    if (role) {
      return {
        kind: DAEMON_INCIDENTS.WORKER_HEARTBEAT_LOST, goal, role,
        evidence: `the ${role} worker stopped heartbeating during Goal ${goal}`,
      };
    }
  }

  return { kind: null, goal, reason: reason ?? stop?.[2] ?? 'UNKNOWN' };
}

/** `kind:goal`, the key retries are counted under. */
export const incidentKey = (incident) => `${incident.kind}:${incident.goal}`;

/** Whether one more retry of this incident is within its limit. */
export function incidentBudget(incident, counts = {}) {
  const limit = INCIDENT_CATALOGUE[incident.kind]?.limit ?? 0;
  const used = counts[incidentKey(incident)] ?? 0;
  return { allowed: used < limit, used, limit, attempt: used + 1 };
}

/** The `--resolved` note: who decided, what was seen, which retry this is. */
export function resolvedNoteFor(incident, { attempt, limit, nextGoal = null }) {
  const where = nextGoal && nextGoal !== incident.goal
    ? `fechamento do Goal ${incident.goal} refeito; ${nextGoal} READY`
    : `Goal ${incident.goal}`;
  return `ia-loop daemon (autorizado pelo operador): falha transitória catalogada ${incident.kind} `
    + `(${where}; tentativa ${attempt}/${limit})${incident.evidence ? `: ${incident.evidence}` : ''}`;
}

// ---------------------------------------------------------------------------
// Remedies
// ---------------------------------------------------------------------------

/**
 * Removes a branch that a failed `git worktree add -b` left behind: no
 * worktree on disk and no commit of its own. Such a branch is only debris of
 * the attempt, and it makes the next one stop as GOAL_BOUNDARY_AMBIGUOUS.
 * A branch with ANY commit not on HEAD is kept, whatever else is true.
 */
export async function removeEmptyBranch({ git, branch, worktreeDir, pathExists }) {
  if (worktreeDir && await pathExists(worktreeDir)) return { removed: false, reason: 'WORKTREE_EXISTS' };
  const exists = await git(['rev-parse', '--verify', '-q', `refs/heads/${branch}`]);
  if (exists.code !== 0) return { removed: false, reason: 'NO_BRANCH' };
  const own = await git(['rev-list', '--count', branch, '--not', 'HEAD']);
  if (own.code !== 0 || own.stdout.trim() !== '0') return { removed: false, reason: 'HAS_OWN_COMMITS' };
  await git(['worktree', 'prune']);
  const deleted = await git(['branch', '-D', branch]);
  return { removed: deleted.code === 0, reason: deleted.code === 0 ? null : 'DELETE_FAILED' };
}

/**
 * Re-runs the closure until it names the next Goal, the way supervisor2.sh
 * did: up to three times, and only again while the failure still looks like
 * the same filesystem race.
 */
async function redoClosure({ incident, deps, cleanupBranch }) {
  const { git, runScript, readRuntime, pathExists, sleep, emit, repoRoot } = deps;
  const settleMs = INCIDENT_CATALOGUE[incident.kind].settleMs;

  for (let attempt = 1; attempt <= CLOSURE_REDO_ATTEMPTS; attempt += 1) {
    if (cleanupBranch) {
      const branch = `ai-loop/plan-after-goal-${incident.goal}`;
      const removed = await removeEmptyBranch({
        git, branch, pathExists, worktreeDir: join(repoRoot, '.ai-worktrees', `plan-after-goal-${incident.goal}`),
      });
      if (removed.removed) await emit({ type: DAEMON_EVENTS.BRANCH_REMOVED, branch, goal: incident.goal, incident: incident.kind });
    }
    await git(['worktree', 'prune']);
    await sleep(settleMs);

    const closed = await runScript('run-close', [incident.goal]);
    const closure = (await readRuntime())?.closure ?? null;
    if (closed.code === 0 && closure?.goal === incident.goal) {
      if (closure.migrationComplete) return { action: 'GIVE_UP', reason: 'MIGRATION_COMPLETE_AFTER_CLOSURE' };
      if (closure.nextGoalId) return { action: 'RETRY', from: closure.nextGoalId };
    }
    if (!TRANSIENT_FS_PATTERN.test(closed.output ?? '') && !REV_PARSE_FAILED.test(closed.output ?? '')) break;
  }
  return { action: 'GIVE_UP', reason: 'CLOSURE_NOT_RECOVERED' };
}

/**
 * Applies the remedy of a catalogued incident.
 *
 * @returns {{ action: 'RETRY', from: string } | { action: 'GIVE_UP', reason: string }}
 */
export async function remedyIncident(incident, deps) {
  const { git, runScript, readRuntime, writeRuntime, pathExists, sleep, emit, repoRoot, savePatch, readWorkerHealth, now, workerReturnTimeoutMs } = deps;
  const settleMs = INCIDENT_CATALOGUE[incident.kind]?.settleMs ?? 0;

  switch (incident.kind) {
    case DAEMON_INCIDENTS.GOAL_GIT_TRANSIENT: {
      const branch = `ai-loop/goal-${incident.goal}`;
      const removed = await removeEmptyBranch({
        git, branch, pathExists, worktreeDir: join(repoRoot, '.ai-worktrees', `goal-${incident.goal}`),
      });
      if (removed.removed) await emit({ type: DAEMON_EVENTS.BRANCH_REMOVED, branch, goal: incident.goal, incident: incident.kind });
      await sleep(settleMs);
      return { action: 'RETRY', from: incident.goal };
    }

    case DAEMON_INCIDENTS.PLANNING_WORKTREE_ADD:
      return redoClosure({ incident, deps, cleanupBranch: true });

    case DAEMON_INCIDENTS.CLOSURE_GIT_TRANSIENT:
      return redoClosure({ incident, deps, cleanupBranch: false });

    case DAEMON_INCIDENTS.PLANNING_MODEL_CONFLICT: {
      // The refused planning is discarded, never edited: its diff is kept as
      // a patch and the runtime as it was, then planning starts over.
      const worktree = join(repoRoot, '.ai-worktrees', `plan-after-goal-${incident.goal}`);
      if (await pathExists(worktree)) {
        await git(['-C', worktree, 'add', '-N', '.']);
        const diff = await git(['-C', worktree, 'diff']);
        await savePatch(`plan-after-goal-${incident.goal}-${incident.planningJobId}.patch`, diff.stdout ?? '');
        await git(['worktree', 'remove', '--force', worktree]);
      }
      const branch = `ai-loop/plan-after-goal-${incident.goal}`;
      const removed = await removeEmptyBranch({ git, branch, pathExists, worktreeDir: worktree });
      if (removed.removed) await emit({ type: DAEMON_EVENTS.BRANCH_REMOVED, branch, goal: incident.goal, incident: incident.kind });

      const runtime = await readRuntime();
      await savePatch(`runtime-before-replan-${incident.goal}-${incident.planningJobId}.json`, `${JSON.stringify(runtime, null, 2)}\n`);
      const closure = { ...(runtime?.closure ?? {}) };
      delete closure.planningJobId;
      delete closure.planningBase;
      closure.planningWorktreeCreated = false;
      await writeRuntime({ ...runtime, closure });
      await emit({
        type: DAEMON_EVENTS.REPLAN_AUTHORIZED, goal: incident.goal,
        previousPlanningJobId: incident.planningJobId,
        reason: 'PRIMARY_MODEL_EVIDENCE_CONFLICT (the server switched models mid-stream)',
      });
      await sleep(settleMs);

      const closed = await runScript('run-close', [incident.goal]);
      const after = (await readRuntime())?.closure ?? null;
      if (closed.code === 0 && after?.goal === incident.goal && after.nextGoalId && !after.migrationComplete) {
        return { action: 'RETRY', from: after.nextGoalId };
      }
      return { action: 'GIVE_UP', reason: 'REPLANNING_PRODUCED_NO_NEXT_GOAL' };
    }

    case DAEMON_INCIDENTS.WORKER_HEARTBEAT_LOST: {
      // Retrying before a worker of that role is back would stop the same way.
      // The daemon restarts workers on its own; this only waits to see it.
      const deadline = now() + workerReturnTimeoutMs;
      for (;;) {
        const health = await readWorkerHealth(incident.role).catch(() => null);
        if (health?.health === WORKER_HEALTH.RUNNING) return { action: 'RETRY', from: incident.goal };
        if (now() >= deadline) return { action: 'GIVE_UP', reason: 'WORKER_DID_NOT_RETURN' };
        await sleep(5_000);
      }
    }

    default:
      return { action: 'GIVE_UP', reason: 'NOT_CATALOGUED' };
  }
}
