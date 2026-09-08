import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";
import type {
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingServiceDefinition,
} from "../../src/modules/scheduling-service/types.js";

const conversationId = "conversation-1";
const phone = "555591359589";
const service: SchedulingServiceDefinition = {
  id: "5114873",
  name: "Aplicacao 5D",
  duration: 100,
  priceType: "FIXED",
  price: 190,
  colorId: 3,
};
const browService: SchedulingServiceDefinition = {
  id: "5114888",
  name: "Design de sobrancelha",
  duration: 30,
  priceType: "FIXED",
  price: 40,
  colorId: 4,
};
const slot = {
  date: "2026-06-08",
  startTime: "13:30",
  endTime: "15:10",
};
const combinedSlot = {
  date: "2026-06-08",
  startTime: "13:30",
  endTime: "15:40",
};

describe("AssistantToolRegistry scheduling service resolution", () => {
  it("recovers serviceId 0 from the stored availability context when preparing a schedule", async () => {
    const { prisma, store } = createPrismaMock({
      availabilityLookups: [availabilityLookup()],
    });
    const registry = new AssistantToolRegistry(
      prisma,
      createAgendaMock().agenda,
    );

    const result = await registry.execute(
      {
        id: "call-prepare-1",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: null,
          date: slot.date,
          startTime: slot.startTime,
          customerName: "Thais",
        },
      },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: { pendingAction: { serviceId: service.id } },
    });
    expect(store.state.pendingAction).toMatchObject({
      type: "schedule",
      serviceId: service.id,
      date: slot.date,
      startTime: slot.startTime,
    });
  });

  it("does not save a pending schedule when serviceId is invalid and no availability context exists", async () => {
    const { prisma, store } = createPrismaMock({});
    const registry = new AssistantToolRegistry(
      prisma,
      createAgendaMock().agenda,
    );

    const result = await registry.execute(
      {
        id: "call-prepare-invalid",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: null,
          date: slot.date,
          startTime: slot.startTime,
          customerName: "Thais",
        },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "SERVICE_ID_UNRESOLVED" },
    });
    expect(store.state.pendingAction).toBeUndefined();
  });

  it("recovers a legacy pending schedule with serviceId 0 when confirming", async () => {
    const { prisma, store } = createPrismaMock({
      availabilityLookups: [availabilityLookup()],
      pendingAction: {
        type: "schedule",
        serviceId: null,
        date: slot.date,
        startTime: slot.startTime,
        customerName: "Thais",
        customerPhone: phone,
      },
    });
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-confirm-legacy",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: { appointment: { id: "98765" } },
    });
    expect(calls.createAppointment).toHaveLength(1);
    expect(calls.createAppointment[0]).toMatchObject({
      serviceId: service.id,
      date: slot.date,
      startTime: slot.startTime,
    });
    expect(store.state.pendingAction).toBeUndefined();
  });

  it("stores availability context when searching available slots", async () => {
    const { prisma, store } = createPrismaMock({});
    const registry = new AssistantToolRegistry(
      prisma,
      createAgendaMock().agenda,
    );

    const result = await registry.execute(
      {
        id: "call-availability-1",
        name: "get_availability",
        args: {
          serviceId: service.id,
          startDate: slot.date,
        },
      },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { slots: [slot] } });
    expect(store.state.availabilityLookups).toEqual([
      expect.objectContaining({
        service: expect.objectContaining({
          id: service.id,
          name: service.name,
          duration: service.duration,
        }),
        slots: [slot],
      }),
    ]);
  });

  it("stores total duration and price for multi-service availability", async () => {
    const { prisma, store } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-availability-multi",
        name: "get_availability",
        args: {
          serviceIds: [service.id, browService.id],
          startDate: slot.date,
        },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        services: [{ id: service.id }, { id: browService.id }],
        totalDurationMinutes: 130,
        totalPrice: 230,
        slots: [combinedSlot],
      },
    });
    expect(calls.getAvailableSlotsForServices).toEqual([
      [service.id, browService.id],
    ]);
    expect(store.state.availabilityLookups).toEqual([
      expect.objectContaining({
        services: [
          expect.objectContaining({ id: service.id, price: service.price }),
          expect.objectContaining({
            id: browService.id,
            price: browService.price,
          }),
        ],
        totalDurationMinutes: 130,
        totalPrice: 230,
        slots: [combinedSlot],
      }),
    ]);
  });

  it("prepares and confirms one appointment with multiple services", async () => {
    const { prisma, store } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    const prepared = await registry.execute(
      {
        id: "call-prepare-multi",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceIds: [service.id, browService.id],
          date: slot.date,
          startTime: slot.startTime,
          customerName: "Thais",
        },
      },
      context(),
    );

    expect(prepared.ok).toBe(true);
    expect(prepared).toMatchObject({
      data: {
        pendingAction: {
          serviceIds: [service.id, browService.id],
          totalDurationMinutes: 130,
          totalPrice: 230,
          endTime: "15:40",
        },
      },
    });

    const confirmed = await registry.execute(
      {
        id: "call-confirm-multi",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context(),
    );

    expect(confirmed.ok).toBe(true);
    expect(calls.createAppointment[0]).toMatchObject({
      serviceId: service.id,
      serviceIds: [service.id, browService.id],
      date: slot.date,
      startTime: slot.startTime,
    });
    expect(store.state.pendingAction).toBeUndefined();
  });
});

