// Primeiro import de propósito: fixa as variáveis da autenticação interna
// antes de `config/env.ts` ser avaliado (ver o próprio arquivo).
import "../unit/support/test-env.js";

import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { type FastifyInstance } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import { ImportCompletionService } from "../../src/modules/migrations/import-completion-service.js";
import { ImportBackgroundWork } from "../../src/modules/migrations/import-lease.js";
import { ImportPreviewService } from "../../src/modules/migrations/import-preview-service.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal061 §7.1 contra PostgreSQL real: a importação longa não depende de uma
 * requisição.
 *
 * A origem é um leitor de teste **travado**: só responde quando o teste o
 * libera. É o equivalente a uma origem de mais de 30 s sem esperar 30 s de
 * relógio — se a rota esperasse a origem, a requisição nunca voltaria antes
 * da liberação, e o `202` com `ANALYZING`/`EXECUTING` lido do banco durante
 * a trava é a prova de que ela não espera. Nenhum teste chama a Minha
 * Agenda real.
 *
 * O trabalho disparado pela rota é esperado pelo conjunto em memória
 * (`ImportBackgroundWork.drain`), o mesmo que `app.close()` espera. Quem
 * decide quem trabalha continua sendo o lease do banco.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal061-tenant-a";
const tenantB = "goal061-tenant-b";
const timeZone = "America/Sao_Paulo";

const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

let prisma: PrismaClient;

// ---------------------------------------------------------------------------
// Origem travada.
// ---------------------------------------------------------------------------

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

/** Um serviço e um cliente: o bastante para a análise e o lote gravarem. */
function smallSnapshot() {
  return {
    generatedAt: "2026-09-27T12:00:00.000Z",
    services: category("SERVICE", [
      {
        externalId: "900",
        raw: {
          id: 900,
          name: "Corte",
          duration: 60,
          price: 80,
          colorId: null,
          deleted: false,
        },
      },
    ]),
    customers: category("CUSTOMER", [
      {
        externalId: "500",
        raw: { id: 500, name: "Ana Souza", phone1: "5511999990000", phone2: null },
      },
    ]),
    availability: category("AVAILABILITY"),
    timeBlocks: category("TIME_BLOCK"),
    futureAppointments: category("FUTURE_APPOINTMENT"),
    pastAppointments: category("PAST_APPOINTMENT"),
    cancelledAppointments: category("CANCELLED_APPOINTMENT"),
    noShowAppointments: category("NO_SHOW_APPOINTMENT"),
  };
}

/**
 * Leitor que só devolve a origem quando o teste chama `release()`. Começa
 * travado; `lock()` volta a travar para a próxima leitura.
 */
class GatedReader {
  calls = 0;
  private gate!: Promise<void>;
  private open!: () => void;

  constructor(private readonly snapshot = smallSnapshot()) {
    this.lock();
  }

  lock(): void {
    this.gate = new Promise((resolve) => {
      this.open = resolve;
    });
  }

  release(): void {
    this.open();
  }

  async getImportSnapshot() {
    this.calls += 1;
    await this.gate;
    return this.snapshot as never;
  }
}

// ---------------------------------------------------------------------------
// Aplicação e fixture.
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let work: ImportBackgroundWork;
const readers = new Map<string, GatedReader>();

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  await registerManagementRoutes(instance, prisma, {
    importWork: work,
    importSourceReader: async (tenantId) => {
      const reader = readers.get(tenantId);
      if (!reader) throw new Error(`No test reader for ${tenantId}`);
      return reader;
    },
  });
  instance.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
        requestId: request.id,
      });
    }
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: (error as Error).message },
      requestId: request.id,
    });
  });
  return instance;
}

function headers(tenantId: string, key?: string) {
  return {
    authorization: `Bearer ${bffToken}`,
    "x-tenant-id": tenantId,
    "x-user-id": "owner-1",
    "x-request-id": "req-goal061",
    "content-type": "application/json",
    ...(key ? { "idempotency-key": key } : {}),
  };
}

