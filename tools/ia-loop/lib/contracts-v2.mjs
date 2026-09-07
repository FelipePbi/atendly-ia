/**
 * IA Loop — V2 contracts.
 *
 * Protocol version 2 carries what the hybrid architecture needs that V1 did
 * not: a real Goal id, the two distinct baselines, the worktree, and the
 * correction round. Validation stays strict and fails closed.
 *
 * The V1 contracts remain in contracts.mjs, still used by the synthetic
 * supervised slice.
 */

import { SpikeError } from './claude-process.mjs';

export const PROTOCOL_VERSION_V2 = 2;

export const JOB_TYPES = Object.freeze(['IMPLEMENTATION', 'CORRECTION']);
export const REVIEW_LEVELS = Object.freeze(['STANDARD', 'DEEP']);
export const DEVELOPER_STATUSES_V2 = Object.freeze(['REVIEW_REQUIRED', 'BLOCKED']);
export const REVIEW_DECISIONS_V2 = Object.freeze(['ACCEPTED', 'CHANGES_REQUIRED', 'HUMAN_REQUIRED']);

/** Roles that can own a job queue. */
export const ROLES = Object.freeze(['developer', 'tech_lead']);

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function fail(code, message, details = {}) {
  throw new SpikeError(code, message, details);
}

function assertObject(payload, what) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('CONTRACT_FIELD_INVALID', `${what} is not a JSON object`);
  }
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('CONTRACT_FIELD_INVALID', `Field "${field}" must be a non-empty string`);
  }
}

function assertStringArray(value, field) {
  if (!Array.isArray(value)) fail('CONTRACT_FIELD_INVALID', `Field "${field}" must be an array`);
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      fail('CONTRACT_FIELD_INVALID', `Field "${field}" must contain only non-empty strings`);
    }
  }
}

export function assertSha(value, field) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) {
    fail('INVALID_SHA', `Field "${field}" must be a 40-character hex SHA, got ${JSON.stringify(value)}`);
  }
  return value;
}

function assertProtocol(payload) {
  if (payload.protocolVersion !== PROTOCOL_VERSION_V2) {
    fail(
      'UNSUPPORTED_PROTOCOL_VERSION',
      `Expected protocolVersion ${PROTOCOL_VERSION_V2} but received ${JSON.stringify(payload.protocolVersion)}`,
    );
  }
}

function assertRound(value) {
  if (!Number.isInteger(value) || value < 1) {
    fail('CONTRACT_FIELD_INVALID', `Field "round" must be an integer >= 1, got ${JSON.stringify(value)}`);
  }
}

/**
 * The two baselines are conceptually different and must never collapse:
 *
 * - migrationAcceptedBaseline: SHA of the last formally ACCEPTED Goal. It is
 *   what the functional diff stays traceable against.
 * - executionBase: the tree the work actually runs on, which also carries the
 *   Goal documentation and the IA Loop tooling.
 *
 * They are normally different, and that is expected, not an error.
 */
function assertBaselines(payload) {
  assertSha(payload.migrationAcceptedBaseline, 'migrationAcceptedBaseline');
  assertSha(payload.executionBase, 'executionBase');
}

// --- DeveloperJob ----------------------------------------------------------

export function validateDeveloperJob(payload) {
  assertObject(payload, 'DeveloperJob');
  assertProtocol(payload);
  assertNonEmptyString(payload.jobId, 'jobId');
  assertNonEmptyString(payload.goal, 'goal');
  assertRound(payload.round);

  if (!JOB_TYPES.includes(payload.type)) {
    fail('UNSUPPORTED_JOB_TYPE', `Job type ${JSON.stringify(payload.type)} is not allowed (expected one of: ${JOB_TYPES.join(', ')})`);
  }
  if (payload.role !== 'developer') {
    fail('ROLE_MISMATCH', `DeveloperJob must target role "developer", got ${JSON.stringify(payload.role)}`);
  }

  assertBaselines(payload);
  assertNonEmptyString(payload.worktree, 'worktree');
  assertNonEmptyString(payload.goalPath, 'goalPath');

  // A correction round must say what to fix; an implementation round must not
  // pretend to carry blockers it never received.
  assertStringArray(payload.blockers ?? [], 'blockers');
  if (payload.type === 'CORRECTION' && (payload.blockers ?? []).length === 0) {
    fail('CONTRACT_FIELD_INVALID', 'A CORRECTION job must carry at least one blocker');
  }
  if (payload.type === 'IMPLEMENTATION' && (payload.blockers ?? []).length > 0) {
    fail('CONTRACT_FIELD_INVALID', 'An IMPLEMENTATION job must not carry blockers');
  }

  return Object.freeze({ ...payload, blockers: Object.freeze([...(payload.blockers ?? [])]) });
}

