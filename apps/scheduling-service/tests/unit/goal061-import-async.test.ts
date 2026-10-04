/**
 * Goal061 §7.2: o trabalho da importação em segundo plano grava a falha com
 * causa, sem segredo, e devolve a sessão ao estado de partida.
 *
 * Tudo aqui roda sobre o dublê de banco; a concorrência real, o relógio do
 * banco e a rota contra PostgreSQL ficam em
 * `tests/integration/goal061-import-async.test.ts`.
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import { ImportExecutionService } from "../../src/modules/migrations/import-execution-service.js";
import {
  IMPORT_WORK_ERROR_CODES,
  ImportBackgroundWork,
  importWorkFailure,
} from "../../src/modules/migrations/import-lease.js";
import { ImportPreviewService } from "../../src/modules/migrations/import-preview-service.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

type Database = ReturnType<typeof createDatabaseDouble>;

const tenantId = "tenant-goal061";
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-09-27",
};

// Segredos do teste: nenhum deles pode aparecer em `errorMessage`.
const SECRET_EMAIL = "dona.ana@salao-exemplo.com.br";
const SECRET_PASSWORD = "senha-super-secreta-123";
const SECRET_TOKEN = "eyJhbGciOiJIUzI1NiJ9.token-de-acesso.assinatura";

function category(name: string, records: unknown[] = []) {
  return {
    category: name,
    coverage: {
      sourceSupported: true,
      sourceReportedCount: null,
      readCount: records.length,
      limitationCode: null,
      limitationDetail: null,
    },
    records,
  };
}

function snapshot() {
  return {
    generatedAt: "2026-09-27T12:00:00.000Z",
    services: category("SERVICE", [
      {
        externalId: "900",
        raw: { id: 900, name: "Corte", duration: 60, price: 80, deleted: false },
      },
    ]),
    customers: category("CUSTOMER"),
    availability: category("AVAILABILITY"),
    timeBlocks: category("TIME_BLOCK"),
    futureAppointments: category("FUTURE_APPOINTMENT"),
    pastAppointments: category("PAST_APPOINTMENT"),
    cancelledAppointments: category("CANCELLED_APPOINTMENT"),
    noShowAppointments: category("NO_SHOW_APPOINTMENT"),
  } as never;
}

/** Origem que falha como a origem real falharia, com segredo na mensagem. */
function failingReader(error: unknown) {
  return {
    calls: 0,
    async getImportSnapshot() {
      this.calls += 1;
      throw error;
    },
  };
}

const okReader = {
  async getImportSnapshot() {
    return snapshot();
  },
};

const authRejected = new AppError(
  "MINHA_AGENDA_AUTH_FAILED",
  `Login refused for ${SECRET_EMAIL} with password ${SECRET_PASSWORD}.`,
  422,
  { originStatus: 401, email: SECRET_EMAIL },
);
const originUnavailable = new AppError(
  "MINHA_AGENDA_UNREACHABLE",
  `Could not reach origin with bearer ${SECRET_TOKEN}.`,
  502,
);
const ourBug = new TypeError(
  `Cannot read properties of undefined (token ${SECRET_TOKEN}, user ${SECRET_EMAIL})`,
);

function seedSession(
  db: Database,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return db.client.importSession.create({
    data: {
      tenantId,
      provider: "MINHA_AGENDA",
      sourceAccountId: "account-1",
      sourceAccountLabel: null,
      connectionId: "connection-1",
      status: "DRAFT",
      previewVersion: 0,
      createdBy: "owner-1",
      errorCode: null,
      errorMessage: null,
      leaseOwner: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
      startedAt: null,
      ...overrides,
    },
  });
}

function seedCalendar(db: Database) {
  db.client.calendarSettings.rows.push({
    id: "settings-1",
    tenantId,
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  } as never);
}

function sessionRow(db: Database, sessionId: string) {
  return db.client.importSession.rows.find(
    (row) => (row as { id: string }).id === sessionId,
  ) as unknown as {
    status: string;
    previewVersion: number;
    errorCode: string | null;
    errorMessage: string | null;
    leaseOwner: string | null;
    leaseExpiresAt: Date | null;
    leaseAcquiredAt: Date | null;
    leaseHeartbeatAt: Date | null;
  };
}

