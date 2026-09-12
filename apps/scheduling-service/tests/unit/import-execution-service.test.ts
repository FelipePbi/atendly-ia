/**
 * Motor de importação retomável, idempotente por origem e com falha parcial
 * (Goal010, WU-04).
 *
 * As suítes montam o preview de verdade (`ImportPreviewService.analyze`) e
 * só então executam: os itens que o motor consome são exatamente os que a
 * análise produziu, e não uma fixture paralela que poderia divergir do
 * formato real. O dublê `createDatabaseDouble()` declara a unicidade
 * `(tenantId, provider, entityType, externalId)` de `ExternalEntityMap`,
 * então uma segunda criação do mesmo registro de origem falharia aqui como
 * falharia no banco — a idempotência provada não é a do próprio teste.
 */
import { describe, expect, it } from "vitest";

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

type Category = { externalId: string; raw: unknown };

function category(
  name: string,
  records: Category[] = [],
  coverage: Partial<{
    sourceSupported: boolean;
    limitationCode: string | null;
    limitationDetail: string | null;
    sourceReportedCount: number | null;
  }> = {},
) {
  return {
    category: name,
    coverage: {
      sourceSupported: coverage.sourceSupported ?? true,
      sourceReportedCount: coverage.sourceReportedCount ?? null,
      readCount: records.length,
      limitationCode: coverage.limitationCode ?? null,
      limitationDetail: coverage.limitationDetail ?? null,
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
      ReturnType<typeof category>
    >
  > = {},
) {
  return {
    generatedAt: "2026-09-10T12:00:00.000Z",
    services: overrides.services ?? category("SERVICE"),
    customers: overrides.customers ?? category("CUSTOMER"),
    availability: overrides.availability ?? category("AVAILABILITY"),
    timeBlocks: overrides.timeBlocks ?? category("TIME_BLOCK"),
    futureAppointments:
      overrides.futureAppointments ?? category("FUTURE_APPOINTMENT"),
    pastAppointments:
      overrides.pastAppointments ?? category("PAST_APPOINTMENT"),
    cancelledAppointments:
      overrides.cancelledAppointments ?? category("CANCELLED_APPOINTMENT"),
    noShowAppointments:
      overrides.noShowAppointments ?? category("NO_SHOW_APPOINTMENT"),
  } as never;
}

class FakeReader implements ImportPreviewSourceReader {
  constructor(private readonly snapshot: ReturnType<typeof buildSnapshot>) {}
  async getImportSnapshot() {
    return this.snapshot as never;
  }
}

function sourceService(
  overrides: Partial<{
    id: number;
    name: string;
    duration: number;
    price: number;
    deleted: boolean;
  }> = {},
) {
  return {
    id: overrides.id ?? 900,
    name: overrides.name ?? "Corte",
    duration: overrides.duration ?? 60,
    price: overrides.price ?? 80,
    colorId: null,
    deleted: overrides.deleted ?? false,
  };
}

function sourceCustomer(
  overrides: Partial<{ id: number; name: string; phone1: string }> = {},
) {
  return {
    id: overrides.id ?? 500,
    name: overrides.name ?? "Ana Souza",
    phone1: overrides.phone1 ?? "5511999990000",
    phone2: null,
  };
}

function sourceAppointment(
  overrides: Partial<{
    id: number;
    date: string;
    startTime: string;
    endTime: string;
    duration: number;
    price: number;
    deleted: boolean;
    comments: string | null;
    customer: ReturnType<typeof sourceCustomer>;
    service: ReturnType<typeof sourceService>;
  }> = {},
) {
  const customer = overrides.customer ?? sourceCustomer();
  const service = overrides.service ?? sourceService();
  return {
    id: overrides.id ?? 100,
    userId: 7,
    date: overrides.date ?? "2026-10-01",
    startTime: overrides.startTime ?? "09:00",
    endTime: overrides.endTime ?? "10:00",
    duration: overrides.duration ?? 60,
    customerId: customer.id,
    customer,
    serviceId: service.id,
    service,
    price: overrides.price ?? 80,
    comments: overrides.comments ?? null,
    deleted: overrides.deleted ?? false,
  };
}

function setup() {
  const database = createDatabaseDouble();
  database.tables.calendarSettings.rows.push({
    id: tenantId,
    tenantId,
    source: "MINHA_AGENDA",
    timezone: timeZone,
  } as never);
  const preview = new ImportPreviewService(database.client as never);
  const execution = new ImportExecutionService(database.client as never);
  return { database, preview, execution };
}

async function seedSession(database: ReturnType<typeof createDatabaseDouble>) {
  return database.client.importSession.create({
    data: {
      tenantId,
      sourceAccountId: "account-1",
      createdBy: "user-1",
    },
  });
}

/** Analisa e devolve a sessão pronta para executar, como o produto faz. */
async function analyzed(
  database: ReturnType<typeof createDatabaseDouble>,
  preview: ImportPreviewService,
  snapshot: ReturnType<typeof buildSnapshot>,
) {
  const session = await seedSession(database);
  const reader = new FakeReader(snapshot);
  await preview.analyze(
    { tenantId, sessionId: session.id },
    reader,
    snapshotInput,
  );
  return { sessionId: session.id, reader };
}

function itemsByCategory(
  database: ReturnType<typeof createDatabaseDouble>,
  category: string,
) {
  return database.tables.importItem.rows.filter(
    (row) => row.category === category,
  );
}

describe("ImportExecutionService: processamento por item com checkpoint", () => {
  it("não abre transação sobre o lote: cada agendamento entra em uma transação própria, com o evento no mesmo commit", async () => {
    const { database, preview, execution } = setup();
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService() },
      ]),
      customers: category("CUSTOMER", [
        { externalId: "500", raw: sourceCustomer() },
      ]),
      futureAppointments: category("FUTURE_APPOINTMENT", [
        { externalId: "100", raw: sourceAppointment({ id: 100 }) },
        {
          externalId: "101",
          raw: sourceAppointment({
            id: 101,
            date: "2026-10-02",
            startTime: "14:00",
            endTime: "15:00",
          }),
        },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);

    await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    const appointmentWrites = database.journal
      .writesFor("appointment")
      .filter((write) => write.operation === "create");
    expect(appointmentWrites).toHaveLength(2);
    const transactions = appointmentWrites.map((write) => write.transaction);
    expect(transactions.every((value) => value !== null)).toBe(true);
    // Duas transações distintas: não existe transação cobrindo o lote.
    expect(new Set(transactions).size).toBe(2);
    // Evento e atendimento no mesmo commit (Goal008).
    const eventTransactions = database.journal
      .writesFor("appointmentEvent")
      .map((write) => write.transaction);
    expect(new Set(eventTransactions)).toEqual(new Set(transactions));
  });

  it("importa serviço e cliente antes do agendamento que os referencia", async () => {
    const { database, preview, execution } = setup();
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService() },
      ]),
      customers: category("CUSTOMER", [
        { externalId: "500", raw: sourceCustomer() },
      ]),
      futureAppointments: category("FUTURE_APPOINTMENT", [
        { externalId: "100", raw: sourceAppointment() },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);

    await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    const service = database.tables.service.rows[0];
    const customer = database.tables.customer.rows[0];
    const appointment = database.tables.appointment.rows[0];
    const item = database.tables.appointmentItem.rows[0];
    expect(service).toBeDefined();
    expect(customer).toBeDefined();
    expect(appointment.customerId).toBe(customer.id);
    expect(item.serviceId).toBe(service.id);
  });

  it("marca o agendamento cujo cliente não foi importado e segue com os demais", async () => {
    const { database, preview, execution } = setup();
    const known = sourceCustomer({ id: 500 });
    const unknown = sourceCustomer({ id: 777, name: "Bruno Lima" });
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService() },
      ]),
      // O cliente 777 não aparece na categoria de clientes: a origem só
      // expõe quem ela mostrou, e o motor não inventa a pessoa que falta.
      customers: category("CUSTOMER", [{ externalId: "500", raw: known }]),
      futureAppointments: category("FUTURE_APPOINTMENT", [
        {
          externalId: "100",
          raw: sourceAppointment({ id: 100, customer: unknown }),
        },
        {
          externalId: "101",
          raw: sourceAppointment({
            id: 101,
            customer: known,
            date: "2026-10-02",
          }),
        },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);

    const result = await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    const appointments = itemsByCategory(database, "FUTURE_APPOINTMENT");
    const failed = appointments.find((row) => row.externalId === "100");
    const imported = appointments.find((row) => row.externalId === "101");
    expect(failed?.status).toBe("FAILED");
    expect(failed?.reasonCode).toBe("IMPORT_CUSTOMER_MAPPING_MISSING");
    expect(imported?.status).toBe("IMPORTED");
    expect(database.tables.appointment.rows).toHaveLength(1);
    expect(result.status).toBe("PARTIAL");
    expect(result.counts.failed).toBe(1);
  });
});