describe("AssistantToolRegistry customer identity", () => {
  const maria = { id: "cust-maria", name: "Maria", phone };
  const pedro = { id: "cust-pedro", name: "Pedro", phone };

  it("asks who the appointment is for when the number has more than one person", async () => {
    const { prisma, store } = createPrismaMock({
      availabilityLookups: [availabilityLookup()],
    });
    const { agenda, calls } = createAgendaMock([maria, pedro]);
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-prepare-ambiguous",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: slot.date,
          startTime: slot.startTime,
          customerName: "Maria",
        },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CUSTOMER_IDENTITY_AMBIGUOUS",
        details: {
          candidates: [{ customerId: maria.id }, { customerId: pedro.id }],
        },
      },
    });
    // Nada foi gravado: a pessoa ainda não foi escolhida.
    expect(store.state.pendingAction).toBeUndefined();
    expect(calls.createAppointment).toHaveLength(0);
  });

  it("proposes the single candidate instead of assuming it, and only resolves it on confirmation", async () => {
    const { prisma, store } = createPrismaMock({
      availabilityLookups: [availabilityLookup()],
    });
    const { agenda, calls } = createAgendaMock([pedro]);
    const registry = new AssistantToolRegistry(prisma, agenda);

    const prepared = await registry.execute(
      {
        id: "call-prepare-single",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: slot.date,
          startTime: slot.startTime,
          customerName: "Pedro",
        },
      },
      context(),
    );

    expect(prepared).toMatchObject({
      ok: true,
      data: {
        pendingAction: { customerId: null, proposedCustomerId: pedro.id },
      },
    });
    expect(calls.createAppointment).toHaveLength(0);

    await registry.execute(
      {
        id: "call-confirm-single",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context(),
    );

    expect(calls.createAppointment[0]).toMatchObject({
      customerId: pedro.id,
      customerName: null,
      customerPhone: null,
    });
    expect(store.contactLinks).toHaveLength(1);
  });

  it("schedules the chosen person when the conversation selects a customerId", async () => {
    const { prisma } = createPrismaMock({
      availabilityLookups: [availabilityLookup()],
    });
    const { agenda, calls } = createAgendaMock([maria, pedro]);
    const registry = new AssistantToolRegistry(prisma, agenda);

    const prepared = await registry.execute(
      {
        id: "call-prepare-chosen",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: slot.date,
          startTime: slot.startTime,
          customerName: "Pedro",
          customerId: pedro.id,
        },
      },
      context(),
    );

    expect(prepared).toMatchObject({
      ok: true,
      data: { pendingAction: { customerId: pedro.id } },
    });

    await registry.execute(
      {
        id: "call-confirm-chosen",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context(),
    );

    expect(calls.createAppointment[0]).toMatchObject({ customerId: pedro.id });
  });

  it("creates nobody when the number has no candidate until the appointment is confirmed", async () => {
    const { prisma } = createPrismaMock({
      availabilityLookups: [availabilityLookup()],
    });
    const { agenda, calls } = createAgendaMock([]);
    const registry = new AssistantToolRegistry(prisma, agenda);

    await registry.execute(
      {
        id: "call-prepare-new",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: slot.date,
          startTime: slot.startTime,
          customerName: "Thais",
        },
      },
      context(),
    );
    expect(calls.createAppointment).toHaveLength(0);

    await registry.execute(
      {
        id: "call-confirm-new",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context(),
    );

    // Sem pessoa resolvida, o cadastro nasce no Scheduling, dentro da
    // transação de confirmação — nunca antes.
    expect(calls.createAppointment[0]).toMatchObject({
      customerId: null,
      customerName: "Thais",
      customerPhone: phone,
    });
  });

  it("lets one contact point to different people over time without merging anything", async () => {
    const { prisma, store } = createPrismaMock({
      availabilityLookups: [availabilityLookup()],
    });
    const { agenda, calls } = createAgendaMock([maria, pedro]);
    const registry = new AssistantToolRegistry(prisma, agenda);

    // Mesmo contato (mesmo número, mesma conversa) agendando primeiro para uma
    // pessoa e depois para outra — a mãe que agenda para o filho e depois para
    // si mesma.
    for (const chosen of [pedro, maria]) {
      await registry.execute(
        {
          id: `call-prepare-${chosen.id}`,
          name: "create_appointment",
          args: {
            action: "prepare",
            serviceId: service.id,
            date: slot.date,
            startTime: slot.startTime,
            customerName: chosen.name,
            customerId: chosen.id,
          },
        },
        context(),
      );
      await registry.execute(
        {
          id: `call-confirm-${chosen.id}`,
          name: "create_appointment",
          args: { action: "confirm" },
        },
        context(),
      );
    }

    expect(calls.createAppointment.map((call) => call.customerId)).toEqual([
      pedro.id,
      maria.id,
    ]);

    // O contato foi reapontado, não duplicado nem fundido: as duas escritas
    // endereçam o mesmo contato e só a pessoa referenciada muda.
    const links = store.contactLinks as Array<{
      where: Record<string, unknown>;
      data: { customerId: string };
    }>;
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.data.customerId)).toEqual([
      pedro.id,
      maria.id,
    ]);
    expect(links[0].where).toEqual(links[1].where);
    expect(links[1].where).toMatchObject({
      tenantId: "tenant-1",
      channelId: "channel-1",
      externalContactId: phone,
    });
  });

  it("checking availability never touches the customer registry", async () => {
    const { prisma } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock([maria]);
    const registry = new AssistantToolRegistry(prisma, agenda);

    await registry.execute(
      {
        id: "call-availability",
        name: "get_availability",
        args: { serviceId: service.id },
      },
      context(),
    );

    expect(calls.createAppointment).toHaveLength(0);
    expect(calls.findCustomerCandidatesByPhone).toHaveLength(0);
  });

  it("only exposes what the record authorised for AI use", async () => {
    const { prisma } = createPrismaMock({});
    const { agenda } = createAgendaMock([maria]);
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-customer-context",
        name: "get_customer_context",
        args: { customerId: maria.id },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { id: maria.id, notes: [], tags: [] },
    });
  });
});