async function seedTenant(tenantId: string): Promise<string> {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
  // O leitor da origem é trocado pelo de teste: a credencial nunca é
  // decifrada, então basta que a conexão exista.
  const connection = await prisma.integrationConnection.create({
    data: {
      tenantId,
      provider: "MINHA_AGENDA",
      status: "CONNECTED",
      credentialsEncrypted: Buffer.from("segredo-de-teste"),
      config: {},
    },
  });
  return connection.id;
}

async function openSession(tenantId: string): Promise<string> {
  const connection = await prisma.integrationConnection.findUniqueOrThrow({
    where: { tenantId_provider: { tenantId, provider: "MINHA_AGENDA" } },
  });
  const started = await new ImportCompletionService(prisma).startSession({
    tenantId,
    userId: "owner-1",
    sourceAccountId: "account-1",
    sourceAccountLabel: "Salao da Ana",
    connectionId: connection.id,
  });
  return started.sessionId;
}

function postAnalyze(tenantId: string, sessionId: string, key: string) {
  return app.inject({
    method: "POST",
    url: `/internal/calendar/imports/${sessionId}/analyze`,
    headers: headers(tenantId, key),
    payload: {},
  });
}

function postExecute(
  tenantId: string,
  sessionId: string,
  key: string,
  previewVersion: number,
) {
  return app.inject({
    method: "POST",
    url: `/internal/calendar/imports/${sessionId}/execute`,
    headers: headers(tenantId, key),
    payload: { previewVersion },
  });
}

async function sessionRow(tenantId: string, sessionId: string) {
  return prisma.importSession.findUniqueOrThrow({
    where: { tenantId_id: { tenantId, id: sessionId } },
  });
}

/** Lease vivo pelo relógio do **banco**, nunca pelo do processo. */
async function leaseAliveInDatabase(
  tenantId: string,
  sessionId: string,
): Promise<boolean> {
  const [row] = await prisma.$queryRaw<Array<{ alive: boolean }>>`
    SELECT ("leaseOwner" IS NOT NULL AND "leaseExpiresAt" > now()) AS alive
      FROM "ImportSession"
     WHERE "tenantId" = ${tenantId}
       AND "id" = ${sessionId}
  `;
  return row.alive;
}

/**
 * Vence o lease pelo relógio do **banco**. `leaseAcquiredAt` recua junto,
 * porque `ImportSession_lease_check` exige `leaseExpiresAt > leaseAcquiredAt`.
 */
async function expireLeaseByDatabaseClock(tenantId: string, sessionId: string) {
  await prisma.$executeRaw`
    UPDATE "ImportSession"
       SET "leaseAcquiredAt" = now() - interval '2 minutes',
           "leaseExpiresAt" = now() - interval '1 second'
     WHERE "tenantId" = ${tenantId}
       AND "id" = ${sessionId}
  `;
}

