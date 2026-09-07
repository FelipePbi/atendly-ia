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
import { REVIEW_DECISION_SCHEMA, validateReviewJob, validateReviewDecision } from '../lib/contracts-v2.mjs';
import { buildTechLeadContext } from '../lib/context-builders.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '..', '.state');
const REGISTRY_PATH = join(STATE_DIR, 'sessions.json');
const SESSION_CWD = join(STATE_DIR, 'workdirs', 'tech-lead');

const ROLE = 'tech_lead';
const MODEL = process.env.IA_LOOP_TECH_LEAD_MODEL ?? 'claude-fable-5-1';
const TIMEOUT_MS = Number(process.env.IA_LOOP_TIMEOUT_MS ?? 900_000);

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

  log('FABLE STARTED', `session ${session.sessionId.slice(0, 8)}`);

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
        prompt: buildPrompt(context),
        jsonSchema: REVIEW_DECISION_SCHEMA,
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