function expectNoSecret(message: string | null) {
  expect(message).toBeTruthy();
  for (const secret of [SECRET_EMAIL, SECRET_PASSWORD, SECRET_TOKEN]) {
    expect(message).not.toContain(secret);
  }
  expect(message).not.toMatch(/@/u);
}

describe("goal061: analysis work failure is recorded with a closed cause", () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabaseDouble();
  });

  const cases: Array<{
    name: string;
    error: unknown;
    code: (typeof IMPORT_WORK_ERROR_CODES)[number];
  }> = [
    { name: "login refused", error: authRejected, code: "IMPORT_SOURCE_AUTH_REJECTED" },
    { name: "origin unavailable", error: originUnavailable, code: "IMPORT_SOURCE_UNAVAILABLE" },
    { name: "our own error", error: ourBug, code: "IMPORT_INTERNAL_ERROR" },
  ];

  for (const entry of cases) {
    for (const origin of ["DRAFT", "READY", "PARTIAL"] as const) {
      it(`${entry.name} from ${origin}: records ${entry.code}, releases the lease and restores ${origin}`, async () => {
        const session = await seedSession(db, {
          status: origin,
          previewVersion: origin === "DRAFT" ? 0 : 2,
        });
        const preview = new ImportPreviewService(
          db.client as unknown as PrismaClient,
        );

        const start = await preview.startAnalysis({
          tenantId,
          sessionId: session.id,
        });
        expect(start.status).toBe("ANALYZING");
        expect(sessionRow(db, session.id).status).toBe("ANALYZING");
        expect(sessionRow(db, session.id).leaseOwner).toBe(start.lease.owner);

        await expect(
          preview.runAnalysis(start, failingReader(entry.error), snapshotInput),
        ).rejects.toBe(entry.error);

        const row = sessionRow(db, session.id);
        expect(row.status).toBe(origin);
        expect(row.previewVersion).toBe(origin === "DRAFT" ? 0 : 2);
        expect(row.errorCode).toBe(entry.code);
        expect(IMPORT_WORK_ERROR_CODES).toContain(row.errorCode);
        expect(row.leaseOwner).toBeNull();
        expect(row.leaseExpiresAt).toBeNull();
        expectNoSecret(row.errorMessage);
      });
    }
  }

  it("a reader that cannot even be built is a work failure, not a request failure", async () => {
    const session = await seedSession(db, { status: "READY", previewVersion: 1 });
    const preview = new ImportPreviewService(db.client as unknown as PrismaClient);
    const start = await preview.startAnalysis({ tenantId, sessionId: session.id });

    await expect(
      preview.runAnalysis(
        start,
        async () => {
          throw new AppError(
            "INTEGRATION_CONFIGURATION_INVALID",
            `bad credentials ${SECRET_PASSWORD}`,
            500,
          );
        },
        snapshotInput,
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_CONFIGURATION_INVALID" });

    const row = sessionRow(db, session.id);
    expect(row.status).toBe("READY");
    expect(row.errorCode).toBe("IMPORT_INTERNAL_ERROR");
    expect(row.leaseOwner).toBeNull();
    expectNoSecret(row.errorMessage);
  });

  it("starting again clears errorCode and errorMessage in the claiming UPDATE", async () => {
    const session = await seedSession(db, { status: "READY", previewVersion: 1 });
    const preview = new ImportPreviewService(db.client as unknown as PrismaClient);
    const failed = await preview.startAnalysis({ tenantId, sessionId: session.id });
    await expect(
      preview.runAnalysis(failed, failingReader(authRejected), snapshotInput),
    ).rejects.toBe(authRejected);
    expect(sessionRow(db, session.id).errorCode).toBe(
      "IMPORT_SOURCE_AUTH_REJECTED",
    );

    await preview.startAnalysis({ tenantId, sessionId: session.id });
    const claimed = sessionRow(db, session.id);
    expect(claimed.status).toBe("ANALYZING");
    expect(claimed.errorCode).toBeNull();
    expect(claimed.errorMessage).toBeNull();
  });

  it("a successful analysis clears a previous cause and ends READY", async () => {
    const session = await seedSession(db, {
      status: "READY",
      previewVersion: 1,
      errorCode: "IMPORT_SOURCE_UNAVAILABLE",
      errorMessage: "The import source could not be reached.",
    });
    const preview = new ImportPreviewService(db.client as unknown as PrismaClient);
    const result = await preview.analyze(
      { tenantId, sessionId: session.id },
      okReader,
      snapshotInput,
    );
    expect(result.previewVersion).toBe(2);
    const row = sessionRow(db, session.id);
    expect(row.status).toBe("READY");
    expect(row.errorCode).toBeNull();
    expect(row.leaseOwner).toBeNull();
  });

  it("an analysis that lost its lease writes nothing of the session", async () => {
    const session = await seedSession(db, { status: "READY", previewVersion: 1 });
    const preview = new ImportPreviewService(db.client as unknown as PrismaClient);
    const start = await preview.startAnalysis({ tenantId, sessionId: session.id });
    // Outro dono assumiu (o `replace` limpa o lease e muda o estado).
    Object.assign(sessionRow(db, session.id), {
      status: "SUPERSEDED",
      leaseOwner: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
    });

    await expect(
      preview.runAnalysis(start, okReader, snapshotInput),
    ).resolves.toBeNull();

    const row = sessionRow(db, session.id);
    expect(row.status).toBe("SUPERSEDED");
    expect(row.previewVersion).toBe(1);
    expect(row.errorCode).toBeNull();
    expect(db.client.importItem.rows).toHaveLength(0);
    expect(db.client.importSessionCategory.rows).toHaveLength(0);
  });
});

