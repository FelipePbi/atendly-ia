/**
 * Rotas internas da importação única (Goal010, WU-08).
 *
 * Cobre o que é responsabilidade da rota — autenticação, derivação de
 * source/ator do chamador, `Idempotency-Key`, erros próprios e distinguíveis,
 * paginação e progresso lido do banco — sem reprovar o que já é do domínio
 * (WU-02 a WU-07): a leitura de rede da origem (`MinhaAgendaCalendarProvider`)
 * nunca é exercitada aqui, porque nenhum destes testes chega ao ponto em que
 * `analyze`/`execute` a invocariam de verdade (a checagem de estado da sessão
 * e de versão do preview sempre decide antes disso).
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import { encryptIntegrationCredentials } from "../../src/modules/integrations/credentials.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

type Database = ReturnType<typeof createDatabaseDouble>;

const tenantId = "tenant-a";
const otherTenantId = "tenant-b";
const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);
const aiToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "ai-orchestrator",
  SERVICE_AUDIENCE,
  "command",
);

const rawCredentials = {
  basicAuth: "super-secret-basic-auth",
  username: "minha-agenda-user",
  password: "super-secret-password",
};

async function buildTestApp(client: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify();
  await registerManagementRoutes(app, client);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        requestId: request.id,
      });
    }
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: (error as Error).message },
      requestId: request.id,
    });
  });
  return app;
}

function headers(
  extra: Partial<{ userId: string; requestId: string; token: string }> = {},
) {
  return {
    authorization: `Bearer ${extra.token ?? bffToken}`,
    "x-tenant-id": tenantId,
    "x-user-id": extra.userId ?? "professional-1",
    "x-request-id": extra.requestId ?? "req-1",
    "content-type": "application/json",
  };
}

function seedCalendar(db: Database, timezone = "America/Sao_Paulo") {
  db.client.calendarSettings.rows.push({
    id: "settings-1",
    tenantId,
    source: "MINHA_AGENDA",
    timezone,
  } as never);
}

function seedConnection(db: Database) {
  db.client.integrationConnection.rows.push({
    id: "connection-1",
    tenantId,
    provider: "MINHA_AGENDA",
    status: "CONNECTED",
    credentialsEncrypted: encryptIntegrationCredentials(
      tenantId,
      rawCredentials,
    ),
    config: {
      baseUrl: "https://minha-agenda.example.com",
      employeeId: 1,
      paymentMethod: "cash",
      modelVersion: 2,
      timeoutMs: 10_000,
      refreshSkewSeconds: 300,
      enableWrites: false,
      bufferBetweenServicesMinutes: 0,
    },
  } as never);
}

function seedSession(
  db: Database,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return db.client.importSession.create({
    data: {
      tenantId,
      provider: "MINHA_AGENDA",
      sourceAccountId: "external-account-1",
      sourceAccountLabel: null,
      connectionId: "connection-1",
      status: "READY",
      previewVersion: 1,
      createdBy: "seed-user",
      ...overrides,
    },
  });
}

function seedItem(
  db: Database,
  sessionId: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return db.client.importItem.create({
    data: {
      tenantId,
      sessionId,
      category: "SERVICE",
      externalId: "ext-1",
      label: "Corte de cabelo",
      status: "PENDING",
      ...overrides,
    },
  });
}

describe("import routes (Goal010, WU-08)", () => {
  let db: Database;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabaseDouble();
    app = await buildTestApp(db.client as unknown as PrismaClient);
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /internal/calendar/imports (registrar origem)", () => {
    it("requires Idempotency-Key", async () => {
      seedConnection(db);
      const response = await app.inject({
        method: "POST",
        url: "/internal/calendar/imports",
        headers: headers(),
        payload: { sourceAccountId: "acc-1" },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("requires an existing origin connection", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/internal/calendar/imports",
        headers: { ...headers(), "idempotency-key": "start-1" },
        payload: { sourceAccountId: "acc-1" },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe(
        "INTEGRATION_CONNECTION_NOT_FOUND",
      );
    });

    it("opens a session and derives the actor from the caller, ignoring the body", async () => {
      seedConnection(db);
      const response = await app.inject({
        method: "POST",
        url: "/internal/calendar/imports",
        headers: { ...headers({ userId: "professional-7" }), "idempotency-key": "start-1" },
        payload: {
          sourceAccountId: "acc-1",
          // Campos fora do contrato: `z.object` descarta o que não declarou.
          userId: "spoofed-user",
          tenantId: "spoofed-tenant",
          source: "AI",
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json().data;
      expect(body.created).toBe(true);
      const row = db.tables.importSession.rows.find(
        (candidate) => candidate.id === body.sessionId,
      );
      expect(row?.createdBy).toBe("professional-7");
      expect(row?.tenantId).toBe(tenantId);
      expect(JSON.stringify(response.json())).not.toContain("spoofed");
    });

    it("returns the same result on a retried Idempotency-Key", async () => {
      seedConnection(db);
      const payload = { sourceAccountId: "acc-1" };
      const first = await app.inject({
        method: "POST",
        url: "/internal/calendar/imports",
        headers: { ...headers(), "idempotency-key": "start-retry" },
        payload,
      });
      const second = await app.inject({
        method: "POST",
        url: "/internal/calendar/imports",
        headers: { ...headers(), "idempotency-key": "start-retry" },
        payload,
      });
      expect(second.json().data).toEqual(first.json().data);
      expect(db.tables.importSession.rows.length).toBe(1);
    });

    it("rejects the AI caller", async () => {
      seedConnection(db);
      const response = await app.inject({
        method: "POST",
        url: "/internal/calendar/imports",
        headers: {
          ...headers({ token: aiToken }),
          "idempotency-key": "start-ai",
        },
        payload: { sourceAccountId: "acc-1" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("AI_CALLER_NOT_ALLOWED");
    });

    it("never leaks the stored credential", async () => {
      seedConnection(db);
      const response = await app.inject({
        method: "POST",
        url: "/internal/calendar/imports",
        headers: { ...headers(), "idempotency-key": "start-secret" },
        payload: { sourceAccountId: "acc-1" },
      });
      const raw = JSON.stringify(response.json());
      expect(raw).not.toContain(rawCredentials.basicAuth);
      expect(raw).not.toContain(rawCredentials.password);
    });
  });

  describe("GET /internal/calendar/imports/:sessionId/categories/:category/items", () => {
    it("404s for an unknown session", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/internal/calendar/imports/missing/categories/SERVICE/items",
        headers: headers(),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("IMPORT_SESSION_NOT_FOUND");
    });

    it("paginates items within a category and filters conflicts by status", async () => {
      const session = await seedSession(db);
      for (let index = 0; index < 5; index += 1) {
        await seedItem(db, session.id, {
          externalId: `ext-${index}`,
          status: index % 2 === 0 ? "NEEDS_REVIEW" : "PENDING",
        });
      }
      // Outra categoria não deve aparecer na página.
      await seedItem(db, session.id, {
        category: "CUSTOMER",
        externalId: "cust-1",
      });

      const page1 = await app.inject({
        method: "GET",
        url: `/internal/calendar/imports/${session.id}/categories/SERVICE/items?limit=2&offset=0`,
        headers: headers(),
      });
      expect(page1.statusCode).toBe(200);
      const body1 = page1.json().data;
      expect(body1.total).toBe(5);
      expect(body1.items).toHaveLength(2);
      expect(body1.items[0].externalId).toBe("ext-0");

      const conflicts = await app.inject({
        method: "GET",
        url: `/internal/calendar/imports/${session.id}/categories/SERVICE/items?status=NEEDS_REVIEW`,
        headers: headers(),
      });
      const conflictsBody = conflicts.json().data;
      expect(conflictsBody.total).toBe(3);
      expect(
        conflictsBody.items.every(
          (item: { status: string }) => item.status === "NEEDS_REVIEW",
        ),
      ).toBe(true);
    });
  });

  describe("POST /internal/calendar/imports/:sessionId/items/:itemId/decision", () => {
    it("requires Idempotency-Key", async () => {
      const session = await seedSession(db);
      const item = await seedItem(db, session.id, { status: "NEEDS_REVIEW" });
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/items/${item.id}/decision`,
        headers: headers(),
        payload: { decision: "EXCLUDE" },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("excludes an item and derives the decider from the caller, ignoring the body", async () => {
      const session = await seedSession(db);
      const item = await seedItem(db, session.id, { status: "NEEDS_REVIEW" });
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/items/${item.id}/decision`,
        headers: {
          ...headers({ userId: "professional-9" }),
          "idempotency-key": "decision-1",
        },
        payload: { decision: "EXCLUDE", decidedBy: "spoofed-decider" },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json().data;
      expect(body.item.status).toBe("SKIPPED");
      expect(body.decision.decidedBy).toBe("professional-9");
      const row = db.tables.importDecision.rows.find(
        (candidate) => candidate.itemId === item.id,
      );
      expect(row?.decidedBy).toBe("professional-9");
    });

    it("rejects deciding the same item twice", async () => {
      const session = await seedSession(db);
      const item = await seedItem(db, session.id, { status: "NEEDS_REVIEW" });
      await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/items/${item.id}/decision`,
        headers: { ...headers(), "idempotency-key": "decision-a" },
        payload: { decision: "EXCLUDE" },
      });
      const second = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/items/${item.id}/decision`,
        headers: { ...headers(), "idempotency-key": "decision-b" },
        payload: { decision: "EXCLUDE" },
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("IMPORT_ITEM_ALREADY_DECIDED");
    });

    it("returns the same result on a retried Idempotency-Key without deciding twice", async () => {
      const session = await seedSession(db);
      const item = await seedItem(db, session.id, { status: "NEEDS_REVIEW" });
      const payload = { decision: "EXCLUDE" as const };
      const first = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/items/${item.id}/decision`,
        headers: { ...headers(), "idempotency-key": "decision-retry" },
        payload,
      });
      const second = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/items/${item.id}/decision`,
        headers: { ...headers(), "idempotency-key": "decision-retry" },
        payload,
      });
      expect(second.json().data).toEqual(first.json().data);
      expect(
        db.tables.importDecision.rows.filter(
          (candidate) => candidate.itemId === item.id,
        ),
      ).toHaveLength(1);
    });

    it("merges with an existing record and maps the source identity", async () => {
      db.client.service.rows.push({
        id: "service-existing",
        tenantId,
        name: "Corte",
      } as never);
      const session = await seedSession(db);
      const item = await seedItem(db, session.id, {
        category: "SERVICE",
        status: "NEEDS_REVIEW",
      });
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/items/${item.id}/decision`,
        headers: { ...headers(), "idempotency-key": "decision-merge" },
        payload: {
          decision: "MERGE_WITH_EXISTING",
          targetInternalId: "service-existing",
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json().data;
      expect(body.item.status).toBe("IMPORTED");
      expect(body.item.internalId).toBe("service-existing");
      const map = db.tables.externalEntityMap.rows.find(
        (row) => row.externalId === item.externalId,
      );
      expect(map?.internalId).toBe("service-existing");
    });

    it("requires a targetInternalId for MERGE_WITH_EXISTING", async () => {
      const session = await seedSession(db);
      const item = await seedItem(db, session.id, { status: "NEEDS_REVIEW" });
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/items/${item.id}/decision`,
        headers: { ...headers(), "idempotency-key": "decision-no-target" },
        payload: { decision: "MERGE_WITH_EXISTING" },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects MERGE_WITH_EXISTING for a category without matching", async () => {
      const session = await seedSession(db);
      const item = await seedItem(db, session.id, {
        category: "TIME_BLOCK",
        status: "NEEDS_REVIEW",
      });
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/items/${item.id}/decision`,
        headers: { ...headers(), "idempotency-key": "decision-category" },
        payload: {
          decision: "MERGE_WITH_EXISTING",
          targetInternalId: "whatever",
        },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe(
        "IMPORT_DECISION_NOT_SUPPORTED_FOR_CATEGORY",
      );
    });
  });

  describe("GET /internal/calendar/imports/:sessionId/progress", () => {
    it("404s for an unknown session", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/internal/calendar/imports/missing/progress",
        headers: headers(),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("IMPORT_SESSION_NOT_FOUND");
    });

    it("reflects real counts read from the item rows, not the session's cached counters", async () => {
      // A sessão nasce com todos os contadores zerados (default do dublê);
      // só os itens abaixo têm o estado real.
      const session = await seedSession(db);
      await seedItem(db, session.id, { externalId: "s-1", status: "IMPORTED" });
      await seedItem(db, session.id, { externalId: "s-2", status: "PENDING" });
      await seedItem(db, session.id, {
        category: "CUSTOMER",
        externalId: "c-1",
        status: "NEEDS_REVIEW",
      });

      const response = await app.inject({
        method: "GET",
        url: `/internal/calendar/imports/${session.id}/progress`,
        headers: headers(),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json().data;
      expect(body.counts).toEqual({
        pending: 1,
        imported: 1,
        skipped: 0,
        failed: 0,
        needsReview: 1,
      });
      const serviceCategory = body.categories.find(
        (entry: { category: string }) => entry.category === "SERVICE",
      );
      expect(serviceCategory.pending).toBe(1);
      expect(serviceCategory.imported).toBe(1);
      const customerCategory = body.categories.find(
        (entry: { category: string }) => entry.category === "CUSTOMER",
      );
      expect(customerCategory.needsReview).toBe(1);
    });
  });

  describe("POST /internal/calendar/imports/:sessionId/analyze", () => {
    it("requires Idempotency-Key", async () => {
      const session = await seedSession(db);
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/analyze`,
        headers: headers(),
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("requires an existing origin connection", async () => {
      seedCalendar(db);
      const session = await seedSession(db);
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/analyze`,
        headers: { ...headers(), "idempotency-key": "analyze-1" },
        payload: {},
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe(
        "INTEGRATION_CONNECTION_NOT_FOUND",
      );
    });

    it("requires calendar settings to be configured", async () => {
      const session = await seedSession(db);
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/analyze`,
        headers: { ...headers(), "idempotency-key": "analyze-2" },
        payload: {},
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("CALENDAR_SETTINGS_NOT_FOUND");
    });
  });

  describe("POST /internal/calendar/imports/:sessionId/execute", () => {
    it("requires Idempotency-Key", async () => {
      const session = await seedSession(db);
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/execute`,
        headers: headers(),
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("requires an existing origin connection", async () => {
      seedCalendar(db);
      const session = await seedSession(db);
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/execute`,
        headers: { ...headers(), "idempotency-key": "execute-1" },
        payload: { previewVersion: 1 },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe(
        "INTEGRATION_CONNECTION_NOT_FOUND",
      );
    });

    it("rejects a session that is not executable", async () => {
      seedCalendar(db);
      seedConnection(db);
      const session = await seedSession(db, { status: "DRAFT" });
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/execute`,
        headers: { ...headers(), "idempotency-key": "execute-2" },
        payload: { previewVersion: 1 },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("IMPORT_SESSION_NOT_EXECUTABLE");
    });

    it("recusa executar sem declarar a versao de preview aprovada", async () => {
      seedCalendar(db);
      seedConnection(db);
      const session = await seedSession(db, {
        status: "READY",
        previewVersion: 3,
      });
      // Sem o campo, executar rodaria sobre a versao vigente qualquer que
      // fosse ela — a recusa de preview obsoleto viraria opt-in de quem
      // chama. O contrato exige a versao, e o corpo vazio nao passa.
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/execute`,
        headers: { ...headers(), "idempotency-key": "execute-0" },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(response.json().error.details).toMatchObject({
        previewVersion: expect.any(Array),
      });
    });

    it("rejects a stale preview version", async () => {
      seedCalendar(db);
      seedConnection(db);
      const session = await seedSession(db, {
        status: "READY",
        previewVersion: 3,
      });
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/execute`,
        headers: { ...headers(), "idempotency-key": "execute-3" },
        payload: { previewVersion: 2 },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("IMPORT_PREVIEW_STALE");
    });

    it("rejects a session whose lease another instance already holds", async () => {
      seedCalendar(db);
      seedConnection(db);
      const farFuture = new Date(Date.now() + 60_000);
      const session = await seedSession(db, {
        status: "EXECUTING",
        leaseOwner: "another-instance",
        leaseExpiresAt: farFuture,
      });
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/execute`,
        headers: { ...headers(), "idempotency-key": "execute-4" },
        payload: { previewVersion: 1 },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("IMPORT_SESSION_LEASE_HELD");
    });
  });

  describe("POST /internal/calendar/imports/:sessionId/complete", () => {
    it("requires Idempotency-Key", async () => {
      const session = await seedSession(db);
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/complete`,
        headers: headers(),
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("requires explicit acceptance when items remain unresolved", async () => {
      const session = await seedSession(db, { status: "PARTIAL" });
      await seedItem(db, session.id, { status: "PENDING" });
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/complete`,
        headers: { ...headers(), "idempotency-key": "complete-1" },
        payload: {},
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe(
        "IMPORT_PENDING_ACCEPTANCE_REQUIRED",
      );
    });

    it("completes and derives the completedBy actor from the caller", async () => {
      const session = await seedSession(db, { status: "READY" });
      await seedItem(db, session.id, { status: "IMPORTED" });
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${session.id}/complete`,
        headers: {
          ...headers({ userId: "professional-5" }),
          "idempotency-key": "complete-2",
        },
        payload: { completedBy: "spoofed-completer" },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json().data;
      expect(body.status).toBe("COMPLETED");
      expect(body.completedBy).toBe("professional-5");
    });

    it("refuses a second import for the same business", async () => {
      const completed = await seedSession(db, {
        status: "COMPLETED",
        completedAt: new Date(),
        completedBy: "professional-1",
      });
      const another = await seedSession(db, {
        sourceAccountId: "external-account-2",
        status: "READY",
      });
      void completed;
      const response = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${another.id}/complete`,
        headers: { ...headers(), "idempotency-key": "complete-3" },
        payload: {},
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("IMPORT_ALREADY_COMPLETED");
    });
  });

  describe("tenant isolation", () => {
    it("does not find another tenant's session", async () => {
      const session = await seedSession(db);
      const response = await app.inject({
        method: "GET",
        url: `/internal/calendar/imports/${session.id}/progress`,
        headers: { ...headers(), "x-tenant-id": otherTenantId },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("IMPORT_SESSION_NOT_FOUND");
    });
  });
});
