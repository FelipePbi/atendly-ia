#!/usr/bin/env node
/**
 * IA Loop — Developer worker (Claude Opus 5).
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
import { runWithCapacity, RUN_OUTCOMES } from '../lib/capacity-runner.mjs';
import { LOOP_STATES } from '../lib/loop-state.mjs';
import { DEVELOPER_RESULT_SCHEMA, validateDeveloperJob, validateDeveloperResult } from '../lib/contracts-v2.mjs';
import { buildDeveloperContext } from '../lib/context-builders.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '..', '.state');

const ROLE = 'developer';
const MODEL = process.env.IA_LOOP_DEVELOPER_MODEL ?? 'claude-opus-5';
// A real Goal is hours of work, not minutes.
const TIMEOUT_MS = Number(process.env.IA_LOOP_DEVELOPER_TIMEOUT_MS ?? 4 * 60 * 60 * 1000);

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

let workerState = 'STARTING';
let currentJob = null;
// Kept so the heartbeat keeps reporting a live, waiting worker rather than
// looking stalled while a model limit is being waited out.
let capacityWait = null;

const getStatus = () => ({
  state: workerState,
  model: MODEL,
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
  currentJob = { goal: job.goal, round: job.round, sessionId: null };
  workerState = 'WORKING';

  log(`JOB ${job.goal}/R${job.round} RECEIVED`, `type ${job.type}`);
  await store.appendEvent({ type: 'DEVELOPER_JOB_RECEIVED', jobId: job.jobId, goal: job.goal, round: job.round });

  const context = buildDeveloperContext({
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

  // A fresh session id per job. This is the stateless invariant.
  const sessionId = randomUUID();
  currentJob.sessionId = sessionId;

  const executable = resolveClaudeExecutable();
  log('OPUS STARTED', `session ${sessionId.slice(0, 8)} · worktree ${job.worktree}`);
  log('IMPLEMENTING', `${job.goal} round ${job.round} — pode levar horas`);

  // Each retry gets a brand-new session id: the Developer is stateless, so a
  // capacity retry re-sends the same explicit context, never a resumed chat.
  const run = await runWithCapacity({
    store,
    role: ROLE,
    jobId: job.jobId,
    goal: job.goal,
    round: job.round,
    resumeFrom: LOOP_STATES.DEVELOPER_RUNNING,
    onEvent: onCapacityEvent,
    invoke: async () => {
      const attemptSessionId = randomUUID();
      currentJob.sessionId = attemptSessionId;
      return invokeAgent({
        executable: executable.path,
        model: MODEL,
        expectedFamily: 'opus',
        expectedRole: ROLE,
        prompt: buildPrompt(context, job),
        jsonSchema: DEVELOPER_RESULT_SCHEMA,
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
      });
    },
  });

  log('OPUS COMPLETED', run.outcome);

  if (run.outcome === RUN_OUTCOMES.HUMAN_REQUIRED) {
    await store.appendEvent({ type: 'DEVELOPER_JOB_FAILED', jobId: job.jobId, code: run.reason });
    currentJob = null;
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
    reused: run.outcome === RUN_OUTCOMES.ALREADY_COMPLETED,
  });

  log(`RESULT ${run.result?.status ?? 'UNKNOWN'}`);
  currentJob = null;
  capacityWait = null;
  workerState = 'IDLE';
}

async function main() {
  console.log(banner({
    title: 'DEVELOPER',
    model: `Claude Opus 5 (${MODEL})`,
    sessionLine: 'Session strategy: STATELESS',
    extra: [],
  }));
  console.log('Waiting for implementation task...\n');

  workerState = 'IDLE';
  await runWorkerLoop({ store, role: ROLE, getStatus, handleJob });
}

main().catch((error) => {
  console.error(`Developer worker failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
