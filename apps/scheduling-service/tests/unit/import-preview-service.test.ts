/**
 * Preview de importacao sem escrita, versionado, com conflitos calculados
 * item a item (Goal010, WU-03). O dublê `createDatabaseDouble()` prova a
 * ausencia de escrita operacional porque `analyze` so chama `create`/
 * `update` nas tabelas de preview (`ImportItem`, `ImportSessionCategory`,
 * `ImportSession`) — nunca em `Customer`, `Service`, `Appointment`,
 * `AvailabilityRule` ou `TimeBlock`.
 */
import { describe, expect, it } from "vitest";

import {
  ImportPreviewService,
  type ImportPreviewSourceReader,
} from "../../src/modules/migrations/import-preview-service.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";

function emptyCategory(
  category: string,
  overrides: Partial<{
    sourceSupported: boolean;
    sourceReportedCount: number | null;
    readCount: number;
    limitationCode: string | null;
    limitationDetail: string | null;
    records: Array<{ externalId: string; raw: unknown }>;
  }> = {},
) {
  const records = overrides.records ?? [];
  return {
    category,
    coverage: {
      sourceSupported: overrides.sourceSupported ?? true,
      sourceReportedCount: overrides.sourceReportedCount ?? null,
      readCount: overrides.readCount ?? records.length,
      limitationCode: overrides.limitationCode ?? null,
      limitationDetail: overrides.limitationDetail ?? null,
    },
    records,
  };
}

function buildSnapshot(
  overrides: Partial<
    Record<
      | "services"
      | "customers"
      | "availability"
      | "timeBlocks"
      | "futureAppointments"
      | "pastAppointments"
      | "cancelledAppointments"
      | "noShowAppointments",
      ReturnType<typeof emptyCategory>
    >
  > = {},
) {
  return {
    generatedAt: new Date().toISOString(),
    services: overrides.services ?? emptyCategory("SERVICE"),
    customers: overrides.customers ?? emptyCategory("CUSTOMER"),
    availability: overrides.availability ?? emptyCategory("AVAILABILITY"),
    timeBlocks: overrides.timeBlocks ?? emptyCategory("TIME_BLOCK"),
    futureAppointments:
      overrides.futureAppointments ?? emptyCategory("FUTURE_APPOINTMENT"),
    pastAppointments:
      overrides.pastAppointments ?? emptyCategory("PAST_APPOINTMENT"),
    cancelledAppointments:
      overrides.cancelledAppointments ?? emptyCategory("CANCELLED_APPOINTMENT"),
    noShowAppointments:
      overrides.noShowAppointments ?? emptyCategory("NO_SHOW_APPOINTMENT"),
  } as never;
}

class FakeReader implements ImportPreviewSourceReader {
  constructor(private snapshot: ReturnType<typeof buildSnapshot>) {}
  setSnapshot(snapshot: ReturnType<typeof buildSnapshot>): void {
    this.snapshot = snapshot;
  }
  async getImportSnapshot() {
    return this.snapshot as never;
  }
}

async function seedSession(
  database: ReturnType<typeof createDatabaseDouble>,
  overrides: Record<string, unknown> = {},
) {
  return database.client.importSession.create({
    data: {
      tenantId,
      sourceAccountId: "account-1",
      createdBy: "user-1",
      ...overrides,
    },
  });
}

function setup() {
  const database = createDatabaseDouble();
  const preview = new ImportPreviewService(database.client as never);
  return { database, preview };
}

