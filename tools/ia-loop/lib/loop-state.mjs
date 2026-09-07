/**
 * IA Loop — V2 state machine.
 *
 * Transitions come exclusively from validated structured fields. The machine
 * never parses prose and never decides based on model output text.
 *
 * V2 deliberately ends every review outcome at AWAITING_HUMAN. The correction
 * loop (CHANGES_REQUIRED going back to the Developer) exists as a concept but
 * is gated behind a human, because no real Goal has been executed yet.
 */

import { SpikeError } from './claude-process.mjs';

export const LOOP_STATES = Object.freeze({
  IDLE: 'IDLE',
  GOAL_READY: 'GOAL_READY',
  PREPARING_WORKTREE: 'PREPARING_WORKTREE',
  WORKTREE_READY: 'WORKTREE_READY',
  DEVELOPER_QUEUED: 'DEVELOPER_QUEUED',
  DEVELOPER_RUNNING: 'DEVELOPER_RUNNING',
  // Correction rounds reuse the same worktree and the same Developer role, but
  // are a distinct phase: the scope is the reviewer's blockers, not the Goal.
  CORRECTION_QUEUED: 'CORRECTION_QUEUED',
  CORRECTION_RUNNING: 'CORRECTION_RUNNING',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  REVIEWER_QUEUED: 'REVIEWER_QUEUED',
  REVIEWER_RUNNING: 'REVIEWER_RUNNING',
  ACCEPTED: 'ACCEPTED',
  CHANGES_REQUIRED: 'CHANGES_REQUIRED',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
  AWAITING_HUMAN: 'AWAITING_HUMAN',
  // A temporary model limit is not a failure and must not end the Goal: the run
  // parks here, keeps its state on disk, and resumes the exact blocked step.
  WAITING_FOR_CAPACITY: 'WAITING_FOR_CAPACITY',
  STOPPED: 'STOPPED',
});

/**
 * Allowed transitions.
 *
 * Note what is absent on purpose: CHANGES_REQUIRED does NOT lead back to
 * DEVELOPER_QUEUED. Every verdict funnels through AWAITING_HUMAN, which is the
 * human gate for V2.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  IDLE: ['GOAL_READY', 'STOPPED'],
  GOAL_READY: ['PREPARING_WORKTREE', 'STOPPED'],
  PREPARING_WORKTREE: ['WORKTREE_READY', 'HUMAN_REQUIRED', 'STOPPED'],
  // CORRECTION_QUEUED is reachable here because a resumed execution re-enters
  // after preparing the worktree: the previous round already ran, so the next
  // phase is a correction, not a fresh implementation.
  WORKTREE_READY: ['DEVELOPER_QUEUED', 'CORRECTION_QUEUED', 'STOPPED'],
  DEVELOPER_QUEUED: ['DEVELOPER_RUNNING', 'WAITING_FOR_CAPACITY', 'HUMAN_REQUIRED', 'STOPPED'],
  DEVELOPER_RUNNING: ['REVIEW_REQUIRED', 'WAITING_FOR_CAPACITY', 'HUMAN_REQUIRED', 'STOPPED'],
  REVIEW_REQUIRED: ['REVIEWER_QUEUED', 'STOPPED'],
  REVIEWER_QUEUED: ['REVIEWER_RUNNING', 'WAITING_FOR_CAPACITY', 'HUMAN_REQUIRED', 'STOPPED'],
  REVIEWER_RUNNING: ['ACCEPTED', 'CHANGES_REQUIRED', 'WAITING_FOR_CAPACITY', 'HUMAN_REQUIRED', 'STOPPED'],
  // Resuming returns to the exact step that was blocked — never to an earlier
  // one, so completed work is not redone.
  WAITING_FOR_CAPACITY: [
    'DEVELOPER_QUEUED', 'DEVELOPER_RUNNING',
    'CORRECTION_QUEUED', 'CORRECTION_RUNNING',
    'REVIEWER_QUEUED', 'REVIEWER_RUNNING',
    'HUMAN_REQUIRED', 'STOPPED',
  ],
  CORRECTION_QUEUED: ['CORRECTION_RUNNING', 'WAITING_FOR_CAPACITY', 'HUMAN_REQUIRED', 'STOPPED'],
  CORRECTION_RUNNING: ['REVIEW_REQUIRED', 'WAITING_FOR_CAPACITY', 'HUMAN_REQUIRED', 'STOPPED'],
  ACCEPTED: ['AWAITING_HUMAN'],
  // A correction round is now reachable, but only while the round budget lasts;
  // the orchestrator consults planAfterReview before taking it.
  CHANGES_REQUIRED: ['AWAITING_HUMAN', 'CORRECTION_QUEUED'],
  HUMAN_REQUIRED: ['AWAITING_HUMAN'],
  AWAITING_HUMAN: ['STOPPED'],
  STOPPED: [],
});

/** Terminal state each review decision maps to. */
const DECISION_TO_STATE = Object.freeze({
  ACCEPTED: LOOP_STATES.ACCEPTED,
  CHANGES_REQUIRED: LOOP_STATES.CHANGES_REQUIRED,
  HUMAN_REQUIRED: LOOP_STATES.HUMAN_REQUIRED,
});

/**
 * States that are explicitly NOT implemented in V2. Naming them keeps the
 * omission deliberate instead of accidental.
 */
export const NOT_IMPLEMENTED_STATES = Object.freeze([
  'CLOSING_GOAL',
  'CREATE_NEXT_GOAL',
  'AUTONOMOUS_NEXT_GOAL',
]);

export function createLoopStateMachine({ initialState = LOOP_STATES.IDLE } = {}) {
  if (!Object.hasOwn(ALLOWED_TRANSITIONS, initialState)) {
    throw new SpikeError('UNKNOWN_STATE', `Unknown initial state "${initialState}"`);
  }

  let current = initialState;
  const history = [];

  return {
    get state() {
      return current;
    },
    get history() {
      return history.map((entry) => ({ ...entry }));
    },

    canTransitionTo(next) {
      return (ALLOWED_TRANSITIONS[current] ?? []).includes(next);
    },

    transitionTo(next, meta = {}) {
      if (!Object.hasOwn(ALLOWED_TRANSITIONS, next)) {
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
 * The human gate: in V2 every verdict stops at AWAITING_HUMAN.
 *
 * `deferredNextAction` records what an autonomous loop *would* do next, so the
 * intent is auditable without being executed.
 */
export function planAfterDecision(decision) {
  switch (decision) {
    case 'ACCEPTED':
      return {
        decision,
        nextState: LOOP_STATES.AWAITING_HUMAN,
        deferredNextAction: 'CLOSE_GOAL',
        note: 'Goal closure is not automated in V2; a human decides.',
      };
    case 'CHANGES_REQUIRED':
      return {
        decision,
        nextState: LOOP_STATES.AWAITING_HUMAN,
        deferredNextAction: 'RETURN_TO_DEVELOPER',
        note: 'Correction loop is gated behind a human in V2.',
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
