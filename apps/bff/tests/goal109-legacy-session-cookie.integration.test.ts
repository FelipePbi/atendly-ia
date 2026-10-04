import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  ALLOWED_ORIGIN,
  assertDisposableTarget,
  cleanupBusinesses,
  csrfTokenValue,
  HOSTILE_ORIGIN,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal109, prova 6: os cookies passam a `avenly_session` e `avenly_csrf`, e uma
 * sessão aberta antes do deploy, que o navegador apresenta como
 * `atendly_session`, continua valendo até expirar ou ser revogada.
 *
 * Os nomes aqui são literais de propósito: a prova é sobre os padrões, não
 * sobre o que `env` disser. Nenhum caso cria sessão para "migrar" o cookie, e
 * nenhuma regra de CSRF, revogação ou expiração é diferente para o nome antigo.
 */
const NEW_SESSION = "avenly_session";
const NEW_CSRF = "avenly_csrf";
const OLD_SESSION = "atendly_session";
const OLD_CSRF = "atendly_csrf";

type InjectedResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;

let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, `goal109-${label}`);
  created.push(session);
  return session;
}

function issuedCookie(response: InjectedResponse, name: string) {
  return response.cookies.find((cookie) => cookie.name === name);
}

function expectWritten(response: InjectedResponse, name: string): string {
  const cookie = issuedCookie(response, name);
  expect(cookie, `${name} should be written`).toBeDefined();
  expect(cookie?.value).not.toBe("");
  expect(cookie?.maxAge ?? 0).toBeGreaterThan(0);
  return cookie?.value ?? "";
}

function expectCleared(response: InjectedResponse, name: string): void {
  const cookie = issuedCookie(response, name);
  expect(cookie, `${name} should be cleared`).toBeDefined();
  expect(cookie?.value).toBe("");
  expect(cookie?.maxAge).toBe(0);
}

async function sessionCount(session: SessionHandle): Promise<number> {
  return getPrisma().userSession.count({ where: { userId: session.userId } });
}

