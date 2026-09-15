/**
 * Vocabulario da remocao dos dados de teste (Goal019).
 *
 * Uma regra manda neste arquivo e ela vale mais do que a conveniencia:
 * **remove-se exatamente o que a execucao criou, pelos IDs que ela gravou no
 * momento da criacao.** Nunca por busca por telefone, nome, data ou padrao.
 * Uma linha que a execucao nao criou nao e tocada, nem que pareca de teste.
 *
 * A consequencia estrutural esta aqui: nao existe neste vocabulario nenhum
 * criterio de selecao que nao seja ID. Nao ha `phone`, `name`, `since`,
 * `pattern` nem `displayName` em nenhuma das formas abaixo — o caminho de
 * limpeza nao consegue expressar uma busca heuristica nem por engano.
 */

/** Espelha o enum Prisma `ActivationTestCleanupState` (schema.prisma). */
export type ActivationTestCleanupState = "PENDING" | "CLEAN" | "RESIDUAL";

/**
 * O que a limpeza remove, nomeado do ponto de vista do negocio.
 *
 * Conjunto fechado: alvo que nao esta aqui nao e removido pela limpeza, e
 * residuo de alvo que nao esta aqui nao e representavel.
 */
export type ActivationTestCleanupTarget =
  "MESSAGE" | "CONVERSATION" | "CONTACT" | "APPOINTMENT" | "CUSTOMER";

/**
 * Por que um dado de teste sobrou.
 *
 * `OPERATION_UNAVAILABLE` e a razao honesta para o que o produto **nao sabe
 * remover** com as operacoes que existem hoje; `WOULD_TOUCH_OTHER_ROWS` e a
 * remocao **recusada por esta limpeza**, porque apagar aquela linha arrastaria
 * junto, por cascade, linha que a execucao nao criou; `REMOVAL_FAILED` e a
 * tentativa que existiu e nao deu certo; `STILL_VISIBLE` e o caso em que a
 * remocao foi aceita mas o read model continua mostrando a linha. As quatro
 * sao residuo: a limpeza parcial nunca vira sucesso completo.
 */
export type ActivationTestResidueReason =
  | "OPERATION_UNAVAILABLE"
  | "WOULD_TOUCH_OTHER_ROWS"
  | "REMOVAL_FAILED"
  | "STILL_VISIBLE";

/** Um dado de teste que sobrou, com o ID que a execucao gravou. */
export interface ActivationTestResidueItem {
  target: ActivationTestCleanupTarget;
  /** ID gravado pela execucao. E por ele que a tela nomeia o que ficou. */
  id: string;
  reason: ActivationTestResidueReason;
  detail?: string;
}

/** Alvo em linguagem do negocio, para a tela dizer o que ficou. */
export const ACTIVATION_TEST_CLEANUP_TARGET_LABELS: Record<
  ActivationTestCleanupTarget,
  string
> = {
  MESSAGE: "mensagem da conversa de teste",
  CONVERSATION: "conversa de teste",
  CONTACT: "contato de teste",
  APPOINTMENT: "agendamento de teste",
  CUSTOMER: "pessoa de teste",
};

/** Razao em linguagem do negocio, para a tela explicar em vez de adivinhar. */
export const ACTIVATION_TEST_RESIDUE_REASON_LABELS: Record<
  ActivationTestResidueReason,
  string
> = {
  OPERATION_UNAVAILABLE:
    "nao existe operacao de remocao para este dado; ele precisa ser removido a mao",
  WOULD_TOUCH_OTHER_ROWS:
    "apagar este dado levaria junto linha que o teste nao criou, entao ele foi mantido",
  REMOVAL_FAILED: "a remocao foi tentada e nao foi concluida",
  STILL_VISIBLE: "a remocao foi aceita mas o dado continua visivel",
};

/**
 * Estado da limpeza a partir do residuo.
 *
 * `CLEAN` **so** com residuo vazio. Nao existe caminho que produza `CLEAN`
 * com sobra: limpeza parcial relatada como completa e falha de aceite, entao
 * ela nao e representavel aqui.
 */
export function activationTestCleanupState(
  residue: readonly ActivationTestResidueItem[],
): Exclude<ActivationTestCleanupState, "PENDING"> {
  return residue.length === 0 ? "CLEAN" : "RESIDUAL";
}

/**
 * Alvos que a limpeza **apaga**, por ID, no banco da IA.
 *
 * Agendamento e pessoa de teste ficam de fora deste conjunto de proposito: o
 * produto nao tem operacao de remocao definitiva para eles. O agendamento e
 * cancelado e conferido no read model; a pessoa e conferida na lista de
 * clientes. O que sobrar vira residuo, nunca uma remocao inventada.
 */
export type ActivationTestDeletableTarget =
  "MESSAGE" | "CONVERSATION" | "CONTACT";

/** Resultado da limpeza, como o resto do servico e a tela o leem. */
export interface ActivationTestCleanupResult {
  runId: string;
  state: Exclude<ActivationTestCleanupState, "PENDING">;
  cleanedAt: Date;
  residue: ActivationTestResidueItem[];
  /**
   * Linhas efetivamente apagadas nesta passada, por alvo.
   *
   * E o que torna a idempotencia observavel: repetir a limpeza tem de somar
   * zero aqui, porque nao ha mais nada com aqueles IDs para apagar.
   */
  removed: Record<ActivationTestDeletableTarget, number>;
  /**
   * O cancelamento do agendamento de teste foi aceito nesta passada.
   *
   * Aceito nao e o mesmo que removido: quem responde se ele saiu da agenda e a
   * leitura do read model, e a resposta dela esta em `residue`.
   */
  appointmentCancelled: boolean;
}

export function emptyRemovedCount(): Record<
  ActivationTestDeletableTarget,
  number
> {
  return { MESSAGE: 0, CONVERSATION: 0, CONTACT: 0 };
}

/** Residuo como a tela o le: alvo e razao ja em linguagem do negocio. */
export function activationTestResidueReport(
  residue: readonly ActivationTestResidueItem[],
): Array<{
  target: ActivationTestCleanupTarget;
  id: string;
  reason: ActivationTestResidueReason;
  label: string;
  explanation: string;
}> {
  return residue.map((item) => ({
    target: item.target,
    id: item.id,
    reason: item.reason,
    label: ACTIVATION_TEST_CLEANUP_TARGET_LABELS[item.target],
    explanation:
      item.detail ?? ACTIVATION_TEST_RESIDUE_REASON_LABELS[item.reason],
  }));
}

/**
 * Decodifica o residuo gravado em JSON.
 *
 * Linha antiga sem coluna, `null` ou conteudo que nao e lista viram lista
 * vazia — nunca `CLEAN` fabricado, porque o estado vem da sua propria coluna.
 */
export function parseActivationTestResidue(
  value: unknown,
): ActivationTestResidueItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isResidueItem);
}

function isResidueItem(value: unknown): value is ActivationTestResidueItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.target === "string" &&
    typeof item.reason === "string"
  );
}
