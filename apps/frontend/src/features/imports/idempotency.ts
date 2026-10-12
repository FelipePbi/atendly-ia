/**
 * Chave de idempotência do módulo (Goal020): uma única definição para todas
 * as telas de `features/imports`, deliberadamente não compartilhada com
 * `features/agenda/holdSession.ts` para não acoplar módulos de domínios
 * diferentes por uma função de poucas linhas.
 */
export function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) =>
    value.toString(16).padStart(8, "0"),
  ).join("-");
}