function context() {
  return {
    conversationId,
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    phone,
    customerName: "Thais",
    businessContext: {
      ...DEFAULT_BUSINESS_CONTEXT,
      businessName: "Camili Krauser Beauty",
      configured: true,
    },
    aiRunId: "ai-run-1",
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
    checkedAt: "2026-06-04T03:52:47.348Z",
  };
}

function createAppointment(
  input: ScheduleAppointmentInput,
): SchedulingAppointment {
  const services = [service, browService].filter((item) =>
    (input.serviceIds ?? [input.serviceId]).includes(item.id),
  );
  return {
    id: "98765",
    date: input.date,
    startTime: input.startTime,
    endTime: services.length > 1 ? combinedSlot.endTime : slot.endTime,
    duration: services.reduce((total, item) => total + item.duration, 0),
    // Quando a conversa resolveu a pessoa, o agendamento volta com ela: e o
    // `customerId` da resposta que o Contato passa a referenciar.
    customerId: input.customerId ?? "12345",
    serviceId: input.serviceId,
    serviceIds: services.map((item) => item.id),
    price: services.reduce((total, item) => total + (item.price ?? 0), 0),
    customer: {
      id: input.customerId ?? "12345",
      name: input.customerName ?? "Thais",
      phone,
    },
    services: services.map((item) => ({
      serviceId: item.id,
      name: item.name,
      duration: item.duration,
      priceType: item.priceType,
      price: item.price,
    })),
    comments: null,
    status: "SCHEDULED",
    customerName: "Thais",
    serviceName: services.map((item) => item.name).join(", "),
  };
}

