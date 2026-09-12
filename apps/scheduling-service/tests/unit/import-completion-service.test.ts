/**
 * Conclusão única e irreversível da importação (Goal010, WU-06).
 *
 * O que estas suítes provam não é que o serviço "checa antes de concluir" —
 * checagem de código é exatamente o que a segunda instância atropela. O dublê
 * declara o índice único **parcial** `ImportSession_one_completed_per_tenant`
 * (`("tenantId") WHERE "completedAt" IS NOT NULL`) da migration
 * `20260910100000_goal010_import_session`, então uma segunda conclusão do
 * mesmo negócio é recusada aqui pelo mesmo motivo por que seria recusada no
 * PostgreSQL: a linha não entra no índice. A corrida entre duas conexões de
 * verdade está em `tests/integration/goal010-import-completion.test.ts`; aqui
 * ela é simulada intercalando duas conclusões que já passaram pela checagem
 * de código antes de qualquer escrita — o caso em que só o banco decide.
 */
import { describe, expect, it } from "vitest";

import { CalendarMigrationService } from "../../src/modules/migrations/calendar-migration-service.js";
import { ImportCompletionService } from "../../src/modules/migrations/import-completion-service.js";
import { ImportExecutionService } from "../../src/modules/migrations/import-execution-service.js";
import {
  ImportPreviewService,
  type ImportPreviewSourceReader,
} from "../../src/modules/migrations/import-preview-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const timeZone = "America/Sao_Paulo";
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-09-10",
};

type Database = ReturnType<typeof createDatabaseDouble>;

