/**
 * Goal145 — a IA mostra ao número os horários de todas as pessoas dele.
 *
 * Maria usa o número da conversa e é responsável confirmada de Pedro, que não
 * tem telefone. Ana é do tenant, mas não é do número. `list_customer_appointments`
 * devolve sempre a lista do número com os dependentes confirmados, com o
 * contato vinculado a Pedro, a Maria, a Ana ou a ninguém: o vínculo só serve à
 * pessoa provável do `create_appointment`. A tool não lê o vínculo nem os
 * candidatos.
 */
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { SchedulingGateway } from "../../src/modules/scheduling-service/client.js";
import type {
  CreateSchedulingHoldInput,
  FindAppointmentsForPhoneOptions,
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

const conversationId = "conversation-145";
const firstTurn = "channel-1:message-1";
const nextTurn = "channel-1:message-2";
const phone = "5551999990145";

const service: SchedulingServiceDefinition = {
  id: "service-145",
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
      businessName: "Salao Goal145",
      configured: true,
    },
    aiRunId: "ai-run-145",
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
 * os dependentes que o teste entrega. `findFutureAppointmentsForCustomer`
 * devolve o horário de qualquer pessoa do tenant, para provar que não é usado.
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
    findFutureAppointmentsForPhone: [] as Array<{
      options: FindAppointmentsForPhoneOptions | undefined;
    }>,
    findFutureAppointmentsForCustomer: [] as string[],
    createHold: [] as CreateSchedulingHoldInput[],
    cancelAppointment: [] as string[],
    confirmAppointmentPresence: [] as string[],
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
    cancelAppointment: async (appointmentId: string) => {
      calls.cancelAppointment.push(appointmentId);
      return { appointmentId, cancelled: true as const };
    },
    getCustomerChangePolicy: async () => ({ minNoticeMinutes: 0 }),
    getReminderConfirmationSettings: async () => ({
      configured: true,
      confirmationEnabled: true,
    }),
    confirmAppointmentPresence: async (appointmentId: string) => {
      calls.confirmAppointmentPresence.push(appointmentId);
      return {
        appointmentId,
        status: "CONFIRMED",
        presenceConfirmedAt: "2026-10-07T12:00:00.000Z",
        completedAt: null,
        noShowAt: null,
      };
    },
  };
  return { gateway: gateway as unknown as SchedulingGateway, calls };
}

