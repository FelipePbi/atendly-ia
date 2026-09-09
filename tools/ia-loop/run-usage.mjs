#!/usr/bin/env node
/**
 * IA Loop — reading the model usage ledger.
 *
 *   npm run ia-loop:usage
 *   npm run ia-loop:usage -- --goal 008
 *   npm run ia-loop:usage -- --goal 008 --json
 *   npm run ia-loop:usage -- --started        (rows opened and never finalised)
 *   npm run ia-loop:usage -- --integrity      (recorded inconsistencies)
 *
 * Debugging and validation ONLY. This is deliberately a table and a JSON dump,
 * not a dashboard: this Goal builds the ledger, and the analytics that read it
 * are a later, separate piece of work. Nothing here computes a price, a saving
 * or a counterfactual — the data is stored so those become possible, not so
 * they can be smuggled in now.
 *
 * Read-only. It opens the database, selects, and prints.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpikeError } from './lib/claude-process.mjs';
import { LEDGER_STATUS, openUsageLedger } from './lib/usage-ledger.mjs';
import { defaultLedgerPath } from './lib/usage-collector.mjs';
import { isDirectExecution } from './lib/direct-execution.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, '.state');

export function parseUsageArgs(argv) {
  const args = argv.slice(2);
  const valueOf = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] ?? null : null;
  };
  const limit = Number(valueOf('--limit'));
  return {
    goal: valueOf('--goal'),
    run: valueOf('--run'),
    job: valueOf('--job'),
    model: valueOf('--model'),
    role: valueOf('--role'),
    limit: Number.isInteger(limit) && limit > 0 ? limit : 200,
    json: args.includes('--json'),
    started: args.includes('--started'),
    integrity: args.includes('--integrity'),
  };
}

/** Builds the WHERE clause from the filters, with no string interpolation of values. */
export function buildUsageQuery(filters) {
  const where = [];
  const params = [];
  if (filters.goal) { where.push('goal_id = ?'); params.push(filters.goal); }
  if (filters.run) { where.push('run_id = ?'); params.push(filters.run); }
  if (filters.job) { where.push('job_id = ?'); params.push(filters.job); }
  if (filters.model) { where.push('resolved_model = ?'); params.push(filters.model); }
  if (filters.role) { where.push('role = ?'); params.push(filters.role); }
  if (filters.started) where.push("status = 'STARTED'");
  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `SELECT * FROM model_usage${clause} ORDER BY started_at ASC LIMIT ?`,
    params: [...params, filters.limit],
  };
}

function n(value) {
  return Number.isFinite(value) ? value : 0;
}

/** Deterministic sums only. No pricing, no ratios, no judgement. */
export function summarise(rows) {
  const totals = {
    executions: rows.length,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
    numTurns: 0,
    toolCalls: 0,
    durationMs: 0,
    providerReportedCostUsd: 0,
    byStatus: {},
    byModel: {},
    byOperation: {},
  };
  for (const row of rows) {
    totals.inputTokens += n(row.input_tokens);
    totals.outputTokens += n(row.output_tokens);
    totals.thinkingTokens += n(row.thinking_tokens);
    totals.cacheReadTokens += n(row.cache_read_tokens);
    totals.cacheCreationTokens += n(row.cache_creation_tokens);
    totals.totalTokens += n(row.total_tokens);
    totals.numTurns += n(row.num_turns);
    totals.toolCalls += n(row.tool_call_count);
    totals.durationMs += n(row.duration_ms);
    totals.providerReportedCostUsd += n(row.provider_reported_cost_usd);
    totals.byStatus[row.status] = (totals.byStatus[row.status] ?? 0) + 1;
    const model = row.resolved_model ?? row.requested_model ?? 'UNKNOWN';
    totals.byModel[model] = (totals.byModel[model] ?? 0) + 1;
    totals.byOperation[row.operation ?? 'UNKNOWN'] = (totals.byOperation[row.operation ?? 'UNKNOWN'] ?? 0) + 1;
  }
  return totals;
}

