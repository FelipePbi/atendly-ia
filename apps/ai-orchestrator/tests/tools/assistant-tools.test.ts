import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
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

const conversationId = "conversation-1";
/** Turno seguinte ao do `prepare`: e nele que a cliente responde e confirma. */
const nextTurn = "channel-1:message-2";
const phone = "555591359589";
const service: SchedulingServiceDefinition = {
  id: "5114873",
  name: "Aplicacao 5D",
  duration: 100,
  priceType: "FIXED",
  price: 190,
  colorId: 3,
  recurrenceIntervalDays: null,
};
const browService: SchedulingServiceDefinition = {
  id: "5114888",
  name: "Design de sobrancelha",
  duration: 30,
  priceType: "FIXED",
  price: 40,
  colorId: 4,
  recurrenceIntervalDays: null,
};
const startingAtService: SchedulingServiceDefinition = {
  id: "5114900",
  name: "Manutencao de unhas",
  duration: 60,
  priceType: "STARTING_AT",
  price: 80,
  colorId: null,
  recurrenceIntervalDays: null,
};
const onRequestService: SchedulingServiceDefinition = {
  id: "5114911",
  name: "Procedimento especial",
  duration: 45,
  priceType: "ON_REQUEST",
  price: null,
  colorId: null,
  recurrenceIntervalDays: null,
};
const notInformedService: SchedulingServiceDefinition = {
  id: "5114922",
  name: "Servico recem cadastrado",
  duration: 20,
  priceType: "NOT_INFORMED",
  price: null,
  colorId: null,
  recurrenceIntervalDays: null,
};
// Intervalo de referencia cadastrado (Goal007): so este servico pode ser
// ofertado com recorrencia; os demais fixtures acima nao tem cadencia.
const recurringService: SchedulingServiceDefinition = {
  id: "5114933",
  name: "Manutencao mensal",
  duration: 40,
  priceType: "FIXED",
  price: 120,
  colorId: null,
  recurrenceIntervalDays: 30,
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
      context(nextTurn),
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
      context(nextTurn),
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
      context(nextTurn),
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
      context(nextTurn),
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
        context(nextTurn),
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
        context(nextTurn),
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

/**
 * Recorrência ofertável (Goal011, resíduo dos reviews 007/009).
 *
 * `list_services` carrega `recurrenceIntervalDays` sem descartar o campo:
 * presente, a IA pode oferecer a série recorrente; ausente, ela não inventa
 * cadência nenhuma. Oferecer nunca cria nada — a série continua exigindo
 * `prepare_recurring_appointments`/`confirm_recurring_appointments`.
 */
describe("AssistantToolRegistry recurrence offer (Goal011)", () => {
  it("carries recurrenceIntervalDays for a service that has a reference interval", async () => {
    const { prisma } = createPrismaMock({});
    const { agenda } = createAgendaMock([], [service, recurringService]);
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      { id: "call-list-recurrence", name: "list_services", args: {} },
      context(),
    );

    expect(result.ok).toBe(true);
    const listed = (
      result as unknown as { data: { services: Array<Record<string, unknown>> } }
    ).data.services;
    expect(listed).toMatchObject([
      { id: service.id, recurrenceIntervalDays: null },
      { id: recurringService.id, recurrenceIntervalDays: 30 },
    ]);
  });

  it("never invents a cadence for a service without a registered interval", async () => {
    const { prisma } = createPrismaMock({});
    const { agenda } = createAgendaMock([], [service]);
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      { id: "call-list-no-recurrence", name: "list_services", args: {} },
      context(),
    );

    const listed = (
      result as unknown as { data: { services: Array<Record<string, unknown>> } }
    ).data.services;
    // Explicitamente nulo, nunca um número inventado.
    expect(listed[0]).toMatchObject({ recurrenceIntervalDays: null });
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

/**
 * Hold na IA (Goal008, critério 7).
 *
 * Entre "que tal quinta às 13h30?" e "pode confirmar" existe uma conversa
 * inteira, e é exatamente nesse intervalo que o horário some. O hold é a
 * ocupação temporária que fecha essa janela — e a expiração dele nunca pode
 * virar uma confirmação silenciosa.
 */
describe("AssistantToolRegistry hold", () => {
  const pendingSchedule = {
    type: "schedule",
    serviceId: service.id,
    serviceIds: [service.id],
    date: slot.date,
    startTime: slot.startTime,
    customerName: "Thais",
    customerPhone: phone,
    holdId,
    holdExpiresAt,
    idempotencyKey: "idem-1",
  };

  it("holds the proposed slot and keeps the hold in the draft", async () => {
    const { prisma, store } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-hold-prepare",
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

    expect(result).toMatchObject({
      ok: true,
      data: {
        requiresConfirmation: true,
        hold: { id: holdId, expiresAt: holdExpiresAt },
      },
    });
    expect(calls.createHold).toEqual([
      expect.objectContaining({
        serviceIds: [service.id],
        date: slot.date,
        startTime: slot.startTime,
      }),
    ]);
    // Nada foi confirmado ao propor: o horário está segurado, não agendado.
    expect(calls.createAppointment).toHaveLength(0);
    expect(store.state.pendingAction).toMatchObject({ holdId });
  });

  it("consumes the hold of the draft when confirming", async () => {
    const { prisma, store } = createPrismaMock({
      availabilityLookups: [availabilityLookup()],
      pendingAction: pendingSchedule,
    });
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-hold-confirm",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(calls.createAppointment[0]).toMatchObject({ holdId });
    expect(store.state.pendingAction).toBeUndefined();
  });

  it("offers alternatives instead of confirming when the hold expired", async () => {
    const { prisma, store } = createPrismaMock({
      availabilityLookups: [availabilityLookup()],
      pendingAction: pendingSchedule,
    });
    const { agenda, calls } = createAgendaMock([], [service, browService], {
      holdExpired: true,
    });
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-hold-expired",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context(),
    );

    // Falha de domínio, não sucesso com aviso: quem lê precisa saber que
    // **não existe** agendamento.
    expect(result).toMatchObject({
      ok: false,
      error: { code: "APPOINTMENT_HOLD_EXPIRED" },
    });
    expect(calls.getAvailableSlotsForServices).toEqual([[service.id]]);
    // O rascunho sobrevive sem a reserva: a conversa continua sendo sobre o
    // mesmo agendamento, só que sem horário segurado.
    expect(store.state.pendingAction).toMatchObject({
      type: "schedule",
      holdId: null,
    });
  });

  it("holds only the new slot when preparing a reschedule", async () => {
    const existing = createAppointment({
      date: slot.date,
      startTime: slot.startTime,
      serviceId: service.id,
      serviceIds: [service.id],
      customerName: "Thais",
      customerPhone: phone,
    });
    const { prisma, store } = createPrismaMock({}, "cust-thais");
    const { agenda, calls } = createAgendaMock([], [service, browService], {
      futureAppointments: [existing],
    });
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-reschedule-prepare",
        name: "reschedule_appointment",
        args: {
          action: "prepare",
          appointmentId: existing.id,
          date: "2026-06-09",
          startTime: "10:00",
        },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { requiresConfirmation: true, hold: { id: holdId } },
    });
    expect(calls.createHold).toEqual([
      expect.objectContaining({ date: "2026-06-09", startTime: "10:00" }),
    ]);
    // O horário original continua ocupado pelo próprio atendimento: nada o
    // solta antes de a remarcação acontecer de fato.
    expect(calls.releaseHold).toHaveLength(0);
    expect(calls.rescheduleAppointment).toHaveLength(0);
    expect(store.state.pendingAction).toMatchObject({
      type: "reschedule",
      holdId,
    });
  });

  it("keeps proposing without a reservation when the source has no hold", async () => {
    const { prisma, store } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock([], [service, browService], {
      holds: "unsupported",
    });
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-hold-unsupported",
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

    // A Minha Agenda não tem hold; recusar a proposta inteira por isso
    // quebraria quem usa a fonte externa.
    expect(result).toMatchObject({
      ok: true,
      data: { requiresConfirmation: true, hold: null },
    });
    expect(calls.createHold).toHaveLength(1);
    expect(store.state.pendingAction).toMatchObject({ holdId: null });
  });

  it("never forwards an overlap override or a service-less appointment", async () => {
    const { prisma } = createPrismaMock({
      availabilityLookups: [availabilityLookup()],
    });
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    const forced = await registry.execute(
      {
        id: "call-override-attempt",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: slot.date,
          startTime: slot.startTime,
          customerName: "Thais",
          // Nada disto existe no contrato da tool. O modelo pode inventar os
          // campos; o schema é `.strict()`, então a chamada inteira é
          // recusada antes de qualquer efeito — não é o campo que é
          // ignorado, é a tentativa que não acontece.
          overlapOverride: true,
          overlapOverrideReason: "encaixe",
          title: "Atendimento sem servico",
        },
      },
      context(),
    );

    expect(forced.ok).toBe(false);
    expect(calls.createHold).toHaveLength(0);
    expect(calls.createAppointment).toHaveLength(0);

    // E o caminho legítimo continua passando: o sucesso abaixo é a outra
    // metade da prova, porque o dublê lança se algum dia receber override ou
    // um atendimento sem serviço vindo de dentro da própria IA.
    const prepared = await registry.execute(
      {
        id: "call-override-clean-prepare",
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
    expect(prepared.ok).toBe(true);

    const confirmed = await registry.execute(
      {
        id: "call-override-confirm",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context(nextTurn),
    );

    expect(confirmed.ok).toBe(true);
    expect(calls.createAppointment).toHaveLength(1);
    expect(calls.createAppointment[0]).not.toHaveProperty("overlapOverride");
    expect(calls.createAppointment[0].serviceIds).toEqual([service.id]);
    expect(calls.createHold[0]).not.toHaveProperty("overlapOverride");
  });
});

/**
 * Liberação do hold do rascunho substituído (Goal011).
 *
 * `setPendingAction` e `clearPendingAction` liberam, no mesmo caminho que
 * grava o novo estado, o hold que o rascunho **anterior** segurava — nunca o
 * hold que acabou de ser criado para o novo rascunho.
 */
describe("AssistantToolRegistry releases the hold of a replaced or discarded draft", () => {
  it("releases A's hold when B is proposed in the next turn, without touching B's own hold", async () => {
    const { prisma, store } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    const first = await registry.execute(
      {
        id: "call-prepare-a",
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
    expect(first).toMatchObject({ ok: true, data: { hold: { id: holdId } } });
    expect(calls.releaseHold).toHaveLength(0);

    const second = await registry.execute(
      {
        id: "call-prepare-b",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: "2026-06-09",
          startTime: "09:00",
          customerName: "Thais",
        },
      },
      context(nextTurn),
    );

    expect(second.ok).toBe(true);
    const holdB = (
      second as unknown as { data: { hold: { id: string } | null } }
    ).data.hold?.id;
    expect(holdB).toBeDefined();
    expect(holdB).not.toBe(holdId);

    // Só o hold do rascunho substituído (A) sai; o de B, recém-criado, fica.
    expect(calls.releaseHold).toEqual([holdId]);
    expect(store.state.pendingAction).toMatchObject({ holdId: holdB });
  });

  it("releases the schedule draft's hold when it is discarded for a different intention", async () => {
    const existing = createAppointment({
      date: slot.date,
      startTime: slot.startTime,
      serviceId: service.id,
      serviceIds: [service.id],
      customerName: "Thais",
      customerPhone: phone,
    });
    const { prisma, store } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock([], [service, browService], {
      futureAppointments: [existing],
    });
    const registry = new AssistantToolRegistry(prisma, agenda);

    await registry.execute(
      {
        id: "call-prepare-schedule",
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
    expect(calls.releaseHold).toHaveLength(0);

    // A cliente muda de ideia: em vez de agendar, quer cancelar outro
    // atendimento. O rascunho de agendamento é descartado.
    await registry.execute(
      {
        id: "call-prepare-cancel",
        name: "cancel_appointment",
        args: { action: "prepare", appointmentId: existing.id },
      },
      context(nextTurn),
    );

    expect(calls.releaseHold).toEqual([holdId]);
    expect(store.state.pendingAction).toMatchObject({
      type: "cancel",
      appointmentId: existing.id,
    });
  });

  it("confirming B does not leave A's hold occupied", async () => {
    const { prisma, store } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    await registry.execute(
      {
        id: "call-prepare-a2",
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

    await registry.execute(
      {
        id: "call-prepare-b2",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: "2026-06-09",
          startTime: "09:00",
          customerName: "Thais",
        },
      },
      context(nextTurn),
    );
    expect(calls.releaseHold).toEqual([holdId]);

    const confirmed = await registry.execute(
      {
        id: "call-confirm-b2",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context("channel-1:message-3"),
    );

    expect(confirmed.ok).toBe(true);
    // A segue liberado: nenhuma chamada de confirmação de B o reocupou nem
    // precisou liberá-lo de novo além da única liberação já registrada.
    expect(calls.releaseHold.filter((id) => id === holdId)).toHaveLength(1);
    expect(store.state.pendingAction).toBeUndefined();
  });

  it("does not fail the turn when releasing the previous hold fails, and logs it", async () => {
    const { prisma } = createPrismaMock({});
    const { agenda } = createAgendaMock([], [service, browService], {
      releaseHoldFails: true,
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const registry = new AssistantToolRegistry(prisma, agenda, undefined, logger);

    await registry.execute(
      {
        id: "call-prepare-fail-a",
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

    const second = await registry.execute(
      {
        id: "call-prepare-fail-b",
        name: "create_appointment",
        args: {
          action: "prepare",
          serviceId: service.id,
          date: "2026-06-09",
          startTime: "09:00",
          customerName: "Thais",
        },
      },
      context(nextTurn),
    );

    // A falha ao liberar o hold de A não derruba o turno: B é preparado
    // normalmente, com o próprio hold.
    expect(second).toMatchObject({ ok: true, data: { requiresConfirmation: true } });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatchObject({
      requestId: "request-1",
      holdId,
    });
  });
});

describe("AssistantToolRegistry recurring appointments (Goal009)", () => {
  it("prepares a finite series with one hold per occurrence, adjusted to the business grid", async () => {
    const { prisma } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    const result = await registry.execute(
      {
        id: "call-series-prepare",
        name: "prepare_recurring_appointments",
        args: {
          serviceId: service.id,
          occurrenceCount: 3,
          intervalDays: 7,
          firstDate: slot.date,
          firstStartTime: slot.startTime,
        },
      },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(calls.previewAppointmentSeries).toEqual([
      expect.objectContaining({
        serviceIds: [service.id],
        occurrenceCount: 3,
        intervalDays: 7,
      }),
    ]);
    expect((result as { data: { occurrences: unknown[] } }).data.occurrences).toHaveLength(3);
  });

  it("confirms every occurrence of a prepared series at once", async () => {
    const { prisma } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(prisma, agenda);

    // A serie tambem precisa de um turno de conversa entre propor e confirmar.
    await registry.execute(
      {
        id: "call-series-prepare",
        name: "prepare_recurring_appointments",
        args: {
          serviceId: service.id,
          occurrenceCount: 2,
          intervalDays: 7,
          firstDate: slot.date,
          firstStartTime: slot.startTime,
        },
      },
      context(),
    );

    const result = await registry.execute(
      {
        id: "call-series-confirm",
        name: "confirm_recurring_appointments",
        args: {
          serviceId: service.id,
          holdIds: [`${holdId}-series-0`, `${holdId}-series-1`],
          intervalDays: 7,
          customerName: "Thais",
        },
      },
      context(nextTurn),
    );

    expect(result.ok).toBe(true);
    expect(calls.confirmAppointmentSeries).toEqual([
      expect.objectContaining({
        holdIds: [`${holdId}-series-0`, `${holdId}-series-1`],
        serviceIds: [service.id],
        intervalDays: 7,
      }),
    ]);
    expect((result as { data: { appointments: unknown[] } }).data.appointments).toHaveLength(2);
  });

  it("[RED] an expired hold confirms nothing from the series, and the tool fails instead of forcing", async () => {
    const { prisma } = createPrismaMock({});
    const { agenda, calls } = createAgendaMock([], [service, browService], {
      seriesHoldExpired: true,
    });
    const registry = new AssistantToolRegistry(prisma, agenda);

    await registry.execute(
      {
        id: "call-series-prepare-expired",
        name: "prepare_recurring_appointments",
        args: {
          serviceId: service.id,
          occurrenceCount: 1,
          intervalDays: 7,
          firstDate: slot.date,
          firstStartTime: slot.startTime,
        },
      },
      context(),
    );

    const result = await registry.execute(
      {
        id: "call-series-confirm-expired",
        name: "confirm_recurring_appointments",
        args: {
          serviceId: service.id,
          holdIds: [`${holdId}-series-0`],
          intervalDays: 7,
          customerName: "Thais",
        },
      },
      context(nextTurn),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "APPOINTMENT_HOLD_EXPIRED" },
    });
    expect(calls.confirmAppointmentSeries).toHaveLength(1);
  });

  it("no tool ever creates an exception, block, personal commitment or overlap override", async () => {
    const { prisma } = createPrismaMock({});
    const { agenda } = createAgendaMock();
    // O dublê não expõe nenhum desses métodos: uma tool que tentasse chamá-los
    // quebraria aqui, na chamada em si, não numa asserção que o teste
    // poderia esquecer de escrever.
    for (const forbidden of [
      "createBlock",
      "createPersonalCommitment",
      "createAvailabilityException",
      "createBlockSeries",
    ] as const) {
      expect((agenda as unknown as Record<string, unknown>)[forbidden]).toBeUndefined();
    }
    const registry = new AssistantToolRegistry(prisma, agenda);
    const definitions = registry.createDefinitions({
      ...context(),
    });
    const toolNames = definitions.map((definition) => definition.name);
    // Nenhuma tool desta lista existe para a IA — bloqueio, compromisso,
    // excecao e serie de bloqueio sao sempre decisao humana (Goal009).
    for (const forbiddenTool of [
      "create_block",
      "create_personal_commitment",
      "create_availability_exception",
      "create_block_series",
    ]) {
      expect(toolNames).not.toContain(forbiddenTool);
    }
  });
});

/**
 * Contexto de execucao de um turno.
 *
 * `turnId` e obrigatorio desde a confirmacao explicita por codigo: preparar e
 * confirmar no mesmo turno e recusado, entao todo teste que confirma um
 * rascunho preparado no proprio teste confirma com o turno seguinte, como a
 * conversa real faz.
 */
function context(turnId = "channel-1:message-1") {
  return {
    turnId,
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
    // Atendimento com serviço cadastrado não tem título próprio (Goal008): o
    // título só existe no atendimento manual excepcional, que a IA nunca cria.
    title: null,
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

/** Erro do Scheduling como a IA o enxerga: um código, não uma mensagem. */
function schedulingError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

const holdId = "hold-1";
const holdExpiresAt = "2026-06-08T13:35:00.000Z";

function createAgendaMock(
  candidates: Array<{ id: string; name: string | null; phone: string | null }> = [],
  servicesOverride: SchedulingServiceDefinition[] = [service, browService],
  options: {
    /**
     * `unsupported` é a Minha Agenda: a fonte externa recusa hold, e a
     * proposta precisa continuar acontecendo sem reserva.
     */
    holds?: "supported" | "unsupported";
    /**
     * Hold vencido entre a proposta e a confirmação — o caso que o relógio
     * do banco decide e que nenhum `sleep` deste teste conseguiria produzir.
     */
    holdExpired?: boolean;
    /** Agenda já ocupada por este número, para os caminhos de remarcação. */
    futureAppointments?: SchedulingAppointment[];
    /** Hold da série vencido entre a preparação e a confirmação (Goal009). */
    seriesHoldExpired?: boolean;
    /**
     * `releaseHold` do dublê falha sempre (Goal011): prova que a falha ao
     * liberar o hold do rascunho anterior não derruba o turno.
     */
    releaseHoldFails?: boolean;
  } = {},
) {
  const calls: {
    createAppointment: ScheduleAppointmentInput[];
    rescheduleAppointment: RescheduleAppointmentInput[];
    createHold: CreateSchedulingHoldInput[];
    releaseHold: string[];
    getAvailableSlotsForServices: string[][];
    findCustomerCandidatesByPhone: string[];
    findFutureAppointmentsForCustomer: string[];
    findFutureAppointmentsForPhone: string[];
    previewAppointmentSeries: PreviewAppointmentSeriesInput[];
    confirmAppointmentSeries: ConfirmAppointmentSeriesInput[];
  } = {
    createAppointment: [],
    rescheduleAppointment: [],
    createHold: [],
    releaseHold: [],
    getAvailableSlotsForServices: [],
    findCustomerCandidatesByPhone: [],
    findFutureAppointmentsForCustomer: [],
    findFutureAppointmentsForPhone: [],
    previewAppointmentSeries: [],
    confirmAppointmentSeries: [],
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
      assertNeverForcesTheAgenda(input);
      calls.createAppointment.push(input);
      // Só quem apresenta um hold pode vê-lo vencer; sem `holdId` a
      // confirmação revalida a disponibilidade normalmente.
      if (options.holdExpired && input.holdId) {
        throw schedulingError("APPOINTMENT_HOLD_EXPIRED");
      }
      return createAppointment(input);
    },
    createHold: async (input: CreateSchedulingHoldInput): Promise<SchedulingHold> => {
      calls.createHold.push(input);
      if (options.holds === "unsupported") {
        throw schedulingError("EXTERNAL_CALENDAR_HOLD_UNSUPPORTED");
      }
      // Primeira chamada preserva `holdId` literal para não quebrar os testes
      // existentes; chamadas seguintes (propor B depois de A) recebem um id
      // distinto, para que a liberação de A seja distinguível da de B.
      const sequentialId =
        calls.createHold.length === 1
          ? holdId
          : `${holdId}-${calls.createHold.length}`;
      return {
        id: sequentialId,
        date: input.date,
        startTime: input.startTime,
        endTime: slot.endTime,
        duration: service.duration,
        serviceIds: input.serviceIds,
        expiresAt: holdExpiresAt,
        status: "ACTIVE",
      };
    },
    releaseHold: async (id: string): Promise<SchedulingHold> => {
      calls.releaseHold.push(id);
      if (options.releaseHoldFails) {
        throw schedulingError("SCHEDULING_UNAVAILABLE");
      }
      return {
        id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        duration: service.duration,
        serviceIds: [service.id],
        expiresAt: holdExpiresAt,
        status: "RELEASED",
      };
    },
    findFutureAppointmentsForPhone: async (value: string) => {
      calls.findFutureAppointmentsForPhone.push(value);
      return options.futureAppointments ?? [];
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
    rescheduleAppointment: async (input: RescheduleAppointmentInput) => {
      calls.rescheduleAppointment.push(input);
      if (options.holdExpired && input.holdId) {
        throw schedulingError("APPOINTMENT_HOLD_EXPIRED");
      }
      return createAppointment({
        date: input.date,
        startTime: input.startTime,
        serviceId: service.id,
        customerName: "Thais",
        customerPhone: phone,
      });
    },
    previewAppointmentSeries: async (input: PreviewAppointmentSeriesInput) => {
      calls.previewAppointmentSeries.push(input);
      return Array.from({ length: input.occurrenceCount }, (_, index) => ({
        index,
        requestedDate: slot.date,
        date: slot.date,
        startTime: input.firstStartTime,
        endTime: slot.endTime,
        adjusted: false,
        holdId: `${holdId}-series-${index}`,
        unavailable: false,
      }));
    },
    confirmAppointmentSeries: async (input: ConfirmAppointmentSeriesInput) => {
      calls.confirmAppointmentSeries.push(input);
      if (options.seriesHoldExpired) {
        throw schedulingError("APPOINTMENT_HOLD_EXPIRED");
      }
      return input.holdIds.map((holdIdValue, index) => ({
        ...createAppointment({
          date: slot.date,
          startTime: slot.startTime,
          serviceId: input.serviceIds[0] ?? service.id,
          serviceIds: input.serviceIds,
          customerName: input.customerName ?? "Thais",
          customerPhone: phone,
        }),
        id: `${holdIdValue}-appointment-${index}`,
      }));
    },
  };

  return { agenda: agenda as never, calls };
}

/**
 * A asserção que falha **dentro** do dublê, não depois dele (Goal008,
 * critério 7).
 *
 * A IA nunca força sobreposição nem cria atendimento sem serviço cadastrado.
 * Verificar isso só no `expect` do teste provaria apenas os caminhos que o
 * teste lembrou de exercitar; verificar aqui faz qualquer chamada de qualquer
 * cenário quebrar na hora em que a tentativa acontecer.
 */
function assertNeverForcesTheAgenda(input: ScheduleAppointmentInput): void {
  const forced = input as unknown as Record<string, unknown>;
  if (forced.overlapOverride !== undefined) {
    throw new Error(
      "A IA nunca envia overlapOverride: sobreposição é decisão humana explícita.",
    );
  }
  const serviceIds = input.serviceIds ?? [input.serviceId];
  if (serviceIds.filter(Boolean).length === 0) {
    throw new Error(
      "A IA nunca cria atendimento sem serviço cadastrado: isso é exceção manual.",
    );
  }
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
