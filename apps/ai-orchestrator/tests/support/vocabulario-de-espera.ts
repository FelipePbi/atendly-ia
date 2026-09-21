/**
 * Definição única de vocabulário de espera (A-09 / Goal034, unificada no
 * Goal037). Qualquer vocabulário que faça um texto soar como "estou
 * processando, espera aí" em vez da decisão determinística que ele realmente
 * é. Compartilhada por `tests/assistant/assistant.service.test.ts` (conjunto
 * fechado dos textos que o produto emite) e por
 * `tests/evals/waiting-message-vocabulary.eval.test.ts` (comportamento do
 * runtime): as duas cópias antes podiam divergir sem que nada acusasse.
 */
export const VOCABULARIO_DE_ESPERA =
  /aguard|\bespera(ndo)?\b|\bum (instante|momento|minuto|minutinho)\b|em breve|daqui a pouco|s[oó] um (instante|momento|minuto|minutinho)|verificando|processando|consultando|analisando/i;