export function renderUsageReport({ rows, totals, integrity = [], path }) {
  const out = [`Usage ledger: ${path}`, ''];
  if (rows.length === 0) {
    out.push('No model executions recorded for this filter.');
    return out.join('\n');
  }

  out.push('  started              goal/round  role        operation      model                          '
    + 'in      out  think    cache_r  turns  tools  status');
  for (const row of rows) {
    out.push([
      `  ${String(row.started_at ?? '').slice(0, 19).padEnd(19)}`,
      `${String(row.goal_id ?? '-')}/${row.round_id ?? '-'}`.padEnd(11),
      String(row.role ?? '-').padEnd(11),
      String(row.operation ?? '-').padEnd(14),
      String(row.resolved_model ?? row.requested_model ?? '-').padEnd(30),
      String(n(row.input_tokens)).padStart(7),
      String(n(row.output_tokens)).padStart(8),
      String(row.thinking_tokens ?? '-').padStart(6),
      String(n(row.cache_read_tokens)).padStart(10),
      String(row.num_turns ?? '-').padStart(6),
      String(row.tool_call_count ?? '-').padStart(6),
      `  ${row.status}${row.is_fallback ? ' ·fallback' : ''}${row.is_escalation ? ' ·escalation' : ''}`,
    ].join(' '));
  }

  out.push('');
  out.push(`  executions: ${totals.executions}`);
  out.push(`  tokens: input ${totals.inputTokens} · output ${totals.outputTokens} `
    + `· thinking ${totals.thinkingTokens} (inside output) `
    + `· cache read ${totals.cacheReadTokens} · cache write ${totals.cacheCreationTokens}`);
  out.push(`  total tokens: ${totals.totalTokens}`);
  out.push(`  turns: ${totals.numTurns} · tool calls: ${totals.toolCalls} · wall clock: ${Math.round(totals.durationMs / 1000)}s`);
  // Reported as the CLI reports it. An estimate the provider produced, never
  // treated here as what the subscription was charged.
  out.push(`  provider reported cost (estimate, not an invoice): $${totals.providerReportedCostUsd.toFixed(4)}`);
  out.push(`  by status: ${Object.entries(totals.byStatus).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  out.push(`  by model: ${Object.entries(totals.byModel).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  out.push(`  by operation: ${Object.entries(totals.byOperation).map(([k, v]) => `${k} ${v}`).join(' · ')}`);

  if (integrity.length > 0) {
    out.push('');
    out.push('  integrity flags:');
    for (const flag of integrity) out.push(`    ${flag.at} ${flag.flag} ${flag.usage_id ?? ''}`);
  }
  return out.join('\n');
}

async function main() {
  const filters = parseUsageArgs(process.argv);
  const path = process.env.IA_LOOP_TELEMETRY_DB || defaultLedgerPath(STATE_DIR);
  const ledger = openUsageLedger({ path });

  if (ledger.status !== LEDGER_STATUS.OK) {
    console.error(`Usage ledger unavailable: ${ledger.error}`);
    return 1;
  }

  const { sql, params } = buildUsageQuery(filters);
  const rows = ledger.query(sql, params);
  if (!Array.isArray(rows)) {
    console.error(`Query failed: ${rows.error}`);
    return 1;
  }

  const integrity = filters.integrity
    ? ledger.query('SELECT * FROM model_usage_integrity ORDER BY at DESC LIMIT ?', [filters.limit])
    : [];

  const totals = summarise(rows);
  if (filters.json) {
    console.log(JSON.stringify({
      path,
      schemaVersion: ledger.schemaVersion(),
      filters,
      totals,
      rows,
      integrity: Array.isArray(integrity) ? integrity : [],
    }, null, 2));
  } else {
    console.log(renderUsageReport({
      rows, totals, integrity: Array.isArray(integrity) ? integrity : [], path,
    }));
  }
  ledger.close();
  return 0;
}

if (isDirectExecution(import.meta.url)) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      const code = error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR';
      console.error(`ATENDLY IA LOOP — usage\n\nCannot read ledger: [${code}] ${error.message}`);
      process.exitCode = 1;
    });
}
