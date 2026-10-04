/**
 * Goal062, WU-01: listagem completa de clientes com recuo declarado e preço
 * zero.
 *
 * A cobertura por só quem aparece vinculado a agendamento/bloqueio
 * (`CUSTOMER_DIRECTORY_UNAVAILABLE`) já tem suíte própria em
 * `minha-agenda-import-snapshot.test.ts`, exercitada com um dublê que nunca
 * implementa `listCustomers`. Esta suíte cobre o que o Goal062 adiciona: a
 * listagem completa quando o método existe, o recuo quando ele existe mas
 * recusa (404/forma inválida) com um código de limitação **novo** e distinto,
 * a propagação de falhas que não são de listagem (login recusado, origem
 * indisponível), e o preço 0 da origem virando `NOT_INFORMED`/`null` no
 * catálogo e no serviço embutido do agendamento.
 *
 * Nenhum teste chama a Minha Agenda real: o dublê de origem é sempre local.
 */
import { describe, expect, it } from "vitest";

import type { MinhaAgendaSourceClient } from "../../src/modules/integrations/minha-agenda/client.js";
import type { MinhaAgendaConnectionConfig } from "../../src/modules/integrations/minha-agenda/config.js";
import { MinhaAgendaImportSourceReader } from "../../src/modules/integrations/minha-agenda/import-source-reader.js";
import { ImportExecutionService } from "../../src/modules/migrations/import-execution-service.js";
import {
  ImportPreviewService,
  type ImportPreviewSourceReader,
} from "../../src/modules/migrations/import-preview-service.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";

// ---------------------------------------------------------------------------
// Diretório completo de clientes (MinhaAgendaImportSourceReader).
// ---------------------------------------------------------------------------

function config(): MinhaAgendaConnectionConfig {
  return {
    tenantId,
    baseUrl: "https://minha-agenda.example.invalid",
    basicAuth: "Basic abc",
    username: "user",
    password: "secret",
    employeeId: 7,
    timeoutMs: 1_000,
    refreshSkewSeconds: 300,
  };
}

/** Dublê da origem: superfície idêntica ao client HTTP, sem rede. */
class FakeSourceClient implements MinhaAgendaSourceClient {
  operational: Array<Record<string, unknown>> = [];
  customers: Array<Record<string, unknown>> = [];
  customersError: unknown = null;
  hasListCustomers = true;

  async listServices() {
    return [];
  }
  async listCustomers() {
    if (this.customersError) throw this.customersError;
    return this.customers as never;
  }
  async findAppointmentsByDateRange(query: {
    startDate: string;
    endDate: string;
    isSlotBlocker: boolean;
  }) {
    if (query.isSlotBlocker) return [];
    return this.operational.filter(
      (item) => item.date >= query.startDate && item.date <= query.endDate,
    ) as never;
  }
  async getCompanyWorkSchedule() {
    return {};
  }
  async getEmployeeWorkScheduleByEmployeeId() {
    return {};
  }
}

/** Sem `listCustomers`, no mesmo espírito do dublê que não implementa o método. */
class NoDirectoryClient extends FakeSourceClient {
  listCustomers = undefined as unknown as FakeSourceClient["listCustomers"];
}

function reader(client: FakeSourceClient) {
  return new MinhaAgendaImportSourceReader(config(), client);
}

function snapshotInput() {
  return {
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    referenceDate: "2026-01-01",
  };
}

