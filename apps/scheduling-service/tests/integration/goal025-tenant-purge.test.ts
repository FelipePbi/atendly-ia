import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import {
  TENANT_PURGE_TABLES,
  TenantPurgeService,
} from "../../src/modules/internal-api/tenantPurge.js";
import { upcomingLocalSlot } from "./support/test-date.js";

// Purga do negocio inteiro contra PostgreSQL real (Goal025/WU-06).
//
// Mesmo alvo descartavel das demais suites de integracao
// (SCHEDULING_TEST_DATABASE_URL); sem ela a suite e pulada, para que o gate
// local nao dependa de banco pessoal. O que esta suite prova nao e so "a
// linha some": e que a purga atravessa as 28 tabelas com `tenantId` do
// schema, respeita a ordem segura de chave estrangeira, respeita o teto por
// passada, e idempotente, e nunca toca o negocio vizinho em nenhuma tabela.
const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();

const TENANT_A = "goal025-tenant-purge-a";
const TENANT_B = "goal025-tenant-purge-b";

const ACCESSOR = {
  AppointmentEvent: "appointmentEvent",
  AppointmentItem: "appointmentItem",
  AppointmentNotificationIntent: "appointmentNotificationIntent",
  Appointment: "appointment",
  AppointmentSeries: "appointmentSeries",
  AppointmentHold: "appointmentHold",
  CalendarMutationIdempotency: "calendarMutationIdempotency",
  CustomerNote: "customerNote",
  CustomerTag: "customerTag",
  CustomerRelation: "customerRelation",
  Customer: "customer",
  Service: "service",
  AvailabilityException: "availabilityException",
  AvailabilityRule: "availabilityRule",
  TimeBlock: "timeBlock",
  BlockSeries: "blockSeries",
  ImportDecision: "importDecision",
  ImportItem: "importItem",
  ImportSessionCategory: "importSessionCategory",
  ImportSession: "importSession",
  IntegrationConnection: "integrationConnection",
  ExternalEntityMap: "externalEntityMap",
  MigrationConflict: "migrationConflict",
  MigrationJob: "migrationJob",
  ReminderRule: "reminderRule",
  ReminderSettings: "reminderSettings",
  CalendarSettings: "calendarSettings",
  ActivityLog: "activityLog",
} as const satisfies Record<(typeof TENANT_PURGE_TABLES)[number], string>;

