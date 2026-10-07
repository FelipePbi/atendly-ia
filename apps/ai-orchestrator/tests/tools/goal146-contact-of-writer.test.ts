/**
 * Goal146 — o contato guarda quem escreve e a última pessoa agendada.
 *
 * Maria e João usam o número da conversa. Pedro é dependente confirmado de
 * Maria e não tem telefone. Ao confirmar, `Contact.lastScheduledCustomerId`
 * recebe a pessoa agendada (mesmo Pedro) e `Contact.customerId` recebe quem
 * escreve: o candidato do telefone, ou o responsável do dependente. A pessoa
 * provável de `create_appointment` lê a última pessoa agendada.
 */
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { SchedulingGateway } from "../../src/modules/scheduling-service/client.js";
import type {
  CreateSchedulingHoldInput,
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingCustomerCandidate,
  SchedulingCustomerDependent,
  SchedulingServiceDefinition,
} from "../../src/modules/scheduling-service/types.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import {
  AssistantToolRegistry,
  LAST_BOOKED_FOR_DEPENDENT,
} from "../../src/modules/tools/assistant-tools.js";

const conversationId = "conversation-146";
const firstTurn = "channel-1:message-1";
const nextTurn = "channel-1:message-2";
const phone = "5551999990146";

const service: SchedulingServiceDefinition = {
  id: "service-146",
  name: "Corte infantil",
  duration: 30,
  priceType: "FIXED",
  price: 50,
  colorId: null,
  recurrenceIntervalDays: 7,
};
const slot = { date: "2026-10-20", startTime: "10:00", endTime: "10:30" };

const maria: SchedulingCustomerCandidate = {
  id: "cust-maria",
  name: "Maria",
  phone,
};
const joao: SchedulingCustomerCandidate = {
  id: "cust-joao",
  name: "João",
  phone,
};
const pedro: SchedulingCustomerDependent = {
  id: "cust-pedro",
  name: "Pedro",
  phone: null,
  guardian: { id: maria.id, name: maria.name },
};

function appointmentFor(
  id: string,
  customer: { id: string; name: string | null; phone: string | null },
): SchedulingAppointment {
  return {
    id,
    title: null,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    duration: service.duration,
    customerId: customer.id,
    customer,
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
    customerName: customer.name,
  };
}

function context(turnId = firstTurn) {
  return {
    turnId,
    conversationId,
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    phone,
    customerName: "Maria",
    businessContext: {
      ...DEFAULT_BUSINESS_CONTEXT,
      businessName: "Salao Goal146",
      configured: true,
    },
    aiRunId: "ai-run-146",
  };
}

function availabilityLookup() {
  return {
    service: {
      id: service.id,
      name: service.name,
      duration: service.duration,
      priceType: service.priceType,
      price: service.price,
    },
    slots: [slot],
    checkedAt: "2026-10-07T12:00:00.000Z",
  };
}

/**
 * Agenda falsa da casa. `afterCreate` troca a leitura dos candidatos depois de
 * `createAppointment`: a pessoa nova passa a existir no telefone, ou a
 * leitura passa a falhar.
 */
function createAgenda(
  input: {
    candidates?: SchedulingCustomerCandidate[];
    dependents?: SchedulingCustomerDependent[];
    afterCreate?: { candidates?: SchedulingCustomerCandidate[]; fail?: true };
  } = {},
) {
  let candidates = input.candidates ?? [maria];
  const dependents = input.dependents ?? [pedro];
  let failReads = false;
  const calls = {
    createAppointment: [] as ScheduleAppointmentInput[],
    confirmAppointmentSeries: [] as Array<{ customerId?: string }>,
  };
  const gateway = {
    listActiveServices: async () => [service],
    findService: async () => service,
    getAvailableSlotsForServices: async () => [slot],
    findCustomerCandidatesByPhone: async () => {
      if (failReads) throw new Error("scheduling indisponivel");
      return candidates;
    },
    findCustomerDependentsByPhone: async () => {
      if (failReads) throw new Error("scheduling indisponivel");
      return dependents;
    },
    createHold: async (holdInput: CreateSchedulingHoldInput) => ({
      id: "hold-1",
      date: holdInput.date,
      startTime: holdInput.startTime,
      endTime: slot.endTime,
      duration: service.duration,
      serviceIds: holdInput.serviceIds,
      expiresAt: "2026-10-07T12:15:00.000Z",
      status: "ACTIVE" as const,
    }),
    createAppointment: async (appointmentInput: ScheduleAppointmentInput) => {
      calls.createAppointment.push(appointmentInput);
      if (input.afterCreate?.candidates) {
        candidates = input.afterCreate.candidates;
      }
      if (input.afterCreate?.fail) failReads = true;
      const id = appointmentInput.customerId ?? "cust-new";
      return appointmentFor("appt-new", { id, name: null, phone });
    },
    previewAppointmentSeries: async (seriesInput: {
      occurrenceCount: number;
      firstStartTime: string;
    }) =>
      Array.from({ length: seriesInput.occurrenceCount }, (_, index) => ({
        index,
        requestedDate: slot.date,
        date: slot.date,
        startTime: seriesInput.firstStartTime,
        endTime: slot.endTime,
        adjusted: false,
        holdId: `hold-series-${index}`,
        unavailable: false,
      })),
    confirmAppointmentSeries: async (seriesInput: { customerId?: string }) => {
      calls.confirmAppointmentSeries.push(seriesInput);
      return [appointmentFor("appt-series", pedro)];
    },
    getCustomerChangePolicy: async () => ({ minNoticeMinutes: 0 }),
  };
  return { gateway: gateway as unknown as SchedulingGateway, calls };
}

