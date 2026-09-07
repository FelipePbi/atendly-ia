#!/usr/bin/env node
/**
 * IA Loop — resume.
 *
 *   npm run ia-loop:resume
 *
 * Picks up a run parked by a capacity limit, from disk alone. It resumes the
 * exact step that was blocked and never re-runs work that already produced a
 * result.
 *
 * It is not an override: a run in HUMAN_REQUIRED stays there.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { createJobStore } from './lib/job-store.mjs';
import { readRuntimeStrict, remainingWaitMs, validateWaitingRuntime } from './lib/capacity-state.mjs';
import { formatRemaining } from './lib/capacity-policy.mjs';
import { LOOP_STATES } from './lib/loop-state.mjs';
import { readWorkerHealth, WORKER_HEALTH } from './lib/worker-registry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '.state');

/**
 * Decides what resuming should do, from persisted state only.
 * Exported so the decision is unit-testable without touching disk twice.
 */
export function planResume(runtime, { now, workerHealth = {} }) {
  if (!runtime) {
    return { action: 'NOTHING_TO_RESUME', message: 'No run recorded yet.' };
  }

  if (runtime.state === LOOP_STATES.HUMAN_REQUIRED) {
    // Resume must never be a way to skip a human gate.
    return {
      action: 'BLOCKED_BY_HUMAN',
      message: `Run is HUMAN_REQUIRED (${runtime.humanRequired?.reason ?? 'unknown reason'}). Resume will not override it.`,
    };
  }

  if (runtime.state !== LOOP_STATES.WAITING_FOR_CAPACITY) {
    return {
      action: 'NOTHING_TO_RESUME',
      message: `Run is ${runtime.state}; nothing is parked waiting for capacity.`,
    };
  }

  validateWaitingRuntime(runtime);

  const remaining = remainingWaitMs(runtime, now);
  if (remaining > 0) {
    return {
      action: 'WAIT',
      remainingMs: remaining,
      message: `Still waiting for capacity: ${formatRemaining(remaining)} to go (${runtime.capacity.reason}).`,
      runtime,
    };
  }

  const health = workerHealth[runtime.blockedAgent];
  if (health && health.health === WORKER_HEALTH.OFFLINE) {
    return {
      action: 'WORKER_OFFLINE',
      message: `The ${runtime.blockedAgent} worker is not running. Start it, then resume.`,
      runtime,
    };
  }

  return {
    action: 'RESUME',
    resumeFrom: runtime.resumeFrom,
    jobId: runtime.blockedJobId,
    agent: runtime.blockedAgent,
    message: `Ready to resume ${runtime.goal}/R${runtime.round} at ${runtime.resumeFrom}.`,
    runtime,
  };
}

async function main() {
  const store = createJobStore(STATE_DIR);
  const runtime = await readRuntimeStrict(store);

  const [techLeadHealth, developerHealth] = await Promise.all([
    readWorkerHealth(store, 'tech_lead'),
    readWorkerHealth(store, 'developer'),
  ]);

  const plan = planResume(runtime, {
    now: Date.now(),
    workerHealth: { tech_lead: techLeadHealth, developer: developerHealth },
  });

  const out = ['', 'ATENDLY IA LOOP — RESUME', ''];

  if (plan.action === 'NOTHING_TO_RESUME') {
    out.push(plan.message);
    console.log(out.join('\n'));
    // Nothing to do is a normal outcome, not an error.
    return 0;
  }

  if (plan.action === 'BLOCKED_BY_HUMAN') {
    out.push(plan.message);
    out.push('');
    out.push('Resolve the underlying cause, then decide explicitly how to continue.');
    console.error(out.join('\n'));
    return 1;
  }

  out.push(`Goal: ${plan.runtime.goal}`);
  out.push(`Round: ${plan.runtime.round}`);
  out.push(`Blocked agent: ${plan.runtime.blockedAgent}`);
  out.push(`Reason: ${plan.runtime.capacity.reason}`);
  out.push(`Resume from: ${plan.runtime.resumeFrom}`);
  out.push('');

  if (plan.action === 'WAIT') {
    out.push(plan.message);
    out.push('');
    out.push('No model was called. The worker resumes on its own at the recorded deadline.');
    console.log(out.join('\n'));
    return 0;
  }

  if (plan.action === 'WORKER_OFFLINE') {
    out.push(plan.message);
    out.push('');
    out.push('  npm run ia-loop:tech-lead');
    out.push('  npm run ia-loop:developer');
    console.error(out.join('\n'));
    return 1;
  }

  // RESUME: the blocked job is still on disk with its status, so the worker
  // that owns it picks it up. If a result already exists, it is reused rather
  // than recomputed.
  const jobId = plan.jobId;
  const alreadyDone = jobId ? await store.hasCompletedResult(plan.agent, jobId) : false;

  if (alreadyDone) {
    out.push('A result for the blocked job already exists on disk.');
    out.push('The model will NOT be called again; the state machine advances from it.');
  } else {
    await store.setJobStatus(plan.agent, jobId, 'QUEUED');
    out.push(plan.message);
    out.push('Job re-queued for its worker. No duplicate job was created.');
  }

  await store.appendEvent({
    type: 'CAPACITY_RESUME_REQUESTED',
    goal: plan.runtime.goal,
    round: plan.runtime.round,
    agent: plan.agent,
    jobId,
    resumeFrom: plan.resumeFrom,
    alreadyCompleted: alreadyDone,
  });

  console.log(out.join('\n'));
  return 0;
}

// Only run when invoked directly, so planResume can be imported by tests.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
      console.error(`ATENDLY IA LOOP — RESUME\n\nBlocker: [${code}] ${error.message}`);
      process.exitCode = 1;
    });
}
