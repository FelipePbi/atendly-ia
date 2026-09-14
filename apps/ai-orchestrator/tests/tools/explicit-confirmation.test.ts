/**
 * Confirmação explícita exigida por **código**, não por texto de prompt
 * (Goal011, critério 5).
 *
 * A regra do produto é que a IA nunca cria, remarca, cancela nem confirma uma
 * série sem que a cliente tenha dito sim. Até aqui isso dependia inteiramente
 * de o modelo obedecer à descrição da tool: nada impedia o mesmo turno de
 * chamar `prepare` e, na iteração seguinte, `confirm` — que é exatamente
 * confirmar sem ter perguntado, porque a cliente não teve turno nenhum para
 * responder.
 *
 * O rascunho passa a guardar o turno de entrada em que nasceu, e toda tool com
 * efeito recusa agir enquanto esse turno for o turno atual. São duas recusas
 * distintas de propósito: `NO_PENDING_CONFIRMATION` (não há o que confirmar) e
 * `CONFIRMATION_REQUIRED_SAME_TURN` (preparado agora mesmo, pergunte e espere).
 *
 * Cada caso verifica também que o **gateway não foi chamado**: recusar com uma
 * mensagem bonita e criar o agendamento assim mesmo continuaria passando numa
 * asserção que olhasse só o código de erro.
 */
import { describe, expect, it } from "vitest";

import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { deriveTurnId } from "../../src/modules/graph/graph-state.js";
import type { SchedulingGateway } from "../../src/modules/scheduling-service/client.js";
import type {
  ConfirmAppointmentSeriesInput,
  CreateSchedulingHoldInput,
  RescheduleAppointmentInput,
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingServiceDefinition,
} from "../../src/modules/scheduling-service/types.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";

const conversationId = "conversation-1";
const phone = "555591359589";
/** Turno em que a proposta é feita. */
const firstTurn = "channel-1:message-1";
/** Turno seguinte: é nele que a cliente responde e a confirmação vale. */
const secondTurn = "channel-1:message-2";

const service: SchedulingServiceDefinition = {
  id: "service-1",
  name: "Aplicacao 5D",
  duration: 60,
  priceType: "FIXED",
  price: 190,
  colorId: 1,
  recurrenceIntervalDays: null,
};
const slot = { date: "2026-06-08", startTime: "13:30", endTime: "14:30" };

const appointment: SchedulingAppointment = {
  id: "appointment-1",
  title: null,
  date: slot.date,
  startTime: slot.startTime,
  endTime: slot.endTime,
  duration: service.duration,
  customerId: "customer-1",
  customer: { id: "customer-1", name: "Thais", phone },
  services: [
    {
      serviceId: service.id,
      name: service.name,
      duration: service.duration,
      priceType: "FIXED",
      price: 190,
    },
  ],
  price: 190,
  totalPriceType: "FIXED",
  comments: null,
  status: "CONFIRMED",
  serviceId: service.id,
  serviceIds: [service.id],
  serviceName: service.name,
  customerName: "Thais",
};

function context(turnId: string) {
  return {
    conversationId,
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    turnId,
    phone,
    customerName: "Thais",
    businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
    aiRunId: "ai-run-1",
  };
}

/**
 * Gateway com contagem dos caminhos com efeito. Não basta o erro certo: o
 * efeito precisa não ter acontecido.
 */
