/**
 * Goal061 §7.4, WU-02: leitura do preview gravado e os campos `interrupted`,
 * `lastError` e `failedReasons`.
 *
 * Prova aqui, sobre o dublê de banco: o preview lido bate com o gravado pela
 * análise sem tocar a origem; sessão sem análise é recusada com código
 * próprio; lease vencido em `ANALYZING`/`EXECUTING` aparece como
 * `interrupted`, sempre pelo relógio do **banco** (`advanceDatabaseClock`,
 * nunca `sleep`); `failedReasons` conta itens `FAILED` por motivo; e duas
 * sessões de negócios diferentes não se enxergam nas rotas novas.
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import { ImportCompletionService } from "../../src/modules/migrations/import-completion-service.js";
import { isImportSessionInterrupted } from "../../src/modules/migrations/import-lease.js";
import {
  IMPORT_SESSION_PREVIEW_NOT_AVAILABLE,
  ImportPreviewService,
} from "../../src/modules/migrations/import-preview-service.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

type Database = ReturnType<typeof createDatabaseDouble>;

const tenantA = "tenant-goal061-read-a";
const tenantB = "tenant-goal061-read-b";

const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

function seedSession(
  db: Database,
  tenantId: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return db.client.importSession.create({
    data: {
      tenantId,
      provider: "MINHA_AGENDA",
      sourceAccountId: "account-1",
      sourceAccountLabel: null,
      connectionId: null,
      status: "READY",
      previewVersion: 0,
      createdBy: "owner-1",
      ...overrides,
    },
  });
}

function seedCategory(
  db: Database,
  tenantId: string,
  sessionId: string,
  category: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return db.client.importSessionCategory.create({
    data: {
      tenantId,
      sessionId,
      category,
      sourceReportedCount: 10,
      readCount: 10,
      discoveredCount: 10,
      pendingCount: 10,
      previewVersion: 1,
      ...overrides,
    },
  });
}

function seedItem(
  db: Database,
  tenantId: string,
  sessionId: string,
  category: string,
  externalId: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return db.client.importItem.create({
    data: {
      tenantId,
      sessionId,
      category,
      externalId,
      ...overrides,
    },
  });
}

describe("goal061: reading the recorded preview never touches the origin", () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabaseDouble();
  });

  it("matches what the analysis persisted in ImportSessionCategory", async () => {
    const session = await seedSession(db, tenantA, {
      previewVersion: 2,
      previewGeneratedAt: new Date("2026-09-27T12:00:00.000Z"),
    });
    await seedCategory(db, tenantA, session.id, "SERVICE", {
      discoveredCount: 5,
      pendingCount: 3,
      importedCount: 2,
      previewVersion: 2,
    });
    await seedCategory(db, tenantA, session.id, "CUSTOMER", {
      discoveredCount: 1,
      pendingCount: 1,
      previewVersion: 2,
    });

    const preview = await new ImportPreviewService(
      db.client as unknown as PrismaClient,
    ).getPreview({ tenantId: tenantA, sessionId: session.id });

    expect(preview).toEqual({
      sessionId: session.id,
      previewVersion: 2,
      generatedAt: "2026-09-27T12:00:00.000Z",
      categories: [
        {
          category: "SERVICE",
          sourceSupported: true,
          limitationCode: null,
          limitationDetail: null,
          sourceReportedCount: 10,
          readCount: 10,
          discoveredCount: 5,
          pendingCount: 3,
          needsReviewCount: 0,
          importedCount: 2,
          skippedCount: 0,
          failedCount: 0,
        },
        {
          category: "CUSTOMER",
          sourceSupported: true,
          limitationCode: null,
          limitationDetail: null,
          sourceReportedCount: 10,
          readCount: 10,
          discoveredCount: 1,
          pendingCount: 1,
          needsReviewCount: 0,
          importedCount: 0,
          skippedCount: 0,
          failedCount: 0,
        },
      ],
    });
  });

  it("refuses a session that has never been analyzed with its own code", async () => {
    const session = await seedSession(db, tenantA, {
      status: "DRAFT",
      previewVersion: 0,
    });
    const preview = new ImportPreviewService(
      db.client as unknown as PrismaClient,
    );

    await expect(
      preview.getPreview({ tenantId: tenantA, sessionId: session.id }),
    ).rejects.toMatchObject({
      code: IMPORT_SESSION_PREVIEW_NOT_AVAILABLE,
      statusCode: 409,
    });
  });

  it("a session from another business is not found, not read", async () => {
    const session = await seedSession(db, tenantA, { previewVersion: 1 });
    await seedCategory(db, tenantA, session.id, "SERVICE");
    const preview = new ImportPreviewService(
      db.client as unknown as PrismaClient,
    );

    await expect(
      preview.getPreview({ tenantId: tenantB, sessionId: session.id }),
    ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_FOUND" });
  });
});

describe("goal061: isImportSessionInterrupted is decided by the database clock", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");
  const past = new Date(now.getTime() - 1_000);
  const future = new Date(now.getTime() + 1_000);

  it("a session that is not working is never interrupted", () => {
    for (const status of ["DRAFT", "READY", "PARTIAL", "COMPLETED", "FAILED", "SUPERSEDED"] as const) {
      expect(
        isImportSessionInterrupted(
          { status, leaseOwner: null, leaseExpiresAt: null },
          now,
        ),
      ).toBe(false);
    }
  });

  it("ANALYZING or EXECUTING with a live lease is not interrupted", () => {
    for (const status of ["ANALYZING", "EXECUTING"] as const) {
      expect(
        isImportSessionInterrupted(
          { status, leaseOwner: "owner-1", leaseExpiresAt: future },
          now,
        ),
      ).toBe(false);
    }
  });

  it("ANALYZING or EXECUTING with an expired lease is interrupted", () => {
    for (const status of ["ANALYZING", "EXECUTING"] as const) {
      expect(
        isImportSessionInterrupted(
          { status, leaseOwner: "owner-1", leaseExpiresAt: past },
          now,
        ),
      ).toBe(true);
    }
  });

  it("EXECUTING without a lease owner is interrupted (a work failure that keeps the status)", () => {
    expect(
      isImportSessionInterrupted(
        { status: "EXECUTING", leaseOwner: null, leaseExpiresAt: null },
        now,
      ),
    ).toBe(true);
  });
});

describe("goal061: getLiveSession reports interrupted and lastError by the database clock", () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabaseDouble();
  });

  it("a live EXECUTING session with an expired lease is interrupted", async () => {
    const session = await seedSession(db, tenantA, {
      status: "EXECUTING",
      previewVersion: 1,
      leaseOwner: "scheduling:1:abc",
      leaseAcquiredAt: new Date(),
      leaseExpiresAt: new Date(),
    });
    // O relógio do banco anda; o do processo não.
    db.advanceDatabaseClock(60_000);

    const live = await new ImportCompletionService(
      db.client as unknown as PrismaClient,
    ).getLiveSession(tenantA);

    expect(live?.sessionId).toBe(session.id);
    expect(live?.interrupted).toBe(true);
    expect(live?.lastError).toBeNull();
  });

  it("a session with a recorded errorCode reports lastError.code", async () => {
    await seedSession(db, tenantA, {
      status: "PARTIAL",
      previewVersion: 1,
      errorCode: "IMPORT_SOURCE_UNAVAILABLE",
      errorMessage: "The import source could not be reached.",
    });

    const live = await new ImportCompletionService(
      db.client as unknown as PrismaClient,
    ).getLiveSession(tenantA);

    expect(live?.interrupted).toBe(false);
    expect(live?.lastError).toEqual({ code: "IMPORT_SOURCE_UNAVAILABLE" });
  });
});

describe("goal061: the new routes are read-only and tenant-scoped", () => {
  let db: Database;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabaseDouble();
    app = Fastify();
    await registerManagementRoutes(app, db.client as unknown as PrismaClient);
    app.setErrorHandler((error, request, reply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: { code: error.code, message: error.message },
          requestId: request.id,
        });
      }
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR" } });
    });
  });

  afterEach(async () => {
    await app.close();
  });

  function headers(tenantId: string) {
    return {
      authorization: `Bearer ${bffToken}`,
      "x-tenant-id": tenantId,
      "x-user-id": "owner-1",
      "x-request-id": "req-goal061-read",
    };
  }

  function getPreview(tenantId: string, sessionId: string) {
    return app.inject({
      method: "GET",
      url: `/internal/calendar/imports/${sessionId}/preview`,
      headers: headers(tenantId),
    });
  }

  it("GET preview: 200 with the recorded categories for the owning business", async () => {
    const session = await seedSession(db, tenantA, { previewVersion: 1 });
    await seedCategory(db, tenantA, session.id, "SERVICE", {
      discoveredCount: 2,
      pendingCount: 2,
    });

    const response = await getPreview(tenantA, session.id);

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      sessionId: session.id,
      previewVersion: 1,
      categories: [expect.objectContaining({ category: "SERVICE", discoveredCount: 2 })],
    });
  });

  it("GET preview: 409 with its own code for a session that was never analyzed", async () => {
    const session = await seedSession(db, tenantA, {
      status: "DRAFT",
      previewVersion: 0,
    });

    const response = await getPreview(tenantA, session.id);

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe(
      IMPORT_SESSION_PREVIEW_NOT_AVAILABLE,
    );
  });

  it("GET preview: a different business's session is not found", async () => {
    const session = await seedSession(db, tenantA, { previewVersion: 1 });
    await seedCategory(db, tenantA, session.id, "SERVICE");

    const response = await getPreview(tenantB, session.id);

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("IMPORT_SESSION_NOT_FOUND");
  });

  it("GET progress: failedReasons counts FAILED items by reasonCode and category, and reports interrupted/lastError", async () => {
    const session = await seedSession(db, tenantA, {
      status: "EXECUTING",
      previewVersion: 1,
      leaseOwner: "scheduling:1:abc",
      leaseAcquiredAt: new Date(),
      leaseExpiresAt: new Date(),
      errorCode: null,
    });
    await seedItem(db, tenantA, session.id, "SERVICE", "1", {
      status: "FAILED",
      reasonCode: "IMPORT_ITEM_FAILED",
    });
    await seedItem(db, tenantA, session.id, "SERVICE", "2", {
      status: "FAILED",
      reasonCode: "IMPORT_ITEM_FAILED",
    });
    await seedItem(db, tenantA, session.id, "SERVICE", "3", {
      status: "FAILED",
      reasonCode: "IMPORT_SOURCE_RECORD_INVALID",
    });
    await seedItem(db, tenantA, session.id, "SERVICE", "4", {
      status: "IMPORTED",
    });
    db.advanceDatabaseClock(60_000);

    const response = await app.inject({
      method: "GET",
      url: `/internal/calendar/imports/${session.id}/progress`,
      headers: headers(tenantA),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.interrupted).toBe(true);
    expect(body.lastError).toBeNull();
    const serviceCategory = body.categories.find(
      (entry: { category: string }) => entry.category === "SERVICE",
    );
    expect(serviceCategory.failed).toBe(3);
    expect(serviceCategory.failedReasons).toEqual(
      expect.arrayContaining([
        { reasonCode: "IMPORT_ITEM_FAILED", count: 2 },
        { reasonCode: "IMPORT_SOURCE_RECORD_INVALID", count: 1 },
      ]),
    );
  });

  it("GET progress: a different business's session is not found", async () => {
    const session = await seedSession(db, tenantA, { previewVersion: 1 });

    const response = await app.inject({
      method: "GET",
      url: `/internal/calendar/imports/${session.id}/progress`,
      headers: headers(tenantB),
    });

    expect(response.statusCode).toBe(404);
  });

  it("GET imports: session.interrupted and session.lastError reflect the lease and the recorded cause", async () => {
    await seedSession(db, tenantA, {
      status: "EXECUTING",
      previewVersion: 1,
      leaseOwner: "scheduling:1:abc",
      leaseAcquiredAt: new Date(),
      leaseExpiresAt: new Date(),
      errorCode: "IMPORT_SOURCE_UNAVAILABLE",
    });
    db.advanceDatabaseClock(60_000);

    const response = await app.inject({
      method: "GET",
      url: "/internal/calendar/imports",
      headers: headers(tenantA),
    });

    expect(response.statusCode).toBe(200);
    const { session } = response.json().data;
    expect(session.interrupted).toBe(true);
    expect(session.lastError).toEqual({ code: "IMPORT_SOURCE_UNAVAILABLE" });
  });
});
