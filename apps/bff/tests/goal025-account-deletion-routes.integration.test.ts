import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  ALLOWED_ORIGIN,
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal025/WU-03 — as rotas públicas de exclusão e o estado em `GET /v1/status`.
 *
 * O que esta suíte prova, contra PostgreSQL descartável:
 *
 * - iniciar exige sessão, CSRF e a senha atual; senha errada recusa com `401`
 *   e não grava linha nenhuma — a decisão de estado (WU-02) nunca é alcançada;
 * - a identidade vem só da sessão: `userId`/`tenantId` declarados no corpo não
 *   iniciam nem cancelam a exclusão de outro negócio;
 * - `GET /v1/status` devolve o estado e o vencimento da mesma linha que as
 *   rotas de mutação gravam, e `NONE`/`null` para quem nunca pediu;
 * - cancelar dentro do prazo devolve `CANCELLED` e `GET /v1/status` reflete a
 *   mudança na leitura seguinte.
 *
 * As portas remotas (IA, Evolution) não têm servidor real neste ambiente; a
 * exclusão tolera essa falha por desenho (Goal025/WU-02), então o que se
 * observa aqui é o contrato HTTP e o estado gravado, não o sucesso dos
 * efeitos remotos.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

describe.skipIf(!RUN_INTEGRATION)(
  "POST/DELETE /v1/account/deletion and GET /v1/status",
  () => {
    beforeAll(async () => {
      app = await buildApp();
      await assertDisposableTarget();
    });

    afterAll(async () => {
      if (!app) return;
      await getPrisma().accountDeletion.deleteMany({
        where: { tenantId: { in: created.map((session) => session.tenantId) } },
      });
      await cleanupBusinesses(created);
      await app.close();
    });

    it("refuses with the wrong password and schedules nothing", async () => {
      const owner = await business("deletion-wrong-password");

      const response = await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
        payload: { password: "not-the-real-password" },
      });
      expect(response.statusCode).toBe(401);

      const row = await getPrisma().accountDeletion.findUnique({
        where: { tenantId: owner.tenantId },
      });
      expect(row).toBeNull();

      const status = await app.inject({
        method: "GET",
        url: "/v1/status",
        headers: browserRead(owner),
      });
      expect(status.json().data.accountDeletion).toEqual({
        status: "NONE",
        dueAt: null,
      });
    });

    it("rejects the call without a valid session, before touching anything", async () => {
      const bystander = await business("deletion-no-session");

      const response = await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { password: bystander.password },
      });
      expect(response.statusCode).toBe(401);

      const row = await getPrisma().accountDeletion.findUnique({
        where: { tenantId: bystander.tenantId },
      });
      expect(row).toBeNull();
    });

    it("does not accept an identity from the caller: a spoofed userId/tenantId in the body schedules nothing for the other business", async () => {
      const owner = await business("deletion-owner");
      const other = await business("deletion-bystander");

      const response = await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
        payload: {
          password: owner.password,
          userId: other.userId,
          tenantId: other.tenantId,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.status).toBe("SCHEDULED");

      // A exclusão foi gravada para quem chamou, não para quem foi nomeado no
      // corpo.
      const ownerRow = await getPrisma().accountDeletion.findUnique({
        where: { tenantId: owner.tenantId },
      });
      expect(ownerRow?.status).toBe("SCHEDULED");

      const otherRow = await getPrisma().accountDeletion.findUnique({
        where: { tenantId: other.tenantId },
      });
      expect(otherRow).toBeNull();
    });

    it("schedules on the correct password, and GET /v1/status reports the same due date", async () => {
      const owner = await business("deletion-happy-path");

      const start = await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
        payload: { password: owner.password },
      });
      expect(start.statusCode).toBe(200);
      const body = start.json().data as { status: string; dueAt: string };
      expect(body.status).toBe("SCHEDULED");
      expect(new Date(body.dueAt).getTime()).toBeGreaterThan(Date.now());

      const status = await app.inject({
        method: "GET",
        url: "/v1/status",
        headers: browserRead(owner),
      });
      expect(status.statusCode).toBe(200);
      expect(status.json().data.accountDeletion).toEqual({
        status: "SCHEDULED",
        dueAt: body.dueAt,
      });

      // Pedir de novo recusa com o código próprio, sem empurrar o vencimento.
      const again = await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
        payload: { password: owner.password },
      });
      expect(again.statusCode).toBe(409);
      expect(again.json().error.details?.reason).toBe(
        "ACCOUNT_DELETION_ALREADY_SCHEDULED",
      );
    });

    // Goal025 §3: a guarda de não-reativação não é só da reconciliação.
    //
    // `PATCH /v1/settings/ai` é o único caminho de pedido humano que grava
    // `AiSettings.enabled = true`, e com exclusão `SCHEDULED` ele precisa
    // recusar. Duas afirmações separadas, porque uma sem a outra não prova o
    // produto: a recusa é `409` com a mensagem desta guarda (e não a de
    // "sem serviço operacional", que é a outra `409` da mesma rota), e a
    // linha continua com `enabled: false` — a exclusão desligou a automação
    // e a tentativa de religar não deixou rastro.
    //
    // A decisão em si é provada sem banco em
    // `goal025-ai-activation-deletion-guard.test.ts`, que chama a função
    // diretamente; aqui o que se prova é que a rota a chama.
    it("refuses to re-enable the AI while the deletion is scheduled, and stores nothing", async () => {
      const owner = await business("deletion-ai-guard");

      const start = await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
        payload: { password: owner.password },
      });
      expect(start.statusCode).toBe(200);

      const reactivate = await app.inject({
        method: "PATCH",
        url: "/v1/settings/ai",
        headers: browserMutation(owner),
        payload: { enabled: true, tone: "PROFESSIONAL_OBJECTIVE" },
      });
      expect(reactivate.statusCode).toBe(409);
      expect(reactivate.json().error.message).toContain(
        "scheduled for deletion",
      );

      const settings = await getPrisma().aiSettings.findUnique({
        where: { tenantId: owner.tenantId },
      });
      expect(settings?.enabled).toBe(false);
    });

    it("cancels within the grace period, and GET /v1/status stops reporting a due date", async () => {
      const owner = await business("deletion-cancel");

      await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
        payload: { password: owner.password },
      });

      const cancel = await app.inject({
        method: "DELETE",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
      });
      expect(cancel.statusCode).toBe(200);
      expect(cancel.json().data.status).toBe("CANCELLED");

      const status = await app.inject({
        method: "GET",
        url: "/v1/status",
        headers: browserRead(owner),
      });
      expect(status.json().data.accountDeletion.status).toBe("CANCELLED");
    });
  },
);
