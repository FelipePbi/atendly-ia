/**
 * IA Loop — MIGRATION_STATUS.md's status TABLE, closed deterministically.
 *
 * `docs/migration/MIGRATION_STATUS.md` carries two independent facts about
 * each Goal: a narrative prose log ("Evidências e atualização") and a
 * machine-checked table (`| Goal | Status | Commit | Review | Observações |`)
 * that `lib/goal-discovery.mjs#parseMigrationStatus` reads back. Discovery
 * gates on two things from that table and nothing else: the row for the Goal
 * about to run must equal `expectedMigrationStatusRowFor` its resume point,
 * and the row for its PREVIOUS Goal must read `ACCEPTED`
 * (`PREVIOUS_GOAL_NOT_ACCEPTED`).
 *
 * Both facts were, until this module, left to the Tech Lead's closure and
 * planning documentation jobs to remember — free-form prose written by a
 * model. `MIGRATION_STATUS.md`'s own text names the result: by Goal049 it
 * had happened **26 times in a row**. Every occurrence produced the same
 * failure at the NEXT Goal's discovery — `MIGRATION_STATUS_ROW_MISSING` or
 * `PREVIOUS_GOAL_NOT_ACCEPTED` — reachable only after a human read the
 * refusal, diffed the table against the prose log that WAS written, and
 * patched the table by hand.
 *
 * This is the same fix `lib/goal-status-transition.mjs` already applied to
 * the Goal document's own "Status:" line, for the same reason: a fact that
 * is fully entailed by evidence already on disk is not a model's memory to
 * trust, and costs no model call to make true. Two operations, both
 * minimal — neither touches the rich narrative prose a closure or planning
 * job writes elsewhere in this file, only the two machine-checked columns
 * `discoverGoal` actually reads:
 *
 *   - `ensureMigrationStatusRowAccepted` flips one existing row's Status
 *     column READY → ACCEPTED once the Goal is proven integrated, and
 *     rewrites its Commit/Review columns from the same evidence — mirroring
 *     the pattern every already-ACCEPTED row in this table follows.
 *   - `ensureMigrationStatusRowExists` inserts a minimal READY row for a
 *     newly planned Goal when its planning integration lands and no row for
 *     it exists yet, placed immediately after the Goal it follows.
 *
 * Both are idempotent no-ops once a closure or planning job DOES write the
 * row itself — this only fills the gap when it doesn't.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MIGRATION_DOCS_PREFIX = 'docs/migration/';

import { SpikeError } from './claude-process.mjs';

const STATUS_PATH_SEGMENTS = ['docs', 'migration', 'MIGRATION_STATUS.md'];

function statusPath(repoRoot) {
  return join(repoRoot, ...STATUS_PATH_SEGMENTS);
}

/** A table row for `goalId`, recognised exactly as `parseMigrationStatus` recognises it. */
function rowPattern(goalId) {
  return new RegExp(`^(\\|\\s*${goalId}\\s*[—-][^|]*\\|\\s*)([A-Z_]+)(\\s*\\|)`, 'm');
}

/** The full single-line row for `goalId`, from its leading `|` to end of line. */
function rowLinePattern(goalId) {
  return new RegExp(`^\\|\\s*${goalId}\\s*[—-].*$`, 'm');
}

/**
 * Pure decision: given the table's current text, should `goalId`'s row move
 * to ACCEPTED, and with what Commit/Review columns?
 *
 * Never touches the Observações column — whatever a closure or planning job
 * wrote there about why the Goal exists remains true regardless of its
 * status, and is neither required nor erased here.
 *
 * @returns { text, changed }. A row already reading `to` is a no-op. Every
 * other case that is not exactly the authorised transition throws, failing
 * closed rather than guessing — including a missing row, which
 * `ensureMigrationStatusRowExists` (not this function) is responsible for.
 */
export function applyMigrationStatusRowAccepted(statusText, goalId, {
  closureCommit,
  originCommit,
  reviewSummary,
  reviewPath,
  reviewDate,
  from = 'READY',
  to = 'ACCEPTED',
} = {}) {
  const match = rowPattern(goalId).exec(statusText);
  if (!match) {
    throw new SpikeError(
      'MIGRATION_STATUS_ROW_MISSING',
      `Refusing to mark Goal ${goalId}'s MIGRATION_STATUS.md row ${to}: no row for it exists.`,
    );
  }

  const current = match[2];
  if (current === to) return { text: statusText, changed: false };
  if (current !== from) {
    throw new SpikeError(
      'MIGRATION_STATUS_ROW_UNEXPECTED',
      `Refusing to move Goal ${goalId}'s MIGRATION_STATUS.md row from ${current} to ${to}: `
      + `only a transition from ${from} is authorised here.`,
    );
  }
  if (!closureCommit || !originCommit) {
    throw new SpikeError(
      'MIGRATION_STATUS_ROW_TRANSITION_REFUSED',
      `Refusing to mark Goal ${goalId}'s MIGRATION_STATUS.md row ${to}: closure commit not proven `
      + `(closureCommit=${closureCommit ?? 'null'}, originCommit=${originCommit ?? 'null'}).`,
    );
  }

  const commitCell = `\`${closureCommit}\` (origem \`${originCommit}\`)`;
  const reviewCell = reviewPath
    ? `Tech Lead Agent: [${reviewSummary}](${reviewPath}), ${reviewDate}`
    : `Tech Lead Agent: ${reviewSummary}, ${reviewDate}`;

  // The row line as one unit, so replacing its Commit/Review columns cannot
  // drift onto a neighbouring row sharing the same three-digit prefix in its
  // Observações prose.
  const lineMatch = rowLinePattern(goalId).exec(statusText);
  const line = lineMatch[0];
  const cells = line.split('|');
  // cells[0] is '' (before the leading |); [1]=Goal, [2]=Status, [3]=Commit, [4]=Review, [5..]=Observações (may itself contain no `|`, verified by rowPattern's `[^|]*` title guard not applying past column 2 — Observações in practice never contains a literal `|`).
  cells[2] = ` ${to} `;
  cells[3] = ` ${commitCell} `;
  cells[4] = ` ${reviewCell} `;
  const rewrittenLine = cells.join('|');

  const text = statusText.slice(0, lineMatch.index)
    + rewrittenLine
    + statusText.slice(lineMatch.index + line.length);
  return { text, changed: true };
}

