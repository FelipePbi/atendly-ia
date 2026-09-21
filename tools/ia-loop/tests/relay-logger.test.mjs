/**
 * Relay-Loop terminal logger — presentation only.
 *
 * The central claim under test, mirroring `tests/telemetry.test.mjs`: the
 * logger changes how a line LOOKS, never what it SAYS. Every assertion here
 * either checks that requested text survives into the printed line, or that
 * stripping ANSI color from a colored line reproduces the same line the
 * logger would have printed with color off.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  colorizeLogLine,
  createPaint,
  createRelayLogger,
  detectColorEnabled,
  paintDecision,
  paintState,
} from '../lib/relay-logger.mjs';
import { LOOP_STATES } from '../lib/state-registry.mjs';

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

function capture({ colorEnabled } = {}) {
  const lines = [];
  const logger = createRelayLogger({ write: (line) => lines.push(line), colorEnabled });
  return { logger, lines };
}

// --- Construction never prints --------------------------------------------

test('constructing a logger emits nothing until a method is called', () => {
  const { lines } = capture({ colorEnabled: true });
  assert.deepEqual(lines, []);
});

// --- Every method carries its text through, with and without color --------

const CASES = [
  ['goal', [{ id: '044', title: 'Do the thing', status: 'READY' }], ['GOAL #044', 'Do the thing', 'status: READY']],
  ['planning', ['5 Workunits created'], ['5 Workunits created']],
  ['routing', ['WU-01 → Sonnet medium'], ['WU-01 → Sonnet medium']],
  ['execution', ['Waiting for the Developer…'], ['Waiting for the Developer…']],
  ['review', ['Waiting for the Tech Lead…'], ['Waiting for the Tech Lead…']],
  ['rework', ['Tech Lead selected OPUS_HIGH for round 3.'], ['Tech Lead selected OPUS_HIGH for round 3.']],
  ['validation', ['criteria coverage: 4 item(s)'], ['criteria coverage: 4 item(s)']],
  ['success', ['Round 1 was ACCEPTED'], ['Round 1 was ACCEPTED']],
  ['warning', ['Goal needs a human'], ['Goal needs a human']],
  ['error', ['Developer failed: [X] boom'], ['Developer failed: [X] boom']],
  ['info', ['Worktree: .ai-worktrees/goal-044'], ['Worktree: .ai-worktrees/goal-044']],
];

for (const [method, args, expectedSubstrings] of CASES) {
  test(`logger.${method} prints the given text (color on)`, () => {
    const { logger, lines } = capture({ colorEnabled: true });
    logger[method](...args);
    const joined = lines.join('\n');
    for (const expected of expectedSubstrings) assert.ok(joined.includes(expected), `expected "${expected}" in:\n${joined}`);
  });

  test(`logger.${method} prints the same text with color off, modulo ANSI`, () => {
    const withColor = capture({ colorEnabled: true });
    withColor.logger[method](...args);
    const withoutColor = capture({ colorEnabled: false });
    withoutColor.logger[method](...args);

    assert.deepEqual(withColor.lines.map(stripAnsi), withoutColor.lines);
  });
}

test('logger.workunit renders the round header', () => {
  const { logger, lines } = capture({ colorEnabled: false });
  logger.workunit({ round: 3, phase: 'correction' });
  assert.match(lines[0], /ROUND 3/);
  assert.match(lines[0], /correction/);
});

test('logger.decision colors ACCEPTED green and CHANGES_REQUIRED yellow, but keeps the text', () => {
  const { logger, lines } = capture({ colorEnabled: true });
  logger.decision(2, 'ACCEPTED');
  logger.decision(3, 'CHANGES_REQUIRED');
  assert.equal(stripAnsi(lines[0]), 'Decision R2: ACCEPTED');
  assert.equal(stripAnsi(lines[1]), 'Decision R3: CHANGES_REQUIRED');
  assert.notEqual(lines[0], stripAnsi(lines[0]), 'color codes present when enabled');
});

test('logger.transition colors both endpoints without changing the state names', () => {
  const { logger, lines } = capture({ colorEnabled: true });
  logger.transition('WORKTREE_READY', 'DEVELOPER_QUEUED');
  assert.equal(stripAnsi(lines[0]).trim(), 'WORKTREE_READY -> DEVELOPER_QUEUED');
});

// --- paintDecision / paintState --------------------------------------------

test('paintDecision colors ACCEPTED/APPROVED green, CHANGES_REQUIRED yellow, everything else red', () => {
  const paint = createPaint(true);
  assert.notEqual(paintDecision(paint, 'ACCEPTED'), 'ACCEPTED');
  assert.equal(stripAnsi(paintDecision(paint, 'ACCEPTED')), 'ACCEPTED');
  assert.equal(stripAnsi(paintDecision(paint, 'APPROVED')), 'APPROVED');
  assert.equal(stripAnsi(paintDecision(paint, 'CHANGES_REQUIRED')), 'CHANGES_REQUIRED');
  assert.equal(stripAnsi(paintDecision(paint, 'HUMAN_REQUIRED')), 'HUMAN_REQUIRED');
});

test('paintState classifies one real LOOP_STATES member from each color bucket', () => {
  const paint = createPaint(true);

  assert.ok(Object.hasOwn(LOOP_STATES, 'DEVELOPER_QUEUED'));
  assert.ok(Object.hasOwn(LOOP_STATES, 'WAITING_FOR_CAPACITY'));
  assert.ok(Object.hasOwn(LOOP_STATES, 'ACCEPTED'));
  assert.ok(Object.hasOwn(LOOP_STATES, 'STOPPED'));
  assert.ok(Object.hasOwn(LOOP_STATES, 'IDLE'));

  const blue = paintState(paint, LOOP_STATES.DEVELOPER_QUEUED);
  const yellow = paintState(paint, LOOP_STATES.WAITING_FOR_CAPACITY);
  const green = paintState(paint, LOOP_STATES.ACCEPTED);
  const red = paintState(paint, LOOP_STATES.STOPPED);
  const gray = paintState(paint, LOOP_STATES.IDLE);

  // Each one still reads as the plain state name once color is stripped...
  assert.equal(stripAnsi(blue), 'DEVELOPER_QUEUED');
  assert.equal(stripAnsi(yellow), 'WAITING_FOR_CAPACITY');
  assert.equal(stripAnsi(green), 'ACCEPTED');
  assert.equal(stripAnsi(red), 'STOPPED');
  assert.equal(stripAnsi(gray), 'IDLE');

  // ...and no two of these five categories were painted identically.
  const painted = new Set([blue, yellow, green, red, gray]);
  assert.equal(painted.size, 5);
});

// --- colorizeLogLine: recolors the tag, never the rest of the line --------

test('colorizeLogLine preserves a telemetry renderEvent-style line exactly, modulo color', () => {
  const paint = createPaint(true);
  const line = '[12:00:00] TEST go test ./...';
  const colored = colorizeLogLine(line, paint);
  assert.equal(stripAnsi(colored), line);
  assert.notEqual(colored, line, 'color was actually applied');
});

test('colorizeLogLine preserves a worker-loop log()-style line exactly, modulo color', () => {
  const paint = createPaint(true);
  const line = '12:00:00 [MODEL] claude-opus-5';
  const colored = colorizeLogLine(line, paint);
  assert.equal(stripAnsi(colored), line);
});

test('colorizeLogLine leaves an unrecognised line shape untouched', () => {
  const paint = createPaint(true);
  const line = 'some plain sentence with no tag';
  assert.equal(colorizeLogLine(line, paint), line);
});

test('colorizeLogLine is a no-op when color is disabled', () => {
  const paint = createPaint(false);
  const line = '[12:00:00] ERROR boom';
  assert.equal(colorizeLogLine(line, paint), line);
});

// --- detectColorEnabled respects NO_COLOR / FORCE_COLOR / TTY -------------

test('detectColorEnabled: NO_COLOR always wins', () => {
  assert.equal(detectColorEnabled({ NO_COLOR: '1' }, { isTTY: true }), false);
  assert.equal(detectColorEnabled({ NO_COLOR: '1', FORCE_COLOR: '1' }, { isTTY: true }), false);
});

test('detectColorEnabled: FORCE_COLOR wins over a missing TTY', () => {
  assert.equal(detectColorEnabled({ FORCE_COLOR: '1' }, { isTTY: false }), true);
  assert.equal(detectColorEnabled({ FORCE_COLOR: '1' }, null), true);
});

test('detectColorEnabled: no TTY and no override means no color (covers redirected/CI output)', () => {
  assert.equal(detectColorEnabled({}, { isTTY: false }), false);
  assert.equal(detectColorEnabled({}, null), false);
});

test('detectColorEnabled: a TTY with no overrides and a real TERM gets color', () => {
  assert.equal(detectColorEnabled({}, { isTTY: true }), true);
  assert.equal(detectColorEnabled({ TERM: 'dumb' }, { isTTY: true }), false);
});
