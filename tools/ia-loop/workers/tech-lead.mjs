#!/usr/bin/env node
/**
 * IA Loop — Tech Lead worker (Claude Fable 5.1).
 *
 * Both the process AND the Claude session are persistent. Fable sustains
 * multi-turn conversation reliably (proven in Spike 1), so its session id is
 * kept in the durable registry and resumed across reviews and across restarts.
 *
 * Restart policy, which differs by state on purpose:
 *
 * - IDLE: if a stored session cannot be resumed, starting a fresh one is fine
 *   and is recorded as an event.
 * - Mid-review: a failed resume must NOT silently become a new session. Losing
 *   the reviewer's continuity in the middle of a review changes what is being
 *   reviewed, so the job goes to HUMAN_REQUIRED instead.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

import { resolveClaudeExecutable } from '../lib/claude-process.mjs';
import { createJobStore } from '../lib/job-store.mjs';
import { createPersistentSession } from '../lib/persistent-session.mjs';
import {
  assertSessionsAreIndependent,
  getSession,
  loadRegistry,
  saveRegistry,
  upsertSession,
} from '../lib/session-registry.mjs';
import { SESSION_STRATEGY } from '../lib/worker-registry.mjs';
import { banner, log, runWorkerLoop } from '../lib/worker-loop.mjs';
import { runWithCapacity, RUN_OUTCOMES } from '../lib/capacity-runner.mjs';
import { LOOP_STATES } from '../lib/loop-state.mjs';
import { reviewDecisionSchemaFor, validateReviewJob, validateReviewDecision } from '../lib/contracts-v2.mjs';
import { buildTechLeadContext } from '../lib/context-builders.mjs';
import { renderReviewPrompt } from '../lib/review-packet.mjs';
import {
  CLOSURE_WRITE_PREFIX,
  closureDocSchemaFor,
  planningSchemaFor,
  validateClosureDocResult,
  validatePlanningResult,
} from '../lib/closure-contracts.mjs';
import { readJson } from '../lib/job-store.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '..', '.state');
const REGISTRY_PATH = join(STATE_DIR, 'sessions.json');
const SESSION_CWD = join(STATE_DIR, 'workdirs', 'tech-lead');

const ROLE = 'tech_lead';
const MODEL = process.env.IA_LOOP_TECH_LEAD_MODEL ?? 'claude-fable-5-1';
const TIMEOUT_MS = Number(process.env.IA_LOOP_TECH_LEAD_TIMEOUT_MS ?? 2 * 60 * 60 * 1000);

/**
 * Review profile: read-only by tool surface.
 *
 * Bash is included because a DEEP review needs directed verification (git diff,
 * targeted test runs, graphify). There is no Write or Edit tool, and the
 * orchestrator fingerprints the worktree before and after: any mutation
 * invalidates the review rather than being tolerated.
 */
const REVIEWER_TOOLS = ['Read', 'Glob', 'Grep', 'Bash'];

/**
 * Closure and planning need to WRITE, unlike a review.
 *
 * The write surface is narrowed by policy rather than by tools alone: the
 * orchestrator collects the changed files from git afterwards and fails the job
 * if anything outside docs/migration was touched.
 */
const CLOSURE_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'];

/** Job kinds this worker handles besides a review. */
const CLOSURE_KINDS = ['CLOSURE_DOCUMENTATION', 'NEXT_GOAL_PLANNING'];

function buildClosureDocPrompt(job) {
  return [
    'Você está atuando como Tech Lead no FECHAMENTO de um Goal já aceito.',
    '',
    'Isto NÃO é um review. A decisão ACCEPTED já foi tomada por você na rodada anterior',
    'e não deve ser reaberta, reavaliada nem revertida.',
    '',
    'Contexto do fechamento:',
    JSON.stringify(job.closureContext, null, 2),
    '',
    `Trabalhe dentro de: ${job.worktree}`,
    '',
    'Tarefa: registrar de forma factual e seletiva o que este Goal mudou.',
    '',
    `Você pode escrever SOMENTE em ${CLOSURE_WRITE_PREFIX}. Qualquer alteração fora disso`,
    'encerra o fechamento e exige intervenção humana.',
    '',
    'Atualize apenas os documentos realmente afetados. Candidatos, quando pertinente:',
    '  docs/migration/reviews/003-review.md (o review desta execução)',
    '  CURRENT_STATE.md, GAP_ANALYSIS.md, REUSE_ANALYSIS.md, DATA_MIGRATION.md,',
    '  DECISIONS.md, TARGET_ARCHITECTURE.md, MASTER_PLAN.md',
    '',
    'NÃO faça agora, em hipótese alguma:',
    '- criar o próximo Goal;',
    '- marcar qualquer Goal como READY;',
    '- registrar o novo SHA de baseline (ele ainda não existe);',
    '- atualizar MIGRATION_STATUS para o fechamento (é etapa posterior);',
    '- tocar em código, testes, tooling ou configuração.',
    '',
    'Não atualize um documento só para mexer em data ou formatação: registre substância.',
    '',
    'Retorne exclusivamente o JSON do contrato ClosureDocResult, listando em',
    'documentsUpdated os caminhos que você realmente alterou.',
  ].join('\n');
}

