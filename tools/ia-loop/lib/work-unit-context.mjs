/**
 * IA Loop — the context ONE Work Unit receives.
 *
 * This is the half of the architecture that saves the most and is the easiest
 * to get wrong, so it is worth being explicit about what it refuses to do.
 *
 * Under the monolithic Developer, every call carried the whole Goal: the full
 * Goal document, the whole change surface, the previous round's report, and
 * whatever else was lying around. That is correct and expensive. It is also
 * unnecessary for a unit whose job is "create the notification types".
 *
 * So a packet carries, and ONLY carries:
 *
 *   goalSummary               a few lines, so the unit knows what it is part of
 *   workUnit                  objective, type, acceptance criteria, hints
 *   dependenciesCompleted     a SUMMARY of each dependency, never its logs
 *   relevantFiles             the plan's pointers, plus files the dependencies
 *                             actually changed
 *   constraints               what may not be done, which is not negotiable
 *   previousRelevantFailures  this unit's OWN earlier attempts, nobody else's
 *   expandedContext           files an earlier attempt of this unit asked for
 *
 * Deliberately NOT carried: the Goal document's body, other units' reports,
 * the full attempt history of the round, the review packet, the diff, the
 * event log, the previous round's implementation report.
 *
 * `goalPath` IS carried, and that is not a loophole. The unit is told where
 * the Goal is so that legitimate exploration stays possible — the rule is
 * "small context first, expand when needed", not "you may not look". What the
 * packet stops is the DEFAULT of shipping everything to everyone.
 */

import { SpikeError } from './claude-process.mjs';

/** Lines of the Goal document used to build the summary handed to a unit. */
export const GOAL_SUMMARY_CHARS = 1200;

/** Upper bound on how many file pointers one packet carries. */
export const MAX_RELEVANT_FILES = 40;

/**
 * How many times one unit may ask for more context before the harness stops
 * believing the answer is more files.
 *
 * A unit that has asked twice and still cannot proceed is not short of
 * context; it is either mis-specified or under-tiered, and both of those are
 * answered somewhere else — by the plan, or by an escalation.
 */
export const MAX_CONTEXT_EXPANSIONS = 2;

/**
 * What every unit is told it may not do.
 *
 * Identical in substance to the Developer's own prohibitions, restated here
 * because a unit never sees the round-level prompt. They are the guardrails
 * the orchestrator verifies against git afterwards, so a unit that has not
 * been told them can still break the run.
 */
export const WORK_UNIT_CONSTRAINTS = Object.freeze([
  'Trabalhe exclusivamente dentro da worktree indicada.',
  'Não crie commit, push, merge ou PR; não mude de branch; não altere o checkout principal.',
  'Não edite documentos de controle da migração (goals/, reviews/, MIGRATION_STATUS.md).',
  'Não declare o Goal ACCEPTED e não crie o próximo Goal.',
  'Não amplie o escopo desta Work Unit: outras unidades do plano cuidam do resto.',
  'Não reverta nem reimplemente trabalho de outra Work Unit já concluída.',
]);

function fail(code, message, details = {}) {
  throw new SpikeError(code, message, details);
}

/** Keeps a file list bounded, ordered and free of duplicates. */
function boundedFiles(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    for (const file of group ?? []) {
      if (typeof file !== 'string' || file.trim() === '') continue;
      const value = file.trim();
      if (seen.has(value)) continue;
      seen.add(value);
      out.push(value);
      if (out.length >= MAX_RELEVANT_FILES) return out;
    }
  }
  return out;
}

/**
 * What a dependency hands downstream.
 *
 * A summary and the files it changed — never its full report, never its logs,
 * never its attempt history. A unit that needs more than this about a
 * dependency can read the files, which are named right here.
 */
export function summarizeDependencyResult(unitId, record) {
  return Object.freeze({
    id: unitId,
    status: record?.state ?? 'COMPLETED',
    summary: typeof record?.summary === 'string' ? record.summary.slice(0, 400) : null,
    changedFiles: Object.freeze([...(record?.changedFiles ?? [])].slice(0, 20)),
  });
}

/**
 * Builds the packet for one attempt at one Work Unit.
 *
 * `expansions` are the files earlier attempts of THIS unit asked for and were
 * granted. They are carried separately from `relevantFiles` on purpose: the
 * difference between "what the plan thought this needed" and "what it turned
 * out to need" is exactly the measurement that tells you whether the slicing
 * is too aggressive.
 */
