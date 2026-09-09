/**
 * IA Loop — the durable Goal → execution plan hand-off.
 *
 * The Tech Lead writes the plan during the PLANNING call that also writes the
 * next Goal. The Goal is executed later, by a different process, possibly days
 * later and certainly after a restart. Something has to carry the plan across
 * that gap, and it must be the same something for every reader — otherwise the
 * plan gets re-derived, and a re-derived plan is a different plan.
 *
 * Deliberately shaped like `createDeveloperProfileStore`: same directory, same
 * atomic write, same "read returns null when nothing was recorded". The two
 * hand-offs have the same lifetime and the same failure modes, so they should
 * not have two different mechanisms.
 *
 * The plan is stored EXACTLY as the Tech Lead produced it, unvalidated and
 * un-normalised. Validation happens at read time, against the validator of the
 * process that is about to execute it — storing a normalised plan would freeze
 * one version of the normaliser into the record, and a later fix to it would
 * silently not apply to plans already on disk.
 */

import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { SpikeError } from './claude-process.mjs';
import { validateExecutionPlan } from './work-units.mjs';

export function createExecutionPlanStore(stateDir) {
  const path = join(stateDir, 'execution-plans.json');

  async function readAll() {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new SpikeError('FILE_UNREADABLE', `Cannot read ${path}: ${error.message}`);
    }
  }

  return {
    path,

    /** The raw record as it was written, or null. */
    async readRaw(goalId) {
      const all = await readAll();
      return all[goalId] ?? null;
    },

    /**
     * The validated, normalised plan for a Goal, or null when none was
     * recorded.
     *
     * A recorded plan that no longer validates is an ERROR, never a silent
     * null: "the Tech Lead wrote a plan and it has a cycle" and "the Tech Lead
     * wrote no plan" must not lead to the same place, because only one of them
     * is a reason to fall back to a single unit.
     */
    async read(goalId) {
      const record = await this.readRaw(goalId);
      if (!record?.plan) return null;
      return validateExecutionPlan(record.plan, { goal: goalId });
    },

    /** Records the plan the planning call produced for a Goal not yet started. */
    async write(goalId, { plan, selectedBy = 'tech_lead', stage = 'planning', source = 'TECH_LEAD_PLAN' }) {
      // Validated before it is written, so a plan that could never execute is
      // refused by the process that still has the context to say why.
      const validated = validateExecutionPlan(plan, { goal: goalId });

      const all = await readAll();
      const record = {
        goal: goalId,
        selectedBy,
        stage,
        source,
        workUnitCount: validated.workUnits.length,
        types: validated.workUnits.reduce((counts, unit) => {
          counts[unit.type] = (counts[unit.type] ?? 0) + 1;
          return counts;
        }, {}),
        fragmentation: validated.fragmentation,
        at: new Date().toISOString(),
        plan: { ...plan, goal: goalId, source },
      };

      await mkdir(stateDir, { recursive: true });
      const temporary = `${path}.${randomUUID().slice(0, 8)}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ ...all, [goalId]: record }, null, 2)}\n`, 'utf8');
      await rename(temporary, path);
      return record;
    },
  };
}

/**
 * The Work Unit tier that carries a resolved Developer profile's intent.
 *
 * The profile mechanism and the Work Unit tiers are two vocabularies for the
 * same judgement — "how hard is this?" — and a round that falls back to a
 * single unit has to translate between them or lose the answer. Opus-family
 * profiles were only ever chosen for work someone thought was genuinely hard,
 * which is what COMPLEX means; everything else is ordinary execution.
 *
 * Deliberately a TYPE, not a model: the router still decides which model runs.
 */
export function unitTypeForProfile(profileName) {
  if (typeof profileName !== 'string') return { type: 'STANDARD', reason: null };
  if (/^OPUS|^LEGACY_OPUS/.test(profileName)) {
    return {
      type: 'COMPLEX',
      reason: `O Tech Lead havia escolhido ${profileName} para esta rodada; a unidade é declarada COMPLEX `
        + 'para preservar esse julgamento sem que o plano nomeie um modelo.',
    };
  }
  return { type: 'STANDARD', reason: null };
}

