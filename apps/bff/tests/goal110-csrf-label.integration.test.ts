import { createHash, createHmac } from "node:crypto";

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
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal110, prova 4: a sessão nova grava o hash do token derivado com
 * `avenly:csrf:`; uma sessão aberta antes do deploy, cujo hash gravado é o do
 * rótulo `atendly:csrf:`, continua recebendo e aceitando o token antigo, sem
 * reescrita da linha e sem Set-Cookie numa leitura comum.
 *
 * Os rótulos são literais de propósito: a prova é sobre o que está gravado,
 * não sobre o que o código disser que deriva.
 */
const NEW_LABEL = "avenly:csrf:";
const OLD_LABEL = "atendly:csrf:";

function derive(label: string, sessionId: string): string {
  return createHmac("sha256", env.JWT_SECRET)
    .update(`${label}${sessionId}`)
    .digest("base64url");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, `goal110-${label}`);
  created.push(session);
  return session;
}

async function onlySession(session: SessionHandle) {
  const rows = await getPrisma().userSession.findMany({
    where: { userId: session.userId },
  });
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/** Reproduz uma sessão aberta antes do deploy: hash gravado do rótulo antigo. */
async function asLegacySession(session: SessionHandle) {
  const row = await onlySession(session);
  const legacyToken = derive(OLD_LABEL, row.id);
  await getPrisma().userSession.update({
    where: { id: row.id },
    data: { csrfTokenHash: sha256(legacyToken) },
  });
  return { sessionId: row.id, legacyToken, newToken: derive(NEW_LABEL, row.id) };
}

function mutation(session: SessionHandle, token: string, name: string) {
  return app.inject({
    method: "PATCH",
    url: "/v1/account/profile",
    headers: {
      origin: ALLOWED_ORIGIN,
      cookie: `${env.SESSION_COOKIE_NAME}=${session.sessionCookie}`,
      [env.CSRF_HEADER_NAME]: token,
    },
    payload: { name },
  });
}

describe.skipIf(!RUN_INTEGRATION)(
  "Goal110 — CSRF token under the new label, old label still honoured for old sessions",
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

    it("stores the hash of the avenly:csrf: token on login and returns that token in the header", async () => {
      const session = await business("login");
      const row = await onlySession(session);
      const expected = derive(NEW_LABEL, row.id);

      expect(session.csrfToken).toBe(expected);
      expect(row.csrfTokenHash).toBe(sha256(expected));
      expect(row.csrfTokenHash).not.toBe(sha256(derive(OLD_LABEL, row.id)));

      const login = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { email: session.email, password: session.password },
      });
      expect(login.statusCode).toBe(200);
      const rows = await getPrisma().userSession.findMany({
        where: { userId: session.userId },
      });
      const fresh = rows.find((candidate) => candidate.id !== row.id)!;
      expect(csrfTokenValue(login)).toBe(derive(NEW_LABEL, fresh.id));
      expect(fresh.csrfTokenHash).toBe(sha256(derive(NEW_LABEL, fresh.id)));
    });

    it("hands an old-label session its old token on a read, without Set-Cookie or any change to the row, and accepts it on a mutation", async () => {
      const session = await business("legacy");
      const { sessionId, legacyToken, newToken } = await asLegacySession(session);
      expect(legacyToken).not.toBe(newToken);
      const before = await getPrisma().userSession.findUniqueOrThrow({
        where: { id: sessionId },
      });

      const read = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers: { cookie: `${env.SESSION_COOKIE_NAME}=${session.sessionCookie}` },
      });
      expect(read.statusCode).toBe(200);
      expect(csrfTokenValue(read)).toBe(legacyToken);
      expect(read.headers["set-cookie"]).toBeUndefined();

      const afterRead = await getPrisma().userSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(afterRead).toEqual(before);

      const accepted = await mutation(session, legacyToken, "Dona Goal110");
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json().data.user.name).toBe("Dona Goal110");
      expect(accepted.headers["set-cookie"]).toBeUndefined();

      const afterMutation = await getPrisma().userSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(afterMutation).toEqual(before);

      const withNewLabel = await mutation(session, newToken, "Rótulo novo");
      expect(withNewLabel.statusCode).toBe(403);
      expect(withNewLabel.json().error.code).toBe("CSRF_TOKEN_REJECTED");
    });

    it("refuses an old-label token on a new session and keeps refusing a revoked old session", async () => {
      const fresh = await business("fresh");
      const freshRow = await onlySession(fresh);

      const oldOnNew = await mutation(
        fresh,
        derive(OLD_LABEL, freshRow.id),
        "Rótulo antigo",
      );
      expect(oldOnNew.statusCode).toBe(403);
      expect(oldOnNew.json().error.code).toBe("CSRF_TOKEN_REJECTED");

      const accepted = await mutation(fresh, fresh.csrfToken, "Sessão nova");
      expect(accepted.statusCode).toBe(200);

      const legacy = await business("legacy-revoked");
      const { sessionId, legacyToken } = await asLegacySession(legacy);
      await getPrisma().userSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
      });

      const read = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers: { cookie: `${env.SESSION_COOKIE_NAME}=${legacy.sessionCookie}` },
      });
      expect(read.statusCode).toBe(401);
      expect(read.json().error.code).toBe("UNAUTHORIZED");
      expect(read.headers["set-cookie"]).toBeUndefined();

      const refused = await mutation(legacy, legacyToken, "Depois da revogação");
      expect(refused.statusCode).toBe(401);
    });
  },
);
