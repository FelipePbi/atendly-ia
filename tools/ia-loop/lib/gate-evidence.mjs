/**
 * IA Loop — gate evidence that survives a documentation-only round.
 *
 * Whole correction rounds were spent on documentation. Goal095 round 4 and
 * Goal097 round 3 changed no code at all: every blocker was a stale test
 * count, an old hash or a false sentence in CURRENT_STATE / VALIDATION_GATE.
 * Each of those rounds still re-ran every heavy gate (validate:core,
 * validate:ui, validate:integration with its disposable databases), and the
 * Developer, handed only the reviewer's prose, re-derived the numbers from
 * memory or from a re-run — which is how a stale number got written in the
 * first place.
 *
 * Two things here, and neither weakens acceptance:
 *
 *   1. REUSE. A gate result is reused only when the harness can PROVE the
 *      code it observed is the code now on disk: every file outside
 *      `docs/**\/*.md`, byte for byte, plus the same base and HEAD. That proof
 *      is a content fingerprint computed right before the gate would run and
 *      stored with every gate result. Equal fingerprints, same gate (action,
 *      scope, pattern), previous run COMPLETED: the result is carried over
 *      and SAID to be carried over — in the event log, in the unit report and
 *      in the reviewer's gate table. Anything else re-runs. Nothing is
 *      inferred from what a model says it changed.
 *
 *   2. THE NUMBERS. When the reviewer classifies a round as documentation-only,
 *      the correction unit receives the exact lines the gates printed (test
 *      counts, gate summaries) and the round each came from, so the documents
 *      can be written from evidence instead of recollection.
 *
 * Why `docs/**\/*.md` and nothing wider: no gate reads those files (searched
 * across the gate scripts and the app suites when this was written), while
 * everything else may be — `docs/design-reference/` holds the HTML prototype
 * the visual tooling renders, and a JSON or config file anywhere is fair game
 * for a test.
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { git } from './git-ops.mjs';
import { WORK_UNIT_NAMESPACE } from './job-store.mjs';

export const CODE_FINGERPRINT_VERSION = 'code-v1';

/** Paths no gate reads. Kept narrow on purpose; see the header. */
const DOCUMENTATION_PATH = /^docs\/.+\.md$/i;

export function isDocumentationPath(path) {
  return typeof path === 'string' && DOCUMENTATION_PATH.test(path.replace(/\\/g, '/'));
}

/**
 * Gates whose answer depends only on code, and so may be carried across a
 * round in which only documentation changed.
 *
 * An allowlist, not a denylist: a gate added later re-runs until somebody
 * decides it is safe to reuse. The two left out are deliberate:
 *   - `git-diff-check` inspects the documentation diff too (trailing
 *     whitespace in a .md is exactly what it reports);
 *   - `tooling-tests` runs the harness's own suite, parts of which read real
 *     files under `docs/` of the repository.
 */
export const REUSABLE_GATE_ACTIONS = Object.freeze([
  'typecheck',
  'lint',
  'targeted-tests',
  'unit-tests',
  'gate-tests',
  'build',
  'validate-core',
  'validate-integration',
  'validate-ui',
]);

export function isReusableGateAction(action) {
  return REUSABLE_GATE_ACTIONS.includes(action);
}

/** What makes two gate runs "the same gate". The unit id alone does not. */
export function gateIdentity(unit) {
  return Object.freeze({
    action: unit?.action ?? null,
    scope: unit?.scope ?? null,
    pattern: unit?.pattern ?? null,
  });
}

