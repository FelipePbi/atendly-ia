/**
 * IA Loop — routing, joined to the job store.
 *
 * `model-routing.mjs` is pure policy and knows nothing about disk. This is the
 * thin layer that gives that policy the two things it needs from the store —
 * what the job was routed to, and what already happened to this job — and hands
 * the capacity runner the two hooks it asks for.
 *
 * Everything it answers is derived from PERSISTED state, never from a variable
 * this process happens to hold. That is what makes a restart continue instead
 * of re-deciding: the same job file and the same attempt history produce the
 * same model, in this process or the next one.
 */

import {
  ESCALATION_VERDICTS,
  authorizeDeveloperEscalation,
  authorizeReviewEscalation,
  planCapacityFallback,
  resolveRoutingForAttempt,
  resolveRoutingMode,
  toRoutedRecord,
} from './model-routing.mjs';
import { readJson } from './job-store.mjs';

/**
 * The router a worker hands to `runWithCapacity`.
 *
 * `base` is the decision the job carries. `kind` says which escalation policy
 * applies — a Developer asking for a stronger executor and a reviewer asking
 * for a stronger reviewer are judged by different rules.
 */
export function createAttemptRouter({
  store,
  role,
  jobId,
  base,
  kind = 'developer',
  mode = resolveRoutingMode(),
  goal = null,
  round = null,
}) {
  async function history() {
    const envelope = await readJson(store.paths.job(role, jobId));
    return envelope?.attemptHistory ?? [];
  }

  /** What this attempt runs on, replayed from the job and its history. */
  async function current() {
    if (!base) return { routing: null, fellBack: false, escalated: false };
    return resolveRoutingForAttempt({ base, attemptHistory: await history() });
  }

  async function refuse({ verdict, reason, request, attempt }) {
    await store.appendEvent({
      type: 'MODEL_ESCALATION_REFUSED',
      goal, round, agent: role, jobId, attempt,
      verdict,
      requested: request?.reason ?? null,
      reason,
    });
  }

  return {
    current,

    /** Availability only. The router refuses anything else, loudly and on record. */
    async fallbackFor({ reason, attempt }) {
      const { routing, fellBack } = await current();
      if (!routing) return null;

      const decision = planCapacityFallback({
        current: routing, reason, alreadyFellBack: fellBack, mode,
      });
      if (!decision) return null;

      return { decision, routed: toRoutedRecord(decision), from: routing.modelKey };
    },

    /**
     * A structurally valid answer that asked for a stronger model.
     *
     * The request is READ from the contract — never from prose — and granted
     * only by the policy. A refusal is recorded too: "the Developer asked and
     * the router said no" is exactly the kind of thing that must not be
     * invisible later.
     */
    async escalationFor({ result, attempt }) {
      const request = kind === 'review' ? result?.escalationRequest : result?.escalation;
      const wantsEscalation = kind === 'review'
        ? Boolean(request) && result?.decision === 'HUMAN_REQUIRED'
        : result?.status === 'ESCALATION_REQUIRED';
      if (!wantsEscalation) return null;

      const { routing, escalated } = await current();
      const authorize = kind === 'review' ? authorizeReviewEscalation : authorizeDeveloperEscalation;
      const verdict = authorize({ request, current: routing, alreadyEscalated: escalated, mode });

      if (verdict.verdict !== ESCALATION_VERDICTS.AUTHORIZED) {
        await refuse({ verdict: verdict.verdict, reason: verdict.reason, request, attempt });
        return null;
      }

      return {
        decision: verdict.decision,
        routed: toRoutedRecord(verdict.decision),
        from: routing?.modelKey ?? null,
        reason: verdict.reason,
        evidence: verdict.evidence,
      };
    },
  };
}