function createAgenda() {
  const effects: {
    createAppointment: ScheduleAppointmentInput[];
    rescheduleAppointment: RescheduleAppointmentInput[];
    cancelAppointment: string[];
    confirmAppointmentSeries: ConfirmAppointmentSeriesInput[];
  } = {
    createAppointment: [],
    rescheduleAppointment: [],
    cancelAppointment: [],
    confirmAppointmentSeries: [],
  };
  const gateway = {
    listActiveServices: async () => [service],
    findService: async () => service,
    getAvailableSlotsForServices: async () => [slot],
    findCustomerCandidatesByPhone: async () => [],
    getAuthorizedCustomerContext: async () => null,
    findFutureAppointmentsForPhone: async () => [appointment],
    findFutureAppointmentsForCustomer: async () => [appointment],
    createHold: async (input: CreateSchedulingHoldInput) => ({
      id: "hold-1",
      date: input.date,
      startTime: input.startTime,
      endTime: slot.endTime,
      duration: service.duration,
      serviceIds: input.serviceIds,
      expiresAt: "2026-06-08T13:45:00.000Z",
      status: "ACTIVE" as const,
    }),
    releaseHold: async () => undefined,
    createAppointment: async (input: ScheduleAppointmentInput) => {
      effects.createAppointment.push(input);
      return appointment;
    },
    rescheduleAppointment: async (input: RescheduleAppointmentInput) => {
      effects.rescheduleAppointment.push(input);
      return appointment;
    },
    cancelAppointment: async (appointmentId: string) => {
      effects.cancelAppointment.push(appointmentId);
      return { appointmentId, cancelled: true as const };
    },
    previewAppointmentSeries: async (input: {
      occurrenceCount: number;
      firstStartTime: string;
    }) =>
      Array.from({ length: input.occurrenceCount }, (_, index) => ({
        index,
        requestedDate: slot.date,
        date: slot.date,
        startTime: input.firstStartTime,
        endTime: slot.endTime,
        adjusted: false,
        holdId: `hold-series-${index}`,
        unavailable: false,
      })),
    confirmAppointmentSeries: async (input: ConfirmAppointmentSeriesInput) => {
      effects.confirmAppointmentSeries.push(input);
      return [appointment];
    },
  } as unknown as SchedulingGateway;
  return { gateway, effects };
}

/** Prisma mínimo com estado da conversa vivo entre as chamadas. */
function createPrisma() {
  const store: { state: Record<string, unknown> } = { state: {} };
  const prisma = {
    contact: {
      findUnique: async () => null,
      updateMany: async () => ({ count: 1 }),
    },
    conversation: {
      findUnique: async () => ({ id: conversationId, state: store.state }),
      update: async (args: { data: { state?: Record<string, unknown> } }) => {
        if (args.data.state) store.state = args.data.state;
        return { id: conversationId, state: store.state };
      },
    },
    customerLink: { upsert: async () => ({}) },
    externalAppointment: {
      upsert: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    handoff: {
      findFirst: async () => null,
      create: async () => ({ id: "handoff-1" }),
    },
  } as unknown as PrismaClient;
  return { prisma, store };
}

function subject() {
  const { prisma, store } = createPrisma();
  const { gateway, effects } = createAgenda();
  return {
    registry: new AssistantToolRegistry(prisma, gateway),
    effects,
    store,
  };
}

const prepareScheduleCall = {
  id: "call-prepare-schedule",
  name: "create_appointment",
  args: {
    action: "prepare",
    serviceId: service.id,
    date: slot.date,
    startTime: slot.startTime,
    customerName: "Thais",
  },
};
const confirmScheduleCall = {
  id: "call-confirm-schedule",
  name: "create_appointment",
  args: { action: "confirm" },
};
const prepareRescheduleCall = {
  id: "call-prepare-reschedule",
  name: "reschedule_appointment",
  args: {
    action: "prepare",
    appointmentId: appointment.id,
    date: "2026-06-09",
    startTime: "10:00",
  },
};
const confirmRescheduleCall = {
  id: "call-confirm-reschedule",
  name: "reschedule_appointment",
  args: { action: "confirm" },
};
const prepareCancelCall = {
  id: "call-prepare-cancel",
  name: "cancel_appointment",
  args: { action: "prepare", appointmentId: appointment.id },
};
const confirmCancelCall = {
  id: "call-confirm-cancel",
  name: "cancel_appointment",
  args: { action: "confirm" },
};
const prepareSeriesCall = {
  id: "call-prepare-series",
  name: "prepare_recurring_appointments",
  args: {
    serviceId: service.id,
    occurrenceCount: 2,
    intervalDays: 7,
    firstDate: slot.date,
    firstStartTime: slot.startTime,
  },
};
const confirmSeriesCall = {
  id: "call-confirm-series",
  name: "confirm_recurring_appointments",
  args: {
    serviceId: service.id,
    holdIds: ["hold-series-0", "hold-series-1"],
    intervalDays: 7,
    customerName: "Thais",
  },
};

describe("preparar e confirmar no mesmo turno de entrada e recusado", () => {
  it("nao cria o agendamento preparado na mesma mensagem", async () => {
    const { registry, effects } = subject();

    const prepared = await registry.execute(
      prepareScheduleCall,
      context(firstTurn),
    );
    expect(prepared.ok).toBe(true);

    const confirmed = await registry.execute(
      confirmScheduleCall,
      context(firstTurn),
    );

    expect(confirmed).toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_REQUIRED_SAME_TURN" },
    });
    // O efeito e o que importa: recusar e criar assim mesmo passaria numa
    // assercao que olhasse so o codigo.
    expect(effects.createAppointment).toEqual([]);
  });

  it("nao remarca o que foi preparado na mesma mensagem", async () => {
    const { registry, effects } = subject();

    await registry.execute(prepareRescheduleCall, context(firstTurn));
    const confirmed = await registry.execute(
      confirmRescheduleCall,
      context(firstTurn),
    );

    expect(confirmed).toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_REQUIRED_SAME_TURN" },
    });
    expect(effects.rescheduleAppointment).toEqual([]);
  });

  it("nao cancela o que foi preparado na mesma mensagem", async () => {
    const { registry, effects } = subject();

    await registry.execute(prepareCancelCall, context(firstTurn));
    const confirmed = await registry.execute(
      confirmCancelCall,
      context(firstTurn),
    );

    expect(confirmed).toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_REQUIRED_SAME_TURN" },
    });
    expect(effects.cancelAppointment).toEqual([]);
  });

  it("nao confirma a serie preparada na mesma mensagem", async () => {
    const { registry, effects } = subject();

    await registry.execute(prepareSeriesCall, context(firstTurn));
    const confirmed = await registry.execute(
      confirmSeriesCall,
      context(firstTurn),
    );

    expect(confirmed).toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_REQUIRED_SAME_TURN" },
    });
    expect(effects.confirmAppointmentSeries).toEqual([]);
  });
});

