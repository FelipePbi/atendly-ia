/**
 * Goal143 — a IA só usa as pessoas do número que escreve.
 *
 * Maria usa o número da conversa e é responsável confirmada de Pedro, que não
 * tem telefone. Ana é do tenant, mas não é do número. Todo `customerId` que o
 * modelo escreve numa tool precisa ser de Maria ou de Pedro; fora disso a
 * tool recusa antes de ler a pessoa ou de criar qualquer efeito, e a série
 * recorrente é confirmada para a pessoa que foi preparada.
 */
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { SchedulingGateway } from "../../src/modules/scheduling-service/client.js";
import type {
  CreateSchedulingHoldInput,
  FindAppointmentsForPhoneOptions,
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingCustomerCandidate,
  SchedulingCustomerDependent,
  SchedulingServiceDefinition,
} from "../../src/modules/scheduling-service/types.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import {
  AssistantToolRegistry,
  CONFIRMATION_WITHOUT_DRAFT,
  CUSTOMER_NOT_OF_THIS_NUMBER,
  RECURRING_CUSTOMER_MISMATCH,
} from "../../src/modules/tools/assistant-tools.js";

const conversationId = "conversation-143";
const firstTurn = "channel-1:message-1";
const nextTurn = "channel-1:message-2";
const phone = "5551999990143";

const service: SchedulingServiceDefinition = {
  id: "service-143",
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
const pedro: SchedulingCustomerDependent = {
  id: "cust-pedro",
  name: "Pedro",
  phone: null,
  guardian: { id: maria.id, name: maria.name },
};
/** Do tenant, mas de fora do número. */
const ana = { id: "cust-ana", name: "Ana", phone: "5551888880000" };

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

const mariaAppointment = appointmentFor("appt-maria", maria);
const pedroAppointment = appointmentFor("appt-pedro", pedro);
const anaAppointment = appointmentFor("appt-ana", ana);

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
      businessName: "Salao Goal143",
      configured: true,
    },
    aiRunId: "ai-run-143",
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
 * Agenda falsa da casa. O tenant conhece Ana; o número só tem os candidatos e
 * os dependentes que o teste entrega.
 */