describe("goal061: execution work failure is recorded with a closed cause", () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabaseDouble();
    seedCalendar(db);
  });

  for (const entry of [
    { error: authRejected, code: "IMPORT_SOURCE_AUTH_REJECTED" },
    { error: originUnavailable, code: "IMPORT_SOURCE_UNAVAILABLE" },
    { error: ourBug, code: "IMPORT_INTERNAL_ERROR" },
  ]) {
    it(`${entry.code}: stays EXECUTING without lease, resumable, and without secrets`, async () => {
      const session = await seedSession(db, { status: "READY", previewVersion: 1 });
      const execution = new ImportExecutionService(
        db.client as unknown as PrismaClient,
      );
      const start = await execution.startExecution(
        { tenantId, sessionId: session.id, userId: "owner-1" },
        { previewVersion: 1 },
      );
      expect(start.status).toBe("EXECUTING");

      await expect(
        execution.runExecution(start, failingReader(entry.error), snapshotInput),
      ).rejects.toBe(entry.error);

      const row = sessionRow(db, session.id);
      expect(row.status).toBe("EXECUTING");
      expect(row.errorCode).toBe(entry.code);
      expect(row.leaseOwner).toBeNull();
      expectNoSecret(row.errorMessage);

      // Retomável: um novo início reivindica na hora e limpa a causa.
      await execution.startExecution(
        { tenantId, sessionId: session.id, userId: "owner-1" },
        { previewVersion: 1 },
      );
      expect(sessionRow(db, session.id).errorCode).toBeNull();
      expect(sessionRow(db, session.id).status).toBe("EXECUTING");
    });
  }

  it("a stale preview found by the work imports nothing and returns the session to an analyzable state", async () => {
    const session = await seedSession(db, { status: "READY", previewVersion: 1 });
    const execution = new ImportExecutionService(
      db.client as unknown as PrismaClient,
    );
    const start = await execution.startExecution(
      { tenantId, sessionId: session.id, userId: "owner-1" },
      { previewVersion: 1 },
    );
    const stale = new AppError(
      "IMPORT_PREVIEW_STALE",
      "The import preview used for this request is no longer current.",
      409,
    );

    await expect(
      execution.runExecution(start, failingReader(stale), snapshotInput),
    ).rejects.toBe(stale);

    const row = sessionRow(db, session.id);
    expect(row.status).toBe("READY");
    expect(row.errorCode).toBe("IMPORT_PREVIEW_STALE");
    expect(row.leaseOwner).toBeNull();
    expect(db.client.service.rows).toHaveLength(0);
  });
});

