/**
 * Prazo entre o pedido de exclusão de conta e a purga (Goal025).
 *
 * Constante de produto, não configurável por ambiente nem por negócio — ao
 * contrário de `RetentionSettings` (Goal023), não existe linha, campo ou
 * variável que a substitua.
 */
export const ACCOUNT_DELETION_GRACE_PERIOD_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Vencimento do pedido: `requestedAt` mais o prazo de produto. `requestedAt`
 * é o único relógio que entra aqui — quem chama decide o instante, esta
 * função nunca lê `Date.now()`.
 */
export function accountDeletionDueAt(requestedAt: Date): Date {
  return new Date(
    requestedAt.getTime() + ACCOUNT_DELETION_GRACE_PERIOD_DAYS * DAY_MS,
  );
}

/**
 * Vencido quando `now` alcança ou passa `dueAt`. `now` é injetável — default
 * `new Date()` só para quem chama em produção; teste sempre fixa o instante.
 */
export function isAccountDeletionDue(dueAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= dueAt.getTime();
}
