import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { AtendlyAppointmentSeriesService } from "../../src/modules/appointments/appointment-series-service.js";
import {
  createExtraAvailability,
  removeAvailabilityException,
} from "../../src/modules/calendar/availability-exceptions.js";
import {
  createBlockSeries,
  removeBlockOccurrence,
  removeBlockSeriesFuture,
} from "../../src/modules/calendar/block-series.js";
import { AtendlyAvailability } from "../../src/modules/availability/atendly-availability.js";
import { AtendlyCalendarProvider } from "../../src/modules/integrations/atendly/provider.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal009 contra PostgreSQL real: ocupacao com buffers e regras de oferta
 * ja tem cobertura de comportamento em `tests/unit/goal009-occupancy.test.ts`
 * (com o dublê); o que so um banco de verdade prova é concorrência —
 * `Serializable`, `pg_advisory_xact_lock` e a corrida entre duas conexões —
 * exatamente como o Goal008 fez para hold/confirmação/bloqueio.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal009-tenant-a";
const tenantB = "goal009-tenant-b";
const timeZone = "America/Sao_Paulo";
const date = "2026-09-10";

let prisma: PrismaClient;
let other: PrismaClient;
let serviceIdA = "";
let customerIdA = "";
let serviceIdB = "";
let customerIdB = "";

function provider(tenantId: string, userId = "user-1") {
  return new AtendlyCalendarProvider(prisma, tenantId, userId, timeZone);
}

async function seedTenant(tenantId: string) {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "ATENDLY", timezone: timeZone },
    update: { source: "ATENDLY", timezone: timeZone },
  });
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
  const service = await prisma.service.create({
    data: {
      tenantId,
      name: "Aplicacao",
      durationMinutes: 60,
      priceType: "FIXED",
      price: 100,
      active: true,
    },
  });
  const customer = await prisma.customer.create({
    data: { tenantId, name: "Thais", phone: "5511900000001" },
  });
  return { serviceId: service.id, customerId: customer.id };
}

