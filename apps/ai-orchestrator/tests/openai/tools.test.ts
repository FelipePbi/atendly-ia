import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_BUSINESS_SETTINGS } from "../../src/modules/business-settings/business-settings.js";
import { AssistantToolRegistry } from "../../src/modules/openai/tools.js";
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

    const result = (await registry.execute(
      "preparar_agendamento",
      {
        serviceId: null,
        date: slot.date,
        startTime: slot.startTime,
        customerName: "Thais",
      },
      context(),
    )) as { ok: boolean; pendingAction?: { serviceId: string } };

    expect(result.ok).toBe(true);
    expect(result.pendingAction?.serviceId).toBe(service.id);
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

    const result = (await registry.execute(
      "preparar_agendamento",
      {
        serviceId: null,
        date: slot.date,
        startTime: slot.startTime,
        customerName: "Thais",
      },
      context(),
    )) as { ok: boolean; code?: string; error?: string };

    expect(result).toMatchObject({
      ok: false,
      code: "SERVICE_ID_UNRESOLVED",
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

    const result = (await registry.execute(
      "confirmar_agendamento",
      {},
      context(),
    )) as {
      ok: boolean;
      appointment?: { id: string };
    };

    expect(result.ok).toBe(true);
    expect(result.appointment?.id).toBe("98765");
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

    const result = (await registry.execute(
      "buscar_horarios_disponiveis",
      {
        serviceId: service.id,
        startDate: slot.date,
      },
      context(),
    )) as { ok: boolean; slots?: (typeof slot)[] };

    expect(result.ok).toBe(true);
    expect(result.slots).toEqual([slot]);
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

    const result = (await registry.execute(
      "buscar_horarios_disponiveis",
      {
        serviceIds: [service.id, browService.id],
        startDate: slot.date,
      },
      context(),
    )) as {
      ok: boolean;
      services?: Array<{ id: string }>;
      totalDurationMinutes?: number;
      totalPrice?: number;
      slots?: (typeof combinedSlot)[];
    };

    expect(result).toMatchObject({
      ok: true,
      services: [{ id: service.id }, { id: browService.id }],
      totalDurationMinutes: 130,
      totalPrice: 230,
      slots: [combinedSlot],
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

    const prepared = (await registry.execute(
      "preparar_agendamento",
      {
        serviceIds: [service.id, browService.id],
        date: slot.date,
        startTime: slot.startTime,
        customerName: "Thais",
      },
      context(),
    )) as {
      ok: boolean;
      pendingAction?: {
        serviceIds?: string[];
        totalDurationMinutes?: number;
        totalPrice?: number;
        endTime?: string;
      };
    };

    expect(prepared.ok).toBe(true);
    expect(prepared.pendingAction).toMatchObject({
      serviceIds: [service.id, browService.id],
      totalDurationMinutes: 130,
      totalPrice: 230,
      endTime: "15:40",
    });

    const confirmed = (await registry.execute(
      "confirmar_agendamento",
      {},
      context(),
    )) as {
      ok: boolean;
      appointment?: { id: string };
    };

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

function context() {
  return {
    conversationId,
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    phone,
    customerName: "Thais",
    businessSettings: {
      ...DEFAULT_BUSINESS_SETTINGS,
      businessName: "Camili Krauser Beauty",
      configured: true,
    },
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
    customerId: "12345",
    serviceId: input.serviceId,
    serviceIds: services.map((item) => item.id),
    price: services.reduce((total, item) => total + (item.price ?? 0), 0),
    customer: { id: "12345", name: "Thais", phone },
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

function createAgendaMock() {
  const calls: {
    createAppointment: ScheduleAppointmentInput[];
    getAvailableSlotsForServices: string[][];
  } = {
    createAppointment: [],
    getAvailableSlotsForServices: [],
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
  } as unknown as PrismaClient;

  return { prisma, store };
}
