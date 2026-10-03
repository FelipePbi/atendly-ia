#!/usr/bin/env node
/**
 * IA Loop — request a graceful pause.
 *
 *   npm run ia-loop:pause
 *   npm run ia-loop:pause -- --after-goal
 *   npm run ia-loop:pause -- --wait [--timeout 6h] [--poll 10s]
 *
 * This never kills anything. It records a request; the loop stops at the next
 * safe boundary, and an inference already running is allowed to finish. Killing
 * a child mid-write is exactly what the leases exist to prevent.
 *
 * `--wait` exists for the operator who wants to commit to the main checkout.
 * Without it the request returns at once and "is it safe yet?" is left to
 * guesswork — which is how a commit landed beside a Tech Lead job that was
 * still running and killed the round as MAIN_CHECKOUT_MUTATED. With it, this
 * command blocks until the run is PAUSED, the orchestrator has exited, and no
 * job or worktree lease of any role is held, then says so in one line. On
 * timeout it exits non-zero and lists what is still holding the window shut.
 *
 * The paused run is resumed with `npm run ia-loop:auto`, which attaches to it
 * and clears the pause. `ia-loop:resume` is for capacity waits, not pauses.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { createAutonomousStore } from './lib/autonomous-state.mjs';
import { createJobStore } from './lib/job-store.mjs';
import { isDirectExecution } from './lib/direct-execution.mjs';
import { parseDuration, readSafeWindowFacts, waitForSafeWindow } from './lib/pause-safety.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '.state');

/**
 * Six hours: longer than any round seen so far (a DEEP review plus the heavy
 * gates), short enough that a wait forgotten in a terminal does end.
 */
export const DEFAULT_WAIT_TIMEOUT_MS = 6 * 3_600_000;
export const DEFAULT_WAIT_POLL_MS = 10_000;

/** Exit code when `--wait` gives up. Distinct from 1, which is "pause failed". */
export const EXIT_WAIT_TIMED_OUT = 2;

/**
 * Pure argument parsing, so the flags can be tested without a process.
 * A bad value is an error, never a silent default: an operator who typed
 * `--timeout 2hours` must not get six hours instead.
 */
