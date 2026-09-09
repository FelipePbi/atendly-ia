import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { AtendlyCalendarProvider } from "../../src/modules/integrations/atendly/provider.js";
import {
  AtendlyServiceService,
} from "../../src/modules/services/atendly-service-service.js";

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();

// Sem banco declarado, a suíte não inventa um destino: ela é declarada como
// pulada e o gate de integração é quem a executa de verdade.
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const timeZone = "America/Sao_Paulo";
const date = "2026-09-10";

let prisma: PrismaClient;

async function ensureCalendar(tenantId: string) {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "ATENDLY", timezone: timeZone },
    update: { timezone: timeZone },
  });
}

async function openWholeDay(tenantId: string) {
  await prisma.availabilityRule.deleteMany({ where: { tenantId } });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await prisma.availabilityRule.create({
      data: {
        tenantId,
        dayOfWeek,
        startTime: new Date("1970-01-01T00:00:00.000Z"),
        endTime: new Date("1970-01-01T23:00:00.000Z"),
        active: true,
      },
    });
  }
}

function provider(tenantId: string) {
  return new AtendlyCalendarProvider(prisma, tenantId, "user-1", timeZone);
}

function services(tenantId: string) {
  return new AtendlyServiceService(prisma, tenantId);
}

describeWithDatabase("service catalog against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    const [database] = await prisma.$queryRaw<Array<{ current_database: string }>>`
      SELECT current_database()
    `;
    // Confirma o destino efetivo antes de escrever qualquer linha.
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    for (const tenantId of [tenantA, tenantB]) {
      await prisma.appointmentItem.deleteMany({ where: { tenantId } });
      await prisma.appointment.deleteMany({ where: { tenantId } });
      await prisma.customer.deleteMany({ where: { tenantId } });
      await prisma.service.deleteMany({ where: { tenantId } });
      await prisma.availabilityRule.deleteMany({ where: { tenantId } });
      await prisma.timeBlock.deleteMany({ where: { tenantId } });
    }
    await ensureCalendar(tenantA);
    await ensureCalendar(tenantB);
  });

  it("does not leak services, attributes or snapshots across tenants", async () => {
    const inA = await services(tenantA).create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
      description: "Só em A",
    });
    await services(tenantB).create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
    });

    const listedInB = await services(tenantB).listForScheduling();
    expect(listedInB.map((item) => item.id)).not.toContain(inA.id);
    await expect(services(tenantB).requireActive([inA.id])).rejects.toMatchObject(
      { code: "SERVICE_NOT_FOUND" },
    );
  });

  it("enforces the price constraint at the database level, independent of application validation", async () => {
    // Contorna a validação da aplicação de propósito, para provar que a
    // constraint SQL também recusa a combinação inválida.
    await expect(
      prisma.service.create({
        data: {
          tenantId: tenantA,
          name: "Inválido",
          durationMinutes: 30,
          priceType: "STARTING_AT",
          price: null,
          active: true,
        },
      }),
    ).rejects.toBeTruthy();

    await expect(
      prisma.service.create({
        data: {
          tenantId: tenantA,
          name: "Inválido",
          durationMinutes: 30,
          priceType: "NOT_INFORMED",
          price: 10,
          active: true,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("enforces the review lockstep constraint at the database level", async () => {
    await expect(
      prisma.service.create({
        data: {
          tenantId: tenantA,
          name: "Sem duração",
          durationMinutes: null,
          priceType: "ON_REQUEST",
          active: true,
          needsReview: false,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("preserves an explicit zero price through create and read", async () => {
    const created = await services(tenantA).create({
      name: "Avaliação",
      durationMinutes: 15,
      priceType: "FIXED",
      price: 0,
    });
    const stored = await prisma.service.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: tenantA, id: created.id } },
    });
    expect(Number(stored.price)).toBe(0);
  });

  it("excludes a service in review from what the calendar provider can offer, and requireActive refuses it with its own error", async () => {
    await openWholeDay(tenantA);
    const inReview = await services(tenantA).create({
      name: "Sem duração",
      priceType: "ON_REQUEST",
    });

    const offered = await provider(tenantA).listServices();
    expect(offered.map((item) => item.id)).not.toContain(inReview.id);

    await expect(
      provider(tenantA).createAppointment({
        serviceIds: [inReview.id],
        date,
        startTime: "10:00",
        customerName: "Maria",
        customerPhone: "5511900000001",
        stepMinutes: 30,
        idempotencyKey: "key-review",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NEEDS_REVIEW" });
  });

  it("becomes operational once the duration is corrected", async () => {
    const inReview = await services(tenantA).create({
      name: "Sem duração",
      priceType: "ON_REQUEST",
    });
    expect(inReview.needsReview).toBe(true);

    const corrected = await services(tenantA).update(inReview.id, {
      durationMinutes: 30,
    });
    expect(corrected.needsReview).toBe(false);

    const offered = await provider(tenantA).listServices();
    expect(offered.map((item) => item.id)).toContain(inReview.id);
  });

  it("keeps an inactive service blocked exactly as before", async () => {
    const inactive = await services(tenantA).create({
      name: "Descontinuado",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
      active: false,
    });
    await expect(
      services(tenantA).requireActive([inactive.id]),
    ).rejects.toMatchObject({ code: "SERVICE_INACTIVE" });
  });

  it("stores the agreement with all four semantics, and a later catalog edit does not rewrite the snapshot", async () => {
    await openWholeDay(tenantA);
    const fixed = await services(tenantA).create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
    });
    const startingAt = await services(tenantA).create({
      name: "Coloração",
      durationMinutes: 60,
      priceType: "STARTING_AT",
      price: 100,
    });

    const appointment = await provider(tenantA).createAppointment({
      serviceIds: [fixed.id, startingAt.id],
      date,
      startTime: "10:00",
      customerName: "Maria",
      customerPhone: "5511900000001",
      stepMinutes: 30,
      idempotencyKey: "key-agreement",
    });

    expect(appointment.totalPriceType).toBe("STARTING_AT");
    expect(appointment.totalPrice).toBe(150);

    // Editar o catálogo depois da confirmação não altera o snapshot.
    await services(tenantA).update(fixed.id, { price: 999 });
    const reloaded = await provider(tenantA).getAppointment(appointment.id);
    expect(reloaded.services.find((item) => item.serviceId === fixed.id)?.price).toBe(
      50,
    );
    expect(reloaded.totalPrice).toBe(150);
  });

  it("has no total when any item is ON_REQUEST or NOT_INFORMED", async () => {
    await openWholeDay(tenantA);
    const fixed = await services(tenantA).create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
    });
    const onRequest = await services(tenantA).create({
      name: "Consulta",
      durationMinutes: 30,
      priceType: "ON_REQUEST",
    });

    const appointment = await provider(tenantA).createAppointment({
      serviceIds: [fixed.id, onRequest.id],
      date,
      startTime: "10:00",
      customerName: "Maria",
      customerPhone: "5511900000001",
      stepMinutes: 30,
      idempotencyKey: "key-none",
    });

    expect(appointment.totalPriceType).toBe("NONE");
    expect(appointment.totalPrice).toBeNull();
  });
});