describe("ImportExecutionService: falha parcial e contagens reais", () => {
  it("um registro fora do contrato marca só aquele item e a sessão fica parcial", async () => {
    const { database, preview, execution } = setup();
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService({ id: 900, name: "Corte" }) },
        // Fora do contrato: `price` não é numero. O preview deixa passar
        // como pendente (ele só olha nome e duração); é o motor, na hora de
        // mapear, que recusa o registro.
        {
          externalId: "901",
          raw: {
            id: 901,
            name: "Barba",
            duration: 30,
            price: "sessenta",
            colorId: null,
            deleted: false,
          },
        },
        { externalId: "902", raw: sourceService({ id: 902, name: "Luzes" }) },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);

    const result = await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    const items = itemsByCategory(database, "SERVICE");
    expect(items.find((row) => row.externalId === "901")?.status).toBe(
      "FAILED",
    );
    expect(items.find((row) => row.externalId === "901")?.reasonCode).toBe(
      "IMPORT_SOURCE_RECORD_INVALID",
    );
    expect(items.find((row) => row.externalId === "900")?.status).toBe(
      "IMPORTED",
    );
    expect(items.find((row) => row.externalId === "902")?.status).toBe(
      "IMPORTED",
    );
    expect(database.tables.service.rows).toHaveLength(2);
    expect(result.status).toBe("PARTIAL");
  });

  it("contagens de importados, ignorados, em revisão e falhos batem com o banco", async () => {
    const { database, preview, execution } = setup();
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService({ id: 900 }) },
        // Sem duração: o preview manda para revisão, e "Importar tudo" não
        // resolve divergência sozinho.
        { externalId: "901", raw: sourceService({ id: 901, duration: 0 }) },
        {
          externalId: "902",
          raw: {
            id: 902,
            name: "Quebrado",
            duration: 30,
            price: "cem",
            colorId: null,
            deleted: false,
          },
        },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);

    const result = await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    const rows = database.tables.importItem.rows;
    const fromDatabase = {
      pending: rows.filter((row) => row.status === "PENDING").length,
      imported: rows.filter((row) => row.status === "IMPORTED").length,
      skipped: rows.filter((row) => row.status === "SKIPPED").length,
      failed: rows.filter((row) => row.status === "FAILED").length,
      needsReview: rows.filter((row) => row.status === "NEEDS_REVIEW").length,
    };
    expect(result.counts).toEqual(fromDatabase);
    expect(fromDatabase).toEqual({
      pending: 0,
      imported: 1,
      skipped: 0,
      failed: 1,
      needsReview: 1,
    });

    const session = database.tables.importSession.rows[0];
    expect(session.importedCount).toBe(fromDatabase.imported);
    expect(session.failedCount).toBe(fromDatabase.failed);
    expect(session.needsReviewCount).toBe(fromDatabase.needsReview);
    expect(session.skippedCount).toBe(fromDatabase.skipped);
    expect(session.pendingCount).toBe(fromDatabase.pending);
    expect(session.status).toBe("PARTIAL");

    const categoryRow = database.tables.importSessionCategory.rows.find(
      (row) => row.category === "SERVICE",
    );
    expect(categoryRow?.importedCount).toBe(1);
    expect(categoryRow?.failedCount).toBe(1);
    expect(categoryRow?.needsReviewCount).toBe(1);
    expect(categoryRow?.checkpointAt).toBeInstanceOf(Date);
  });
});

