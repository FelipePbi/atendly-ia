#!/usr/bin/env node
/**
 * IA Loop — Developer worker.
 *
 * ONE worker, many profiles. The model and the effort are NOT properties of
 * this process: they arrive on the job, chosen by the Tech Lead for that Goal
 * and that round. There is deliberately no `ia-loop:developer-sonnet` and no
 * `ia-loop:developer-opus` — a second worker would be a second place for the
 * routing decision to drift.
 *
 * The PROCESS is persistent; the INFERENCE is not.
 *
 * Every job gets a brand-new Claude session. There is no --resume, no session
 * registry entry, and no attempt to carry hidden conversation state between
 * tasks. Spike 1 established that Opus 5 does not sustain reliable multi-turn
 * conversation in this environment, so context is reinjected explicitly by the
 * orchestrator instead.
 *
 * This is deliberate. Do not "fix" it by adding resume.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { invokeAgent, resolveClaudeExecutable } from '../lib/claude-process.mjs';
import { createJobStore } from '../lib/job-store.mjs';
import { SESSION_STRATEGY } from '../lib/worker-registry.mjs';
import { banner, log, runWorkerLoop } from '../lib/worker-loop.mjs';
import {
  SELECTABLE_DEVELOPER_PROFILES,
  assertProfileWasHonoured,
  describeProfile,
  resolveDeveloperProfile,
} from '../lib/developer-profiles.mjs';
import { createTelemetry, createTelemetryFileSink, resolveLogLevel } from '../lib/telemetry.mjs';
import { runWithCapacity, RUN_OUTCOMES } from '../lib/capacity-runner.mjs';
import { LOOP_STATES } from '../lib/loop-state.mjs';
import { developerResultSchemaFor, validateDeveloperJob, validateDeveloperResult } from '../lib/contracts-v2.mjs';
import { buildDeveloperContext, buildCorrectionContext } from '../lib/context-builders.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '..', '.state');

const ROLE = 'developer';
// A real Goal is hours of work, not minutes.
const TIMEOUT_MS = Number(process.env.IA_LOOP_DEVELOPER_TIMEOUT_MS ?? 4 * 60 * 60 * 1000);

const LOG_LEVEL = resolveLogLevel();
const PERSIST_TELEMETRY = process.env.IA_LOOP_TELEMETRY_PERSIST !== '0';
/**
 * Real-time telemetry is derived from the CLI's own event stream. Turning it
 * off falls back to the single-JSON output format; it never changes the prompt,
 * the schema, the model or the effort either way.
 */
const STREAM_EVENTS = process.env.IA_LOOP_STREAM_EVENTS !== '0';

/**
 * Execution profile for real work.
 *
 * The Developer needs to read, write and run commands inside its worktree.
 * Measured: only permission mode "auto" authorises both file writes and Bash
 * without a prompt. safeMode is off so the project's own CLAUDE.md and AGENTS.md
 * rules load, which the Goal explicitly requires the executor to follow.
 *
 * These guards detect, they do not sandbox: Bash can reach outside the
 * worktree. The orchestrator snapshots the repository before and after and
 * fails the run on any violation.
 */
const DEVELOPER_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'TodoWrite'];

const store = createJobStore(STATE_DIR);

const telemetry = createTelemetry({
  level: LOG_LEVEL,
  role: ROLE,
  sink: createTelemetryFileSink({ stateDir: STATE_DIR, role: ROLE, enabled: PERSIST_TELEMETRY }),
});

let workerState = 'STARTING';
let currentJob = null;
// The profile the job in flight is running on. Read from the job, never
// decided here: this worker executes a routing choice, it does not make one.
let currentProfile = null;
// Kept so the heartbeat keeps reporting a live, waiting worker rather than
// looking stalled while a model limit is being waited out.
let capacityWait = null;

const getStatus = () => ({
  state: workerState,
  // What is actually running, not a constant. An IDLE worker has no model.
  model: currentProfile?.model ?? null,
  developerProfile: currentProfile?.name ?? null,
  effort: currentProfile?.effort ?? null,
  supportedProfiles: [...SELECTABLE_DEVELOPER_PROFILES],
  sessionStrategy: SESSION_STRATEGY.STATELESS,
  // No session id is ever retained between jobs; only the in-flight one is
  // reported, and truncated.
  sessionId: currentJob?.sessionId ?? null,
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
    log('ALREADY COMPLETED', 'result on disk; model not called again');
  } else if (event.type === 'HUMAN_REQUIRED') {
    log('HUMAN REQUIRED', event.reason);
    capacityWait = null;
  }
}

