/**
 * Valores da origem lidos como a execucao os le (Goal010, Goal062, Goal136).
 * Um modulo so, importado pela analise e pela execucao: o que a analise grava
 * em `proposedService` e o que a execucao cria saem das mesmas funcoes, nunca
 * de duas copias delas.
 */

export function knownNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function knownPositiveDuration(value: unknown): number | null {
  const known = knownNumber(value);
  return known !== null && known > 0 ? known : null;
}

/**
 * Preco ausente e preco zero da origem sao a mesma pendencia de negocio
 * (Goal062, WU-01): nenhum dos dois e um preco de verdade, e ambos viram
 * `NOT_INFORMED`/`null`, nunca `FIXED` com zero fabricado.
 */
export function resolvePrice(value: unknown): {
  priceType: "FIXED" | "NOT_INFORMED";
  price: number | null;
} {
  const known = knownNumber(value);
  if (known === null || known === 0) {
    return { priceType: "NOT_INFORMED", price: null };
  }
  return { priceType: "FIXED", price: known };
}

/** O que a origem propoe para um servico, na forma gravada em `ImportItem.proposedService`. */
export interface ProposedService {
  durationMinutes: number | null;
  priceType: "FIXED" | "NOT_INFORMED";
  price: number | null;
}

export function proposedServiceFrom(source: {
  duration?: unknown;
  price?: unknown;
}): ProposedService {
  return {
    durationMinutes: knownPositiveDuration(source.duration),
    ...resolvePrice(source.price),
  };
}
