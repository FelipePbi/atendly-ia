/**
 * IA Loop — Spike 0 support library.
 *
 * Minimal, dependency-free wrapper around headless (--print) invocations of the
 * Claude Code CLI. Scope is deliberately limited to what Spike 0 must prove:
 * that two independent agents can be launched programmatically, with an
 * explicitly selected model, returning structured output.
 *
 * This is NOT an orchestrator and must not grow into one.
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { createStreamParser } from './stream-telemetry.mjs';

/** Error carrying a stable machine-readable code, so callers never regex prose. */
export class SpikeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SpikeError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Locates the Claude Code executable.
 *
 * Order: explicit override, then PATH, then the versioned bundle shipped with
 * the Claude desktop app (highest version wins).
 */
export function resolveClaudeExecutable(env = process.env, { fs = { existsSync, readdirSync } } = {}) {
  const override = env.IA_LOOP_CLAUDE_BIN;
  if (override) {
    if (!fs.existsSync(override)) {
      throw new SpikeError('EXECUTABLE_NOT_FOUND', `IA_LOOP_CLAUDE_BIN points to a missing file: ${override}`);
    }
    return { path: override, source: 'IA_LOOP_CLAUDE_BIN' };
  }

  const pathValue = env.PATH || env.Path || '';
  const pathDirs = pathValue.split(process.platform === 'win32' ? ';' : ':');
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  for (const dir of pathDirs) {
    if (!dir) continue;
    for (const name of names) {
      const full = join(dir, name);
      if (fs.existsSync(full)) return { path: full, source: 'PATH' };
    }
  }

  const appData = env.APPDATA;
  if (appData) {
    const bundleRoot = join(appData, 'Claude', 'claude-code');
    if (fs.existsSync(bundleRoot)) {
      const versions = fs
        .readdirSync(bundleRoot)
        .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
        .sort(compareSemverDesc);
      for (const version of versions) {
        const full = join(bundleRoot, version, 'claude.exe');
        if (fs.existsSync(full)) return { path: full, source: `claude-desktop-bundle@${version}` };
      }
    }
  }

  throw new SpikeError(
    'EXECUTABLE_NOT_FOUND',
    'Claude Code executable not found on PATH, and no desktop-app bundle was located. Set IA_LOOP_CLAUDE_BIN.',
  );
}

function compareSemverDesc(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

/** JSON Schema both agents must satisfy. */
export const AGENT_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string' },
    ok: { type: 'boolean' },
  },
  required: ['role', 'ok'],
  additionalProperties: false,
};

/**
 * Builds the headless argument vector.
 *
 * Isolation is intentional and layered: no tools at all, no MCP servers, no
 * skills, no user/project customizations, nothing that can prompt, and no
 * session persistence. We deliberately do NOT use any permission-bypass flag —
 * the goal is an agent that cannot act, not one allowed to act unchecked.
 */
/**
 * Effort levels the installed CLI accepts (`claude --help`, 2.1.263).
 *
 * Duplicated from the profile registry on purpose: this layer must be able to
 * refuse an unknown level even when it is called without a profile. The CLI
 * only WARNS about an unknown value and then runs at default effort, which is a
 * silent downgrade — so the check happens before spawn, not after.
 */
export const CLI_EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

/** Output formats this wrapper knows how to parse back into an envelope. */
export const OUTPUT_FORMATS = Object.freeze(['json', 'stream-json']);

