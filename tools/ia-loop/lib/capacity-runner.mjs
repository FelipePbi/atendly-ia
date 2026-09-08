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
import { eventTypeFor, producesCapacityEvent } from './failure-taxonomy.mjs';
import { RETRYABLE_JOB_STATUSES } from './job-store.mjs';
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
  let capacityWaits = 0;
  // What ended the previous attempt, carried into the successor's history.
  let pendingRetry = null;

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

    // Every real call to the model is its own attempt.
    //
    // Before this, a capacity retry re-entered the SAME attempt: one attemptId
    // covered a call that hit a quota wall and a later call that did the work,
    // so result fencing could not tell them apart and the history showed one
    // try where there had been two. The stage and the job stay exactly as they
    // were — what a retry creates is a successor attempt, nothing else.
    const before = await store.readAttemptState(role, jobId);
    if (before && RETRYABLE_JOB_STATUSES.includes(before.attemptStatus)) {
      const started = await store.startNextAttempt(role, jobId, {
        reason: pendingRetry?.reason ?? before.attemptStatus,
        detail: pendingRetry?.detail ?? null,
      });
      if (started.created) {
        await store.appendEvent({
          type: 'JOB_ATTEMPT_STARTED',
          goal, round, agent: role, jobId,
          attempt: started.attempt,
          attemptId: started.attemptId,
          previousAttemptId: started.previousAttemptId,
          reason: pendingRetry?.reason ?? before.attemptStatus,
        });
      }
    }
    pendingRetry = null;

    await store.setJobStatus(role, jobId, 'RUNNING');

    // Read AFTER the attempt has been materialised and the job marked RUNNING,
    // so it is the attempt this invocation actually belongs to. Every result
    // published below is fenced by it.
    const currentAttemptId = (await store.readAttemptState(role, jobId))?.attemptId ?? null;

    const agentOutcome = await invoke({ attempt });

    const failed = Boolean(agentOutcome?.error) || !agentOutcome?.structuredOutput;
    if (!failed) {
      await store.publishResult(role, jobId, { ok: true, result: agentOutcome.payload }, {
        attemptId: currentAttemptId,
      });
      await store.setJobStatus(role, jobId, 'COMPLETED');

      // Only a genuine capacity wait ends with a capacity event. A retry after
      // an unexplained transient failure is not the quota coming back.
      if (capacityWaits > 0) {
        await store.appendEvent({ type: 'CAPACITY_AVAILABLE', goal, round, agent: role, jobId, attempt });
        await store.appendEvent({ type: 'CAPACITY_WAIT_ENDED', goal, round, agent: role, jobId, attempt });
        onEvent({ type: 'CAPACITY_AVAILABLE', jobId, attempt });
      } else if (waits > 0) {
        await store.appendEvent({ type: 'AGENT_RETRY_SUCCEEDED', goal, round, agent: role, jobId, attempt });
        onEvent({ type: 'AGENT_RETRY_SUCCEEDED', jobId, attempt });
      }
      await clearCapacityWait(store, { state: resumeFrom, now: clock.now() });
      return { outcome: RUN_OUTCOMES.COMPLETED, result: agentOutcome.payload, attempts: attempt };
    }

    const classification = classifyFailure(agentOutcome, { now: clock.now() });
    const decision = decideCapacityAction({
      reason: classification.reason,
      attempt,
      retryAfterMs: classification.retryAfterMs,
      now: clock.now(),
      config,
    });

    // The event is named by the taxonomy, not by a local ternary.
    //
    // The ternary this replaces knew only "harness or capacity", so every other
    // family — an unexplained fatal, a contract slip — was logged as
    // CAPACITY_LIMIT_REACHED. The real history carries four of those, each one
    // a claim that a model limit was hit when none was. failure-taxonomy exists
    // precisely to stop that, and now it is the thing that decides.
    const isCapacity = producesCapacityEvent({ code: classification.code, reason: decision.reason });
    await store.appendEvent({
      type: eventTypeFor({ code: classification.code, reason: decision.reason }),
      goal,
      round,
      agent: role,
      jobId,
      attemptId: currentAttemptId,
      reason: decision.reason,
      code: classification.code,
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

      // The CLI may have already answered correctly: model-identity
      // verification failing is not evidence the payload itself was bad. When
      // invokeAgent kept a structurally-valid candidate, preserve it
      // alongside the FAILED result — an audit trail a harness fix can read
      // back later, never something published as trusted on its own.
      if (agentOutcome?.candidatePayload) {
        await store.publishCandidateResult(role, jobId, {
          requestedModel: agentOutcome.requestedModel ?? null,
          modelVerificationError: agentOutcome.error ?? null,
          observedModels: agentOutcome.observedModels ?? [],
          payload: agentOutcome.candidatePayload,
        }, { attemptId: currentAttemptId });
      }

      await store.publishResult(role, jobId, {
        ok: false,
        code: decision.reason,
        message: decision.note ?? 'Escalated to a human.',
        escalation: 'HUMAN_REQUIRED',
      }, { attemptId: currentAttemptId });
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

    if (isCapacity) {
      if (capacityWaits === 0) {
        await store.appendEvent({ type: 'CAPACITY_WAIT_STARTED', goal, round, agent: role, jobId, reason: decision.reason });
      }
      capacityWaits += 1;
    }
    waits += 1;

    // Handed to the successor attempt so its history says why it exists.
    pendingRetry = {
      reason: decision.reason,
      detail: {
        classification: classification.reason,
        code: classification.code,
        retryReason: decision.reason,
        nextRetryAt: decision.nextRetryAt,
        capacityWait: isCapacity,
        role,
      },
    };

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

    await store.appendEvent({
      type: isCapacity ? 'CAPACITY_RETRY' : 'AGENT_RETRY',
      goal, round, agent: role, jobId, attempt, reason: decision.reason, nextRetryAt: decision.nextRetryAt,
    });
    await clock.sleep(decision.retryIntervalMs);
  }
}