// --- DeveloperResult -------------------------------------------------------

export function validateDeveloperResult(payload, { jobId, goal, round }) {
  assertObject(payload, 'DeveloperResult');
  assertProtocol(payload);

  if (payload.jobId !== jobId) {
    fail('JOB_ID_MISMATCH', `Expected jobId "${jobId}" but received ${JSON.stringify(payload.jobId)}`);
  }
  if (payload.goal !== goal) {
    fail('GOAL_MISMATCH', `Expected goal "${goal}" but received ${JSON.stringify(payload.goal)}`);
  }
  if (payload.round !== round) {
    fail('ROUND_MISMATCH', `Expected round ${round} but received ${JSON.stringify(payload.round)}`);
  }
  if (!DEVELOPER_STATUSES_V2.includes(payload.status)) {
    fail('UNSUPPORTED_STATUS', `Status ${JSON.stringify(payload.status)} is not allowed (expected one of: ${DEVELOPER_STATUSES_V2.join(', ')})`);
  }

  assertNonEmptyString(payload.summary, 'summary');
  assertNonEmptyString(payload.implementationReport, 'implementationReport');
  if (!Array.isArray(payload.validations)) {
    fail('CONTRACT_FIELD_INVALID', 'Field "validations" must be an array');
  }
  for (const validation of payload.validations) {
    assertObject(validation, 'validation entry');
    assertNonEmptyString(validation.name, 'validations[].name');
    if (typeof validation.passed !== 'boolean') {
      fail('CONTRACT_FIELD_INVALID', 'Field "validations[].passed" must be a boolean');
    }
  }

  return Object.freeze({ ...payload, validations: Object.freeze([...payload.validations]) });
}

// --- ReviewJob -------------------------------------------------------------

export function validateReviewJob(payload) {
  assertObject(payload, 'ReviewJob');
  assertProtocol(payload);
  assertNonEmptyString(payload.jobId, 'jobId');
  assertNonEmptyString(payload.goal, 'goal');
  assertRound(payload.round);

  if (payload.role !== 'tech_lead') {
    fail('ROLE_MISMATCH', `ReviewJob must target role "tech_lead", got ${JSON.stringify(payload.role)}`);
  }
  if (!REVIEW_LEVELS.includes(payload.reviewLevel)) {
    fail('UNSUPPORTED_REVIEW_LEVEL', `Review level ${JSON.stringify(payload.reviewLevel)} is not allowed (expected one of: ${REVIEW_LEVELS.join(', ')})`);
  }

  assertBaselines(payload);
  assertNonEmptyString(payload.worktree, 'worktree');
  assertNonEmptyString(payload.goalPath, 'goalPath');

  // The repository stays the authority: the reviewer must receive the real
  // change surface rather than relying on its own session memory.
  assertStringArray(payload.changedFiles ?? [], 'changedFiles');
  assertNonEmptyString(payload.implementationReport, 'implementationReport');
  assertStringArray(payload.previousBlockers ?? [], 'previousBlockers');

  return Object.freeze({
    ...payload,
    changedFiles: Object.freeze([...(payload.changedFiles ?? [])]),
    previousBlockers: Object.freeze([...(payload.previousBlockers ?? [])]),
  });
}

// --- ReviewDecision --------------------------------------------------------

const DECISION_TO_NEXT_ACTION = Object.freeze({
  ACCEPTED: 'STOP',
  CHANGES_REQUIRED: 'RETURN_TO_DEVELOPER',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
});

