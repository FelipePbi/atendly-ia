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
export const INTERNAL_DERIVATION_PREFIX = "atendly:internal:v1";
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
  return createHmac("sha256", rootSecret)
    .update(`${INTERNAL_DERIVATION_PREFIX}:${caller}:${audience}:${use}`)
    .digest("base64url");
}

export function expectedToken(client: InternalClient): string {
  const explicit =
    client.callerId === "bff"
      ? env.BFF_COMMAND_TOKEN
      : env.AI_ORCHESTRATOR_COMMAND_TOKEN;
  if (explicit) return explicit;
  if (!env.INTERNAL_SERVICE_TOKEN) return "";
  return deriveInternalToken(
    env.INTERNAL_SERVICE_TOKEN,
    client.callerId,
    SERVICE_AUDIENCE,
    client.use,
  );
}

/** Identifica o chamador pela credencial apresentada, em tempo constante. */
export function identifyInternalClient(
  presentedToken: string,
): InternalClient | null {
  if (!presentedToken) return null;
  return (
    CLIENTS.find((client) => {
      const expected = expectedToken(client);
      return Boolean(expected) && constantTimeEquals(presentedToken, expected);
    }) ?? null
  );
}

export function internalAuthConfigured(): boolean {
  return CLIENTS.some((client) => Boolean(expectedToken(client)));
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
