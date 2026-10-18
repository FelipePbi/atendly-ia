// Primeiro import de propósito: fixa as variáveis da autenticação interna
// antes de `config/env.ts` ser avaliado (ver o próprio arquivo).
import "../unit/support/test-env.js";

import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { type FastifyInstance } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import {
  claimDueReturnTargets,
  settleReturnTarget,
} from "../../src/modules/customer-return/return-dispatch.js";
import { mondayOf } from "../../src/modules/customer-return/return-rules.js";
import { registerCustomerReturnRoutes } from "../../src/modules/customer-return/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import {
  addDays,
  localDateTimeToInstant,
} from "../../src/shared/date-time/calendar-date-time.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";
import { localDateAhead } from "./support/test-date.js";

/**
 * Retorno de clientes (D-202) contra PostgreSQL real: a lista da semana, a
 * aprovação virando rodada, a reivindicação com ritmo e horários reais, a
 * revalidação antes do envio, o lembrete único, a resposta, o agendamento
 * ligado e o "pare" que só a profissional desfaz.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenant = "customer-return-tenant";
const timeZone = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

let prisma: PrismaClient;
let app: FastifyInstance;

const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

function headers() {
  return {
    authorization: `Bearer ${bffToken}`,
    "x-tenant-id": tenant,
    "x-user-id": "owner-1",
    "x-request-id": "req-return",
    "content-type": "application/json",
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  await registerCustomerReturnRoutes(instance, prisma);
  instance.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        requestId: request.id,
      });
    }
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: (error as Error).message },
      requestId: request.id,
    });
  });
  return instance;
}

const today = () => localDateAhead(0);
/** Quarta-feira da semana que vem: a data esperada das clientes. */
const expectedDate = () => addDays(mondayOf(today()), 9);

async function seed(): Promise<{ serviceId: string }> {
  await prisma.calendarSettings.create({
    data: { tenantId: tenant, source: "AVENLY", timezone: timeZone },
  });
  for (let day = 0; day < 7; day += 1) {
    await prisma.availabilityRule.create({
      data: {
        tenantId: tenant,
        dayOfWeek: day,
        startTime: new Date("1970-01-01T08:00:00.000Z"),
        endTime: new Date("1970-01-01T20:00:00.000Z"),
      },
    });
  }
  const service = await prisma.service.create({
    data: {
      tenantId: tenant,
      name: "Manutenção 5D",
      durationMinutes: 60,
      priceType: "FIXED",
      price: 120,
      recurrenceIntervalDays: 15,
    },
  });
  return { serviceId: service.id };
}

async function customerWithVisit(
  name: string,
  serviceId: string,
): Promise<string> {
  const customer = await prisma.customer.create({
    data: { tenantId: tenant, name, phone: "+55 11 98888-0000" },
  });
  const lastVisit = addDays(expectedDate(), -15);
  const startAt = localDateTimeToInstant(lastVisit, "17:00", timeZone);
  // Atendimento e item na mesma transacao: a trigger
  // `Appointment_title_required_without_items` confere no commit.
  await prisma.$transaction(async (transaction) => {
    const appointment = await transaction.appointment.create({
      data: {
        tenantId: tenant,
        customerId: customer.id,
        source: "USER",
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        status: "COMPLETED",
        statusRaw: "COMPLETED",
        createdBy: "owner-1",
      },
    });
    await transaction.appointmentItem.create({
      data: {
        tenantId: tenant,
        appointmentId: appointment.id,
        serviceId,
        serviceNameSnapshot: "Manutenção 5D",
        durationMinutesSnapshot: 60,
        priceTypeSnapshot: "FIXED",
        priceSnapshot: 120,
      },
    });
  });
  return customer.id;
}

