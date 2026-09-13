import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import type {
  ConfirmAppointmentSeriesInput,
  CreateSchedulingHoldInput,
  PreviewAppointmentSeriesInput,
  RescheduleAppointmentInput,
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingHold,
  SchedulingServiceDefinition,
} from "../../src/modules/scheduling-service/types.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";

const { Client } = pg;

/**
 * Liberação do hold do rascunho substituído (Goal011, critério 8), provada
 * contra PostgreSQL de verdade.
 *
 * O rascunho (`pendingAction`) vive na conversa da IA (`AI_TEST_DATABASE_URL`).
 * O hold que ele referencia é uma entidade do Scheduling Service
 * (`AppointmentHold`, em `SCHEDULING_TEST_DATABASE_URL`) — por isso a prova
 * de "o hold não fica ocupado" olha essa segunda tabela diretamente, e não
 * apenas o JSON do rascunho. Sem as duas variáveis a suíte é pulada, como as
 * demais de integração.
 */
const aiDatabaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();
const schedulingDatabaseUrl = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabases =
  aiDatabaseUrl && schedulingDatabaseUrl ? describe : describe.skip;

const TENANT = "tenant-hold-release";
const CHANNEL = "channel-hold-release";
const CONVERSATION = "conversation-hold-release";
const CONTACT = "5511977777777";

const service: SchedulingServiceDefinition = {
  id: "service-hold-release",
  name: "Aplicacao 5D",
  duration: 60,
  priceType: "FIXED",
  price: 190,
  colorId: null,
  recurrenceIntervalDays: null,
};

function context(turnId: string) {
  return {
    turnId,
    conversationId: CONVERSATION,
    tenantId: TENANT,
    channelId: CHANNEL,
    userId: `user-${TENANT}`,
    requestId: "request-1",
    phone: CONTACT,
    customerName: "Thais",
    businessContext: {
      ...DEFAULT_BUSINESS_CONTEXT,
      businessName: "Camili Krauser Beauty",
      configured: true,
    },
    aiRunId: "ai-run-1",
  };
}

