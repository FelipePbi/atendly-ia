/**
 * Unit tests for the Spike 0 invocation library.
 *
 * These cover the local logic only, using a fake child process — no real model
 * calls are made here. The real two-model invocation is the Spike's own final
 * validation (npm run ia-loop:spike) and is never simulated.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  AGENT_SCHEMA,
  SpikeError,
  assertAgentPayload,
  assertNoSilentFallback,
  buildArgs,
  extractAgentPayload,
  invokeAgent,
  listObservedModels,
  parseEnvelope,
  resolveClaudeExecutable,
  resolvePrimaryModel,
} from '../lib/claude-process.mjs';

/**
 * Builds a fake spawn() that emits the given stdout/stderr and exit code.
 * When `hang` is set the process never closes, so the timeout path can be tested.
 */
function fakeSpawn({ stdout = '', stderr = '', exitCode = 0, hang = false, onSpawn } = {}) {
  return (executable, args, options) => {
    onSpawn?.({ executable, args, options });

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      child.emit('close', null);
      return true;
    };

    if (!hang) {
      setImmediate(() => {
        if (stdout) child.stdout.emit('data', stdout);
        if (stderr) child.stderr.emit('data', stderr);
        child.emit('close', exitCode);
      });
    }
    return child;
  };
}

/** Per-model usage entry, in the camelCase shape the CLI uses. */
function modelUsage({ input = 0, output = 0, cacheRead = 0, cacheCreation = 0 } = {}) {
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadInputTokens: cacheRead,
    cacheCreationInputTokens: cacheCreation,
  };
}

/** Top-level usage, in the snake_case shape the CLI uses. */
function topLevelUsage({ input = 0, output = 0, cacheRead = 0, cacheCreation = 0 } = {}) {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheCreation,
  };
}

/**
 * Mirrors the real envelope observed on the host: a primary model whose usage
 * matches the top-level totals, plus Haiku as an internal auxiliary model.
 */
function envelope({
  result,
  usage = topLevelUsage(),
  models = {},
  isError = false,
  omitUsage = false,
  omitModelUsage = false,
}) {
  const payload = {
    type: 'result',
    subtype: 'success',
    is_error: isError,
    result,
  };
  if (!omitUsage) payload.usage = usage;
  if (!omitModelUsage) payload.modelUsage = models;
  return JSON.stringify(payload);
}

// Real numbers captured from the authenticated host runs.
const OPUS_USAGE = { input: 2, output: 15, cacheRead: 15175, cacheCreation: 10113 };
const FABLE_USAGE = { input: 2, output: 18, cacheRead: 15177, cacheCreation: 10775 };
const HAIKU_AUX_USAGE = { input: 4, output: 7, cacheRead: 0, cacheCreation: 321 };

const HAIKU = 'claude-haiku-4-5-20251001';
const OPUS = 'claude-opus-5';
const FABLE = 'claude-fable-5-1';

const TECH_LEAD = {
  executable: 'claude',
  model: FABLE,
  expectedFamily: 'fable',
  expectedRole: 'tech_lead',
  prompt: 'return the json',
  cwd: '.',
  sessionId: '00000000-0000-4000-8000-000000000000',
};

const DEVELOPER = {
  ...TECH_LEAD,
  model: OPUS,
  expectedFamily: 'opus',
  expectedRole: 'developer',
};

// ---------------------------------------------------------------------------
// Primary-model resolution: the point of this correction.
// ---------------------------------------------------------------------------

test('1. Opus primary with Haiku auxiliary passes and reports both roles correctly', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: '{"role":"developer","ok":true}',
        usage: topLevelUsage(OPUS_USAGE),
        models: { [HAIKU]: modelUsage(HAIKU_AUX_USAGE), [OPUS]: modelUsage(OPUS_USAGE) },
      }),
    }),
  });

  assert.equal(outcome.error, null);
  assert.equal(outcome.available, true);
  assert.equal(outcome.structuredOutput, true);
  assert.equal(outcome.resolvedPrimaryModel, OPUS);
  assert.deepEqual(outcome.auxiliaryModels, [HAIKU]);
  assert.deepEqual(outcome.observedModels, [HAIKU, OPUS]);
});