export function buildArgs({
  prompt,
  model,
  jsonSchema,
  sessionId,
  // Reasoning effort for this call. Part of the Developer profile; null means
  // "do not pass the flag", which is what every pre-routing execution did.
  effort = null,
  /**
   * `stream-json` makes the CLI emit its events as they happen, which is what
   * real-time telemetry is derived from. The final `result` event carries the
   * same envelope `json` would have produced, so the structured output the
   * orchestrator validates is unchanged.
   *
   * This is NOT a function of the log level: the argument vector must be
   * identical at every level.
   */
  outputFormat = 'json',
  // One-shot by default: the conversation is discarded when the process exits.
  // Persistent sessions opt in, because `--no-session-persistence` is exactly
  // what makes a conversation impossible to resume later.
  persistSession = false,
  resume = false,
  // Execution profile. The default is the fully isolated one used by the spikes
  // and the synthetic slice: no tools at all, nothing that can act. Real Goal
  // execution opts in explicitly.
  tools = '',
  permissionMode = null,
  addDirs = [],
  safeMode = true,
}) {
  if (!prompt) throw new SpikeError('INVALID_ARGS', 'prompt is required');
  if (!model) throw new SpikeError('INVALID_ARGS', 'model is required');
  if (!sessionId) throw new SpikeError('INVALID_ARGS', 'sessionId is required');
  if (resume && !persistSession) {
    throw new SpikeError('INVALID_ARGS', 'resume requires persistSession: a non-persisted session cannot be resumed');
  }
  if (!OUTPUT_FORMATS.includes(outputFormat)) {
    throw new SpikeError('INVALID_ARGS', `Unsupported output format ${JSON.stringify(outputFormat)}`);
  }
  if (effort !== null && effort !== undefined && !CLI_EFFORT_LEVELS.includes(effort)) {
    throw new SpikeError(
      'UNSUPPORTED_EFFORT',
      `Effort ${JSON.stringify(effort)} is not accepted by this CLI (expected one of: ${CLI_EFFORT_LEVELS.join(', ')})`,
      { effort, supported: CLI_EFFORT_LEVELS },
    );
  }

  const args = [
    // The prompt goes over stdin, never in argv: a real review packet exceeds
    // the ~32KB Windows command-line limit and the spawn fails with
    // ENAMETOOLONG. Measured on the first real Goal003 run.
    '--print',
    '--model', model,
    '--output-format', outputFormat,
    '--json-schema', JSON.stringify(jsonSchema ?? AGENT_SCHEMA),
    // Tool surface. An empty string removes every built-in tool.
    '--tools', Array.isArray(tools) ? tools.join(',') : tools,
    // Nothing may block on a prompt. Combined with an explicit permission mode
    // this authorises the profile's tools while still never hanging.
    '--permission-prompts', 'none',
    '--strict-mcp-config',
    '--disable-slash-commands',
  ];

  // Only when the profile asks for one. Omitting the flag is what every
  // pre-routing execution did, and is how a legacy Goal keeps its behaviour.
  if (effort !== null && effort !== undefined) args.push('--effort', effort);

  if (safeMode) args.push('--safe-mode');
  // Measured: only "auto" authorises both file writes and Bash without a
  // prompt; acceptEdits denies Bash and dontAsk denies Write.
  if (permissionMode) args.push('--permission-mode', permissionMode);
  for (const dir of addDirs) args.push('--add-dir', dir);

  if (resume) {
    // Resuming keeps the same session id, so the registry stays valid.
    args.push('--resume', sessionId);
  } else {
    // A caller-chosen session id keeps agents in separate conversations.
    args.push('--session-id', sessionId);
  }

  if (!persistSession) args.push('--no-session-persistence');

  return args;
}

/**
 * Spawns one headless invocation and returns the raw process outcome.
 * Never rejects on a non-zero exit; the caller decides what that means.
 */
export function runClaudeProcess({
  executable,
  args,
  cwd,
  timeoutMs = 120_000,
  env = process.env,
  spawnFn = spawn,
  stdinData = null,
  /**
   * Called with each stdout fragment as it arrives. Purely observational: the
   * chunk is still accumulated and returned, so the caller's parsing is
   * unaffected whether or not anybody is watching.
   */
  onStdoutChunk = null,
}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn(executable, args, { cwd, env, windowsHide: true });
    } catch (error) {
      reject(new SpikeError('SPAWN_FAILED', `Failed to spawn ${executable}: ${error.message}`));
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    if (stdinData !== null && child.stdin) {
      // A broken pipe here must not crash the orchestrator; the process error
      // handler already reports a failed spawn.
      child.stdin.on('error', () => {});
      child.stdin.end(stdinData);
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      if (!onStdoutChunk) return;
      try {
        onStdoutChunk(String(chunk));
      } catch {
        // An observer must never be able to fail an inference.
      }
    });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const code = error.code === 'ENOENT' ? 'EXECUTABLE_NOT_FOUND' : 'SPAWN_FAILED';
      reject(new SpikeError(code, `Failed to run ${executable}: ${error.message}`));
    });

    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut, timeoutMs });
    });
  });
}

