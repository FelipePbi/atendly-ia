import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../config/env.js";

/**
 * Credenciais internas aceitas pelo scheduling-service.
 *
 * Cada chamador tem a sua: o BFF e a IA não compartilham mais o mesmo valor, e
 * o segredo bruto `INTERNAL_SERVICE_TOKEN` não é aceito por si — ele só serve de
 * raiz para a derivação combinada por (chamador, audiência, uso), idêntica do
 * lado de quem chama.
 */
export const INTERNAL_DERIVATION_PREFIX = "avenly:internal:v1";
/**
 * Rótulo anterior à troca de marca. Só o verificador o usa, para aceitar o
 * chamador ainda na versão anterior durante o deploy; nada deriva com ele para
 * apresentar.
 */
export const LEGACY_INTERNAL_DERIVATION_PREFIX = "atendly:internal:v1";
export const SERVICE_AUDIENCE = "scheduling-service";

export type InternalUse = "command";

export interface InternalClient {
  callerId: "bff" | "ai-orchestrator";
  use: InternalUse;
}

const CLIENTS: readonly InternalClient[] = [
  { callerId: "bff", use: "command" },
  { callerId: "ai-orchestrator", use: "command" },
];

export function deriveInternalToken(
  rootSecret: string,
  caller: string,
  audience: string,
  use: InternalUse,
): string {
  return deriveWithPrefix(
    INTERNAL_DERIVATION_PREFIX,
    rootSecret,
    caller,
    audience,
    use,
  );
}

function deriveWithPrefix(
  prefix: string,
  rootSecret: string,
  caller: string,
  audience: string,
  use: InternalUse,
): string {
  return createHmac("sha256", rootSecret)
    .update(`${prefix}:${caller}:${audience}:${use}`)
    .digest("base64url");
}

/**
 * Credenciais aceitas para o chamador. Com valor explícito no ambiente, só ele
 * vale; sem ele, vale o derivado com o rótulo novo e com o legado, ambos para o
 * mesmo chamador, audiência e uso.
 */
export function expectedTokens(client: InternalClient): string[] {
  const explicit =
    client.callerId === "bff"
      ? env.BFF_COMMAND_TOKEN
      : env.AI_ORCHESTRATOR_COMMAND_TOKEN;
  if (explicit) return [explicit];
  if (!env.INTERNAL_SERVICE_TOKEN) return [];
  return [INTERNAL_DERIVATION_PREFIX, LEGACY_INTERNAL_DERIVATION_PREFIX].map(
    (prefix) =>
      deriveWithPrefix(
        prefix,
        env.INTERNAL_SERVICE_TOKEN,
        client.callerId,
        SERVICE_AUDIENCE,
        client.use,
      ),
  );
}

/** Identifica o chamador pela credencial apresentada, em tempo constante. */
export function identifyInternalClient(
  presentedToken: string,
): InternalClient | null {
  if (!presentedToken) return null;
  return (
    CLIENTS.find((client) =>
      matchesAny(presentedToken, expectedTokens(client)),
    ) ?? null
  );
}

export function internalAuthConfigured(): boolean {
  return CLIENTS.some((client) => expectedTokens(client).length > 0);
}

function matchesAny(presented: string, expected: readonly string[]): boolean {
  let matched = false;
  for (const candidate of expected) {
    matched = constantTimeEquals(presented, candidate) || matched;
  }
  return matched;
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
