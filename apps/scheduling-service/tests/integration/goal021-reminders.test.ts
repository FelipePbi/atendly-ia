import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { AtendlyCalendarProvider } from "../../src/modules/integrations/atendly/provider.js";
import {
  claimDueNotificationIntents,
  listAppointmentNotifications,
  ReminderService,
  renewNotificationIntentLease,
  settleNotificationIntent,
} from "../../src/modules/reminders/index.js";
import { resetTenant } from "./support/reset-tenant.js";
import { upcomingDate } from "./support/test-date.js";

/**
 * Lembretes, versão notificável e reivindicação de envio contra PostgreSQL
 * real (Goal021, WU-006).
 *
 * O que a suíte unitária (`tests/unit/notification-dispatch.test.ts`) já
 * declara não provar com o dublê — concorrência real de duas varreduras,
 * `now()` do servidor e o dedupe por índice único — é exatamente o que esta
 * suíte prova aqui, em banco de verdade. O dedupe em particular é provado por
 * TENTATIVA DE INSERÇÃO duplicada, nunca por leitura: uma leitura de contagem
 * não distingue "o índice recusou a segunda linha" de "ninguém tentou gravar
 * a segunda linha".
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const timeZone = "America/Sao_Paulo";
const owner = "scheduling:test:goal021";

let prisma: PrismaClient;
let other: PrismaClient;

interface TenantFixture {
  tenantId: string;
  timezone: string;
  serviceId: string;
  customerId: string;
}

async function seedTenant(
  tenantId: string,
  options: {
    timezone?: string;
    customerPhone?: string | null;
    customerName?: string;
  } = {},
): Promise<TenantFixture> {
  const tz = options.timezone ?? timeZone;
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "ATENDLY", timezone: tz },
    update: { source: "ATENDLY", timezone: tz },
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
    data: {
      tenantId,
      name: options.customerName ?? "Ana",
      phone:
        options.customerPhone === undefined
          ? "5511911112222"
          : options.customerPhone,
    },
  });
  return {
    tenantId,
    timezone: tz,
    serviceId: service.id,
    customerId: customer.id,
  };
}

async function configureReminders(
  tenantId: string,
  rules: Array<{ slot: "FIRST" | "SECOND"; leadMinutes: number }>,
): Promise<void> {
  await new ReminderService(prisma, tenantId).set({ rules });
}

function providerFor(fixture: TenantFixture): AtendlyCalendarProvider {
  return new AtendlyCalendarProvider(
    prisma,
    fixture.tenantId,
    "user-1",
    fixture.timezone,
  );
}

/** Todas as intenções do compromisso, em qualquer estado — o nome não mente. */
async function intentsFor(tenantId: string, appointmentId: string) {
  return prisma.appointmentNotificationIntent.findMany({
    where: { tenantId, appointmentId },
    orderBy: [{ appointmentVersion: "asc" }, { slot: "asc" }],
  });
}

/** Empurra `dueAt` para o passado — o mesmo que o tempo faria sozinho. */
async function forcePast(
  tenantId: string,
  id: string,
  data: { dueAt: Date },
): Promise<void> {
  await prisma.appointmentNotificationIntent.update({
    where: { tenantId_id: { tenantId, id } },
    data,
  });
}

/**
 * Vence o lease sem esperar o TTL — o mesmo efeito que o tempo produziria
 * sozinho. `leaseAcquiredAt` precisa mover junto: o CHECK do banco
 * (`AppointmentNotificationIntent_lifecycle_check`) exige que a expiração
 * seja sempre posterior à aquisição, então só empurrar `leaseExpiresAt` para
 * trás da aquisição real violaria a mesma invariante que este teste depende
 * do banco para impor.
 */
async function expireLease(tenantId: string, id: string): Promise<void> {
  await prisma.appointmentNotificationIntent.update({
    where: { tenantId_id: { tenantId, id } },
    data: {
      leaseAcquiredAt: new Date(Date.now() - 120_000),
      leaseExpiresAt: new Date(Date.now() - 60_000),
    },
  });
}

