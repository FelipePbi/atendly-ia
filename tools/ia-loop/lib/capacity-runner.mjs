/**
 * IA Loop — running one inference under capacity control.
 *
 * Wraps a single agent call so that a model limit parks the run instead of
 * ending it. The same model always resumes: there is no fallback path here, by
 * design and by test.
 *
 * The loop is: check for an existing result (idempotency) → call → on failure,
 * classify → decide → either persist a wait and sleep to the deadline, or
 * escalate to a human.
 */

import { SpikeError } from './claude-process.mjs';
import { CAPACITY_CONFIG } from './capacity-config.mjs';
import { classifyFailure } from './capacity-classifier.mjs';
import { CAPACITY_ACTIONS, decideCapacityAction, formatRemaining } from './capacity-policy.mjs';
import {
  clearCapacityWait,
  persistCapacityWait,
  persistHumanRequired,
  remainingWaitMs,
} from './capacity-state.mjs';
import { systemClock } from './clock.mjs';

export const RUN_OUTCOMES = Object.freeze({
  COMPLETED: 'COMPLETED',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
  ALREADY_COMPLETED: 'ALREADY_COMPLETED',
});

/**
 * Executes one agent call, waiting out capacity limits.
 *
 * `invoke()` performs the actual inference and returns an invokeAgent-shaped
 * outcome. It is injected so tests can exercise every policy branch without
 * spending quota.
 *
 * `onEvent` receives sanitized progress notifications for the terminal.
 */
export async function runWithCapacity({
  store,
  role,
  jobId,
  goal,
  round,
  resumeFrom,
  invoke,
  clock = systemClock(),
  config = CAPACITY_CONFIG,
  onEvent = () => {},
  maxWaits = Infinity,
}) {
  if (!store) throw new SpikeError('INVALID_ARGS', 'store is required');
  if (!jobId) throw new SpikeError('INVALID_ARGS', 'jobId is required');
  if (typeof invoke !== 'function') throw new SpikeError('INVALID_ARGS', 'invoke must be a function');

  // Idempotency, checked BEFORE anything else: if a previous attempt already
  // produced a result for this job, the model must not be called again.
  if (await store.hasCompletedResult(role, jobId)) {
    const existing = await store.readResult(role, jobId);
    onEvent({ type: 'ALREADY_COMPLETED', jobId });
    return { outcome: RUN_OUTCOMES.ALREADY_COMPLETED, result: existing?.result ?? null, attempts: 0 };
  }

  let attempt = 0;
  let waits = 0;

  for (;;) {
    // Honour a deadline persisted by an earlier process: a restart must not
    // retry sooner than the state says.
    const runtime = await store.readRuntime();
    if (runtime?.blockedJobId === jobId) {
      const remaining = remainingWaitMs(runtime, clock.now());
      if (remaining > 0) {
        onEvent({
          type: 'CAPACITY_WAIT_RESUMED_FROM_DISK',
          jobId,
          reason: runtime.capacity?.reason,
          remaining: formatRemaining(remaining),
        });
        await clock.sleep(remaining);
      }
    }

    attempt += 1;
    await store.setJobStatus(role, jobId, 'RUNNING');

    const agentOutcome = await invoke({ attempt });

    const failed = Boolean(agentOutcome?.error) || !agentOutcome?.structuredOutput;
    if (!failed) {
      await store.publishResult(role, jobId, { ok: true, result: agentOutcome.payload });
      await store.setJobStatus(role, jobId, 'COMPLETED');

      if (waits > 0) {
        await store.appendEvent({ type: 'CAPACITY_AVAILABLE', goal, round, agent: role, jobId, attempt });
        await store.appendEvent({ type: 'CAPACITY_WAIT_ENDED', goal, round, agent: role, jobId, attempt });
        onEvent({ type: 'CAPACITY_AVAILABLE', jobId, attempt });
      }
      await clearCapacityWait(store, { state: resumeFrom, now: clock.now() });
      return { outcome: RUN_OUTCOMES.COMPLETED, result: agentOutcome.payload, attempts: attempt };
    }

    const classification = classifyFailure(agentOutcome);
    const decision = decideCapacityAction({
      reason: classification.reason,
      attempt,
      retryAfterMs: classification.retryAfterMs,
      now: clock.now(),
      config,
    });

    await store.appendEvent({
      type: 'CAPACITY_LIMIT_REACHED',
      goal,
      round,
      agent: role,
      jobId,
      reason: decision.reason,
      attempt,
      // Sanitized and truncated by the classifier; never the full response.
      diagnostic: classification.diagnostic,
    });

    if (decision.action === CAPACITY_ACTIONS.HUMAN_REQUIRED) {
      await store.setJobStatus(role, jobId, 'FAILED');
      await persistHumanRequired(store, {
        blockedAgent: role,
        reason: decision.reason,
        note: decision.note,
        jobId,
        now: clock.now(),
      });
      await store.publishResult(role, jobId, {
        ok: false,
        code: decision.reason,
        message: decision.note ?? 'Escalated to a human.',
        escalation: 'HUMAN_REQUIRED',
      });
      await store.appendEvent({ type: 'HUMAN_REQUIRED', goal, round, agent: role, jobId, reason: decision.reason });
      onEvent({ type: 'HUMAN_REQUIRED', jobId, reason: decision.reason, note: decision.note });

      return { outcome: RUN_OUTCOMES.HUMAN_REQUIRED, reason: decision.reason, note: decision.note, attempts: attempt };
    }

    // WAIT: persist first, then sleep. If the process dies during the sleep,
    // the deadline is already on disk and the restart honours it.
    await store.setJobStatus(role, jobId, 'WAITING_FOR_CAPACITY');
    await persistCapacityWait(store, {
      goal,
      round,
      blockedAgent: role,
      resumeFrom,
      jobId,
      decision,
      now: clock.now(),
    });

    if (waits === 0) {
      await store.appendEvent({ type: 'CAPACITY_WAIT_STARTED', goal, round, agent: role, jobId, reason: decision.reason });
    }
    waits += 1;

    onEvent({
      type: 'CAPACITY_WAIT',
      jobId,
      reason: decision.reason,
      attempt,
      nextRetryAt: decision.nextRetryAt,
      remaining: formatRemaining(decision.retryIntervalMs),
      resumeFrom,
    });

    if (waits > maxWaits) {
      // Test/diagnostic escape hatch only; production runs pass Infinity.
      throw new SpikeError('CAPACITY_WAIT_LIMIT', `Exceeded ${maxWaits} capacity waits for job ${jobId}`);
    }

    await store.appendEvent({ type: 'CAPACITY_RETRY', goal, round, agent: role, jobId, attempt, nextRetryAt: decision.nextRetryAt });
    await clock.sleep(decision.retryIntervalMs);
  }
}