export function buildWorkUnitContextPacket({
  goal,
  goalPath,
  goalSummary,
  round,
  unit,
  worktree,
  dependencyResults = new Map(),
  previousFailures = [],
  expansions = [],
  executionStrategy = null,
}) {
  if (!goal) fail('INVALID_ARGS', 'goal is required');
  if (!unit?.id) fail('INVALID_ARGS', 'a Work Unit is required');
  if (!Number.isInteger(round) || round < 1) fail('INVALID_ARGS', 'round must be an integer >= 1');

  const dependenciesCompleted = unit.dependencies.map((dependencyId) => summarizeDependencyResult(
    dependencyId,
    dependencyResults.get(dependencyId) ?? null,
  ));

  const relevantFiles = boundedFiles(
    unit.expectedFiles,
    unit.relevantFiles,
    // A dependency's output is the most reliable pointer there is: it is what
    // the previous unit actually wrote, not what the plan guessed it would.
    ...dependenciesCompleted.map((dependency) => dependency.changedFiles),
  );

  return Object.freeze({
    role: 'developer',
    scope: 'WORK_UNIT',
    goal,
    goalPath,
    round,

    // A few lines, not the document. The unit is told where the document is.
    goalSummary: typeof goalSummary === 'string' ? goalSummary.slice(0, GOAL_SUMMARY_CHARS) : null,
    executionStrategy: typeof executionStrategy === 'string' ? executionStrategy.slice(0, 600) : null,

    workUnit: Object.freeze({
      id: unit.id,
      title: unit.title,
      objective: unit.objective,
      type: unit.type,
      complexity: unit.complexity,
      risk: unit.risk,
      acceptanceCriteria: Object.freeze([...unit.acceptanceCriteria]),
      expectedFiles: Object.freeze([...unit.expectedFiles]),
      implementationHints: unit.implementationHints,
      // Recorded so a merged unit's answer can still be traced back to the
      // units the planner originally declared.
      mergedFrom: Object.freeze([...(unit.mergedFrom ?? [])]),
    }),

    dependenciesCompleted: Object.freeze(dependenciesCompleted),
    relevantFiles: Object.freeze(relevantFiles),
    expandedContext: Object.freeze([...expansions]),

    worktree,
    constraints: WORK_UNIT_CONSTRAINTS,

    // This unit's own earlier attempts only. Another unit's failure is not
    // this unit's business, and shipping it here is how a small context
    // quietly becomes the whole round again.
    previousRelevantFailures: Object.freeze(previousFailures.slice(-3).map((failure) => Object.freeze({
      attempt: failure.attempt ?? null,
      model: failure.model ?? null,
      reason: failure.reason ?? null,
      detail: typeof failure.detail === 'string' ? failure.detail.slice(0, 600) : null,
    }))),

    consultSelectively: Object.freeze([
      'graphify query "<pergunta>" --budget 800 para call paths e impacto',
      'os arquivos listados em relevantFiles, antes de procurar outros',
      `o Goal completo em ${goalPath}, se e somente se os critérios desta unidade não bastarem`,
    ]),
  });
}

/**
 * The prompt for one Work Unit.
 *
 * Generic on purpose: everything Goal-specific and unit-specific arrives
 * inside the structured packet, exactly as it does for the round-level
 * Developer. The only thing this text does is say what the packet means and
 * what shape the answer must take.
 */
export function buildWorkUnitPrompt(context, job) {
  return [
    'Você está atuando como Developer em um pipeline automatizado do Atendly.',
    `Esta é UMA Work Unit (${context.workUnit.id}) do plano de execução do Goal ${context.goal},`,
    `rodada ${context.round}. Ela é parte de um DAG: outras unidades cuidam do resto.`,
    '',
    'Contexto explícito desta unidade (não há conversa anterior; nada foi dito antes):',
    JSON.stringify(context, null, 2),
    '',
    `Trabalhe exclusivamente dentro de: ${job.worktree}`,
    '',
    'O contexto acima é DELIBERADAMENTE reduzido ao que esta unidade precisa.',
    'Comece pelos arquivos em relevantFiles. Você PODE abrir outros arquivos e usar Graphify',
    'quando precisar — exploração legítima não é proibida.',
    '',
    'Se, e somente se, faltar contexto que você não consegue obter sozinho, responda com',
    'status "CONTEXT_EXPANSION_REQUIRED" e um contextRequest nomeando os arquivos que faltam.',
    'Isso não é falha: é como o harness aprende que o recorte foi estreito demais.',
    '',
    'Se a unidade se revelar mais difícil do que o plano classificou, responda com status',
    '"ESCALATION_REQUIRED" e uma escalation com evidência concreta. Confiança sozinha não é',
    'evidência e será recusada pelo router.',
    '',
    'Restrições (o orchestrator verifica no Git depois; violação encerra a execução):',
    ...context.constraints.map((constraint) => `- ${constraint}`),
    '',
    'Ao terminar, retorne exclusivamente o JSON do contrato WorkUnitResult, com:',
    '- protocolVersion: 2;',
    `- jobId: exatamente "${job.jobId}"; goal: "${job.goal}"; round: ${job.round};`,
    `- workUnitId: "${context.workUnit.id}";`,
    '- status: "COMPLETED" se entregou a unidade inteira; "BLOCKED" se não pôde prosseguir;',
    '- summary: uma frase;',
    '- report: o que mudou, por quê, e os comandos que você realmente executou com resultado;',
    '- changedFiles: os arquivos que você alterou (o orchestrator confere no git);',
    '- acceptance: um item por critério de acceptanceCriteria, na ordem, com met true/false',
    '  e detail apontando a evidência. Só declare COMPLETED se todos estiverem met: true.',
    '',
    'Não invente resultado de validação que você não executou.',
  ].join('\n');
}

/**
 * Applies a granted context expansion.
 *
 * Returns the new expansion list, capped, deduplicated and with anything the
 * unit already had removed — a "new" file the packet already carried is not an
 * expansion, and counting it as one would make the slicing look worse than it
 * is.
 */
export function applyContextExpansion({ current = [], request, unit }) {
  const already = new Set([...(unit?.expectedFiles ?? []), ...(unit?.relevantFiles ?? []), ...current]);
  const added = (request?.files ?? []).filter((file) => !already.has(file));
  return {
    expansions: [...current, ...added].slice(0, MAX_RELEVANT_FILES),
    added,
    redundant: (request?.files ?? []).filter((file) => already.has(file)),
  };
}