function buildPlanningPrompt(job) {
  return [
    'Você está atuando como Tech Lead no PLANEJAMENTO do próximo Goal.',
    '',
    'O Goal anterior já foi aceito, fechado e integrado. A nova baseline aceita já existe',
    'e está no contexto abaixo. Use exatamente esse SHA.',
    '',
    'Contexto do planejamento:',
    JSON.stringify(job.planningContext, null, 2),
    '',
    `Trabalhe dentro de: ${job.worktree}`,
    `Você pode escrever SOMENTE em ${CLOSURE_WRITE_PREFIX}.`,
    '',
    'Reavalie o roadmap de forma INCREMENTAL, à luz do que o Goal fechado revelou.',
    'Não repita o Goal0, não releia o Product Vault inteiro, não refaça discovery',
    'de arquitetura sem evidência concreta.',
    '',
    'Faça, nesta ordem:',
    '1. atualizar MIGRATION_STATUS: o Goal fechado como ACCEPTED, com o commit/baseline correto;',
    '2. registrar o que o fechamento exigir de administrativo;',
    '3. atualizar MASTER_PLAN somente se a evidência exigir;',
    '4. registrar nova decisão apenas se houver evidência concreta nova;',
    '5. escrever SOMENTE o próximo Goal executável;',
    '6. marcar READY apenas esse próximo Goal;',
    '7. declarar nele a baseline aceita, com o SHA exato do contexto.',
    '',
    'O roadmap vigente aponta para o próximo Goal esperado, mas você NÃO é obrigado a',
    'mantê-lo: se a evidência do Goal fechado justificar inserir, reordenar ou superseder,',
    'faça — e registre o motivo. Preserve IDs e histórico.',
    '',
    'Não detalhe Goals posteriores. Apenas um próximo Goal, e só ele READY.',
    '',
    'Retorne exclusivamente o JSON do contrato PlanningResult.',
  ].join('\n');
}

async function handleClosureJob(job) {
  const kind = job.type;
  currentJob = { goal: job.goal, round: job.round ?? 0 };
  workerState = 'WORKING';

  log(`${kind} ${job.goal} RECEIVED`);
  await store.appendEvent({ type: `${kind}_RECEIVED`, jobId: job.jobId, goal: job.goal });

  await store.writeRuntime({
    ...(await store.readRuntime()),
    state: kind === 'CLOSURE_DOCUMENTATION' ? 'CLOSURE_DOCUMENTING' : 'NEXT_GOAL_PLANNING',
    currentJobId: job.jobId,
  });

  const isPlanning = kind === 'NEXT_GOAL_PLANNING';
  const prompt = isPlanning ? buildPlanningPrompt(job) : buildClosureDocPrompt(job);
  const schema = isPlanning
    ? planningSchemaFor({ jobId: job.jobId, goal: job.goal })
    : closureDocSchemaFor({ jobId: job.jobId, goal: job.goal });
  const validate = isPlanning
    ? (p) => validatePlanningResult(p, { jobId: job.jobId, goal: job.goal })
    : (p) => validateClosureDocResult(p, { jobId: job.jobId, goal: job.goal });

  log('FABLE STARTED', `session ${session.sessionId.slice(0, 8)} · ${kind}`);

  const run = await runWithCapacity({
    store,
    role: ROLE,
    jobId: job.jobId,
    goal: job.goal,
    round: job.round ?? 0,
    resumeFrom: isPlanning ? LOOP_STATES.NEXT_GOAL_PLANNING : LOOP_STATES.CLOSURE_DOCUMENTING,
    onEvent: onCapacityEvent,
    invoke: async () => {
      const outcome = await session.send({
        prompt,
        jsonSchema: schema,
        validatePayload: validate,
        tools: CLOSURE_TOOLS,
        permissionMode: 'auto',
        addDirs: job.worktree ? [job.worktree] : [],
        safeMode: false,
      });
      await persistSession();
      return outcome;
    },
  });

  log('FABLE COMPLETED', run.outcome);

  if (run.outcome === RUN_OUTCOMES.HUMAN_REQUIRED) {
    workerState = 'ERROR';
    await store.appendEvent({ type: `${kind}_FAILED`, jobId: job.jobId, code: run.reason });
    currentJob = null; capacityWait = null; workerState = 'IDLE';
    return;
  }

  workerState = 'PUBLISHING';
  await store.appendEvent({
    type: `${kind}_PUBLISHED`, jobId: job.jobId, goal: job.goal,
    documents: run.result?.documentsUpdated?.length ?? 0,
    nextGoalId: run.result?.nextGoalId ?? null,
    reused: run.outcome === RUN_OUTCOMES.ALREADY_COMPLETED,
  });
  log(`${kind} DONE`, isPlanning ? `next goal ${run.result?.nextGoalId}` : `${run.result?.documentsUpdated?.length ?? 0} docs`);
  currentJob = null; capacityWait = null; workerState = 'IDLE';
}