/**
 * Prompt for a correction round.
 *
 * The blockers are the authority, not the Goal as a whole. The engine stays
 * generic: everything Goal-specific arrives inside the structured context.
 */
function buildCorrectionPrompt(context, job) {
  return [
    'Você está atuando como Developer em um pipeline automatizado do Atendly.',
    `Esta é a correction round ${context.round} do Goal ${context.goal}.`,
    '',
    `A implementação da rodada ${context.previousRound} PERMANECE na worktree. Ela não foi revertida.`,
    '',
    'Contexto explícito desta rodada (não há conversa anterior):',
    JSON.stringify(context, null, 2),
    '',
    `Trabalhe exclusivamente dentro de: ${job.worktree}`,
    '',
    'Corrija SOMENTE os blockers listados em blockers. Cada um foi registrado pelo Tech Lead',
    'na revisão da rodada anterior e é a autoridade desta rodada.',
    '',
    'NÃO reverta nem reimplemente partes sem relação com os blockers.',
    'Preserve os critérios do Goal que já foram atendidos.',
    '',
    'Antes de corrigir, inspecione o código real na worktree — não confie apenas na descrição.',
    'Leia o Goal em ' + context.goalPath + ' para confirmar o critério de cada ponto tocado.',
    '',
    'Depois de corrigir, execute os testes dirigidos das correções e em seguida as validações',
    'do Goal necessárias para provar ausência de regressão.',
    '',
    'Você NÃO PODE: criar commit, push, merge ou PR; mudar de branch; alterar o checkout',
    'principal; escrever fora da worktree; editar documentos de controle da migração',
    '(goals/, reviews/, MIGRATION_STATUS.md); declarar o Goal ACCEPTED; criar o próximo Goal.',
    'O orchestrator verifica isso no Git depois; violação encerra a execução.',
    '',
    `Retorne exclusivamente o JSON do contrato DeveloperResult, com protocolVersion 2,`,
    `jobId exatamente "${job.jobId}", goal "${job.goal}", round ${job.round}, e com o implementationReport`,
    `desta rodada (R${context.round}): o que mudou por blocker, comandos executados com`,
    'resultado, e limitações. Não invente resultado de validação que você não executou.',
  ].join('\n');
}

function buildPrompt(context, job) {
  return [
    'Você está atuando como Developer em um pipeline automatizado do Atendly.',
    'Esta é uma execução REAL: você deve implementar o Goal de verdade nesta worktree.',
    '',
    'Contexto explícito desta tarefa (não há conversa anterior; nada foi dito antes):',
    JSON.stringify(context, null, 2),
    '',
    `Trabalhe exclusivamente dentro de: ${job.worktree}`,
    '',
    'Autorização e critério: o próprio Goal, em ' + context.goalPath + '.',
    'Leia-o por inteiro antes de começar. Ele define escopo, pontos de implementação,',
    'o que é obrigatório e o que está fora de escopo. Não amplie o Goal.',
    '',
    'Leia também CLAUDE.md e AGENTS.md e siga as regras do projeto, inclusive',
    'consulta seletiva (Graphify para call paths, Product Vault sob demanda).',
    'Não carregue documentação inteira.',
    '',
    'Você PODE: ler código, usar Graphify, editar a worktree, criar migrations,',
    'criar/alterar testes e executar comandos, incluindo as validações que o Goal exigir.',
    '',
    'Você NÃO PODE, em nenhuma hipótese:',
    '- criar commit, push, merge ou PR;',
    '- mudar de branch ou alterar o checkout principal do repositório;',
    '- escrever fora da worktree indicada;',
    '- editar documentos de controle da migração (goals/, reviews/, MIGRATION_STATUS.md);',
    '- declarar o Goal ACCEPTED ou alterar a baseline aceita;',
    '- criar o próximo Goal.',
    'O orchestrator verifica isso no Git depois; violação encerra a execução.',
    '',
    'Ao terminar, retorne exclusivamente o JSON do contrato DeveloperResult, com:',
    '- protocolVersion: 2 (obrigatório, exatamente esse valor);',
    `- jobId: exatamente "${job.jobId}"; goal: "${job.goal}"; round: ${job.round};`,
    '- status: "REVIEW_REQUIRED" se implementou, "BLOCKED" se não pôde prosseguir;',
    '- summary: uma frase;',
    '- implementationReport: relatório conforme o Goal pede (diff inicial/final, arquivos e',
    '  consumers, decisões de escopo, migrations/compatibilidade, RED/GREEN dos casos negativos,',
    '  comandos executados com resultado, e limitações);',
    '- validations: lista de {name, passed, detail} com as validações que você realmente rodou.',
    '',
    'Não invente resultado de validação que você não executou.',
  ].join('\n');
}