function createAgendaMock(
  candidates: Array<{ id: string; name: string | null; phone: string | null }> = [],
) {
  const calls: {
    createAppointment: ScheduleAppointmentInput[];
    getAvailableSlotsForServices: string[][];
    findCustomerCandidatesByPhone: string[];
  } = {
    createAppointment: [],
    getAvailableSlotsForServices: [],
    findCustomerCandidatesByPhone: [],
  };
  const services = [service, browService];
  const agenda = {
    listActiveServices: async () => services,
    findService: async (serviceId: string) => {
      const found = services.find((item) => item.id === serviceId);
      if (!found) throw new Error("Servico nao encontrado no Minha Agenda.");
      return found;
    },
    getAvailableSlots: async () => [slot],
    getAvailableSlotsForServices: async (serviceIds: string[]) => {
      calls.getAvailableSlotsForServices.push(serviceIds);
      return serviceIds.length > 1 ? [combinedSlot] : [slot];
    },
    createAppointment: async (input: ScheduleAppointmentInput) => {
      calls.createAppointment.push(input);
      return createAppointment(input);
    },
    findFutureAppointmentsForPhone: async () => [],
    findFutureAppointmentsForCustomer: async () => [],
    // Numero sem pessoa cadastrada: o cliente so nasce na confirmacao.
    findCustomerCandidatesByPhone: async (value: string) => {
      calls.findCustomerCandidatesByPhone.push(value);
      return candidates;
    },
    getAuthorizedCustomerContext: async (customerId: string) => ({
      id: customerId,
      name: "Thais",
      phone,
      notes: [],
      tags: [],
      primaryGuardian: null,
    }),
    cancelAppointment: async (appointmentId: string) => ({
      appointmentId,
      cancelled: true as const,
    }),
    rescheduleAppointment: async () =>
      createAppointment({
        date: slot.date,
        startTime: slot.startTime,
        serviceId: service.id,
        customerName: "Thais",
        customerPhone: phone,
      }),
  };

  return { agenda: agenda as never, calls };
}

function createPrismaMock(initialState: Record<string, unknown>) {
  const store = {
    state: { ...initialState },
    externalAppointments: [] as unknown[],
    customerLinks: [] as unknown[],
    contactLinks: [] as unknown[],
  };
  const prisma = {
    conversation: {
      findUnique: async () => ({
        id: conversationId,
        state: store.state,
      }),
      update: async (args: { data: { state?: Record<string, unknown> } }) => {
        if (args.data.state) store.state = args.data.state;
        return { id: conversationId, state: store.state };
      },
    },
    customerLink: {
      upsert: async (args: unknown) => {
        store.customerLinks.push(args);
        return args;
      },
    },
    externalAppointment: {
      upsert: async (args: unknown) => {
        store.externalAppointments.push(args);
        return args;
      },
      updateMany: async () => ({ count: 1 }),
    },
    handoff: {
      create: async () => ({ id: "handoff-1" }),
    },
    contact: {
      updateMany: async (args: unknown) => {
        store.contactLinks.push(args);
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;

  return { prisma, store };
}
