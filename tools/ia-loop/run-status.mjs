#!/usr/bin/env node
/**
 * IA Loop — status.
 *
 *   npm run ia-loop:status
 *
 * Reads only what is on disk. Calls no model, publishes nothing and changes
 * nothing, so it is safe to run at any time, including mid-wait.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { createJobStore } from './lib/job-store.mjs';
import { readWorkerHealth } from './lib/worker-registry.mjs';
import { readRuntimeStrict, remainingWaitMs } from './lib/capacity-state.mjs';
import { formatRemaining } from './lib/capacity-policy.mjs';
import { LOOP_STATES } from './lib/loop-state.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '.state');

const TECH_LEAD_MODEL = process.env.IA_LOOP_TECH_LEAD_MODEL ?? 'claude-fable-5-1';
const DEVELOPER_MODEL = process.env.IA_LOOP_DEVELOPER_MODEL ?? 'claude-opus-5';

function shortSha(sha) {
  return typeof sha === 'string' && sha.length >= 8 ? `${sha.slice(0, 8)}…` : (sha ?? 'n/a');
}

function agentBlock({ label, model, health, runtime, now }) {
  const lines = [`${label}:`, `  Model: ${model}`];
  const isBlocked = runtime?.blockedAgent === health.role;

  // A stale heartbeat file must not make a dead worker look IDLE: liveness
  // wins over the last state it managed to write.
  const state = health.health === 'OFFLINE' ? 'OFFLINE' : (health.state ?? 'UNKNOWN');
  lines.push(`  State: ${state}`);

  if (isBlocked && runtime?.capacity) {
    lines.push(`  Reason: ${runtime.capacity.reason}`);
    lines.push(`  Retry in: ${formatRemaining(remainingWaitMs(runtime, now))}`);
    lines.push(`  Attempt: ${runtime.capacity.attempt}`);
  } else if (runtime?.blockedAgent && !isBlocked) {
    // Limits are per agent: the other one is simply idle, not limited.
    lines.push(`  Reason: waiting for ${runtime.blockedAgent === 'tech_lead' ? 'Tech Lead' : 'Developer'}`);
  }

  if (health.health !== 'RUNNING' && health.health !== 'OFFLINE') {
    lines.push(`  Health: ${health.health}`);
  }
  return lines.join('\n');
}

async function main() {
  const store = createJobStore(STATE_DIR);

  const runtime = await readRuntimeStrict(store);
  const goal = await store.readCurrentGoal();
  const [techLeadHealth, developerHealth] = await Promise.all([
    readWorkerHealth(store, 'tech_lead'),
    readWorkerHealth(store, 'developer'),
  ]);
  const now = Date.now();

  const out = ['', 'ATENDLY IA LOOP', ''];

  if (!runtime && !goal) {
    out.push('No run recorded yet.');
    out.push('');
    out.push('Start with:');
    out.push('  npm run ia-loop:goal -- 003 --dry-run');
    console.log(out.join('\n'));
    return 0;
  }

  out.push(`Goal: ${goal?.goalId ?? runtime?.goal ?? 'n/a'}`);
  out.push(`Round: ${runtime?.round ?? 'n/a'}`);
  out.push(`State: ${runtime?.state ?? 'n/a'}`);
  if (runtime?.mode) out.push(`Mode: ${runtime.mode}`);
  out.push('');

  out.push(agentBlock({ label: 'Developer', model: DEVELOPER_MODEL, health: developerHealth, runtime, now }));
  out.push('');
  out.push(agentBlock({ label: 'Tech Lead', model: TECH_LEAD_MODEL, health: techLeadHealth, runtime, now }));
  out.push('');

  if (runtime?.state === LOOP_STATES.WAITING_FOR_CAPACITY) {
    out.push(`Resume from: ${runtime.resumeFrom}`);
    out.push(`Blocked job: ${runtime.blockedJobId ?? 'n/a'}`);
    out.push('');
  }

  if (runtime?.state === LOOP_STATES.HUMAN_REQUIRED && runtime.humanRequired) {
    out.push(`Human required: ${runtime.humanRequired.reason}`);
    if (runtime.humanRequired.note) out.push(`  ${runtime.humanRequired.note}`);
    out.push('');
  }

  out.push('Last accepted baseline:');
  out.push(`${shortSha(goal?.migrationAcceptedBaseline ?? runtime?.migrationAcceptedBaseline)}`);
  out.push('');

  // The whole point of capacity handling: a limit never costs completed work.
  out.push(runtime?.state === LOOP_STATES.HUMAN_REQUIRED ? 'Awaiting human.' : 'No work lost.');

  console.log(out.join('\n'));
  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
    console.error(`ATENDLY IA LOOP\n\nCannot read state: [${code}] ${error.message}`);
    process.exitCode = 1;
  });