function category(
  name: string,
  records: Array<{ externalId: string; raw: unknown }> = [],
) {
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

function buildSnapshot(
  overrides: Partial<
    Record<"services" | "customers", ReturnType<typeof category>>
  > = {},
) {
  return {
    generatedAt: "2026-09-10T12:00:00.000Z",
    services: overrides.services ?? category("SERVICE"),
    customers: overrides.customers ?? category("CUSTOMER"),
    availability: category("AVAILABILITY"),
    timeBlocks: category("TIME_BLOCK"),
    futureAppointments: category("FUTURE_APPOINTMENT"),
    pastAppointments: category("PAST_APPOINTMENT"),
    cancelledAppointments: category("CANCELLED_APPOINTMENT"),
    noShowAppointments: category("NO_SHOW_APPOINTMENT"),
  } as never;
}

class FakeReader implements ImportPreviewSourceReader {
  constructor(private readonly snapshot: ReturnType<typeof buildSnapshot>) {}
  async getImportSnapshot() {
    return this.snapshot as never;
  }
}

function setup() {
  const database = createDatabaseDouble();
  database.tables.calendarSettings.rows.push({
    id: tenantId,
    tenantId,
    source: "MINHA_AGENDA",
    timezone: timeZone,
  } as never);
  return {
    database,
    preview: new ImportPreviewService(database.client as never),
    execution: new ImportExecutionService(database.client as never),
    completion: new ImportCompletionService(database.client as never),
  };
}

/**
 * Sessão pronta para concluir, sem passar pelo motor: o que a conclusão lê
 * são os itens, e é deles que a decisão depende.
 */
async function seedSession(
  database: Database,
  items: Array<{
    category: string;
    externalId: string;
    status: string;
    internalId?: string;
  }> = [],
  overrides: Record<string, unknown> = {},
) {
  const session = await database.client.importSession.create({
    data: {
      tenantId,
      sourceAccountId: "account-1",
      sourceAccountLabel: "Salão da Ana",
      createdBy: "user-1",
      status: "READY",
      ...overrides,
    } as never,
  });
  for (const item of items) {
    await database.client.importItem.create({
      data: {
        tenantId,
        sessionId: session.id,
        category: item.category,
        externalId: item.externalId,
        status: item.status,
        entityType: item.internalId ? "SERVICE" : null,
        internalId: item.internalId ?? null,
        reasonCode:
          item.status === "PENDING" || item.status === "IMPORTED"
            ? null
            : "REASON",
      } as never,
    });
  }
  return session.id as string;
}

function sessionRow(database: Database, sessionId: string) {
  const row = database.tables.importSession.rows.find(
    (entry) => entry.id === sessionId,
  );
  if (!row) throw new Error(`session ${sessionId} not found`);
  return row as Record<string, unknown>;
}

describe("ImportCompletionService: conclusão única garantida pelo banco", () => {
  it("recusa a segunda sessão concluída do mesmo negócio pelo índice do banco, não pela checagem de código", async () => {
    const { database, completion } = setup();
    const first = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "900",
        status: "IMPORTED",
        internalId: "service-1",
      },
    ]);
    const second = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "901",
        status: "IMPORTED",
        internalId: "service-2",
      },
    ]);

    // Duas conclusões de sessões diferentes do mesmo negócio, intercaladas:
    // as duas passam pela checagem de código antes de qualquer escrita, então
    // quem recusa a segunda só pode ser o banco.
    const outcomes = await Promise.allSettled([
      completion.complete({ tenantId, sessionId: first, userId: "user-1" }),
      completion.complete({ tenantId, sessionId: second, userId: "user-2" }),
    ]);

    expect(
      outcomes.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = outcomes.find((entry) => entry.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: "IMPORT_ALREADY_COMPLETED",
      statusCode: 409,
    });
    const completed = database.tables.importSession.rows.filter(
      (row) => row.completedAt !== null,
    );
    expect(completed).toHaveLength(1);
  });

  it("retentativa da mesma conclusão devolve o mesmo resultado, sem concluir duas vezes", async () => {
    const { database, completion } = setup();
    const sessionId = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "900",
        status: "IMPORTED",
        internalId: "service-1",
      },
    ]);

    const first = await completion.complete({
      tenantId,
      sessionId,
      userId: "user-1",
    });
    const writes = database.journal.writesFor("importSession").length;
    const second = await completion.complete({
      tenantId,
      sessionId,
      userId: "user-1",
    });

    expect(second).toEqual(first);
    expect(database.journal.writesFor("importSession")).toHaveLength(writes);
    expect(sessionRow(database, sessionId).completedAt).toEqual(
      first.completedAt,
    );
  });

  it("retentativa sob a mesma chave de idempotência devolve o resultado gravado", async () => {
    const { database, completion } = setup();
    const sessionId = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "900",
        status: "IMPORTED",
        internalId: "service-1",
      },
    ]);

    const first = await completion.complete(
      { tenantId, sessionId, userId: "user-1" },
      { idempotencyKey: "complete-1" },
    );
    const writes = database.journal.writesFor("importSession").length;
    const second = await completion.complete(
      { tenantId, sessionId, userId: "user-1" },
      { idempotencyKey: "complete-1" },
    );

    expect(second).toEqual(first);
    expect(database.journal.writesFor("importSession")).toHaveLength(writes);
  });

  it("trata duas conclusões simultâneas da mesma sessão como uma só", async () => {
    const { database, completion } = setup();
    const sessionId = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "900",
        status: "IMPORTED",
        internalId: "service-1",
      },
    ]);

    const [one, two] = await Promise.all([
      completion.complete({ tenantId, sessionId, userId: "user-1" }),
      completion.complete({ tenantId, sessionId, userId: "user-2" }),
    ]);

    expect(one.completedAt).toEqual(two.completedAt);
    expect(one.completedBy).toBe(two.completedBy);
    const completionWrites = database.journal
      .writesFor("importSession")
      .filter((write) => write.operation === "updateMany");
    expect(completionWrites).toHaveLength(1);
  });
});

