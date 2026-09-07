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
const TIMEOUT_MS = Number(process.env.IA_LOOP_TIMEOUT_MS ?? 900_000);

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

function buildPrompt(context) {
  return [
    'Você está atuando como Developer em um pipeline automatizado do Atendly.',
    '',
    'Contexto explícito desta tarefa (não há conversa anterior):',
    JSON.stringify(context, null, 2),
    '',
    'Leia os arquivos indicados em mustRead e consulte seletivamente o que estiver em consultSelectively.',
    'Siga as regras do CLAUDE.md e do AGENTS.md do projeto.',
    '',
    'Retorne exclusivamente o JSON do contrato DeveloperResult.',
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
  log('OPUS STARTED', `session ${sessionId.slice(0, 8)}`);

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
        prompt: buildPrompt(context),
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
