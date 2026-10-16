/**
 * Goal075, WU-01: cálculo puro de `appointmentStats` e a formatação de
 * `nextAppointment`/`lastAppointment` no fuso do calendário do negócio, sem
 * banco real (coberto contra PostgreSQL em
 * `goal075-customer-appointments.integration.test.ts`, §6.1 a §6.3).
 */
import { describe, expect, it } from "vitest";

import { AvenlyCustomerService } from "../../src/modules/customers/avenly-customer-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const DAY_MS = 24 * 60 * 60_000;

function customersService(
  database = createDatabaseDouble(),
  tenant = tenantId,
) {
  return new AvenlyCustomerService(database.client as never, tenant);
}

async function seedAppointment(
  database: ReturnType<typeof createDatabaseDouble>,
  tenant: string,
  customerId: string,
  startAt: Date,
  status: string,
): Promise<void> {
  await database.client.appointment.create({
    data: {
      tenantId: tenant,
      customerId,
      source: "USER",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status,
      statusRaw: status,
      title: "Corte",
      createdBy: "user-1",
    },
  });
}

describe("appointmentStats (Goal075, WU-01)", () => {
  it("sem atendimento: contagens zero e datas nulas", async () => {
    const database = createDatabaseDouble();
    const customer = await database.client.customer.create({
      data: { tenantId, name: "Ana" },
    });
    const stats = await customersService(database).appointmentStats(
      customer.id,
      "America/Sao_Paulo",
    );
    expect(stats).toEqual({
      completed: 0,
      noShows: 0,
      cancelled: 0,
      averageIntervalDays: null,
      firstAppointmentDate: null,
    });
  });

  it("um atendimento concluído: averageIntervalDays fica null (exige ao menos dois)", async () => {
    const database = createDatabaseDouble();
    const customer = await database.client.customer.create({
      data: { tenantId, name: "Bia" },
    });
    await seedAppointment(
      database,
      tenantId,
      customer.id,
      new Date("2026-01-01T12:00:00.000Z"),
      "COMPLETED",
    );
    const stats = await customersService(database).appointmentStats(
      customer.id,
      "America/Sao_Paulo",
    );
    expect(stats.completed).toBe(1);
    expect(stats.averageIntervalDays).toBeNull();
    expect(stats.firstAppointmentDate).toBe("2026-01-01");
  });

  it("três concluídos com intervalos diferentes: contagens certas e a média dos intervalos", async () => {
    const database = createDatabaseDouble();
    const customer = await database.client.customer.create({
      data: { tenantId, name: "Caio" },
    });
    const base = new Date("2026-01-01T12:00:00.000Z");
    await seedAppointment(database, tenantId, customer.id, base, "COMPLETED");
    await seedAppointment(
      database,
      tenantId,
      customer.id,
      new Date(base.getTime() + 10 * DAY_MS),
      "COMPLETED",
    );
    await seedAppointment(
      database,
      tenantId,
      customer.id,
      new Date(base.getTime() + 25 * DAY_MS),
      "COMPLETED",
    );
    await seedAppointment(
      database,
      tenantId,
      customer.id,
      new Date(base.getTime() + 30 * DAY_MS),
      "NO_SHOW",
    );
    await seedAppointment(
      database,
      tenantId,
      customer.id,
      new Date(base.getTime() + 40 * DAY_MS),
      "CANCELLED",
    );
    const stats = await customersService(database).appointmentStats(
      customer.id,
      "America/Sao_Paulo",
    );
    expect(stats.completed).toBe(3);
    expect(stats.noShows).toBe(1);
    expect(stats.cancelled).toBe(1);
    expect(stats.averageIntervalDays).toBeCloseTo((10 + 15) / 2, 5);
    expect(stats.firstAppointmentDate).toBe("2026-01-01");
  });

  it("firstAppointmentDate é do atendimento mais antigo, mesmo que não seja concluído", async () => {
    const database = createDatabaseDouble();
    const customer = await database.client.customer.create({
      data: { tenantId, name: "Duda" },
    });
    await seedAppointment(
      database,
      tenantId,
      customer.id,
      new Date("2025-06-01T12:00:00.000Z"),
      "NO_SHOW",
    );
    await seedAppointment(
      database,
      tenantId,
      customer.id,
      new Date("2026-01-01T12:00:00.000Z"),
      "COMPLETED",
    );
    const stats = await customersService(database).appointmentStats(
      customer.id,
      "America/Sao_Paulo",
    );
    expect(stats.firstAppointmentDate).toBe("2025-06-01");
  });

  it("não mistura atendimento de outro tenant nas contagens", async () => {
    const database = createDatabaseDouble();
    const customerA = await database.client.customer.create({
      data: { tenantId: "tenant-a", name: "Ana" },
    });
    const customerB = await database.client.customer.create({
      data: { tenantId: "tenant-b", name: "Bia" },
    });
    await seedAppointment(
      database,
      "tenant-a",
      customerA.id,
      new Date("2026-01-01T12:00:00.000Z"),
      "COMPLETED",
    );
    await seedAppointment(
      database,
      "tenant-b",
      customerB.id,
      new Date("2026-01-01T12:00:00.000Z"),
      "COMPLETED",
    );
    const stats = await customersService(database, "tenant-a").appointmentStats(
      customerA.id,
      "America/Sao_Paulo",
    );
    expect(stats.completed).toBe(1);
  });
});