async function handleJob(rawJob) {
  const job = validateDeveloperJob(rawJob);
  // Fails closed on an unknown name: a typo must stop the run, never quietly
  // land on some other model.
  const profile = resolveDeveloperProfile(job.developerProfile);
  currentJob = { goal: job.goal, round: job.round, sessionId: null };
  currentProfile = profile;
  workerState = 'WORKING';

  telemetry.setContext({ goal: job.goal, round: job.round, jobId: job.jobId });
  telemetry.event('JOB', `${job.goal}/R${job.round} ${job.type}`);
  telemetry.event('PROFILE', profile.name);
  telemetry.event('MODEL', `${profile.label} · effort ${profile.effortLabel}`);

  log(`JOB ${job.goal}/R${job.round} RECEIVED`, `type ${job.type}`);
  log('PROFILE', profile.name);
  log('MODEL', profile.label);
  log('EFFORT', profile.effortLabel);
  if (job.type === 'CORRECTION') log('CORRECTION SCOPE', `${job.blockers.length} blocker(s)`);
  await store.appendEvent({
    type: 'DEVELOPER_JOB_RECEIVED', jobId: job.jobId, goal: job.goal, round: job.round,
    developerProfile: profile.name, model: profile.model, effort: profile.effort,
  });

  const isCorrection = job.type === 'CORRECTION';

  const context = isCorrection
    ? buildCorrectionContext({
      goal: job.goal,
      goalPath: job.goalPath,
      round: job.round,
      previousRound: job.round - 1,
      migrationAcceptedBaseline: job.migrationAcceptedBaseline,
      // Original baselines, unchanged across rounds.
      executionBase: job.executionBase,
      worktreeInitialHead: job.worktreeInitialHead,
      worktree: job.worktree,
      blockers: [...job.blockers],
      previousImplementationReport: job.previousImplementationReport ?? null,
      previousDecision: job.previousDecision ?? 'CHANGES_REQUIRED',
      changedFiles: job.changedFiles ?? [],
    })
    : buildDeveloperContext({
      goal: job.goal,
      goalPath: job.goalPath,
      round: job.round,
      type: job.type,
      migrationAcceptedBaseline: job.migrationAcceptedBaseline,
      executionBase: job.executionBase,
      worktree: job.worktree,
      blockers: [...job.blockers],
      previousImplementationReport: job.previousImplementationReport ?? null,
    });

  // Persist the running state BEFORE calling the model, so a crash mid-call
  // leaves the runtime saying what was actually happening.
  await store.writeRuntime({
    ...(await store.readRuntime()),
    state: isCorrection ? 'CORRECTION_RUNNING' : 'DEVELOPER_RUNNING',
    round: job.round,
    currentJobId: job.jobId,
  });

  // A fresh session id per job. This is the stateless invariant.
  const sessionId = randomUUID();
  currentJob.sessionId = sessionId;

  const executable = resolveClaudeExecutable();
  log(`${profile.name} STARTED`, `session ${sessionId.slice(0, 8)} · worktree ${job.worktree}`);
  log('IMPLEMENTING', `${job.goal} round ${job.round} — pode levar horas`);

  // Each retry gets a brand-new session id: the Developer is stateless, so a
  // capacity retry re-sends the same explicit context, never a resumed chat.
  const run = await runWithCapacity({
    store,
    role: ROLE,
    jobId: job.jobId,
    goal: job.goal,
    round: job.round,
    resumeFrom: isCorrection ? LOOP_STATES.CORRECTION_RUNNING : LOOP_STATES.DEVELOPER_RUNNING,
    onEvent: onCapacityEvent,
    invoke: async () => {
      const attemptSessionId = randomUUID();
      currentJob.sessionId = attemptSessionId;
      return invokeAgent({
        executable: executable.path,
        // From the profile on the job, not from a constant in this file.
        model: profile.model,
        effort: profile.effort,
        expectedFamily: profile.family,
        expectedRole: ROLE,
        // Purely observational: derived from events the CLI already emits.
        onTelemetryEvent: STREAM_EVENTS ? (event) => telemetry.emit(event) : null,
        telemetryRoot: job.worktree,
        prompt: isCorrection ? buildCorrectionPrompt(context, job) : buildPrompt(context, job),
        jsonSchema: developerResultSchemaFor({ jobId: job.jobId, goal: job.goal, round: job.round }),
        validatePayload: (payload) => validateDeveloperResult(payload, {
          jobId: job.jobId,
          goal: job.goal,
          round: job.round,
        }),
        cwd: job.worktree,
        sessionId: attemptSessionId,
        // Explicitly NOT persisted and NOT resumed. No fallback model, ever.
        persistSession: false,
        resume: false,
        // Real execution profile, scoped to the worktree.
        tools: DEVELOPER_TOOLS,
        permissionMode: 'auto',
        addDirs: [job.worktree],
        safeMode: false,
        timeoutMs: TIMEOUT_MS,
      }).then((agentOutcome) => {
        // Second, profile-aware proof that no substitution happened. invokeAgent
        // already refuses a wrong family; this makes the failure name the
        // profile that was promised, and keeps the guarantee true even if the
        // family check above is ever loosened.
        if (agentOutcome.resolvedPrimaryModel) {
          assertProfileWasHonoured({
            profile: profile.name,
            resolvedPrimaryModel: agentOutcome.resolvedPrimaryModel,
          });
        }
        return agentOutcome;
      });
    },
  });

  log(`${profile.name} COMPLETED`, run.outcome);
  telemetry.event('JOB', `${job.goal}/R${job.round} ${run.outcome}`);

  if (run.outcome === RUN_OUTCOMES.HUMAN_REQUIRED) {
    await store.appendEvent({
      type: 'DEVELOPER_JOB_FAILED', jobId: job.jobId, code: run.reason,
      developerProfile: profile.name, model: profile.model, effort: profile.effort,
    });
    currentJob = null;
    currentProfile = null;
    capacityWait = null;
    workerState = 'IDLE';
    return;
  }

  workerState = 'PUBLISHING';
  await store.appendEvent({
    type: 'DEVELOPER_RESULT_PUBLISHED',
    jobId: job.jobId,
    goal: job.goal,
    round: job.round,
    status: run.result?.status ?? 'UNKNOWN',
    // The profile that actually served this result, recorded next to it.
    developerProfile: profile.name,
    model: profile.model,
    effort: profile.effort,
    reused: run.outcome === RUN_OUTCOMES.ALREADY_COMPLETED,
  });

  log(`RESULT ${run.result?.status ?? 'UNKNOWN'}`);
  telemetry.clearContext();
  currentJob = null;
  currentProfile = null;
  capacityWait = null;
  workerState = 'IDLE';
}

async function main() {
  // Deliberately NOT "Model: Claude Opus 5". An idle Developer has no model:
  // it has a set of profiles it can execute, and the Tech Lead picks one per
  // Goal. Printing a fixed model here is what made the routing invisible.
  console.log(banner({
    title: 'DEVELOPER',
    supportedProfiles: SELECTABLE_DEVELOPER_PROFILES.map(describeProfile),
    sessionLine: 'Session strategy: STATELESS',
    extra: [`Log level: ${LOG_LEVEL}`],
  }));
  console.log('Waiting for implementation task...\n');

  workerState = 'IDLE';
  await runWorkerLoop({ store, role: ROLE, getStatus, handleJob });
}

main().catch((error) => {
  console.error(`Developer worker failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