describeWithDatabases("AssistantToolRegistry hold release against PostgreSQL", () => {
  let prisma: PrismaClient;
  let scheduling: InstanceType<typeof Client>;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: aiDatabaseUrl }),
    });
    scheduling = new Client({ connectionString: schedulingDatabaseUrl });
    await scheduling.connect();

    await prisma.channelConnection.upsert({
      where: { tenantId_id: { tenantId: TENANT, id: CHANNEL } },
      update: {},
      create: {
        id: CHANNEL,
        tenantId: TENANT,
        userId: `user-${TENANT}`,
        provider: "EVOLUTION_GO",
        externalInstanceId: `instance-${TENANT}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await scheduling.end();
  });

  beforeEach(async () => {
    await prisma.conversation.upsert({
      where: {
        tenantId_channelId_id: {
          tenantId: TENANT,
          channelId: CHANNEL,
          id: CONVERSATION,
        },
      },
      update: { state: {} },
      create: {
        id: CONVERSATION,
        tenantId: TENANT,
        channelId: CHANNEL,
        externalContactId: CONTACT,
        state: {},
      },
    });
    await scheduling.query('DELETE FROM "AppointmentHold" WHERE "tenantId" = $1', [
      TENANT,
    ]);
  });

  /** Cria um hold real no Scheduling Service, sem depender do app HTTP dele. */
  async function createHoldRow(): Promise<SchedulingHold> {
    const id = `hold-${Math.random().toString(16).slice(2)}`;
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + service.duration * 60_000);
    const expiresAt = new Date(startAt.getTime() + 5 * 60_000);
    await scheduling.query(
      `INSERT INTO "AppointmentHold"
        ("id", "tenantId", "startAt", "endAt", "proposedServiceIds", "proposedDurationMinutes", "source", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'AI', $7)`,
      [
        id,
        TENANT,
        startAt,
        endAt,
        JSON.stringify([service.id]),
        service.duration,
        expiresAt,
      ],
    );
    return {
      id,
      date: startAt.toISOString().slice(0, 10),
      startTime: "10:00",
      endTime: "11:00",
      duration: service.duration,
      serviceIds: [service.id],
      expiresAt: expiresAt.toISOString(),
      status: "ACTIVE",
    };
  }

  /** Idempotente, como o `releaseHold` real: não faz nada se já consumido/liberado. */
  async function releaseHoldRow(id: string): Promise<SchedulingHold> {
    await scheduling.query(
      `UPDATE "AppointmentHold" SET "releasedAt" = now()
       WHERE "tenantId" = $1 AND "id" = $2 AND "consumedAt" IS NULL AND "releasedAt" IS NULL`,
      [TENANT, id],
    );
    const row = await holdRow(id);
    return {
      id,
      date: "",
      startTime: "",
      endTime: "",
      duration: 0,
      serviceIds: [],
      expiresAt: row?.expiresAt?.toISOString() ?? "",
      status: row?.releasedAt ? "RELEASED" : "ACTIVE",
    };
  }

  async function holdRow(
    id: string,
  ): Promise<{ releasedAt: Date | null; consumedAt: Date | null; expiresAt: Date } | null> {
    const result = await scheduling.query(
      'SELECT "releasedAt", "consumedAt", "expiresAt" FROM "AppointmentHold" WHERE "tenantId" = $1 AND "id" = $2',
      [TENANT, id],
    );
    return (result.rows[0] as
      | { releasedAt: Date | null; consumedAt: Date | null; expiresAt: Date }
      | undefined) ?? null;
  }

  function buildRegistry(futureAppointments: SchedulingAppointment[] = []) {
    const agenda = {
      listActiveServices: async () => [service],
      findService: async () => service,
      getAvailableSlotsForServices: async () => [
        { date: "2026-07-01", startTime: "10:00", endTime: "11:00" },
      ],
      createHold: async (_input: CreateSchedulingHoldInput) => createHoldRow(),
      releaseHold: async (id: string) => releaseHoldRow(id),
      createAppointment: async (
        input: ScheduleAppointmentInput,
      ): Promise<SchedulingAppointment> => ({
        id: `appointment-${Math.random().toString(16).slice(2)}`,
        title: null,
        date: input.date,
        startTime: input.startTime,
        endTime: "11:00",
        duration: service.duration,
        customerId: input.customerId ?? "customer-1",
        customer: {
          id: input.customerId ?? "customer-1",
          name: input.customerName ?? "Thais",
          phone: CONTACT,
        },
        services: [
          {
            serviceId: service.id,
            name: service.name,
            duration: service.duration,
            priceType: service.priceType,
            price: service.price,
          },
        ],
        price: service.price,
        totalPriceType: "FIXED",
        comments: null,
        status: "CONFIRMED",
        serviceId: service.id,
        serviceIds: [service.id],
        serviceName: service.name,
        customerName: input.customerName ?? "Thais",
      }),
      findFutureAppointmentsForPhone: async (): Promise<SchedulingAppointment[]> =>
        futureAppointments,
      findFutureAppointmentsForCustomer: async () => [] as SchedulingAppointment[],
      findCustomerCandidatesByPhone: async () => [],
      getAuthorizedCustomerContext: async (customerId: string) => ({
        id: customerId,
        name: "Thais",
        phone: CONTACT,
        notes: [],
        tags: [],
        primaryGuardian: null,
      }),
      cancelAppointment: async (appointmentId: string) => ({
        appointmentId,
        cancelled: true as const,
      }),
      rescheduleAppointment: async (input: RescheduleAppointmentInput) => ({
        id: input.appointmentId,
        title: null,
        date: input.date,
        startTime: input.startTime,
        endTime: "11:00",
        duration: service.duration,
        customerId: null,
        customer: null,
        services: [],
        price: null,
        totalPriceType: "NONE" as const,
        comments: null,
        status: "CONFIRMED",
        serviceId: null,
        serviceIds: [],
        serviceName: null,
        customerName: null,
      }),
      previewAppointmentSeries: async (input: PreviewAppointmentSeriesInput) =>
        input.serviceIds.map(() => ({
          index: 0,
          requestedDate: input.firstDate,
          date: input.firstDate,
          startTime: input.firstStartTime,
          endTime: "11:00",
          adjusted: false,
          holdId: null,
          unavailable: false,
        })),
      confirmAppointmentSeries: async (_input: ConfirmAppointmentSeriesInput) => [],
    };
    return new AssistantToolRegistry(prisma, agenda);
  }

  it("releases A's hold when B is proposed, and confirming B does not leave A occupied", async () => {
    const registry = buildRegistry();

    const proposedA = await registry.execute(
      {
        id: "call-prepare-a",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: "2026-07-01",
          startTime: "10:00",
          customerName: "Thais",
        },
      },
      context("turn-1"),
    );
    expect(proposedA.ok).toBe(true);
    const holdA = (
      proposedA as unknown as { data: { hold: { id: string } } }
    ).data.hold.id;

    // Ainda ocupado: nada além de propor A aconteceu.
    expect((await holdRow(holdA))?.releasedAt).toBeNull();

    const proposedB = await registry.execute(
      {
        id: "call-prepare-b",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: "2026-07-02",
          startTime: "14:00",
          customerName: "Thais",
        },
      },
      context("turn-2"),
    );
    expect(proposedB.ok).toBe(true);
    const holdB = (
      proposedB as unknown as { data: { hold: { id: string } } }
    ).data.hold.id;
    expect(holdB).not.toBe(holdA);

    // Propor B liberou A no banco do Scheduling.
    expect((await holdRow(holdA))?.releasedAt).not.toBeNull();
    // B, recém-criado, segue livre.
    expect((await holdRow(holdB))?.releasedAt).toBeNull();

    const confirmed = await registry.execute(
      {
        id: "call-confirm-b",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context("turn-3"),
    );
    expect(confirmed.ok).toBe(true);

    // Confirmar B não reocupa A: continua liberado no banco.
    expect((await holdRow(holdA))?.releasedAt).not.toBeNull();
  });

  it("releases the hold when the schedule draft is discarded for a different intention", async () => {
    const existingAppointmentId = "appointment-other-1";
    const registry = buildRegistry([
      {
        id: existingAppointmentId,
        title: null,
        date: "2026-07-05",
        startTime: "16:00",
        endTime: "17:00",
        duration: service.duration,
        customerId: null,
        customer: null,
        services: [],
        price: null,
        totalPriceType: "NONE" as const,
        comments: null,
        status: "CONFIRMED",
        serviceId: service.id,
        serviceIds: [service.id],
        serviceName: service.name,
        customerName: "Thais",
      },
    ]);

    const proposed = await registry.execute(
      {
        id: "call-prepare-discard",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: "2026-07-03",
          startTime: "09:00",
          customerName: "Thais",
        },
      },
      context("turn-1"),
    );
    expect(proposed.ok).toBe(true);
    const hold = (
      proposed as unknown as { data: { hold: { id: string } } }
    ).data.hold.id;
    expect((await holdRow(hold))?.releasedAt).toBeNull();

    // A cliente desiste do agendamento e pede para cancelar outro atendimento
    // em vez disso: o rascunho de agendamento é substituído por um
    // pendingAction de cancelamento, que não segura hold nenhum.
    const discarded = await registry.execute(
      {
        id: "call-prepare-cancel-instead",
        name: "cancel_appointment",
        args: { action: "prepare", appointmentId: existingAppointmentId },
      },
      context("turn-2"),
    );
    expect(discarded.ok).toBe(true);

    expect((await holdRow(hold))?.releasedAt).not.toBeNull();
  });
});