test('2. Fable primary with Haiku auxiliary passes', async () => {
  const outcome = await invokeAgent({
    ...TECH_LEAD,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: '{"role":"tech_lead","ok":true}',
        usage: topLevelUsage(FABLE_USAGE),
        models: { [HAIKU]: modelUsage(HAIKU_AUX_USAGE), [FABLE]: modelUsage(FABLE_USAGE) },
      }),
    }),
  });

  assert.equal(outcome.error, null);
  assert.equal(outcome.available, true);
  assert.equal(outcome.structuredOutput, true);
  assert.equal(outcome.resolvedPrimaryModel, FABLE);
  assert.deepEqual(outcome.auxiliaryModels, [HAIKU]);
});

test('3. requesting Opus but getting Haiku as primary is a detected fallback', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: '{"role":"developer","ok":true}',
        usage: topLevelUsage(HAIKU_AUX_USAGE),
        models: { [HAIKU]: modelUsage(HAIKU_AUX_USAGE) },
      }),
    }),
  });

  assert.equal(outcome.available, false);
  assert.equal(outcome.structuredOutput, false);
  assert.equal(outcome.error.code, 'MODEL_FALLBACK_DETECTED');
  assert.equal(outcome.resolvedPrimaryModel, HAIKU);
});

test('4. requesting Fable but getting Opus as primary is a detected fallback', async () => {
  const outcome = await invokeAgent({
    ...TECH_LEAD,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: '{"role":"tech_lead","ok":true}',
        usage: topLevelUsage(OPUS_USAGE),
        models: { [HAIKU]: modelUsage(HAIKU_AUX_USAGE), [OPUS]: modelUsage(OPUS_USAGE) },
      }),
    }),
  });

  assert.equal(outcome.available, false);
  assert.equal(outcome.error.code, 'MODEL_FALLBACK_DETECTED');
  assert.equal(outcome.resolvedPrimaryModel, OPUS);
});

test('5. a missing modelUsage leaves the primary unknown', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: '{"role":"developer","ok":true}',
        usage: topLevelUsage(OPUS_USAGE),
        omitModelUsage: true,
      }),
    }),
  });

  assert.equal(outcome.available, false);
  assert.equal(outcome.error.code, 'RESOLVED_MODEL_UNKNOWN');
  assert.equal(outcome.resolvedPrimaryModel, null);
});

test('6. no modelUsage entry matching the top-level usage leaves the primary unknown', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: '{"role":"developer","ok":true}',
        usage: topLevelUsage(OPUS_USAGE),
        // Only an auxiliary model is reported; nothing accounts for the totals.
        models: { [HAIKU]: modelUsage(HAIKU_AUX_USAGE) },
      }),
    }),
  });

  assert.equal(outcome.available, false);
  assert.equal(outcome.error.code, 'RESOLVED_MODEL_UNKNOWN');
  // The observation is still preserved for diagnosis.
  assert.deepEqual(outcome.observedModels, [HAIKU]);
});

test('7. two indistinguishable candidates fail closed as ambiguous', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: '{"role":"developer","ok":true}',
        usage: topLevelUsage(OPUS_USAGE),
        models: {
          [OPUS]: modelUsage(OPUS_USAGE),
          'claude-opus-5-clone': modelUsage(OPUS_USAGE),
        },
      }),
    }),
  });

  assert.equal(outcome.available, false);
  assert.equal(outcome.structuredOutput, false);
  assert.equal(outcome.error.code, 'RESOLVED_MODEL_AMBIGUOUS');
  assert.equal(outcome.resolvedPrimaryModel, null);
});

test('a missing top-level usage leaves the primary unknown', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: '{"role":"developer","ok":true}',
        omitUsage: true,
        models: { [OPUS]: modelUsage(OPUS_USAGE) },
      }),
    }),
  });

  assert.equal(outcome.error.code, 'RESOLVED_MODEL_UNKNOWN');
});

test('resolvePrimaryModel separates primary from auxiliary without a hardcoded allowlist', () => {
  const resolution = resolvePrimaryModel({
    usage: topLevelUsage(FABLE_USAGE),
    modelUsage: {
      [HAIKU]: modelUsage(HAIKU_AUX_USAGE),
      [FABLE]: modelUsage(FABLE_USAGE),
      'some-future-helper-model': modelUsage({ input: 1 }),
    },
  });

  assert.equal(resolution.primary, FABLE);
  // Any unknown auxiliary is tolerated as auxiliary, none is special-cased.
  assert.deepEqual(resolution.auxiliary, [HAIKU, 'some-future-helper-model']);
});

