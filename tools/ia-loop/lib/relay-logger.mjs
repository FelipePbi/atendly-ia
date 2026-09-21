/**
 * IA Loop — Relay-Loop terminal logger.
 *
 * Presentation only. Every method here formats and prints; none of them
 * decide anything, none of them are read back by the orchestrator, and none
 * of them replace `store.appendEvent`/`machine.transitionTo` as the record of
 * what happened. If this module were deleted, the harness would behave
 * identically and just print plain lines again.
 *
 * "Round" (one Developer + one Tech Lead pass) is this harness's visible unit
 * of work — there is no separate Workunit list surfaced by the orchestrator
 * itself (the Work Unit DAG runs inside the Developer worker's own process).
 * `logger.workunit(...)` therefore renders the round header; it is the
 * closest fit to the hierarchy the Goal asked for without inventing a second
 * source of truth for something the orchestrator does not itself track.
 *
 * Color is conditional on `colorEnabled` (see `detectColorEnabled` below).
 * Symbols are NOT conditional: they are plain Unicode characters, not ANSI
 * escapes, so they render in Windows Terminal, PowerShell 7 and a modern
 * (UTF-8 codepage) cmd.exe with or without color support.
 */

import picocolors from 'picocolors';

/**
 * `picocolors`' own default export treats every `win32` process as
 * color-capable, which is wrong for output piped to a file or to a CI log —
 * exactly the case requirement 7 cares about. Built explicitly instead:
 * TTY required, `NO_COLOR`/`FORCE_COLOR` still honoured, `TERM=dumb` excluded.
 */
export function detectColorEnabled(env = process.env, stream = process.stdout) {
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR) return true;
  if (!stream || !stream.isTTY) return false;
  if (env.TERM === 'dumb') return false;
  return true;
}

/** One color set per semantic role. Identity functions when color is off. */
export function createPaint(colorEnabled = detectColorEnabled()) {
  const c = picocolors.createColors(colorEnabled);
  return {
    enabled: colorEnabled,
    cyan: c.cyan,
    blue: c.blue,
    purple: c.magenta,
    yellow: c.yellow,
    green: c.green,
    red: c.red,
    gray: c.gray,
    white: c.white,
    bold: c.bold,
  };
}

const SYMBOLS = Object.freeze({
  boxTopLeft: '╭', boxTopRight: '╮', boxBottomLeft: '╰', boxBottomRight: '╯',
  boxH: '─', boxV: '│',
  planning: '◆', routing: '◈', execution: '▶', review: '⚡', rework: '↻',
  validation: '✓', success: '✓', warning: '⚠', error: '✗',
  working: '●', waiting: '○',
});

function clockOf(clock) {
  return clock().toISOString().slice(11, 19);
}

/** Draws a fixed-width box around one or more content lines. Ciano border. */
function box(paint, lines, { minWidth = 56 } = {}) {
  const width = Math.max(minWidth, ...lines.map((l) => l.length)) + 2;
  const top = `${SYMBOLS.boxTopLeft}${SYMBOLS.boxH.repeat(width)}${SYMBOLS.boxTopRight}`;
  const bottom = `${SYMBOLS.boxBottomLeft}${SYMBOLS.boxH.repeat(width)}${SYMBOLS.boxBottomRight}`;
  const body = lines.map((line) => {
    const padded = ` ${line}`.padEnd(width, ' ');
    return `${SYMBOLS.boxV}${padded}${SYMBOLS.boxV}`;
  });
  return [top, ...body, bottom].map((l) => paint.cyan(l));
}

/** Green for an accepting decision, yellow for one that asks for changes. */
export function paintDecision(paint, decision) {
  if (decision === 'ACCEPTED' || decision === 'APPROVED') return paint.green(decision);
  if (decision === 'CHANGES_REQUIRED') return paint.yellow(decision);
  if (!decision) return paint.white(String(decision));
  return paint.red(decision);
}

/**
 * Classifies a `LOOP_STATES` name into a semantic color, by suffix/prefix
 * pattern rather than an exhaustive hand-kept list — the same reasoning
 * `lib/state-registry.mjs` uses to derive its own tables from one source.
 */
export function paintState(paint, stateName) {
  const s = String(stateName ?? '');
  if (s === 'IDLE') return paint.gray(s);
  if (s === 'STOPPED') return paint.red(s);
  if (
    s === 'ACCEPTED' || s.endsWith('_ACCEPTED') || s.endsWith('_COMMITTED')
    || s === 'CLOSURE_READY' || s === 'MIGRATION_COMPLETE'
  ) return paint.green(s);
  if (
    s === 'WAITING_FOR_CAPACITY' || s === 'PAUSED' || s === 'HUMAN_REQUIRED'
    || s === 'AWAITING_HUMAN' || s === 'CHANGES_REQUIRED'
  ) return paint.yellow(s);
  if (
    s.endsWith('_QUEUED') || s.endsWith('_RUNNING') || s.startsWith('PREPARING_')
    || s.endsWith('_PLANNING') || s.endsWith('_DOCUMENTING') || s.endsWith('_STARTING')
    || s.endsWith('_COMMITTING') || s === 'GOAL_READY' || s === 'WORKTREE_READY'
    || s === 'REVIEW_REQUIRED'
  ) return paint.blue(s);
  return paint.white(s);
}

/**
 * Which color a worker-loop `log(tag, ...)` / telemetry category belongs to.
 * Used by `colorizeLogLine` below to recolor an already-rendered line without
 * changing a single character of its text.
 */