describe("confirmar sem rascunho e recusado", () => {
  it("recusa confirmar agendamento, remarcacao, cancelamento e serie sem nada preparado", async () => {
    for (const call of [
      confirmScheduleCall,
      confirmRescheduleCall,
      confirmCancelCall,
      confirmSeriesCall,
    ]) {
      const { registry, effects } = subject();
      const result = await registry.execute(call, context(secondTurn));

      expect(result).toMatchObject({
        ok: false,
        error: { code: "NO_PENDING_CONFIRMATION" },
      });
      expect(effects.createAppointment).toEqual([]);
      expect(effects.rescheduleAppointment).toEqual([]);
      expect(effects.cancelAppointment).toEqual([]);
      expect(effects.confirmAppointmentSeries).toEqual([]);
    }
  });

  it("recusa confirmar a serie com reserva que nao veio do rascunho desta conversa", async () => {
    const { registry, effects } = subject();

    await registry.execute(prepareSeriesCall, context(firstTurn));
    const confirmed = await registry.execute(
      {
        ...confirmSeriesCall,
        args: { ...confirmSeriesCall.args, holdIds: ["hold-de-outra-pessoa"] },
      },
      context(secondTurn),
    );

    expect(confirmed).toMatchObject({
      ok: false,
      error: { code: "NO_PENDING_CONFIRMATION" },
    });
    expect(effects.confirmAppointmentSeries).toEqual([]);
  });
});