/**
 * The I/O wrapper `run-close.mjs` calls right after a Goal's closure is
 * proven integrated (`integratedClosureCommit` + `newMigrationBaseline`
 * written together, same evidence `ensureGoalAcceptedStatus` requires).
 */
export async function ensureMigrationStatusRowAccepted({
  repoRoot, goalId, closureCommit, originCommit, reviewSummary, reviewPath, reviewDate, emit = () => {},
}) {
  const path = statusPath(repoRoot);
  const text = await readFile(path, 'utf8');

  const result = applyMigrationStatusRowAccepted(text, goalId, {
    closureCommit, originCommit, reviewSummary, reviewPath, reviewDate,
  });

  if (result.changed) {
    await writeFile(path, result.text, 'utf8');
    emit(`MIGRATION_STATUS.md's table row for Goal ${goalId} was READY; closure evidence proves ACCEPTED — corrected deterministically, no model call.`);
  }

  return { changed: result.changed, path };
}

/**
 * Pure decision: given the table's current text, should a new READY row for
 * `goalId` be inserted right after `afterGoalId`'s row?
 *
 * A row that already exists for `goalId` (a closure or planning job DID
 * write it) is a no-op, never overwritten — this only fills a gap, it does
 * not second-guess prose a model already produced.
 */
export function applyMigrationStatusRowInserted(statusText, {
  goalId, title, newBaseline, promptPath, afterGoalId, preparedAfterLabel, developerProfile,
}) {
  if (rowPattern(goalId).exec(statusText)) {
    return { text: statusText, changed: false };
  }

  const afterMatch = rowLinePattern(afterGoalId).exec(statusText);
  if (!afterMatch) {
    throw new SpikeError(
      'MIGRATION_STATUS_ROW_INSERT_REFUSED',
      `Refusing to insert Goal ${goalId}'s MIGRATION_STATUS.md row: no row for the preceding `
      + `Goal ${afterGoalId} exists to insert it after.`,
    );
  }

  const newRow = `| ${goalId} — ${title} | READY | —; baseline aceita \`${newBaseline}\` | `
    + `[Prompt${goalId}](${promptPath}), preparado ${preparedAfterLabel}; reviewer: Tech Lead Agent (D-018); `
    + `perfil do Developer: ${developerProfile} | — |`;

  const insertAt = afterMatch.index + afterMatch[0].length;
  const text = statusText.slice(0, insertAt) + '\n' + newRow + statusText.slice(insertAt);
  return { text, changed: true };
}

/**
 * The I/O wrapper `run-close.mjs` calls right after a Goal's planning
 * integration lands (`planningIntegrationCommit` written, same moment the
 * Goal document for `goalId` itself is committed on main).
 *
 * `nextGoalPath` is repo-relative, exactly as `PlanningResult` reports it
 * (`docs/migration/goals/...`, enforced by `closure-contracts.mjs`) — never
 * an absolute path, so it always resolves against `repoRoot` here the same
 * way `discoverGoal` resolves every other Goal document.
 */
export async function ensureMigrationStatusRowExists({
  repoRoot, goalId, nextGoalPath, newBaseline, afterGoalId, developerProfile, emit = () => {},
}) {
  const path = statusPath(repoRoot);
  const text = await readFile(path, 'utf8');
  const goalText = await readFile(join(repoRoot, nextGoalPath), 'utf8');

  const titleMatch = /^#\s*Goal\s+\d+\s*—\s*(.+)$/m.exec(goalText);
  if (!titleMatch) {
    throw new SpikeError(
      'MIGRATION_STATUS_ROW_INSERT_REFUSED',
      `Refusing to insert Goal ${goalId}'s MIGRATION_STATUS.md row: ${nextGoalPath} has no `
      + '"# Goal N — <title>" heading to read the title from.',
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const promptPath = nextGoalPath.startsWith(MIGRATION_DOCS_PREFIX)
    ? nextGoalPath.slice(MIGRATION_DOCS_PREFIX.length)
    : nextGoalPath;
  const result = applyMigrationStatusRowInserted(text, {
    goalId,
    title: titleMatch[1].trim(),
    newBaseline,
    promptPath,
    afterGoalId,
    preparedAfterLabel: `em ${today} após o fechamento${afterGoalId}`,
    developerProfile,
  });

  if (result.changed) {
    await writeFile(path, result.text, 'utf8');
    emit(`MIGRATION_STATUS.md had no table row for Goal ${goalId} — inserted deterministically, no model call.`);
  }

  return { changed: result.changed, path };
}
