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
const startingAtService: SchedulingServiceDefinition = {
  id: "5114900",
  name: "Manutencao de unhas",
  duration: 60,
  priceType: "STARTING_AT",
  price: 80,
  colorId: null,
};
const onRequestService: SchedulingServiceDefinition = {
  id: "5114911",
  name: "Procedimento especial",
  duration: 45,
  priceType: "ON_REQUEST",
  price: null,
  colorId: null,
};
const notInformedService: SchedulingServiceDefinition = {
  id: "5114922",
  name: "Servico recem cadastrado",
  duration: 20,
  priceType: "NOT_INFORMED",
  price: null,
  colorId: null,
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

describe("AssistantToolRegistry price semantics", () => {
  it("lists the four price types and only carries a price when one exists", async () => {
    const { prisma } = createPrismaMock({});
    const { agenda } = createAgendaMock(
      [],
      [service, startingAtService, onRequestService, notInformedService],
    );
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-list-services",
        name: "list_services",
        args: { includePrices: true },
      },
      context(),
    );

    expect(result.ok).toBe(true);
    const listed = (
      result as unknown as { data: { services: Array<Record<string, unknown>> } }
    ).data.services;
    expect(listed).toMatchObject([
      { id: service.id, priceType: "FIXED", price: service.price },
      {
        id: startingAtService.id,
        priceType: "STARTING_AT",
        price: startingAtService.price,
      },
      { id: onRequestService.id, priceType: "ON_REQUEST" },
      { id: notInformedService.id, priceType: "NOT_INFORMED" },
    ]);
    expect(listed[2]).not.toHaveProperty("price");
    expect(listed[3]).not.toHaveProperty("price");
  });

  it.each([
    {
      label: "fixed total",
      services: [service, browService],
      expected: `Total: R$ ${((service.price ?? 0) + (browService.price ?? 0)).toFixed(2)}.`,
    },
    {
      label: "starting-at total",
      services: [service, startingAtService],
      expected: `A partir de R$ ${((service.price ?? 0) + (startingAtService.price ?? 0)).toFixed(2)}.`,
    },
    {
      label: "on-request total",
      services: [service, onRequestService],
      expected: "Valor sob consulta.",
    },
    {
      label: "not-informed total",
      services: [service, notInformedService],
      expected: "Valor nao informado.",
    },
  ])(
    "writes the comment for a $label",
    async ({ services: pairedServices, expected }) => {
      const { prisma } = createPrismaMock({});
      const { agenda, calls } = createAgendaMock([], pairedServices);
      const registry = new AssistantToolRegistry(prisma, agenda);

      await registry.execute(
        {
          id: "call-prepare-price",
          name: "create_appointment",
          args: {
            action: "prepare",
            serviceIds: pairedServices.map((item) => item.id),
            date: slot.date,
            startTime: slot.startTime,
            customerName: "Thais",
          },
        },
        context(),
      );
      await registry.execute(
        {
          id: "call-confirm-price",
          name: "create_appointment",
          args: { action: "confirm" },
        },
        context(),
      );

      expect(calls.createAppointment[0].comments).toContain(expected);
    },
  );

  it("never offers or schedules a service pending review", async () => {
    const reviewServiceId = "in-review-1";
    const { prisma } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock([], [service]);
    const registry = new AssistantToolRegistry(prisma, agenda);

    const listed = await registry.execute(
      { id: "call-list-review", name: "list_services", args: {} },
      context(),
    );
    expect(listed.ok).toBe(true);
    const services = (
      listed as unknown as { data: { services: Array<{ id: string }> } }
    ).data.services;
    expect(services.map((item) => item.id)).not.toContain(reviewServiceId);

    const prepared = await registry.execute(
      {
        id: "call-prepare-review",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: reviewServiceId,
          date: slot.date,
          startTime: slot.startTime,
          customerName: "Thais",
        },
      },
      context(),
    );

    expect(prepared).toMatchObject({
      ok: false,
      error: { code: "SERVICE_NOT_FOUND" },
    });
    expect(calls.createAppointment).toHaveLength(0);
  });
});

describe("AssistantToolRegistry customer appointment lookup", () => {
  it("queries by customerId when the contact is already linked to a person", async () => {
    const { prisma } = createPrismaMock({}, "linked-customer-1");
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-list-appointments-linked",
        name: "list_customer_appointments",
        args: {},
      },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(calls.findFutureAppointmentsForCustomer).toEqual([
      "linked-customer-1",
    ]);
    expect(calls.findFutureAppointmentsForPhone).toHaveLength(0);
  });

  it("falls back to phone candidates when the contact is not linked", async () => {
    const { prisma } = createPrismaMock({}, null);
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-list-appointments-unlinked",
        name: "list_customer_appointments",
        args: {},
      },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(calls.findFutureAppointmentsForPhone).toEqual([phone]);
    expect(calls.findFutureAppointmentsForCustomer).toHaveLength(0);
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
    totalPriceType: services.every((item) => item.priceType === "FIXED")
      ? "FIXED"
      : "STARTING_AT",
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
  servicesOverride: SchedulingServiceDefinition[] = [service, browService],
) {
  const calls: {
    createAppointment: ScheduleAppointmentInput[];
    getAvailableSlotsForServices: string[][];
    findCustomerCandidatesByPhone: string[];
    findFutureAppointmentsForCustomer: string[];
    findFutureAppointmentsForPhone: string[];
  } = {
    createAppointment: [],
    getAvailableSlotsForServices: [],
    findCustomerCandidatesByPhone: [],
    findFutureAppointmentsForCustomer: [],
    findFutureAppointmentsForPhone: [],
  };
  const services = servicesOverride;
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
    findFutureAppointmentsForPhone: async (value: string) => {
      calls.findFutureAppointmentsForPhone.push(value);
      return [];
    },
    findFutureAppointmentsForCustomer: async (value: string) => {
      calls.findFutureAppointmentsForCustomer.push(value);
      return [];
    },
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

function createPrismaMock(
  initialState: Record<string, unknown>,
  linkedCustomerId: string | null = null,
) {
  const store = {
    state: { ...initialState },
    externalAppointments: [] as unknown[],
    customerLinks: [] as unknown[],
    contactLinks: [] as unknown[],
  };
  const prisma = {
    contact: {
      findUnique: async () =>
        linkedCustomerId ? { customerId: linkedCustomerId } : null,
      updateMany: async (args: unknown) => {
        store.contactLinks.push(args);
        return { count: 1 };
      },
    },
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
  } as unknown as PrismaClient;

  return { prisma, store };
}