describe("MinhaAgendaImportSourceReader.getImportSnapshot: diretório completo de clientes", () => {
  it("une a listagem da origem com quem aparece vinculado a agendamento, deduplicado por id", async () => {
    const client = new FakeSourceClient();
    client.customers = [
      { id: 1, name: "Ana" },
      { id: 2, name: "Bruno" },
      // Excluído: apagado na origem e nunca referenciado por agendamento.
      { id: 4, name: "Descontinuada", deleted: true },
    ];
    client.operational = [
      {
        id: 900,
        userId: 7,
        date: "2026-01-10",
        startTime: "09:00",
        endTime: "09:30",
        duration: 30,
        customerId: 3,
        // Só aparece vinculado a agendamento, fora da listagem.
        customer: { id: 3, name: "Carla" },
        serviceId: null,
        service: null,
        price: 50,
      },
      {
        id: 901,
        userId: 7,
        date: "2026-01-11",
        startTime: "10:00",
        endTime: "10:30",
        duration: 30,
        customerId: 2,
        // Apagado na origem, mas referenciado: prevalece sobre a exclusão.
        customer: { id: 2, name: "Bruno", deleted: true },
        serviceId: null,
        service: null,
        price: 50,
      },
    ];

    const snapshot = await reader(client).getImportSnapshot(snapshotInput());

    expect(snapshot.customers.coverage).toMatchObject({
      sourceSupported: true,
      sourceReportedCount: 3,
      limitationCode: null,
      limitationDetail: null,
      readCount: 3,
    });
    expect(
      snapshot.customers.records.map((record) => record.externalId).sort(),
    ).toEqual(["1", "2", "3"]);
  });

  it("recua para a cobertura antiga com um código de limitação novo quando a origem devolve 404", async () => {
    const client = new FakeSourceClient();
    client.customersError = new AppError(
      "MINHA_AGENDA_HTTP_ERROR",
      "Minha Agenda returned HTTP 404.",
      502,
      { originStatus: 404 },
    );
    client.operational = [
      {
        id: 900,
        userId: 7,
        date: "2026-01-10",
        startTime: "09:00",
        endTime: "09:30",
        duration: 30,
        customerId: 3,
        customer: { id: 3, name: "Carla" },
        serviceId: null,
        service: null,
        price: 50,
      },
    ];

    const snapshot = await reader(client).getImportSnapshot(snapshotInput());

    expect(snapshot.customers.coverage.sourceSupported).toBe(false);
    expect(snapshot.customers.coverage.limitationCode).toBe(
      "CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED",
    );
    expect(snapshot.customers.coverage.limitationCode).not.toBe(
      "CUSTOMER_DIRECTORY_UNAVAILABLE",
    );
    expect(snapshot.customers.records.map((record) => record.externalId)).toEqual([
      "3",
    ]);
  });

  it("recua com o mesmo código novo quando a resposta é fora do contrato", async () => {
    const client = new FakeSourceClient();
    client.customersError = new AppError(
      "MINHA_AGENDA_INVALID_RESPONSE",
      'Minha Agenda response for "customers" did not match the expected contract.',
      502,
      { context: "customers", issues: [] },
    );

    const snapshot = await reader(client).getImportSnapshot(snapshotInput());

    expect(snapshot.customers.coverage.sourceSupported).toBe(false);
    expect(snapshot.customers.coverage.limitationCode).toBe(
      "CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED",
    );
  });

  it("sem o método no dublê, recua para o código antigo (compatibilidade com leitor sem diretório)", async () => {
    const client = new NoDirectoryClient();

    const snapshot = await reader(client).getImportSnapshot(snapshotInput());

    expect(snapshot.customers.coverage.sourceSupported).toBe(false);
    expect(snapshot.customers.coverage.limitationCode).toBe(
      "CUSTOMER_DIRECTORY_UNAVAILABLE",
    );
  });

  it("login recusado ao listar clientes continua falhando o trabalho inteiro", async () => {
    const client = new FakeSourceClient();
    client.customersError = new AppError(
      "MINHA_AGENDA_AUTH_FAILED",
      "Minha Agenda authentication failed: invalid credentials.",
      422,
      { originStatus: 401 },
    );

    let caught: unknown;
    try {
      await reader(client).getImportSnapshot(snapshotInput());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    const appError = caught as AppError;
    expect(appError.code).toBe("MINHA_AGENDA_IMPORT_CATEGORY_FAILED");
    expect(appError.details).toMatchObject({
      categories: ["CUSTOMER"],
      cause: "MINHA_AGENDA_AUTH_FAILED",
    });
  });

  it("origem indisponível (HTTP 500) ao listar clientes continua falhando o trabalho inteiro", async () => {
    const client = new FakeSourceClient();
    client.customersError = new AppError(
      "MINHA_AGENDA_HTTP_ERROR",
      "Minha Agenda returned HTTP 500.",
      502,
      { originStatus: 500 },
    );

    let caught: unknown;
    try {
      await reader(client).getImportSnapshot(snapshotInput());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe("MINHA_AGENDA_IMPORT_CATEGORY_FAILED");
  });
});

// ---------------------------------------------------------------------------
// Preço 0 vira NOT_INFORMED/null, com reasonCode informativo que não bloqueia.
// ---------------------------------------------------------------------------

function category(name: string, records: Array<{ externalId: string; raw: unknown }> = []) {
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
    generatedAt: "2026-09-27T12:00:00.000Z",
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

function seedSession(database: ReturnType<typeof createDatabaseDouble>) {
  return database.client.importSession.create({
    data: { tenantId, sourceAccountId: "account-1", createdBy: "user-1" },
  });
}

describe("Preço 0 da origem vira NOT_INFORMED/null, sem bloquear a análise", () => {
  it("classifica o serviço com preço 0 como pendente normal, com reasonCode informativo", async () => {
    const database = createDatabaseDouble();
    const preview = new ImportPreviewService(database.client as never);
    const session = await seedSession(database);
    const reader = new FakeReader(
      buildSnapshot({
        services: category("SERVICE", [
          {
            externalId: "1",
            raw: { id: 1, name: "Sobrancelha", duration: 20, price: 0, colorId: null, deleted: false },
          },
        ]),
      }),
    );

    const result = await preview.analyze(
      { tenantId, sessionId: session.id },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
    );

    const item = result.items.find((entry) => entry.externalId === "1");
    expect(item).toMatchObject({
      status: "PENDING",
      reasonCode: "SERVICE_PRICE_NOT_INFORMED",
    });
  });

  it("cria o serviço do catálogo com priceType NOT_INFORMED e price null quando a origem manda preço 0", async () => {
    const database = createDatabaseDouble();
    const preview = new ImportPreviewService(database.client as never);
    const execution = new ImportExecutionService(database.client as never);
    const session = await seedSession(database);
    await database.client.calendarSettings.create({
      data: { tenantId, source: "AVENLY", timezone: "America/Sao_Paulo" },
    });
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        {
          externalId: "1",
          raw: { id: 1, name: "Sobrancelha", duration: 20, price: 0, colorId: null, deleted: false },
        },
      ]),
    });
    const reader = new FakeReader(snapshot);
    await preview.analyze({ tenantId, sessionId: session.id }, reader, {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      referenceDate: "2026-01-01",
    });

    await execution.execute(
      { tenantId, sessionId: session.id, userId: "user-1" },
      reader,
      { startDate: "2026-01-01", endDate: "2026-01-31", referenceDate: "2026-01-01" },
      { previewVersion: 1 },
    );

    const created = database.tables.service.rows.find(
      (row) => row.name === "Sobrancelha",
    );
    expect(created).toMatchObject({ priceType: "NOT_INFORMED", price: null });
  });

  it("preserva preço 0 do serviço embutido do agendamento como NOT_INFORMED/null, sem mudar o preço total do agendamento", async () => {
    const database = createDatabaseDouble();
    const preview = new ImportPreviewService(database.client as never);
    const execution = new ImportExecutionService(database.client as never);
    const session = await seedSession(database);
    await database.client.calendarSettings.create({
      data: { tenantId, source: "AVENLY", timezone: "America/Sao_Paulo" },
    });
    const snapshot = buildSnapshot({
      services: category("SERVICE", [
        {
          externalId: "10",
          raw: { id: 10, name: "Escova", duration: 30, price: 40, colorId: null, deleted: false },
        },
      ]),
      customers: category("CUSTOMER", [
        { externalId: "500", raw: { id: 500, name: "Ana Souza", phone1: "5511999990000" } },
      ]),
      futureAppointments: category("FUTURE_APPOINTMENT", [
        {
          externalId: "900",
          raw: {
            id: 900,
            userId: 7,
            date: "2026-10-01",
            startTime: "09:00",
            endTime: "09:30",
            duration: 30,
            customerId: 500,
            customer: { id: 500, name: "Ana Souza", phone1: "5511999990000" },
            serviceId: 10,
            service: { id: 10, name: "Escova", duration: 30, price: 0, colorId: null, deleted: false },
            // Preço total do agendamento na origem: não é o que este teste
            // verifica, mas precisa continuar intacto — nunca reescrito por
            // esta correção do preço do serviço embutido.
            price: 40,
          },
        },
      ]),
    });
    const reader = new FakeReader(snapshot);
    await preview.analyze({ tenantId, sessionId: session.id }, reader, {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      referenceDate: "2026-09-01",
    });

    await execution.execute(
      { tenantId, sessionId: session.id, userId: "user-1" },
      reader,
      { startDate: "2026-01-01", endDate: "2026-12-31", referenceDate: "2026-09-01" },
      { previewVersion: 1 },
    );

    const item = database.tables.appointmentItem.rows.find(
      (row) => row.serviceNameSnapshot === "Escova",
    );
    expect(item).toMatchObject({
      priceTypeSnapshot: "NOT_INFORMED",
      priceSnapshot: null,
    });
    const sourceAppointment = snapshot.futureAppointments.records[0]
      .raw as { price: number };
    expect(sourceAppointment.price).toBe(40);
  });
});
