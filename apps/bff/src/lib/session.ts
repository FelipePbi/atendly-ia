import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env.js";
import { getPrisma } from "./prisma.js";

/**
 * Estado de sessão revogável no servidor.
 *
 * O JWT continua sendo o portador (cookie ou Bearer), mas passa a carregar
 * apenas `sid`. Toda autorização consulta esta tabela: sessão inexistente,
 * expirada ou revogada não autoriza operação, independentemente de o JWT ainda
 * estar dentro da validade criptográfica.
 */
export type SessionRevocationReason =
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET";

export interface IssuedSession {
  sessionId: string;
  csrfToken: string;
  expiresAt: Date;
}

export interface ActiveSession {
  id: string;
  userId: string;
  email: string;
  csrfTokenHash: string;
  expiresAt: Date;
}

export function sessionTtlSeconds(): number {
  return env.SESSION_TTL_HOURS * 60 * 60;
}

export function hashCsrfToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Token de CSRF derivado da identidade da sessão.
 *
 * Derivar em vez de sortear não enfraquece a prova — continua sendo um valor
 * imprevisível sem o segredo do servidor, e o par conferido continua sendo o
 * hash guardado naquela sessão. O que a derivação acrescenta é poder devolver o
 * mesmo token de novo: o navegador que recarrega a página, ou uma segunda aba,
 * recupera o token pela resposta do BFF em vez de depender de ler um cookie que
 * em produção mora em outro host e é ilegível pelo script do frontend.
 */
export function deriveCsrfToken(sessionId: string): string {
  return createHmac("sha256", env.JWT_SECRET)
    .update(`atendly:csrf:${sessionId}`)
    .digest("base64url");
}

export function csrfTokenMatches(provided: string, expectedHash: string): boolean {
  const left = Buffer.from(hashCsrfToken(provided));
  const right = Buffer.from(expectedHash);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createUserSession(
  userId: string,
): Promise<IssuedSession> {
  const expiresAt = new Date(Date.now() + sessionTtlSeconds() * 1_000);
  const session = await getPrisma().userSession.create({
    data: { userId, csrfTokenHash: "", expiresAt },
    select: { id: true },
  });
  const csrfToken = deriveCsrfToken(session.id);
  await getPrisma().userSession.update({
    where: { id: session.id },
    data: { csrfTokenHash: hashCsrfToken(csrfToken) },
  });

  return { sessionId: session.id, csrfToken, expiresAt };
}

export async function loadActiveSession(
  sessionId: string,
): Promise<ActiveSession | null> {
  const session = await getPrisma().userSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      csrfTokenHash: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { email: true } },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  return {
    id: session.id,
    userId: session.userId,
    email: session.user.email,
    csrfTokenHash: session.csrfTokenHash,
    expiresAt: session.expiresAt,
  };
}

/** Revoga uma sessão. Idempotente: revogar de novo não reativa nem falha. */
export async function revokeSession(
  sessionId: string,
  reason: SessionRevocationReason,
): Promise<void> {
  await getPrisma().userSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Revoga todas as sessões vivas do usuário. Usado por troca e reset de senha,
 * de modo que cookie e Bearer emitidos antes deixam de valer.
 */
export async function revokeAllUserSessions(
  userId: string,
  reason: SessionRevocationReason,
): Promise<number> {
  const result = await getPrisma().userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

export async function touchSession(sessionId: string): Promise<void> {
  await getPrisma().userSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { lastUsedAt: new Date() },
  });
}
