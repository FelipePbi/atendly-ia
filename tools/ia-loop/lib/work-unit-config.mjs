/**
 * IA Loop — Work Unit execution configuration and its feature flag.
 *
 * Decomposing a Goal into a DAG changes what the Developer stage IS, so it
 * ships behind a switch. With the flag off, `workers/developer.mjs` runs
 * exactly the code it ran before — one job, one call, one report — and every
 * invariant proven for that path is untouched. With it on, the same job is
 * executed as a plan of Work Units and the SAME DeveloperResult is published
 * at the end, so nothing downstream of the Developer needs to know which path
 * produced it.
 *
 * That equivalence is the whole reason the flag was safe to flip: Work Unit
 * execution, the deterministic units, and the MECHANICAL→Haiku / STANDARD→
 * Sonnet / COMPLEX→Opus routing have run and been validated, so this is now
 * how Goals run. Rolling back is `IA_LOOP_WORK_UNIT_EXECUTION=0`, not a revert.
 *
 * The model policy is NOT here. It lives in `model-routing.mjs` with every
 * other model decision, and a second place to configure models is exactly what
 * centralising it was meant to prevent. What lives here is the loop's own
 * budget: how many expansions, how many fix units, how long a unit may run.
 */

/** Environment variable that turns the new execution path on. */
export const WORK_UNIT_EXECUTION_FLAG = 'IA_LOOP_WORK_UNIT_EXECUTION';

function envFlag(name, fallback, env) {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (raw === '') return fallback;
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

function envInt(name, fallback, env) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * Whether this process executes Goals as Work Unit DAGs.
 *
 * Defaults to ON: this is the standard execution path. Set
 * `IA_LOOP_WORK_UNIT_EXECUTION=0` (or `false`/`off`/`no`) for an explicit,
 * temporary rollback to the legacy one-job-one-call Developer — never assumed,
 * always a deliberate operator choice.
 */
export function isWorkUnitExecutionEnabled(env = process.env) {
  return envFlag(WORK_UNIT_EXECUTION_FLAG, true, env);
}

export function workUnitConfig(env = process.env) {
  return Object.freeze({
    enabled: isWorkUnitExecutionEnabled(env),

    /**
     * How many times ONE unit may ask for more context.
     *
     * A unit that has asked twice and still cannot proceed is not short of
     * files; it is mis-specified or under-tiered, and both are answered
     * elsewhere. Set to 0 to prove context slicing in isolation.
     */
    maxContextExpansions: envInt('IA_LOOP_WU_MAX_CONTEXT_EXPANSIONS', 2, env),

    /**
     * How many corrective units one failed verification may produce.
     *
     * Bounded because the failure mode is a loop: a fix that does not fix
     * spawns another fix. Two is enough for "the fix was slightly wrong once";
     * beyond that the round has learned something the reviewer should see.
     */
    maxFixUnitsPerVerification: envInt('IA_LOOP_WU_MAX_FIX_UNITS', 2, env),

    /** Total corrective units a single round may add to its plan. */
    maxFixUnitsPerRound: envInt('IA_LOOP_WU_MAX_FIX_UNITS_ROUND', 4, env),

    /** Wall clock for one Work Unit's model call. Shorter than a whole round's. */
    unitTimeoutMs: envInt('IA_LOOP_WU_TIMEOUT_MS', 90 * 60 * 1000, env),

    /**
     * Whether a compatibility fallback may run at all.
     *
     * On by default: a Goal planned before execution plans existed must not
     * simply refuse to run. Turning it off is how an operator says "I only
     * want Goals that carry a real plan", which is useful once every Goal
     * does.
     */
    allowCompatibilityFallback: envFlag('IA_LOOP_WU_ALLOW_FALLBACK', true, env),
  });
}