/**
 * Parses the CLI's envelope, from either output format.
 *
 * `--output-format json` prints one object. `--output-format stream-json`
 * prints one object per line and ends with a `{"type":"result",…}` that carries
 * the SAME fields. Reading the last result event therefore yields exactly the
 * envelope the non-streaming call would have produced, so switching format
 * changes nothing downstream.
 */
export function parseEnvelope(stdout) {
  const trimmed = (stdout || '').trim();
  if (!trimmed) throw new SpikeError('EMPTY_OUTPUT', 'CLI produced no stdout');

  let envelope;
  let wholeParseError = null;
  try {
    envelope = JSON.parse(trimmed);
  } catch (error) {
    wholeParseError = error;
  }

  if (wholeParseError === null) {
    if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
      throw new SpikeError('INVALID_ENVELOPE_JSON', 'CLI envelope is not a JSON object');
    }
    return envelope;
  }

  // Not one object: try the event stream.
  const events = [];
  for (const line of trimmed.split('\n')) {
    const candidate = line.trim();
    if (candidate === '') continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) events.push(parsed);
    } catch {
      // A stray non-JSON line (a warning, for example) is not the envelope.
    }
  }

  const result = events.filter((event) => event.type === 'result').at(-1);
  if (result) return result;

  throw new SpikeError(
    'INVALID_ENVELOPE_JSON',
    `CLI envelope is not valid JSON: ${wholeParseError.message}`,
  );
}

/**
 * Canonical usage field names, mapped from the top-level `usage` object (snake
 * case) to the per-model `modelUsage` entries (camel case).
 */
const USAGE_FIELDS = {
  inputTokens: 'input_tokens',
  outputTokens: 'output_tokens',
  cacheReadInputTokens: 'cache_read_input_tokens',
  cacheCreationInputTokens: 'cache_creation_input_tokens',
};

function toCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeTopLevelUsage(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const normalized = {};
  for (const [canonical, snakeCase] of Object.entries(USAGE_FIELDS)) {
    normalized[canonical] = toCount(usage[snakeCase]);
  }
  return normalized;
}

function normalizeModelUsage(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const normalized = {};
  for (const canonical of Object.keys(USAGE_FIELDS)) {
    normalized[canonical] = toCount(entry[canonical]);
  }
  return normalized;
}

function usageMatches(a, b) {
  return Object.keys(USAGE_FIELDS).every((field) => a[field] === b[field]);
}

/**
 * Determines which model produced the main inference.
 *
 * `modelUsage` legitimately contains auxiliary models that Claude Code uses
 * internally (Haiku for its own bookkeeping, for example). Their presence is
 * NOT a fallback, so we cannot simply read the first or the most expensive key.
 *
 * Instead we anchor on the envelope's top-level `usage`, which reflects the
 * main inference, and look for the single `modelUsage` entry that accounts for
 * it. Anything else observed is recorded as auxiliary, for observability.
 *
 * Fails closed: never guesses when the evidence is missing or ambiguous.
 */
