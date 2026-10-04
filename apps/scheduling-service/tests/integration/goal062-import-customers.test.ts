import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import type { MinhaAgendaSourceClient } from "../../src/modules/integrations/minha-agenda/client.js";
import type { MinhaAgendaConnectionConfig } from "../../src/modules/integrations/minha-agenda/config.js";
import { MinhaAgendaImportSourceReader } from "../../src/modules/integrations/minha-agenda/import-source-reader.js";
import { ImportCompletionService } from "../../src/modules/migrations/import-completion-service.js";
import { ImportExecutionService } from "../../src/modules/migrations/import-execution-service.js";
import { ImportPreviewService } from "../../src/modules/migrations/import-preview-service.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal062 §1 contra PostgreSQL real: a categoria CUSTOMER traz a base
 * inteira da origem, não só quem aparece vinculado a um agendamento.
 *
 * O leitor é o de produção (`MinhaAgendaImportSourceReader`), sobre um dublê
 * local do client da origem: `GET /customers` é o `listCustomers` do dublê.
 * Assim a suíte prova a leitura da listagem, a união, o recuo declarado e a
 * gravação real de `Customer` e `ExternalEntityMap`. Nenhum teste chama a
 * Minha Agenda real.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantId = "goal062-wu01-tenant-a";
const otherTenantId = "goal062-wu01-tenant-b";
const timeZone = "America/Sao_Paulo";
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-09-10",
};

let prisma: PrismaClient;

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

/** Dublê da origem: mesma superfície do client HTTP, sem rede. */
class FakeSourceClient implements MinhaAgendaSourceClient {
  operational: Array<Record<string, unknown>> = [];
  customers: Array<Record<string, unknown>> = [];
  customersError: unknown = null;

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
      (item) =>
        String(item.date) >= query.startDate && String(item.date) <= query.endDate,
    ) as never;
  }
  async getCompanyWorkSchedule() {
    return {};
  }
  async getEmployeeWorkScheduleByEmployeeId() {
    return {};
  }
}

function sourceReader(client: FakeSourceClient) {
  return new MinhaAgendaImportSourceReader(config(), client);
}

/** Agendamento da origem que só referencia a cliente Carla (id 3). */
function appointmentWithCarla() {
  return {
    id: 900,
    userId: 7,
    date: "2026-10-10",
    startTime: "09:00",
    endTime: "09:30",
    duration: 30,
    customerId: 3,
    customer: { id: 3, name: "Carla" },
    serviceId: null,
    service: null,
    price: 50,
  };
}

async function seedTenant(id: string = tenantId) {
  await prisma.calendarSettings.upsert({
    where: { tenantId: id },
    create: { tenantId: id, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
}

function startSession(id: string = tenantId) {
  return new ImportCompletionService(prisma).startSession({
    tenantId: id,
    userId: "user-1",
    sourceAccountId: "account-1",
    sourceAccountLabel: "Salao da Ana",
  });
}

describeWithDatabase("goal062 CUSTOMER directory against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await resetTenant(prisma, tenantId);
    await resetTenant(prisma, otherTenantId);
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenantId);
    await resetTenant(prisma, otherTenantId);
    await seedTenant();
  });

  it("analisa e importa clientes sem nenhum agendamento vinculado, com sourceSupported true", async () => {
    const client = new FakeSourceClient();
    client.customers = [
      { id: 1, name: "Ana", phone1: "5511999990001" },
      { id: 2, name: "Bruno", phone1: "5511999990002" },
      { id: 3, name: "Carla", phone1: null, phone2: null },
      // Apagada na origem e nunca referenciada: fica fora da união.
      { id: 4, name: "Descontinuada", deleted: true },
    ];
    const reader = sourceReader(client);
    const session = await startSession();

    const preview = await new ImportPreviewService(prisma).analyze(
      { tenantId, sessionId: session.sessionId },
      reader,
      snapshotInput,
    );

    const customerCategory = preview.categories.find(
      (entry) => entry.category === "CUSTOMER",
    );
    expect(customerCategory).toMatchObject({
      sourceSupported: true,
      limitationCode: null,
      discoveredCount: 3,
    });

    await new ImportExecutionService(prisma).execute(
      { tenantId, sessionId: session.sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: preview.previewVersion },
    );

    const createdCustomers = await prisma.customer.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    expect(createdCustomers.map((row) => row.name)).toEqual([
      "Ana",
      "Bruno",
      "Carla",
    ]);

    const maps = await prisma.externalEntityMap.findMany({
      where: { tenantId, entityType: "CUSTOMER" },
    });
    expect(maps.map((row) => row.externalId).sort()).toEqual(["1", "2", "3"]);

    const items = await prisma.importItem.findMany({
      where: { tenantId, sessionId: session.sessionId, category: "CUSTOMER" },
    });
    expect(items).toHaveLength(3);
    expect(items.every((row) => row.status === "IMPORTED")).toBe(true);

    // Outro negócio não enxerga os clientes importados.
    await seedTenant(otherTenantId);
    expect(
      await prisma.customer.count({ where: { tenantId: otherTenantId } }),
    ).toBe(0);
  });

  it.each([
    [
      "404",
      new AppError("MINHA_AGENDA_HTTP_ERROR", "Minha Agenda returned HTTP 404.", 502, {
        originStatus: 404,
      }),
    ],
    [
      "fora da forma",
      new AppError(
        "MINHA_AGENDA_INVALID_RESPONSE",
        'Minha Agenda response for "customers" did not match the expected contract.',
        502,
        { context: "customers", issues: [] },
      ),
    ],
  ])(
    "GET /customers com %s: a análise termina com a cobertura de hoje e o código de limitação novo",
    async (_label, listingError) => {
      const client = new FakeSourceClient();
      client.customersError = listingError;
      client.operational = [appointmentWithCarla()];
      const reader = sourceReader(client);
      const session = await startSession();

      const preview = await new ImportPreviewService(prisma).analyze(
        { tenantId, sessionId: session.sessionId },
        reader,
        snapshotInput,
      );

      const customerCategory = preview.categories.find(
        (entry) => entry.category === "CUSTOMER",
      );
      expect(customerCategory).toMatchObject({
        sourceSupported: false,
        limitationCode: "CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED",
        discoveredCount: 1,
      });

      const stored = await prisma.importSessionCategory.findFirst({
        where: { tenantId, sessionId: session.sessionId, category: "CUSTOMER" },
      });
      expect(stored?.limitationCode).toBe("CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED");

      const items = await prisma.importItem.findMany({
        where: { tenantId, sessionId: session.sessionId, category: "CUSTOMER" },
      });
      expect(items.map((row) => row.externalId)).toEqual(["3"]);
    },
  );
});