describe.skipIf(!RUN_INTEGRATION)(
  "Goal109 — session cookie under the new name, old name still read",
  () => {
    beforeAll(async () => {
      app = await buildApp();
      await assertDisposableTarget();
    });

    afterAll(async () => {
      if (!app) return;
      await cleanupBusinesses(created);
      await app.close();
    });

    it("defaults the cookie names to avenly_session and avenly_csrf", () => {
      expect(env.SESSION_COOKIE_NAME).toBe(NEW_SESSION);
      expect(env.CSRF_COOKIE_NAME).toBe(NEW_CSRF);
    });

    it("authenticates a read carrying only atendly_session, with no Set-Cookie and no new session", async () => {
      const session = await business("legacy-read");

      const response = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers: { cookie: `${OLD_SESSION}=${session.sessionCookie}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.user.id).toBe(session.userId);
      expect(response.headers["set-cookie"]).toBeUndefined();
      // Mesma sessão: o token de CSRF devolvido é o que ela já tinha.
      expect(csrfTokenValue(response)).toBe(session.csrfToken);
      expect(await sessionCount(session)).toBe(1);
    });

    it("accepts a mutation on the atendly_session session with its CSRF token, under the same CSRF rules", async () => {
      const session = await business("legacy-mutation");
      const cookie = `${OLD_SESSION}=${session.sessionCookie}`;

      const accepted = await app.inject({
        method: "PATCH",
        url: "/v1/account/profile",
        headers: {
          origin: ALLOWED_ORIGIN,
          cookie,
          [env.CSRF_HEADER_NAME]: session.csrfToken,
        },
        payload: { name: "Dona Goal109" },
      });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json().data.user.name).toBe("Dona Goal109");
      expect(accepted.headers["set-cookie"]).toBeUndefined();

      const withoutToken = await app.inject({
        method: "PATCH",
        url: "/v1/account/profile",
        headers: { origin: ALLOWED_ORIGIN, cookie },
        payload: { name: "Sem token" },
      });
      expect(withoutToken.statusCode).toBe(403);
      expect(withoutToken.json().error.code).toBe("CSRF_TOKEN_REJECTED");

      const hostile = await app.inject({
        method: "PATCH",
        url: "/v1/account/profile",
        headers: {
          origin: HOSTILE_ORIGIN,
          cookie,
          [env.CSRF_HEADER_NAME]: session.csrfToken,
        },
        payload: { name: "Origem hostil" },
      });
      expect(hostile.statusCode).toBe(403);
      expect(hostile.json().error.code).toBe("CSRF_ORIGIN_REJECTED");

      const user = await getPrisma().user.findUniqueOrThrow({
        where: { id: session.userId },
      });
      expect(user.name).toBe("Dona Goal109");
      expect(await sessionCount(session)).toBe(1);
    });

    it("writes the new names and clears the old ones on login and on password change", async () => {
      const session = await business("establish");

      const login = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: {
          origin: ALLOWED_ORIGIN,
          cookie: `${OLD_SESSION}=${session.sessionCookie}; ${OLD_CSRF}=${session.csrfToken}`,
        },
        payload: { email: session.email, password: session.password },
      });
      expect(login.statusCode).toBe(200);
      expectWritten(login, NEW_SESSION);
      expect(expectWritten(login, NEW_CSRF)).toBe(csrfTokenValue(login));
      expectCleared(login, OLD_SESSION);
      expectCleared(login, OLD_CSRF);

      // Troca de senha a partir da sessão aberta com o nome antigo: a sessão
      // nova que ela estabelece já sai com os nomes novos.
      const change = await app.inject({
        method: "PATCH",
        url: "/v1/auth/password",
        headers: {
          origin: ALLOWED_ORIGIN,
          cookie: `${OLD_SESSION}=${session.sessionCookie}`,
          [env.CSRF_HEADER_NAME]: session.csrfToken,
        },
        payload: {
          currentPassword: session.password,
          newPassword: "Integration-only-109",
          confirmPassword: "Integration-only-109",
        },
      });
      expect(change.statusCode).toBe(200);
      const renewed = expectWritten(change, NEW_SESSION);
      expectWritten(change, NEW_CSRF);
      expectCleared(change, OLD_SESSION);
      expectCleared(change, OLD_CSRF);

      const read = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers: { cookie: `${NEW_SESSION}=${renewed}` },
      });
      expect(read.statusCode).toBe(200);
      expect(read.headers["set-cookie"]).toBeUndefined();
    });

    it("clears all four cookies on logout, including a logout made with the old name", async () => {
      const session = await business("logout");

      const login = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { email: session.email, password: session.password },
      });
      expect(login.statusCode).toBe(200);
      const newToken = expectWritten(login, NEW_SESSION);

      const logoutNew = await app.inject({
        method: "POST",
        url: "/v1/auth/logout",
        headers: {
          origin: ALLOWED_ORIGIN,
          cookie: `${NEW_SESSION}=${newToken}`,
          [env.CSRF_HEADER_NAME]: csrfTokenValue(login),
        },
      });
      expect(logoutNew.statusCode).toBe(200);
      for (const name of [NEW_SESSION, NEW_CSRF, OLD_SESSION, OLD_CSRF]) {
        expectCleared(logoutNew, name);
      }

      const logoutOld = await app.inject({
        method: "POST",
        url: "/v1/auth/logout",
        headers: {
          origin: ALLOWED_ORIGIN,
          cookie: `${OLD_SESSION}=${session.sessionCookie}`,
          [env.CSRF_HEADER_NAME]: session.csrfToken,
        },
      });
      expect(logoutOld.statusCode).toBe(200);
      for (const name of [NEW_SESSION, NEW_CSRF, OLD_SESSION, OLD_CSRF]) {
        expectCleared(logoutOld, name);
      }

      const rows = await getPrisma().userSession.findMany({
        where: { userId: session.userId },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.revokedReason === "LOGOUT")).toBe(true);
    });

    it("lets the new name win when both session cookies are present and differ", async () => {
      const owner = await business("both-new");
      const other = await business("both-old");

      const both = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers: {
          cookie: `${OLD_SESSION}=${other.sessionCookie}; ${NEW_SESSION}=${owner.sessionCookie}`,
        },
      });
      expect(both.statusCode).toBe(200);
      expect(both.json().data.user.id).toBe(owner.userId);
      expect(csrfTokenValue(both)).toBe(owner.csrfToken);
      expect(both.headers["set-cookie"]).toBeUndefined();

      // O nome antigo não é reserva de um nome novo recusado: com a sessão do
      // nome novo revogada, a requisição é recusada mesmo com a antiga viva.
      await getPrisma().userSession.updateMany({
        where: { userId: owner.userId },
        data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
      });
      const revokedNew = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers: {
          cookie: `${OLD_SESSION}=${other.sessionCookie}; ${NEW_SESSION}=${owner.sessionCookie}`,
        },
      });
      expect(revokedNew.statusCode).toBe(401);
      expect(revokedNew.json().error.code).toBe("UNAUTHORIZED");
    });

    it("keeps refusing a revoked session presented under the old name", async () => {
      const session = await business("legacy-revoked");
      const cookie = `${OLD_SESSION}=${session.sessionCookie}`;

      const logoutAll = await app.inject({
        method: "POST",
        url: "/v1/auth/logout-all",
        headers: {
          origin: ALLOWED_ORIGIN,
          cookie,
          [env.CSRF_HEADER_NAME]: session.csrfToken,
        },
      });
      expect(logoutAll.statusCode).toBe(200);

      const read = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers: { cookie },
      });
      expect(read.statusCode).toBe(401);
      expect(read.json().error.code).toBe("UNAUTHORIZED");
      expect(read.headers["set-cookie"]).toBeUndefined();

      const mutation = await app.inject({
        method: "PATCH",
        url: "/v1/account/profile",
        headers: {
          origin: ALLOWED_ORIGIN,
          cookie,
          [env.CSRF_HEADER_NAME]: session.csrfToken,
        },
        payload: { name: "Depois da revogação" },
      });
      expect(mutation.statusCode).toBe(401);
      expect(await sessionCount(session)).toBe(1);
    });
  },
);