describeWithDatabase("goal009 occupancy against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    other = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    await prisma?.$disconnect();
    await other?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    const seeded = await seedTenant(tenantA);
    serviceIdA = seeded.serviceId;
    customerIdA = seeded.customerId;
    const seededB = await seedTenant(tenantB);
    serviceIdB = seededB.serviceId;
    customerIdB = seededB.customerId;
  });

  it("creating a series and confirming an appointment for the same slot produce a single effect", async () => {
    const [series, appointment] = await Promise.allSettled([
      createBlockSeries(other, {
        tenantId: tenantA,
        timeZone,
        createdBy: "user-1",
        rule: {
          kind: "BLOCK",
          title: null,
          daysOfWeek: [new Date(`${date}T12:00:00-03:00`).getUTCDay()],
          startTime: "14:00",
          endTime: "15:00",
          seriesStartDate: date,
          occurrenceCount: 1,
        },
      }),
      provider(tenantA).createAppointment({
        source: "USER",
        serviceIds: [serviceIdA],
        date,
        startTime: "14:00",
        customerId: customerIdA,
        stepMinutes: 30,
        idempotencyKey: "idem-series-vs-appointment",
      }),
    ]);

    const blocks = await prisma.timeBlock.count({ where: { tenantId: tenantA } });
    const appointments = await prisma.appointment.count({
      where: { tenantId: tenantA, status: "CONFIRMED" },
    });
    expect(blocks + appointments).toBe(1);
    expect([series.status, appointment.status].sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
  });

  it("an occurrence taken between preview and confirmation aborts the whole series, nothing created", async () => {
    const service = new AtendlyAppointmentSeriesService(prisma, tenantA, timeZone);
    const preview = await service.preview({
      serviceIds: [serviceIdA],
      occurrenceCount: 2,
      intervalDays: 7,
      firstDate: date,
      firstStartTime: "09:00",
      customerId: customerIdA,
      source: "USER",
    });
    expect(preview.every((occurrence) => occurrence.holdId)).toBe(true);

    // Outra conexao toma a segunda ocorrencia antes da confirmacao.
    await provider(tenantA, "user-2").createAppointment({
      source: "USER",
      serviceIds: [serviceIdA],
      date: preview[1].date as string,
      startTime: preview[1].startTime as string,
      customerId: customerIdA,
      stepMinutes: 30,
      idempotencyKey: "idem-intruder",
      overlapOverride: true,
      overlapOverrideReason: "encaixe urgente",
    });

    // O hold da ocorrencia continua VIGENTE — o intruso nao o liberou, so
    // tomou o horario por override humano. A falha vem do motor de
    // disponibilidade, e a resposta precisa dizer qual ocorrencia caiu e
    // oferecer alternativas (Goal009, criterio 6).
    const failure = await service
      .confirm({
        occurrences: preview.map((occurrence) => ({
          holdId: occurrence.holdId as string,
        })),
        serviceIds: [serviceIdA],
        intervalDays: 7,
        customerId: customerIdA,
        source: "USER",
        createdBy: "user-1",
        idempotencyKey: "idem-series-confirm",
      })
      .catch((error: unknown) => error as { code: string; details: unknown });

    expect(failure.code).toBe("SLOT_UNAVAILABLE");
    const details = failure.details as {
      occurrenceIndex: number;
      holdId: string;
      occurrenceDate: string;
      alternatives: Array<{ date: string; startTime: string }>;
    };
    expect(details.occurrenceIndex).toBe(1);
    expect(details.holdId).toBe(preview[1].holdId);
    expect(details.occurrenceDate).toBe(preview[1].date);
    expect(details.alternatives.length).toBeGreaterThan(0);
    expect(
      details.alternatives.some(
        (slot) => slot.startTime === preview[1].startTime,
      ),
    ).toBe(false);

    // Nada da serie foi criado: nem a primeira ocorrencia, que ainda era valida.
    const seriesAppointments = await prisma.appointment.count({
      where: { tenantId: tenantA, seriesId: { not: null } },
    });
    expect(seriesAppointments).toBe(0);
  });

  /**
   * Isolamento por tenant das entidades novas contra PostgreSQL real
   * (Goal009, criterio 1). O dublê ja prova a regra; aqui o que se prova e
   * que ela sobrevive ao banco de verdade, com as duas fixtures no mesmo
   * schema e as mesmas FKs e constraints.
   */
  it("bloco, excecao, serie de bloqueio e serie de atendimento de B nao aparecem, nao ocupam nem mudam em A", async () => {
    const dayOfWeek = new Date(`${date}T12:00:00-03:00`).getUTCDay();

    const seriesB = await createBlockSeries(prisma, {
      tenantId: tenantB,
      timeZone,
      createdBy: "user-b",
      rule: {
        kind: "PERSONAL",
        title: "Consulta de B",
        daysOfWeek: [dayOfWeek],
        startTime: "14:00",
        endTime: "15:00",
        seriesStartDate: date,
        occurrenceCount: 2,
      },
    });
    const exceptionB = await createExtraAvailability(prisma, {
      tenantId: tenantB,
      timeZone,
      date,
      startTime: "23:00",
      endTime: "23:30",
    });
    const seriesServiceB = new AtendlyAppointmentSeriesService(
      prisma,
      tenantB,
      timeZone,
    );
    const previewB = await seriesServiceB.preview({
      serviceIds: [serviceIdB],
      occurrenceCount: 2,
      intervalDays: 7,
      firstDate: date,
      firstStartTime: "09:00",
      customerId: customerIdB,
      source: "USER",
    });
    await seriesServiceB.confirm({
      occurrences: previewB.map((occurrence) => ({
        holdId: occurrence.holdId as string,
      })),
      serviceIds: [serviceIdB],
      intervalDays: 7,
      customerId: customerIdB,
      source: "USER",
      createdBy: "user-b",
      idempotencyKey: "idem-series-b",
    });

    // Nada de B ocupa a agenda de A: 09:00 (serie de atendimento de B) e
    // 14:00 (bloco de B) continuam ofertaveis em A.
    const slotsA = await new AtendlyAvailability(
      prisma,
      tenantA,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceIdA],
      startDate: date,
      days: 1,
      maxSlots: 200,
    } as never);
    expect(slotsA.some((slot) => slot.startTime === "09:00")).toBe(true);
    expect(slotsA.some((slot) => slot.startTime === "14:00")).toBe(true);

    // Nem aparece em leitura: A nao enxerga linha alguma de B.
    expect(
      await prisma.timeBlock.count({ where: { tenantId: tenantA } }),
    ).toBe(0);
    expect(
      await prisma.appointment.count({
        where: { tenantId: tenantA, seriesId: { not: null } },
      }),
    ).toBe(0);
    expect(
      await prisma.availabilityException.count({ where: { tenantId: tenantA } }),
    ).toBe(0);

    // E A, com os ids de B em maos, nao muda nada de B.
    const occurrenceB = await prisma.timeBlock.findFirstOrThrow({
      where: { tenantId: tenantB },
    });
    await expect(
      removeBlockOccurrence(prisma, {
        tenantId: tenantA,
        timeZone,
        id: occurrenceB.id,
      }),
    ).rejects.toBeTruthy();
    await expect(
      removeBlockSeriesFuture(prisma, {
        tenantId: tenantA,
        timeZone,
        seriesId: seriesB.id,
      }),
    ).rejects.toBeTruthy();
    await expect(
      removeAvailabilityException(prisma, {
        tenantId: tenantA,
        timeZone,
        id: exceptionB.id,
      }),
    ).rejects.toBeTruthy();

    expect(
      await prisma.timeBlock.count({ where: { tenantId: tenantB } }),
    ).toBe(2);
    expect(
      (await prisma.blockSeries.findFirstOrThrow({ where: { id: seriesB.id } }))
        .status,
    ).toBe("ACTIVE");
    expect(
      await prisma.availabilityException.count({ where: { tenantId: tenantB } }),
    ).toBe(1);
    expect(
      await prisma.appointment.count({
        where: { tenantId: tenantB, seriesId: { not: null } },
      }),
    ).toBe(2);
  });

  it("a mesma Idempotency-Key na confirmacao da serie faz replay contra o banco real", async () => {
    const service = new AtendlyAppointmentSeriesService(
      prisma,
      tenantA,
      timeZone,
    );
    const preview = await service.preview({
      serviceIds: [serviceIdA],
      occurrenceCount: 2,
      intervalDays: 7,
      firstDate: date,
      firstStartTime: "10:00",
      customerId: customerIdA,
      source: "USER",
    });
    const input = {
      occurrences: preview.map((occurrence) => ({
        holdId: occurrence.holdId as string,
      })),
      serviceIds: [serviceIdA],
      intervalDays: 7,
      customerId: customerIdA,
      source: "USER" as const,
      createdBy: "user-1",
      idempotencyKey: "idem-series-replay",
    };

    const first = await service.confirm(input);
    const replay = await service.confirm(input);

    expect(first).toHaveLength(2);
    expect(replay.map((appointment) => appointment.id).sort()).toEqual(
      first.map((appointment) => appointment.id).sort(),
    );
    expect(
      await prisma.appointment.count({
        where: { tenantId: tenantA, seriesId: { not: null } },
      }),
    ).toBe(2);
    expect(
      await prisma.appointmentSeries.count({ where: { tenantId: tenantA } }),
    ).toBe(1);
  });
});