/** Espera a leitura travada começar: o trabalho chegou à origem. */
async function waitForReaderCall(reader: GatedReader, calls = 1) {
  for (let attempt = 0; attempt < 400 && reader.calls < calls; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(reader.calls).toBe(calls);
}

let setupKeys = 0;

/**
 * Análise completa pela rota: início, origem liberada, trabalho esperado.
 * Chave nova a cada chamada — repetir a chave seria reenviar o mesmo início,
 * que devolve a resposta gravada e não analisa de novo.
 */
async function analyzedThroughRoute(tenantId: string, sessionId: string) {
  const reader = readers.get(tenantId)!;
  reader.release();
  setupKeys += 1;
  const response = await postAnalyze(tenantId, sessionId, `setup-${setupKeys}`);
  expect(response.statusCode).toBe(202);
  await work.drain();
  reader.lock();
  return sessionRow(tenantId, sessionId);
}

describeWithDatabase("goal061 import start is short and work ends in-process (PostgreSQL)", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    readers.clear();
    readers.set(tenantA, new GatedReader());
    readers.set(tenantB, new GatedReader());
    work = new ImportBackgroundWork();
    app = await buildApp();
  });

  afterEach(async () => {
    // Nenhum trabalho fica pendurado entre casos, mesmo em falha.
    for (const reader of readers.values()) reader.release();
    await work.drain();
    await app.close();
  });

  it("POST analyze answers 202 ANALYZING while the origin is locked, then reaches READY in-process", async () => {
    const sessionId = await openSession(tenantA);
    const reader = readers.get(tenantA)!;

    const response = await postAnalyze(tenantA, sessionId, "analyze-1");

    expect(response.statusCode).toBe(202);
    expect(response.json().data).toEqual({
      sessionId,
      status: "ANALYZING",
      previewVersion: 0,
    });
    await waitForReaderCall(reader);
    const during = await sessionRow(tenantA, sessionId);
    expect(during.status).toBe("ANALYZING");
    expect(await leaseAliveInDatabase(tenantA, sessionId)).toBe(true);
    expect(await prisma.importItem.count({ where: { sessionId } })).toBe(0);
    expect(work.size).toBe(1);

    reader.release();
    await work.drain();

    const after = await sessionRow(tenantA, sessionId);
    expect(after.status).toBe("READY");
    expect(after.previewVersion).toBe(1);
    expect(after.leaseOwner).toBeNull();
    expect(after.errorCode).toBeNull();
    expect(await prisma.importItem.count({ where: { sessionId } })).toBe(2);
    expect(
      await prisma.importSessionCategory.count({ where: { sessionId } }),
    ).toBe(8);
  });

  it("POST execute answers 202 EXECUTING while the origin is locked, then records the items in-process", async () => {
    const sessionId = await openSession(tenantA);
    await analyzedThroughRoute(tenantA, sessionId);
    const reader = readers.get(tenantA)!;

    const response = await postExecute(tenantA, sessionId, "execute-1", 1);

    expect(response.statusCode).toBe(202);
    expect(response.json().data).toEqual({
      sessionId,
      status: "EXECUTING",
      previewVersion: 1,
    });
    await waitForReaderCall(reader, 2);
    const during = await sessionRow(tenantA, sessionId);
    expect(during.status).toBe("EXECUTING");
    expect(await leaseAliveInDatabase(tenantA, sessionId)).toBe(true);
    expect(
      await prisma.importItem.count({
        where: { sessionId, status: "IMPORTED" },
      }),
    ).toBe(0);

    reader.release();
    await work.drain();

    const after = await sessionRow(tenantA, sessionId);
    expect(["READY", "PARTIAL"]).toContain(after.status);
    expect(after.leaseOwner).toBeNull();
    expect(
      await prisma.importItem.count({
        where: { sessionId, status: "IMPORTED" },
      }),
    ).toBe(2);
    expect(await prisma.service.count({ where: { tenantId: tenantA } })).toBe(1);
    expect(await prisma.customer.count({ where: { tenantId: tenantA } })).toBe(1);
  });

  it("a locked analysis refuses execution and a second analysis; the same key replays without a second work", async () => {
    const sessionId = await openSession(tenantA);
    await analyzedThroughRoute(tenantA, sessionId);
    const reader = readers.get(tenantA)!;

    const first = await postAnalyze(tenantA, sessionId, "reanalyze-1");
    expect(first.statusCode).toBe(202);
    await waitForReaderCall(reader, 2);

    const execute = await postExecute(tenantA, sessionId, "execute-during-analysis", 1);
    expect(execute.statusCode).toBe(409);
    expect(execute.json().error.code).toBe("IMPORT_SESSION_LEASE_HELD");

    const second = await postAnalyze(tenantA, sessionId, "reanalyze-2");
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("IMPORT_SESSION_LEASE_HELD");

    const replay = await postAnalyze(tenantA, sessionId, "reanalyze-1");
    expect(replay.statusCode).toBe(202);
    expect(replay.json().data).toEqual(first.json().data);
    expect(work.size).toBe(1);
    expect(reader.calls).toBe(2);

    reader.release();
    await work.drain();
    const after = await sessionRow(tenantA, sessionId);
    expect(after.status).toBe("READY");
    expect(after.previewVersion).toBe(2);
    expect(reader.calls).toBe(2);
  });

  it("a locked execution refuses analysis and a second execution; the same key replays without a second work", async () => {
    const sessionId = await openSession(tenantA);
    await analyzedThroughRoute(tenantA, sessionId);
    const reader = readers.get(tenantA)!;

    const first = await postExecute(tenantA, sessionId, "execute-1", 1);
    expect(first.statusCode).toBe(202);
    await waitForReaderCall(reader, 2);

    const analyze = await postAnalyze(tenantA, sessionId, "analyze-during-execution");
    expect(analyze.statusCode).toBe(409);
    expect(analyze.json().error.code).toBe("IMPORT_SESSION_LEASE_HELD");

    const second = await postExecute(tenantA, sessionId, "execute-2", 1);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("IMPORT_SESSION_LEASE_HELD");

    const replay = await postExecute(tenantA, sessionId, "execute-1", 1);
    expect(replay.statusCode).toBe(202);
    expect(replay.json().data).toEqual(first.json().data);
    expect(work.size).toBe(1);

    reader.release();
    await work.drain();
    expect(reader.calls).toBe(2);
    expect(
      await prisma.importItem.count({
        where: { sessionId, status: "IMPORTED" },
      }),
    ).toBe(2);
  });

  it("reanalysis keeps the baseline end state: DRAFT and READY end READY, PARTIAL ends PARTIAL", async () => {
    const draft = await openSession(tenantA);
    expect((await sessionRow(tenantA, draft)).status).toBe("DRAFT");
    expect((await analyzedThroughRoute(tenantA, draft)).status).toBe("READY");

    // READY de novo: a reanálise de uma sessão pronta continua pronta.
    const ready = await analyzedThroughRoute(tenantA, draft);
    expect(ready.status).toBe("READY");
    expect(ready.previewVersion).toBe(2);

    // PARTIAL: fixture do estado que uma execução incompleta deixa.
    await prisma.importSession.update({
      where: { tenantId_id: { tenantId: tenantA, id: draft } },
      data: { status: "PARTIAL" },
    });
    const partial = await analyzedThroughRoute(tenantA, draft);
    expect(partial.status).toBe("PARTIAL");
    expect(partial.previewVersion).toBe(3);
  });

  it("replace while the analysis is locked: the old work writes nothing to the replaced session nor to the new one", async () => {
    const oldSessionId = await openSession(tenantA);
    const reader = readers.get(tenantA)!;

    const started = await postAnalyze(tenantA, oldSessionId, "analyze-before-replace");
    expect(started.statusCode).toBe(202);
    await waitForReaderCall(reader);

    const replaced = await app.inject({
      method: "POST",
      url: "/internal/calendar/imports",
      headers: headers(tenantA, "replace-1"),
      payload: { sourceAccountId: "account-1", replace: true },
    });
    expect(replaced.statusCode).toBe(200);
    const newSessionId = replaced.json().data.sessionId as string;
    expect(newSessionId).not.toBe(oldSessionId);
    expect(replaced.json().data.replacedSessionId).toBe(oldSessionId);

    reader.release();
    await work.drain();

    const old = await sessionRow(tenantA, oldSessionId);
    expect(old.status).toBe("SUPERSEDED");
    expect(old.previewVersion).toBe(0);
    expect(old.leaseOwner).toBeNull();
    expect(old.errorCode).toBeNull();
    expect(old.pendingCount).toBe(0);
    const fresh = await sessionRow(tenantA, newSessionId);
    expect(fresh.status).toBe("DRAFT");
    expect(fresh.previewVersion).toBe(0);
    expect(fresh.leaseOwner).toBeNull();
    expect(
      await prisma.importItem.count({ where: { tenantId: tenantA } }),
    ).toBe(0);
    expect(
      await prisma.importSessionCategory.count({ where: { tenantId: tenantA } }),
    ).toBe(0);
  });

  it("a lease taken by another instance after the last heartbeat: the old analysis's final transaction writes nothing", async () => {
    const sessionId = await openSession(tenantA);
    const reader = readers.get(tenantA)!;
    reader.release();

    // A tomada acontece entre o heartbeat forçado depois da leitura da origem
    // e a transação final, na primeira leitura de itens da gravação. O estado
    // continua `ANALYZING`, só o dono muda: aqui só a conferência do
    // `leaseOwner` na transação final impede a escrita.
    let takeover: string | null = null;
    let armed = false;
    const hooked = prisma.$extends({
      query: {
        importItem: {
          async findMany({ args, query }) {
            if (armed) {
              armed = false;
              await expireLeaseByDatabaseClock(tenantA, sessionId);
              const other = await new ImportPreviewService(prisma).startAnalysis({
                tenantId: tenantA,
                sessionId,
              });
              takeover = other.lease.owner;
            }
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;
    const preview = new ImportPreviewService(hooked);
    const start = await preview.startAnalysis({ tenantId: tenantA, sessionId });
    armed = true;

    const result = await preview.runAnalysis(start, reader, {} as never);

    expect(takeover).not.toBeNull();
    expect(takeover).not.toBe(start.lease.owner);
    expect(result).toBeNull();
    const after = await sessionRow(tenantA, sessionId);
    expect(after.status).toBe("ANALYZING");
    expect(after.leaseOwner).toBe(takeover);
    expect(after.previewVersion).toBe(0);
    expect(await prisma.importItem.count({ where: { sessionId } })).toBe(0);
    expect(
      await prisma.importSessionCategory.count({ where: { sessionId } }),
    ).toBe(0);
  });

  it("starting in one business never claims or reads another business's session", async () => {
    const sessionA = await openSession(tenantA);
    const sessionB = await openSession(tenantB);

    const crossed = await postAnalyze(tenantB, sessionA, "cross-1");
    expect(crossed.statusCode).toBe(404);
    const crossedExecute = await postExecute(tenantB, sessionA, "cross-2", 0);
    expect(crossedExecute.statusCode).toBe(404);
    expect((await sessionRow(tenantA, sessionA)).status).toBe("DRAFT");
    expect(work.size).toBe(0);

    const own = await postAnalyze(tenantB, sessionB, "own-1");
    expect(own.statusCode).toBe(202);
    readers.get(tenantB)!.release();
    await work.drain();
    expect(readers.get(tenantA)!.calls).toBe(0);
    expect((await sessionRow(tenantA, sessionA)).status).toBe("DRAFT");
    expect((await sessionRow(tenantB, sessionB)).status).toBe("READY");
  });

  function getPreview(tenantId: string, sessionId: string) {
    return app.inject({
      method: "GET",
      url: `/internal/calendar/imports/${sessionId}/preview`,
      headers: headers(tenantId),
    });
  }

  it("GET preview reads what the analysis persisted, without reading the origin again", async () => {
    const sessionId = await openSession(tenantA);
    await analyzedThroughRoute(tenantA, sessionId);
    const reader = readers.get(tenantA)!;
    const callsBeforeRead = reader.calls;

    const response = await getPreview(tenantA, sessionId);

    expect(response.statusCode).toBe(200);
    const persisted = await prisma.importSessionCategory.findMany({
      where: { tenantId: tenantA, sessionId },
      orderBy: { category: "asc" },
    });
    const body = response.json().data;
    expect(body.sessionId).toBe(sessionId);
    expect(body.previewVersion).toBe(1);
    const bodyByCategory = new Map(
      (body.categories as Array<{ category: string; discoveredCount: number; pendingCount: number }>).map(
        (entry) => [entry.category, entry],
      ),
    );
    for (const row of persisted) {
      const entry = bodyByCategory.get(row.category)!;
      expect(entry.discoveredCount).toBe(row.discoveredCount);
      expect(entry.pendingCount).toBe(row.pendingCount);
    }
    // A leitura do preview gravado nunca chama a origem de novo.
    expect(reader.calls).toBe(callsBeforeRead);
  });

  it("GET preview refuses a session that was never analyzed, with its own code", async () => {
    const sessionId = await openSession(tenantA);

    const response = await getPreview(tenantA, sessionId);

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe(
      "IMPORT_SESSION_PREVIEW_NOT_AVAILABLE",
    );
  });

  it("GET preview of one business's session is not found for another business", async () => {
    const sessionId = await openSession(tenantA);
    await analyzedThroughRoute(tenantA, sessionId);

    const response = await getPreview(tenantB, sessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("IMPORT_SESSION_NOT_FOUND");
  });

  it("an EXECUTING session with an expired lease is interrupted in progress and in GET imports, by the database clock, and a new start resumes it", async () => {
    const sessionId = await openSession(tenantA);
    await analyzedThroughRoute(tenantA, sessionId);
    const reader = readers.get(tenantA)!;

    const started = await postExecute(tenantA, sessionId, "execute-1", 1);
    expect(started.statusCode).toBe(202);
    await waitForReaderCall(reader, 2);
    expect(await leaseAliveInDatabase(tenantA, sessionId)).toBe(true);

    // Simula uma instância que caiu com o lease vivo na linha: o relógio do
    // banco é o único que decide vigência, então o teste o vence
    // diretamente, sem esperar o TTL passar.
    await expireLeaseByDatabaseClock(tenantA, sessionId);
    expect(await leaseAliveInDatabase(tenantA, sessionId)).toBe(false);

    const progress = await app.inject({
      method: "GET",
      url: `/internal/calendar/imports/${sessionId}/progress`,
      headers: headers(tenantA),
    });
    expect(progress.statusCode).toBe(200);
    expect(progress.json().data.interrupted).toBe(true);

    const imports = await app.inject({
      method: "GET",
      url: "/internal/calendar/imports",
      headers: headers(tenantA),
    });
    expect(imports.statusCode).toBe(200);
    expect(imports.json().data.session.interrupted).toBe(true);

    // Novo início reivindica a sessão pendurada normalmente.
    const resumed = await postExecute(tenantA, sessionId, "execute-resume", 1);
    expect(resumed.statusCode).toBe(202);
    expect(await leaseAliveInDatabase(tenantA, sessionId)).toBe(true);

    // Libera as duas leituras travadas (a antiga e a nova) e espera os dois
    // trabalhos: o antigo perde o lease e não escreve nada.
    reader.release();
    await work.drain();
    const after = await sessionRow(tenantA, sessionId);
    expect(["READY", "PARTIAL"]).toContain(after.status);
    expect(after.leaseOwner).toBeNull();
  });

  it("an ANALYZING session with an expired lease is interrupted in progress and in GET imports, by the database clock, and a new start resumes it", async () => {
    const sessionId = await openSession(tenantA);
    const reader = readers.get(tenantA)!;

    const started = await postAnalyze(tenantA, sessionId, "analyze-1");
    expect(started.statusCode).toBe(202);
    await waitForReaderCall(reader);
    expect(await leaseAliveInDatabase(tenantA, sessionId)).toBe(true);

    const whileAlive = await app.inject({
      method: "GET",
      url: `/internal/calendar/imports/${sessionId}/progress`,
      headers: headers(tenantA),
    });
    expect(whileAlive.statusCode).toBe(200);
    expect(whileAlive.json().data.interrupted).toBe(false);

    await expireLeaseByDatabaseClock(tenantA, sessionId);
    expect(await leaseAliveInDatabase(tenantA, sessionId)).toBe(false);

    const progress = await app.inject({
      method: "GET",
      url: `/internal/calendar/imports/${sessionId}/progress`,
      headers: headers(tenantA),
    });
    expect(progress.statusCode).toBe(200);
    expect(progress.json().data.status).toBe("ANALYZING");
    expect(progress.json().data.interrupted).toBe(true);

    const imports = await app.inject({
      method: "GET",
      url: "/internal/calendar/imports",
      headers: headers(tenantA),
    });
    expect(imports.statusCode).toBe(200);
    expect(imports.json().data.session.interrupted).toBe(true);

    // Novo início reivindica a análise pendurada; o trabalho antigo perde o
    // lease e não grava versão nenhuma.
    const resumed = await postAnalyze(tenantA, sessionId, "analyze-resume");
    expect(resumed.statusCode).toBe(202);
    expect(await leaseAliveInDatabase(tenantA, sessionId)).toBe(true);

    reader.release();
    await work.drain();
    const after = await sessionRow(tenantA, sessionId);
    expect(after.status).toBe("READY");
    expect(after.previewVersion).toBe(1);
    expect(after.leaseOwner).toBeNull();
  });
});