describe("list sem timezone (Goal075, WU-01)", () => {
  it("sai como antes: sem nextAppointment nem lastAppointment, filtro e ordem preservados", async () => {
    const database = createDatabaseDouble();
    await database.client.customer.create({
      data: { tenantId, name: "Bia", normalizedPhone: "5511900000001" },
    });
    await database.client.customer.create({
      data: { tenantId, name: "Ana", normalizedPhone: "5511900000002" },
    });
    const items = await customersService(database).list();
    expect(items.map((item) => item.name)).toEqual(["Ana", "Bia"]);
    expect(items.every((item) => !("nextAppointment" in item))).toBe(true);
  });

  it("findCandidatesByPhone continua devolvendo candidatos sem exigir timezone", async () => {
    const database = createDatabaseDouble();
    const maria = await database.client.customer.create({
      data: {
        tenantId,
        name: "Maria",
        phone: "5511966665555",
        normalizedPhone: "5511966665555",
      },
    });
    const candidates =
      await customersService(database).findCandidatesByPhone("5511966665555");
    expect(candidates.map((candidate) => candidate.id)).toEqual([maria.id]);
  });
});

describe("list com timezone (Goal075, WU-01)", () => {
  it("formata próximo e último no fuso do negócio, não no relógio local", async () => {
    const timezone = "America/Sao_Paulo";
    const now = new Date("2026-06-15T02:00:00.000Z"); // 2026-06-14 23:00 local
    const customerId = "customer-1";
    const fakeDatabase = {
      customer: {
        findMany: async () => [
          {
            id: customerId,
            tenantId,
            name: "Duda",
            phone: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      customerRelation: { findMany: async () => [] },
      $queryRaw: async (query: { strings?: string[] }) => {
        const text = query.strings?.join("") ?? "";
        if (text.includes("<=")) {
          // "último": 2026-06-14 22:30 local.
          return [
            {
              customerId,
              startAt: new Date("2026-06-15T01:30:00.000Z"),
              status: "COMPLETED",
            },
          ];
        }
        // "próximo": 2026-06-14 23:45 local.
        return [
          {
            customerId,
            startAt: new Date("2026-06-15T02:45:00.000Z"),
            status: "CONFIRMED",
          },
        ];
      },
    };
    const service = new AvenlyCustomerService(fakeDatabase as never, tenantId);
    const [item] = await service.list({}, { timezone, now });
    expect(item.nextAppointment).toEqual({
      date: "2026-06-14",
      startTime: "23:45",
      status: "CONFIRMED",
    });
    expect(item.lastAppointment).toEqual({
      date: "2026-06-14",
      startTime: "22:30",
      status: "COMPLETED",
    });
  });

  it("sem candidato de próximo ou de último, os dois campos ficam null", async () => {
    const fakeDatabase = {
      customer: {
        findMany: async () => [
          {
            id: "customer-1",
            tenantId,
            name: "Duda",
            phone: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
      customerRelation: { findMany: async () => [] },
      $queryRaw: async () => [],
    };
    const service = new AvenlyCustomerService(fakeDatabase as never, tenantId);
    const [item] = await service.list({}, { timezone: "America/Sao_Paulo" });
    expect(item.nextAppointment).toBeNull();
    expect(item.lastAppointment).toBeNull();
  });
});

describe("appointmentHighlights (Goal075, blocker 1 da rodada 1)", () => {
  it("o detalhe usa as mesmas consultas da lista, só com o id pedido, no fuso do negócio", async () => {
    const customerId = "customer-1";
    const now = new Date("2026-06-15T02:00:00.000Z"); // 2026-06-14 23:00 local
    const seen: unknown[][] = [];
    const fakeDatabase = {
      $queryRaw: async (query: { strings?: string[]; values?: unknown[] }) => {
        seen.push(query.values ?? []);
        const text = query.strings?.join("") ?? "";
        if (text.includes("<=")) {
          return [
            {
              customerId,
              startAt: new Date("2026-06-15T01:30:00.000Z"),
              status: "NO_SHOW",
            },
          ];
        }
        return [
          {
            customerId,
            startAt: new Date("2026-06-15T02:45:00.000Z"),
            status: "CONFIRMED",
          },
        ];
      },
      appointment: {
        findFirst: async () => ({
          source: "AI",
          title: null,
          startAt: new Date("2026-06-15T02:45:00.000Z"),
          endAt: new Date("2026-06-15T03:30:00.000Z"),
          items: [
            {
              serviceNameSnapshot: "Corte feminino",
              priceTypeSnapshot: "FIXED",
              priceSnapshot: "90.00",
            },
          ],
        }),
      },
    };
    const service = new AvenlyCustomerService(fakeDatabase as never, tenantId);
    const highlights = await service.appointmentHighlights(customerId, {
      timezone: "America/Sao_Paulo",
      now,
    });
    expect(highlights).toEqual({
      nextAppointment: {
        date: "2026-06-14",
        startTime: "23:45",
        status: "CONFIRMED",
        // O que o perfil mostra junto da hora (2026-10-16, quadro CL5).
        serviceNames: ["Corte feminino"],
        title: null,
        durationMinutes: 45,
        totalPrice: 90,
        totalPriceType: "FIXED",
        source: "AI",
      },
      lastAppointment: {
        date: "2026-06-14",
        startTime: "22:30",
        status: "NO_SHOW",
      },
    });
    expect(seen).toHaveLength(2);
    for (const values of seen) {
      expect(values).toContain(tenantId);
      expect(values).toContain(customerId);
    }
  });

  it("item sob consulta derruba o total do próximo atendimento, sem inventar valor", async () => {
    const startAt = new Date("2026-06-20T13:00:00.000Z");
    const fakeDatabase = {
      $queryRaw: async (query: { strings?: string[] }) =>
        query.strings?.join("").includes("<=")
          ? []
          : [{ customerId: "customer-1", startAt, status: "CONFIRMED" }],
      appointment: {
        findFirst: async () => ({
          source: "USER",
          title: null,
          startAt,
          endAt: new Date("2026-06-20T14:30:00.000Z"),
          items: [
            {
              serviceNameSnapshot: "Corte",
              priceTypeSnapshot: "FIXED",
              priceSnapshot: "50.00",
            },
            {
              serviceNameSnapshot: "Hidratação",
              priceTypeSnapshot: "ON_REQUEST",
              priceSnapshot: null,
            },
          ],
        }),
      },
    };
    const service = new AvenlyCustomerService(fakeDatabase as never, tenantId);
    const { nextAppointment } = await service.appointmentHighlights(
      "customer-1",
      { timezone: "America/Sao_Paulo" },
    );
    expect(nextAppointment).toMatchObject({
      serviceNames: ["Corte", "Hidratação"],
      durationMinutes: 90,
      totalPrice: null,
      totalPriceType: "NONE",
      source: "USER",
    });
  });

  it("sem agendamento, os dois ficam null", async () => {
    const fakeDatabase = { $queryRaw: async () => [] };
    const service = new AvenlyCustomerService(fakeDatabase as never, tenantId);
    await expect(
      service.appointmentHighlights("customer-1", {
        timezone: "America/Sao_Paulo",
      }),
    ).resolves.toEqual({ nextAppointment: null, lastAppointment: null });
  });
});