describe("ImportExecutionService: idempotência por origem/item", () => {
  it("reexecutar a mesma sessão não cria segundo registro na Atendly", async () => {
    const { database, preview, execution } = setup();
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService() },
      ]),
      customers: category("CUSTOMER", [
        { externalId: "500", raw: sourceCustomer() },
      ]),
      futureAppointments: category("FUTURE_APPOINTMENT", [
        { externalId: "100", raw: sourceAppointment() },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);
    const context = { tenantId, sessionId, userId: "user-1" };

    await execution.execute(context, reader, snapshotInput, {
      previewVersion: 1,
    });
    const second = await execution.execute(context, reader, snapshotInput, {
      previewVersion: 1,
    });

    expect(database.tables.service.rows).toHaveLength(1);
    expect(database.tables.customer.rows).toHaveLength(1);
    expect(database.tables.appointment.rows).toHaveLength(1);
    expect(database.tables.externalEntityMap.rows).toHaveLength(3);
    // Nada restou por processar: a segunda passada não tentou item nenhum.
    expect(second.processed).toBe(0);
    expect(second.counts.imported).toBe(3);
  });

  it("checkpoint perdido depois do efeito não duplica: o mapa de origem reconcilia o item", async () => {
    const { database, preview, execution } = setup();
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService() },
      ]),
      customers: category("CUSTOMER", [
        { externalId: "500", raw: sourceCustomer() },
      ]),
      futureAppointments: category("FUTURE_APPOINTMENT", [
        { externalId: "100", raw: sourceAppointment() },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);
    const context = { tenantId, sessionId, userId: "user-1" };

    await execution.execute(context, reader, snapshotInput, {
      previewVersion: 1,
    });
    const mapsAfterFirstRun = database.tables.externalEntityMap.rows.length;

    // Cenário do casamento entre checkpoint e idempotência: o efeito e o mapa
    // de origem estão gravados, mas o checkpoint do item se perdeu. Reexecutar
    // não pode criar um segundo registro na Atendly.
    for (const row of database.tables.importItem.rows) {
      row.status = "PENDING";
      row.internalId = null;
      row.entityType = null;
      row.processedAt = null;
      row.reasonCode = null;
      row.reasonDetail = null;
    }

    const result = await execution.execute(context, reader, snapshotInput, {
      previewVersion: 1,
    });

    expect(database.tables.service.rows).toHaveLength(1);
    expect(database.tables.customer.rows).toHaveLength(1);
    expect(database.tables.appointment.rows).toHaveLength(1);
    expect(database.tables.externalEntityMap.rows).toHaveLength(
      mapsAfterFirstRun,
    );
    expect(result.counts).toMatchObject({ imported: 3, failed: 0 });
    expect(
      database.tables.importItem.rows.every(
        (row) =>
          row.status === "IMPORTED" &&
          row.reasonCode === "ALREADY_IMPORTED_FROM_SOURCE",
      ),
    ).toBe(true);
  });

  it("origem já mapeada em base preenchida reaproveita o registro existente sem criar outro", async () => {
    const { database, preview, execution } = setup();
    const existingService = await database.client.service.create({
      data: {
        tenantId,
        name: "Corte",
        durationMinutes: 60,
        priceType: "FIXED",
        price: 80,
        active: true,
      },
    });
    await database.client.externalEntityMap.create({
      data: {
        tenantId,
        provider: "MINHA_AGENDA",
        entityType: "SERVICE",
        internalId: existingService.id,
        externalId: "900",
      },
    });
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService() },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);

    await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    expect(database.tables.service.rows).toHaveLength(1);
    const item = itemsByCategory(database, "SERVICE")[0];
    expect(item.status).toBe("IMPORTED");
    expect(item.internalId).toBe(existingService.id);
  });
});

