import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { AtendlyCalendarProvider } from "../../src/modules/integrations/atendly/provider.js";
import { AtendlyCustomerService } from "../../src/modules/customers/atendly-customer-service.js";
import { resetTenant } from "./support/reset-tenant.js";
import { upcomingDate } from "./support/test-date.js";

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();

// Sem banco declarado, a suíte não inventa um destino: ela é declarada como
// pulada e o gate de integração é quem a executa de verdade.
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const timeZone = "America/Sao_Paulo";
// Dia sempre à frente de hoje: ver `support/test-date.ts`.
const date = upcomingDate();

let prisma: PrismaClient;

async function seedTenant(tenantId: string) {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "ATENDLY", timezone: timeZone },
    update: { timezone: timeZone },
  });
  return prisma.service.create({
    data: {
      tenantId,
      name: "Aplicação",
      durationMinutes: 60,
      priceType: "FIXED",
      price: 100,
      active: true,
    },
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

describeWithDatabase("customer identity against PostgreSQL", () => {
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
      await resetTenant(prisma, tenantId);
    }
  });

  it("persists two people with the same phone in the same tenant", async () => {
    const customers = new AtendlyCustomerService(prisma, tenantA);
    const maria = await customers.create({
      name: "Maria",
      phone: "+55 11 90000-0001",
    });
    const pedro = await customers.create({
      name: "Pedro",
      phone: "+55 11 90000-0001",
    });

    expect(pedro.id).not.toBe(maria.id);
    expect(await customers.findCandidatesByPhone("5511900000001")).toHaveLength(
      2,
    );
  });

  it("persists a customer without a phone", async () => {
    const customers = new AtendlyCustomerService(prisma, tenantA);
    const child = await customers.create({ name: "Pedro" });
    const stored = await prisma.customer.findUnique({
      where: { tenantId_id: { tenantId: tenantA, id: child.id } },
    });
    expect(stored?.phone).toBeNull();
  });

  it("keeps the same number in two tenants as two different people", async () => {
    const inA = await new AtendlyCustomerService(prisma, tenantA).create({
      name: "Maria",
      phone: "5511900000001",
    });
    const inB = await new AtendlyCustomerService(prisma, tenantB).create({
      name: "Maria",
      phone: "5511900000001",
    });

    expect(inA.id).not.toBe(inB.id);
    expect(
      await new AtendlyCustomerService(prisma, tenantB).findCandidatesByPhone(
        "5511900000001",
      ),
    ).toHaveLength(1);
  });

  it("does not expose notes, tags or relations of one tenant to another", async () => {
    const a = new AtendlyCustomerService(prisma, tenantA);
    const b = new AtendlyCustomerService(prisma, tenantB);
    const inA = await a.create({ name: "Maria", phone: "5511900000001" });
    await a.addNote(inA.id, { body: "segredo", aiAuthorized: true });
    await a.addTag(inA.id, { label: "vip", aiAuthorized: true });

    await expect(b.get(inA.id)).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });
    expect(await b.listNotes(inA.id)).toHaveLength(0);
    expect(await b.listTags(inA.id)).toHaveLength(0);
    // O registro do tenant A permanece intacto.
    expect(await a.listNotes(inA.id)).toHaveLength(1);
  });

  it("does not create a customer when only availability is checked", async () => {
    await seedTenant(tenantA);
    await openWholeDay(tenantA);
    const services = await prisma.service.findMany({
      where: { tenantId: tenantA },
    });

    await provider(tenantA).getAvailability({
      serviceIds: [services[0].id],
      startDate: date,
      days: 3,
      stepMinutes: 30,
      maxSlots: 5,
    });

    expect(await prisma.customer.count({ where: { tenantId: tenantA } })).toBe(
      0,
    );
  });

  it("does not create or rename anyone when the confirmation fails on the slot", async () => {
    const service = await seedTenant(tenantA);
    await openWholeDay(tenantA);
    const customers = new AtendlyCustomerService(prisma, tenantA);
    const maria = await customers.create({
      name: "Maria",
      phone: "5511900000001",
    });

    // Horário fora de qualquer regra de disponibilidade.
    await expect(
      provider(tenantA).createAppointment({
        serviceIds: [service.id],
        date,
        startTime: "23:30",
        customerName: "Maria Renomeada",
        customerPhone: "5511900000001",
        stepMinutes: 30,
        idempotencyKey: "key-failure",
      }),
    ).rejects.toBeTruthy();

    expect(await prisma.customer.count({ where: { tenantId: tenantA } })).toBe(
      1,
    );
    expect((await customers.get(maria.id)).name).toBe("Maria");
  });

  it("creates the person inside the confirmation transaction when none was resolved", async () => {
    const service = await seedTenant(tenantA);
    await openWholeDay(tenantA);

    const appointment = await provider(tenantA).createAppointment({
      serviceIds: [service.id],
      date,
      startTime: "10:00",
      customerName: "Maria",
      customerPhone: "5511900000001",
      stepMinutes: 30,
      idempotencyKey: "key-create",
    });

    expect(appointment.customer?.name).toBe("Maria");
    expect(await prisma.customer.count({ where: { tenantId: tenantA } })).toBe(
      1,
    );
  });

  it("schedules for the chosen person and keeps each history separate", async () => {
    const service = await seedTenant(tenantA);
    await openWholeDay(tenantA);
    const customers = new AtendlyCustomerService(prisma, tenantA);
    const maria = await customers.create({
      name: "Maria",
      phone: "5511900000001",
    });
    const pedro = await customers.create({
      name: "Pedro",
      phone: "5511900000001",
    });

    await provider(tenantA).createAppointment({
      serviceIds: [service.id],
      date,
      startTime: "10:00",
      customerId: pedro.id,
      stepMinutes: 30,
      idempotencyKey: "key-pedro",
    });

    const forPedro = await provider(tenantA).listAppointments({
      customerId: pedro.id,
      startDate: date,
      endDate: date,
    });
    const forMaria = await provider(tenantA).listAppointments({
      customerId: maria.id,
      startDate: date,
      endDate: date,
    });
    // Buscar pelo número devolve os agendamentos de todos os candidatos.
    const byPhone = await provider(tenantA).listAppointments({
      customerPhone: "5511900000001",
      startDate: date,
      endDate: date,
    });

    expect(forPedro).toHaveLength(1);
    expect(forMaria).toHaveLength(0);
    expect(byPhone).toHaveLength(1);
    // Nenhuma pessoa nova nasceu: o agendamento foi para quem já existia.
    expect(await prisma.customer.count({ where: { tenantId: tenantA } })).toBe(
      2,
    );
  });

  it("persists guardian provenance and confirmation state", async () => {
    const customers = new AtendlyCustomerService(prisma, tenantA);
    const pedro = await customers.create({ name: "Pedro" });
    const maria = await customers.create({
      name: "Maria",
      phone: "5511900000001",
    });

    await customers.setPrimaryGuardian(pedro.id, {
      guardianCustomerId: maria.id,
      proposedBy: "AI",
    });
    const proposed = await prisma.customerRelation.findFirstOrThrow({
      where: { tenantId: tenantA, customerId: pedro.id },
    });
    expect(proposed.status).toBe("PROPOSED");
    expect(proposed.proposedBy).toBe("AI");

    await customers.confirmPrimaryGuardian(pedro.id, {
      confirmedBy: "PROFESSIONAL",
      actor: "user-1",
    });
    const confirmed = await prisma.customerRelation.findFirstOrThrow({
      where: { tenantId: tenantA, customerId: pedro.id },
    });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.confirmedAt).not.toBeNull();
  });

  it("stores notes and tags unauthorised by default", async () => {
    const customers = new AtendlyCustomerService(prisma, tenantA);
    const maria = await customers.create({ name: "Maria" });
    const note = await customers.addNote(maria.id, { body: "assunto pessoal" });
    const tag = await customers.addTag(maria.id, { label: "interno" });

    expect(note.aiAuthorized).toBe(false);
    expect(tag.aiAuthorized).toBe(false);
    const authorized = await customers.aiAuthorizedContext(maria.id);
    expect(authorized.notes).toHaveLength(0);
    expect(authorized.tags).toHaveLength(0);
  });
});
