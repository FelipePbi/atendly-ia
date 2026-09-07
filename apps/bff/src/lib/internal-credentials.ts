import { createHmac } from "node:crypto";

import { env } from "../config/env.js";
import { AppError } from "./errors.js";

/**
 * Contrato produtor/consumer das credenciais internas.
 *
 * Cada par (audiência, uso) tem uma credencial própria. Quando não há valor
 * explícito no ambiente, o token é derivado de `INTERNAL_SERVICE_TOKEN` por
 * HMAC — o valor bruto do segredo compartilhado deixa de ser aceito por
 * qualquer receptor, então um token de provisionamento não autoriza comandos
 * comuns nem vale em outro serviço.
 *
 * O mesmo módulo existe, com a mesma derivação, do lado de quem verifica.
 */
export const INTERNAL_DERIVATION_PREFIX = "atendly:internal:v1";

/** Identidade deste chamador no contrato de credenciais internas. */
export const CALLER_ID = "bff";

export type InternalAudience = "ai-orchestrator" | "scheduling-service";
export type InternalUse = "provisioning" | "command";

export function deriveInternalToken(
  rootSecret: string,
  caller: string,
  audience: InternalAudience,
  use: InternalUse,
): string {
  return createHmac("sha256", rootSecret)
    .update(`${INTERNAL_DERIVATION_PREFIX}:${caller}:${audience}:${use}`)
    .digest("base64url");
}

export function internalToken(
  audience: InternalAudience,
  use: InternalUse,
): string {
  const explicit = explicitToken(audience, use);
  if (explicit) return explicit;

  if (!env.INTERNAL_SERVICE_TOKEN) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      `No internal credential is configured for ${audience}/${use}.`,
      500,
    );
  }
  return deriveInternalToken(
    env.INTERNAL_SERVICE_TOKEN,
    CALLER_ID,
    audience,
    use,
  );
}

function explicitToken(
  audience: InternalAudience,
  use: InternalUse,
): string {
  if (audience === "ai-orchestrator") {
    return use === "provisioning"
      ? env.AI_ORCHESTRATOR_PROVISIONING_TOKEN
      : env.AI_ORCHESTRATOR_COMMAND_TOKEN;
  }
  return use === "command" ? env.SCHEDULING_SERVICE_COMMAND_TOKEN : "";
}