describe("goal061: the closed set of work causes", () => {
  it("classifies a category read failure by its origin cause, not by the wrapper", () => {
    const wrapped = new AppError(
      "MINHA_AGENDA_IMPORT_CATEGORY_FAILED",
      "Failed to read Minha Agenda import category \"SERVICE\": MINHA_AGENDA_TIMEOUT.",
      502,
      { categories: ["SERVICE"], cause: "MINHA_AGENDA_TIMEOUT" },
    );
    expect(importWorkFailure(wrapped).errorCode).toBe(
      "IMPORT_SOURCE_UNAVAILABLE",
    );
    expect(
      importWorkFailure(
        new AppError("MINHA_AGENDA_INVALID_RESPONSE", "bad shape", 502),
      ).errorCode,
    ).toBe("IMPORT_SOURCE_INVALID_RESPONSE");
    expect(importWorkFailure("not even an error").errorCode).toBe(
      "IMPORT_INTERNAL_ERROR",
    );
  });

  it("never copies the error text into the recorded message", () => {
    for (const error of [authRejected, originUnavailable, ourBug]) {
      const failure = importWorkFailure(error);
      expect(IMPORT_WORK_ERROR_CODES).toContain(failure.errorCode);
      expectNoSecret(failure.errorMessage);
      expect(failure.errorMessage).not.toBe((error as Error).message);
    }
  });
});

describe("goal061: lease is renewed while the origin is being read", () => {
  it("heartbeats during a single long read, by the database clock", async () => {
    const db = createDatabaseDouble();
    const session = await seedSession(db, { status: "READY", previewVersion: 1 });
    const preview = new ImportPreviewService(db.client as unknown as PrismaClient);
    const start = await preview.startAnalysis(
      { tenantId, sessionId: session.id },
      { leaseTtlSeconds: 60 },
    );
    const firstExpiry = start.lease.expiresAt.getTime();
    let renewedDuringRead = false;
    const slowReader = {
      async getImportSnapshot() {
        // A leitura "demora" enquanto o relógio do banco anda.
        for (let tick = 0; tick < 10; tick += 1) {
          db.advanceDatabaseClock(1_000);
          await new Promise((resolve) => setTimeout(resolve, 5));
          const row = sessionRow(db, session.id);
          if ((row.leaseExpiresAt?.getTime() ?? 0) > firstExpiry) {
            renewedDuringRead = true;
          }
        }
        return snapshot();
      },
    };

    const result = await preview.runAnalysis(start, slowReader, snapshotInput, {
      leaseTtlSeconds: 60,
      leaseRenewIntervalMs: 2,
    });

    expect(result?.previewVersion).toBe(2);
    expect(renewedDuringRead).toBe(true);
    expect(sessionRow(db, session.id).leaseOwner).toBeNull();
  });
});

