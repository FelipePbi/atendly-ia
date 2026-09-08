/**
 * IA Loop — telling a harness bug apart from a model-driven outcome.
 *
 * A `SpikeError` thrown by `run-goal.mjs` almost always describes something
 * real about the Goal — a worker offline, a policy violation, a contract the
 * model broke. `INVALID_TRANSITION` and `UNKNOWN_STATE` are different in
 * kind: they say the ORCHESTRATOR'S OWN state machine was asked to do
 * something the machine itself refuses, which is never a fact about the
 * Goal — it is a defect in this tooling.
 *
 * Left unclassified, that defect used to surface to `run-auto.mjs` as
 * `UNKNOWN_FATAL`, the same label a genuinely inexplicable model failure gets.
 * The two need different responses: `UNKNOWN_FATAL` invites "try the model
 * again"; a state-machine defect needs a code fix, the way `HARNESS_ERROR`
 * already does for a rejected CLI argv (see harness-retry.mjs). Naming it
 * `HARNESS_ERROR` here reuses that existing, already-understood vocabulary
 * instead of inventing a third label for the same kind of problem.
 */

/**
 * SpikeError codes that can only mean the orchestrator's own state machine
 * usage was wrong — never a fact about the Goal, the worker, or the model.
 */
export const ORCHESTRATOR_FAULT_CODES = Object.freeze(['INVALID_TRANSITION', 'UNKNOWN_STATE', 'HYDRATION_EVIDENCE_REQUIRED']);

/** Pure: does this error describe an orchestrator-internal defect? */
export function classifyOrchestratorFault(error) {
  if (!error || typeof error.code !== 'string') return null;
  return ORCHESTRATOR_FAULT_CODES.includes(error.code) ? 'HARNESS_ERROR' : null;
}

/**
 * Records the classification, if any, so a caller in another process
 * (`run-auto.mjs`, reading only exit code and disk) can tell this apart from
 * an ordinary escalation.
 *
 * Scoped to the Goal the runtime already names: a fault while resuming Goal
 * 006 must never be attributed to whatever Goal 005 left in `runtime.json`.
 * Silent when the error is not an orchestrator fault, or when `goal` is
 * unknown — this never invents an escalation reason for something else.
 */
export async function recordOrchestratorFault(store, { goal, error }) {
  const classification = classifyOrchestratorFault(error);
  if (!classification || !goal || !store) return { recorded: false, classification };

  const runtime = await store.readRuntime();
  await store.appendEvent({
    type: 'ORCHESTRATOR_FAULT', goal, code: error.code, message: error.message, classification,
  });
  if (runtime?.goal === goal) {
    await store.writeRuntime({ ...runtime, escalationReason: classification });
  }
  return { recorded: true, classification };
}
