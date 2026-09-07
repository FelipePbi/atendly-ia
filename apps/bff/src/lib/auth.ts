import type { FastifyReply, FastifyRequest } from "fastify";
import { type JWTPayload, jwtVerify, SignJWT } from "jose";

import { env } from "../config/env.js";
import { assertAllowedOrigin, assertCsrfToken, isSafeMethod } from "./csrf.js";
import { AppError } from "./errors.js";
import {
  type ActiveSession,
  deriveCsrfToken,
  type IssuedSession,
  loadActiveSession,
  sessionTtlSeconds,
} from "./session.js";

export type AuthenticatedUser = {
  id: string;
  email: string;
  sessionId: string;
};

/**
 * Qual credencial autenticou a requisição.
 *
 * A distinção não vem de header declaratório: `bearer` só é escolhido quando um
 * `Authorization: Bearer` foi apresentado **e** verificado com sucesso. O
 * navegador não consegue anexar esse header a uma requisição cross-site sem
 * preflight, e o CORS do app não libera origem estranha; por isso a proteção de
 * CSRF é exigida exatamente no caso `cookie`, o único com credencial ambiente.
 */
export type AuthCredentialKind = "cookie" | "bearer";

const secretKey = () => new TextEncoder().encode(env.JWT_SECRET);

export async function signSession(
  user: { id: string; email: string },
  sessionId: string,
): Promise<string> {
  return new SignJWT({ email: user.email, sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secretKey());
}

export interface SessionTokenClaims {
  userId: string;
  email: string;
  sessionId: string;
}

/**
 * Verifica o portador e exige identidade de sessão.
 *
 * JWTs antigos, emitidos antes deste Goal, não têm `sid` e portanto não têm
 * prova revogável associada. Eles são recusados com `SESSION_REAUTH_REQUIRED`:
 * exigir nova autenticação é a única alternativa segura, porque criar uma
 * sessão a partir de um token que nunca passou por revogação reabriria o
 * caminho que logout e troca de senha precisam fechar.
 */
export async function verifySessionToken(
  token: string,
): Promise<SessionTokenClaims> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, secretKey()));
  } catch {
    throw new AppError("UNAUTHORIZED", "Invalid or expired session.", 401);
  }

  const subject = payload.sub;
  const email = payload.email;
  const sessionId = payload.sid;

  if (!subject || typeof email !== "string") {
    throw new AppError("UNAUTHORIZED", "Invalid session.", 401);
  }

  if (typeof sessionId !== "string" || !sessionId) {
    throw new AppError(
      "SESSION_REAUTH_REQUIRED",
      "This session predates revocable session identity. Sign in again.",
      401,
    );
  }

  return { userId: subject, email, sessionId };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.COOKIE_SAME_SITE === "none",
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
  } as const;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    maxAge: sessionTtlSeconds(),
  });
}

/**
 * Cookie de CSRF legível pelo script da própria origem: o adapter do frontend
 * copia o valor para o header. O valor não autoriza nada por si — o par
 * esperado está guardado na sessão, no servidor.
 *
 * O cookie sozinho não basta em produção: BFF e frontend ficam em hosts
 * distintos sob um sufixo público, então `document.cookie` do frontend nunca
 * enxerga o que foi gravado no host do BFF. Por isso o mesmo token viaja
 * também no header de resposta abaixo, que é o canal que o adapter usa.
 */
export function setCsrfCookie(reply: FastifyReply, csrfToken: string): void {
  reply.setCookie(env.CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: env.COOKIE_SECURE || env.COOKIE_SAME_SITE === "none",
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
    maxAge: sessionTtlSeconds(),
  });
}

/**
 * Canal legível cross-origin do token de CSRF.
 *
 * O header é exposto no CORS apenas para `FRONTEND_ORIGIN`; uma página hostil
 * não consegue lê-lo, exatamente como não consegue ler o corpo da resposta. O
 * adapter guarda o valor em memória e o devolve no header da mutação seguinte.
 */
export function sendCsrfToken(reply: FastifyReply, csrfToken: string): void {
  reply.header(env.CSRF_HEADER_NAME, csrfToken);
}

/** Token de CSRF vigente de uma sessão já carregada e verificada. */
export function sessionCsrfToken(session: { id: string }): string {
  return deriveCsrfToken(session.id);
}

export async function establishSession(
  reply: FastifyReply,
  user: { id: string; email: string },
  session: IssuedSession,
): Promise<void> {
  setSessionCookie(reply, await signSession(user, session.sessionId));
  setCsrfCookie(reply, session.csrfToken);
  sendCsrfToken(reply, session.csrfToken);
}

export function clearSessionCookie(reply: FastifyReply): void {
  const options = {
    secure: env.COOKIE_SECURE || env.COOKIE_SAME_SITE === "none",
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
  } as const;
  reply.clearCookie(env.SESSION_COOKIE_NAME, options);
  reply.clearCookie(env.CSRF_COOKIE_NAME, options);
}

export interface PresentedCredential {
  token: string;
  kind: AuthCredentialKind;
}

export function presentedCredential(
  request: FastifyRequest,
): PresentedCredential | null {
  const header = request.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
  if (bearerToken) return { token: bearerToken, kind: "bearer" };

  const cookieToken = request.cookies[env.SESSION_COOKIE_NAME];
  if (cookieToken) return { token: cookieToken, kind: "cookie" };

  return null;
}

export async function requireAuth(request: FastifyRequest): Promise<void> {
  const credential = presentedCredential(request);
  if (!credential) {
    throw new AppError("UNAUTHORIZED", "Authentication required.", 401);
  }

  const claims = await verifySessionToken(credential.token);
  const session = await loadActiveSession(claims.sessionId);
  if (!session || session.userId !== claims.userId) {
    // Sessão revogada, expirada no servidor ou usuário removido: um único erro,
    // sem revelar qual das condições ocorreu.
    throw new AppError("UNAUTHORIZED", "Invalid or expired session.", 401);
  }

  // O portador já está verificado e a sessão está viva. Registrar isso antes
  // das provas de CSRF é o que faz a resposta de recusa carregar o token
  // vigente da sessão (hook `onSend`), de onde o adapter se recupera de um
  // token defasado. Não é autorização: a recusa abaixo continua interrompendo a
  // requisição antes de qualquer efeito, e o header só é legível pela origem
  // permitida no CORS.
  request.authCredentialKind = credential.kind;
  request.session = session;

  if (credential.kind === "cookie" && !isSafeMethod(request.method)) {
    assertAllowedOrigin(request);
    assertCsrfToken(request, session);
  }

  request.user = {
    id: session.userId,
    email: session.email,
    sessionId: session.id,
  };
}

export function currentUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.user) {
    throw new AppError("UNAUTHORIZED", "Authentication required.", 401);
  }

  return request.user;
}

export function currentSession(request: FastifyRequest): ActiveSession {
  if (!request.session) {
    throw new AppError("UNAUTHORIZED", "Authentication required.", 401);
  }

  return request.session;
}
