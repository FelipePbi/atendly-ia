/**
 * IA Loop — review packet.
 *
 * Builds what the Tech Lead receives after a real implementation. Every fact in
 * it is collected by the orchestrator from git, not taken from the Developer's
 * own claims: the repository is the authority on what changed.
 *
 * The functional diff is measured against `worktreeInitialHead`, NOT against
 * `migrationAcceptedBaseline`. Between the accepted baseline and the execution
 * base there are legitimate commits (IA Loop tooling, the Goal document, the
 * Tech Lead handoff) that are not part of this Goal's implementation. Both
 * baselines travel in the packet so the reviewer can tell them apart.
 */

import { SpikeError } from './claude-process.mjs';

/** Diff kept inline in the packet; the full diff stays on disk. */
const INLINE_DIFF_LIMIT = 200_000;

export function buildReviewPacket({
  goal,
  goalPath,
  round,
  reviewLevel,
  migrationAcceptedBaseline,
  executionBase,
  worktreeInitialHead,
  worktreePath,
  changes,
  developerResult,
  previousBlockers = [],
  diffPath = null,
}) {
  if (!goal) throw new SpikeError('INVALID_ARGS', 'goal is required');
  if (!worktreeInitialHead) throw new SpikeError('INVALID_ARGS', 'worktreeInitialHead is required');
  if (!changes) throw new SpikeError('INVALID_ARGS', 'collected changes are required');

  const inlineDiff = changes.diff.length > INLINE_DIFF_LIMIT
    ? `${changes.diff.slice(0, INLINE_DIFF_LIMIT)}\n\n[diff truncado — leia o arquivo completo em ${diffPath ?? 'diff.patch'}]`
    : changes.diff;

  return Object.freeze({
    goal,
    goalPath,
    round,
    reviewLevel,

    // Two distinct concepts, never collapsed.
    migrationAcceptedBaseline,
    executionBase,
    worktreeInitialHead,
    baselineNote:
      'migrationAcceptedBaseline é o último Goal funcional aceito. worktreeInitialHead/executionBase '
      + 'é a base imediata desta implementação. O review funcional deve focar no diff '
      + 'worktreeInitialHead → estado atual da worktree, que é o que este Goal produziu.',

    worktreePath,

    // Collected from git by the orchestrator.
    changedFiles: Object.freeze([...changes.changedFiles]),
    untrackedFiles: Object.freeze([...changes.untracked]),
    diffStat: changes.diffStat,
    diff: inlineDiff,
    diffTruncated: changes.diffTruncated || changes.diff.length > INLINE_DIFF_LIMIT,
    diffPath,
    commitsInWorktree: Object.freeze([...changes.commits]),

    // Reported by the Developer. May point at evidence, never replaces it.
    implementationReport: developerResult?.implementationReport ?? '',
    developerSummary: developerResult?.summary ?? '',
    validations: Object.freeze([...(developerResult?.validations ?? [])]),
    developerResult,

    previousBlockers: Object.freeze([...previousBlockers]),
  });
}

/**
 * Renders the packet for the reviewer prompt.
 *
 * The diff is handed over as a path to read rather than pasted whole when it is
 * large, so the reviewer inspects the real file.
 */
export function renderReviewPrompt(packet) {
  return [
    'Você está atuando como Tech Lead revisando a implementação real de um Goal do Atendly.',
    '',
    `Goal: ${packet.goal} — leia ${packet.goalPath}. Ele é a autorização e o critério.`,
    `Round: ${packet.round}. Review level: ${packet.reviewLevel}.`,
    '',
    'Baselines (não confunda as duas):',
    `- migrationAcceptedBaseline: ${packet.migrationAcceptedBaseline}`,
    `- worktreeInitialHead (base desta implementação): ${packet.worktreeInitialHead}`,
    packet.baselineNote,
    '',
    `Worktree sob review: ${packet.worktreePath}`,
    `Arquivos alterados (${packet.changedFiles.length}), coletados do git pelo orchestrator:`,
    packet.changedFiles.map((f) => `  - ${f}`).join('\n') || '  (nenhum)',
    '',
    'Diff stat:',
    packet.diffStat || '(vazio)',
    '',
    packet.diffPath
      ? `O diff completo está em ${packet.diffPath}. Leia-o e inspecione os arquivos alterados na worktree.`
      : 'Diff:',
    packet.diffPath ? '' : packet.diff,
    '',
    'Relatório de implementação do Developer (evidência declarada, não substitui inspeção):',
    packet.implementationReport || '(vazio)',
    '',
    'Validações declaradas:',
    JSON.stringify(packet.validations, null, 2),
    '',
    packet.previousBlockers.length > 0
      ? `Blockers da rodada anterior:\n${packet.previousBlockers.map((b) => `  - ${b}`).join('\n')}`
      : 'Blockers anteriores: nenhum (primeira rodada).',
    '',
    'Faça um review DEEP dirigido, conforme o próprio Goal exige:',
    '- inspecione o diff real e os arquivos alterados;',
    '- abra callers/consumers diretamente relacionados quando necessário;',
    '- rode verificações dirigidas se precisar de evidência;',
    '- use Graphify seletivamente para confirmar impacto.',
    '',
    'NÃO repita a auditoria global do Goal0, não leia o Product Vault inteiro, não faça discovery global',
    'e NÃO edite nenhum arquivo: você é read-only nesta etapa.',
    '',
    'Retorne exclusivamente o JSON do contrato ReviewDecision.',
    'Em CHANGES_REQUIRED, cada blocker deve ser específico e acionável.',
  ].join('\n');
}
