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
 * Duracao de servico da origem na importacao (Goal138): so o inteiro positivo
 * de minutos e conhecido. Fracao, zero, negativo, nao finito, texto e ausente
 * sao duracao desconhecida, nunca arredondada para um valor que a origem nao
 * mandou. O intervalo de um atendimento continua em `knownPositiveDuration`,
 * que aceita fracao de minuto.
 */
export function knownServiceDuration(value: unknown): number | null {
  const known = knownPositiveDuration(value);
  return known !== null && Number.isInteger(known) ? known : null;
}

/**
 * Preco ausente, zero e negativo da origem sao a mesma pendencia de negocio
 * (Goal062, WU-01; Goal138): nenhum deles e um preco de verdade, e todos viram
 * `NOT_INFORMED`/`null`, nunca `FIXED` com zero ou valor negativo fabricado.
 */
export function resolvePrice(value: unknown): {
  priceType: "FIXED" | "NOT_INFORMED";
  price: number | null;
} {
  const known = knownNumber(value);
  if (known === null || known <= 0) {
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
    durationMinutes: knownServiceDuration(source.duration),
    ...resolvePrice(source.price),
  };
}