export function resolvePrimaryModel(envelope) {
  const modelUsage = envelope?.modelUsage;
  const observedModels = modelUsage && typeof modelUsage === 'object' && !Array.isArray(modelUsage)
    ? Object.keys(modelUsage)
    : [];

  if (observedModels.length === 0) {
    throw new SpikeError(
      'RESOLVED_MODEL_UNKNOWN',
      'CLI reported no modelUsage, so the primary model cannot be determined',
      { observedModels },
    );
  }

  const topLevelUsage = normalizeTopLevelUsage(envelope?.usage);
  if (topLevelUsage === null) {
    throw new SpikeError(
      'RESOLVED_MODEL_UNKNOWN',
      'CLI reported no top-level usage to match modelUsage against',
      { observedModels },
    );
  }

  const matches = observedModels.filter((id) => {
    const entry = normalizeModelUsage(modelUsage[id]);
    return entry !== null && usageMatches(topLevelUsage, entry);
  });

  if (matches.length === 0) {
    throw new SpikeError(
      'RESOLVED_MODEL_UNKNOWN',
      'No modelUsage entry accounts for the top-level usage, so the primary model cannot be determined',
      { observedModels },
    );
  }

  if (matches.length > 1) {
    throw new SpikeError(
      'RESOLVED_MODEL_AMBIGUOUS',
      `Several models match the top-level usage indistinguishably: ${matches.join(', ')}`,
      { observedModels, matches },
    );
  }

  const primary = matches[0];
  return {
    primary,
    auxiliary: observedModels.filter((id) => id !== primary),
    observedModels,
  };
}

/** Lists every model id the CLI reported, without interpreting them. */
export function listObservedModels(envelope) {
  const modelUsage = envelope?.modelUsage;
  if (!modelUsage || typeof modelUsage !== 'object' || Array.isArray(modelUsage)) return [];
  return Object.keys(modelUsage);
}

/** Extracts the agent's own payload from the envelope's result field. */
export function extractAgentPayload(envelope) {
  if (envelope.is_error === true) {
    throw new SpikeError('CLI_REPORTED_ERROR', String(envelope.result ?? 'CLI reported an error'), {
      terminalReason: envelope.terminal_reason ?? null,
    });
  }

  const result = envelope.result;
  if (result && typeof result === 'object' && !Array.isArray(result)) return result;

  if (typeof result !== 'string' || result.trim() === '') {
    throw new SpikeError('MISSING_RESULT', 'CLI envelope has no usable result field');
  }

  try {
    return JSON.parse(result.trim());
  } catch (error) {
    throw new SpikeError('INVALID_AGENT_JSON', `Agent output is not valid JSON: ${error.message}`);
  }
}

/**
 * Fails loudly on silent model substitution.
 *
 * Spike 0 exists to measure real capability. If we ask for Fable and get
 * something else, that is a FAIL, never a fallback.
 */
export function assertNoSilentFallback({ requestedModel, resolvedPrimaryModel, expectedFamily }) {
  if (resolvedPrimaryModel === null || resolvedPrimaryModel === undefined) {
    throw new SpikeError(
      'RESOLVED_MODEL_UNKNOWN',
      `CLI did not report which model served "${requestedModel}", so a silent fallback cannot be ruled out`,
      { requestedModel, expectedFamily },
    );
  }
  if (!String(resolvedPrimaryModel).toLowerCase().includes(expectedFamily.toLowerCase())) {
    throw new SpikeError(
      'MODEL_FALLBACK_DETECTED',
      `Requested "${requestedModel}" (family "${expectedFamily}") but the main inference came from "${resolvedPrimaryModel}"`,
      { requestedModel, resolvedPrimaryModel, expectedFamily },
    );
  }
  return resolvedPrimaryModel;
}

/** Validates the agent payload against the contract this Spike asserts. */
export function assertAgentPayload(payload, { expectedRole }) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SpikeError('INVALID_AGENT_SHAPE', 'Agent payload is not a JSON object');
  }
  if (payload.role !== expectedRole) {
    throw new SpikeError('ROLE_MISMATCH', `Expected role "${expectedRole}" but received ${JSON.stringify(payload.role)}`);
  }
  if (payload.ok !== true) {
    throw new SpikeError('OK_NOT_TRUE', `Expected ok === true but received ${JSON.stringify(payload.ok)}`);
  }
  return payload;
}

/**
 * Runs one agent end to end and returns an already-validated outcome.
 * Errors are captured as data so the caller can still report on both agents.
 */
