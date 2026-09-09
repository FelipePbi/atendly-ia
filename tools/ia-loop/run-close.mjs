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
import { createJobStore, readJson } from './lib/job-store.mjs';
import {
  ROUTING_STAGES,
  classifyPlanningComplexity,
  resolveRoutingMode,
  routeTechLead,
  toJobRouting,
} from './lib/model-routing.mjs';
import { discoverGoal } from './lib/goal-discovery.mjs';
import { readWorkerHealth, WORKER_HEALTH } from './lib/worker-registry.mjs';
import { LOOP_STATES, createLoopStateMachine } from './lib/loop-state.mjs';
import { PROTOCOL_VERSION_V2 } from './lib/contracts-v2.mjs';
import { assertClosureScope, CLOSURE_WRITE_PREFIX } from './lib/closure-contracts.mjs';
import { assertMigrationComplete } from './lib/planning-decision.mjs';
import { createDeveloperProfileStore, resolveDeveloperProfile } from './lib/developer-profiles.mjs';
import { parseMigrationStatus } from './lib/goal-discovery.mjs';
import { classifyLease, createLeaseStore } from './lib/leases.mjs';
import { isDirectExecution } from './lib/direct-execution.mjs';
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

/** Cap on the text handed to the classifier. It reads signals, not documents. */
const RISK_TEXT_LIMIT = 40_000;

/**
 * The text the planning risk is scored from.
 *
 * The roadmap the planner is about to re-evaluate, plus the Goal it just
 * closed — the two documents that actually say what comes next and how hard it
 * was to get here. Missing files are not an error: a signal that cannot be read
 * simply does not fire, and the score falls back to what can.
 */
async function readPlanningRiskText({ goal, closure }) {
  const candidates = [
    join(REPO_ROOT, 'docs', 'migration', 'MASTER_PLAN.md'),
    goal?.goalPath ?? null,
    ...(closure?.closureDocs ?? [])
      .filter((doc) => doc.includes('review'))
      .map((doc) => join(REPO_ROOT, doc)),
  ].filter(Boolean);

  const parts = [];
  for (const path of candidates) {
    try {
      parts.push(await fs.readFile(path, 'utf8'));
    } catch {
      // Unreadable or absent: no signal, not a failure.
    }
  }
  return parts.join('\n').slice(0, RISK_TEXT_LIMIT);
}

/** Whether any Developer round of this Goal had to be escalated to a stronger model. */
async function goalHadDeveloperEscalation(store, goalId) {
  // listJobs returns file names; the job id is the name without its extension.
  const fileNames = await store.listJobs('developer').catch(() => []);
  for (const fileName of fileNames) {
    const jobId = String(fileName).replace(/\.json$/, '');
    if (!jobId.startsWith(`${goalId}-`)) continue;
    const envelope = await readJson(store.paths.job('developer', jobId));
    if ((envelope?.attemptHistory ?? []).some((entry) => entry?.reason === 'MODEL_ESCALATION')) return true;
  }
  return false;
}
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

/**
 * Waits for a result. An observer timeout never fails the job — same reasoning
 * as in run-goal. Closure and planning write to docs, so a duplicate execution
 * here is as harmful as a duplicate implementation.
 */
