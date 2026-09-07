/**
 * IA Loop — state machine.
 *
 * Transitions come exclusively from validated structured fields. The machine
 * never parses prose and never decides based on model output text.
 *
 * States, transitions and categories are DERIVED from lib/state-registry.mjs,
 * the single canonical definition. Nothing here re-declares a state or a
 * category — that duplication is what let CORRECTION_RUNNING exist in the graph
 * while being unknown to the resumable set.
 */

import { SpikeError } from './claude-process.mjs';
import {
  ALLOWED_TRANSITIONS,
  EXECUTION_STATES,
  LOOP_STATES,
  NOT_IMPLEMENTED_STATES,
  RESUMABLE_STATES,
  STATE_REGISTRY,
  agentFor,
  isKnownState,
  isResumable,
} from './state-registry.mjs';

export {
  ALLOWED_TRANSITIONS,
  EXECUTION_STATES,
  LOOP_STATES,
  NOT_IMPLEMENTED_STATES,
  RESUMABLE_STATES,
  STATE_REGISTRY,
  agentFor,
  isKnownState,
  isResumable,
};

/** Terminal state each review decision maps to. */
const DECISION_TO_STATE = Object.freeze({
  ACCEPTED: LOOP_STATES.ACCEPTED,
  CHANGES_REQUIRED: LOOP_STATES.CHANGES_REQUIRED,
  HUMAN_REQUIRED: LOOP_STATES.HUMAN_REQUIRED,
});

export function createLoopStateMachine({ initialState = LOOP_STATES.IDLE } = {}) {
  if (!isKnownState(initialState)) {
    throw new SpikeError('UNKNOWN_STATE', `Unknown initial state "${initialState}"`);
  }

  let current = initialState;
  const history = [];

  return {
    get state() { return current; },
    get history() { return history.map((entry) => ({ ...entry })); },

    canTransitionTo(next) {
      return (ALLOWED_TRANSITIONS[current] ?? []).includes(next);
    },

    transitionTo(next, meta = {}) {
      if (!isKnownState(next)) {
        throw new SpikeError('UNKNOWN_STATE', `Unknown target state "${next}"`, { from: current, to: next });
      }
      if (!this.canTransitionTo(next)) {
        throw new SpikeError(
          'INVALID_TRANSITION',
          `Transition ${current} -> ${next} is not allowed`,
          { from: current, to: next, allowed: [...(ALLOWED_TRANSITIONS[current] ?? [])] },
        );
      }

      const transition = { from: current, to: next, at: new Date().toISOString(), ...meta };
      history.push(transition);
      current = next;
      return { ...transition };
    },
  };
}

export function stateForDecision(decision) {
  const state = DECISION_TO_STATE[decision];
  if (!state) {
    throw new SpikeError('UNSUPPORTED_DECISION', `No state defined for decision ${JSON.stringify(decision)}`);
  }
  return state;
}

/**
 * Where a verdict lands when the run is NOT continuing.
 *
 * V4 automates the correction rounds (loop-config.planAfterReview) and V5
 * automates the closure of an ACCEPTED Goal; this helper describes the
 * supervised stop that remains available in every case.
 */
export function planAfterDecision(decision) {
  switch (decision) {
    case 'ACCEPTED':
      return {
        decision,
        nextState: LOOP_STATES.AWAITING_HUMAN,
        deferredNextAction: 'CLOSE_GOAL',
        note: 'Closure is available; running it is an explicit step.',
      };
    case 'CHANGES_REQUIRED':
      return {
        decision,
        nextState: LOOP_STATES.AWAITING_HUMAN,
        deferredNextAction: 'RETURN_TO_DEVELOPER',
        note: 'Correction rounds run automatically while the round budget lasts.',
      };
    case 'HUMAN_REQUIRED':
      return {
        decision,
        nextState: LOOP_STATES.AWAITING_HUMAN,
        deferredNextAction: 'HUMAN_REQUIRED',
        note: 'The reviewer explicitly asked for a human.',
      };
    default:
      throw new SpikeError('UNSUPPORTED_DECISION', `Unknown decision ${JSON.stringify(decision)}`);
  }
}