function createAgenda(
  input: {
    candidates?: SchedulingCustomerCandidate[];
    dependents?: SchedulingCustomerDependent[];
  } = {},
) {
  const candidates = input.candidates ?? [maria];
  const dependents = input.dependents ?? [pedro];
  const calls = {
    findCustomerCandidatesByPhone: [] as string[],
    findCustomerDependentsByPhone: [] as string[],
    getAuthorizedCustomerContext: [] as string[],
    findFutureAppointmentsForPhone: [] as Array<{
      options: FindAppointmentsForPhoneOptions | undefined;
    }>,
    findFutureAppointmentsForCustomer: [] as string[],
    createHold: [] as CreateSchedulingHoldInput[],
    createAppointment: [] as ScheduleAppointmentInput[],
    previewAppointmentSeries: [] as Array<{ customerId?: string }>,
    confirmAppointmentSeries: [] as Array<{ customerId?: string }>,
  };
  const gateway = {
    listActiveServices: async () => [service],
    findService: async () => service,
    getAvailableSlotsForServices: async () => [slot],
    findCustomerCandidatesByPhone: async (value: string) => {
      calls.findCustomerCandidatesByPhone.push(value);
      return candidates;
    },
    findCustomerDependentsByPhone: async (value: string) => {
      calls.findCustomerDependentsByPhone.push(value);
      return dependents;
    },
    getAuthorizedCustomerContext: async (customerId: string) => {
      calls.getAuthorizedCustomerContext.push(customerId);
      return { id: customerId, notes: ["Prefere corte curto"], tags: ["fiel"] };
    },
    findFutureAppointmentsForPhone: async (
      _value: string,
      _businessContext: unknown,
      _context: unknown,
      options?: FindAppointmentsForPhoneOptions,
    ) => {
      calls.findFutureAppointmentsForPhone.push({ options });
      const withPedro =
        options?.includeDependents === true &&
        dependents.some((item) => item.id === pedro.id);
      return withPedro
        ? [mariaAppointment, pedroAppointment]
        : [mariaAppointment];
    },
    findFutureAppointmentsForCustomer: async (customerId: string) => {
      calls.findFutureAppointmentsForCustomer.push(customerId);
      return [mariaAppointment, pedroAppointment, anaAppointment].filter(
        (appointment) => appointment.customerId === customerId,
      );
    },
    createHold: async (holdInput: CreateSchedulingHoldInput) => {
      calls.createHold.push(holdInput);
      return {
        id: `hold-${calls.createHold.length}`,
        date: holdInput.date,
        startTime: holdInput.startTime,
        endTime: slot.endTime,
        duration: service.duration,
        serviceIds: holdInput.serviceIds,
        expiresAt: "2026-10-07T12:15:00.000Z",
        status: "ACTIVE" as const,
      };
    },
    releaseHold: async (id: string) => ({
      id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      duration: service.duration,
      serviceIds: [service.id],
      expiresAt: "2026-10-07T12:15:00.000Z",
      status: "RELEASED" as const,
    }),
    createAppointment: async (appointmentInput: ScheduleAppointmentInput) => {
      calls.createAppointment.push(appointmentInput);
      const id = appointmentInput.customerId ?? "cust-new";
      return appointmentFor("appt-new", { id, name: null, phone });
    },
    previewAppointmentSeries: async (seriesInput: {
      occurrenceCount: number;
      firstStartTime: string;
      customerId?: string;
    }) => {
      calls.previewAppointmentSeries.push(seriesInput);
      return Array.from({ length: seriesInput.occurrenceCount }, (_, index) => ({
        index,
        requestedDate: slot.date,
        date: slot.date,
        startTime: seriesInput.firstStartTime,
        endTime: slot.endTime,
        adjusted: false,
        holdId: `hold-series-${index}`,
        unavailable: false,
      }));
    },
    confirmAppointmentSeries: async (seriesInput: { customerId?: string }) => {
      calls.confirmAppointmentSeries.push(seriesInput);
      return [mariaAppointment];
    },
    getCustomerChangePolicy: async () => ({ minNoticeMinutes: 0 }),
  };
  return { gateway: gateway as unknown as SchedulingGateway, calls };
}

