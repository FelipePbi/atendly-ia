/**
 * Goal142 — a IA reconhece pelo número do responsável quem ele agenda.
 *
 * Maria usa o número da conversa e é responsável confirmada de Pedro, que
 * não tem telefone. Os candidatos da IA passam a juntar as pessoas do
 * telefone e os dependentes confirmados delas, cada um com `scheduledBy`; a
 * pessoa provável segue a ordem da escolha 3 do Goal, e nada é confirmado
 * sem a resposta da pessoa. Cancelar e remarcar enxergam o horário de Pedro
 * pelo número de Maria; a presença, o teste de ativação e o resumo do
 * cliente não.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../src/config/env.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import {
  type SchedulingGateway,
  SchedulingClient,
} from "../../src/modules/scheduling-service/client.js";
import type {
  CreateSchedulingHoldInput,
  FindAppointmentsForPhoneOptions,
  RescheduleAppointmentInput,
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingCustomerCandidate,
  SchedulingCustomerDependent,
  SchedulingRequestContext,
  SchedulingServiceDefinition,
} from "../../src/modules/scheduling-service/types.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import {
  AssistantToolRegistry,
  CONFIRMATION_SAME_TURN,
  LAST_BOOKED_FOR_DEPENDENT,
} from "../../src/modules/tools/assistant-tools.js";

const conversationId = "conversation-142";
const firstTurn = "channel-1:message-1";
/** Turno seguinte ao do `prepare`: é nele que a pessoa responde. */
const nextTurn = "channel-1:message-2";
const phone = "5551999990142";

const service: SchedulingServiceDefinition = {
  id: "service-142",
  name: "Corte infantil",
  duration: 30,
  priceType: "FIXED",
  price: 50,
  colorId: null,
  recurrenceIntervalDays: null,
};
const slot = { date: "2026-10-20", startTime: "10:00", endTime: "10:30" };

const maria: SchedulingCustomerCandidate = {
  id: "cust-maria",
  name: "Maria",
  phone,
};
const joana: SchedulingCustomerCandidate = {
  id: "cust-joana",
  name: "Joana",
  phone,
};
const pedro: SchedulingCustomerDependent = {
  id: "cust-pedro",
  name: "Pedro",
  phone: null,
  guardian: { id: maria.id, name: maria.name },
};
const scheduledByMaria = { customerId: maria.id, name: maria.name };

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
      businessName: "Salao Goal142",
      configured: true,
    },
    aiRunId: "ai-run-142",
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
 * Agenda falsa da casa, com o que o Scheduling do Goal142 responde: os
 * horários do número só trazem os de Pedro quando a leitura pede
 * `includeDependents`.
 */
