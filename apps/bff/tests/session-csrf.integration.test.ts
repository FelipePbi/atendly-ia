import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  ALLOWED_ORIGIN,
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  cookieValue,
  csrfTokenValue,
  HOSTILE_ORIGIN,
  login,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Sessão revogável, CSRF e origem — contra persistência real.
 *
 * Todos os casos usam apenas rotas do próprio BFF: nada aqui depende de
 * WhatsApp, IA ou agenda.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

describe.skipIf(!RUN_INTEGRATION)("session identity, revocation and CSRF", () => {
  beforeAll(async () => {
    app = await buildApp();
    await assertDisposableTarget();
  });

  afterAll(async () => {
    if (!app) return;
    await cleanupBusinesses(created);
    for (const session of created) {
      expect(
        await getPrisma().user.count({ where: { id: session.userId } }),
      ).toBe(0);
      expect(
        await getPrisma().userSession.count({
          where: { userId: session.userId },
        }),
      ).toBe(0);
    }
    await app.close();
  });

  it("issues a persisted, revocable session on register and on login", async () => {
    const session = await business("session-issue");

    expect(session.sessionCookie).not.toBe("");
    expect(session.csrfToken).not.toBe("");

    const rows = await getPrisma().userSession.findMany({
      where: { userId: session.userId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).toBeNull();
    // O token de CSRF nunca é guardado em claro.
    expect(rows[0]?.csrfTokenHash).not.toContain(session.csrfToken);

    const afterLogin = await login(app, session);
    expect(
      await getPrisma().userSession.count({ where: { userId: session.userId } }),
    ).toBe(2);
    expect(afterLogin.csrfToken).not.toBe(session.csrfToken);
  });

  it("authorises reads with a legitimate cookie and with a legitimate Bearer", async () => {
    const session = await business("session-read");

    const withCookie = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: browserRead(session),
    });
    expect(withCookie.statusCode).toBe(200);

    const withBearer = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${session.bearer}` },
    });
    expect(withBearer.statusCode).toBe(200);
  });

  it("rejects a session token that carries no revocable identity", async () => {
    const session = await business("session-legacy-jwt");
    const { SignJWT } = await import("jose");

    // JWT no formato anterior a este Goal: assinatura válida, sem `sid`.
    const legacyToken = await new SignJWT({ email: session.email })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(session.userId)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(env.JWT_SECRET));

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${legacyToken}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("SESSION_REAUTH_REQUIRED");
    // Nenhuma sessão nova é criada a partir de um token sem prova revogável.
    expect(
      await getPrisma().userSession.count({ where: { userId: session.userId } }),
    ).toBe(1);
  });

  it("revokes the session on logout and refuses the replayed token", async () => {
    const session = await business("session-logout");

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: browserMutation(session),
    });
    expect(logout.statusCode).toBe(200);

    const row = await getPrisma().userSession.findFirstOrThrow({
      where: { userId: session.userId },
    });
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokedReason).toBe("LOGOUT");

    for (const headers of [
      browserRead(session),
      { authorization: `Bearer ${session.bearer}` },
    ]) {
      const replay = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers,
      });
      expect(replay.statusCode).toBe(401);
    }

    // Repetir o logout não reativa a sessão nem falha.
    const again = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(again.statusCode).toBe(200);
    const unchanged = await getPrisma().userSession.findFirstOrThrow({
      where: { id: row.id },
    });
    expect(unchanged.revokedAt?.getTime()).toBe(row.revokedAt?.getTime());
  });

  it("refuses an expired session even when the token is still cryptographically valid", async () => {
    const session = await business("session-expired");
    await getPrisma().userSession.updateMany({
      where: { userId: session.userId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: browserRead(session),
    });
    expect(response.statusCode).toBe(401);
  });

  it("invalidates every session, cookie and Bearer, when the password changes", async () => {
    const session = await business("session-password");
    const second = await login(app, session);

    const change = await app.inject({
      method: "PATCH",
      url: "/v1/auth/password",
      headers: browserMutation(second),
      payload: {
        currentPassword: session.password,
        newPassword: "Integration-only-456",
        confirmPassword: "Integration-only-456",
      },
    });
    expect(change.statusCode).toBe(200);

    const revoked = await getPrisma().userSession.findMany({
      where: { userId: session.userId, revokedAt: { not: null } },
    });
    expect(revoked).toHaveLength(2);
    expect(revoked.every((row) => row.revokedReason === "PASSWORD_CHANGED")).toBe(
      true,
    );

    for (const stale of [session, second]) {
      const replay = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers: { authorization: `Bearer ${stale.bearer}` },
      });
      expect(replay.statusCode).toBe(401);
    }

    // O dispositivo que trocou a senha continua autenticado, com sessão nova.
    const renewedCookie = cookieValue(change, env.SESSION_COOKIE_NAME);
    expect(renewedCookie).not.toBe(second.sessionCookie);
    const renewed = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=${renewedCookie}` },
    });
    expect(renewed.statusCode).toBe(200);

    session.password = "Integration-only-456";
  });

  it("invalidates every session when the password is reset by token", async () => {
    const session = await business("session-reset");
    const { createHash, randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("base64url");

    await getPrisma().passwordResetToken.create({
      data: {
        userId: session.userId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    const reset = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      headers: { origin: ALLOWED_ORIGIN },
      payload: {
        token,
        newPassword: "Integration-only-789",
        confirmPassword: "Integration-only-789",
      },
    });
    expect(reset.statusCode).toBe(200);

    const rows = await getPrisma().userSession.findMany({
      where: { userId: session.userId },
    });
    expect(rows.every((row) => row.revokedReason === "PASSWORD_RESET")).toBe(
      true,
    );

    const replay = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: browserRead(session),
    });
    expect(replay.statusCode).toBe(401);

    session.password = "Integration-only-789";
  });

  it("delivers the CSRF token by a channel the browser can read across hosts", async () => {
    const session = await business("csrf-cross-host");

    // Em produção o cookie `atendly_csrf` é gravado no host do BFF e o script
    // do frontend, servido de outro host, não o enxerga. O header da resposta é
    // o canal que funciona — e carrega o mesmo token da sessão.
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { origin: ALLOWED_ORIGIN },
      payload: { email: session.email, password: session.password },
    });
    expect(login.statusCode).toBe(200);
    expect(csrfTokenValue(login)).toBe(
      cookieValue(login, env.CSRF_COOKIE_NAME),
    );
    expect(csrfTokenValue(login)).not.toBe("");

    // Reload da página: o adapter perdeu a memória e recupera o token na
    // primeira leitura autenticada, sem depender de cookie legível.
    const reloaded: SessionHandle = {
      ...session,
      sessionCookie: cookieValue(login, env.SESSION_COOKIE_NAME),
      csrfToken: "",
    };
    const bootstrap = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: browserRead(reloaded),
    });
    expect(bootstrap.statusCode).toBe(200);
    reloaded.csrfToken = csrfTokenValue(bootstrap);
    expect(reloaded.csrfToken).toBe(csrfTokenValue(login));

    // Mutação legítima com o token recuperado pelo header: é o logout que o
    // ambiente publicado recusava com 403.
    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: browserMutation(reloaded),
    });
    expect(logout.statusCode).toBe(200);

    const replay = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: browserRead(reloaded),
    });
    expect(replay.statusCode).toBe(401);
  });

  it("does not expose a CSRF token to an unauthenticated or Bearer request", async () => {
    const session = await business("csrf-no-leak");

    const anonymous = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
    });
    expect(anonymous.statusCode).toBe(401);
    expect(csrfTokenValue(anonymous)).toBe("");

    // Bearer não usa credencial ambiente e não precisa de CSRF; devolver o
    // token nesse caminho só ampliaria a superfície à toa.
    const bearer = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${session.bearer}` },
    });
    expect(bearer.statusCode).toBe(200);
    expect(csrfTokenValue(bearer)).toBe("");
  });

  it("accepts a legitimate cookie mutation and rejects it without a CSRF token", async () => {
    const session = await business("csrf-missing");

    const withoutToken = await app.inject({
      method: "PATCH",
      url: "/v1/auth/password",
      headers: { ...browserRead(session), origin: ALLOWED_ORIGIN },
      payload: {
        currentPassword: session.password,
        newPassword: "Integration-only-000",
        confirmPassword: "Integration-only-000",
      },
    });
    expect(withoutToken.statusCode).toBe(403);
    expect(withoutToken.json().error.code).toBe("CSRF_TOKEN_REJECTED");

    // Recusa antes de qualquer efeito: a senha continua a mesma.
    const legitimate = await app.inject({
      method: "PATCH",
      url: "/v1/auth/password",
      headers: browserMutation(session),
      payload: {
        currentPassword: session.password,
        newPassword: "Integration-only-000",
        confirmPassword: "Integration-only-000",
      },
    });
    expect(legitimate.statusCode).toBe(200);
    session.password = "Integration-only-000";
  });

  it("rejects a CSRF token that belongs to another session", async () => {
    const owner = await business("csrf-other-session");
    const other = await business("csrf-other-owner");

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/auth/password",
      headers: {
        ...browserRead(owner),
        origin: ALLOWED_ORIGIN,
        [env.CSRF_HEADER_NAME]: other.csrfToken,
      },
      payload: {
        currentPassword: owner.password,
        newPassword: "Integration-only-111",
        confirmPassword: "Integration-only-111",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
  });

  it("returns the session's current CSRF token on the rejection, so the adapter recovers", async () => {
    const session = await business("csrf-token-recovery");

    // Token defasado: é o que o adapter tem depois de perder o valor guardado
    // em memória sem ter feito nenhuma leitura ainda.
    const rejected = await app.inject({
      method: "PATCH",
      url: "/v1/auth/password",
      headers: {
        ...browserRead(session),
        origin: ALLOWED_ORIGIN,
        [env.CSRF_HEADER_NAME]: "stale-token",
      },
      payload: {
        currentPassword: session.password,
        newPassword: "Integration-only-333",
        confirmPassword: "Integration-only-333",
      },
    });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().error.code).toBe("CSRF_TOKEN_REJECTED");
    // A recusa carrega o token vigente daquela sessão — o mesmo canal legível
    // cross-origin usado nas respostas de sucesso.
    expect(csrfTokenValue(rejected)).toBe(session.csrfToken);

    const retried = await app.inject({
      method: "PATCH",
      url: "/v1/auth/password",
      headers: {
        ...browserRead(session),
        origin: ALLOWED_ORIGIN,
        [env.CSRF_HEADER_NAME]: csrfTokenValue(rejected),
      },
      payload: {
        currentPassword: session.password,
        newPassword: "Integration-only-333",
        confirmPassword: "Integration-only-333",
      },
    });
    expect(retried.statusCode).toBe(200);
    session.password = "Integration-only-333";
  });

  it("rejects a cross-site mutation before any effect", async () => {
    const session = await business("csrf-cross-site");

    const crossSite = await app.inject({
      method: "PATCH",
      url: "/v1/auth/password",
      headers: { ...browserMutation(session), origin: HOSTILE_ORIGIN },
      payload: {
        currentPassword: session.password,
        newPassword: "Integration-only-222",
        confirmPassword: "Integration-only-222",
      },
    });
    expect(crossSite.statusCode).toBe(403);
    expect(crossSite.json().error.code).toBe("CSRF_ORIGIN_REJECTED");

    const noOrigin = await app.inject({
      method: "PATCH",
      url: "/v1/auth/password",
      headers: {
        ...browserRead(session),
        [env.CSRF_HEADER_NAME]: session.csrfToken,
      },
      payload: {
        currentPassword: session.password,
        newPassword: "Integration-only-222",
        confirmPassword: "Integration-only-222",
      },
    });
    expect(noOrigin.statusCode).toBe(403);
    expect(noOrigin.json().error.code).toBe("CSRF_ORIGIN_REJECTED");

    // A senha original continua valendo: nenhuma das recusas teve efeito.
    const stillValid = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { origin: ALLOWED_ORIGIN },
      payload: { email: session.email, password: session.password },
    });
    expect(stillValid.statusCode).toBe(200);
  });

  it("rejects cross-site login, register and logout", async () => {
    const session = await business("csrf-auth-entrypoints");

    const crossSiteLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { origin: HOSTILE_ORIGIN },
      payload: { email: session.email, password: session.password },
    });
    expect(crossSiteLogin.statusCode).toBe(403);

    const crossSiteLogout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { ...browserMutation(session), origin: HOSTILE_ORIGIN },
    });
    expect(crossSiteLogout.statusCode).toBe(403);

    // A sessão sobrevive ao logout cross-site recusado.
    const alive = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: browserRead(session),
    });
    expect(alive.statusCode).toBe(200);
  });

  it("does not let a declared header stand in for a Bearer credential", async () => {
    const session = await business("csrf-no-header-bypass");

    // Sem cookie e sem Bearer real: um header declaratório não autentica.
    const declaratory = await app.inject({
      method: "PATCH",
      url: "/v1/auth/password",
      headers: {
        origin: HOSTILE_ORIGIN,
        authorization: "Bearer ",
        "x-tenant-id": session.tenantId,
        "x-user-id": session.userId,
      },
      payload: {
        currentPassword: session.password,
        newPassword: "Integration-only-333",
        confirmPassword: "Integration-only-333",
      },
    });
    expect(declaratory.statusCode).toBe(401);

    // Um Bearer inválido não cai de volta no cookie presente na requisição.
    const bearerThenCookie = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        ...browserRead(session),
        authorization: "Bearer not-a-valid-token",
      },
    });
    expect(bearerThenCookie.statusCode).toBe(401);
  });
});
