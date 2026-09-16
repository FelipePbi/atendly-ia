import { AppError } from "../../lib/errors.js";

/**
 * As recusas próprias do ciclo de vida da conta (Goal025/WU-02).
 *
 * Códigos próprios, não `CONFLICT` genérico: a tela precisa distinguir "já
 * existe um pedido" de "o prazo venceu" de "essa conta já foi purgada", e as
 * três coisas viram textos diferentes para o dono. Um `CONFLICT` só forçaria o
 * frontend a ler a mensagem em inglês para decidir o que mostrar.
 *
 * Eles não entram em `ErrorCode` (`lib/errors.ts`) porque aquele vocabulário é
 * dos erros transversais do BFF; estes são do módulo e viajam no `details` da
 * recusa, no mesmo formato que o resto do produto já entrega.
 */
export type AccountDeletionErrorCode =
  /**
   * Já existe exclusão `SCHEDULED` para o negócio. **Esta é a escolha
   * declarada** para o pedido repetido: recusar com código próprio em vez de
   * devolver o estado vigente como se fosse um pedido novo aceito. O motivo é
   * que `POST` que responde `200` ensina a tela que o pedido "passou de novo",
   * e o segundo pedido teria vencimento diferente do primeiro na cabeça de
   * quem leu a resposta. O estado vigente continua legível pela rota de
   * leitura, com o `dueAt` verdadeiro — o do primeiro pedido.
   */
  | "ACCOUNT_DELETION_ALREADY_SCHEDULED"
  /** Cancelar sem nenhuma exclusão agendada. Nada a desfazer. */
  | "ACCOUNT_DELETION_NOT_SCHEDULED"
  /**
   * Cancelar depois do vencimento. O prazo é o prazo: a purga pode já estar
   * em voo, e "cancelar" aqui prometeria de volta um dado que talvez não
   * exista mais.
   */
  | "ACCOUNT_DELETION_GRACE_PERIOD_EXPIRED"
  /** Estado terminal: já cancelada (nada a cancelar) ou já purgada. */
  | "ACCOUNT_DELETION_ALREADY_CANCELLED"
  | "ACCOUNT_DELETION_ALREADY_PURGED";

const MESSAGES: Record<AccountDeletionErrorCode, string> = {
  ACCOUNT_DELETION_ALREADY_SCHEDULED:
    "Account deletion is already scheduled for this business.",
  ACCOUNT_DELETION_NOT_SCHEDULED:
    "There is no scheduled account deletion to cancel.",
  ACCOUNT_DELETION_GRACE_PERIOD_EXPIRED:
    "The cancellation window for this account deletion has expired.",
  ACCOUNT_DELETION_ALREADY_CANCELLED:
    "This account deletion was already cancelled.",
  ACCOUNT_DELETION_ALREADY_PURGED:
    "This account was already purged and cannot be recovered.",
};

/**
 * A recusa do módulo, sempre `409`.
 *
 * Nenhuma delas é erro de entrada — o corpo estava certo e a identidade também;
 * o que não bate é o estado. `409` é o que o resto do BFF já usa para isso.
 */
export class AccountDeletionError extends AppError {
  constructor(public readonly reason: AccountDeletionErrorCode) {
    super("CONFLICT", MESSAGES[reason], 409, { reason });
    this.name = "AccountDeletionError";
  }
}