function createAgenda(
  input: {
    candidates?: SchedulingCustomerCandidate[];
    dependents?: SchedulingCustomerDependent[];
    holdExpiredOnReschedule?: boolean;
  } = {},
) {
  const candidates = input.candidates ?? [maria];
  const dependents = input.dependents ?? [pedro];
  const calls = {
    findFutureAppointmentsForPhone: [] as Array<{
      phone: string;
      options: FindAppointmentsForPhoneOptions | undefined;
    }>,
    findFutureAppointmentsForCustomer: [] as string[],
    findCustomerDependentsByPhone: [] as string[],
    createAppointment: [] as ScheduleAppointmentInput[],
    createHold: [] as CreateSchedulingHoldInput[],
    rescheduleAppointment: [] as RescheduleAppointmentInput[],
    cancelAppointment: [] as string[],
    confirmAppointmentPresence: [] as string[],
  };
  const gateway = {
    listActiveServices: async () => [service],
    findService: async () => service,
    getAvailableSlotsForServices: async () => [slot],
    findCustomerCandidatesByPhone: async () => candidates,
    findCustomerDependentsByPhone: async (value: string) => {
      calls.findCustomerDependentsByPhone.push(value);
      return dependents;
    },
    findFutureAppointmentsForPhone: async (
      value: string,
      _businessContext: unknown,
      _context: SchedulingRequestContext | undefined,
      options?: FindAppointmentsForPhoneOptions,
    ) => {
      calls.findFutureAppointmentsForPhone.push({ phone: value, options });
      const dependentIds = new Set(dependents.map((item) => item.id));
      return [mariaAppointment, pedroAppointment].filter(
        (appointment) =>
          !dependentIds.has(appointment.customerId ?? "") ||
          options?.includeDependents === true,
      );
    },
    findFutureAppointmentsForCustomer: async (customerId: string) => {
      calls.findFutureAppointmentsForCustomer.push(customerId);
      return [mariaAppointment, pedroAppointment].filter(
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
      const name = [maria, joana, pedro].find((item) => item.id === id)?.name;
      return appointmentFor("appt-new", { id, name: name ?? null, phone });
    },
    rescheduleAppointment: async (
      rescheduleInput: RescheduleAppointmentInput,
    ) => {
      calls.rescheduleAppointment.push(rescheduleInput);
      if (input.holdExpiredOnReschedule) {
        throw Object.assign(new Error("APPOINTMENT_HOLD_EXPIRED"), {
          code: "APPOINTMENT_HOLD_EXPIRED",
        });
      }
      return {
        ...pedroAppointment,
        date: rescheduleInput.date,
        startTime: rescheduleInput.startTime,
      };
    },
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
function createPrisma(linkedCustomerId: string | null) {
  const store = {
    state: { availabilityLookups: [availabilityLookup()] } as Record<
      string,
      unknown
    >,
    contactLinks: [] as Array<{
      data: { customerId?: string; lastScheduledCustomerId: string };
    }>,
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
      updateMany: async (args: {
        data: { customerId?: string; lastScheduledCustomerId: string };
      }) => {
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

describe("Goal142 — candidatos do número com os dependentes confirmados", () => {
  it("contato vinculado a Pedro: prepare sem customerId propõe Pedro com LAST_BOOKED_FOR_DEPENDENT e nada é confirmado sem a resposta", async () => {
    const { prisma, store } = createPrisma(pedro.id);
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      { id: "call-prepare", name: "create_appointment", args: prepareArgs() },
      context(),
    );

    expect(prepared).toMatchObject({
      ok: true,
      data: {
        requiresConfirmation: true,
        customerIdentity: {
          customerId: null,
          proposedCustomerId: pedro.id,
          requiresConfirmation: true,
          reason: LAST_BOOKED_FOR_DEPENDENT,
          candidates: [
            { customerId: maria.id, name: "Maria", scheduledBy: null },
            {
              customerId: pedro.id,
              name: "Pedro",
              scheduledBy: scheduledByMaria,
            },
          ],
        },
        pendingAction: { customerId: null, proposedCustomerId: pedro.id },
      },
    });
    expect(calls.createAppointment).toHaveLength(0);

    // Confirmar na mesma mensagem é recusado: falta a resposta da pessoa.
    const sameTurn = await registry.execute(
      {
        id: "call-confirm-same",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context(),
    );
    expect(sameTurn).toMatchObject({
      ok: false,
      error: { code: CONFIRMATION_SAME_TURN },
    });
    expect(calls.createAppointment).toHaveLength(0);
    expect(store.contactLinks).toHaveLength(0);

    // "Sim, para o Pedro" no turno seguinte: só então vira agendamento dele.
    await registry.execute(
      {
        id: "call-confirm",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context(nextTurn),
    );
    expect(calls.createAppointment).toHaveLength(1);
    expect(calls.createAppointment[0]).toMatchObject({ customerId: pedro.id });
  });

  it("contato vinculado a Maria: propõe Maria, Pedro vem em candidates com scheduledBy, e prepare com o customerId de Pedro agenda para Pedro e vincula o contato a ele", async () => {
    const { prisma, store } = createPrisma(maria.id);
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      { id: "call-prepare", name: "create_appointment", args: prepareArgs() },
      context(),
    );

    expect(prepared).toMatchObject({ ok: true });
    const identity = (prepared as { data: { customerIdentity: unknown } }).data
      .customerIdentity;
    expect(identity).toEqual({
      customerId: null,
      proposedCustomerId: maria.id,
      candidates: [
        { customerId: maria.id, name: "Maria", scheduledBy: null },
        { customerId: pedro.id, name: "Pedro", scheduledBy: scheduledByMaria },
      ],
    });

    // A pessoa diz que é para o Pedro: a conversa reenvia prepare com ele.
    const forPedro = await registry.execute(
      {
        id: "call-prepare-pedro",
        name: "create_appointment",
        args: prepareArgs({ customerName: "Pedro", customerId: pedro.id }),
      },
      context(nextTurn),
    );
    expect(forPedro).toMatchObject({
      ok: true,
      data: {
        pendingAction: { customerId: pedro.id, proposedCustomerId: null },
      },
    });

    await registry.execute(
      {
        id: "call-confirm",
        name: "create_appointment",
        args: { action: "confirm" },
      },
      context("channel-1:message-3"),
    );
    expect(calls.createAppointment).toHaveLength(1);
    expect(calls.createAppointment[0]).toMatchObject({
      customerId: pedro.id,
      customerName: null,
      customerPhone: null,
    });
    expect(store.contactLinks).toHaveLength(1);
    // Vínculo = quem escreve (Maria); a última pessoa agendada = Pedro.
    expect(store.contactLinks[0].data.customerId).toBe(maria.id);
    expect(store.contactLinks[0].data.lastScheduledCustomerId).toBe(pedro.id);
  });

  it("contato sem vínculo: propõe Maria, com Pedro em candidates", async () => {
    const { prisma } = createPrisma(null);
    const { gateway } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      { id: "call-prepare", name: "create_appointment", args: prepareArgs() },
      context(),
    );

    expect(
      (prepared as { data: { customerIdentity: unknown } }).data
        .customerIdentity,
    ).toEqual({
      customerId: null,
      proposedCustomerId: maria.id,
      candidates: [
        { customerId: maria.id, name: "Maria", scheduledBy: null },
        { customerId: pedro.id, name: "Pedro", scheduledBy: scheduledByMaria },
      ],
    });
  });

  it("list_customer_candidates junta Maria e Pedro, com scheduledBy só em Pedro", async () => {
    const { prisma } = createPrisma(null);
    const { gateway } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const listed = await registry.execute(
      { id: "call-list", name: "list_customer_candidates", args: {} },
      context(),
    );

    expect(listed).toMatchObject({
      ok: true,
      data: {
        candidates: [
          { customerId: maria.id, name: "Maria", scheduledBy: null },
          {
            customerId: pedro.id,
            name: "Pedro",
            scheduledBy: scheduledByMaria,
          },
        ],
        requiresConfirmation: true,
      },
    });
  });

  it("o dependente que também é candidato do telefone aparece uma vez só, com o responsável", async () => {
    const { prisma } = createPrisma(null);
    const sharingPhone: SchedulingCustomerDependent = {
      id: joana.id,
      name: joana.name,
      phone,
      guardian: { id: maria.id, name: maria.name },
    };
    const { gateway } = createAgenda({
      candidates: [maria, joana],
      dependents: [sharingPhone],
    });
    const registry = new AssistantToolRegistry(prisma, gateway);

    const listed = await registry.execute(
      { id: "call-list", name: "list_customer_candidates", args: {} },
      context(),
    );

    expect(
      (listed as { data: { candidates: unknown } }).data.candidates,
    ).toEqual([
      { customerId: maria.id, name: "Maria", scheduledBy: null },
      { customerId: joana.id, name: "Joana", scheduledBy: scheduledByMaria },
    ]);
  });

  it("dois candidatos do telefone e um dependente: CUSTOMER_IDENTITY_AMBIGUOUS com os três", async () => {
    const { prisma, store } = createPrisma(null);
    const { gateway, calls } = createAgenda({ candidates: [maria, joana] });
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      { id: "call-prepare", name: "create_appointment", args: prepareArgs() },
      context(),
    );

    expect(prepared).toMatchObject({
      ok: false,
      error: {
        code: "CUSTOMER_IDENTITY_AMBIGUOUS",
        details: {
          candidates: [
            { customerId: maria.id, name: "Maria", scheduledBy: null },
            { customerId: joana.id, name: "Joana", scheduledBy: null },
            {
              customerId: pedro.id,
              name: "Pedro",
              scheduledBy: scheduledByMaria,
            },
          ],
        },
      },
    });
    expect(store.state.pendingAction).toBeUndefined();
    expect(calls.createHold).toHaveLength(0);
    expect(calls.createAppointment).toHaveLength(0);
  });
});

describe("Goal142 — número sem dependente: o mesmo resultado de antes", () => {
  it("list_customer_candidates devolve só as pessoas do telefone", async () => {
    const { prisma, store } = createPrisma(null);
    const { gateway } = createAgenda({ dependents: [] });
    const registry = new AssistantToolRegistry(prisma, gateway);

    const listed = await registry.execute(
      { id: "call-list", name: "list_customer_candidates", args: {} },
      context(),
    );

    expect((listed as { data: unknown }).data).toEqual({
      candidates: [{ customerId: maria.id, name: "Maria", scheduledBy: null }],
      requiresConfirmation: true,
    });
    expect(store.contactReads).toBe(0);
  });

  it("prepare com um candidato propõe a pessoa do telefone sem motivo novo e sem ler o vínculo", async () => {
    const { prisma, store } = createPrisma(maria.id);
    const { gateway, calls } = createAgenda({ dependents: [] });
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      { id: "call-prepare", name: "create_appointment", args: prepareArgs() },
      context(),
    );

    expect(
      (prepared as { data: { customerIdentity: unknown } }).data
        .customerIdentity,
    ).toEqual({
      customerId: null,
      proposedCustomerId: maria.id,
      candidates: [{ customerId: maria.id, name: "Maria", scheduledBy: null }],
    });
    expect(store.contactReads).toBe(0);
    expect(calls.createAppointment).toHaveLength(0);
  });

  it("prepare com dois candidatos continua CUSTOMER_IDENTITY_AMBIGUOUS com os dois", async () => {
    const { prisma } = createPrisma(null);
    const { gateway } = createAgenda({
      candidates: [maria, joana],
      dependents: [],
    });
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      { id: "call-prepare", name: "create_appointment", args: prepareArgs() },
      context(),
    );

    expect(prepared).toMatchObject({
      ok: false,
      error: { code: "CUSTOMER_IDENTITY_AMBIGUOUS" },
    });
    expect(
      (prepared as { error: { details: { candidates: unknown } } }).error
        .details.candidates,
    ).toEqual([
      { customerId: maria.id, name: "Maria", scheduledBy: null },
      { customerId: joana.id, name: "Joana", scheduledBy: null },
    ]);
  });

  it("prepare sem candidato não propõe ninguém: o cadastro nasce na confirmação", async () => {
    const { prisma } = createPrisma(null);
    const { gateway } = createAgenda({ candidates: [], dependents: [] });
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      { id: "call-prepare", name: "create_appointment", args: prepareArgs() },
      context(),
    );

    expect(
      (prepared as { data: { customerIdentity: unknown } }).data
        .customerIdentity,
    ).toEqual({ customerId: null, proposedCustomerId: null, candidates: [] });
  });
});

describe("Goal142 — Maria cancela e remarca o horário de Pedro", () => {
  it("prepare do cancelamento acha o horário de Pedro pelo número e diz para quem é", async () => {
    const { prisma } = createPrisma(null);
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      {
        id: "call-cancel-prepare",
        name: "cancel_appointment",
        args: { action: "prepare", appointmentId: pedroAppointment.id },
      },
      context(),
    );

    expect(prepared).toMatchObject({
      ok: true,
      data: {
        requiresConfirmation: true,
        appointment: { id: pedroAppointment.id, customerName: "Pedro" },
      },
    });
    expect(calls.findFutureAppointmentsForPhone).toEqual([
      { phone, options: { includeDependents: true } },
    ]);

    await registry.execute(
      {
        id: "call-cancel-confirm",
        name: "cancel_appointment",
        args: { action: "confirm" },
      },
      context(nextTurn),
    );
    expect(calls.cancelAppointment).toEqual([pedroAppointment.id]);
  });

  it("prepare da remarcação acha o horário de Pedro, segura o novo horário para ele e diz para quem é", async () => {
    const { prisma } = createPrisma(null);
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const prepared = await registry.execute(
      {
        id: "call-reschedule-prepare",
        name: "reschedule_appointment",
        args: {
          action: "prepare",
          appointmentId: pedroAppointment.id,
          date: "2026-10-21",
          startTime: "11:00",
        },
      },
      context(),
    );

    expect(prepared).toMatchObject({
      ok: true,
      data: {
        requiresConfirmation: true,
        currentAppointment: { id: pedroAppointment.id, customerName: "Pedro" },
      },
    });
    expect(calls.findFutureAppointmentsForPhone).toEqual([
      { phone, options: { includeDependents: true } },
    ]);
    expect(calls.createHold[0]).toMatchObject({ customerId: pedro.id });

    const confirmed = await registry.execute(
      {
        id: "call-reschedule-confirm",
        name: "reschedule_appointment",
        args: { action: "confirm" },
      },
      context(nextTurn),
    );
    expect(calls.rescheduleAppointment[0]).toMatchObject({
      appointmentId: pedroAppointment.id,
      date: "2026-10-21",
      startTime: "11:00",
    });
    expect(confirmed).toMatchObject({
      ok: true,
      data: { appointment: { id: pedroAppointment.id, customerName: "Pedro" } },
    });
  });

  it("a releitura da remarcação com hold vencido também inclui os dependentes", async () => {
    const { prisma } = createPrisma(null);
    const { gateway, calls } = createAgenda({ holdExpiredOnReschedule: true });
    const registry = new AssistantToolRegistry(prisma, gateway);

    await registry.execute(
      {
        id: "call-reschedule-prepare",
        name: "reschedule_appointment",
        args: {
          action: "prepare",
          appointmentId: pedroAppointment.id,
          date: "2026-10-21",
          startTime: "11:00",
        },
      },
      context(),
    );
    const confirmed = await registry.execute(
      {
        id: "call-reschedule-confirm",
        name: "reschedule_appointment",
        args: { action: "confirm" },
      },
      context(nextTurn),
    );

    expect(confirmed).toMatchObject({
      ok: false,
      error: { code: "APPOINTMENT_HOLD_EXPIRED" },
    });
    expect(calls.findFutureAppointmentsForPhone).toEqual([
      { phone, options: { includeDependents: true } },
      { phone, options: { includeDependents: true } },
    ]);
  });

  it("list_customer_appointments usa o número com os dependentes, sem vínculo e com vínculo", async () => {
    const unlinked = createAgenda();
    const withoutLink = await new AssistantToolRegistry(
      createPrisma(null).prisma,
      unlinked.gateway,
    ).execute(
      {
        id: "call-list-appointments",
        name: "list_customer_appointments",
        args: {},
      },
      context(),
    );
    expect(withoutLink).toMatchObject({
      ok: true,
      data: {
        appointments: [
          { id: mariaAppointment.id, customerName: "Maria" },
          { id: pedroAppointment.id, customerName: "Pedro" },
        ],
      },
    });
    expect(unlinked.calls.findFutureAppointmentsForPhone).toEqual([
      { phone, options: { includeDependents: true } },
    ]);

    const linked = createAgenda();
    await new AssistantToolRegistry(
      createPrisma(maria.id).prisma,
      linked.gateway,
    ).execute(
      {
        id: "call-list-appointments",
        name: "list_customer_appointments",
        args: {},
      },
      context(),
    );
    expect(linked.calls.findFutureAppointmentsForPhone).toEqual([
      { phone, options: { includeDependents: true } },
    ]);
    expect(linked.calls.findFutureAppointmentsForCustomer).toHaveLength(0);
  });
});

