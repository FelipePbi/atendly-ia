import { createHmac, timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";

import { env } from "../config/env.js";
import { AppError } from "./errors.js";

/**
 * Verificação das credenciais internas recebidas pela IA.
 *
 * O receptor é quem decide identidade e escopo. `x-service-audience`,
 * `x-user-id` e `x-tenant-id` continuam existindo para roteamento e
 * observabilidade, mas nenhum deles autentica: quem autentica é a credencial
 * apresentada, e ela vale só para o uso em que foi emitida.
 *
 * A derivação é o contrato com o produtor: sem valor explícito no ambiente, o
 * token esperado é `HMAC(INTERNAL_SERVICE_TOKEN, "<prefixo>:<audiência>:<uso>")`.
 * O segredo compartilhado bruto não é aceito em nenhum uso, então um token de
 * provisionamento não serve de fallback para comando comum.
 */
export const INTERNAL_DERIVATION_PREFIX = "atendly:internal:v1";
export const SERVICE_AUDIENCE = "ai-orchestrator";
/** Identidade deste serviço quando ele é o chamador. */
export const CALLER_ID = "ai-orchestrator";
/** Único chamador autorizado nas rotas internas da IA hoje. */
export const TRUSTED_CALLER_ID = "bff";

export type InternalUse = "provisioning" | "command";

export type InternalScope =
  | "channel:provision"
  | "tenant-config:write"
  | "conversations:read"
  | "conversations:write"
  | "messages:send"
  | "dashboard:read"
  | "knowledge:read"
  | "knowledge:write"
  | "customer-memory:read"
  | "customer-memory:write"
  | "customer-summary:write"
  // Escopo deliberadamente não concedido a nenhuma credencial: é o destino de
  // caminho interno sem escopo declarado, para que rota nova falhe fechada.
  | "internal:unmapped";

export interface InternalCaller {
  use: InternalUse;
  scopes: readonly InternalScope[];
}

const SCOPES_BY_USE: Record<InternalUse, readonly InternalScope[]> = {
  provisioning: ["channel:provision", "tenant-config:write"],
  command: [
    "conversations:read",
    "conversations:write",
    "messages:send",
    "dashboard:read",
    "knowledge:read",
    "knowledge:write",
    "customer-memory:read",
    "customer-memory:write",
    "customer-summary:write",
  ],
};

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

export function expectedToken(use: InternalUse): string {
  const explicit =
    use === "provisioning"
      ? env.INTERNAL_PROVISIONING_TOKEN
      : env.INTERNAL_COMMAND_TOKEN;
  if (explicit) return explicit;
  if (!env.INTERNAL_SERVICE_TOKEN) return "";
  return deriveInternalToken(
    env.INTERNAL_SERVICE_TOKEN,
    TRUSTED_CALLER_ID,
    SERVICE_AUDIENCE,
    use,
  );
}

/**
 * Autentica o chamador e autoriza o escopo exigido pela operação.
 *
 * Recusa antes de qualquer efeito: credencial inválida vira 401, credencial
 * válida de outro uso vira 403, e audiência declarada divergente vira 403 —
 * sem revelar qual credencial teria servido.
 */
export function authorizeInternalRequest(
  request: FastifyRequest,
  requiredScope: InternalScope,
): InternalCaller {
  const presented = bearerToken(request);
  if (!presented) {
    throw new AppError("Unauthorized", {
      statusCode: 401,
      code: "INTERNAL_UNAUTHORIZED",
    });
  }

  const audience = headerValue(request, "x-service-audience");
  if (audience && audience !== SERVICE_AUDIENCE) {
    throw new AppError("Forbidden", {
      statusCode: 403,
      code: "INTERNAL_AUDIENCE_MISMATCH",
    });
  }

  const matched = (["provisioning", "command"] as const).find((use) => {
    const expected = expectedToken(use);
    return Boolean(expected) && constantTimeEquals(presented, expected);
  });

  if (!matched) {
    throw new AppError("Unauthorized", {
      statusCode: 401,
      code: "INTERNAL_UNAUTHORIZED",
    });
  }

  const scopes = SCOPES_BY_USE[matched];
  if (!scopes.includes(requiredScope)) {
    throw new AppError("Forbidden", {
      statusCode: 403,
      code: "INTERNAL_SCOPE_DENIED",
    });
  }

  return { use: matched, scopes };
}

function bearerToken(request: FastifyRequest): string {
  const authorization = headerValue(request, "authorization");
  if (!authorization?.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

function headerValue(
  request: FastifyRequest,
  name: string,
): string | undefined {
  const value = request.headers[name];
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || undefined;
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