/** Why a round is running a single-unit plan rather than a planned DAG. */
export const SINGLE_UNIT_PLAN_SOURCES = Object.freeze({
  /** A correction round: the blockers are the authority, not the Goal's plan. */
  CORRECTION: 'CORRECTION_ROUND_SINGLE_UNIT',
  /** A Goal planned before execution plans existed. */
  COMPATIBILITY: 'FALLBACK_SINGLE_STANDARD_UNIT',
});

/**
 * The plan a round runs when there is no per-unit DAG for it.
 *
 * Two different situations land here, and neither is a defect.
 *
 * A CORRECTION round has no planned DAG by construction: what a correction
 * must do is decided by the review that produced the blockers, hours after the
 * plan was written. Its plan is one STANDARD unit scoped to those blockers —
 * which is exactly the legacy correction round, expressed in the new
 * vocabulary. Splitting blockers into separate units would be the harness
 * guessing that they are independent, and a wrong guess there produces two
 * units editing the same code with half the context each.
 *
 * A Goal planned BEFORE execution plans existed is the compatibility case.
 * Falling back to the legacy Developer path would preserve every invariant
 * trivially, but would mean the new pipeline never runs for any Goal that
 * exists today. So it too becomes one STANDARD unit covering the whole Goal:
 * behaviourally the old path — one Sonnet call, the full Goal as its scope —
 * while the DAG, the router, the store and the aggregate report are all
 * exercised.
 *
 * No deterministic verification units are synthesised in either case.
 * Inventing verification steps a planner never asked for would be this
 * function deciding what the Goal's gate is, and it has no basis for that.
 */
export function fallbackExecutionPlan({
  goal,
  round,
  blockers = [],
  goalSummary = null,
  /**
   * The tier the single unit is declared at.
   *
   * This is how a Tech Lead escalation survives the switch to Work Unit
   * execution. Under the previous architecture the reviewer could say "the
   * next correction round needs Opus" by naming a Developer profile, and the
   * round ran on it. A single-unit plan that ignored that would silently
   * downgrade a decision a reviewer made with the failure in front of it.
   *
   * It is translated, not obeyed: the caller derives a TYPE from the profile
   * that was resolved for the round, and the router decides the model from the
   * type as it does for every other unit. The Tech Lead's judgement is
   * preserved; its authority over model ids is not restored.
   */
  unitType = 'STANDARD',
  unitTypeReason = null,
}) {
  const isCorrection = blockers.length > 0;

  return validateExecutionPlan({
    goal,
    goalSummary,
    executionStrategy: [
      isCorrection
        ? `Correction round: the blockers from the previous review are the authority, so this round is one `
          + `${unitType} unit scoped to them — behaviourally the legacy correction round.`
        : `Compatibility fallback: this Goal was planned before execution plans existed, so the round is one `
          + `${unitType} unit scoped to the whole Goal — behaviourally the legacy implementation round.`,
      unitTypeReason,
    ].filter(Boolean).join(' '),
    source: isCorrection ? SINGLE_UNIT_PLAN_SOURCES.CORRECTION : SINGLE_UNIT_PLAN_SOURCES.COMPATIBILITY,
    workUnits: [
      {
        id: isCorrection ? 'FIX-001' : 'WU-001',
        title: isCorrection ? `Corrigir os blockers da rodada ${round}` : `Implementar o Goal ${goal}`,
        objective: isCorrection
          ? `Corrigir exclusivamente os ${blockers.length} blocker(s) registrados pelo Tech Lead na revisão `
            + `da rodada ${round - 1}, preservando o que já foi aceito.`
          : `Implementar o Goal ${goal} conforme o próprio documento do Goal, que é a autorização e o critério.`,
        type: unitType,
        // A single unit standing in for a whole round is never LOW: its scope
        // is the Goal, or every blocker the reviewer raised.
        complexity: unitType === 'COMPLEX' ? 'HIGH' : 'MEDIUM',
        risk: 'MEDIUM',
        dependencies: [],
        acceptanceCriteria: isCorrection
          ? blockers.map((blocker, index) => `Blocker ${index + 1} resolvido: ${String(blocker).slice(0, 400)}`)
          : ['Todos os critérios de aceite do documento do Goal estão atendidos e verificados.'],
      },
    ],
  }, { goal });
}