describe("goal061: the start route answers 202 and the work ends in-process", () => {
  const bffToken = deriveInternalToken(
    TEST_INTERNAL_SERVICE_TOKEN,
    "bff",
    SERVICE_AUDIENCE,
    "command",
  );
  let db: Database;
  let app: FastifyInstance;
  let work: ImportBackgroundWork;
  let release: () => void;
  let readerCalls = 0;

  beforeEach(async () => {
    db = createDatabaseDouble();
    seedCalendar(db);
    db.client.integrationConnection.rows.push({
      id: "connection-1",
      tenantId,
      provider: "MINHA_AGENDA",
      status: "CONNECTED",
    } as never);
    readerCalls = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    work = new ImportBackgroundWork();
    app = Fastify();
    await registerManagementRoutes(app, db.client as unknown as PrismaClient, {
      importWork: work,
      importSourceReader: async () => ({
        async getImportSnapshot() {
          readerCalls += 1;
          await gate;
          return snapshot();
        },
      }),
    });
    app.setErrorHandler((error, request, reply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: { code: error.code, message: error.message },
        });
      }
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR" } });
    });
  });

  afterEach(async () => {
    release();
    await work.drain();
    await app.close();
  });

  function post(url: string, key: string, payload: unknown = {}) {
    return app.inject({
      method: "POST",
      url,
      headers: {
        authorization: `Bearer ${bffToken}`,
        "x-tenant-id": tenantId,
        "x-user-id": "owner-1",
        "x-request-id": "req-goal061",
        "content-type": "application/json",
        "idempotency-key": key,
      },
      payload: payload as Record<string, unknown>,
    });
  }

  it("analyze: 202 with { sessionId, status, previewVersion } before the origin answers", async () => {
    const session = await seedSession(db, { status: "READY", previewVersion: 1 });
    const response = await post(
      `/internal/calendar/imports/${session.id}/analyze`,
      "a-1",
    );
    expect(response.statusCode).toBe(202);
    expect(response.json().data).toEqual({
      sessionId: session.id,
      status: "ANALYZING",
      previewVersion: 1,
    });
    expect(sessionRow(db, session.id).status).toBe("ANALYZING");
    expect(work.size).toBe(1);

    const replay = await post(
      `/internal/calendar/imports/${session.id}/analyze`,
      "a-1",
    );
    expect(replay.statusCode).toBe(202);
    expect(replay.json().data).toEqual(response.json().data);
    expect(work.size).toBe(1);

    release();
    await work.drain();
    expect(readerCalls).toBe(1);
    expect(sessionRow(db, session.id).status).toBe("READY");
    expect(sessionRow(db, session.id).previewVersion).toBe(2);
  });

  it("execute: 202 EXECUTING, and a second start with a new key is refused while the lease lives", async () => {
    const session = await seedSession(db, { status: "READY", previewVersion: 1 });
    const response = await post(
      `/internal/calendar/imports/${session.id}/execute`,
      "e-1",
      { previewVersion: 1 },
    );
    expect(response.statusCode).toBe(202);
    expect(response.json().data).toEqual({
      sessionId: session.id,
      status: "EXECUTING",
      previewVersion: 1,
    });

    const second = await post(
      `/internal/calendar/imports/${session.id}/execute`,
      "e-2",
      { previewVersion: 1 },
    );
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("IMPORT_SESSION_LEASE_HELD");
    const analyze = await post(
      `/internal/calendar/imports/${session.id}/analyze`,
      "a-2",
    );
    expect(analyze.statusCode).toBe(409);
    expect(analyze.json().error.code).toBe("IMPORT_SESSION_LEASE_HELD");
    expect(work.size).toBe(1);
  });

  it("app.close() waits for the work already in progress", async () => {
    // App próprio, sem conjunto de fora: a rota cria o seu e o espera no
    // `onClose`, como `buildApp` faz com o dele.
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const own = Fastify();
    await registerManagementRoutes(own, db.client as unknown as PrismaClient, {
      importSourceReader: async () => ({
        async getImportSnapshot() {
          await gate;
          return snapshot();
        },
      }),
    });
    const session = await seedSession(db, { status: "READY", previewVersion: 1 });
    const response = await own.inject({
      method: "POST",
      url: `/internal/calendar/imports/${session.id}/analyze`,
      headers: {
        authorization: `Bearer ${bffToken}`,
        "x-tenant-id": tenantId,
        "x-user-id": "owner-1",
        "x-request-id": "req-goal061",
        "content-type": "application/json",
        "idempotency-key": "a-close",
      },
      payload: {},
    });
    expect(response.statusCode).toBe(202);

    let closed = false;
    const closing = own.close().then(() => {
      closed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).toBe(false);
    expect(sessionRow(db, session.id).status).toBe("ANALYZING");
    open();
    await closing;
    expect(closed).toBe(true);
    expect(sessionRow(db, session.id).status).toBe("READY");
  });
});