describe.skipIf(!connectionString)("tenant purge against PostgreSQL", () => {
  let prisma: PrismaClient;
  let purge: TenantPurgeService;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    purge = new TenantPurgeService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * `TENANT_PURGE_TABLES` ja e uma ordem segura de chave estrangeira (e a
   * prova disso e o proprio teste "apaga todas as 28 tabelas" abaixo):
   * reaproveitar a mesma ordem para a limpeza entre cenarios evita manter uma
   * segunda lista manual que pode divergir da primeira.
   */
  async function purgeTenantForCleanup(tenantId: string): Promise<void> {
    for (const table of TENANT_PURGE_TABLES) {
      const accessor = (
        prisma as unknown as Record<
          string,
          { deleteMany: (args: unknown) => Promise<unknown> }
        >
      )[ACCESSOR[table]];
      await accessor.deleteMany({ where: { tenantId } });
    }
  }

  beforeEach(async () => {
    await purgeTenantForCleanup(TENANT_A);
    await purgeTenantForCleanup(TENANT_B);
  });

  /**
   * Povoa um grafo relacional completo para o negocio: pelo menos uma linha
   * em cada uma das 28 tabelas (`Customer` ganha duas, para dar um alvo
   * distinto ao responsavel de `CustomerRelation`), encadeadas o suficiente
   * para provar que a purga nao quebra chave estrangeira nenhuma ao apagar
   * todas juntas.
   */
  async function seedTenant(tenantId: string): Promise<void> {
    // O banco compara `expiresAt` do hold com o proprio relogio
    // (`AppointmentHold_expiresAt_check`): o atendimento nasce no futuro real.
    const slot = upcomingLocalSlot(7);
    const start = slot.startAt;
    const end = new Date(start.getTime() + 60 * 60_000);
    const date = new Date(`${slot.date}T00:00:00.000Z`);
    const dayStart = new Date("1970-01-01T09:00:00.000Z");
    const dayEnd = new Date("1970-01-01T10:00:00.000Z");

    await prisma.calendarSettings.create({
      data: { tenantId, source: "AVENLY", timezone: "America/Sao_Paulo" },
    });
    await prisma.reminderSettings.create({ data: { tenantId } });
    await prisma.activityLog.create({
      data: {
        tenantId,
        actorType: "USER",
        actorId: "user-1",
        area: "CUSTOMERS",
        action: "customer.created",
        entityType: "customer",
        entityLabel: "Pessoa do registro",
      },
    });
    await prisma.reminderRule.create({
      data: { tenantId, slot: "FIRST", leadMinutes: 60 },
    });

    const connection = await prisma.integrationConnection.create({
      data: {
        tenantId,
        provider: "MINHA_AGENDA",
        status: "CONNECTED",
        credentialsEncrypted: Buffer.from("segredo-de-teste"),
        config: {},
      },
    });

    await prisma.availabilityRule.create({
      data: {
        tenantId,
        dayOfWeek: 1,
        startTime: dayStart,
        endTime: dayEnd,
        active: true,
      },
    });
    await prisma.availabilityException.create({
      data: { tenantId, date, available: false, reason: "teste" },
    });

    const service = await prisma.service.create({
      data: {
        tenantId,
        name: "Corte",
        durationMinutes: 60,
        priceType: "FIXED",
        price: 100,
      },
    });

    const customer = await prisma.customer.create({
      data: { tenantId, name: `Cliente ${tenantId}` },
    });
    const guardian = await prisma.customer.create({
      data: { tenantId, name: `Responsavel ${tenantId}` },
    });

    await prisma.customerNote.create({
      data: { tenantId, customerId: customer.id, body: "nota de teste" },
    });
    await prisma.customerTag.create({
      data: { tenantId, customerId: customer.id, label: "vip" },
    });
    await prisma.customerRelation.create({
      data: {
        tenantId,
        customerId: customer.id,
        relatedCustomerId: guardian.id,
        proposedBy: "AI",
      },
    });

    const blockSeries = await prisma.blockSeries.create({
      data: {
        tenantId,
        kind: "BLOCK",
        daysOfWeek: [1],
        startTime: dayStart,
        endTime: dayEnd,
        seriesStartDate: date,
        occurrenceCount: 4,
        createdBy: "tester",
      },
    });
    await prisma.timeBlock.create({
      data: {
        tenantId,
        startAt: start,
        endAt: end,
        seriesId: blockSeries.id,
        occurrenceDate: date,
      },
    });

    const appointmentSeries = await prisma.appointmentSeries.create({
      data: {
        tenantId,
        serviceIds: [service.id],
        intervalDays: 7,
        occurrenceCount: 3,
        createdBy: "tester",
      },
    });

    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        customerId: customer.id,
        source: "USER",
        startAt: start,
        endAt: end,
        status: "CONFIRMED",
        title: "Atendimento de teste",
        createdBy: "tester",
        seriesId: appointmentSeries.id,
      },
    });
    await prisma.appointmentItem.create({
      data: {
        tenantId,
        appointmentId: appointment.id,
        serviceId: service.id,
        serviceNameSnapshot: service.name,
        priceTypeSnapshot: "FIXED",
        priceSnapshot: 100,
      },
    });
    await prisma.appointmentEvent.create({
      data: {
        tenantId,
        appointmentId: appointment.id,
        type: "CREATED",
        source: "USER",
      },
    });
    await prisma.appointmentNotificationIntent.create({
      data: {
        tenantId,
        appointmentId: appointment.id,
        kind: "REMINDER",
        slot: "FIRST",
        appointmentVersion: 1,
        dueAt: start,
      },
    });
    await prisma.appointmentHold.create({
      data: {
        tenantId,
        startAt: start,
        endAt: end,
        proposedServiceIds: [service.id],
        proposedDurationMinutes: 60,
        source: "USER",
        expiresAt: new Date(end.getTime() + 5 * 60_000),
        customerId: customer.id,
      },
    });

    await prisma.calendarMutationIdempotency.create({
      data: {
        tenantId,
        key: `key-${tenantId}`,
        operation: "test",
        requestHash: "hash",
        status: "COMPLETED",
      },
    });
    await prisma.externalEntityMap.create({
      data: {
        tenantId,
        provider: "MINHA_AGENDA",
        entityType: "CUSTOMER",
        internalId: customer.id,
        externalId: `ext-${tenantId}`,
      },
    });

    const migrationJob = await prisma.migrationJob.create({
      data: {
        tenantId,
        requestedBy: "tester",
        source: "MINHA_AGENDA",
        target: "AVENLY",
        status: "PENDING",
      },
    });
    await prisma.migrationConflict.create({
      data: {
        tenantId,
        migrationJobId: migrationJob.id,
        entityType: "CUSTOMER",
        status: "PENDING",
        details: {},
      },
    });

    const importSession = await prisma.importSession.create({
      data: {
        tenantId,
        provider: "MINHA_AGENDA",
        sourceAccountId: "acc-1",
        connectionId: connection.id,
        status: "DRAFT",
        createdBy: "tester",
      },
    });
    await prisma.importSessionCategory.create({
      data: { tenantId, sessionId: importSession.id, category: "SERVICE" },
    });
    const importItem = await prisma.importItem.create({
      data: {
        tenantId,
        sessionId: importSession.id,
        category: "SERVICE",
        externalId: `item-${tenantId}`,
      },
    });
    await prisma.importDecision.create({
      data: {
        tenantId,
        sessionId: importSession.id,
        scope: "ITEM",
        decision: "INCLUDE",
        category: "SERVICE",
        itemId: importItem.id,
        decidedBy: "tester",
      },
    });
  }

  async function countsFor(
    tenantId: string,
  ): Promise<Record<(typeof TENANT_PURGE_TABLES)[number], number>> {
    const counts = {} as Record<(typeof TENANT_PURGE_TABLES)[number], number>;
    for (const table of TENANT_PURGE_TABLES) {
      const accessor = (
        prisma as unknown as Record<
          string,
          { count: (args: unknown) => Promise<number> }
        >
      )[ACCESSOR[table]];
      counts[table] = await accessor.count({ where: { tenantId } });
    }
    return counts;
  }

  function totalOf(
    counts: Record<(typeof TENANT_PURGE_TABLES)[number], number>,
  ): number {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }

  it("apaga todas as 28 tabelas do negocio, sem violar chave estrangeira", async () => {
    await seedTenant(TENANT_A);

    const before = await countsFor(TENANT_A);
    for (const table of TENANT_PURGE_TABLES) {
      expect(before[table], `${table} deveria ter ao menos uma linha semeada`).toBeGreaterThan(0);
    }

    const result = await purge.purge({ tenantId: TENANT_A, maxRows: 1_000 });

    expect(result.hasMore).toBe(false);
    expect(result.totalDeleted).toBe(totalOf(before));
    const after = await countsFor(TENANT_A);
    for (const table of TENANT_PURGE_TABLES) {
      expect(after[table], `${table} deveria estar vazia depois da purga`).toBe(0);
    }
  });

  it("e idempotente: a segunda passada nao encontra nada e nao e erro", async () => {
    await seedTenant(TENANT_A);
    await purge.purge({ tenantId: TENANT_A, maxRows: 1_000 });

    const second = await purge.purge({ tenantId: TENANT_A, maxRows: 1_000 });

    expect(second.totalDeleted).toBe(0);
    expect(second.hasMore).toBe(false);
    for (const value of Object.values(second.deleted)) {
      expect(value).toBe(0);
    }
  });

  it("respeita o teto por passada e sinaliza o resto, ate esvaziar", async () => {
    await seedTenant(TENANT_A);
    const before = await countsFor(TENANT_A);
    const totalSeeded = totalOf(before);

    const first = await purge.purge({ tenantId: TENANT_A, maxRows: 10 });
    expect(first.totalDeleted).toBe(10);
    expect(first.hasMore).toBe(true);

    const remainingAfterFirst = totalOf(await countsFor(TENANT_A));
    expect(remainingAfterFirst).toBe(totalSeeded - 10);

    const second = await purge.purge({ tenantId: TENANT_A, maxRows: 1_000 });
    expect(second.hasMore).toBe(false);
    expect(second.totalDeleted).toBe(totalSeeded - 10);

    const after = await countsFor(TENANT_A);
    for (const table of TENANT_PURGE_TABLES) {
      expect(after[table]).toBe(0);
    }
  });

  it("nao apaga nem toca nenhuma linha do negocio vizinho, em nenhuma tabela", async () => {
    await seedTenant(TENANT_A);
    await seedTenant(TENANT_B);

    const neighbourBefore = await countsFor(TENANT_B);

    const result = await purge.purge({ tenantId: TENANT_A, maxRows: 1_000 });
    expect(result.totalDeleted).toBeGreaterThan(0);

    const targetAfter = await countsFor(TENANT_A);
    const neighbourAfter = await countsFor(TENANT_B);
    for (const table of TENANT_PURGE_TABLES) {
      expect(targetAfter[table]).toBe(0);
      expect(neighbourAfter[table]).toBe(neighbourBefore[table]);
      expect(neighbourAfter[table]).toBeGreaterThan(0);
    }
  });
});
