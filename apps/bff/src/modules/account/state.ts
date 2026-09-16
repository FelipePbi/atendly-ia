import { isAccountDeletionDue } from "./constants.js";
import { type AccountDeletionErrorCode } from "./errors.js";

/**
 * A máquina de estados da exclusão de conta (Goal025/WU-02).
 *
 * Só decisão, nenhum efeito: nada aqui abre o Prisma, chama a IA ou desconecta
 * número. É de propósito — a ordem dos efeitos é onde mora o risco do Goal, e
 * misturá-la com a regra de "pode ou não pode" torna as duas impossíveis de
 * testar separadamente. O serviço executa o que estas funções decidem.
 *
 * O relógio entra sempre por parâmetro. Nenhuma função deste arquivo lê
 * `Date.now()`, então envelhecer o prazo em teste é passar outro `now`.
 */

/** O estado durável, reduzido ao que a decisão precisa ler. */
export interface AccountDeletionState {
  status: "SCHEDULED" | "CANCELLED" | "PURGED";
  dueAt: Date;
}

export type StartDecision =
  | { allowed: true }
  | { allowed: false; reason: AccountDeletionErrorCode };

export type CancelDecision =
  | { allowed: true }
  | { allowed: false; reason: AccountDeletionErrorCode };

/**
 * Pode iniciar?
 *
 * Sem linha nenhuma, sim. Linha `CANCELLED` também: cancelar devolve a conta
 * ao estado normal, e o dono pode mudar de ideia de novo — a linha é reescrita,
 * não duplicada (a chave primária é o `tenantId`).
 *
 * `SCHEDULED` recusa: é o pedido repetido, e a escolha está declarada em
 * `ACCOUNT_DELETION_ALREADY_SCHEDULED`. `PURGED` recusa porque não há mais
 * conta para excluir.
 *
 * O vencimento **não** entra aqui: uma exclusão `SCHEDULED` vencida está
 * esperando a purga, não aberta a pedido novo.
 */
export function decideStart(
  current: AccountDeletionState | null,
): StartDecision {
  if (!current) return { allowed: true };
  switch (current.status) {
    case "SCHEDULED":
      return {
        allowed: false,
        reason: "ACCOUNT_DELETION_ALREADY_SCHEDULED",
      };
    case "PURGED":
      return { allowed: false, reason: "ACCOUNT_DELETION_ALREADY_PURGED" };
    case "CANCELLED":
      return { allowed: true };
  }
}

/**
 * Pode cancelar?
 *
 * Só `SCHEDULED` e só antes do vencimento. As três recusas são distintas de
 * propósito: "não havia pedido", "o prazo venceu" e "já terminou" são notícias
 * diferentes para quem está na tela tentando recuperar a conta.
 *
 * O vencimento é comparado com `isAccountDeletionDue`, a mesma função que o
 * laço de purga usa para decidir que venceu. Duas leituras do mesmo instante
 * não podem discordar: se discordassem, existiria uma janela em que o dono vê
 * "ainda dá para cancelar" e a purga já considera vencido.
 */
export function decideCancel(
  current: AccountDeletionState | null,
  now: Date,
): CancelDecision {
  if (!current) {
    return { allowed: false, reason: "ACCOUNT_DELETION_NOT_SCHEDULED" };
  }
  if (current.status === "CANCELLED") {
    return { allowed: false, reason: "ACCOUNT_DELETION_ALREADY_CANCELLED" };
  }
  if (current.status === "PURGED") {
    return { allowed: false, reason: "ACCOUNT_DELETION_ALREADY_PURGED" };
  }
  if (isAccountDeletionDue(current.dueAt, now)) {
    return {
      allowed: false,
      reason: "ACCOUNT_DELETION_GRACE_PERIOD_EXPIRED",
    };
  }
  return { allowed: true };
}

/**
 * Há exclusão em vigor para este negócio?
 *
 * É a pergunta que a guarda de reativação faz (WU-03) e a que a tela faz. Uma
 * exclusão vencida e ainda `SCHEDULED` conta como em vigor: a purga não rodou,
 * mas a conta não voltou a ser normal — e religar a IA de uma conta esperando
 * purga seria o pior momento possível para religá-la.
 */
export function isDeletionPending(
  current: AccountDeletionState | null,
): boolean {
  return current?.status === "SCHEDULED";
}