describe("ImportPreviewService.analyze: sem escrita operacional", () => {
  it("mantém idênticas as contagens operacionais do destino antes e depois da análise", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database);
    await database.client.customer.create({
      data: { tenantId, name: "Ana", phone: "5511900000001", normalizedPhone: "5511900000001" },
    });
    await database.client.service.create({
      data: { tenantId, name: "Corte", durationMinutes: 30, priceType: "FIXED", price: 50 },
    });

    const reader = new FakeReader(
      buildSnapshot({
        services: emptyCategory("SERVICE", {
          records: [{ externalId: "1", raw: { name: "Corte", duration: 30, price: 50 } }],
        }),
        customers: emptyCategory("CUSTOMER", {
          records: [{ externalId: "9", raw: { name: "Bia", phone1: "5511988887777" } }],
        }),
        futureAppointments: emptyCategory("FUTURE_APPOINTMENT", {
          records: [{ externalId: "100", raw: { date: "2026-06-01", startTime: "09:00" } }],
        }),
      }),
    );

    const countsBefore = {
      customer: database.tables.customer.rows.length,
      service: database.tables.service.rows.length,
      appointment: database.tables.appointment.rows.length,
      availabilityRule: database.tables.availabilityRule.rows.length,
      timeBlock: database.tables.timeBlock.rows.length,
    };

    await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-12-31", referenceDate: "2026-01-01" },
    );

    expect({
      customer: database.tables.customer.rows.length,
      service: database.tables.service.rows.length,
      appointment: database.tables.appointment.rows.length,
      availabilityRule: database.tables.availabilityRule.rows.length,
      timeBlock: database.tables.timeBlock.rows.length,
    }).toEqual(countsBefore);
  });

  it("separa as contagens por categoria, nunca como contagem genérica de agendamentos", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database);
    const reader = new FakeReader(
      buildSnapshot({
        futureAppointments: emptyCategory("FUTURE_APPOINTMENT", {
          records: [{ externalId: "1", raw: { date: "2026-06-01", startTime: "09:00" } }],
        }),
        pastAppointments: emptyCategory("PAST_APPOINTMENT", {
          records: [
            { externalId: "2", raw: { date: "2020-01-01", startTime: "09:00" } },
            { externalId: "3", raw: { date: "2020-01-02", startTime: "09:00" } },
          ],
        }),
        cancelledAppointments: emptyCategory("CANCELLED_APPOINTMENT", {
          records: [{ externalId: "4", raw: { date: "2020-06-01", startTime: "09:00" } }],
        }),
      }),
    );

    const result = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2020-01-01", endDate: "2026-12-31", referenceDate: "2026-01-01" },
    );

    const byCategory = Object.fromEntries(
      result.categories.map((entry) => [entry.category, entry.discoveredCount]),
    );
    expect(byCategory.FUTURE_APPOINTMENT).toBe(1);
    expect(byCategory.PAST_APPOINTMENT).toBe(2);
    expect(byCategory.CANCELLED_APPOINTMENT).toBe(1);
    expect(byCategory.NO_SHOW_APPOINTMENT).toBe(0);
  });

  it("recusa analisar uma sessão que não está mais em estado analisável", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database, { status: "COMPLETED" });
    const reader = new FakeReader(buildSnapshot());

    await expect(
      preview.analyze(
        { tenantId, sessionId: session.id as string },
        reader,
        { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
      ),
    ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_ANALYZABLE" });
  });

  it("recusa analisar uma sessão inexistente", async () => {
    const { preview } = setup();
    const reader = new FakeReader(buildSnapshot());

    await expect(
      preview.analyze(
        { tenantId, sessionId: "does-not-exist" },
        reader,
        { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
      ),
    ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_FOUND" });
  });
});

