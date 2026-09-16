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
  login,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal024/WU-05: `POST /v1/auth/logout-all` ("Sair de todos os dispositivos")
 * contra persistência real.
 *
 * O que esta suíte prova:
 *
 * - toda sessão viva do usuário (a que fez a chamada e qualquer outra)
 *   deixa de autenticar na requisição seguinte, por cookie e por Bearer;
 * - a revogação é gravada com o motivo próprio `LOGOUT_ALL_DEVICES`;
 * - a rota nunca aceita identidade do chamador: um `userId`/`tenantId`
 *   declarado no corpo ou em headers (`x-user-id`, `x-tenant-id`) apontando
 *   para outro negócio não revoga a sessão desse outro negócio — a
 *   identidade usada é sempre a da sessão que autenticou a chamada,
 *   confirmando `PUBLIC_API_V1.md`.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

describe.skipIf(!RUN_INTEGRATION)(
  "POST /v1/auth/logout-all revokes sessions by caller identity only",
  () => {
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
      }
      await app.close();
    });

    it("revokes every live session so the previous one stops authenticating on the next request", async () => {
      const first = await business("logout-all-first-device");
      const second = await login(app, first);

      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/logout-all",
        headers: browserMutation(second),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual({ ok: true });
      // A resposta encerra o dispositivo que chamou também: o cookie some,
      // sem ser substituído por uma sessão nova (diferente de PATCH .../password).
      expect(cookieValue(response, env.SESSION_COOKIE_NAME)).toBe("");

      const rows = await getPrisma().userSession.findMany({
        where: { userId: first.userId },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
      expect(
        rows.every((row) => row.revokedReason === "LOGOUT_ALL_DEVICES"),
      ).toBe(true);

      for (const stale of [first, second]) {
        const byCookie = await app.inject({
          method: "GET",
          url: "/v1/auth/session",
          headers: browserRead(stale),
        });
        expect(byCookie.statusCode).toBe(401);

        const byBearer = await app.inject({
          method: "GET",
          url: "/v1/auth/session",
          headers: { authorization: `Bearer ${stale.bearer}` },
        });
        expect(byBearer.statusCode).toBe(401);
      }
    });

    it("does not accept an identity from the caller: another business's session survives a spoofed userId/tenantId", async () => {
      const owner = await business("logout-all-owner");
      const other = await business("logout-all-bystander");

      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/logout-all",
        headers: {
          ...browserMutation(owner),
          "x-tenant-id": other.tenantId,
          "x-user-id": other.userId,
        },
        // Corpo declara a identidade de outro negócio; a rota não lê `body`.
        payload: { tenantId: other.tenantId, userId: other.userId },
      });
      expect(response.statusCode).toBe(200);

      // Só a sessão de quem chamou foi revogada.
      const ownerRows = await getPrisma().userSession.findMany({
        where: { userId: owner.userId },
      });
      expect(ownerRows).toHaveLength(1);
      expect(ownerRows[0]?.revokedAt).not.toBeNull();
      expect(ownerRows[0]?.revokedReason).toBe("LOGOUT_ALL_DEVICES");

      // A sessão do outro negócio, nomeado no corpo e nos headers, continua viva.
      const otherRows = await getPrisma().userSession.findMany({
        where: { userId: other.userId },
      });
      expect(otherRows).toHaveLength(1);
      expect(otherRows[0]?.revokedAt).toBeNull();

      const stillAuthenticated = await app.inject({
        method: "GET",
        url: "/v1/auth/session",
        headers: browserRead(other),
      });
      expect(stillAuthenticated.statusCode).toBe(200);
      expect(stillAuthenticated.json().data.user.id).toBe(other.userId);
    });

    it("rejects the call without a valid session, before revoking anything", async () => {
      const bystander = await business("logout-all-no-session");

      const anonymous = await app.inject({
        method: "POST",
        url: "/v1/auth/logout-all",
        headers: { origin: ALLOWED_ORIGIN },
      });
      expect(anonymous.statusCode).toBe(401);

      const row = await getPrisma().userSession.findFirstOrThrow({
        where: { userId: bystander.userId },
      });
      expect(row.revokedAt).toBeNull();
    });
  },
);