const TAG_COLOR = Object.freeze({
  ERROR: 'red', 'REFUSING TO START': 'red',
  SKIP: 'yellow', 'CAPACITY LIMIT': 'yellow', 'CAPACITY AVAILABLE': 'yellow',
  'WAITING FOR CAPACITY': 'yellow',
  MODEL: 'purple', PROFILE: 'purple', ROUTING: 'purple', EFFORT: 'purple', DECISION: 'purple',
  JOB: 'blue', PLAN: 'blue', RESULT: 'blue', DAG: 'blue',
  READ: 'blue', SEARCH: 'blue', EDIT: 'blue', WRITE: 'blue', DELETE: 'blue',
  BASH: 'blue', TEST: 'blue', GIT: 'blue',
  WORKER: 'gray', IDENTITY: 'gray', STOPPING: 'gray', IDLE: 'gray', STATE: 'gray',
});

// Matches `[HH:MM:SS] CATEGORY ...` (lib/telemetry.mjs renderEvent) or
// `HH:MM:SS [TAG] ...` (lib/worker-loop.mjs log) — the only two shapes this
// codebase already prints. The rest of the line is returned untouched.
const TELEMETRY_LINE = /^(\[\d{2}:\d{2}:\d{2}\]\s+)([A-Z][A-Z _-]*[A-Z])(\s|$)/;
const WORKER_LOOP_LINE = /^(\d{2}:\d{2}:\d{2}\s+\[)([A-Z][A-Z _-]*[A-Z])(\]:?)/;

/**
 * Recolors the category/tag token of a line already rendered by
 * `lib/telemetry.mjs` or `lib/worker-loop.mjs`, leaving every other
 * character — including the timestamp and the message — exactly as printed
 * today. Never used to build new lines, only to redecorate existing ones.
 */
export function colorizeLogLine(line, paint = createPaint()) {
  if (!paint.enabled || typeof line !== 'string') return line;

  const telemetryMatch = line.match(TELEMETRY_LINE);
  if (telemetryMatch) {
    const [, prefix, tag, sep] = telemetryMatch;
    const color = TAG_COLOR[tag] ?? 'gray';
    const rest = line.slice(prefix.length + tag.length + sep.length);
    return `${paint.gray(prefix)}${paint[color](tag)}${sep}${paint.gray(rest)}`;
  }

  const workerMatch = line.match(WORKER_LOOP_LINE);
  if (workerMatch) {
    const [, prefix, tag, closeBracket] = workerMatch;
    const color = TAG_COLOR[tag] ?? 'gray';
    const rest = line.slice(prefix.length + tag.length + closeBracket.length);
    return `${paint.gray(prefix)}${paint[color](tag)}${closeBracket}${rest}`;
  }

  return line;
}

/**
 * The Relay-Loop's own narrative logger — `run-goal.mjs`'s replacement for
 * its old `const emit = (line) => console.log(line)`.
 *
 * Construction never writes anything: every method below only prints when
 * called. `tests/harness-retry.test.mjs` enforces exactly this for every
 * entry point that constructs a logger at module scope.
 */
export function createRelayLogger({
  write = (line) => console.log(line),
  colorEnabled = detectColorEnabled(),
  clock = () => new Date(),
} = {}) {
  const paint = createPaint(colorEnabled);

  const prefixed = (symbol, color, text) => write(`${paint[color](symbol)} ${text}`);
  const heading = (symbol, color, title) => write(paint[color](paint.bold(`${symbol} ${title}`)));
  const lines = (text) => {
    (Array.isArray(text) ? text : [text]).forEach((line) => write(String(line)));
  };

  return {
    paint,

    goal({ id, title, status } = {}) {
      const idLine = id ? `GOAL #${id}` : 'GOAL';
      const content = [idLine];
      if (title) content.push(title);
      if (status) content.push(`status: ${status}`);
      for (const line of box(paint, content)) write(line);
    },

    planning(text) {
      heading(SYMBOLS.planning, 'cyan', 'PLANNING');
      lines(text);
    },

    routing(text) {
      heading(SYMBOLS.routing, 'purple', 'ROUTING');
      lines(text);
    },

    workunit({ round, phase } = {}) {
      const label = round !== undefined
        ? `ROUND ${round}${phase ? ` — ${phase}` : ''}`
        : String(phase ?? '');
      heading(SYMBOLS.execution, 'blue', label);
    },

    execution(text) {
      lines(Array.isArray(text) ? text : [text]);
    },

    review(text) {
      lines(Array.isArray(text) ? text : [text]);
    },

    rework(text) {
      prefixed(SYMBOLS.rework, 'yellow', Array.isArray(text) ? text.join('\n') : text);
    },

    validation(text) {
      prefixed(SYMBOLS.validation, 'green', Array.isArray(text) ? text.join('\n') : text);
    },

    success(text) {
      prefixed(SYMBOLS.success, 'green', text);
    },

    warning(text) {
      prefixed(SYMBOLS.warning, 'yellow', text);
    },

    error(text) {
      prefixed(SYMBOLS.error, 'red', text);
    },

    info(text) {
      write(paint.white(String(text ?? '')));
    },

    blank() {
      write('');
    },

    detail(line) {
      write(line);
    },

    /** Colored `Decision R${round}: ${decision}` line, used by the review step. */
    decision(round, decisionValue) {
      write(`Decision R${round}: ${paintDecision(paint, decisionValue)}`);
    },

    /** One `from -> to` transition line, colored by each endpoint's state. */
    transition(from, to) {
      write(`  ${paintState(paint, from)} -> ${paintState(paint, to)}`);
    },

    _clock: () => clockOf(clock),
  };
}

export { SYMBOLS };