test('resolvePrimaryModel treats absent usage counters as zero rather than guessing', () => {
  const resolution = resolvePrimaryModel({
    usage: { input_tokens: 0, output_tokens: 5 },
    modelUsage: { [OPUS]: { outputTokens: 5 } },
  });

  assert.equal(resolution.primary, OPUS);
  assert.deepEqual(resolution.auxiliary, []);
});

test('listObservedModels reports raw ids without interpreting them', () => {
  assert.deepEqual(listObservedModels({ modelUsage: { [HAIKU]: {}, [OPUS]: {} } }), [HAIKU, OPUS]);
  assert.deepEqual(listObservedModels({}), []);
  assert.deepEqual(listObservedModels({ modelUsage: [] }), []);
});

// ---------------------------------------------------------------------------
// Process-level safety. These must not weaken.
// ---------------------------------------------------------------------------

test('8. invalid envelope JSON is reported, not silently swallowed', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({ stdout: 'this is not json' }),
  });

  assert.equal(outcome.error.code, 'INVALID_ENVELOPE_JSON');
  assert.equal(outcome.structuredOutput, false);
});

test('8b. invalid agent JSON inside a valid envelope is reported', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: 'sure! here is your json',
        usage: topLevelUsage(OPUS_USAGE),
        models: { [OPUS]: modelUsage(OPUS_USAGE) },
      }),
    }),
  });

  // The model was selected correctly; only the payload is unusable.
  assert.equal(outcome.available, true);
  assert.equal(outcome.structuredOutput, false);
  assert.equal(outcome.error.code, 'INVALID_AGENT_JSON');
});

test('9. wrong role fails validation', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: '{"role":"tech_lead","ok":true}',
        usage: topLevelUsage(OPUS_USAGE),
        models: { [OPUS]: modelUsage(OPUS_USAGE) },
      }),
    }),
  });

  assert.equal(outcome.structuredOutput, false);
  assert.equal(outcome.error.code, 'ROLE_MISMATCH');
});

test('9b. ok:false fails validation', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({
      stdout: envelope({
        result: '{"role":"developer","ok":false}',
        usage: topLevelUsage(OPUS_USAGE),
        models: { [OPUS]: modelUsage(OPUS_USAGE) },
      }),
    }),
  });

  assert.equal(outcome.structuredOutput, false);
  assert.equal(outcome.error.code, 'OK_NOT_TRUE');
});

test('10. timeout kills the subprocess and reports TIMEOUT', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    timeoutMs: 25,
    spawnFn: fakeSpawn({ hang: true }),
  });

  assert.equal(outcome.error.code, 'TIMEOUT');
  assert.equal(outcome.available, false);
  assert.equal(outcome.structuredOutput, false);
});

test('non-zero exit is reported and never treated as success', async () => {
  const outcome = await invokeAgent({
    ...DEVELOPER,
    spawnFn: fakeSpawn({
      exitCode: 1,
      stdout: envelope({ result: 'Not logged in · Please run /login', isError: true }),
    }),
  });

  assert.equal(outcome.available, false);
  assert.equal(outcome.structuredOutput, false);
  assert.equal(outcome.error.code, 'NON_ZERO_EXIT');
  assert.match(outcome.error.message, /Not logged in/);
});

test('a missing executable surfaces EXECUTABLE_NOT_FOUND', async () => {
  const spawnFn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    setImmediate(() => {
      const error = new Error('spawn claude ENOENT');
      error.code = 'ENOENT';
      child.emit('error', error);
    });
    return child;
  };

  const outcome = await invokeAgent({ ...DEVELOPER, spawnFn });
  assert.equal(outcome.error.code, 'EXECUTABLE_NOT_FOUND');
});

test('result delivered as an object rather than a JSON string still validates', async () => {
  const stdout = JSON.stringify({
    is_error: false,
    result: { role: 'developer', ok: true },
    usage: topLevelUsage(OPUS_USAGE),
    modelUsage: { [OPUS]: modelUsage(OPUS_USAGE) },
  });
  const outcome = await invokeAgent({ ...DEVELOPER, spawnFn: fakeSpawn({ stdout }) });

  assert.equal(outcome.structuredOutput, true);
  assert.equal(outcome.error, null);
});