describe("ImportExecutionService: retomada do checkpoint", () => {
  it("reinício no meio do lote continua de onde parou, sem duplicar", async () => {
    const { database, preview, execution } = setup();
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService({ id: 900, name: "Corte" }) },
        { externalId: "901", raw: sourceService({ id: 901, name: "Luzes" }) },
      ]),
      customers: category("CUSTOMER", [
        { externalId: "500", raw: sourceCustomer() },
      ]),
      futureAppointments: category("FUTURE_APPOINTMENT", [
        { externalId: "100", raw: sourceAppointment() },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);
    const context = { tenantId, sessionId, userId: "user-1" };

    // Uma passada que para no primeiro item: é a queda no meio do lote.
    const first = await execution.execute(context, reader, snapshotInput, {
      previewVersion: 1,
      maxItems: 1,
    });
    expect(first.processed).toBe(1);
    expect(first.status).toBe("PARTIAL");
    expect(database.tables.service.rows).toHaveLength(1);
    const serviceCategory = database.tables.importSessionCategory.rows.find(
      (row) => row.category === "SERVICE",
    );
    expect(serviceCategory?.cursor).toEqual({ lastExternalId: "900" });

    const second = await execution.execute(context, reader, snapshotInput, {
      previewVersion: 1,
    });

    expect(second.processed).toBe(3);
    expect(database.tables.service.rows).toHaveLength(2);
    expect(database.tables.customer.rows).toHaveLength(1);
    expect(database.tables.appointment.rows).toHaveLength(1);
    expect(second.counts).toMatchObject({ imported: 4, failed: 0, pending: 0 });
    expect(second.status).toBe("READY");
  });
});