describe("ImportCompletionService: pendentes exigem aceite explícito", () => {
  it("recusa concluir com itens não importados sem o aceite", async () => {
    const { database, completion } = setup();
    const sessionId = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "900",
        status: "IMPORTED",
        internalId: "service-1",
      },
      { category: "CUSTOMER", externalId: "500", status: "PENDING" },
      { category: "CUSTOMER", externalId: "501", status: "FAILED" },
    ]);

    await expect(
      completion.complete({ tenantId, sessionId, userId: "user-1" }),
    ).rejects.toMatchObject({
      code: "IMPORT_PENDING_ACCEPTANCE_REQUIRED",
      statusCode: 409,
      details: { pendingCount: 2 },
    });
    expect(sessionRow(database, sessionId).completedAt).toBeNull();
  });

  it("registra o aceite com autor, data e a contagem de pendentes do momento da decisão", async () => {
    const { database, completion } = setup();
    const sessionId = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "900",
        status: "IMPORTED",
        internalId: "service-1",
      },
      { category: "CUSTOMER", externalId: "500", status: "PENDING" },
      { category: "CUSTOMER", externalId: "501", status: "NEEDS_REVIEW" },
    ]);

    const result = await completion.complete(
      { tenantId, sessionId, userId: "user-9" },
      { acceptPending: true },
    );

    expect(result.pendingAcceptance).toMatchObject({
      acceptedBy: "user-9",
      pendingCount: 2,
    });
    const row = sessionRow(database, sessionId);
    expect(row.pendingAcceptedBy).toBe("user-9");
    expect(row.pendingAcceptedCount).toBe(2);
    expect(row.pendingAcceptedAt).toEqual(row.completedAt);
    const decision = database.tables.importDecision.rows.find(
      (entry) => entry.decision === "ACCEPT_PENDING_COMPLETION",
    );
    expect(decision).toMatchObject({
      scope: "SESSION",
      sessionId,
      decidedBy: "user-9",
    });
    expect(decision?.decidedAt).toEqual(row.completedAt);
  });

  it("não pede aceite quando nada ficou por resolver", async () => {
    const { database, completion } = setup();
    const sessionId = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "900",
        status: "IMPORTED",
        internalId: "service-1",
      },
      { category: "CUSTOMER", externalId: "500", status: "SKIPPED" },
    ]);

    const result = await completion.complete({
      tenantId,
      sessionId,
      userId: "user-1",
    });

    expect(result.pendingAcceptance).toBeNull();
    expect(sessionRow(database, sessionId).pendingAcceptedAt).toBeNull();
  });
});

describe("ImportCompletionService: falha técnica não consome o direito", () => {
  it("permite abrir uma sessão nova depois de uma sessão que falhou", async () => {
    const { database, completion } = setup();
    const failed = await seedSession(database, [], {
      status: "FAILED",
      errorCode: "SOURCE_UNAVAILABLE",
    });

    const started = await completion.startSession({
      tenantId,
      userId: "user-1",
      sourceAccountId: "account-1",
    });

    expect(started.created).toBe(true);
    expect(started.sessionId).not.toBe(failed);
    // A sessão que falhou continua no histórico técnico, e não foi apagada.
    expect(sessionRow(database, failed).status).toBe("FAILED");
  });

  it("retoma a sessão viva em vez de abrir uma segunda", async () => {
    const { database, completion } = setup();
    const live = await seedSession(database, [], { status: "PARTIAL" });

    const started = await completion.startSession({
      tenantId,
      userId: "user-1",
      sourceAccountId: "account-1",
    });

    expect(started).toMatchObject({
      sessionId: live,
      created: false,
      status: "PARTIAL",
    });
    expect(database.tables.importSession.rows).toHaveLength(1);
  });

  it("substitui a sessão viva quando o usuário pede, sem consumir o direito", async () => {
    const { database, completion } = setup();
    const live = await seedSession(database, [], { status: "PARTIAL" });

    const started = await completion.startSession({
      tenantId,
      userId: "user-1",
      sourceAccountId: "account-2",
      replace: true,
    });

    expect(started.created).toBe(true);
    expect(started.replacedSessionId).toBe(live);
    expect(sessionRow(database, live).status).toBe("SUPERSEDED");
    expect(sessionRow(database, started.sessionId).status).toBe("DRAFT");
    // Nenhuma conclusão foi gravada: o direito continua disponível.
    expect(await completion.getImportRight(tenantId)).toMatchObject({
      available: true,
    });
  });
});