test('buildArgs enforces isolation and never bypasses permissions', () => {
  const args = buildArgs({
    prompt: 'p',
    model: FABLE,
    jsonSchema: AGENT_SCHEMA,
    sessionId: 'abc',
  });

  assert.ok(args.includes('--print'));
  assert.ok(args.includes('--no-session-persistence'));
  assert.equal(args[args.indexOf('--permission-prompts') + 1], 'none');
  // Empty --tools removes every built-in tool.
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--model') + 1], FABLE);
  assert.equal(args[args.indexOf('--session-id') + 1], 'abc');
  for (const forbidden of ['--dangerously-skip-permissions', '--allow-dangerously-skip-permissions', '--fallback-model']) {
    assert.ok(!args.includes(forbidden), `${forbidden} must never be used`);
  }
});

test('buildArgs rejects incomplete input', () => {
  assert.throws(() => buildArgs({ model: FABLE, sessionId: 'a' }), SpikeError);
  assert.throws(() => buildArgs({ prompt: 'p', sessionId: 'a' }), SpikeError);
});

test('each agent runs in its own session id', async () => {
  const seen = [];
  const spawnFn = fakeSpawn({
    stdout: envelope({
      result: '{"role":"developer","ok":true}',
      usage: topLevelUsage(OPUS_USAGE),
      models: { [OPUS]: modelUsage(OPUS_USAGE) },
    }),
    onSpawn: ({ args }) => seen.push(args[args.indexOf('--session-id') + 1]),
  });

  await invokeAgent({ ...DEVELOPER, sessionId: undefined, spawnFn });
  await invokeAgent({ ...DEVELOPER, sessionId: undefined, spawnFn });

  assert.equal(seen.length, 2);
  assert.notEqual(seen[0], seen[1]);
});

test('parseEnvelope rejects empty and non-object output', () => {
  assert.throws(() => parseEnvelope('   '), (e) => e.code === 'EMPTY_OUTPUT');
  assert.throws(() => parseEnvelope('[1,2]'), (e) => e.code === 'INVALID_ENVELOPE_JSON');
});

test('extractAgentPayload surfaces a CLI-reported error', () => {
  assert.throws(
    () => extractAgentPayload({ is_error: true, result: 'Not logged in' }),
    (e) => e.code === 'CLI_REPORTED_ERROR',
  );
});

test('assertNoSilentFallback accepts a matching family and rejects a substitution', () => {
  assert.equal(
    assertNoSilentFallback({
      requestedModel: OPUS,
      resolvedPrimaryModel: OPUS,
      expectedFamily: 'opus',
    }),
    OPUS,
  );

  assert.throws(
    () => assertNoSilentFallback({
      requestedModel: OPUS,
      resolvedPrimaryModel: HAIKU,
      expectedFamily: 'opus',
    }),
    (e) => e.code === 'MODEL_FALLBACK_DETECTED',
  );

  assert.throws(
    () => assertNoSilentFallback({
      requestedModel: OPUS,
      resolvedPrimaryModel: null,
      expectedFamily: 'opus',
    }),
    (e) => e.code === 'RESOLVED_MODEL_UNKNOWN',
  );
});

test('assertAgentPayload rejects non-object payloads', () => {
  assert.throws(() => assertAgentPayload('nope', { expectedRole: 'developer' }), (e) => e.code === 'INVALID_AGENT_SHAPE');
  assert.throws(() => assertAgentPayload(null, { expectedRole: 'developer' }), (e) => e.code === 'INVALID_AGENT_SHAPE');
});

test('resolveClaudeExecutable honours an explicit override and rejects a missing one', () => {
  const fs = { existsSync: (p) => p === 'C:/fake/claude.exe', readdirSync: () => [] };

  assert.deepEqual(
    resolveClaudeExecutable({ IA_LOOP_CLAUDE_BIN: 'C:/fake/claude.exe' }, { fs }),
    { path: 'C:/fake/claude.exe', source: 'IA_LOOP_CLAUDE_BIN' },
  );

  assert.throws(
    () => resolveClaudeExecutable({ IA_LOOP_CLAUDE_BIN: 'C:/missing/claude.exe' }, { fs }),
    (e) => e.code === 'EXECUTABLE_NOT_FOUND',
  );
});

test('resolveClaudeExecutable fails cleanly when nothing is installed', () => {
  const fs = { existsSync: () => false, readdirSync: () => [] };
  assert.throws(
    () => resolveClaudeExecutable({ PATH: '/usr/bin' }, { fs }),
    (e) => e.code === 'EXECUTABLE_NOT_FOUND',
  );
});