type ContactRow = {
  customerId: string | null;
  lastScheduledCustomerId: string | null;
};
type ContactWrite = {
  where: Record<string, unknown>;
  data: {
    customerId?: string;
    customerLinkedAt?: Date;
    lastScheduledCustomerId?: string;
    lastScheduledAt?: Date;
  };
};

/** Contato falso que aplica o que `updateMany` grava. */
function createPrisma(initial: Partial<ContactRow> = {}) {
  const store = {
    state: { availabilityLookups: [availabilityLookup()] } as Record<
      string,
      unknown
    >,
    contact: {
      customerId: null,
      lastScheduledCustomerId: null,
      ...initial,
    },
    writes: [] as ContactWrite[],
  };
  const prisma = {
    contact: {
      findUnique: async () => ({ ...store.contact }),
      updateMany: async (args: ContactWrite) => {
        store.writes.push(args);
        Object.assign(store.contact, {
          ...(args.data.customerId ? { customerId: args.data.customerId } : {}),
          ...(args.data.lastScheduledCustomerId
            ? { lastScheduledCustomerId: args.data.lastScheduledCustomerId }
            : {}),
        });
        return { count: 1 };
      },
    },
    conversation: {
      findUnique: async () => ({ id: conversationId, state: store.state }),
      update: async (args: { data: { state?: Record<string, unknown> } }) => {
        if (args.data.state) store.state = args.data.state;
        return { id: conversationId, state: store.state };
      },
    },
  } as unknown as PrismaClient;
  return { prisma, store };
}

function prepareArgs(extra: Record<string, unknown> = {}) {
  return {
    action: "prepare",
    serviceId: service.id,
    date: slot.date,
    startTime: slot.startTime,
    customerName: "Maria",
    ...extra,
  };
}

async function bookFor(
  registry: AssistantToolRegistry,
  extra: Record<string, unknown>,
) {
  await registry.execute(
    { id: "call-prepare", name: "create_appointment", args: prepareArgs(extra) },
    context(firstTurn),
  );
  return registry.execute(
    {
      id: "call-confirm",
      name: "create_appointment",
      args: { action: "confirm" },
    },
    context(nextTurn),
  );
}

async function confirmSeriesFor(
  registry: AssistantToolRegistry,
  extra: Record<string, unknown>,
) {
  await registry.execute(
    {
      id: "call-prepare-series",
      name: "prepare_recurring_appointments",
      args: {
        serviceId: service.id,
        occurrenceCount: 3,
        intervalDays: 7,
        firstDate: slot.date,
        firstStartTime: slot.startTime,
        ...extra,
      },
    },
    context(firstTurn),
  );
  return registry.execute(
    {
      id: "call-confirm-series",
      name: "confirm_recurring_appointments",
      args: {
        serviceId: service.id,
        holdIds: ["hold-series-0", "hold-series-1", "hold-series-2"],
        intervalDays: 7,
      },
    },
    context(nextTurn),
  );
}

