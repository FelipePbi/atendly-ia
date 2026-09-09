/**
 * IA Loop — what the router actually did, per Goal.
 *
 * Derived from the event log, never from a counter someone remembered to
 * increment: MODEL_ROUTED, MODEL_FALLBACK, MODEL_ESCALATED and
 * MODEL_ESCALATION_REFUSED are already written at the moment each decision is
 * taken, so this can be asked long after the run and still be true.
 *
 * It exists to answer one question honestly — did adaptive routing actually
 * save the expensive models, or did everything quietly end up on Fable again?
 */

const ROUTED = 'MODEL_ROUTED';
const FALLBACK = 'MODEL_FALLBACK';
const ESCALATED = 'MODEL_ESCALATED';
const REFUSED = 'MODEL_ESCALATION_REFUSED';

const STAGE_LABEL = Object.freeze({
  planning: 'Planning',
  review: 'Review',
  implementation: 'Developer',
  correction: 'Developer (correction)',
});

/**
 * Summarises the routing of one Goal.
 *
 * `events` is the raw event log. Only this Goal's routing events are read, so
 * a summary can never borrow another Goal's numbers.
 */
export function summarizeRouting(events, { goal } = {}) {
  const mine = (events ?? []).filter((event) => (goal ? event.goal === goal : true));

  const calls = { sonnet: 0, opus: 0, fable: 0 };
  const stages = new Map();
  const fallbacks = [];
  const escalations = [];
  const refusals = [];

  for (const event of mine) {
    if (event.type === ROUTED) {
      if (Object.hasOwn(calls, event.selectedModel)) calls[event.selectedModel] += 1;
      // Last write wins per stage+round: the model that ACTUALLY ran is the
      // one the last attempt was routed to.
      const key = `${event.stage}:${event.round ?? 0}`;
      stages.set(key, {
        stage: event.stage,
        round: event.round ?? 0,
        model: event.selectedModel,
        effort: event.effort ?? null,
        complexity: event.complexity ?? null,
        riskScore: event.riskScore ?? null,
        reason: event.reason ?? null,
        signals: event.signals ?? [],
        attempts: (stages.get(key)?.attempts ?? 0) + 1,
        firstModel: stages.get(key)?.firstModel ?? event.selectedModel,
      });
    } else if (event.type === FALLBACK) {
      fallbacks.push({ role: event.agent, from: event.from, to: event.to, reason: event.reason, round: event.round ?? 0 });
    } else if (event.type === ESCALATED) {
      escalations.push({ role: event.agent, from: event.from, to: event.to, reason: event.reason, round: event.round ?? 0 });
    } else if (event.type === REFUSED) {
      refusals.push({ role: event.agent, requested: event.requested, reason: event.reason, round: event.round ?? 0 });
    }
  }

  return {
    goal: goal ?? null,
    calls,
    totalCalls: calls.sonnet + calls.opus + calls.fable,
    stages: [...stages.values()].sort((a, b) => a.round - b.round),
    fallbacks,
    escalations,
    refusals,
  };
}

/** The block printed at the end of a Goal, and by the status screen. */
export function renderRoutingSummary(summary) {
  const lines = ['MODEL ROUTING'];

  if (summary.stages.length === 0) {
    lines.push('  (no routed model call recorded for this Goal)');
    return lines;
  }

  for (const stage of summary.stages) {
    const label = STAGE_LABEL[stage.stage] ?? stage.stage;
    const risk = stage.complexity
      ? `${stage.complexity}${stage.riskScore === null ? '' : ` (score ${stage.riskScore})`}`
      : 'n/a';
    lines.push(`  ${label} R${stage.round}: ${risk} → ${stage.model}${stage.effort ? ` ${stage.effort}` : ''}`);
    if (stage.attempts > 1 && stage.firstModel !== stage.model) {
      lines.push(`    started on ${stage.firstModel}, ended on ${stage.model} after ${stage.attempts} attempts`);
    }
    if ((stage.signals ?? []).length > 0) lines.push(`    signals: ${stage.signals.join(', ')}`);
  }

  lines.push(`  Calls: sonnet ${summary.calls.sonnet} · opus ${summary.calls.opus} · fable ${summary.calls.fable}`);
  lines.push(`  Fallbacks: ${summary.fallbacks.length}`);
  for (const item of summary.fallbacks) {
    lines.push(`    ${item.role} R${item.round}: ${item.from} → ${item.to} (${item.reason})`);
  }
  lines.push(`  Escalations: ${summary.escalations.length}`);
  for (const item of summary.escalations) {
    lines.push(`    ${item.role} R${item.round}: ${item.from} → ${item.to} (${item.reason})`);
  }
  if (summary.refusals.length > 0) {
    lines.push(`  Escalations refused: ${summary.refusals.length}`);
    for (const item of summary.refusals) {
      lines.push(`    ${item.role} R${item.round}: asked ${item.requested} — ${item.reason}`);
    }
  }

  return lines;
}