/** `Contact.customerId` é o vínculo: a última pessoa atendida pelo número. */
function createPrisma(linkedCustomerId: string | null = null) {
  const store = {
    state: { availabilityLookups: [availabilityLookup()] } as Record<
      string,
      unknown
    >,
    contactLinks: [] as Array<{ data: { customerId: string } }>,
  };
  const prisma = {
    contact: {
      findUnique: async () =>
        linkedCustomerId ? { customerId: linkedCustomerId } : null,
      updateMany: async (args: { data: { customerId: string } }) => {
        store.contactLinks.push(args);
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

function seriesArgs(extra: Record<string, unknown> = {}) {
  return {
    serviceId: service.id,
    occurrenceCount: 3,
    intervalDays: 7,
    firstDate: slot.date,
    firstStartTime: slot.startTime,
    ...extra,
  };
}

function confirmSeriesArgs(extra: Record<string, unknown> = {}) {
  return {
    serviceId: service.id,
    holdIds: ["hold-series-0", "hold-series-1", "hold-series-2"],
    intervalDays: 7,
    ...extra,
  };
}

const notOfNumber = (candidateIds: string[]) => ({
  ok: false,
  error: {
    code: CUSTOMER_NOT_OF_THIS_NUMBER,
    details: {
      candidates: candidateIds.map((customerId) => ({ customerId })),
    },
  },
});

describe("Goal143 — get_customer_context só das pessoas do número", () => {
  const callContext = {
    id: "call-context",
    name: "get_customer_context",
  };

  for (const mode of ["execute", "executeReadOnly"] as const) {
    describe(mode, () => {
      it("candidato do telefone e dependente confirmado respondem como hoje", async () => {
        const { prisma } = createPrisma();
        const { gateway, calls } = createAgenda();
        const registry = new AssistantToolRegistry(prisma, gateway);

        for (const person of [maria, pedro]) {
          const result = await registry[mode](
            { ...callContext, args: { customerId: person.id } },
            context(),
          );
          expect(result).toMatchObject({
            ok: true,
            data: { id: person.id, tags: ["fiel"] },
          });
        }
        expect(calls.getAuthorizedCustomerContext).toEqual([
          maria.id,
          pedro.id,
        ]);
      });

      it("pessoa de fora do número é recusada sem ler a pessoa no Scheduling", async () => {
        const { prisma } = createPrisma();
        const { gateway, calls } = createAgenda();
        const registry = new AssistantToolRegistry(prisma, gateway);

        const result = await registry[mode](
          { ...callContext, args: { customerId: ana.id } },
          context(),
        );

        expect(result).toMatchObject(notOfNumber([maria.id, pedro.id]));
        expect(calls.getAuthorizedCustomerContext).toEqual([]);
      });

      it("dependente com a relação removida é recusado sem ler a pessoa no Scheduling", async () => {
        const { prisma } = createPrisma();
        const { gateway, calls } = createAgenda({ dependents: [] });
        const registry = new AssistantToolRegistry(prisma, gateway);

        const result = await registry[mode](
          { ...callContext, args: { customerId: pedro.id } },
          context(),
        );

        expect(result).toMatchObject(notOfNumber([maria.id]));
        expect(calls.getAuthorizedCustomerContext).toEqual([]);
      });
    });
  }
});

describe("Goal143 — create_appointment prepare só com pessoa do número", () => {
  it("customerId de fora: recusa, sem hold, rascunho igual e o confirm não agenda nem vincula essa pessoa", async () => {
    const { prisma, store } = createPrisma();
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const first = await registry.execute(
      { id: "call-1", name: "create_appointment", args: prepareArgs() },
      context(firstTurn),
    );
    expect(first).toMatchObject({ ok: true });
    const draftBefore = structuredClone(store.state.pendingAction);
    const holdsBefore = calls.createHold.length;

    const refused = await registry.execute(
      {
        id: "call-2",
        name: "create_appointment",
        args: prepareArgs({ customerId: ana.id }),
      },
      context(nextTurn),
    );

    expect(refused).toMatchObject(notOfNumber([maria.id, pedro.id]));
    expect(calls.createHold).toHaveLength(holdsBefore);
    expect(store.state.pendingAction).toEqual(draftBefore);

    const confirmed = await registry.execute(
      { id: "call-3", name: "create_appointment", args: { action: "confirm" } },
      context("channel-1:message-3"),
    );
    expect(confirmed).toMatchObject({ ok: true });
    expect(calls.createAppointment).toHaveLength(1);
    expect(calls.createAppointment[0].customerId).toBe(maria.id);
    expect(
      store.contactLinks.some((link) => link.data.customerId === ana.id),
    ).toBe(false);
  });

  it("customerId de fora sem rascunho: recusa, nenhum rascunho e o confirm seguinte não tem o que agendar", async () => {
    const { prisma, store } = createPrisma();
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const refused = await registry.execute(
      {
        id: "call-1",
        name: "create_appointment",
        args: prepareArgs({ customerId: ana.id }),
      },
      context(firstTurn),
    );
    expect(refused).toMatchObject(notOfNumber([maria.id, pedro.id]));
    expect(calls.createHold).toHaveLength(0);
    expect(store.state.pendingAction).toBeUndefined();

    const confirmed = await registry.execute(
      { id: "call-2", name: "create_appointment", args: { action: "confirm" } },
      context(nextTurn),
    );
    expect(confirmed).toMatchObject({
      ok: false,
      error: { code: CONFIRMATION_WITHOUT_DRAFT },
    });
    expect(calls.createAppointment).toHaveLength(0);
    expect(store.contactLinks).toHaveLength(0);
  });

  it("dependente confirmado: agenda para ele, como no 142, com uma leitura dos candidatos por prepare", async () => {
    const { prisma, store } = createPrisma();
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      {
        id: "call-1",
        name: "create_appointment",
        args: prepareArgs({ customerId: pedro.id }),
      },
      context(firstTurn),
    );
    expect(prepared).toMatchObject({
      ok: true,
      data: { customerIdentity: { customerId: pedro.id } },
    });
    expect(calls.findCustomerCandidatesByPhone).toHaveLength(1);
    expect(calls.findCustomerDependentsByPhone).toHaveLength(1);
    expect(calls.createHold[0].customerId).toBe(pedro.id);

    await registry.execute(
      { id: "call-2", name: "create_appointment", args: { action: "confirm" } },
      context(nextTurn),
    );
    expect(calls.createAppointment[0].customerId).toBe(pedro.id);
    expect(store.contactLinks[0]?.data.customerId).toBe(pedro.id);
  });

  it("sem customerId: igual a hoje, uma leitura dos candidatos por prepare", async () => {
    const { prisma } = createPrisma();
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      { id: "call-1", name: "create_appointment", args: prepareArgs() },
      context(firstTurn),
    );

    expect(prepared).toMatchObject({
      ok: true,
      data: {
        customerIdentity: { customerId: null, proposedCustomerId: maria.id },
      },
    });
    expect(calls.findCustomerCandidatesByPhone).toHaveLength(1);
    expect(calls.findCustomerDependentsByPhone).toHaveLength(1);
  });
});

describe("Goal143 — a série recorrente é da pessoa preparada", () => {
  it("prepare com customerId de fora: recusa e nenhum previewAppointmentSeries", async () => {
    const { prisma, store } = createPrisma();
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const refused = await registry.execute(
      {
        id: "call-1",
        name: "prepare_recurring_appointments",
        args: seriesArgs({ customerId: ana.id }),
      },
      context(firstTurn),
    );

    expect(refused).toMatchObject(notOfNumber([maria.id, pedro.id]));
    expect(calls.previewAppointmentSeries).toHaveLength(0);
    expect(store.state.pendingAction).toBeUndefined();
  });

  it("prepare com candidato: o rascunho guarda o customerId; sem customerId guarda null", async () => {
    const withPedro = createPrisma();
    const agendaWithPedro = createAgenda();
    await new AssistantToolRegistry(
      withPedro.prisma,
      agendaWithPedro.gateway,
    ).execute(
      {
        id: "call-1",
        name: "prepare_recurring_appointments",
        args: seriesArgs({ customerId: pedro.id }),
      },
      context(firstTurn),
    );
    expect(withPedro.store.state.pendingAction).toMatchObject({
      type: "recurring",
      customerId: pedro.id,
    });
    expect(agendaWithPedro.calls.previewAppointmentSeries[0].customerId).toBe(
      pedro.id,
    );

    const without = createPrisma();
    await new AssistantToolRegistry(
      without.prisma,
      createAgenda().gateway,
    ).execute(
      {
        id: "call-2",
        name: "prepare_recurring_appointments",
        args: seriesArgs(),
      },
      context(firstTurn),
    );
    expect(without.store.state.pendingAction).toMatchObject({
      type: "recurring",
      customerId: null,
    });
  });

  it("confirm com customerId diferente do rascunho: recusa e nenhum confirmAppointmentSeries", async () => {
    const { prisma } = createPrisma();
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);
    await registry.execute(
      {
        id: "call-1",
        name: "prepare_recurring_appointments",
        args: seriesArgs({ customerId: pedro.id }),
      },
      context(firstTurn),
    );

    const refused = await registry.execute(
      {
        id: "call-2",
        name: "confirm_recurring_appointments",
        args: confirmSeriesArgs({ customerId: maria.id }),
      },
      context(nextTurn),
    );

    expect(refused).toMatchObject({
      ok: false,
      error: { code: RECURRING_CUSTOMER_MISMATCH },
    });
    expect(calls.confirmAppointmentSeries).toHaveLength(0);
  });

  it("confirm sem customerId confirma com o do rascunho; repetir o do rascunho também", async () => {
    for (const confirmExtra of [{}, { customerId: pedro.id }]) {
      const { prisma } = createPrisma();
      const { gateway, calls } = createAgenda();
      const registry = new AssistantToolRegistry(prisma, gateway);
      await registry.execute(
        {
          id: "call-1",
          name: "prepare_recurring_appointments",
          args: seriesArgs({ customerId: pedro.id }),
        },
        context(firstTurn),
      );

      const confirmed = await registry.execute(
        {
          id: "call-2",
          name: "confirm_recurring_appointments",
          args: confirmSeriesArgs(confirmExtra),
        },
        context(nextTurn),
      );

      expect(confirmed).toMatchObject({ ok: true });
      expect(calls.confirmAppointmentSeries).toHaveLength(1);
      expect(calls.confirmAppointmentSeries[0].customerId).toBe(pedro.id);
    }
  });

  it("rascunho antigo, sem o campo, com customerId de fora: recusa; com candidato, confirma", async () => {
    const legacyDraft = {
      type: "recurring",
      holdIds: ["hold-series-0", "hold-series-1", "hold-series-2"],
      serviceIds: [service.id],
      intervalDays: 7,
      idempotencyKey: "legacy-key",
      preparedInTurnId: firstTurn,
    };

    const outsider = createPrisma();
    outsider.store.state.pendingAction = structuredClone(legacyDraft);
    const outsiderAgenda = createAgenda();
    const refused = await new AssistantToolRegistry(
      outsider.prisma,
      outsiderAgenda.gateway,
    ).execute(
      {
        id: "call-1",
        name: "confirm_recurring_appointments",
        args: confirmSeriesArgs({ customerId: ana.id }),
      },
      context(nextTurn),
    );
    expect(refused).toMatchObject(notOfNumber([maria.id, pedro.id]));
    expect(outsiderAgenda.calls.confirmAppointmentSeries).toHaveLength(0);

    const candidate = createPrisma();
    candidate.store.state.pendingAction = structuredClone(legacyDraft);
    const candidateAgenda = createAgenda();
    const confirmed = await new AssistantToolRegistry(
      candidate.prisma,
      candidateAgenda.gateway,
    ).execute(
      {
        id: "call-2",
        name: "confirm_recurring_appointments",
        args: confirmSeriesArgs({ customerId: pedro.id }),
      },
      context(nextTurn),
    );
    expect(confirmed).toMatchObject({ ok: true });
    expect(candidateAgenda.calls.confirmAppointmentSeries[0].customerId).toBe(
      pedro.id,
    );
  });
});

describe("Goal143 — list_customer_appointments só usa o vínculo de pessoa do número", () => {
  const listCall = {
    id: "call-list",
    name: "list_customer_appointments",
    args: {},
  };

  it("contato vinculado a pessoa do número: a lista é a da pessoa vinculada, como hoje", async () => {
    const { prisma } = createPrisma(pedro.id);
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const result = await registry.execute(listCall, context());

    expect(calls.findFutureAppointmentsForCustomer).toEqual([pedro.id]);
    expect(calls.findFutureAppointmentsForPhone).toHaveLength(0);
    expect(result).toMatchObject({
      ok: true,
      data: { appointments: [{ id: pedroAppointment.id }] },
    });
  });

  it("contato vinculado a Ana, que não é do número: a lista é a do número e não traz o horário dela", async () => {
    const { prisma } = createPrisma(ana.id);
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const result = await registry.execute(listCall, context());

    expect(calls.findFutureAppointmentsForCustomer).toEqual([]);
    expect(calls.findFutureAppointmentsForPhone).toEqual([
      { options: { includeDependents: true } },
    ]);
    const ids = (
      result as { data: { appointments: Array<{ id: string }> } }
    ).data.appointments.map((appointment) => appointment.id);
    expect(ids).not.toContain(anaAppointment.id);
    expect(ids).toEqual([mariaAppointment.id, pedroAppointment.id]);
  });

  it("contato vinculado a Pedro depois que a relação foi removida: a lista é a do número, sem o horário dele", async () => {
    const { prisma } = createPrisma(pedro.id);
    const { gateway, calls } = createAgenda({ dependents: [] });
    const registry = new AssistantToolRegistry(prisma, gateway);

    const result = await registry.execute(listCall, context());

    expect(calls.findFutureAppointmentsForCustomer).toEqual([]);
    const ids = (
      result as { data: { appointments: Array<{ id: string }> } }
    ).data.appointments.map((appointment) => appointment.id);
    expect(ids).toEqual([mariaAppointment.id]);
  });
});
