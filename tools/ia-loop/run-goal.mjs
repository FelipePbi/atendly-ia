#!/usr/bin/env node
/**
 * IA Loop — orchestrator entry point.
 *
 *   npm run ia-loop:goal -- 003 --dry-run   plan only, no side effects
 *   npm run ia-loop:goal -- 003             real supervised execution
 *
 * The orchestrator is the ONLY component that decides who works next. The
 * models never call each other: every hand-off is validated and recorded here.
 *
 * A real run stops at AWAITING_HUMAN whatever the verdict. It never commits the
 * Goal, never updates the migration baseline, never creates the next Goal and
 * never removes the worktree.
 */

import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { createJobStore } from './lib/job-store.mjs';
import { discoverGoal } from './lib/goal-discovery.mjs';
import { planWorktree, createWorktreeForGoal } from './lib/worktree-manager.mjs';
import { readWorkerHealth, WORKER_HEALTH, SESSION_STRATEGY } from './lib/worker-registry.mjs';
import { LOOP_STATES, createLoopStateMachine, planAfterDecision, stateForDecision } from './lib/loop-state.mjs';
import { PROTOCOL_VERSION_V2, validateDeveloperJob, validateReviewJob } from './lib/contracts-v2.mjs';
import {
  createGitProbe,
  createWorktree as gitCreateWorktree,
  collectWorktreeChanges,
  worktreeFingerprint,
  git,
} from './lib/git-ops.mjs';
import { captureSnapshot, checkDeveloperPolicy, checkReviewerPolicy, formatViolations } from './lib/policy-guards.mjs';
import { buildReviewPacket } from './lib/review-packet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const STATE_DIR = join(HERE, '.state');

const TECH_LEAD_MODEL = process.env.IA_LOOP_TECH_LEAD_MODEL ?? 'claude-fable-5-1';
const DEVELOPER_MODEL = process.env.IA_LOOP_DEVELOPER_MODEL ?? 'claude-opus-5';
const REVIEW_LEVEL = 'DEEP';
const ROUND = 1;

/** A real Goal can take hours; a capacity wait can add more on top. */
const RESULT_TIMEOUT_MS = Number(process.env.IA_LOOP_RESULT_TIMEOUT_MS ?? 6 * 60 * 60 * 1000);
const POLL_MS = 5_000;

const probe = createGitProbe(REPO_ROOT);

function parseArgs(argv) {
  const args = argv.slice(2);
  const goalId = args.find((a) => /^\d{3}$/.test(a));
  const dryRun = args.includes('--dry-run');

  if (!goalId) {
    throw new SpikeError('INVALID_ARGS', 'Usage: npm run ia-loop:goal -- <goalId> [--dry-run]');
  }
  return { goalId, dryRun };
}