describe("ImportPreviewService.analyze: classes de conflito", () => {
  it("marca correspondência de serviço claramente idêntica como mesclável, sem fundir sozinha", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database);
    const existing = await database.client.service.create({
      data: { tenantId, name: "Corte", durationMinutes: 30, priceType: "FIXED", price: 50 },
    });
    const reader = new FakeReader(
      buildSnapshot({
        services: emptyCategory("SERVICE", {
          records: [{ externalId: "1", raw: { name: "Corte", duration: 30, price: 50 } }],
        }),
      }),
    );

    const result = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );

    const item = result.items.find((entry) => entry.category === "SERVICE")!;
    expect(item.matchClass).toBe("EXACT");
    expect(item.status).toBe("PENDING");
    expect(item.reasonCode).toBe("SERVICE_MATCH_EXACT");
    expect(item.matchCandidateInternalIds).toEqual([existing.id]);

    // Item persistido: nenhum registro foi criado/atualizado no catálogo real.
    expect(database.tables.service.rows).toHaveLength(1);
  });

  it("nome semelhante apenas sugere, nunca funde sozinha", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database);
    await database.client.service.create({
      data: { tenantId, name: "Corte de Cabelo", durationMinutes: 30, priceType: "FIXED", price: 50 },
    });
    const reader = new FakeReader(
      buildSnapshot({
        services: emptyCategory("SERVICE", {
          records: [{ externalId: "1", raw: { name: "Corte Cabelo", duration: 30, price: 50 } }],
        }),
      }),
    );

    const result = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );

    const item = result.items.find((entry) => entry.category === "SERVICE")!;
    expect(item.matchClass).toBe("SIMILAR");
    expect(item.status).toBe("NEEDS_REVIEW");
    expect(item.reasonCode).toBe("SERVICE_MATCH_SIMILAR");
  });

  it("divergência relevante (nome ambíguo entre vários existentes) exige decisão explícita", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database);
    const first = await database.client.service.create({
      data: { tenantId, name: "Corte", durationMinutes: 30, priceType: "FIXED", price: 50 },
    });
    const second = await database.client.service.create({
      data: { tenantId, name: "Corte", durationMinutes: 45, priceType: "FIXED", price: 60 },
    });
    const reader = new FakeReader(
      buildSnapshot({
        services: emptyCategory("SERVICE", {
          records: [{ externalId: "1", raw: { name: "Corte", duration: 30, price: 50 } }],
        }),
      }),
    );

    const result = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );

    const item = result.items.find((entry) => entry.category === "SERVICE")!;
    expect(item.matchClass).toBe("DIVERGENT");
    expect(item.status).toBe("NEEDS_REVIEW");
    expect(item.reasonCode).toBe("SERVICE_MATCH_AMBIGUOUS");
    expect(item.matchCandidateInternalIds.sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it("serviço sem duração entra em needsReview, sem duração fabricada", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database);
    const reader = new FakeReader(
      buildSnapshot({
        services: emptyCategory("SERVICE", {
          records: [{ externalId: "1", raw: { name: "Sobrancelha", duration: null, price: 20 } }],
        }),
      }),
    );

    const result = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );

    const item = result.items.find((entry) => entry.category === "SERVICE")!;
    expect(item.status).toBe("NEEDS_REVIEW");
    expect(item.reasonCode).toBe("SERVICE_DURATION_MISSING");
  });

  it("telefone repetido entre pessoas diferentes é normal: importa sem fusão automática e sem bloquear", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database);
    await database.client.customer.create({
      data: {
        tenantId,
        name: "Ana",
        phone: "5511900000001",
        normalizedPhone: "5511900000001",
      },
    });
    const reader = new FakeReader(
      buildSnapshot({
        customers: emptyCategory("CUSTOMER", {
          records: [
            { externalId: "9", raw: { name: "Outra Pessoa", phone1: "5511900000001" } },
          ],
        }),
      }),
    );

    const result = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );

    const item = result.items.find((entry) => entry.category === "CUSTOMER")!;
    expect(item.matchClass).toBe("NONE");
    expect(item.status).toBe("PENDING");
    expect(item.reasonCode).toBe("CUSTOMER_PHONE_SHARED");
    // Nenhum cliente foi criado nem mesclado pelo preview.
    expect(database.tables.customer.rows).toHaveLength(1);
  });

  it("correspondência de cliente claramente idêntica (mesmo telefone e nome) é mesclável", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database);
    const existing = await database.client.customer.create({
      data: {
        tenantId,
        name: "Ana Souza",
        phone: "5511900000001",
        normalizedPhone: "5511900000001",
      },
    });
    const reader = new FakeReader(
      buildSnapshot({
        customers: emptyCategory("CUSTOMER", {
          records: [
            { externalId: "9", raw: { name: "Ana Souza", phone1: "5511900000001" } },
          ],
        }),
      }),
    );

    const result = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );

    const item = result.items.find((entry) => entry.category === "CUSTOMER")!;
    expect(item.matchClass).toBe("EXACT");
    expect(item.status).toBe("PENDING");
    expect(item.matchCandidateInternalIds).toEqual([existing.id]);
  });

  it("cliente sem nome recebe identificação temporária visível, sem inventar valores", async () => {
    const { preview, database } = setup();
    const session = await seedSession(database);
    const reader = new FakeReader(
      buildSnapshot({
        customers: emptyCategory("CUSTOMER", {
          records: [{ externalId: "42", raw: { name: null, phone1: "5511900000009" } }],
        }),
      }),
    );

    const result = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );

    const item = result.items.find((entry) => entry.category === "CUSTOMER")!;
    expect(item.label).toContain("42");
    expect(item.reasonCode).toBe("CUSTOMER_NAME_MISSING");
    expect(item.status).toBe("PENDING");
  });
});

