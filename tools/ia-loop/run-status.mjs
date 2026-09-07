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
import { LEASE_STATUS, classifyLease, createLeaseStore } from './lib/leases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '.state');

const TECH_LEAD_MODEL = process.env.IA_LOOP_TECH_LEAD_MODEL ?? 'claude-fable-5-1';
const DEVELOPER_MODEL = process.env.IA_LOOP_DEVELOPER_MODEL ?? 'claude-opus-5';

function duration(fromIso, now) {
  const started = Date.parse(fromIso);
  if (Number.isNaN(started)) return 'unknown';
  const s = Math.max(0, Math.round((now - started) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

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
  const leaseStore = createLeaseStore(STATE_DIR);

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

  // An execution in flight is the most important thing on this screen: it is
  // what tells the operator whether work is still owned by a live attempt.
  const leases = (await leaseStore.listJobLeases()).filter(Boolean);
  if (leases.length > 0) {
    out.push('Active job:');
    for (const lease of leases) {
      const { status, ageMs } = classifyLease(lease, { now });
      out.push(`  Job: ${lease.jobId}`);
      out.push(`  Attempt: ${lease.attemptId}`);
      out.push(`  Worker: ${lease.agent ?? '?'} ${String(lease.workerInstanceId ?? '').slice(0, 12)}`);
      if (lease.worktree) out.push(`  Worktree: ${lease.worktree}`);
      out.push(`  Lease: ${status}`);
      out.push(`  Heartbeat age: ${Math.round((ageMs ?? 0) / 1000)}s`);
      out.push(`  Started: ${lease.acquiredAt}`);
      out.push(`  Duration: ${duration(lease.acquiredAt, now)}`);
    }
    out.push('');
  }

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
  // The runtime is the live record; current-goal is a snapshot from when the
  // run started and can lag behind a closure that already updated the baseline.
  out.push(`${shortSha(runtime?.migrationAcceptedBaseline ?? goal?.migrationAcceptedBaseline)}`);
  out.push('');

  // "No work lost" is a claim, so it is only made when the state actually
  // supports it. An in-flight or ambiguous execution says so instead.
  const activeLease = leases.find((l) => classifyLease(l, { now }).status === LEASE_STATUS.ACTIVE);
  const suspectLease = leases.find((l) => classifyLease(l, { now }).status === LEASE_STATUS.SUSPECTED_ORPHAN);
  const observerRunning = [techLeadHealth, developerHealth].some((h) => h.health === 'RUNNING');

  if (runtime?.state === LOOP_STATES.HUMAN_REQUIRED) {
    out.push('Awaiting human.');
  } else if (suspectLease) {
    out.push('ORCHESTRATOR/OBSERVER: unknown');
    out.push(`JOB: ${suspectLease.jobId} — lease SUSPECTED_ORPHAN`);
    out.push('WORKER: not confirmably alive');
    out.push('');
    out.push('State is AMBIGUOUS: an attempt may still be writing. Do not start a new one.');
  } else if (activeLease) {
    out.push(`ORCHESTRATOR/OBSERVER: ${observerRunning ? 'attached' : 'OFFLINE'}`);
    out.push(`JOB: RUNNING (${activeLease.jobId}, attempt ${activeLease.attemptId})`);
    out.push('WORKER: HEALTHY');
    if (!observerRunning) {
      out.push('');
      out.push('The observer is gone but the work continues. Re-attach with: npm run ia-loop:resume');
    }
  } else {
    out.push('No work lost.');
  }

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