export function validateReviewDecision(payload, { jobId, goal, round }) {
  assertObject(payload, 'ReviewDecision');
  assertProtocol(payload);

  if (payload.jobId !== jobId) {
    fail('JOB_ID_MISMATCH', `Expected jobId "${jobId}" but received ${JSON.stringify(payload.jobId)}`);
  }
  if (payload.goal !== goal) {
    fail('GOAL_MISMATCH', `Expected goal "${goal}" but received ${JSON.stringify(payload.goal)}`);
  }
  if (payload.round !== round) {
    fail('ROUND_MISMATCH', `Expected round ${round} but received ${JSON.stringify(payload.round)}`);
  }
  if (!REVIEW_DECISIONS_V2.includes(payload.decision)) {
    fail('UNSUPPORTED_DECISION', `Decision ${JSON.stringify(payload.decision)} is not allowed (expected one of: ${REVIEW_DECISIONS_V2.join(', ')})`);
  }

  assertStringArray(payload.blockers, 'blockers');

  // Same invariants proven in V1, preserved here.
  if (payload.decision === 'ACCEPTED' && payload.blockers.length > 0) {
    fail('DECISION_BLOCKERS_INCOHERENT', 'ACCEPTED must come with an empty blockers list');
  }
  if (payload.decision === 'CHANGES_REQUIRED' && payload.blockers.length === 0) {
    fail('DECISION_BLOCKERS_INCOHERENT', 'CHANGES_REQUIRED must list at least one blocker');
  }

  const expected = DECISION_TO_NEXT_ACTION[payload.decision];
  if (payload.nextAction !== expected) {
    fail(
      'DECISION_NEXT_ACTION_INCOHERENT',
      `Decision "${payload.decision}" requires nextAction "${expected}" but received ${JSON.stringify(payload.nextAction)}`,
    );
  }

  return Object.freeze({ ...payload, blockers: Object.freeze([...payload.blockers]) });
}

// --- JSON Schemas handed to the CLI ---------------------------------------

export const DEVELOPER_RESULT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    // Pinned, not just typed: an open integer let a model answer with version 1
    // and the mismatch only surfaced after the inference had been paid for.
    protocolVersion: { type: 'integer', enum: [PROTOCOL_VERSION_V2] },
    jobId: { type: 'string' },
    goal: { type: 'string' },
    round: { type: 'integer' },
    status: { type: 'string', enum: [...DEVELOPER_STATUSES_V2] },
    summary: { type: 'string' },
    implementationReport: { type: 'string' },
    validations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          passed: { type: 'boolean' },
          detail: { type: 'string' },
        },
        required: ['name', 'passed'],
        additionalProperties: false,
      },
    },
  },
  required: ['protocolVersion', 'jobId', 'goal', 'round', 'status', 'summary', 'implementationReport', 'validations'],
  additionalProperties: false,
});

export const REVIEW_DECISION_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    protocolVersion: { type: 'integer', enum: [PROTOCOL_VERSION_V2] },
    jobId: { type: 'string' },
    goal: { type: 'string' },
    round: { type: 'integer' },
    decision: { type: 'string', enum: [...REVIEW_DECISIONS_V2] },
    blockers: { type: 'array', items: { type: 'string' } },
    nextAction: { type: 'string', enum: ['STOP', 'RETURN_TO_DEVELOPER', 'HUMAN_REQUIRED'] },
    summary: { type: 'string' },
  },
  required: ['protocolVersion', 'jobId', 'goal', 'round', 'decision', 'blockers', 'nextAction'],
  additionalProperties: false,
});

/**
 * Builds a DeveloperResult schema with the identity fields pinned.
 *
 * A model answered with jobId "003" (the goal) instead of the job id, and with
 * protocolVersion 1. Both slipped past an open schema and only failed local
 * validation after the inference had been paid for. Pinning them lets the CLI
 * reject the shape at the source.
 */
export function developerResultSchemaFor({ jobId, goal, round }) {
  return {
    ...DEVELOPER_RESULT_SCHEMA,
    properties: {
      ...DEVELOPER_RESULT_SCHEMA.properties,
      protocolVersion: { type: 'integer', enum: [PROTOCOL_VERSION_V2] },
      jobId: { type: 'string', enum: [jobId] },
      goal: { type: 'string', enum: [goal] },
      round: { type: 'integer', enum: [round] },
    },
  };
}

export function reviewDecisionSchemaFor({ jobId, goal, round }) {
  return {
    ...REVIEW_DECISION_SCHEMA,
    properties: {
      ...REVIEW_DECISION_SCHEMA.properties,
      protocolVersion: { type: 'integer', enum: [PROTOCOL_VERSION_V2] },
      jobId: { type: 'string', enum: [jobId] },
      goal: { type: 'string', enum: [goal] },
      round: { type: 'integer', enum: [round] },
    },
  };
}