function formatHealth(health) {
  if (health.health === WORKER_HEALTH.OFFLINE) return 'OFFLINE (worker not running)';
  const age = health.ageMs === null ? '?' : `${Math.round(health.ageMs / 1000)}s ago`;
  return `${health.health} (state ${health.state}, heartbeat ${age})`;
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** Waits for a worker to publish a result for one job. */
async function waitForResult(store, role, jobId, { emit }) {
  const startedAt = Date.now();
  let lastState = null;

  for (;;) {
    const envelope = await store.readResult(role, jobId);
    if (envelope) return envelope;

    if (Date.now() - startedAt > RESULT_TIMEOUT_MS) {
      throw new SpikeError('RESULT_TIMEOUT', `No result from "${role}" for job ${jobId} within the timeout`);
    }

    // Surface capacity waits and worker state changes while waiting.
    const health = await readWorkerHealth(store, role);
    if (health.state !== lastState) {
      lastState = health.state;
      const suffix = health.capacityReason ? ` (${health.capacityReason}, retry ${health.nextRetryAt})` : '';
      emit(`  … ${role}: ${health.state ?? 'unknown'}${suffix}`);
    }
    if (health.health === WORKER_HEALTH.OFFLINE) {
      throw new SpikeError('WORKER_OFFLINE', `The "${role}" worker went offline while the job was pending`);
    }

    await sleep(POLL_MS);
  }
}

async function main() {
  const out = [];
  const emit = (line = '') => { out.push(line); if (line !== undefined) console.log(line); };

  const { goalId, dryRun } = parseArgs(process.argv);
  const store = createJobStore(STATE_DIR);
  const machine = createLoopStateMachine();

  emit('');
  emit('IA Loop — Goal Runner');
  emit('');
  emit(`Mode:\n${dryRun ? 'DRY_RUN' : 'REAL_EXECUTION'}`);
  emit('');

  // --- Goal discovery ------------------------------------------------------
  const goal = await discoverGoal({
    repoRoot: REPO_ROOT,
    goalId,
    resolveSha: (sha) => probe.commitExists(sha),
  });
  machine.transitionTo(LOOP_STATES.GOAL_READY, { goal: goal.goalId });

  emit('Goal discovery:');
  emit('PASS');
  emit(`  goal: ${goal.goalId} — ${goal.title}`);
  emit(`  status: ${goal.status}`);
  emit(`  previous goal: ${goal.previousGoalId ?? 'n/a'} (${goal.previousGoalStatus ?? 'n/a'})`);
  emit('');

  // --- The two baselines ---------------------------------------------------
  const executionBase = await probe.head();

  emit('Migration baseline (accepted):');
  emit(`  ${goal.migrationAcceptedBaseline}`);
  emit('Execution base (current HEAD):');
  emit(`  ${executionBase}`);
  emit(`  distinct from accepted baseline: ${executionBase !== goal.migrationAcceptedBaseline ? 'YES (expected)' : 'NO'}`);
  emit('');

  emit('Tech Lead:');
  emit(`  ${TECH_LEAD_MODEL}`);
  emit(`  ${SESSION_STRATEGY.PERSISTENT}`);
  emit('Developer:');
  emit(`  ${DEVELOPER_MODEL}`);
  emit(`  ${SESSION_STRATEGY.STATELESS}`);
  emit('');

  // ======================= DRY RUN ========================================
  if (dryRun) {
    machine.transitionTo(LOOP_STATES.PREPARING_WORKTREE);
    const plan = await planWorktree({ goalId, executionBase, git: probe });

    emit('Worktree plan:');
    emit(`  path: ${plan.path}`);
    emit(`  branch: ${plan.branch}`);
    emit(`  base: ${plan.executionBase}`);
    emit(`  current branch (untouched): ${plan.currentBranch}`);
    emit(`  planned command: ${plan.plannedCommand}`);
    emit('  created: NO (dry run)');
    if (plan.blockers.length > 0) {
      emit('  blockers:');
      for (const b of plan.blockers) emit(`    - [${b.code}] ${b.message}`);
    } else {
      emit('  blockers: none');
    }
    emit('');

    if (plan.safe) machine.transitionTo(LOOP_STATES.WORKTREE_READY);

    const [tl, dev] = await Promise.all([
      readWorkerHealth(store, 'tech_lead'),
      readWorkerHealth(store, 'developer'),
    ]);
    emit('Workers:');
    emit(`  tech-lead: ${formatHealth(tl)}`);
    emit(`  developer: ${formatHealth(dev)}`);
    emit('');
    emit('Review:');
    emit(`  ${REVIEW_LEVEL}`);
    emit('');

    await store.writeCurrentGoal({
      goalId: goal.goalId, title: goal.title, status: goal.status, goalPath: goal.goalPath,
      migrationAcceptedBaseline: goal.migrationAcceptedBaseline, executionBase,
    });
    await store.writeRuntime({
      mode: 'DRY_RUN', goal: goal.goalId, state: machine.state,
      migrationAcceptedBaseline: goal.migrationAcceptedBaseline, executionBase,
      worktreePlan: { path: plan.path, branch: plan.branch, safe: plan.safe },
      reviewLevel: REVIEW_LEVEL, goalExecuted: false,
    });
    await store.appendEvent({ type: 'DRY_RUN_COMPLETED', goal: goal.goalId, state: machine.state, worktreeSafe: plan.safe });

    emit('State:');
    for (const t of machine.history) emit(`  ${t.from} -> ${t.to}`);
    emit(`  current: ${machine.state}`);
    emit('');

    const devJobs = await store.listJobs('developer');
    const revJobs = await store.listJobs('tech_lead');
    emit('Dry-run guarantees:');
    emit(`  developer jobs published: ${devJobs.length}`);
    emit(`  review jobs published: ${revJobs.length}`);
    emit('  model calls: 0');
    emit('  worktree created: NO');
    emit('');
    emit('Goal executed:');
    emit('NO');
    emit('');

    const passed = goal.status === 'READY' && devJobs.length === 0 && revJobs.length === 0;
    emit('Overall:');
    emit(passed ? 'PASS' : 'FAIL');
    return passed ? 0 : 1;
  }

  // ===================== REAL EXECUTION ===================================
  // Both workers must be up: they are the execution interface.
  const [tlHealth, devHealth] = await Promise.all([
    readWorkerHealth(store, 'tech_lead'),
    readWorkerHealth(store, 'developer'),
  ]);
  emit('Workers:');
  emit(`  tech-lead: ${formatHealth(tlHealth)}`);
  emit(`  developer: ${formatHealth(devHealth)}`);
  emit('');

  if (tlHealth.health === WORKER_HEALTH.OFFLINE || devHealth.health === WORKER_HEALTH.OFFLINE) {
    throw new SpikeError('WORKERS_NOT_RUNNING',
      'Both workers must be running. Open two terminals: npm run ia-loop:tech-lead and npm run ia-loop:developer');
  }

  // --- Worktree ------------------------------------------------------------
  machine.transitionTo(LOOP_STATES.PREPARING_WORKTREE);
  emit('Creating worktree…');

  const worktree = await createWorktreeForGoal({
    goalId,
    executionBase,
    git: probe,
    repoRoot: REPO_ROOT,
    createFn: gitCreateWorktree,
  });
  machine.transitionTo(LOOP_STATES.WORKTREE_READY);

  emit('Worktree:');
  emit(`  path: ${worktree.path}`);
  emit(`  branch: ${worktree.branch}`);
  emit(`  initialHead: ${worktree.worktreeInitialHead}`);
  emit('');

  await store.writeCurrentGoal({
    goalId: goal.goalId, title: goal.title, status: goal.status, goalPath: goal.goalPath,
    migrationAcceptedBaseline: goal.migrationAcceptedBaseline, executionBase,
    worktreePath: worktree.path, worktreeInitialHead: worktree.worktreeInitialHead,
  });
  await store.writeRuntime({
    mode: 'REAL_EXECUTION', goal: goal.goalId, round: ROUND, state: machine.state,
    migrationAcceptedBaseline: goal.migrationAcceptedBaseline, executionBase,
    worktreePath: worktree.path, worktreeInitialHead: worktree.worktreeInitialHead,
    reviewLevel: REVIEW_LEVEL, goalExecuted: false,
  });
  await store.appendEvent({
    type: 'WORKTREE_CREATED', goal: goal.goalId, path: worktree.path,
    branch: worktree.branch, initialHead: worktree.worktreeInitialHead,
  });

  const absWorktree = worktree.absolutePath;

  // --- Developer -----------------------------------------------------------
  const beforeDev = await captureSnapshot({ probe });

  const devJobId = store.newJobId(goal.goalId, ROUND, 'developer');
  const devJob = validateDeveloperJob({
    protocolVersion: PROTOCOL_VERSION_V2,
    jobId: devJobId,
    role: 'developer',
    goal: goal.goalId,
    round: ROUND,
    type: 'IMPLEMENTATION',
    migrationAcceptedBaseline: goal.migrationAcceptedBaseline,
    executionBase,
    worktreeInitialHead: worktree.worktreeInitialHead,
    worktree: absWorktree,
    goalPath: goal.goalPath,
    blockers: [],
  });

  machine.transitionTo(LOOP_STATES.DEVELOPER_QUEUED);
  await store.publishJob('developer', devJob);
  await store.writeRuntime({
    ...(await store.readRuntime()), state: machine.state, currentJobId: devJobId,
  });
  emit(`Developer job published: ${devJobId}`);
  machine.transitionTo(LOOP_STATES.DEVELOPER_RUNNING);
  emit('Waiting for the Developer…');

  const devEnvelope = await waitForResult(store, 'developer', devJobId, { emit });

  if (!devEnvelope.ok) {
    machine.transitionTo(LOOP_STATES.HUMAN_REQUIRED);
    machine.transitionTo(LOOP_STATES.AWAITING_HUMAN);
    emit('');
    emit(`Developer failed: [${devEnvelope.code}] ${devEnvelope.message}`);
    await finish({ store, machine, emit, goal, worktree, executionBase, decision: 'HUMAN_REQUIRED', blockers: [], violations: [] });
    return 1;
  }

  const devResult = devEnvelope.result;
  emit(`Developer result: ${devResult.status}`);
  emit('');

  // --- Collect the REAL state ---------------------------------------------
  emit('Collecting real repository state…');
  const changes = await collectWorktreeChanges(absWorktree, worktree.worktreeInitialHead);
  const afterDev = await captureSnapshot({ probe });

  const devViolations = checkDeveloperPolicy({
    before: beforeDev,
    after: afterDev,
    worktreeInitialHead: worktree.worktreeInitialHead,
    changes,
  });

  emit(`  changed files: ${changes.changedFiles.length}`);
  emit(`  commits in worktree: ${changes.commits.length} (must be 0)`);
  emit(`  policy violations: ${devViolations.length}`);
  for (const v of formatViolations(devViolations)) emit(`    - ${v}`);
  emit('');

  // Persist the evidence so the review reads real artefacts.
  const artefactDir = join(STATE_DIR, 'artefacts', `${goal.goalId}-r${ROUND}`);
  await fs.mkdir(artefactDir, { recursive: true });
  const diffPath = join(artefactDir, 'implementation.patch');
  await fs.writeFile(diffPath, changes.diff, 'utf8');
  await fs.writeFile(join(artefactDir, 'changed-files.txt'), changes.changedFiles.join('\n'), 'utf8');

  if (devViolations.length > 0) {
    machine.transitionTo(LOOP_STATES.HUMAN_REQUIRED);
    machine.transitionTo(LOOP_STATES.AWAITING_HUMAN);
    await store.appendEvent({ type: 'POLICY_VIOLATION', goal: goal.goalId, agent: 'developer', violations: devViolations });
    emit('POLICY_VIOLATION — stopping before the review.');
    await finish({ store, machine, emit, goal, worktree, executionBase, decision: 'HUMAN_REQUIRED', blockers: [], violations: devViolations });
    return 1;
  }

  machine.transitionTo(LOOP_STATES.REVIEW_REQUIRED);

  // --- Review packet -------------------------------------------------------
  const packet = buildReviewPacket({
    goal: goal.goalId,
    goalPath: goal.goalPath,
    round: ROUND,
    reviewLevel: REVIEW_LEVEL,
    migrationAcceptedBaseline: goal.migrationAcceptedBaseline,
    executionBase,
    worktreeInitialHead: worktree.worktreeInitialHead,
    worktreePath: absWorktree,
    changes,
    developerResult: devResult,
    previousBlockers: [],
    diffPath,
  });
  const packetPath = join(artefactDir, 'review-packet.json');
  await fs.writeFile(packetPath, JSON.stringify(packet, null, 2), 'utf8');

  const revJobId = store.newJobId(goal.goalId, ROUND, 'tech_lead');
  const revJob = validateReviewJob({
    protocolVersion: PROTOCOL_VERSION_V2,
    jobId: revJobId,
    role: 'tech_lead',
    goal: goal.goalId,
    round: ROUND,
    reviewLevel: REVIEW_LEVEL,
    migrationAcceptedBaseline: goal.migrationAcceptedBaseline,
    executionBase,
    worktreeInitialHead: worktree.worktreeInitialHead,
    worktree: absWorktree,
    goalPath: goal.goalPath,
    changedFiles: changes.changedFiles,
    diffStat: changes.diffStat,
    implementationReport: devResult.implementationReport,
    validations: devResult.validations,
    previousBlockers: [],
    packetPath,
  });

  const beforeReview = await captureSnapshot({ probe, worktreePath: absWorktree, fingerprint: worktreeFingerprint });

  machine.transitionTo(LOOP_STATES.REVIEWER_QUEUED);
  await store.publishJob('tech_lead', revJob);
  emit(`Review job published: ${revJobId}`);
  machine.transitionTo(LOOP_STATES.REVIEWER_RUNNING);
  emit('Waiting for the Tech Lead…');

  const revEnvelope = await waitForResult(store, 'tech_lead', revJobId, { emit });
  const afterReview = await captureSnapshot({ probe, worktreePath: absWorktree, fingerprint: worktreeFingerprint });
  const revViolations = checkReviewerPolicy({ before: beforeReview, after: afterReview });

  if (revViolations.length > 0) {
    await store.appendEvent({ type: 'POLICY_VIOLATION', goal: goal.goalId, agent: 'tech_lead', violations: revViolations });
    emit('REVIEWER_MUTATED_WORKTREE — the review is not accepted.');
    machine.transitionTo(LOOP_STATES.HUMAN_REQUIRED);
    machine.transitionTo(LOOP_STATES.AWAITING_HUMAN);
    await finish({ store, machine, emit, goal, worktree, executionBase, decision: 'HUMAN_REQUIRED', blockers: [], violations: revViolations });
    return 1;
  }

  if (!revEnvelope.ok) {
    machine.transitionTo(LOOP_STATES.HUMAN_REQUIRED);
    machine.transitionTo(LOOP_STATES.AWAITING_HUMAN);
    emit(`Review failed: [${revEnvelope.code}] ${revEnvelope.message}`);
    await finish({ store, machine, emit, goal, worktree, executionBase, decision: 'HUMAN_REQUIRED', blockers: [], violations: [] });
    return 1;
  }

  const decision = revEnvelope.result;
  emit(`Decision: ${decision.decision}`);
  emit('');

  // --- Supervised stop -----------------------------------------------------
  machine.transitionTo(stateForDecision(decision.decision));
  const plan = planAfterDecision(decision.decision);
  machine.transitionTo(LOOP_STATES.AWAITING_HUMAN);

  await finish({
    store, machine, emit, goal, worktree, executionBase,
    decision: decision.decision, blockers: decision.blockers ?? [], violations: [], plan,
    developerResult: devResult, changes,
  });
  return 0;
}

/** Writes the final snapshot and prints the supervised-stop summary. */
async function finish({ store, machine, emit, goal, worktree, executionBase, decision, blockers, violations, plan, developerResult, changes }) {
  const previous = (await store.readRuntime()) ?? {};
  await store.writeRuntime({
    ...previous,
    state: machine.state,
    decision,
    blockers,
    policyViolations: violations,
    // Explicit and deliberate: none of these happen in V3.
    goalExecuted: true,
    goalCommitted: false,
    migrationBaselineUpdated: false,
    nextGoalCreated: false,
    deferredNextAction: plan?.deferredNextAction ?? null,
  });
  await store.appendEvent({
    type: 'SUPERVISED_STOP', goal: goal.goalId, state: machine.state, decision,
    blockers: blockers.length, violations: violations.length,
  });

  emit('State:');
  for (const t of machine.history) emit(`  ${t.from} -> ${t.to}`);
  emit('');
  emit(`Goal: ${goal.goalId}`);
  emit(`Round: ${ROUND}`);
  emit(`Worktree: ${worktree?.path ?? 'n/a'} (branch ${worktree?.branch ?? 'n/a'})`);
  emit(`Migration baseline: ${goal.migrationAcceptedBaseline}`);
  emit(`Execution base: ${executionBase}`);
  if (changes) emit(`Changed files: ${changes.changedFiles.length}`);
  if (developerResult) emit(`Developer status: ${developerResult.status}`);
  emit(`Decision: ${decision}`);
  if (blockers?.length) {
    emit('Blockers:');
    for (const b of blockers) emit(`  - ${typeof b === 'string' ? b : JSON.stringify(b)}`);
  }
  emit('');
  emit(`State: ${machine.state}`);
  emit('');
  emit('Goal committed: NO');
  emit('Migration baseline updated: NO');
  emit('Next Goal created: NO');
  emit('Worktree kept for human inspection.');
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
    console.error(`\nIA Loop — Goal Runner\n\nBlocker: [${code}] ${error.message}\n\nOverall:\nFAIL`);
    process.exitCode = 1;
  });