const store = createJobStore(STATE_DIR);

let workerState = 'STARTING';
let session = null;
let currentJob = null;
let capacityWait = null;

const getStatus = () => ({
  state: workerState,
  model: MODEL,
  sessionStrategy: SESSION_STRATEGY.PERSISTENT,
  sessionId: session?.sessionId ?? null,
  detail: currentJob ? `${currentJob.goal}/R${currentJob.round}` : null,
  capacityReason: capacityWait?.reason ?? null,
  nextRetryAt: capacityWait?.nextRetryAt ?? null,
});

function onCapacityEvent(event) {
  if (event.type === 'CAPACITY_WAIT' || event.type === 'CAPACITY_WAIT_RESUMED_FROM_DISK') {
    capacityWait = { reason: event.reason, nextRetryAt: event.nextRetryAt ?? capacityWait?.nextRetryAt ?? null };
    workerState = 'WAITING_FOR_CAPACITY';
    log('CAPACITY LIMIT', `${event.reason} · retry in ${event.remaining}`);
    log('STATE', 'WAITING_FOR_CAPACITY · Goal state preserved');
    if (event.resumeFrom) log('RESUME', event.resumeFrom);
  } else if (event.type === 'CAPACITY_AVAILABLE') {
    log('CAPACITY AVAILABLE', 'resuming');
    capacityWait = null;
    workerState = 'WORKING';
  } else if (event.type === 'ALREADY_COMPLETED') {
    log('ALREADY COMPLETED', 'decision on disk; model not called again');
  } else if (event.type === 'HUMAN_REQUIRED') {
    log('HUMAN REQUIRED', event.reason);
    capacityWait = null;
  }
}

/**
 * Restores the session from the durable registry, or creates one.
 * Returns whether an existing session was resumed.
 */
async function restoreSession(executable) {
  await mkdir(SESSION_CWD, { recursive: true });

  const registry = await loadRegistry(REGISTRY_PATH);
  const record = getSession(registry, ROLE);
  const resumed = Boolean(record?.sessionId);

  session = createPersistentSession({
    executable,
    role: ROLE,
    model: MODEL,
    expectedFamily: 'fable',
    cwd: record?.cwd ?? SESSION_CWD,
    sessionId: record?.sessionId,
    started: resumed,
    timeoutMs: TIMEOUT_MS,
  });

  return resumed;
}

async function persistSession() {
  const registry = await loadRegistry(REGISTRY_PATH);
  const next = upsertSession(registry, ROLE, session.toRecord());
  // Guards the invariant that the Tech Lead and the Developer can never end up
  // on the same conversation.
  assertSessionsAreIndependent(next);
  await saveRegistry(REGISTRY_PATH, next);
}

function buildPrompt(context) {
  return [
    'Você está atuando como Tech Lead revisando uma entrega no pipeline do Atendly.',
    '',
    'Pacote de review (o repositório é a autoridade, não a sua memória):',
    JSON.stringify(context, null, 2),
    '',
    'Avalie a entrega contra o Goal e os guardrails do AGENTS.md.',
    '',
    'Retorne exclusivamente o JSON do contrato ReviewDecision.',
  ].join('\n');
}

