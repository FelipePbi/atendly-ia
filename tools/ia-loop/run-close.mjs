#!/usr/bin/env node
/**
 * IA Loop — accepted Goal closure and next-Goal planning.
 *
 *   npm run ia-loop:close -- 003
 *
 * The IA Loop does NOT decide that a Goal is accepted. It mechanises the
 * closure only after finding a persisted, valid ReviewDecision with
 * decision = ACCEPTED. No new review happens here, and the Developer is never
 * called.
 *
 * Every step records its SHA, so a crash or restart resumes instead of
 * repeating: no duplicate commit, no duplicate cherry-pick, no second next Goal.
 */

import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { createJobStore } from './lib/job-store.mjs';
import { discoverGoal } from './lib/goal-discovery.mjs';
import { readWorkerHealth, WORKER_HEALTH } from './lib/worker-registry.mjs';
import { LOOP_STATES, createLoopStateMachine } from './lib/loop-state.mjs';
import { PROTOCOL_VERSION_V2 } from './lib/contracts-v2.mjs';
import { assertClosureScope, CLOSURE_WRITE_PREFIX } from './lib/closure-contracts.mjs';
import {
  createGitProbe,
  createWorktree as gitCreateWorktree,
  collectWorktreeChanges,
  stageAndCommit,
  cherryPick,
  isAlreadyIntegrated,
  git,
} from './lib/git-ops.mjs';
import {
  assertSnapshotUnchanged,
  backfillFromReviewPacket,
  buildAcceptedSnapshot,
} from './lib/accepted-snapshot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const STATE_DIR = join(HERE, '.state');
const RESULT_TIMEOUT_MS = Number(process.env.IA_LOOP_RESULT_TIMEOUT_MS ?? 3 * 60 * 60 * 1000);
const POLL_MS = 5_000;

const probe = createGitProbe(REPO_ROOT);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const emit = (line = '') => console.log(line);

function parseArgs(argv) {
  const goalId = argv.slice(2).find((a) => /^\d{3}$/.test(a));
  if (!goalId) throw new SpikeError('INVALID_ARGS', 'Usage: npm run ia-loop:close -- <goalId>');
  return { goalId };
}

async function waitForResult(store, role, jobId) {
  const startedAt = Date.now();
  let lastState = null;
  for (;;) {
    const envelope = await store.readResult(role, jobId);
    if (envelope) return envelope;
    if (Date.now() - startedAt > RESULT_TIMEOUT_MS) {
      throw new SpikeError('RESULT_TIMEOUT', `No result from "${role}" for ${jobId}`);
    }
    const health = await readWorkerHealth(store, role);
    if (health.state !== lastState) {
      lastState = health.state;
      const suffix = health.capacityReason ? ` (${health.capacityReason})` : '';
      emit(`  … ${role}: ${health.state ?? 'unknown'}${suffix}`);
    }
    if (health.health === WORKER_HEALTH.OFFLINE) {
      throw new SpikeError('WORKER_OFFLINE', `The "${role}" worker went offline`);
    }
    await sleep(POLL_MS);
  }
}

/** Reads the persisted acceptance. Never re-derives it, never re-reviews. */
async function findAcceptedDecision(store, runtime, goalId) {
  if (runtime?.decision !== 'ACCEPTED') {
    throw new SpikeError(
      'GOAL_NOT_ACCEPTED',
      `Closure requires a persisted ACCEPTED decision; the run is ${runtime?.decision ?? 'unknown'}.`,
    );
  }
  if (runtime.goal !== goalId) {
    throw new SpikeError('GOAL_MISMATCH', `Runtime holds goal ${runtime.goal}, not ${goalId}`);
  }

  // Locate the review result that carries the acceptance.
  const files = await store.listJobs('tech_lead');
  let accepted = null;
  for (const file of files) {
    const jobId = file.replace(/\.json$/, '');
    const envelope = await store.readResult('tech_lead', jobId);
    const decision = envelope?.result;
    if (envelope?.ok && decision?.decision === 'ACCEPTED' && decision.goal === goalId) {
      if (!accepted || (decision.round ?? 0) >= (accepted.decision.round ?? 0)) {
        accepted = { jobId, decision };
      }
    }
  }
  if (!accepted) {
    throw new SpikeError('ACCEPTED_DECISION_NOT_FOUND', `No persisted ACCEPTED review found for Goal ${goalId}`);
  }
  return accepted;
}

