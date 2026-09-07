import type { FastifyRequest } from "fastify";

import { env } from "../config/env.js";
import { AppError } from "./errors.js";
import { csrfTokenMatches } from "./session.js";

/**
 * Proteção de CSRF/origem das mutações feitas com credencial ambiente (cookie).
 *
 * São duas verificações independentes e ambas obrigatórias:
 *
 * 1. Origem: `Origin` (ou a origem de `Referer`) precisa estar na allowlist.
 *    Ausência de ambos em requisição não-segura com cookie é recusa, não
 *    permissão.
 * 2. Token: o header de CSRF precisa bater com o hash guardado **naquela
 *    sessão**. Não é double-submit de cookie contra header — o valor esperado
 *    vive no servidor, então um token de outra sessão (ou um cookie injetado
 *    por subdomínio) não passa.
 *
 * Liberar o header no CORS não faz parte da proteção: a recusa acontece no
 * handler, antes de qualquer efeito.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

export function allowedOrigins(): string[] {
  return [env.FRONTEND_ORIGIN.trim()].filter(Boolean).map(normalizeOrigin);
}

export function assertAllowedOrigin(request: FastifyRequest): void {
  if (isSafeMethod(request.method)) return;

  const origin = requestOrigin(request);
  if (!origin) {
    throw new AppError(
      "CSRF_ORIGIN_REJECTED",
      "Request origin is required for this operation.",
      403,
    );
  }

  const allowlist = allowedOrigins();
  if (allowlist.length === 0 || !allowlist.includes(origin)) {
    throw new AppError(
      "CSRF_ORIGIN_REJECTED",
      "Request origin is not allowed for this operation.",
      403,
    );
  }
}

export function assertCsrfToken(
  request: FastifyRequest,
  session: { csrfTokenHash: string },
): void {
  if (isSafeMethod(request.method)) return;

  const header = request.headers[env.CSRF_HEADER_NAME.toLowerCase()];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided || !csrfTokenMatches(provided, session.csrfTokenHash)) {
    throw new AppError(
      "CSRF_TOKEN_REJECTED",
      "A valid CSRF token is required for this operation.",
      403,
    );
  }
}

function requestOrigin(request: FastifyRequest): string | undefined {
  const origin = headerValue(request, "origin");
  if (origin && origin !== "null") return normalizeOrigin(origin);

  const referer = headerValue(request, "referer");
  if (!referer) return undefined;
  try {
    return normalizeOrigin(new URL(referer).origin);
  } catch {
    return undefined;
  }
}

function headerValue(
  request: FastifyRequest,
  name: string,
): string | undefined {
  const value = request.headers[name];
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || undefined;
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/\/$/u, "");
  }
}