function sameGate(a, b) {
  return Boolean(a && b)
    && a.action === b.action
    && (a.scope ?? null) === (b.scope ?? null)
    && (a.pattern ?? null) === (b.pattern ?? null);
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * Pure: one value for "the code", from what differs from the base.
 *
 * Files equal to the base are covered by `baseSha` itself; files that differ
 * are listed with their content hash (or DELETED). Documentation entries are
 * dropped here, and only here, so two trees that differ only in docs/**\/*.md
 * produce the same value — and no other pair can.
 */
export function codeFingerprintFromEntries({ baseSha, head, entries = [] }) {
  const lines = entries
    .filter((entry) => entry?.path && !isDocumentationPath(entry.path))
    .map((entry) => `${entry.path.replace(/\\/g, '/')}:${entry.sha256 ?? 'DELETED'}`)
    .sort();
  return `${CODE_FINGERPRINT_VERSION}:${sha256([`base:${baseSha}`, `head:${head}`, ...lines].join('\n'))}`;
}

/**
 * Reads the fingerprint inputs from a worktree.
 *
 * `--no-renames` is load-bearing: with rename detection a rename lists only
 * the NEW path, so a tree that still had the old file and one that had
 * deleted it would hash the same.
 */
export async function computeCodeFingerprint({ worktree, baseSha }) {
  const opts = { cwd: worktree };
  const head = await git(['rev-parse', 'HEAD'], opts);
  const trackedRaw = await git(['diff', '--no-renames', '--name-only', baseSha, '--'], opts);
  const untrackedRaw = await git(['ls-files', '--others', '--exclude-standard'], opts);

  const paths = [...new Set([
    ...trackedRaw.split('\n'),
    ...untrackedRaw.split('\n'),
  ].map((line) => line.trim()).filter(Boolean))].filter((path) => !isDocumentationPath(path));

  const entries = [];
  for (const path of paths) {
    const absolute = join(worktree, path);
    try {
      // eslint-disable-next-line no-await-in-loop
      const info = await stat(absolute);
      if (!info.isFile()) {
        entries.push({ path, sha256: `NOT_A_FILE:${info.isDirectory() ? 'dir' : 'other'}` });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      entries.push({ path, sha256: sha256(await readFile(absolute)) });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      entries.push({ path, sha256: null });
    }
  }

  return codeFingerprintFromEntries({ baseSha, head, entries });
}

const EXECUTED = 'WORK_UNIT_DETERMINISTIC_EXECUTED';
export const GATE_EVIDENCE_REUSED = 'WORK_UNIT_GATE_EVIDENCE_REUSED';

/** The persisted payload, whichever envelope depth the store returned. */
function payloadOf(stored) {
  return stored?.result?.result ?? stored?.result ?? null;
}

/**
 * The latest gate run of each unit in rounds before `beforeRound`, as events
 * recorded it. Later in the log wins, which is what makes a gate re-run after
 * its fix (generation 2) supersede the failing run that preceded it.
 */
function latestGateEvents(events, { goal, beforeRound, unitId = null }) {
  const latest = new Map();
  for (const event of events) {
    if (event?.goal !== goal) continue;
    if (event.type !== EXECUTED && event.type !== GATE_EVIDENCE_REUSED) continue;
    if (!Number.isInteger(event.round) || event.round >= beforeRound) continue;
    if (unitId && event.workUnitId !== unitId) continue;
    if (!event.workUnitId || !event.jobId) continue;
    latest.set(event.workUnitId, event);
  }
  return latest;
}

/**
 * Finds the previous round's result for this gate, if — and only if — it can
 * stand for a run now.
 *
 * Only the MOST RECENT earlier run of the gate is considered. If that one does
 * not qualify, an older green run is not dug up in its place: "the last time
 * this gate spoke it was red, or about different code" is an answer that
 * must be re-asked, not overruled.
 */
export async function findReusableGateResult({ store, events, goal, round, unit, codeFingerprint }) {
  if (!codeFingerprint || !isReusableGateAction(unit?.action) || !(round > 1)) return null;

  const event = latestGateEvents(events, { goal, beforeRound: round, unitId: unit.id }).get(unit.id);
  if (!event) return null;

  const prior = payloadOf(await store.readResult(WORK_UNIT_NAMESPACE, event.jobId).catch(() => null));
  if (!prior) return null;
  if (prior.status !== 'COMPLETED' || prior.executor !== 'native' || prior.exitCode !== 0) return null;
  if (prior.codeFingerprint !== codeFingerprint) return null;
  if (!sameGate(prior.gate, gateIdentity(unit))) return null;

  return Object.freeze({ jobId: event.jobId, round: event.round, result: prior });
}

/**
 * The reuse policy the executor is handed. Events are read once per round,
 * lazily — only rounds before this one matter, and they do not change while
 * this one runs.
 */
export function createGateEvidenceReuse({ store, goal, round, worktree, baseSha, enabled = true }) {
  let events = null;
  const active = Boolean(enabled) && Boolean(baseSha) && Boolean(worktree);
  return Object.freeze({
    enabled: active,
    fingerprint: () => computeCodeFingerprint({ worktree, baseSha }),
    async findReusable({ unit, codeFingerprint }) {
      if (!active) return null;
      if (!events) events = await store.readEvents();
      return findReusableGateResult({ store, events, goal, round, unit, codeFingerprint });
    },
  });
}

// ---------------------------------------------------------------------------
// The numbers, for a documentation-only correction
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/**
 * The lines of a gate's output that carry a count, verbatim.
 *
 * Verbatim, not parsed into numbers: the document has to quote what the gate
 * said, and a parser that mis-reads one runner's format would hand the
 * Developer a wrong number with the harness's authority behind it.
 */
const NUMBER_LINES = [
  /^\s*Test Files\s+.*\d/, // vitest
  /^\s*Tests\s+.*\d+\s+(passed|failed)/, // vitest
  /^\s*ℹ\s+(tests|pass|fail|skipped|cancelled|todo)\s+\d+/, // node --test
  /^\s*\d+\s+(passed|failed|skipped|flaky|did not run)\b/, // playwright
  /^\s*retries:\s*\d+/i,
  /^\s*"(gate|total|passed|failed|skipped)":\s*("[^"]*"|\d+)/, // validate-* JSON summary
  /\bvalidate:[a-z-]+\s+(PASSED|FAILED)\b/,
];

export function extractGateNumbers(report, { max = 14 } = {}) {
  if (typeof report !== 'string' || report === '') return [];
  const lines = report.replace(ANSI, '').split(/\r?\n/);
  const picked = [];
  for (const line of lines) {
    if (!NUMBER_LINES.some((pattern) => pattern.test(line))) continue;
    const trimmed = line.trim().replace(/,$/, '');
    if (!picked.includes(trimmed)) picked.push(trimmed);
  }
  // The tail of the output is where the final summary is; keep that end.
  return picked.slice(-max);
}

/**
 * What the gates last said about this Goal, before `beforeRound`: one row per
 * gate, with the exact count lines and the round the answer is from.
 */
export async function collectGateEvidence({ store, goal, beforeRound, events = null }) {
  const all = events ?? await store.readEvents();
  const latest = latestGateEvents(all, { goal, beforeRound });
  const rows = [];
  for (const [unitId, event] of [...latest.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // eslint-disable-next-line no-await-in-loop
    const result = payloadOf(await store.readResult(WORK_UNIT_NAMESPACE, event.jobId).catch(() => null));
    rows.push(Object.freeze({
      unitId,
      action: result?.action ?? event.action ?? null,
      scope: result?.gate?.scope ?? null,
      round: event.round,
      // The round whose execution actually produced the output, when this
      // one carried it over.
      originRound: result?.reusedFrom?.originRound ?? event.round,
      status: result?.status ?? (event.ok ? 'COMPLETED' : 'UNKNOWN'),
      exitCode: result?.exitCode ?? event.exitCode ?? null,
      codeFingerprint: result?.codeFingerprint ?? null,
      numbers: Object.freeze(extractGateNumbers(result?.report ?? '')),
    }));
  }
  return rows;
}

/**
 * The brief a documentation-only correction unit receives.
 *
 * It states facts and their source, and draws the line the reviewer drew. It
 * does not forbid code changes: if the Developer finds a blocker does need
 * code after all, it may change it — and the fingerprint will notice, and
 * every gate will run again.
 */
export function renderDocumentationRoundBrief({ round, gates = [] }) {
  const lines = [
    `O Tech Lead classificou TODOS os blockers da rodada ${round - 1} como somente documentação`,
    '(correctionScope DOCUMENTATION_ONLY). O código já foi verificado; o que falta é o texto.',
    '',
    '- Corrija editando apenas arquivos docs/**/*.md.',
    '- Use os números abaixo LITERALMENTE em CURRENT_STATE, VALIDATION_GATE e onde mais forem citados.',
    '  Eles são a saída exata dos gates, copiada pelo harness; não reconte nem arredonde de memória.',
    '- Enquanto nenhum arquivo fora de docs/**/*.md mudar, o harness reaproveita estes resultados e',
    '  diz isso ao revisor. Controles negativos que você já registrou contra este mesmo código',
    '  continuam válidos; não os repita.',
    '- Se algum blocker exigir mudar código, mude: os gates voltam a rodar, e os controles',
    '  precisam ser refeitos sobre o código novo.',
    '',
  ];

  if (gates.length === 0) {
    lines.push('Nenhum gate deste Goal rodou em rodada anterior; não há números do harness para citar.');
    return lines.join('\n');
  }

  lines.push('Saída dos gates (última execução de cada um):');
  for (const gate of gates) {
    const origin = gate.originRound !== gate.round
      ? `rodada ${gate.round}, executado de fato na rodada ${gate.originRound}`
      : `rodada ${gate.round}`;
    lines.push(`- ${gate.unitId} ${gate.action ?? 'gate'}${gate.scope ? ` @ ${gate.scope}` : ''}: `
      + `${gate.status === 'COMPLETED' ? 'PASS' : gate.status} exit ${gate.exitCode ?? 'n/a'} (${origin})`);
    if (gate.numbers.length === 0) {
      lines.push('    (a saída persistida não traz contagem; não invente uma)');
    } else {
      for (const number of gate.numbers) lines.push(`    ${number}`);
    }
  }
  return lines.join('\n');
}