async function main() {
  const { goalId } = parseArgs(process.argv);
  const store = createJobStore(STATE_DIR);
  const machine = createLoopStateMachine({ initialState: LOOP_STATES.ACCEPTED });

  emit('');
  emit('IA Loop — Goal Closure');
  emit('');

  const runtime = await store.readRuntime();
  const goal = await discoverGoal({
    repoRoot: REPO_ROOT, goalId, resolveSha: (sha) => probe.commitExists(sha),
  });

  const accepted = await findAcceptedDecision(store, runtime, goalId);
  emit(`Goal ${goalId}: ACCEPTED (round ${accepted.decision.round}, review job ${accepted.jobId})`);
  emit('No new review is performed and the Developer is not called.');
  emit('');

  const worktreePath = runtime.worktreePath;
  const absWorktree = join(REPO_ROOT, worktreePath);
  const initialHead = runtime.worktreeInitialHead;
  const previousBaseline = goal.migrationAcceptedBaseline;

  // Everything already done is recorded here; each step checks before acting.
  const closure = { ...(runtime.closure ?? {}), goal: goalId, round: accepted.decision.round };
  const persistClosure = async (patch, state) => {
    Object.assign(closure, patch);
    await store.writeRuntime({ ...(await store.readRuntime()), state, closure });
  };

  // ---------- Accepted snapshot ------------------------------------------
  machine.transitionTo(LOOP_STATES.CLOSURE_PREPARING);
  emit('Verifying the accepted snapshot…');

  const currentChanges = await collectWorktreeChanges(absWorktree, initialHead);
  let snapshot = closure.acceptedSnapshot ?? null;

  if (!snapshot) {
    // Backfill for a Goal accepted before snapshots existed. Only valid when the
    // persisted review packet still matches the worktree byte for byte.
    const artefactDir = join(STATE_DIR, 'artefacts', `${goalId}-r${accepted.decision.round}`);
    const packet = JSON.parse(await fs.readFile(join(artefactDir, 'review-packet.json'), 'utf8'));
    const savedDiff = await fs.readFile(join(artefactDir, 'implementation.patch'), 'utf8');

    snapshot = backfillFromReviewPacket({
      packet, currentChanges, savedDiff, round: accepted.decision.round,
    });
    emit('  snapshot backfilled from the persisted review packet (file list + diff match byte for byte)');
    await persistClosure({ acceptedSnapshot: snapshot }, machine.state);
  } else {
    assertSnapshotUnchanged(snapshot, buildAcceptedSnapshot({
      changes: currentChanges, round: accepted.decision.round,
    }));
    emit('  snapshot unchanged since the acceptance');
  }
  emit(`  files: ${snapshot.fileCount} · diffHash: ${snapshot.diffHash.slice(0, 16)}`);
  emit('');

  // ---------- Closure documentation --------------------------------------
  if (!closure.closureDocsJobId) {
    machine.transitionTo(LOOP_STATES.CLOSURE_DOCUMENTING);
    const jobId = store.newJobId(goalId, accepted.decision.round, 'tech_lead');

    const before = await collectWorktreeChanges(absWorktree, initialHead);
    await store.publishJob('tech_lead', {
      protocolVersion: PROTOCOL_VERSION_V2,
      jobId, role: 'tech_lead', type: 'CLOSURE_DOCUMENTATION',
      goal: goalId, round: accepted.decision.round,
      worktree: absWorktree,
      closureContext: {
        goal: goalId, goalPath: goal.goalPath,
        decision: 'ACCEPTED', finalRound: accepted.decision.round,
        previousMigrationBaseline: previousBaseline,
        executionBase: runtime.executionBase,
        worktreeInitialHead: initialHead,
        acceptedSnapshot: { files: snapshot.fileCount, diffHash: snapshot.diffHash },
        changedFiles: before.changedFiles,
        roundsRun: runtime.roundsRun ?? [],
        writeScope: CLOSURE_WRITE_PREFIX,
      },
    });
    emit(`Closure documentation job published: ${jobId}`);
    await persistClosure({ closureDocsJobId: jobId }, machine.state);

    const envelope = await waitForResult(store, 'tech_lead', jobId);
    if (!envelope.ok) {
      throw new SpikeError('CLOSURE_DOCS_FAILED', `[${envelope.code}] ${envelope.message}`);
    }

    // The model reported what it changed; git says what actually changed.
    const after = await collectWorktreeChanges(absWorktree, initialHead);
    const newFiles = after.changedFiles.filter((f) => !before.changedFiles.includes(f));
    const docScope = [...new Set([...newFiles, ...(envelope.result.documentsUpdated ?? [])])];
    assertClosureScope(docScope);

    emit(`  documents updated: ${envelope.result.documentsUpdated.length}`);
    for (const d of envelope.result.documentsUpdated) emit(`    - ${d}`);
    emit('');
    await persistClosure({ closureDocs: envelope.result.documentsUpdated }, machine.state);
  } else {
    emit(`Closure documentation already done (job ${closure.closureDocsJobId}).`);
    machine.transitionTo(LOOP_STATES.CLOSURE_DOCUMENTING);
  }

  machine.transitionTo(LOOP_STATES.CLOSURE_READY);

  // ---------- Source commit on the Goal branch ----------------------------
  if (!closure.sourceClosureCommit) {
    machine.transitionTo(LOOP_STATES.GOAL_COMMITTING);
    emit('Committing the accepted implementation on the Goal branch…');

    const changes = await collectWorktreeChanges(absWorktree, initialHead);
    const paths = changes.changedFiles.filter((f) => !f.startsWith('graphify-out/') && !f.startsWith('tools/ia-loop/'));

    const { sha, stagedFiles } = await stageAndCommit({
      cwd: absWorktree,
      paths,
      message: `feat(security): complete goal ${goalId} - tenant session whatsapp ownership`,
      excludePaths: ['graphify-out', 'tools/ia-loop'],
    });

    emit(`  sourceClosureCommit: ${sha} (${stagedFiles.length} files)`);
    await persistClosure({ sourceClosureCommit: sha, stagedFiles: stagedFiles.length }, LOOP_STATES.GOAL_COMMITTED);
    machine.transitionTo(LOOP_STATES.GOAL_COMMITTED);
  } else {
    emit(`Source closure commit already exists: ${closure.sourceClosureCommit}`);
    machine.transitionTo(LOOP_STATES.GOAL_COMMITTING);
    machine.transitionTo(LOOP_STATES.GOAL_COMMITTED);
  }
  emit('');

  // ---------- Integrate into the main checkout ----------------------------
  if (!closure.integratedClosureCommit) {
    machine.transitionTo(LOOP_STATES.INTEGRATING_ACCEPTED);

    if (await isAlreadyIntegrated({ repoRoot: REPO_ROOT, sha: closure.sourceClosureCommit })) {
      throw new SpikeError('ALREADY_INTEGRATED',
        `${closure.sourceClosureCommit} is already in main but was not recorded; refusing to integrate twice.`);
    }
    if (await probe.isDirty()) {
      throw new SpikeError('MAIN_CHECKOUT_DIRTY', 'The main checkout must be clean before integrating.');
    }

    emit('Integrating into the main checkout (cherry-pick)…');
    const { after } = await cherryPick({ repoRoot: REPO_ROOT, sha: closure.sourceClosureCommit });
    emit(`  integratedClosureCommit: ${after}`);
    emit('');

    await persistClosure({
      integratedClosureCommit: after,
      previousMigrationBaseline: previousBaseline,
      newMigrationBaseline: after,
    }, LOOP_STATES.BASELINE_ACCEPTED);
    machine.transitionTo(LOOP_STATES.BASELINE_ACCEPTED);
  } else {
    emit(`Already integrated: ${closure.integratedClosureCommit}`);
    machine.transitionTo(LOOP_STATES.INTEGRATING_ACCEPTED);
    machine.transitionTo(LOOP_STATES.BASELINE_ACCEPTED);
  }

  const newBaseline = closure.newMigrationBaseline;
  emit('Migration baseline:');
  emit(`  previous: ${previousBaseline}`);
  emit(`  new:      ${newBaseline}`);
  emit('');

  // ---------- Next Goal planning -----------------------------------------
  const planPath = '.ai-worktrees/plan-next-goal';
  const planBranch = 'ai-loop/plan-next-goal';
  const absPlan = join(REPO_ROOT, planPath);

  if (!closure.planningWorktreeCreated) {
    emit('Creating the planning worktree…');
    await gitCreateWorktree({ repoRoot: REPO_ROOT, path: planPath, branch: planBranch, base: newBaseline });
    await persistClosure({ planningWorktreeCreated: true, planningBase: newBaseline }, LOOP_STATES.BASELINE_ACCEPTED);
  }

  if (!closure.planningJobId) {
    machine.transitionTo(LOOP_STATES.NEXT_GOAL_PLANNING);
    const jobId = store.newJobId(goalId, accepted.decision.round, 'tech_lead');

    await store.publishJob('tech_lead', {
      protocolVersion: PROTOCOL_VERSION_V2,
      jobId, role: 'tech_lead', type: 'NEXT_GOAL_PLANNING',
      goal: goalId, round: accepted.decision.round,
      worktree: absPlan,
      planningContext: {
        closedGoal: goalId,
        closedGoalPath: goal.goalPath,
        closedGoalDecision: 'ACCEPTED',
        previousMigrationBaseline: previousBaseline,
        // The Goal being written must declare exactly this SHA.
        migrationAcceptedBaseline: newBaseline,
        sourceClosureCommit: closure.sourceClosureCommit,
        integratedClosureCommit: closure.integratedClosureCommit,
        closureDocuments: closure.closureDocs ?? [],
        writeScope: CLOSURE_WRITE_PREFIX,
        instruction: 'Escreva SOMENTE o próximo Goal e marque apenas ele READY.',
      },
    });
    emit(`Planning job published: ${jobId}`);
    await persistClosure({ planningJobId: jobId }, machine.state);

    const envelope = await waitForResult(store, 'tech_lead', jobId);
    if (!envelope.ok) throw new SpikeError('PLANNING_FAILED', `[${envelope.code}] ${envelope.message}`);

    const planChanges = await collectWorktreeChanges(absPlan, newBaseline);
    assertClosureScope(planChanges.changedFiles);

    emit(`  next goal: ${envelope.result.nextGoalId} — ${envelope.result.nextGoalTitle}`);
    emit(`  documents updated: ${planChanges.changedFiles.length}`);
    await persistClosure({
      nextGoalId: envelope.result.nextGoalId,
      nextGoalTitle: envelope.result.nextGoalTitle,
      nextGoalPath: envelope.result.nextGoalPath,
      planningDocs: planChanges.changedFiles,
    }, machine.state);
  } else {
    emit(`Planning already done (job ${closure.planningJobId}).`);
    machine.transitionTo(LOOP_STATES.NEXT_GOAL_PLANNING);
  }
  emit('');

  // ---------- Commit and integrate the planning ---------------------------
  if (!closure.sourcePlanningCommit) {
    const planChanges = await collectWorktreeChanges(absPlan, newBaseline);
    assertClosureScope(planChanges.changedFiles);

    const { sha } = await stageAndCommit({
      cwd: absPlan,
      paths: planChanges.changedFiles,
      message: `docs(migration): close Goal${goalId} and prepare next goal`,
    });
    emit(`  sourcePlanningCommit: ${sha}`);
    await persistClosure({ sourcePlanningCommit: sha }, machine.state);
  }

  if (!closure.planningIntegrationCommit) {
    if (await probe.isDirty()) throw new SpikeError('MAIN_CHECKOUT_DIRTY', 'Main must be clean before integrating the planning.');
    const { after } = await cherryPick({ repoRoot: REPO_ROOT, sha: closure.sourcePlanningCommit });
    emit(`  planningIntegrationCommit: ${after}`);
    await persistClosure({ planningIntegrationCommit: after }, LOOP_STATES.NEXT_GOAL_READY);
  }
  machine.transitionTo(LOOP_STATES.NEXT_GOAL_READY);

  // ---------- Supervised stop ---------------------------------------------
  machine.transitionTo(LOOP_STATES.AWAITING_HUMAN);
  const mainHead = await probe.head();

  await store.writeRuntime({
    ...(await store.readRuntime()),
    state: machine.state,
    closure,
    // The baseline is the INTEGRATED closure commit, never the planning commit
    // that came after it.
    migrationAcceptedBaseline: newBaseline,
    goalClosed: true,
    nextGoalExecuted: false,
  });
  await store.appendEvent({
    type: 'GOAL_CLOSED', goal: goalId,
    sourceClosureCommit: closure.sourceClosureCommit,
    integratedClosureCommit: closure.integratedClosureCommit,
    newMigrationBaseline: newBaseline,
    nextGoalId: closure.nextGoalId,
  });

  emit('State:');
  for (const t of machine.history) emit(`  ${t.from} -> ${t.to}`);
  emit('');
  emit(`Goal ${goalId}: ACCEPTED and closed`);
  emit(`sourceClosureCommit:       ${closure.sourceClosureCommit}`);
  emit(`integratedClosureCommit:   ${closure.integratedClosureCommit}`);
  emit(`newMigrationBaseline:      ${newBaseline}`);
  emit(`previousBaseline:          ${previousBaseline}`);
  emit(`next Goal:                 ${closure.nextGoalId} — ${closure.nextGoalTitle} (READY)`);
  emit(`sourcePlanningCommit:      ${closure.sourcePlanningCommit}`);
  emit(`planningIntegrationCommit: ${closure.planningIntegrationCommit}`);
  emit(`main HEAD:                 ${mainHead}`);
  emit('');
  emit(`State: ${machine.state}`);
  emit('');
  emit('Next Goal executed: NO');
  emit('Worktrees preserved. No push, no merge, no PR.');
  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
    console.error(`\nIA Loop — Goal Closure\n\nBlocker: [${code}] ${error.message}\n\nState: HUMAN_REQUIRED`);
    process.exitCode = 1;
  });