export async function invokeAgent({
  executable,
  model,
  expectedFamily,
  expectedRole,
  prompt,
  cwd,
  timeoutMs = 120_000,
  env = process.env,
  spawnFn = spawn,
  sessionId = randomUUID(),
  jsonSchema = AGENT_SCHEMA,
  // Optional contract validator. Defaults to the Spike's role/ok assertion so
  // existing callers keep their behaviour unchanged.
  validatePayload = null,
  persistSession = false,
  resume = false,
  tools = '',
  permissionMode = null,
  addDirs = [],
  safeMode = true,
  // Developer profile effort. null keeps the CLI's default and passes no flag.
  effort = null,
  /**
   * Observational telemetry. When a sink is given, the CLI is asked for its
   * event stream instead of a single JSON blob and the events it was already
   * producing are reported as they arrive. No prompt, context, schema or model
   * changes; the envelope parsed at the end is the same one either way.
   */
  onTelemetryEvent = null,
  telemetryRoot = null,
}) {
  const outcome = {
    requestedModel: model,
    // Recorded so the runtime can report what was actually asked for, not just
    // what a profile said in some earlier file.
    requestedEffort: effort ?? null,
    expectedRole,
    resolvedPrimaryModel: null,
    auxiliaryModels: [],
    observedModels: [],
    sessionId,
    available: false,
    structuredOutput: false,
    payload: null,
    error: null,
  };

  const streaming = typeof onTelemetryEvent === 'function';
  const parser = streaming
    ? createStreamParser({ onEvent: onTelemetryEvent, root: telemetryRoot ?? cwd })
    : null;

  let processResult;
  try {
    processResult = await runClaudeProcess({
      executable,
      args: buildArgs({
        prompt, model, jsonSchema, sessionId, persistSession, resume,
        tools, permissionMode, addDirs, safeMode, effort,
        outputFormat: streaming ? 'stream-json' : 'json',
      }),
      stdinData: prompt,
      cwd,
      timeoutMs,
      env,
      spawnFn,
      onStdoutChunk: parser ? (chunk) => parser.push(chunk) : null,
    });
    parser?.end();
  } catch (error) {
    outcome.error = toReportableError(error);
    return outcome;
  }

  if (processResult.timedOut) {
    outcome.error = {
      code: 'TIMEOUT',
      message: `Process exceeded ${processResult.timeoutMs}ms and was killed`,
    };
    return outcome;
  }

  // The envelope is worth parsing even on a non-zero exit: it usually carries
  // the real reason (for example "Not logged in").
  let envelope = null;
  let envelopeError = null;
  try {
    envelope = parseEnvelope(processResult.stdout);
  } catch (error) {
    envelopeError = toReportableError(error);
  }

  if (processResult.exitCode !== 0) {
    const reason = envelope && typeof envelope.result === 'string'
      ? envelope.result
      : firstLine(processResult.stderr);
    outcome.error = {
      code: 'NON_ZERO_EXIT',
      message: `CLI exited with code ${processResult.exitCode}${reason ? `: ${reason}` : ''}`,
    };
    return outcome;
  }

  if (envelopeError) {
    outcome.error = envelopeError;
    return outcome;
  }

  // Recorded even when resolution fails, so a blocked run still shows what the
  // CLI reported.
  outcome.observedModels = listObservedModels(envelope);

  try {
    const resolution = resolvePrimaryModel(envelope);
    outcome.resolvedPrimaryModel = resolution.primary;
    outcome.auxiliaryModels = resolution.auxiliary;

    assertNoSilentFallback({
      requestedModel: model,
      resolvedPrimaryModel: outcome.resolvedPrimaryModel,
      expectedFamily,
    });
    outcome.available = true;

    const payload = extractAgentPayload(envelope);
    if (validatePayload) {
      validatePayload(payload);
    } else {
      assertAgentPayload(payload, { expectedRole });
    }
    outcome.payload = payload;
    outcome.structuredOutput = true;
  } catch (error) {
    outcome.error = toReportableError(error);
  }

  return outcome;
}

function toReportableError(error) {
  if (error instanceof SpikeError) return { code: error.code, message: error.message };
  return { code: 'UNEXPECTED_ERROR', message: error?.message ?? String(error) };
}

function firstLine(text) {
  return (text || '').trim().split('\n')[0] ?? '';
}