describeWithDatabase("goal021 reminders and notification intents against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    other = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await other?.$disconnect();
  });

  beforeEach(async () => {
    for (const tenantId of ["goal021-a", "goal021-b", "goal021-v"]) {
      await resetTenant(prisma, tenantId);
      await prisma.reminderRule.deleteMany({ where: { tenantId } });
      await prisma.reminderSettings.deleteMany({ where: { tenantId } });
    }
  });

  it("a leitura do compromisso devolve o estado de envio DELE, sem vazar outro negócio", async () => {
    const tenantA = await seedTenant("goal021-a", {
      customerPhone: "5511911110001",
    });
    const tenantB = await seedTenant("goal021-b", {
      customerName: "Bruna",
      customerPhone: "5592911110002",
    });
    await configureReminders(tenantA.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
      { slot: "SECOND", leadMinutes: 120 },
    ]);
    await configureReminders(tenantB.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
    ]);
    const date = upcomingDate(5);

    const appointmentA = await providerFor(tenantA).createAppointment({
      source: "USER",
      serviceIds: [tenantA.serviceId],
      date,
      startTime: "09:00",
      customerId: tenantA.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-read-a-1",
    });
    const appointmentB = await providerFor(tenantB).createAppointment({
      source: "USER",
      serviceIds: [tenantB.serviceId],
      date,
      startTime: "09:00",
      customerId: tenantB.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-read-b-1",
    });

    const read = await listAppointmentNotifications(
      prisma,
      tenantA.tenantId,
      appointmentA.id,
    );

    // As duas posições deste compromisso, em ordem de vencimento — e nenhuma
    // linha do outro negócio, que tem compromisso e lembrete no mesmo dia.
    expect(read.map((row) => [row.kind, row.slot, row.state])).toEqual([
      ["REMINDER", "FIRST", "PENDING"],
      ["REMINDER", "SECOND", "PENDING"],
    ]);
    expect(read.every((row) => row.reason === null)).toBe(true);
    expect(read.every((row) => row.sentAt === null)).toBe(true);
    // O telefone do cliente e os fatos compostos para a IA ficam em `facts`,
    // que esta leitura não expõe: a tela não precisa deles.
    expect(Object.keys(read[0]).sort()).toEqual([
      "appointmentVersion",
      "dueAt",
      "id",
      "kind",
      "reason",
      "sentAt",
      "settledAt",
      "slot",
      "state",
    ]);

    const readB = await listAppointmentNotifications(
      prisma,
      tenantB.tenantId,
      appointmentB.id,
    );
    expect(readB).toHaveLength(1);
    expect(
      readB.some((row) => read.some((other) => other.id === row.id)),
    ).toBe(false);

    // Um id válido em outro negócio não vira leitura autorizada aqui.
    expect(
      await listAppointmentNotifications(
        prisma,
        tenantA.tenantId,
        appointmentB.id,
      ),
    ).toEqual([]);
  });

  it("a leitura mostra o lembrete que já saiu ao lado do que ficou pendente", async () => {
    const tenant = await seedTenant("goal021-a", {
      customerPhone: "5511911110001",
    });
    await configureReminders(tenant.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
    ]);
    const date = upcomingDate(5);
    const appointment = await providerFor(tenant).createAppointment({
      source: "USER",
      serviceIds: [tenant.serviceId],
      date,
      startTime: "09:00",
      customerId: tenant.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-read-sent-1",
    });
    const [intent] = await intentsFor(tenant.tenantId, appointment.id);
    await forcePast(tenant.tenantId, intent.id, {
      dueAt: new Date(Date.now() - 60_000),
    });
    const claim = await claimDueNotificationIntents(prisma, { owner });
    const claimed = claim.claimed.find((row) => row.id === intent.id)!;
    await settleNotificationIntent(prisma, {
      tenantId: tenant.tenantId,
      intentId: claimed.id,
      leaseToken: claimed.leaseToken,
      outcome: "SENT",
      correlationId: claimed.correlationId,
    });

    // Remarcar depois do envio não desfaz o que saiu: o lembrete enviado
    // continua legível, e é isso que o detalhe do agendamento mostra.
    await providerFor(tenant).rescheduleAppointment({
      appointmentId: appointment.id,
      date: upcomingDate(6),
      startTime: "09:00",
      stepMinutes: 30,
      idempotencyKey: "goal021-read-sent-2",
      notifyCustomer: true,
    });

    const read = await listAppointmentNotifications(
      prisma,
      tenant.tenantId,
      appointment.id,
    );
    const sent = read.find((row) => row.state === "SENT");
    expect(sent?.kind).toBe("REMINDER");
    expect(sent?.sentAt).not.toBeNull();
    expect(
      read.some(
        (row) => row.kind === "CHANGE_NOTICE" && row.state === "PENDING",
      ),
    ).toBe(true);
    expect(
      read.some(
        (row) => row.kind === "REMINDER" && row.state === "PENDING",
      ),
    ).toBe(true);
  });

  it("agenda lembretes na criação e reagenda na remarcação, cancelando os da versão anterior", async () => {
    const tenant = await seedTenant("goal021-a");
    await configureReminders(tenant.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
      { slot: "SECOND", leadMinutes: 120 },
    ]);
    const date = upcomingDate(5);

    const appointment = await providerFor(tenant).createAppointment({
      source: "USER",
      serviceIds: [tenant.serviceId],
      date,
      startTime: "09:00",
      customerId: tenant.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-create-1",
    });

    const created = await intentsFor(tenant.tenantId, appointment.id);
    expect(created).toHaveLength(2);
    expect(created.map((row) => [row.slot, row.state, row.appointmentVersion])).toEqual([
      ["FIRST", "PENDING", 1],
      ["SECOND", "PENDING", 1],
    ]);
    const startAt = new Date(`${date}T09:00:00.000-03:00`);
    expect(created[0].dueAt.getTime()).toBe(startAt.getTime() - 1440 * 60_000);
    expect(created[1].dueAt.getTime()).toBe(startAt.getTime() - 120 * 60_000);

    const rescheduled = await providerFor(tenant).rescheduleAppointment({
      appointmentId: appointment.id,
      date,
      startTime: "11:00",
      stepMinutes: 30,
      idempotencyKey: "goal021-reschedule-1",
    });

    const afterReschedule = await intentsFor(
      tenant.tenantId,
      appointment.id,
    );
    const oldVersion = afterReschedule.filter(
      (row) => row.appointmentVersion === 1,
    );
    const newVersion = afterReschedule.filter(
      (row) => row.appointmentVersion === 2,
    );
    expect(oldVersion.every((row) => row.state === "CANCELLED")).toBe(true);
    expect(
      oldVersion.every(
        (row) => row.reason === "APPOINTMENT_VERSION_SUPERSEDED",
      ),
    ).toBe(true);
    expect(newVersion.map((row) => row.slot)).toEqual(["FIRST", "SECOND"]);
    expect(newVersion.every((row) => row.state === "PENDING")).toBe(true);
    const newStartAt = new Date(rescheduled.date + "T11:00:00.000-03:00");
    const firstNew = newVersion.find((row) => row.slot === "FIRST");
    expect(firstNew?.dueAt.getTime()).toBe(
      newStartAt.getTime() - 1440 * 60_000,
    );
  });

  it("cancela as pendentes ao cancelar o atendimento, e agenda o aviso quando a notificação é pedida", async () => {
    const tenant = await seedTenant("goal021-a");
    await configureReminders(tenant.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
    ]);
    const date = upcomingDate(5);
    const appointment = await providerFor(tenant).createAppointment({
      source: "USER",
      serviceIds: [tenant.serviceId],
      date,
      startTime: "09:00",
      customerId: tenant.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-cancel-create-1",
    });

    await providerFor(tenant).cancelAppointment({
      appointmentId: appointment.id,
      idempotencyKey: "goal021-cancel-1",
      notifyCustomer: true,
    });

    const rows = await intentsFor(tenant.tenantId, appointment.id);
    const reminder = rows.find(
      (row) => row.kind === "REMINDER" && row.appointmentVersion === 1,
    );
    expect(reminder?.state).toBe("CANCELLED");
    expect(reminder?.reason).toBe("APPOINTMENT_CANCELLED");

    const notice = rows.find((row) => row.kind === "CHANGE_NOTICE");
    expect(notice?.state).toBe("PENDING");
    expect(notice?.slot).toBe("CHANGE_NOTICE");
    expect(notice?.appointmentVersion).toBe(2);
  });

  it("cancela a intenção cuja versão divergiu na reivindicação, em vez de enviá-la", async () => {
    const tenant = await seedTenant("goal021-v");
    await configureReminders(tenant.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
    ]);
    const date = upcomingDate(5);
    const appointment = await providerFor(tenant).createAppointment({
      source: "USER",
      serviceIds: [tenant.serviceId],
      date,
      startTime: "09:00",
      customerId: tenant.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-version-create-1",
    });
    const [intent] = await intentsFor(tenant.tenantId, appointment.id);
    await forcePast(tenant.tenantId, intent.id, {
      dueAt: new Date(Date.now() - 60_000),
    });

    // Reivindicada primeiro: a versão 1 é a que ela carrega.
    const firstClaim = await claimDueNotificationIntents(prisma, {
      owner: "scheduling:sweep-v1",
    });
    expect(firstClaim.claimed.map((claimed) => claimed.id)).toEqual([
      intent.id,
    ]);

    // O compromisso é remarcado enquanto a intenção está sob lease: a
    // recomputação nunca toca `CLAIMED`, então ela sobrevive à mutação
    // carregando uma versão que já não é a vigente.
    await providerFor(tenant).rescheduleAppointment({
      appointmentId: appointment.id,
      date,
      startTime: "14:00",
      stepMinutes: 30,
      idempotencyKey: "goal021-version-reschedule-1",
    });

    // O lease vence — o mesmo que aconteceria sozinho depois do TTL.
    await expireLease(tenant.tenantId, intent.id);

    const secondClaim = await claimDueNotificationIntents(prisma, {
      owner: "scheduling:sweep-v2",
    });
    expect(secondClaim.released).toBe(1);
    expect(secondClaim.settled).toEqual([
      {
        id: intent.id,
        tenantId: tenant.tenantId,
        appointmentId: appointment.id,
        state: "CANCELLED",
        reason: "APPOINTMENT_VERSION_SUPERSEDED",
      },
    ]);
    expect(secondClaim.claimed).toHaveLength(0);

    const row = await prisma.appointmentNotificationIntent.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: tenant.tenantId, id: intent.id } },
    });
    expect(row.state).toBe("CANCELLED");
    expect(row.leaseOwner).toBeNull();
  });

  it("recusa a segunda intenção pela mesma identidade por TENTATIVA DE INSERÇÃO, não por leitura", async () => {
    const tenant = await seedTenant("goal021-a");
    const date = upcomingDate(5);
    const appointment = await providerFor(tenant).createAppointment({
      source: "USER",
      serviceIds: [tenant.serviceId],
      date,
      startTime: "09:00",
      customerId: tenant.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-dedupe-create-1",
    });

    // Grava a identidade diretamente, à parte de `putIntent` (que faz
    // upsert e nunca lançaria): o que se prova aqui é que o ÍNDICE recusa uma
    // segunda linha com a mesma identidade, não que o código de aplicação a
    // evita.
    await prisma.appointmentNotificationIntent.create({
      data: {
        tenantId: tenant.tenantId,
        appointmentId: appointment.id,
        kind: "CHANGE_NOTICE",
        slot: "CHANGE_NOTICE",
        appointmentVersion: 7,
        state: "PENDING",
        dueAt: new Date(),
      },
    });

    await expect(
      prisma.appointmentNotificationIntent.create({
        data: {
          tenantId: tenant.tenantId,
          appointmentId: appointment.id,
          kind: "CHANGE_NOTICE",
          slot: "CHANGE_NOTICE",
          appointmentVersion: 7,
          state: "PENDING",
          dueAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const rows = await prisma.appointmentNotificationIntent.findMany({
      where: {
        tenantId: tenant.tenantId,
        appointmentId: appointment.id,
        kind: "CHANGE_NOTICE",
        appointmentVersion: 7,
      },
    });
    expect(rows).toHaveLength(1);
  });

  it("nasce dispensada quando a antecedência configurada já passou", async () => {
    const tenant = await seedTenant("goal021-a");
    // Trinta dias de antecedência (o teto) contra um compromisso a cinco dias:
    // `dueAt` cai no passado no exato instante em que a intenção nasce.
    await configureReminders(tenant.tenantId, [
      { slot: "FIRST", leadMinutes: 43_200 },
    ]);
    const date = upcomingDate(5);

    const appointment = await providerFor(tenant).createAppointment({
      source: "USER",
      serviceIds: [tenant.serviceId],
      date,
      startTime: "09:00",
      customerId: tenant.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-overdue-create-1",
    });

    const [intent] = await intentsFor(tenant.tenantId, appointment.id);
    expect(intent.state).toBe("DISMISSED");
    expect(intent.reason).toBe("LEAD_ALREADY_PASSED");
    expect(intent.settledAt).not.toBeNull();
  });

  it("dispensa na reivindicação o cliente sem telefone, sem erro", async () => {
    const tenant = await seedTenant("goal021-a", { customerPhone: null });
    await configureReminders(tenant.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
    ]);
    const date = upcomingDate(5);
    const appointment = await providerFor(tenant).createAppointment({
      source: "USER",
      serviceIds: [tenant.serviceId],
      date,
      startTime: "09:00",
      customerId: tenant.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-nophone-create-1",
    });
    const [intent] = await intentsFor(tenant.tenantId, appointment.id);
    await forcePast(tenant.tenantId, intent.id, {
      dueAt: new Date(Date.now() - 60_000),
    });

    const claim = await claimDueNotificationIntents(prisma, { owner });

    expect(claim.claimed).toHaveLength(0);
    expect(claim.settled).toEqual([
      {
        id: intent.id,
        tenantId: tenant.tenantId,
        appointmentId: appointment.id,
        state: "DISMISSED",
        reason: "CUSTOMER_WITHOUT_PHONE",
      },
    ]);
  });

  it("duas varreduras concorrentes não reivindicam a mesma intenção", async () => {
    const tenant = await seedTenant("goal021-a");
    await configureReminders(tenant.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
    ]);
    const date = upcomingDate(5);
    const appointment = await providerFor(tenant).createAppointment({
      source: "USER",
      serviceIds: [tenant.serviceId],
      date,
      startTime: "09:00",
      customerId: tenant.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-concurrency-create-1",
    });
    const [intent] = await intentsFor(tenant.tenantId, appointment.id);
    await forcePast(tenant.tenantId, intent.id, {
      dueAt: new Date(Date.now() - 60_000),
    });

    // Duas conexões de verdade, disputando o mesmo `UPDATE ... WHERE state =
    // 'PENDING'` ao mesmo tempo — o que o dublê não pode simular.
    const [resultA, resultB] = await Promise.all([
      claimDueNotificationIntents(prisma, { owner: "scheduling:sweep-a" }),
      claimDueNotificationIntents(other, { owner: "scheduling:sweep-b" }),
    ]);

    const claimedTotal = resultA.claimed.length + resultB.claimed.length;
    expect(claimedTotal).toBe(1);
    const winner = resultA.claimed[0] ?? resultB.claimed[0];
    expect(winner.id).toBe(intent.id);

    const row = await prisma.appointmentNotificationIntent.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: tenant.tenantId, id: intent.id } },
    });
    expect(row.state).toBe("CLAIMED");
    expect(row.leaseToken).toBe(winner.leaseToken);
  });

  it("lease vencido devolve a intenção com a tentativa contada, e liquidar duas vezes é inócuo", async () => {
    const tenant = await seedTenant("goal021-a");
    await configureReminders(tenant.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
    ]);
    const date = upcomingDate(5);
    const appointment = await providerFor(tenant).createAppointment({
      source: "USER",
      serviceIds: [tenant.serviceId],
      date,
      startTime: "09:00",
      customerId: tenant.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-lease-create-1",
    });
    const [intent] = await intentsFor(tenant.tenantId, appointment.id);
    await forcePast(tenant.tenantId, intent.id, {
      dueAt: new Date(Date.now() - 60_000),
    });

    const firstClaim = await claimDueNotificationIntents(prisma, {
      owner: "scheduling:sweep-dead",
    });
    expect(firstClaim.claimed).toHaveLength(1);
    const deadLeaseToken = firstClaim.claimed[0].leaseToken;

    await expireLease(tenant.tenantId, intent.id);

    const revivedClaim = await claimDueNotificationIntents(prisma, {
      owner: "scheduling:sweep-alive",
    });
    expect(revivedClaim.released).toBe(1);
    expect(revivedClaim.claimed).toHaveLength(1);
    const claimed = revivedClaim.claimed[0];
    expect(claimed.attemptCount).toBe(1);

    // O lease morto não renova mais — quem o detinha perdeu o trabalho.
    const renewedDead = await renewNotificationIntentLease(prisma, {
      tenantId: tenant.tenantId,
      intentId: intent.id,
      leaseToken: deadLeaseToken,
    });
    expect(renewedDead).toBeNull();

    const first = await settleNotificationIntent(prisma, {
      tenantId: tenant.tenantId,
      intentId: intent.id,
      leaseToken: claimed.leaseToken,
      outcome: "SENT",
      correlationId: claimed.correlationId,
    });
    expect(first.applied).toBe(true);
    expect(first.intent.state).toBe("SENT");

    const second = await settleNotificationIntent(prisma, {
      tenantId: tenant.tenantId,
      intentId: intent.id,
      leaseToken: claimed.leaseToken,
      outcome: "FAILED",
      reason: "TRANSPORT_FAILED",
    });
    expect(second.applied).toBe(false);
    expect(second.intent.state).toBe("SENT");
    expect(second.intent.attemptCount).toBe(first.intent.attemptCount);

    const row = await prisma.appointmentNotificationIntent.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: tenant.tenantId, id: intent.id } },
    });
    expect(row.state).toBe("SENT");
    expect(row.reason).toBeNull();
  });

  it("isola por tenant: dois negócios na mesma base, sem vazar fato nem configuração", async () => {
    const tenantA = await seedTenant("goal021-a", {
      timezone: "America/Sao_Paulo",
      customerName: "Ana",
      customerPhone: "5511911110001",
    });
    const tenantB = await seedTenant("goal021-b", {
      timezone: "America/Manaus",
      customerName: "Bruna",
      customerPhone: "5592911110002",
    });
    await configureReminders(tenantA.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
    ]);
    await configureReminders(tenantB.tenantId, [
      { slot: "FIRST", leadMinutes: 1440 },
    ]);
    const date = upcomingDate(5);

    // Mesmo horário local nos dois negócios, propositalmente: o que isola é o
    // tenant, não um dado que por acaso difere.
    const appointmentA = await providerFor(tenantA).createAppointment({
      source: "USER",
      serviceIds: [tenantA.serviceId],
      date,
      startTime: "09:00",
      customerId: tenantA.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-isolation-a-1",
    });
    const appointmentB = await providerFor(tenantB).createAppointment({
      source: "USER",
      serviceIds: [tenantB.serviceId],
      date,
      startTime: "09:00",
      customerId: tenantB.customerId,
      stepMinutes: 30,
      idempotencyKey: "goal021-isolation-b-1",
    });
    const [intentA] = await intentsFor(tenantA.tenantId, appointmentA.id);
    const [intentB] = await intentsFor(tenantB.tenantId, appointmentB.id);
    await forcePast(tenantA.tenantId, intentA.id, {
      dueAt: new Date(Date.now() - 60_000),
    });
    await forcePast(tenantB.tenantId, intentB.id, {
      dueAt: new Date(Date.now() - 60_000),
    });

    // Uma única varredura, sem tenant na frente: os dois negócios competem
    // pela mesma fila e os dois devem sair corretamente atribuídos.
    const claim = await claimDueNotificationIntents(prisma, { owner });

    expect(claim.claimed).toHaveLength(2);
    const claimedA = claim.claimed.find((row) => row.id === intentA.id);
    const claimedB = claim.claimed.find((row) => row.id === intentB.id);
    expect(claimedA?.facts.customerName).toBe("Ana");
    expect(claimedA?.facts.customerPhone).toBe("5511911110001");
    expect(claimedA?.facts.timezone).toBe("America/Sao_Paulo");
    expect(claimedB?.facts.customerName).toBe("Bruna");
    expect(claimedB?.facts.customerPhone).toBe("5592911110002");
    expect(claimedB?.facts.timezone).toBe("America/Manaus");
    // O mesmo horário local em dois fusos diferentes é um instante diferente:
    // se os fatos tivessem cruzado de negócio, esta comparação falharia.
    expect(claimedA?.facts.startAt).not.toBe(claimedB?.facts.startAt);
  });
});