async function handleJob(rawJob) {
  // Closure and planning are not reviews and use their own contracts.
  if (CLOSURE_KINDS.includes(rawJob?.type)) {
    await handleClosureJob(rawJob);
    return;
  }

  const job = validateReviewJob(rawJob);
  currentJob = { goal: job.goal, round: job.round };
  workerState = 'WORKING';

  log(`REVIEW ${job.goal}/R${job.round} RECEIVED`, `level ${job.reviewLevel}`);
  await store.appendEvent({ type: 'REVIEW_JOB_RECEIVED', jobId: job.jobId, goal: job.goal, round: job.round });

  const context = buildTechLeadContext({
    goal: job.goal,
    goalPath: job.goalPath,
    round: job.round,
    reviewLevel: job.reviewLevel,
    migrationAcceptedBaseline: job.migrationAcceptedBaseline,
    executionBase: job.executionBase,
    worktree: job.worktree,
    changedFiles: [...job.changedFiles],
    diffStat: job.diffStat ?? null,
    implementationReport: job.implementationReport,
    validations: job.validations ?? [],
    previousBlockers: [...job.previousBlockers],
  });

  // A real review reads the packet the orchestrator persisted, which carries
  // the change surface collected from git rather than claimed by the Developer.
  // Persist the running state BEFORE the model call, for the same reason.
  await store.writeRuntime({
    ...(await store.readRuntime()),
    state: 'REVIEWER_RUNNING',
    round: job.round,
    currentJobId: job.jobId,
  });

  const packet = job.packetPath ? await readJson(job.packetPath, { required: true }) : null;
  const prompt = packet ? renderReviewPrompt(packet) : buildPrompt(context);

  log('FABLE STARTED', `session ${session.sessionId.slice(0, 8)}`);
  if (packet) log('DEEP REVIEW', `${packet.changedFiles.length} arquivos alterados`);

  // The SAME Fable session is resumed on every retry: a capacity limit must not
  // cost the reviewer its continuity, and never switches model.
  const run = await runWithCapacity({
    store,
    role: ROLE,
    jobId: job.jobId,
    goal: job.goal,
    round: job.round,
    resumeFrom: LOOP_STATES.REVIEWER_RUNNING,
    onEvent: onCapacityEvent,
    invoke: async () => {
      const outcome = await session.send({
        prompt,
        jsonSchema: reviewDecisionSchemaFor({ jobId: job.jobId, goal: job.goal, round: job.round }),
        tools: REVIEWER_TOOLS,
        permissionMode: 'auto',
        addDirs: job.worktree ? [job.worktree] : [],
        safeMode: false,
        validatePayload: (payload) => validateReviewDecision(payload, {
          jobId: job.jobId,
          goal: job.goal,
          round: job.round,
        }),
      });
      await persistSession();
      return outcome;
    },
  });

  log('FABLE COMPLETED', run.outcome);

  if (run.outcome === RUN_OUTCOMES.HUMAN_REQUIRED) {
    workerState = 'ERROR';
    log('DECISION HUMAN_REQUIRED', run.reason);
    await store.appendEvent({ type: 'REVIEW_JOB_FAILED', jobId: job.jobId, code: run.reason, escalation: 'HUMAN_REQUIRED' });
    currentJob = null;
    capacityWait = null;
    workerState = 'IDLE';
    return;
  }

  workerState = 'PUBLISHING';
  await store.appendEvent({
    type: 'REVIEW_DECISION_PUBLISHED',
    jobId: job.jobId,
    goal: job.goal,
    round: job.round,
    decision: run.result?.decision ?? 'UNKNOWN',
    reused: run.outcome === RUN_OUTCOMES.ALREADY_COMPLETED,
  });

  log(`DECISION ${run.result?.decision ?? 'UNKNOWN'}`);
  currentJob = null;
  capacityWait = null;
  workerState = 'IDLE';
}

async function main() {
  const executable = resolveClaudeExecutable();
  const resumed = await restoreSession(executable.path);

  console.log(banner({
    title: 'TECH LEAD',
    model: `Claude Fable 5.1 (${MODEL})`,
    sessionLine: `Session: ${session.sessionId.slice(0, 8)} (${resumed ? 'resumed from registry' : 'new'})`,
    extra: ['Session strategy: PERSISTENT'],
  }));
  console.log('Waiting for review task...\n');

  await persistSession();
  workerState = 'IDLE';
  await runWorkerLoop({ store, role: ROLE, getStatus, handleJob });
}

main().catch((error) => {
  console.error(`Tech Lead worker failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