describe("ImportCompletionService: depois de concluída não há segunda importação", () => {
  it("recusa abrir sessão nova, reanalisar e reexecutar", async () => {
    const { database, preview, execution, completion } = setup();
    const sessionId = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "900",
        status: "IMPORTED",
        internalId: "service-1",
      },
    ]);
    await completion.complete({ tenantId, sessionId, userId: "user-1" });
    const reader = new FakeReader(buildSnapshot());

    await expect(
      completion.startSession({
        tenantId,
        userId: "user-1",
        sourceAccountId: "account-1",
      }),
    ).rejects.toMatchObject({
      code: "IMPORT_ALREADY_COMPLETED",
      statusCode: 409,
    });
    await expect(
      completion.startSession({
        tenantId,
        userId: "user-1",
        sourceAccountId: "account-1",
        replace: true,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_ALREADY_COMPLETED" });
    // Reprocessar a origem pela sessão concluída também não existe.
    await expect(
      preview.analyze({ tenantId, sessionId }, reader, snapshotInput),
    ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_ANALYZABLE" });
    await expect(
      execution.execute(
        { tenantId, sessionId, userId: "user-1" },
        reader,
        snapshotInput,
        { previewVersion: 1 },
      ),
    ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_EXECUTABLE" });
  });

  it("recusa também o protocolo antigo, que sobrevive por compatibilidade", async () => {
    const { database, completion } = setup();
    const sessionId = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "900",
        status: "IMPORTED",
        internalId: "service-1",
      },
    ]);
    await completion.complete({ tenantId, sessionId, userId: "user-1" });
    const legacy = new CalendarMigrationService(database.client as never);

    // A migracao bidirecional antiga ainda esta roteada ate o Goal024; ela
    // tambem le a origem, entao tambem precisa parar na conclusao.
    await expect(
      legacy.start(
        { tenantId, userId: "user-1", requestId: "req-1" },
        "ATENDLY",
      ),
    ).rejects.toMatchObject({ code: "IMPORT_ALREADY_COMPLETED" });
  });

  it("não oferece sincronização contínua nem troca de fonte em nenhum método", async () => {
    const surface = [
      ...Object.getOwnPropertyNames(ImportCompletionService.prototype),
      ...Object.keys(await import("../../src/modules/migrations/index.js")),
    ].join(" ");
    expect(surface).not.toMatch(
      /sync|Sync|switchSource|changeSource|reimport|Reimport/u,
    );
  });
});

describe("ImportCompletionService: histórico permanente", () => {
  it("guarda origem, data, quantidades por categoria, ignorados, falhos e status final", async () => {
    const { database, preview, execution, completion } = setup();
    const session = await database.client.importSession.create({
      data: {
        tenantId,
        sourceAccountId: "account-1",
        sourceAccountLabel: "Salão da Ana",
        createdBy: "user-1",
      } as never,
    });
    const reader = new FakeReader(
      buildSnapshot({
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
            raw: {
              id: 500,
              name: "Ana Souza",
              phone1: "5511999990000",
              phone2: null,
            },
          },
        ]),
      }),
    );
    await preview.analyze(
      { tenantId, sessionId: session.id },
      reader,
      snapshotInput,
    );
    await execution.execute(
      { tenantId, sessionId: session.id, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    const result = await completion.complete(
      { tenantId, sessionId: session.id, userId: "user-1" },
      { acceptPending: true },
    );
    const history = await completion.getHistory(tenantId);

    expect(history).not.toBeNull();
    expect(history).toMatchObject({
      sessionId: session.id,
      provider: "MINHA_AGENDA",
      sourceAccountId: "account-1",
      sourceAccountLabel: "Salão da Ana",
      status: "COMPLETED",
      completedBy: "user-1",
    });
    expect(history?.completedAt).toEqual(result.completedAt);
    expect(history?.counts).toEqual(result.counts);
    expect(history?.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "SERVICE", imported: 1 }),
        expect.objectContaining({ category: "CUSTOMER", imported: 1 }),
      ]),
    );
    expect(history?.counts.skipped).toBe(result.counts.skipped);
    expect(history?.counts.failed).toBe(result.counts.failed);
    // O histórico é permanente: itens e categorias da sessão continuam legíveis.
    expect(database.tables.importItem.rows.length).toBeGreaterThan(0);
    expect(database.tables.importSessionCategory.rows.length).toBeGreaterThan(
      0,
    );
  });

  it("não devolve histórico nem consome o direito de outro negócio", async () => {
    const { database, completion } = setup();
    const sessionId = await seedSession(database, [
      {
        category: "SERVICE",
        externalId: "900",
        status: "IMPORTED",
        internalId: "service-1",
      },
    ]);
    await completion.complete({ tenantId, sessionId, userId: "user-1" });

    expect(await completion.getHistory("tenant-b")).toBeNull();
    expect(await completion.getImportRight("tenant-b")).toMatchObject({
      available: true,
    });
    expect(await completion.getImportRight(tenantId)).toMatchObject({
      available: false,
      sessionId,
    });
  });
});