describe("ImportExecutionService: política única de escrita da agenda", () => {
  it("trava os dias afetados e repete o aborto serializável dentro do limite", async () => {
    const { database, preview, execution } = setup();
    // Base já preenchida e mapeada: a única escrita desta execução é a do
    // agendamento, então o aborto injetado atinge exatamente ela.
    const service = await database.client.service.create({
      data: {
        tenantId,
        name: "Corte",
        durationMinutes: 60,
        priceType: "FIXED",
        price: 80,
        active: true,
      },
    });
    const customer = await database.client.customer.create({
      data: {
        tenantId,
        name: "Ana Souza",
        phone: "5511999990000",
        normalizedPhone: "5511999990000",
      },
    });
    for (const entry of [
      { entityType: "SERVICE", internalId: service.id, externalId: "900" },
      { entityType: "CUSTOMER", internalId: customer.id, externalId: "500" },
    ]) {
      await database.client.externalEntityMap.create({
        data: { tenantId, provider: "MINHA_AGENDA", ...entry },
      });
    }
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService() },
      ]),
      customers: category("CUSTOMER", [
        { externalId: "500", raw: sourceCustomer() },
      ]),
      futureAppointments: category("FUTURE_APPOINTMENT", [
        { externalId: "100", raw: sourceAppointment() },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);

    // Aborto serializável do PostgreSQL: `runCalendarWrite` repete a
    // transação inteira, e nada da tentativa anterior sobrevive. A primeira
    // transação da passada é a reivindicação do lease (WU-05), que não é
    // escrita de agenda; injetar o aborto na leitura da origem — que roda
    // logo depois do lease e antes do primeiro item — o faz atingir
    // exatamente a escrita do agendamento.
    const abortingReader: ImportPreviewSourceReader = {
      async getImportSnapshot(input) {
        database.failNextTransactions(1, { code: "P2034" });
        return reader.getImportSnapshot(input);
      },
    };

    const result = await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      abortingReader,
      snapshotInput,
      { previewVersion: 1 },
    );

    expect(result.counts).toMatchObject({ imported: 3, failed: 0 });
    expect(database.tables.appointment.rows).toHaveLength(1);
    expect(database.journal.locks).toContain(`${tenantId}:2026-10-01`);
  });

  it("bloqueio importado vira TimeBlock sob a mesma política", async () => {
    const { database, preview, execution } = setup();
    const snapshot = buildSnapshot({
      timeBlocks: category("TIME_BLOCK", [
        {
          externalId: "300",
          raw: sourceAppointment({
            id: 300,
            date: "2026-10-05",
            startTime: "12:00",
            endTime: "13:00",
            comments: "Almoço",
          }),
        },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);

    await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    const block = database.tables.timeBlock.rows[0];
    expect(block).toBeDefined();
    expect(block.reason).toBe("Almoço");
    expect(database.journal.locks).toContain(`${tenantId}:2026-10-05`);
    const write = database.journal.writesFor("timeBlock")[0];
    expect(write.transaction).not.toBeNull();
    expect(itemsByCategory(database, "TIME_BLOCK")[0].entityType).toBe(
      "TIME_BLOCK",
    );
  });
});

describe("ImportExecutionService: fidelidade do que foi importado", () => {
  it("agendamento futuro nasce como atendimento normal, com snapshot e evento CREATED", async () => {
    const { database, preview, execution } = setup();
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService() },
      ]),
      customers: category("CUSTOMER", [
        { externalId: "500", raw: sourceCustomer() },
      ]),
      futureAppointments: category("FUTURE_APPOINTMENT", [
        { externalId: "100", raw: sourceAppointment() },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);

    await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    const appointment = database.tables.appointment.rows[0];
    expect(appointment.source).toBe("INTEGRATION");
    expect(appointment.status).toBe("CONFIRMED");
    expect(appointment.statusRaw).toBe("SCHEDULED");
    expect(appointment.createdBy).toBe("user-1");
    // 09:00 em São Paulo (UTC-3) é 12:00Z; a duração da origem define o fim.
    expect((appointment.startAt as Date).toISOString()).toBe(
      "2026-10-01T12:00:00.000Z",
    );
    expect((appointment.endAt as Date).toISOString()).toBe(
      "2026-10-01T13:00:00.000Z",
    );

    const item = database.tables.appointmentItem.rows[0];
    expect(item.serviceNameSnapshot).toBe("Corte");
    expect(item.durationMinutesSnapshot).toBe(60);
    expect(item.priceTypeSnapshot).toBe("FIXED");
    expect(item.priceSnapshot).toBe(80);

    const events = database.tables.appointmentEvent.rows;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("CREATED");
    expect(events[0].source).toBe("INTEGRATION");
    expect(events[0].actor).toBe("user-1");
  });

  it("histórico preserva data, horário, serviço e preço, e não inventa conclusão pela data", async () => {
    const { database, preview, execution } = setup();
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        { externalId: "900", raw: sourceService() },
      ]),
      customers: category("CUSTOMER", [
        { externalId: "500", raw: sourceCustomer() },
      ]),
      pastAppointments: category("PAST_APPOINTMENT", [
        {
          externalId: "200",
          raw: sourceAppointment({
            id: 200,
            date: "2024-03-05",
            startTime: "15:30",
            endTime: "16:30",
            price: 120,
            service: sourceService({ price: 120 }),
          }),
        },
      ]),
      cancelledAppointments: category("CANCELLED_APPOINTMENT", [
        {
          externalId: "201",
          raw: sourceAppointment({
            id: 201,
            date: "2024-03-06",
            deleted: true,
          }),
        },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);

    await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    const past = database.tables.appointment.rows.find((row) =>
      (row.startAt as Date).toISOString().startsWith("2024-03-05"),
    );
    expect(past?.status).toBe("CONFIRMED");
    // Passado não é conclusão: quem conclui é a regra do Goal008.
    expect(past?.completedAt).toBeNull();
    expect(past?.noShowAt).toBeNull();
    expect((past?.startAt as Date).toISOString()).toBe(
      "2024-03-05T18:30:00.000Z",
    );
    const pastItem = database.tables.appointmentItem.rows.find(
      (row) => row.appointmentId === past?.id,
    );
    expect(pastItem?.priceSnapshot).toBe(120);

    const cancelled = database.tables.appointment.rows.find((row) =>
      (row.startAt as Date).toISOString().startsWith("2024-03-06"),
    );
    expect(cancelled?.status).toBe("CANCELLED");
    expect(cancelled?.statusRaw).toBe("CANCELLED");
  });

  it("disponibilidade é importada como grupo dependente e não vira segunda jornada", async () => {
    const { database, preview, execution } = setup();
    const companySchedule = {
      monEnabled: true,
      monStartTime1: "09:00",
      monEndTime1: "18:00",
      tueEnabled: false,
    };
    const employeeSchedule = {
      monEnabled: true,
      monStartTime1: "10:00",
      monEndTime1: "16:00",
    };
    const snapshot = buildSnapshot({
      availability: category("AVAILABILITY", [
        { externalId: "company", raw: companySchedule },
        { externalId: "employee:7", raw: employeeSchedule },
      ]),
    });
    const { sessionId, reader } = await analyzed(database, preview, snapshot);
    const context = { tenantId, sessionId, userId: "user-1" };

    await execution.execute(context, reader, snapshotInput, {
      previewVersion: 1,
    });
    const rulesAfterFirstRun = database.tables.availabilityRule.rows.length;
    expect(rulesAfterFirstRun).toBe(1);
    // A jornada do profissional tem precedência sobre a da empresa.
    expect(
      (
        database.tables.availabilityRule.rows[0].startTime as Date
      ).toISOString(),
    ).toBe("1970-01-01T10:00:00.000Z");

    for (const row of itemsByCategory(database, "AVAILABILITY")) {
      row.status = "PENDING";
      row.internalId = null;
      row.entityType = null;
    }
    await execution.execute(context, reader, snapshotInput, {
      previewVersion: 1,
    });

    expect(database.tables.availabilityRule.rows).toHaveLength(
      rulesAfterFirstRun,
    );
    expect(
      itemsByCategory(database, "AVAILABILITY").every(
        (row) => row.status === "IMPORTED",
      ),
    ).toBe(true);
  });
});