describe("Goal142 — a presença continua só com o telefone", () => {
  it("confirm_appointment_presence não acha o horário de Pedro pelo número de Maria", async () => {
    const { prisma } = createPrisma(null);
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
      { phone, options: undefined },
    ]);
  });

  it("confirm_appointment_presence segue achando o horário da própria Maria", async () => {
    const { prisma } = createPrisma(null);
    const { gateway, calls } = createAgenda();
    const registry = new AssistantToolRegistry(prisma, gateway);

    const result = await registry.execute(
      {
        id: "call-presence",
        name: "confirm_appointment_presence",
        args: { appointmentId: mariaAppointment.id },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { presenceConfirmed: true },
    });
    expect(calls.confirmAppointmentPresence).toEqual([mariaAppointment.id]);
  });
});

describe("Goal142 — leituras do cliente do Scheduling", () => {
  const requestContext: SchedulingRequestContext = {
    tenantId: "tenant-1",
    userId: "user-1",
    requestId: "request-1",
  };
  const originalCommandToken = env.SCHEDULING_SERVICE_COMMAND_TOKEN;
  const originalFetch = global.fetch;
  let requested: string[];

  beforeEach(() => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = "test-command-token";
    requested = [];
  });

  afterEach(() => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = originalCommandToken;
    global.fetch = originalFetch;
  });

  function respondWith(data: unknown) {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as typeof fetch;
  }

  function query(url: string) {
    return new URL(url).searchParams;
  }

  it("findFutureAppointmentsForPhone sem opção não pede os dependentes", async () => {
    respondWith([]);
    await new SchedulingClient().findFutureAppointmentsForPhone(
      phone,
      DEFAULT_BUSINESS_CONTEXT,
      requestContext,
    );

    expect(requested).toHaveLength(1);
    expect(new URL(requested[0]).pathname).toBe("/internal/appointments");
    expect(query(requested[0]).get("customerPhone")).toBe(phone);
    expect(query(requested[0]).has("includeDependents")).toBe(false);
  });

  it("findFutureAppointmentsForPhone com includeDependents pede os dependentes", async () => {
    respondWith([]);
    await new SchedulingClient().findFutureAppointmentsForPhone(
      phone,
      DEFAULT_BUSINESS_CONTEXT,
      requestContext,
      { includeDependents: true },
    );

    expect(query(requested[0]).get("includeDependents")).toBe("true");
  });

  it("findCustomerDependentsByPhone lê a rota dos dependentes e devolve o responsável", async () => {
    respondWith({ items: [pedro] });
    const dependents =
      await new SchedulingClient().findCustomerDependentsByPhone(
        phone,
        requestContext,
      );

    expect(new URL(requested[0]).pathname).toBe(
      "/internal/customers/dependents",
    );
    expect(query(requested[0]).get("phone")).toBe(phone);
    expect(dependents).toEqual([pedro]);
  });

  it("o teste de ativação e o resumo do cliente chamam as leituras sem includeDependents", () => {
    const sources = [
      "../../src/modules/activation-test/ActivationTestService.ts",
      "../../src/modules/activation-test/ActivationTestCleanupService.ts",
      "../../src/modules/memory/customer-summary-service.ts",
    ].map((path) => ({
      path,
      source: readFileSync(
        fileURLToPath(new URL(path, import.meta.url)),
        "utf8",
      ),
    }));

    // As leituras existem nesses consumidores — a prova não é vácua.
    expect(
      sources.some(({ source }) =>
        source.includes("findFutureAppointmentsForPhone("),
      ),
    ).toBe(true);
    expect(
      sources.some(({ source }) =>
        source.includes("findFutureAppointmentsForCustomer("),
      ),
    ).toBe(true);
    for (const { path, source } of sources) {
      expect(source, path).not.toContain("includeDependents");
      expect(source, path).not.toContain("findCustomerDependentsByPhone");
    }
  });
});