/** `Contact.lastScheduledCustomerId` é a última pessoa agendada pelo número. */
function createPrisma(linkedCustomerId: string | null = null) {
  const store = {
    state: { availabilityLookups: [availabilityLookup()] } as Record<
      string,
      unknown
    >,
    contactReads: 0,
  };
  const prisma = {
    contact: {
      findUnique: async () => {
        store.contactReads += 1;
        return linkedCustomerId
          ? { lastScheduledCustomerId: linkedCustomerId }
          : null;
      },
      updateMany: async () => ({ count: 1 }),
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

const listCall = {
  id: "call-list",
  name: "list_customer_appointments",
  args: {},
};

function idsOf(result: unknown) {
  return (
    result as { data: { appointments: Array<{ id: string }> } }
  ).data.appointments.map((appointment) => appointment.id);
}

describe("Goal145 — list_customer_appointments mostra todas as pessoas do número", () => {
  const links: Array<[string, string | null]> = [
    ["vinculado ao Pedro", pedro.id],
    ["vinculado à Maria", maria.id],
    ["sem vínculo", null],
  ];

  for (const [label, linkedId] of links) {
    it(`contato ${label}: a lista traz Maria e Pedro, cada um com customerName, e a tool não lê Contact nem os candidatos`, async () => {
      const { prisma, store } = createPrisma(linkedId);
      const { gateway, calls } = createAgenda();
      const registry = new AssistantToolRegistry(prisma, gateway);

      const result = await registry.execute(listCall, context());

      expect(result).toMatchObject({
        ok: true,
        data: {
          appointments: [
            { id: mariaAppointment.id, customerName: "Maria" },
            { id: pedroAppointment.id, customerName: "Pedro" },
          ],
        },
      });
      expect(calls.findFutureAppointmentsForPhone).toEqual([
        { options: { includeDependents: true } },
      ]);
      expect(calls.findFutureAppointmentsForCustomer).toEqual([]);
      expect(store.contactReads).toBe(0);
      expect(calls.findCustomerCandidatesByPhone).toEqual([]);
      expect(calls.findCustomerDependentsByPhone).toEqual([]);
    });
  }

  it("contato vinculado à Ana, que não é do número: a lista não traz o horário dela", async () => {
    const { prisma } = createPrisma(ana.id);
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const result = await registry.execute(listCall, context());

    expect(calls.findFutureAppointmentsForCustomer).toEqual([]);
    expect(idsOf(result)).not.toContain(anaAppointment.id);
    expect(idsOf(result)).toEqual([mariaAppointment.id, pedroAppointment.id]);
  });

  it("relação do Pedro removida: a lista não traz o horário dele, vinculado ou não", async () => {
    for (const linkedId of [pedro.id, null]) {
      const { prisma } = createPrisma(linkedId);
      const { gateway, calls } = createAgenda({ dependents: [] });
      const registry = new AssistantToolRegistry(prisma, gateway);

      const result = await registry.execute(listCall, context());

      expect(calls.findFutureAppointmentsForCustomer).toEqual([]);
      expect(idsOf(result)).toEqual([mariaAppointment.id]);
    }
  });

  it("modo sugestão: executeReadOnly devolve a mesma lista que execute, com o contato vinculado ao Pedro", async () => {
    const executed = createAgenda();
    const readOnly = createAgenda();
    const expected = await new AssistantToolRegistry(
      createPrisma(pedro.id).prisma,
      executed.gateway,
    ).execute(listCall, context());

    const result = await new AssistantToolRegistry(
      createPrisma(pedro.id).prisma,
      readOnly.gateway,
    ).executeReadOnly(listCall, context());

    expect(result).toEqual(expected);
    expect(idsOf(result)).toEqual([mariaAppointment.id, pedroAppointment.id]);
    expect(readOnly.calls.findFutureAppointmentsForPhone).toEqual([
      { options: { includeDependents: true } },
    ]);
    expect(readOnly.calls.findFutureAppointmentsForCustomer).toEqual([]);
  });
});

describe("Goal145 — a lista e o cancelamento procuram no mesmo lugar", () => {
  it("contato vinculado ao Pedro: o appointmentId da Maria vindo da lista é aceito pelo prepare de cancel_appointment", async () => {
    const { prisma } = createPrisma(pedro.id);
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const listed = await registry.execute(listCall, context());
    const mariaId = idsOf(listed).find((id) => id === mariaAppointment.id);
    expect(mariaId).toBe(mariaAppointment.id);

    const prepared = await registry.execute(
      {
        id: "call-cancel-prepare",
        name: "cancel_appointment",
        args: { action: "prepare", appointmentId: mariaId },
      },
      context(nextTurn),
    );

    expect(prepared).toMatchObject({
      ok: true,
      data: {
        requiresConfirmation: true,
        appointment: { id: mariaAppointment.id, customerName: "Maria" },
      },
    });
    expect(calls.cancelAppointment).toEqual([]);
  });
});

describe("Goal145 — o que o vínculo e o telefone continuam fazendo", () => {
  it("contato vinculado ao Pedro: prepare de create_appointment sem customerId continua propondo o Pedro com LAST_BOOKED_FOR_DEPENDENT", async () => {
    const { prisma } = createPrisma(pedro.id);
    const { gateway } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      {
        id: "call-prepare",
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

    expect(prepared).toMatchObject({
      ok: true,
      data: {
        customerIdentity: {
          customerId: null,
          proposedCustomerId: pedro.id,
          reason: LAST_BOOKED_FOR_DEPENDENT,
        },
      },
    });
  });

  it("confirm_appointment_presence com o horário do Pedro continua recusando pelo número da Maria", async () => {
    const { prisma } = createPrisma(pedro.id);
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const result = await registry.execute(
      {
        id: "call-presence",
        name: "confirm_appointment_presence",
        args: { appointmentId: pedroAppointment.id },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { message: "Agendamento nao encontrado para esse telefone." },
    });
    expect(calls.confirmAppointmentPresence).toHaveLength(0);
    expect(calls.findFutureAppointmentsForPhone).toEqual([
      { options: undefined },
    ]);
  });
});