async function waitForResult(store, role, jobId, { leaseStore } = {}) {
  const startedAt = Date.now();
  let lastState = null;
  for (;;) {
    const envelope = await store.readResult(role, jobId);
    if (envelope) return envelope;

    if (Date.now() - startedAt > RESULT_TIMEOUT_MS) {
      const lease = await leaseStore?.readJobLease(jobId);
      const { status } = lease ? classifyLease(lease) : { status: null };
      throw new SpikeError(
        'OBSERVER_TIMEOUT',
        `Stopped observing ${jobId}. The job was NOT failed and keeps its lease (${status ?? 'no lease'}). `
        + 'Re-run the closure once it finishes; it resumes instead of repeating.',
      );
    }

    const health = await readWorkerHealth(store, role);
    if (health.state !== lastState) {
      lastState = health.state;
      const suffix = health.capacityReason ? ` (${health.capacityReason})` : '';
      emit(`  … ${role}: ${health.state ?? 'unknown'}${suffix}`);
    }
    if (health.health === WORKER_HEALTH.OFFLINE) {
      throw new SpikeError('WORKER_OFFLINE',
        `The "${role}" worker stopped heartbeating. The attempt keeps its lease; no new attempt is started.`);
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
  const leaseStore = createLeaseStore(STATE_DIR);
  const profileStore = createDeveloperProfileStore(STATE_DIR);
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
  // The gate protects the moment BEFORE the closure commit. Once that commit
  // exists the snapshot has already been verified and consumed, and the tree has
  // legitimately moved on — closure docs were added and the work was committed.
  // Re-checking here would block every resume.
  machine.transitionTo(LOOP_STATES.CLOSURE_PREPARING);

  const currentChanges = await collectWorktreeChanges(absWorktree, initialHead);
  let snapshot = closure.acceptedSnapshot ?? null;

  if (closure.sourceClosureCommit) {
    emit(`Accepted snapshot already verified and committed as ${closure.sourceClosureCommit}.`);
    emit(`  files: ${snapshot?.fileCount ?? 'n/a'} · diffHash: ${(snapshot?.diffHash ?? '').slice(0, 16)}`);
    emit('');
  } else if (!snapshot) {
    emit('Verifying the accepted snapshot…');
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
    emit(`  files: ${snapshot.fileCount} · diffHash: ${snapshot.diffHash.slice(0, 16)}`);
    emit('');
  } else {
    emit('Verifying the accepted snapshot…');
    assertSnapshotUnchanged(snapshot, buildAcceptedSnapshot({
      changes: currentChanges, round: accepted.decision.round,
    }));
    emit('  snapshot unchanged since the acceptance');
    emit(`  files: ${snapshot.fileCount} · diffHash: ${snapshot.diffHash.slice(0, 16)}`);
    emit('');
  }

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

    const envelope = await waitForResult(store, 'tech_lead', jobId, { leaseStore });
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
  // A deterministic, unique name per Goal. Reusing one generic path across
  // cycles would collide the moment the loop runs unattended, and would lose the
  // audit trail of which planning produced which Goal.
  const planPath = `.ai-worktrees/plan-after-goal-${goalId}`;
  const planBranch = `ai-loop/plan-after-goal-${goalId}`;
  const absPlan = join(REPO_ROOT, planPath);

  if (!closure.planningWorktreeCreated) {
    emit('Creating the planning worktree…');
    await gitCreateWorktree({ repoRoot: REPO_ROOT, path: planPath, branch: planBranch, base: newBaseline });
    await persistClosure({ planningWorktreeCreated: true, planningBase: newBaseline }, LOOP_STATES.BASELINE_ACCEPTED);
  }

  if (!closure.planningJobId) {
    machine.transitionTo(LOOP_STATES.NEXT_GOAL_PLANNING);
    const jobId = store.newJobId(goalId, accepted.decision.round, 'tech_lead');

    // --- Planning routing --------------------------------------------------
    // Scored from the roadmap the planner is about to re-evaluate and from
    // what already went wrong, since at planning time there is no diff to
    // read. Deterministic and zero-token: no model is called to choose a model.
    const planningAssessment = classifyPlanningComplexity({
      text: await readPlanningRiskText({ goal, closure }),
      history: {
        previousRoundRejected: (accepted.decision.round ?? 1) > 1,
        previousDeveloperEscalation: await goalHadDeveloperEscalation(store, goalId),
      },
    });
    const planningRouting = routeTechLead({
      stage: ROUTING_STAGES.PLANNING,
      assessment: planningAssessment,
      mode: resolveRoutingMode(),
    });
    emit(`Planning routing: ${planningAssessment.classification} (score ${planningAssessment.riskScore})`
      + ` → ${planningRouting.label} effort ${planningRouting.effort}`);
    if (planningAssessment.signals.length > 0) emit(`  signals: ${planningAssessment.signals.join(', ')}`);

    await store.publishJob('tech_lead', {
      protocolVersion: PROTOCOL_VERSION_V2,
      jobId, role: 'tech_lead', type: 'NEXT_GOAL_PLANNING',
      goal: goalId, round: accepted.decision.round,
      worktree: absPlan,
      routing: toJobRouting(planningRouting),
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

    const envelope = await waitForResult(store, 'tech_lead', jobId, { leaseStore });
    if (!envelope.ok) throw new SpikeError('PLANNING_FAILED', `[${envelope.code}] ${envelope.message}`);

    const planChanges = await collectWorktreeChanges(absPlan, newBaseline);
    assertClosureScope(planChanges.changedFiles);

    const planning = envelope.result;

    if (planning.decision === 'HUMAN_REQUIRED') {
      throw new SpikeError('PRODUCT_DECISION',
        `The Tech Lead asked for a human before the next Goal: ${planning.reason}`);
    }

    if (planning.decision === 'MIGRATION_COMPLETE') {
      // The declaration is checked against the repository: a Goal still READY
      // means the migration demonstrably is not finished, whatever was claimed.
      const statusText = await fs.readFile(join(REPO_ROOT, 'docs/migration/MIGRATION_STATUS.md'), 'utf8');
      const { goalStatuses } = parseMigrationStatus(statusText);
      goalStatuses.delete(goalId);
      assertMigrationComplete({ decision: planning, goalStatuses });

      emit(`  MIGRATION_COMPLETE: ${planning.reason}`);
      await persistClosure({
        migrationComplete: true,
        migrationCompleteReason: planning.reason,
        planningDocs: planChanges.changedFiles,
      }, machine.state);
    } else {
      emit(`  next goal: ${planning.nextGoalId} — ${planning.nextGoalTitle}`);
      emit(`  developer profile: ${planning.developerProfile}`);
      emit(`  documents updated: ${planChanges.changedFiles.length}`);

      // The routing decision outlives this process: the Goal it applies to is
      // executed later, by `run-goal`. Recorded durably here so a restart in
      // between cannot lose it and nothing has to re-derive it from prose.
      await profileStore.write(planning.nextGoalId, {
        profile: planning.developerProfile,
        reason: planning.developerProfileReason,
        selectedBy: 'tech_lead',
        stage: 'NEXT_GOAL_PLANNING',
      });
      await store.appendEvent({
        type: 'DEVELOPER_PROFILE_SELECTED',
        goal: planning.nextGoalId,
        round: 1,
        stage: 'NEXT_GOAL_PLANNING',
        profile: planning.developerProfile,
        model: resolveDeveloperProfile(planning.developerProfile).model,
        effort: resolveDeveloperProfile(planning.developerProfile).effort,
        selectedBy: 'tech_lead',
        reason: planning.developerProfileReason ?? null,
      });

      await persistClosure({
        nextGoalId: planning.nextGoalId,
        nextGoalTitle: planning.nextGoalTitle,
        nextGoalPath: planning.nextGoalPath,
        nextGoalDeveloperProfile: planning.developerProfile,
        planningDocs: planChanges.changedFiles,
      }, machine.state);
    }
  } else {
    machine.transitionTo(LOOP_STATES.NEXT_GOAL_PLANNING);

    if (closure.nextGoalId) {
      emit(`Planning already done (job ${closure.planningJobId}), next Goal ${closure.nextGoalId}.`);
    } else {
      // The planning job ran and the Tech Lead's work is on disk, but the
      // result was not recorded — a harness failure after the inference. The
      // work is recovered from the worktree instead of paying for it twice.
      emit(`Planning job ${closure.planningJobId} already ran; recovering its result from the worktree.`);

      const planChanges = await collectWorktreeChanges(absPlan, newBaseline);
      assertClosureScope(planChanges.changedFiles);

      const goalFiles = planChanges.changedFiles.filter((p) => /^docs\/migration\/goals\/\d{3}-.+\.md$/.test(p));
      const newGoals = goalFiles.filter((p) => !p.includes(`/${goalId}-`));
      if (newGoals.length !== 1) {
        throw new SpikeError(
          'PLANNING_RESULT_AMBIGUOUS',
          `Expected exactly one new Goal in the planning worktree, found ${newGoals.length}: ${newGoals.join(', ')}`,
        );
      }

      const nextGoalPath = newGoals[0];
      const nextGoalId = nextGoalPath.match(/goals\/(\d{3})-/)[1];
      const heading = (await fs.readFile(join(absPlan, nextGoalPath), 'utf8')).split('\n')[0];
      const nextGoalTitle = heading.replace(/^#\s*Goal\s+\d{3}\s*[—-]\s*/, '').trim();

      emit(`  recovered: Goal ${nextGoalId} — ${nextGoalTitle}`);
      await persistClosure({
        nextGoalId, nextGoalTitle, nextGoalPath,
        planningDocs: planChanges.changedFiles,
        planningRecovered: true,
      }, machine.state);
    }
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
  emit(closure.migrationComplete
    ? `migration:                 COMPLETE — ${closure.migrationCompleteReason}`
    : `next Goal:                 ${closure.nextGoalId} — ${closure.nextGoalTitle} (READY)`);
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

// Only when this file IS the program. Importing it — from a test, a doc
// generator, or an agent reading the tooling — must never start anything.
if (isDirectExecution(import.meta.url)) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
      console.error(`\nIA Loop — Goal Closure\n\nBlocker: [${code}] ${error.message}\n\nState: HUMAN_REQUIRED`);
      process.exitCode = 1;
    });
}