describe("Goal146 — gravação do contato na confirmação", () => {
  it("confirmar para Pedro: customerId = Maria e lastScheduledCustomerId = Pedro num só updateMany", async () => {
    const { prisma, store } = createPrisma();
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    await bookFor(registry, { customerName: "Pedro", customerId: pedro.id });

    expect(calls.createAppointment[0].customerId).toBe(pedro.id);
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].where).toEqual({
      tenantId: "tenant-1",
      channelId: "channel-1",
      externalContactId: phone,
    });
    expect(store.writes[0].data).toMatchObject({
      customerId: maria.id,
      lastScheduledCustomerId: pedro.id,
    });
    expect(store.writes[0].data.customerLinkedAt).toBeInstanceOf(Date);
    expect(store.writes[0].data.lastScheduledAt).toBeInstanceOf(Date);
  });

  it("confirmar para a Maria grava as duas colunas com a Maria", async () => {
    const { prisma, store } = createPrisma();
    const { gateway } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    await bookFor(registry, { customerId: maria.id });

    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].data).toMatchObject({
      customerId: maria.id,
      lastScheduledCustomerId: maria.id,
    });
  });

  it("confirmar para o João, outro candidato do telefone, vincula o João", async () => {
    const { prisma, store } = createPrisma({ customerId: maria.id });
    const { gateway } = createAgenda({ candidates: [maria, joao] });
    const registry = new AssistantToolRegistry(prisma, gateway);

    await bookFor(registry, { customerName: "João", customerId: joao.id });

    expect(store.writes[0].data).toMatchObject({
      customerId: joao.id,
      lastScheduledCustomerId: joao.id,
    });
  });

  it("pessoa criada na confirmação, devolvida como candidata na leitura seguinte, vira o vínculo", async () => {
    const created: SchedulingCustomerCandidate = {
      id: "cust-new",
      name: "Thais",
      phone,
    };
    const { prisma, store } = createPrisma();
    const { gateway, calls } = createAgenda({
      candidates: [],
      dependents: [],
      afterCreate: { candidates: [created] },
    });
    const registry = new AssistantToolRegistry(prisma, gateway);

    await bookFor(registry, { customerName: "Thais" });

    expect(calls.createAppointment[0].customerId).toBeNull();
    expect(store.writes[0].data).toMatchObject({
      customerId: created.id,
      lastScheduledCustomerId: created.id,
    });
  });

  it("vínculo antigo no Pedro volta para a Maria na próxima confirmação para o Pedro", async () => {
    const { prisma, store } = createPrisma({
      customerId: pedro.id,
      lastScheduledCustomerId: maria.id,
    });
    const { gateway } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    await bookFor(registry, { customerName: "Pedro", customerId: pedro.id });

    expect(store.contact).toEqual({
      customerId: maria.id,
      lastScheduledCustomerId: pedro.id,
    });
  });

  it("leitura dos candidatos falha depois de createAppointment: mesmo sucesso, só lastScheduled* gravado", async () => {
    const { prisma, store } = createPrisma({ customerId: maria.id });
    const { gateway } = createAgenda({ afterCreate: { fail: true } });
    const registry = new AssistantToolRegistry(prisma, gateway);

    const confirmed = await bookFor(registry, {
      customerName: "Pedro",
      customerId: pedro.id,
    });

    expect(confirmed).toMatchObject({
      ok: true,
      data: { appointment: { id: "appt-new" } },
    });
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].data.lastScheduledCustomerId).toBe(pedro.id);
    expect(store.writes[0].data.lastScheduledAt).toBeInstanceOf(Date);
    expect(store.writes[0].data).not.toHaveProperty("customerId");
    expect(store.writes[0].data).not.toHaveProperty("customerLinkedAt");
    expect(store.contact.customerId).toBe(maria.id);
  });

  it("série confirmada para o Pedro grava lastScheduledCustomerId = Pedro e customerId = Maria", async () => {
    const { prisma, store } = createPrisma({ customerId: pedro.id });
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const confirmed = await confirmSeriesFor(registry, {
      customerId: pedro.id,
    });

    expect(confirmed).toMatchObject({ ok: true });
    expect(calls.confirmAppointmentSeries[0].customerId).toBe(pedro.id);
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].data).toMatchObject({
      customerId: maria.id,
      lastScheduledCustomerId: pedro.id,
    });
  });

  it("série sem pessoa conhecida não grava o contato", async () => {
    const { prisma, store } = createPrisma();
    const { gateway } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const confirmed = await confirmSeriesFor(registry, {});

    expect(confirmed).toMatchObject({ ok: true });
    expect(store.writes).toHaveLength(0);
  });
});

describe("Goal146 — pessoa provável pela última pessoa agendada", () => {
  it("customerId = Maria e lastScheduledCustomerId = Pedro: propõe o Pedro com LAST_BOOKED_FOR_DEPENDENT", async () => {
    const { prisma } = createPrisma({
      customerId: maria.id,
      lastScheduledCustomerId: pedro.id,
    });
    const { gateway } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      { id: "call-prepare", name: "create_appointment", args: prepareArgs() },
      context(),
    );

    expect(prepared).toMatchObject({
      ok: true,
      data: {
        customerIdentity: {
          customerId: null,
          proposedCustomerId: pedro.id,
          requiresConfirmation: true,
          reason: LAST_BOOKED_FOR_DEPENDENT,
        },
      },
    });
  });

  it("dado antigo, customerId = Pedro e lastScheduledCustomerId = Maria: não propõe o Pedro", async () => {
    const { prisma } = createPrisma({
      customerId: pedro.id,
      lastScheduledCustomerId: maria.id,
    });
    const { gateway } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      { id: "call-prepare", name: "create_appointment", args: prepareArgs() },
      context(),
    );

    expect(prepared).toMatchObject({
      ok: true,
      data: {
        customerIdentity: { customerId: null, proposedCustomerId: maria.id },
      },
    });
    expect(prepared).not.toMatchObject({
      data: { customerIdentity: { reason: LAST_BOOKED_FOR_DEPENDENT } },
    });
  });
});