describe("ImportPreviewService.analyze: versionamento e reanálise", () => {
  it("incrementa a versão do preview a cada análise", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database);
    const reader = new FakeReader(buildSnapshot());

    const first = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );
    const second = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );

    expect(first.previewVersion).toBe(1);
    expect(second.previewVersion).toBe(2);
  });

  it("reanálise reconcilia por identificador de origem e declara o que mudou", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database);
    const reader = new FakeReader(
      buildSnapshot({
        services: emptyCategory("SERVICE", {
          records: [{ externalId: "1", raw: { name: "Corte", duration: 30, price: 50 } }],
        }),
      }),
    );

    const first = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );
    expect(first.changesSincePreviousVersion).toEqual({
      newCount: 1,
      changedCount: 0,
      disappearedCount: 0,
    });

    // Segunda análise: mesmo conteúdo — nem novo, nem alterado.
    const second = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );
    expect(second.changesSincePreviousVersion).toEqual({
      newCount: 0,
      changedCount: 0,
      disappearedCount: 0,
    });

    const itemRows = database.tables.importItem.rows.filter(
      (row) => row.sessionId === session.id,
    );
    expect(itemRows).toHaveLength(1);
    expect(itemRows[0]!.firstSeenPreviewVersion).toBe(1);
    expect(itemRows[0]!.lastSeenPreviewVersion).toBe(2);

    // Terceira análise: o serviço muda de preço/duração — declarado como alterado.
    reader.setSnapshot(
      buildSnapshot({
        services: emptyCategory("SERVICE", {
          records: [{ externalId: "1", raw: { name: "Corte", duration: 45, price: 60 } }],
        }),
      }),
    );
    const third = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );
    expect(third.changesSincePreviousVersion).toEqual({
      newCount: 0,
      changedCount: 1,
      disappearedCount: 0,
    });

    // Quarta análise: o serviço deixa de existir na origem — não é apagado,
    // só ganha `disappearedAt`.
    reader.setSnapshot(buildSnapshot());
    await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );
    const afterDisappear = database.tables.importItem.rows.filter(
      (row) => row.sessionId === session.id,
    );
    expect(afterDisappear).toHaveLength(1);
    expect(afterDisappear[0]!.disappearedAt).not.toBeNull();
  });

  it("nunca reverte um item já resolvido por uma execução anterior", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database, {
      status: "PARTIAL",
      previewVersion: 1,
    });
    await database.client.importItem.create({
      data: {
        tenantId,
        sessionId: session.id,
        category: "SERVICE",
        externalId: "1",
        label: "Corte",
        status: "IMPORTED",
        entityType: "SERVICE",
        internalId: "already-created-service",
        fingerprint: "old-fingerprint",
        firstSeenPreviewVersion: 1,
        lastSeenPreviewVersion: 1,
      },
    });
    const reader = new FakeReader(
      buildSnapshot({
        services: emptyCategory("SERVICE", {
          records: [{ externalId: "1", raw: { name: "Corte", duration: 30, price: 50 } }],
        }),
      }),
    );

    const result = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );

    const item = result.items.find((entry) => entry.category === "SERVICE")!;
    expect(item.status).toBe("IMPORTED");

    const row = database.tables.importItem.rows.find(
      (entry) => entry.sessionId === session.id,
    )!;
    expect(row.status).toBe("IMPORTED");
    expect(row.internalId).toBe("already-created-service");
    expect(row.lastSeenPreviewVersion).toBe(2);
  });
});

describe("ImportPreviewService.assertPreviewVersionCurrent", () => {
  it("aceita a versão vigente sem lançar erro", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database, { previewVersion: 3 });

    await expect(
      preview.assertPreviewVersionCurrent(tenantId, session.id as string, 3),
    ).resolves.toBeUndefined();
  });

  it("recusa executar sobre uma versão de preview obsoleta com erro próprio", async () => {
    const { database, preview } = setup();
    const session = await seedSession(database, { previewVersion: 3 });

    let caught: unknown;
    try {
      await preview.assertPreviewVersionCurrent(tenantId, session.id as string, 2);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe("IMPORT_PREVIEW_STALE");
    expect((caught as AppError).details).toMatchObject({
      currentPreviewVersion: 3,
      requestedPreviewVersion: 2,
    });
  });

  it("recusa uma sessão inexistente com erro próprio", async () => {
    const { preview } = setup();

    await expect(
      preview.assertPreviewVersionCurrent(tenantId, "does-not-exist", 1),
    ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_FOUND" });
  });
});