describe("o turno seguinte confirma normalmente", () => {
  it("cria o agendamento quando a confirmacao chega no turno seguinte", async () => {
    const { registry, effects, store } = subject();

    await registry.execute(prepareScheduleCall, context(firstTurn));
    const confirmed = await registry.execute(
      confirmScheduleCall,
      context(secondTurn),
    );

    expect(confirmed.ok).toBe(true);
    expect(effects.createAppointment).toHaveLength(1);
    expect(store.state.pendingAction).toBeUndefined();
  });

  it("remarca, cancela e confirma a serie quando a confirmacao chega no turno seguinte", async () => {
    const reschedule = subject();
    await reschedule.registry.execute(
      prepareRescheduleCall,
      context(firstTurn),
    );
    await expect(
      reschedule.registry.execute(confirmRescheduleCall, context(secondTurn)),
    ).resolves.toMatchObject({ ok: true });
    expect(reschedule.effects.rescheduleAppointment).toHaveLength(1);

    const cancel = subject();
    await cancel.registry.execute(prepareCancelCall, context(firstTurn));
    await expect(
      cancel.registry.execute(confirmCancelCall, context(secondTurn)),
    ).resolves.toMatchObject({ ok: true });
    expect(cancel.effects.cancelAppointment).toEqual([appointment.id]);

    const series = subject();
    await series.registry.execute(prepareSeriesCall, context(firstTurn));
    await expect(
      series.registry.execute(confirmSeriesCall, context(secondTurn)),
    ).resolves.toMatchObject({ ok: true });
    expect(series.effects.confirmAppointmentSeries).toHaveLength(1);
  });

  it("preparar de novo recomeca a espera: o novo rascunho precisa do proximo turno", async () => {
    const { registry, effects } = subject();

    await registry.execute(prepareScheduleCall, context(firstTurn));
    // A cliente muda de ideia e a IA propoe outro horario no turno 2 — esse
    // turno passa a ser o turno de origem do rascunho.
    await registry.execute(
      {
        ...prepareScheduleCall,
        args: { ...prepareScheduleCall.args, startTime: "15:30" },
      },
      context(secondTurn),
    );

    await expect(
      registry.execute(confirmScheduleCall, context(secondTurn)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_REQUIRED_SAME_TURN" },
    });
    expect(effects.createAppointment).toEqual([]);

    await expect(
      registry.execute(confirmScheduleCall, context("channel-1:message-3")),
    ).resolves.toMatchObject({ ok: true });
    expect(effects.createAppointment).toHaveLength(1);
  });
});

/**
 * Confirmacao clara **em audio** (Goal013/WU-03).
 *
 * A transcricao vira o texto do turno, e o turno de um audio nasce da mesma
 * `deriveTurnId` do texto: por isso a confirmacao por voz nao ganha nenhuma
 * excecao aqui. Os dois casos abaixo sao os mesmos do texto, so que o turno e
 * de audio — preparar e confirmar no mesmo audio continua recusado, e o audio
 * seguinte confirma.
 */
function audioTurn(messageId: string): string {
  const message: ChannelInboundMessage = {
    provider: "evolution-go",
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    instanceId: "instance-1",
    messageId,
    chatId: `${phone}@s.whatsapp.net`,
    customerPhone: phone,
    fromMe: false,
    isGroup: false,
    kind: "audio",
    raw: {},
  };
  return deriveTurnId(message);
}

describe("confirmacao clara em audio segue os mesmos guards do Goal011", () => {
  const firstAudioTurn = audioTurn("message-audio-1");
  const secondAudioTurn = audioTurn("message-audio-2");

  it("nao confirma no mesmo audio em que preparou", async () => {
    const { registry, effects } = subject();

    await registry.execute(prepareScheduleCall, context(firstAudioTurn));
    const confirmed = await registry.execute(
      confirmScheduleCall,
      context(firstAudioTurn),
    );

    expect(confirmed).toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_REQUIRED_SAME_TURN" },
    });
    expect(effects.createAppointment).toEqual([]);
  });

  it("confirma quando a confirmacao clara chega no audio seguinte", async () => {
    const { registry, effects } = subject();

    await registry.execute(prepareScheduleCall, context(firstAudioTurn));
    await expect(
      registry.execute(confirmScheduleCall, context(secondAudioTurn)),
    ).resolves.toMatchObject({ ok: true });

    expect(effects.createAppointment).toHaveLength(1);
  });
});