export function parsePauseArgs(argv) {
  const options = {
    afterGoal: false,
    wait: false,
    timeoutMs: DEFAULT_WAIT_TIMEOUT_MS,
    pollMs: DEFAULT_WAIT_POLL_MS,
  };

  const valueOf = (i, flag) => {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new SpikeError('INVALID_ARGUMENT', `${flag} needs a value (for example ${flag} 90m)`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--after-goal') options.afterGoal = true;
    else if (arg === '--wait') options.wait = true;
    else if (arg === '--timeout') {
      const ms = parseDuration(valueOf(i, arg));
      if (!ms) throw new SpikeError('INVALID_ARGUMENT', `--timeout must be like 90m, 2h or 300s; got "${argv[i + 1]}"`);
      options.timeoutMs = ms;
      i += 1;
    } else if (arg === '--poll') {
      // Seconds by default here: nobody polls in minutes.
      const raw = valueOf(i, arg);
      const ms = parseDuration(/^\s*\d+(\.\d+)?\s*$/.test(raw) ? `${raw}s` : raw);
      if (!ms) throw new SpikeError('INVALID_ARGUMENT', `--poll must be like 10s or 1m; got "${raw}"`);
      options.pollMs = ms;
      i += 1;
    } else {
      throw new SpikeError('INVALID_ARGUMENT', `Unknown option: ${arg}`);
    }
  }

  if ((argv.includes('--timeout') || argv.includes('--poll')) && !options.wait) {
    throw new SpikeError('INVALID_ARGUMENT', '--timeout and --poll only apply with --wait');
  }
  return options;
}

function formatDuration(ms) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 120) return `${minutes}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

function printBlockers(blockers, log) {
  for (const blocker of blockers) log(`  - [${blocker.code}] ${blocker.detail}`);
}

/**
 * Waits for the safe window and reports it. Exported with its collaborators
 * injectable so the operator-facing output and exit codes are testable.
 */
export async function waitAndReport({
  read,
  timeoutMs,
  pollMs,
  log = console.log,
  now,
  sleep,
  resumeHint = 'npm run ia-loop:auto',
}) {
  log('');
  log(`Waiting for a safe window (timeout ${formatDuration(timeoutMs)}, checking every ${formatDuration(pollMs)})...`);

  const startedAt = (now ?? Date.now)();
  const outcome = await waitForSafeWindow({
    read,
    timeoutMs,
    pollMs,
    ...(now ? { now } : {}),
    ...(sleep ? { sleep } : {}),
    onProgress: (judgement) => {
      if (judgement.safe) return;
      const at = formatDuration((now ?? Date.now)() - startedAt);
      log(`[+${at}] still waiting on ${judgement.blockers.length} item(s):`);
      printBlockers(judgement.blockers, log);
    },
  });

  log('');
  if (outcome.safe) {
    log('SAFE TO CHANGE THE MAIN CHECKOUT: no run is RUNNING, no orchestrator holds the loop,');
    log('no job or worktree lease is held and no worker is busy.');
    log('');
    log(`Resume with:  ${resumeHint}`);
    return 0;
  }

  log(`NOT SAFE — gave up after ${formatDuration(outcome.waitedMs)}. Still holding the window shut:`);
  printBlockers(outcome.blockers, log);
  log('');
  log('Do not change the main checkout yet. Check with:  npm run ia-loop:status');
  return EXIT_WAIT_TIMED_OUT;
}

async function main() {
  const options = parsePauseArgs(process.argv.slice(2));
  const auto = createAutonomousStore(STATE_DIR);
  const store = createJobStore(STATE_DIR);
  const read = () => readSafeWindowFacts(STATE_DIR);

  console.log('');
  console.log('ATENDLY IA LOOP — PAUSE');

  const run = await auto.read();
  if (!run) {
    console.log('');
    console.log('There is no autonomous run to pause.');
    // A worker can still be holding a job on its own (a supervised round, a
    // manual dispatch), so the wait is still meaningful without a run.
    if (!options.wait) return 0;
    return waitAndReport({
      read, timeoutMs: options.timeoutMs, pollMs: options.pollMs,
      resumeHint: 'npm run ia-loop:auto -- --from <goal>',
    });
  }

  console.log('');
  console.log(`Run: ${run.autonomousRunId}`);

  // Recorded whatever the run's status, as it always was: on a run stopped
  // for a human the request is not moot — it travels to the run that
  // replaces it (see tests/pause-inheritance.test.mjs).
  await auto.requestPause({ afterGoal: options.afterGoal });
  await store.appendEvent({
    type: 'AUTONOMOUS_RUN_PAUSE_REQUESTED',
    autonomousRunId: run.autonomousRunId,
    afterGoal: options.afterGoal,
    wait: options.wait,
  });
  console.log(`Run status: ${run.status}`);
  console.log(`Pause requested: YES${options.afterGoal ? ' (after the current Goal finishes)' : ''}`);
  console.log('');
  console.log('Nothing was killed. Any inference in flight finishes, and the loop stops');
  console.log(options.afterGoal
    ? 'once the current Goal is fully closed.'
    : 'at the next safe boundary.');

  // A run stopped for a human is not resumed by attaching to it: run-auto
  // refuses until the operator says what was resolved.
  const resumeHint = run.status === 'PAUSED_FOR_HUMAN'
    ? `npm run ia-loop:auto -- --from ${run.currentGoal ?? '<goal>'} --resolved "<what was resolved>"`
    : 'npm run ia-loop:auto';

  if (options.wait) {
    return waitAndReport({ read, timeoutMs: options.timeoutMs, pollMs: options.pollMs, resumeHint });
  }

  console.log('');
  console.log('Check with:  npm run ia-loop:status');
  console.log('To wait until the main checkout is safe to change:  npm run ia-loop:pause -- --wait');
  console.log(`Resume a paused run with:  ${resumeHint}`);
  return 0;
}

// Only when this file IS the program. Importing it — from a test, a doc
// generator, or an agent reading the tooling — must never start anything.
if (isDirectExecution(import.meta.url)) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
      console.error(`\nATENDLY IA LOOP — PAUSE\n\nBlocker: [${code}] ${error.message}`);
      process.exitCode = 1;
    });
}
