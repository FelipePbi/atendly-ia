/**
 * Tests for the usage ledger's debugging CLI.
 *
 * It exists to VALIDATE the ledger, so its own filtering and summing have to be
 * right — a wrong total here would be read as a wrong total in the data. What is
 * deliberately absent is anything resembling analysis: no pricing, no ratios,
 * no savings. Those belong to a later piece of work, on top of this data.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUsageQuery, parseUsageArgs, renderUsageReport, summarise } from '../run-usage.mjs';

const ROWS = [
  {
    started_at: '2026-09-09T10:00:00.000Z', goal_id: '008', round_id: 1, role: 'developer',
    operation: 'implementation', resolved_model: 'claude-sonnet-5', status: 'COMPLETED',
    input_tokens: 100, output_tokens: 200, thinking_tokens: 40, cache_read_tokens: 1000,
    cache_creation_tokens: 50, total_tokens: 1350, num_turns: 5, tool_call_count: 3,
    duration_ms: 4000, provider_reported_cost_usd: 0.25, is_fallback: 0, is_escalation: 0,
  },
  {
    started_at: '2026-09-09T10:10:00.000Z', goal_id: '008', round_id: 1, role: 'tech_lead',
    operation: 'review', resolved_model: 'claude-opus-5', status: 'FAILED',
    input_tokens: 10, output_tokens: 20, thinking_tokens: null, cache_read_tokens: 0,
    cache_creation_tokens: 0, total_tokens: 30, num_turns: 1, tool_call_count: 0,
    duration_ms: 1000, provider_reported_cost_usd: 0.01, is_fallback: 1, is_escalation: 0,
  },
];

test('filters are parsed, with a sane default limit', () => {
  assert.deepEqual(parseUsageArgs(['node', 'run-usage.mjs', '--goal', '008', '--json']), {
    goal: '008', run: null, job: null, model: null, role: null,
    limit: 200, json: true, started: false, integrity: false,
  });
  assert.equal(parseUsageArgs(['node', 'x', '--limit', '5']).limit, 5);
  assert.equal(parseUsageArgs(['node', 'x', '--limit', 'nonsense']).limit, 200);
});

test('every filter becomes a bound parameter, never interpolated text', () => {
  const { sql, params } = buildUsageQuery(parseUsageArgs(['n', 'x', '--goal', "008'; DROP TABLE model_usage; --"]));
  assert.match(sql, /WHERE goal_id = \?/);
  assert.equal(sql.includes('DROP TABLE'), false);
  assert.deepEqual(params, ["008'; DROP TABLE model_usage; --", 200]);
});

test('--started selects only rows that were opened and never finalised', () => {
  const { sql } = buildUsageQuery(parseUsageArgs(['n', 'x', '--started']));
  assert.match(sql, /status = 'STARTED'/);
});

test('the summary sums the categories separately and never adds thinking to the total', () => {
  const totals = summarise(ROWS);
  assert.equal(totals.executions, 2);
  assert.equal(totals.inputTokens, 110);
  assert.equal(totals.outputTokens, 220);
  assert.equal(totals.thinkingTokens, 40, 'a null thinking figure counts as nothing, not as zero output');
  assert.equal(totals.cacheReadTokens, 1000);
  assert.equal(totals.totalTokens, 1380, 'the sum of the rows own totals, which exclude thinking');
  assert.deepEqual(totals.byStatus, { COMPLETED: 1, FAILED: 1 });
  assert.deepEqual(totals.byOperation, { implementation: 1, review: 1 });
});

test('the report names the models, the outcome and the reroute, and labels cost as an estimate', () => {
  const text = renderUsageReport({ rows: ROWS, totals: summarise(ROWS), path: '/tmp/usage.sqlite' });
  assert.match(text, /claude-sonnet-5/);
  assert.match(text, /claude-opus-5/);
  assert.match(text, /·fallback/);
  assert.match(text, /thinking 40 \(inside output\)/);
  assert.match(text, /estimate, not an invoice/);
});

test('an empty ledger says so rather than printing an empty table', () => {
  const text = renderUsageReport({ rows: [], totals: summarise([]), path: '/tmp/usage.sqlite' });
  assert.match(text, /No model executions recorded/);
});
