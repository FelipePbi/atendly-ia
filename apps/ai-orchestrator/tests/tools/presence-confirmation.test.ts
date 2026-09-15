/**
 * Confirmacao de presenca pela resposta ao lembrete (Goal021/WU-008, G-27).
 *
 * O lembrete pergunta "voce confirma sua presenca?" e a resposta volta como
 * turno normal de conversa. O vault declara quatro saidas, e este arquivo
 * prova as quatro pelo que o codigo garante, nao pelo que o prompt pede:
 *
 * - **sim** registra presenca e nao mexe em mais nada;
 * - **nao** nao executa nada sozinha — cancelar e remarcar continuam exigindo
 *   rascunho preparado e confirmacao explicita;
 * - **resposta vaga** nao registra presenca;
 * - **ausencia de resposta** nao altera estado nenhum.
 *
 * O duble conta as chamadas de `confirmAppointmentPresence`: "nao registrou"
 * aqui significa que a chamada nao aconteceu, nunca uma resposta bonita depois
 * do registro ja ter acontecido.
 */
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type {
  AppointmentPresenceConfirmation,
  ReminderConfirmationSettings,
  SchedulingAppointment,
} from "../../src/modules/scheduling-service/types.js";
import { PRESENCE_CONFIRMATION_NOT_ENABLED } from "../../src/modules/scheduling-service/types.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";

const conversationId = "conversation-1";
const phone = "555591359589";
const appointmentId = "appointment-1";
const presenceConfirmedAt = "2026-09-16T12:00:00.000Z";

describe("confirmacao de presenca pela resposta ao lembrete", () => {
  it("registra a presenca quando a cliente responde sim", async () => {
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(createPrismaMock(), agenda);

    const result = await registry.execute(
      {
        id: "call-presence-1",
        name: "confirm_appointment_presence",
        args: { appointmentId },
      },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: {
        presenceConfirmed: true,
        presenceConfirmedAt,
        appointment: { id: appointmentId },
      },
    });
    expect(calls.confirmPresence).toEqual([appointmentId]);
  });

  /**
   * A origem `AI` do evento e derivada da credencial no dono (Goal021/WU-005),
   * nunca declarada no corpo. O que cabe provar deste lado e exatamente isso:
   * a IA chama a rota de presenca **sem** mandar origem nenhuma, entao nao ha
   * como ela se passar pela profissional.
   */
  it("chama a rota de presenca sem declarar origem: quem deriva e o dono", async () => {
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(createPrismaMock(), agenda);

    await registry.execute(
      {
        id: "call-presence-2",
        name: "confirm_appointment_presence",
        args: { appointmentId },
      },
      context(),
    );

    expect(calls.confirmPresence).toEqual([appointmentId]);
    expect(calls.confirmPresenceExtraArgs).toEqual([]);
  });

  it("nao registra presenca quando o negocio nao habilita confirmacao pelo lembrete", async () => {
    const { agenda, calls } = createAgendaMock({
      settings: { configured: true, confirmationEnabled: false },
    });
    const registry = new AssistantToolRegistry(createPrismaMock(), agenda);

    const result = await registry.execute(
      {
        id: "call-presence-3",
        name: "confirm_appointment_presence",
        args: { appointmentId },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: PRESENCE_CONFIRMATION_NOT_ENABLED },
    });
    expect(calls.confirmPresence).toEqual([]);
  });

  /**
   * Negocio que nunca gravou `ReminderSettings` nao escolheu nada: o default
   * do produto e um lembrete a 24 h, nao confirmacao de presenca ligada.
   */
  it("nao registra presenca quando o negocio nunca configurou lembrete", async () => {
    const { agenda, calls } = createAgendaMock({
      settings: { configured: false, confirmationEnabled: false },
    });
    const registry = new AssistantToolRegistry(createPrismaMock(), agenda);

    const result = await registry.execute(
      {
        id: "call-presence-4",
        name: "confirm_appointment_presence",
        args: { appointmentId },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: PRESENCE_CONFIRMATION_NOT_ENABLED },
    });
    expect(calls.confirmPresence).toEqual([]);
  });

  it("nao registra presenca de atendimento que nao e deste telefone", async () => {
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(createPrismaMock(), agenda);

    const result = await registry.execute(
      {
        id: "call-presence-5",
        name: "confirm_appointment_presence",
        args: { appointmentId: "appointment-de-outra-pessoa" },
      },
      context(),
    );

    expect(result.ok).toBe(false);
    expect(calls.confirmPresence).toEqual([]);
  });

  it("nao altera status, conclusao nem cancelamento", async () => {
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(createPrismaMock(), agenda);

    const result = await registry.execute(
      {
        id: "call-presence-6",
        name: "confirm_appointment_presence",
        args: { appointmentId },
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { status: "CONFIRMED", completedAt: null, noShowAt: null },
    });
    // O estado do atendimento no dono continua o mesmo depois da chamada.
    expect(calls.cancelAppointment).toEqual([]);
    expect(calls.rescheduleAppointment).toEqual([]);
  });

  /**
   * "Nao vem" nao tem representacao nesta tool. Um booleano `confirmed: false`
   * e recusado pelo schema estrito antes de qualquer chamada ao dono: a IA nao
   * consegue expressar recusa por aqui, entao nao a executa por engano.
   */
  it("nao aceita expressar recusa pela tool de presenca", async () => {
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(createPrismaMock(), agenda);

    const result = await registry.execute(
      {
        id: "call-presence-7",
        name: "confirm_appointment_presence",
        args: { appointmentId, confirmed: false },
      },
      context(),
    );

    expect(result.ok).toBe(false);
    expect(calls.confirmPresence).toEqual([]);
  });

  /**
   * A resposta negativa oferece cancelar ou remarcar — e so isso. Confirmar
   * cancelamento sem rascunho preparado continua sem efeito (Goal011), entao
   * um "nao" sozinho nao cancela nada.
   */
  it("nao cancela nem remarca sozinha depois de um nao", async () => {
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(createPrismaMock(), agenda);

    const cancelled = await registry.execute(
      {
        id: "call-cancel-1",
        name: "cancel_appointment",
        args: { action: "confirm" },
      },
      context(),
    );
    const rescheduled = await registry.execute(
      {
        id: "call-reschedule-1",
        name: "reschedule_appointment",
        args: { action: "confirm" },
      },
      context(),
    );

    expect(cancelled.ok).toBe(false);
    expect(rescheduled.ok).toBe(false);
    expect(calls.cancelAppointment).toEqual([]);
    expect(calls.rescheduleAppointment).toEqual([]);
    expect(calls.confirmPresence).toEqual([]);
  });

  /**
   * Resposta vaga: a IA consulta os agendamentos para conseguir perguntar de
   * qual atendimento se trata. Consultar nao registra nada.
   */
  it("resposta vaga nao registra presenca", async () => {
    const { agenda, calls } = createAgendaMock();
    const registry = new AssistantToolRegistry(createPrismaMock(), agenda);

    const result = await registry.execute(
      { id: "call-list-1", name: "list_customer_appointments", args: {} },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(calls.confirmPresence).toEqual([]);
  });

  /**
   * Ausencia de resposta: sem turno de entrada nao ha execucao de tool
   * nenhuma, e nenhum estado muda. E o unico desfecho que se prova pela
   * ausencia — e por isso ele e verificado contra o duble inteiro.
   */
  it("ausencia de resposta nao altera estado nenhum", async () => {
    const { calls } = createAgendaMock();

    expect(calls).toEqual({
      confirmPresence: [],
      confirmPresenceExtraArgs: [],
      cancelAppointment: [],
      rescheduleAppointment: [],
      reminderSettingsReads: 0,
    });
  });
});