describeWithDatabase("customer return against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await resetTenant(prisma, tenant);
    await prisma.calendarSettings.deleteMany({ where: { tenantId: tenant } });
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenant);
    await prisma.calendarSettings.deleteMany({ where: { tenantId: tenant } });
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("lista, aprova, envia no ritmo, liga o agendamento e respeita o pare", async () => {
    const { serviceId } = await seed();
    const ana = await customerWithVisit("Ana", serviceId);
    const bia = await customerWithVisit("Bia", serviceId);
    const caio = await customerWithVisit("Caio", serviceId);

    // Janela o dia todo, todos os dias: o teste roda a qualquer hora.
    const settings = await app.inject({
      method: "PATCH",
      url: "/internal/customer-return/settings",
      headers: headers(),
      payload: {
        windowDays: [0, 1, 2, 3, 4, 5, 6],
        windowStart: "00:00",
        windowEnd: "24:00",
      },
    });
    expect(settings.statusCode).toBe(200);
    expect(settings.json().data).toMatchObject({
      configured: true,
      dailyLimit: 10,
      windowStart: "00:00",
      windowEnd: "24:00",
    });

    const list = await app.inject({
      method: "GET",
      url: "/internal/customer-return/candidates?kind=RENEWAL&week=next",
      headers: headers(),
    });
    expect(list.statusCode).toBe(200);
    const body = list.json().data;
    expect(body.candidates.map((c: { name: string }) => c.name)).toEqual([
      "Ana",
      "Bia",
      "Caio",
    ]);
    expect(body.candidates[0]).toMatchObject({
      expectedDate: expectedDate(),
      intervalSource: "SERVICE",
      intervalDays: 15,
      sendBy: addDays(expectedDate(), -2),
      serviceName: "Manutenção 5D",
    });

    const plan = await app.inject({
      method: "POST",
      url: "/internal/customer-return/plan",
      headers: headers(),
      payload: { kind: "RENEWAL", week: "next", customerIds: [ana, bia, caio] },
    });
    expect(plan.json().data).toMatchObject({
      total: 3,
      notFitting: [],
      minimumDailyLimit: 10,
    });

    const created = await app.inject({
      method: "POST",
      url: "/internal/customer-return/campaigns",
      headers: headers(),
      payload: { kind: "RENEWAL", week: "next", customerIds: [ana, bia, caio] },
    });
    expect(created.statusCode).toBe(201);
    const campaign = created.json().data;
    expect(campaign.counts).toMatchObject({ total: 3, queued: 3, sent: 0 });
    const activity = await prisma.activityLog.findMany({
      where: { tenantId: tenant, action: "customer_return.campaign_approved" },
    });
    expect(activity).toHaveLength(1);

    // Quem já está na fila não volta para a lista.
    const again = await app.inject({
      method: "GET",
      url: "/internal/customer-return/candidates?kind=RENEWAL&week=next",
      headers: headers(),
    });
    expect(again.json().data.candidates).toHaveLength(0);
    expect(again.json().data.excluded.queued).toBe(3);

    // Caio marcou antes do envio: sai da rodada sem mensagem.
    const tomorrow = localDateTimeToInstant(
      addDays(today(), 1),
      "10:00",
      timeZone,
    );
    await prisma.appointment.create({
      data: {
        tenantId: tenant,
        customerId: caio,
        source: "USER",
        startAt: tomorrow,
        endAt: new Date(tomorrow.getTime() + 60 * 60_000),
        status: "CONFIRMED",
        statusRaw: "SCHEDULED",
        createdBy: "owner-1",
        title: "Outro",
      },
    });

    // Primeiro envio: Ana, com dois horários reais em dias diferentes.
    const first = await claimDueReturnTargets(prisma, { owner: "test" });
    expect(first.claimed).toHaveLength(1);
    const claimedAna = first.claimed[0];
    expect(claimedAna.facts).toMatchObject({
      kind: "RENEWAL",
      followUp: false,
      customerName: "Ana",
      serviceName: "Manutenção 5D",
      expectedDate: expectedDate(),
      intervalDays: 15,
    });
    expect(claimedAna.facts.offeredSlots).toHaveLength(2);
    expect(claimedAna.facts.offeredSlots[0].date).not.toBe(
      claimedAna.facts.offeredSlots[1].date,
    );
    expect(claimedAna.correlationId).toBe(`return:${claimedAna.id}:initial`);

    const settled = await settleReturnTarget(
      prisma,
      {
        tenantId: tenant,
        targetId: claimedAna.id,
        leaseToken: claimedAna.leaseToken,
        outcome: "SENT",
        messageBody: "Oi, Ana!",
      },
      () => 0.5,
    );
    expect(settled).toMatchObject({ applied: true, state: "SENT" });

    // Ritmo: o próximo envio do negócio espera o intervalo sorteado.
    const paced = await claimDueReturnTargets(prisma, { owner: "test" });
    expect(paced.claimed).toHaveLength(0);
    const row = await prisma.returnCampaign.findUnique({
      where: { id: campaign.id },
    });
    expect(row?.nextSendNotBefore?.getTime()).toBeGreaterThan(Date.now());

    // Liberado o intervalo: Bia sai, Caio é pulado por ter horário marcado.
    await prisma.returnCampaign.update({
      where: { id: campaign.id },
      data: { nextSendNotBefore: null },
    });
    const second = await claimDueReturnTargets(prisma, { owner: "test" });
    expect(second.claimed.map((target) => target.facts.customerName)).toEqual([
      "Bia",
    ]);
    const claimedBia = second.claimed[0];
    await settleReturnTarget(prisma, {
      tenantId: tenant,
      targetId: claimedBia.id,
      leaseToken: claimedBia.leaseToken,
      outcome: "SENT",
      messageBody: "Oi, Bia!",
    });
    await prisma.returnCampaign.update({
      where: { id: campaign.id },
      data: { nextSendNotBefore: null },
    });
    const third = await claimDueReturnTargets(prisma, { owner: "test" });
    expect(third.claimed).toHaveLength(0);
    expect(third.skipped).toBe(1);
    const caioTarget = await prisma.returnCampaignTarget.findFirst({
      where: { tenantId: tenant, customerId: caio },
    });
    expect(caioTarget).toMatchObject({
      state: "SKIPPED",
      reason: "HAS_APPOINTMENT",
    });
    const done = await prisma.returnCampaign.findUnique({
      where: { id: campaign.id },
    });
    expect(done?.state).toBe("DONE");

    // Ana respondeu e marcou: o envio liga o agendamento.
    const reply = await app.inject({
      method: "POST",
      url: `/internal/customer-return/targets/${claimedAna.id}/replied`,
      payload: {},
      headers: {
        ...headers(),
        authorization: `Bearer ${deriveInternalToken(
          TEST_INTERNAL_SERVICE_TOKEN,
          "ai-orchestrator",
          SERVICE_AUDIENCE,
          "command",
        )}`,
      },
    });
    expect(reply.statusCode).toBe(200);
    const anaStart = localDateTimeToInstant(expectedDate(), "17:00", timeZone);
    await prisma.appointment.create({
      data: {
        tenantId: tenant,
        customerId: ana,
        source: "AI",
        startAt: anaStart,
        endAt: new Date(anaStart.getTime() + 60 * 60_000),
        status: "CONFIRMED",
        statusRaw: "SCHEDULED",
        createdBy: "ai",
        title: "Manutenção",
      },
    });
    const detail = await app.inject({
      method: "GET",
      url: `/internal/customer-return/campaigns/${campaign.id}`,
      headers: headers(),
    });
    const detailBody = detail.json().data;
    expect(detailBody.counts).toMatchObject({
      total: 3,
      sent: 2,
      replied: 1,
      booked: 1,
      skipped: 1,
      queued: 0,
    });
    const anaView = detailBody.targets.find(
      (target: { customerId: string }) => target.customerId === ana,
    );
    expect(anaView).toMatchObject({ state: "BOOKED", messageBody: "Oi, Ana!" });
    expect(anaView.appointmentId).toBeTruthy();

    // Bia não respondeu em 3 dias: um lembrete único.
    await prisma.returnCampaignTarget.update({
      where: { id: claimedBia.id },
      data: { sentAt: new Date(Date.now() - 4 * DAY_MS) },
    });
    await prisma.returnCampaign.update({
      where: { id: campaign.id },
      data: { nextSendNotBefore: null },
    });
    const followUp = await claimDueReturnTargets(prisma, { owner: "test" });
    expect(followUp.claimed).toHaveLength(1);
    expect(followUp.claimed[0]).toMatchObject({
      leaseKind: "FOLLOW_UP",
      correlationId: `return:${claimedBia.id}:followup`,
    });
    expect(followUp.claimed[0].facts.followUp).toBe(true);
    await settleReturnTarget(prisma, {
      tenantId: tenant,
      targetId: claimedBia.id,
      leaseToken: followUp.claimed[0].leaseToken,
      outcome: "SENT",
    });
    await prisma.returnCampaign.update({
      where: { id: campaign.id },
      data: { nextSendNotBefore: null },
    });
    const noMore = await claimDueReturnTargets(prisma, { owner: "test" });
    expect(noMore.claimed).toHaveLength(0);

    // Bia pede para parar: bloqueio permanente, só a profissional desfaz.
    const aiHeaders = {
      ...headers(),
      authorization: `Bearer ${deriveInternalToken(
        TEST_INTERNAL_SERVICE_TOKEN,
        "ai-orchestrator",
        SERVICE_AUDIENCE,
        "command",
      )}`,
    };
    const stop = await app.inject({
      method: "POST",
      url: `/internal/customer-return/targets/${claimedBia.id}/answer`,
      headers: aiHeaders,
      payload: { answer: "STOPPED" },
    });
    expect(stop.statusCode).toBe(200);
    expect(stop.json().data).toMatchObject({
      blocked: true,
      permanent: true,
      reason: "STOPPED",
    });
    const unblock = await app.inject({
      method: "PUT",
      url: `/internal/customers/${bia}/return-status`,
      headers: headers(),
      payload: { blocked: false },
    });
    expect(unblock.json().data).toMatchObject({ blocked: false });
    // A IA nunca desfaz o bloqueio.
    const aiUnblock = await app.inject({
      method: "PUT",
      url: `/internal/customers/${bia}/return-status`,
      headers: aiHeaders,
      payload: { blocked: false },
    });
    expect(aiUnblock.statusCode).toBe(403);
  });

  it("cancelar tira da fila quem ainda não recebeu; pausar segura os envios", async () => {
    const { serviceId } = await seed();
    const ana = await customerWithVisit("Ana", serviceId);
    await app.inject({
      method: "PATCH",
      url: "/internal/customer-return/settings",
      headers: headers(),
      payload: {
        windowDays: [0, 1, 2, 3, 4, 5, 6],
        windowStart: "00:00",
        windowEnd: "24:00",
      },
    });
    const created = await app.inject({
      method: "POST",
      url: "/internal/customer-return/campaigns",
      headers: headers(),
      payload: { kind: "RENEWAL", week: "next", customerIds: [ana] },
    });
    const id = created.json().data.id as string;

    const paused = await app.inject({
      method: "POST",
      url: `/internal/customer-return/campaigns/${id}/pause`,
      headers: headers(),
      payload: {},
    });
    expect(paused.json().data.state).toBe("PAUSED");
    expect((await claimDueReturnTargets(prisma, {})).claimed).toHaveLength(0);

    const cancelled = await app.inject({
      method: "POST",
      url: `/internal/customer-return/campaigns/${id}/cancel`,
      headers: headers(),
      payload: {},
    });
    expect(cancelled.json().data).toMatchObject({
      state: "CANCELLED",
      counts: { skipped: 1, queued: 0 },
    });
    const conflict = await app.inject({
      method: "POST",
      url: `/internal/customer-return/campaigns/${id}/resume`,
      headers: headers(),
      payload: {},
    });
    expect(conflict.statusCode).toBe(409);
  });
});
