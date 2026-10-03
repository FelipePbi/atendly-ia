/**
 * V37 — the catalogue of stops the daemon retries by itself.
 *
 * Every classification below is tested against text the harness really
 * printed during the Goals 057–106 supervision (ia-loop-auto log), because
 * the catalogue is only as good as its match on that text. And every stop
 * that was NOT transient in that log is tested to stay with the operator.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLOSURE_REDO_ATTEMPTS, INCIDENT_CATALOGUE, classifyHumanStop, incidentBudget, incidentKey,
  remedyIncident, removeEmptyBranch, resolvedNoteFor,
} from '../lib/daemon-incidents.mjs';
import { DAEMON_EVENTS, DAEMON_INCIDENTS } from '../lib/daemon-vocabulary.mjs';

const stopped = (reason, goal = '072') => ({
  autonomousRunId: 'auto-1', status: 'PAUSED_FOR_HUMAN', currentGoal: goal,
  humanRequired: { reason, at: '2026-10-03T12:00:00.000Z' },
});

// --- Real output -----------------------------------------------------------

const GOAL_WORKTREE_RACE = `
Creating worktree…

IA Loop — Goal Runner

Blocker: [GIT_FAILED] git worktree add -b failed: Command failed: git worktree add -b ai-loop/goal-072 .ai-worktrees/goal-072 a0dc3bf173feccfcf4ec3a425fc20c6f1ccc16a5
Preparing worktree (new branch 'ai-loop/goal-072')
error: unable to stat just-written file apps/evolution-go/pkg/events/rabbitmq/rabbitmq_producer.go: No such file or directory
fatal: Could not reset index file to revision 'HEAD'.


Overall:
FAIL

Goal 072 needs a human: UNKNOWN_FATAL
`;

const GOAL_DIFF_RACE = `
IA Loop — Goal Runner

Blocker: [GIT_FAILED] git diff a6b560b631c8a1fb24deca303e1af28431f2e2da -- failed: Command failed: git diff a6b560b631c8a1fb24deca303e1af28431f2e2da --
fatal: stat 'packages/public-api-contract/src/routes.ts': No such file or directory


Overall:
FAIL

Goal 067 needs a human: UNKNOWN_FATAL
`;

const PLANNING_WORKTREE_RACE = `
Creating the planning worktree…

IA Loop — Goal Closure

Blocker: [GIT_FAILED] git worktree add -b failed: Command failed: git worktree add -b ai-loop/plan-after-goal-059 .ai-worktrees/plan-after-goal-059 c8beaeb3ccc4ce841f3cbd5efa0448abd3c48df5
Preparing worktree (new branch 'ai-loop/plan-after-goal-059')
error: unable to stat just-written file docs/design-reference/claude-design/prototype/project/uploads/cadastro-restaurado-6855016e.png: No such file or directory
fatal: Could not reset index file to revision 'HEAD'.


State: HUMAN_REQUIRED
Closure of Goal 059 needs a human: UNKNOWN_FATAL
`;

const CLOSURE_REV_PARSE = `
Planning job published: 101-r4-tech_lead-4fbc6ec2
  … tech_lead: IDLE
  … tech_lead: WORKING

IA Loop — Goal Closure

Blocker: [GIT_FAILED] git rev-parse HEAD failed: Command failed: git rev-parse HEAD


State: HUMAN_REQUIRED
Closure of Goal 101 needs a human: UNKNOWN_FATAL
`;

const HEARTBEAT_LOST = `
Review job published: 077-r2-tech_lead-258893b1
Waiting for the Tech Lead…
  attempt: 077-r2-tech_lead-258893b1-a1
  … tech_lead: IDLE

⚠ The tech_lead worker is no longer heartbeating.

The job was NOT failed and NOT re-queued. The attempt keeps its lease.

Check with:  npm run ia-loop:status
Re-attach with:  npm run ia-loop:resume

Goal 077 needs a human: UNKNOWN_FATAL
`;

const PLANNING_HARNESS_ERROR = `
IA Loop — Goal Closure

Blocker: [PLANNING_FAILED] Planning job 081-r1-tech_lead-2493e011 did not complete successfully (HARNESS_ERROR: Local harness failure, not a model limit. Fix the tooling; retrying as-is will not help.) and is not an automatically-retryable content violation. Resolve manually.

State: HUMAN_REQUIRED
Closure of Goal 081 needs a human: HARNESS_ERROR
`;

const POLICY_VIOLATION = `
Goal committed: NO
Migration baseline updated: NO
Next Goal created: NO
Worktree kept for human inspection.

Goal 068 needs a human: POLICY_VIOLATION
`;

const PRODUCT_DECISION = `
Blocker: [PRODUCT_DECISION] The Tech Lead asked for a human before the next Goal: O 080 fechou U-01/A-12.

Closure of Goal 080 needs a human: UNKNOWN_FATAL
`;

// --- Classification ----------------------------------------------------------

test('GOAL_GIT_TRANSIENT: a Windows race inside the Goal worktree add', () => {
  const incident = classifyHumanStop({ run: stopped('UNKNOWN_FATAL'), output: GOAL_WORKTREE_RACE });
  assert.equal(incident.kind, DAEMON_INCIDENTS.GOAL_GIT_TRANSIENT);
  assert.equal(incident.goal, '072');
  assert.match(incident.evidence, /unable to stat just-written file/);
});

test('GOAL_GIT_TRANSIENT: a git diff that lost a file for a moment', () => {
  const incident = classifyHumanStop({ run: stopped('UNKNOWN_FATAL', '067'), output: GOAL_DIFF_RACE });
  assert.equal(incident.kind, DAEMON_INCIDENTS.GOAL_GIT_TRANSIENT);
  assert.equal(incident.goal, '067');
});

test('PLANNING_WORKTREE_ADD: the planning worktree failed to materialise', () => {
  const incident = classifyHumanStop({ run: stopped('UNKNOWN_FATAL', '059'), output: PLANNING_WORKTREE_RACE });
  assert.equal(incident.kind, DAEMON_INCIDENTS.PLANNING_WORKTREE_ADD);
  assert.equal(incident.goal, '059');
});

test('CLOSURE_GIT_TRANSIENT: a git rev-parse that failed once during the closure', () => {
  const incident = classifyHumanStop({ run: stopped('UNKNOWN_FATAL', '101'), output: CLOSURE_REV_PARSE });
  assert.equal(incident.kind, DAEMON_INCIDENTS.CLOSURE_GIT_TRANSIENT);
  assert.equal(incident.goal, '101');
  assert.match(incident.evidence, /git rev-parse HEAD failed/);
});

test('WORKER_HEARTBEAT_LOST: from the printed line, with the role', () => {
  const incident = classifyHumanStop({ run: stopped('UNKNOWN_FATAL', '077'), output: HEARTBEAT_LOST });
  assert.equal(incident.kind, DAEMON_INCIDENTS.WORKER_HEARTBEAT_LOST);
  assert.equal(incident.role, 'tech_lead');
  assert.equal(incident.goal, '077');
});

test('WORKER_HEARTBEAT_LOST: from the OBSERVER_STOPPED event when the output says nothing', () => {
  const incident = classifyHumanStop({
    run: stopped('UNKNOWN_FATAL', '094'),
    output: 'Goal 094 needs a human: UNKNOWN_FATAL\n',
    events: [{ type: 'OBSERVER_STOPPED', goal: '094', role: 'developer', reason: 'WORKER_OFFLINE' }],
  });
  assert.equal(incident.kind, DAEMON_INCIDENTS.WORKER_HEARTBEAT_LOST);
  assert.equal(incident.role, 'developer');
});

test('PLANNING_MODEL_CONFLICT: HARNESS_ERROR whose planning job saw two models', () => {
  const incident = classifyHumanStop({
    run: stopped('HARNESS_ERROR', '081'),
    output: PLANNING_HARNESS_ERROR,
    runtime: { closure: { goal: '081', planningJobId: '081-r1-tech_lead-2493e011', nextGoalId: null } },
    events: [{ type: 'JOB_FAILED', jobId: '081-r1-tech_lead-2493e011', code: 'PRIMARY_MODEL_EVIDENCE_CONFLICT' }],
  });
  assert.equal(incident.kind, DAEMON_INCIDENTS.PLANNING_MODEL_CONFLICT);
  assert.equal(incident.goal, '081');
  assert.equal(incident.planningJobId, '081-r1-tech_lead-2493e011');
});

test('the same HARNESS_ERROR without the model-conflict evidence stays with the operator', () => {
  const incident = classifyHumanStop({
    run: stopped('HARNESS_ERROR', '081'),
    output: PLANNING_HARNESS_ERROR,
    runtime: { closure: { goal: '081', planningJobId: '081-r1-tech_lead-2493e011' } },
    events: [{ type: 'JOB_FAILED', jobId: '081-r1-tech_lead-2493e011', code: 'HARNESS_ERROR' }],
  });
  assert.equal(incident.kind, null);
  assert.equal(incident.reason, 'HARNESS_ERROR');
});

test('stops that were never transient are not catalogued', () => {
  for (const [output, goal] of [[POLICY_VIOLATION, '068'], [PRODUCT_DECISION, '080'],
    ['Goal 057 needs a human: MAX_CORRECTION_ROUNDS_REACHED\n', '057']]) {
    const incident = classifyHumanStop({ run: stopped('X', goal), output });
    assert.equal(incident.kind, null, output);
  }
});

test('an earlier GIT_FAILED the phase got past does not classify a later stop', () => {
  const output = `${GOAL_WORKTREE_RACE}\n...retried and continued...\n${'x'.repeat(13_000)}\n${POLICY_VIOLATION}`;
  const incident = classifyHumanStop({ run: stopped('POLICY_VIOLATION', '068'), output });
  assert.equal(incident.kind, null);
});

test('a missing SSH key is not a filesystem race: Permission denied (publickey) stays with the operator', () => {
  const output = `
Blocker: [GIT_FAILED] git push origin ai-loop/goal-072 failed: Command failed: git push origin ai-loop/goal-072
git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.

Goal 072 needs a human: UNKNOWN_FATAL
`;
  assert.equal(classifyHumanStop({ run: stopped('UNKNOWN_FATAL'), output }).kind, null);
});

test('a hook that refused the commit stays with the operator, even when it says "No such file or directory"', () => {
  const output = `
Blocker: [GIT_FAILED] git commit failed: Command failed: git commit -m "feat: x"
.husky/pre-commit: line 4: npx: No such file or directory
husky - pre-commit hook exited with code 127 (error)

Goal 072 needs a human: UNKNOWN_FATAL
`;
  assert.equal(classifyHumanStop({ run: stopped('UNKNOWN_FATAL'), output }).kind, null);

  const closure = `
Blocker: [GIT_FAILED] git commit failed: Command failed: git commit
error: cannot open .git/COMMIT_EDITMSG: Permission denied
hint: The 'pre-commit' hook was ignored because it's not set as executable.

Closure of Goal 101 needs a human: UNKNOWN_FATAL
`;
  assert.equal(classifyHumanStop({ run: stopped('UNKNOWN_FATAL', '101'), output: closure }).kind, null);
});

test('a transient-looking line counts only inside the GIT_FAILED message, not elsewhere in the window', () => {
  const output = `
warning: unable to unlink 'apps/web/.next/cache/x': Permission denied
note: some unrelated tool said No such file or directory
...
Blocker: [GIT_FAILED] git merge failed: Command failed: git merge --ff-only ai-loop/goal-072
fatal: Not possible to fast-forward, aborting.

Goal 072 needs a human: UNKNOWN_FATAL
`;
  assert.equal(classifyHumanStop({ run: stopped('UNKNOWN_FATAL'), output }).kind, null);
});

test('"Permission denied" on a file operation inside the GIT_FAILED message is still transient', () => {
  const output = `
Blocker: [GIT_FAILED] git worktree remove failed: Command failed: git worktree remove .ai-worktrees/goal-072
error: unable to unlink old 'apps/web/node_modules/.bin/next': Permission denied

Goal 072 needs a human: UNKNOWN_FATAL
`;
  const incident = classifyHumanStop({ run: stopped('UNKNOWN_FATAL'), output });
  assert.equal(incident.kind, DAEMON_INCIDENTS.GOAL_GIT_TRANSIENT);
  assert.match(incident.evidence, /unable to unlink/);
});

test('PLANNING_WORKTREE_ADD only for the planning worktree of the Goal being closed', () => {
  const output = PLANNING_WORKTREE_RACE.replace('Closure of Goal 059', 'Closure of Goal 060');
  const incident = classifyHumanStop({ run: stopped('UNKNOWN_FATAL', '060'), output });
  assert.notEqual(incident.kind, DAEMON_INCIDENTS.PLANNING_WORKTREE_ADD);
  assert.notEqual(incident.kind, DAEMON_INCIDENTS.CLOSURE_GIT_TRANSIENT, 'another Goal\'s planning failure is not this closure\'s race');
});

// --- Budget and note -----------------------------------------------------------

test('each kind has a per-Goal retry limit', () => {
  const incident = { kind: DAEMON_INCIDENTS.GOAL_GIT_TRANSIENT, goal: '072' };
  assert.deepEqual(incidentBudget(incident, {}), { allowed: true, used: 0, limit: 3, attempt: 1 });
  assert.equal(incidentBudget(incident, { [incidentKey(incident)]: 3 }).allowed, false);
  assert.equal(incidentBudget({ ...incident, goal: '073' }, { [incidentKey(incident)]: 3 }).allowed, true);
  assert.equal(INCIDENT_CATALOGUE[DAEMON_INCIDENTS.PLANNING_MODEL_CONFLICT].limit, 2);
});

test('the --resolved note says who decided, what was seen and which attempt', () => {
  const note = resolvedNoteFor(
    { kind: DAEMON_INCIDENTS.PLANNING_WORKTREE_ADD, goal: '059', evidence: 'error: unable to stat' },
    { attempt: 1, limit: 3, nextGoal: '060' },
  );
  assert.match(note, /^ia-loop daemon \(autorizado pelo operador\)/);
  assert.match(note, /PLANNING_WORKTREE_ADD/);
  assert.match(note, /fechamento do Goal 059 refeito; 060 READY/);
  assert.match(note, /tentativa 1\/3/);
});

// --- Remedies --------------------------------------------------------------

function fakeGit(responses = {}) {
  const calls = [];
  const git = async (args) => {
    calls.push(args.join(' '));
    for (const [prefix, response] of Object.entries(responses)) {
      if (args.join(' ').startsWith(prefix)) return { code: 0, stdout: '', stderr: '', ...response };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  return { git, calls };
}

function baseDeps(over = {}) {
  const events = [];
  return {
    events,
    deps: {
      repoRoot: 'E:\\repo',
      pathExists: async () => false,
      sleep: async () => {},
      emit: async (event) => { events.push(event); },
      savePatch: async () => {},
      readRuntime: async () => null,
      writeRuntime: async () => {},
      runScript: async () => ({ code: 0, output: '' }),
      readWorkerHealth: async () => ({ health: 'RUNNING' }),
      now: () => 0,
      workerReturnTimeoutMs: 60_000,
      ...over,
    },
  };
}

test('removeEmptyBranch deletes only a branch with no worktree and no commit of its own', async () => {
  const empty = fakeGit({ 'rev-list': { stdout: '0\n' } });
  assert.deepEqual(await removeEmptyBranch({ git: empty.git, branch: 'ai-loop/goal-072', worktreeDir: 'W', pathExists: async () => false }),
    { removed: true, reason: null });
  assert.ok(empty.calls.includes('branch -D ai-loop/goal-072'));

  const withCommits = fakeGit({ 'rev-list': { stdout: '2\n' } });
  assert.equal((await removeEmptyBranch({ git: withCommits.git, branch: 'b', worktreeDir: 'W', pathExists: async () => false })).reason, 'HAS_OWN_COMMITS');
  assert.ok(!withCommits.calls.some((c) => c.startsWith('branch -D')));

  const worktree = fakeGit();
  assert.equal((await removeEmptyBranch({ git: worktree.git, branch: 'b', worktreeDir: 'W', pathExists: async () => true })).reason, 'WORKTREE_EXISTS');
  assert.equal(worktree.calls.length, 0);
});

test('GOAL_GIT_TRANSIENT: drop the empty branch the failed add left, then retry the same Goal', async () => {
  const { git, calls } = fakeGit({ 'rev-list': { stdout: '0' } });
  const { deps, events } = baseDeps({ git });
  const outcome = await remedyIncident({ kind: DAEMON_INCIDENTS.GOAL_GIT_TRANSIENT, goal: '072' }, deps);
  assert.deepEqual(outcome, { action: 'RETRY', from: '072' });
  assert.ok(calls.includes('branch -D ai-loop/goal-072'));
  assert.equal(events[0].type, DAEMON_EVENTS.BRANCH_REMOVED);
});

test('PLANNING_WORKTREE_ADD: redo the closure and retry from the Goal it made READY', async () => {
  const { git, calls } = fakeGit({ 'rev-parse --verify': { code: 1 } });
  let closes = 0;
  const { deps } = baseDeps({
    git,
    runScript: async (name, args) => { closes += 1; assert.deepEqual([name, args], ['run-close', ['059']]); return { code: 0, output: 'ok' }; },
    readRuntime: async () => ({ closure: { goal: '059', nextGoalId: '060', migrationComplete: false } }),
  });
  const outcome = await remedyIncident({ kind: DAEMON_INCIDENTS.PLANNING_WORKTREE_ADD, goal: '059' }, deps);
  assert.deepEqual(outcome, { action: 'RETRY', from: '060' });
  assert.equal(closes, 1);
  assert.ok(calls.includes('worktree prune'));
});

test('CLOSURE_GIT_TRANSIENT: retries the closure only while it keeps failing the same way', async () => {
  let closes = 0;
  const transient = baseDeps({
    git: fakeGit().git,
    runScript: async () => { closes += 1; return { code: 1, output: 'Blocker: [GIT_FAILED] git rev-parse HEAD failed' }; },
  });
  assert.deepEqual(await remedyIncident({ kind: DAEMON_INCIDENTS.CLOSURE_GIT_TRANSIENT, goal: '101' }, transient.deps),
    { action: 'GIVE_UP', reason: 'CLOSURE_NOT_RECOVERED' });
  assert.equal(closes, CLOSURE_REDO_ATTEMPTS);

  closes = 0;
  const different = baseDeps({
    git: fakeGit().git,
    runScript: async () => { closes += 1; return { code: 1, output: 'Blocker: [PRODUCT_DECISION] ask a person' }; },
  });
  await remedyIncident({ kind: DAEMON_INCIDENTS.CLOSURE_GIT_TRANSIENT, goal: '101' }, different.deps);
  assert.equal(closes, 1, 'a different failure is not retried');
});

test('a closure that completes the migration is never retried as a Goal', async () => {
  const { deps } = baseDeps({
    git: fakeGit().git,
    readRuntime: async () => ({ closure: { goal: '106', migrationComplete: true, nextGoalId: null } }),
  });
  const outcome = await remedyIncident({ kind: DAEMON_INCIDENTS.CLOSURE_GIT_TRANSIENT, goal: '106' }, deps);
  assert.equal(outcome.action, 'GIVE_UP');
});

test('PLANNING_MODEL_CONFLICT: keeps the refused plan as a patch, resets planning, re-plans', async () => {
  const { git, calls } = fakeGit({ '-C': { stdout: 'diff --git a/x b/x' }, 'rev-list': { stdout: '0' } });
  const patches = {};
  let runtime = { goal: '081', closure: { goal: '081', planningJobId: '081-r1-tech_lead-2493e011', planningBase: 'abc', planningWorktreeCreated: true } };
  let exists = true;
  const { deps, events } = baseDeps({
    git: async (args) => { const r = await git(args); if (args[0] === 'worktree' && args[1] === 'remove') exists = false; return r; },
    pathExists: async () => exists,
    savePatch: async (name, content) => { patches[name] = content; },
    readRuntime: async () => runtime,
    writeRuntime: async (next) => { runtime = next; },
    runScript: async () => {
      runtime = { ...runtime, closure: { ...runtime.closure, nextGoalId: '082', migrationComplete: false } };
      return { code: 0, output: '' };
    },
  });
  const outcome = await remedyIncident({ kind: DAEMON_INCIDENTS.PLANNING_MODEL_CONFLICT, goal: '081', planningJobId: '081-r1-tech_lead-2493e011' }, deps);

  assert.deepEqual(outcome, { action: 'RETRY', from: '082' });
  assert.ok(Object.keys(patches).some((name) => name.endsWith('.patch') && patches[name].includes('diff --git')));
  assert.ok(Object.keys(patches).some((name) => name.startsWith('runtime-before-replan-')));
  assert.equal(runtime.closure.planningJobId, undefined);
  assert.equal(runtime.closure.planningWorktreeCreated, false);
  assert.ok(calls.some((c) => c.startsWith('worktree remove --force')));
  assert.ok(events.some((e) => e.type === DAEMON_EVENTS.REPLAN_AUTHORIZED));
});

test('PLANNING_MODEL_CONFLICT: a diff that failed saved nothing, so the worktree is never force-removed', async () => {
  for (const failing of ['-C E:\\repo\\.ai-worktrees\\plan-after-goal-081 diff', '-C E:\\repo\\.ai-worktrees\\plan-after-goal-081 add']) {
    const { git, calls } = fakeGit({ [failing]: { code: 128, stderr: 'fatal: unable to read tree' } });
    const patches = {};
    const { deps } = baseDeps({ git, pathExists: async () => true, savePatch: async (name, content) => { patches[name] = content; } });
    const outcome = await remedyIncident({ kind: DAEMON_INCIDENTS.PLANNING_MODEL_CONFLICT, goal: '081', planningJobId: 'p1' }, deps);
    assert.equal(outcome.action, 'GIVE_UP');
    assert.match(outcome.reason, /^PLANNING_DIFF_FAILED: fatal: unable to read tree/);
    assert.ok(!calls.some((c) => c.startsWith('worktree remove')), failing);
    assert.deepEqual(patches, {});
  }
});

test('WORKER_HEARTBEAT_LOST: waits for that role to heartbeat again, or gives up', async () => {
  let t = 0;
  let beats = 0;
  const back = baseDeps({
    sleep: async (ms) => { t += ms; },
    now: () => t,
    readWorkerHealth: async (role) => { assert.equal(role, 'tech_lead'); beats += 1; return { health: beats >= 3 ? 'RUNNING' : 'OFFLINE' }; },
  });
  assert.deepEqual(await remedyIncident({ kind: DAEMON_INCIDENTS.WORKER_HEARTBEAT_LOST, goal: '077', role: 'tech_lead' }, back.deps),
    { action: 'RETRY', from: '077' });

  t = 0;
  const gone = baseDeps({ sleep: async (ms) => { t += ms; }, now: () => t, readWorkerHealth: async () => ({ health: 'OFFLINE' }) });
  assert.deepEqual(await remedyIncident({ kind: DAEMON_INCIDENTS.WORKER_HEARTBEAT_LOST, goal: '077', role: 'developer' }, gone.deps),
    { action: 'GIVE_UP', reason: 'WORKER_DID_NOT_RETURN' });
});