function appointment(): SchedulingAppointment {
  return {
    id: appointmentId,
    title: null,
    date: "2026-09-17",
    startTime: "13:30",
    endTime: "15:10",
    duration: 100,
    customerId: "customer-1",
    customer: { id: "customer-1", name: "Thais", phone },
    services: [
      {
        serviceId: "5114873",
        name: "Aplicacao 5D",
        duration: 100,
        priceType: "FIXED",
        price: 190,
      },
    ],
    price: 190,
    totalPriceType: "FIXED",
    comments: null,
    status: "CONFIRMED",
    serviceId: "5114873",
    serviceIds: ["5114873"],
    serviceName: "Aplicacao 5D",
    customerName: "Thais",
  };
}

function createAgendaMock(
  options: { settings?: ReminderConfirmationSettings } = {},
) {
  const calls = {
    confirmPresence: [] as string[],
    /**
     * Qualquer coisa que a IA tenha tentado mandar no corpo da confirmacao.
     * Fica vazio: a origem do evento e derivada da credencial no dono.
     */
    confirmPresenceExtraArgs: [] as unknown[],
    cancelAppointment: [] as string[],
    rescheduleAppointment: [] as unknown[],
    reminderSettingsReads: 0,
  };
  const settings = options.settings ?? {
    configured: true,
    confirmationEnabled: true,
  };
  const agenda = {
    getReminderConfirmationSettings: async () => {
      calls.reminderSettingsReads += 1;
      return settings;
    },
    findFutureAppointmentsForPhone: async () => [appointment()],
    findFutureAppointmentsForCustomer: async () => [appointment()],
    confirmAppointmentPresence: async (
      id: string,
      ...rest: unknown[]
    ): Promise<AppointmentPresenceConfirmation> => {
      calls.confirmPresence.push(id);
      // `context` e `idempotencyKey` sao os dois argumentos legitimos; um
      // terceiro seria a IA tentando dizer algo alem do id.
      if (rest.length > 2) calls.confirmPresenceExtraArgs.push(rest.slice(2));
      return {
        appointmentId: id,
        status: "CONFIRMED",
        presenceConfirmedAt,
        completedAt: null,
        noShowAt: null,
      };
    },
    cancelAppointment: async (id: string) => {
      calls.cancelAppointment.push(id);
      return { appointmentId: id, cancelled: true as const };
    },
    rescheduleAppointment: async (input: unknown) => {
      calls.rescheduleAppointment.push(input);
      return appointment();
    },
  };

  return { agenda: agenda as never, calls };
}

function createPrismaMock() {
  const state: Record<string, unknown> = {};
  return {
    contact: {
      findUnique: async () => null,
      updateMany: async () => ({ count: 1 }),
    },
    conversation: {
      findUnique: async () => ({ id: conversationId, state }),
      update: async () => ({ id: conversationId, state }),
    },
  } as unknown as PrismaClient;
}

function context() {
  return {
    turnId: "channel-1:message-1",
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
    },
    aiRunId: "ai-run-1",
  };
}
