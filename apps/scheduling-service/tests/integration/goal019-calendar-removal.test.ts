import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { CalendarRemovalService } from "../../src/modules/calendar/removal.js";
import { AtendlyCalendarProvider } from "../../src/modules/integrations/atendly/provider.js";
import { resetTenant } from "./support/reset-tenant.js";
import { upcomingDate } from "./support/test-date.js";

/**
 * Remocao definitiva do atendimento contra PostgreSQL real (Goal019).
 *
 * Isto nao cabe em `tests/unit` e foi exatamente a lacuna que deixou o blocker
 * passar: `AppointmentItem` e `AppointmentEvent` referenciam `Appointment` com
 * `ON DELETE RESTRICT`, e so o banco recusa. Um `appointment.delete` direto
 * ficava verde no dublê e quebrava com `P2003` em producao — a limpeza do
 * teste de ativacao nunca removia o agendamento de teste e mesmo assim
 * relatava sucesso.
 *
 * O atendimento aqui e criado pelo caminho de verdade (`createAppointment`),
 * que grava item e evento na mesma transacao. Remover uma fixture pelada nao
 * provaria nada.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantId = "goal019-removal-tenant";
const timeZone = "America/Sao_Paulo";
const date = upcomingDate();

let prisma: PrismaClient;
let serviceId = "";
let customerId = "";

async function seedTenant() {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
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
  const service = await prisma.service.create({
    data: {
      tenantId,
      name: "Corte",
      durationMinutes: 60,
      priceType: "FIXED",
      price: 120,
      active: true,
    },
  });
  const customer = await prisma.customer.create({
    data: { tenantId, name: "Atendly (teste)", phone: "5511911112222" },
  });
  return { serviceId: service.id, customerId: customer.id };
}

/** Atendimento criado pelo caminho normal: com item e com evento `CREATED`. */
async function scheduleAppointment(startTime: string, idempotencyKey: string) {
  return new AtendlyCalendarProvider(
    prisma,
    tenantId,
    "user-1",
    timeZone,
  ).createAppointment({
    source: "AI" as const,
    serviceIds: [serviceId],
    date,
    startTime,
    customerId,
    stepMinutes: 30,
    idempotencyKey,
  });
}

describeWithDatabase("goal019 calendar removal against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    // Confirma o destino efetivo antes de escrever qualquer linha.
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenantId);
    const seeded = await seedTenant();
    serviceId = seeded.serviceId;
    customerId = seeded.customerId;
  });

  it("removes the appointment the AI created, item and history included", async () => {
    const appointment = await scheduleAppointment("09:00", "removal-1");
    // Precondicao do teste: o atendimento real nasce com filho dos dois lados.
    expect(
      await prisma.appointmentItem.count({
        where: { tenantId, appointmentId: appointment.id },
      }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.appointmentEvent.count({
        where: { tenantId, appointmentId: appointment.id },
      }),
    ).toBeGreaterThan(0);

    const removal = new CalendarRemovalService(prisma, tenantId);
    expect(await removal.deleteAppointment(appointment.id)).toBe(true);

    expect(
      await prisma.appointment.count({ where: { tenantId, id: appointment.id } }),
    ).toBe(0);
    expect(
      await prisma.appointmentItem.count({
        where: { tenantId, appointmentId: appointment.id },
      }),
    ).toBe(0);
    expect(
      await prisma.appointmentEvent.count({
        where: { tenantId, appointmentId: appointment.id },
      }),
    ).toBe(0);
  });

  it("leaves another appointment, its item and its history untouched", async () => {
    const mine = await scheduleAppointment("09:00", "removal-mine");
    const other = await scheduleAppointment("11:00", "removal-other");

    await new CalendarRemovalService(prisma, tenantId).deleteAppointment(
      mine.id,
    );

    expect(
      await prisma.appointment.count({ where: { tenantId, id: other.id } }),
    ).toBe(1);
    expect(
      await prisma.appointmentItem.count({
        where: { tenantId, appointmentId: other.id },
      }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.appointmentEvent.count({
        where: { tenantId, appointmentId: other.id },
      }),
    ).toBeGreaterThan(0);
  });

  it("is idempotent: removing again deletes nothing and does not fail", async () => {
    const appointment = await scheduleAppointment("09:00", "removal-twice");
    const removal = new CalendarRemovalService(prisma, tenantId);

    expect(await removal.deleteAppointment(appointment.id)).toBe(true);
    expect(await removal.deleteAppointment(appointment.id)).toBe(false);
  });

  it("frees the test person only after the appointment is really gone", async () => {
    const appointment = await scheduleAppointment("09:00", "removal-person");
    const removal = new CalendarRemovalService(prisma, tenantId);

    // Enquanto o atendimento existe, a pessoa e recusada com codigo proprio —
    // e e por isso que a remocao do atendimento precisa acontecer de verdade.
    await expect(removal.deleteCustomer(customerId)).rejects.toMatchObject({
      code: "CUSTOMER_HAS_APPOINTMENTS",
    });

    await removal.deleteAppointment(appointment.id);
    expect(await removal.deleteCustomer(customerId)).toBe(true);
    expect(await prisma.customer.count({ where: { tenantId } })).toBe(0);
  });
});
