import { beforeEach, describe, expect, it } from "vitest";

import type { PlatformWhatsAppConfig } from "../../src/config/platform-whatsapp.js";
import { AppError, InfrastructureError } from "../../src/lib/errors.js";
import {
  ACTIVATION_TEST_MAX_ATTEMPTS,
  ACTIVATION_TEST_MILESTONES,
  ACTIVATION_TEST_REFUSALS,
  type ActivationTestMilestoneName,
  activationTestProgress,
} from "../../src/modules/activation-test/activation-test-run.js";
import { ActivationTestService } from "../../src/modules/activation-test/ActivationTestService.js";
import type {
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingServiceDefinition,
} from "../../src/modules/scheduling-service/types.js";
import { InMemoryActivationTestRuns } from "./support/in-memory-activation-test-runs.js";

const TENANT = "tenant-activation";
const PLATFORM: PlatformWhatsAppConfig = {
  instanceId: "atendly-platform",
  credential: "platform-credential",
  number: "5511911112222",
};
const TENANT_PHONE = "5511988887777";

const SERVICE: SchedulingServiceDefinition = {
  id: "service-1",
  name: "Corte",
  duration: 60,
  priceType: "FIXED",
  price: 120,
  colorId: null,
  recurrenceIntervalDays: null,
};

const SLOT = { date: "2026-09-16", startTime: "09:00", endTime: "10:00" };

function appointment(input: ScheduleAppointmentInput): SchedulingAppointment {
  return {
    id: "appointment-1",
    title: null,
    date: input.date,
    startTime: input.startTime,
    endTime: "10:00",
    duration: 60,
    customerId: "customer-1",
    customer: { id: "customer-1", name: "Atendly (teste)", phone: null },
    services: [],
    price: 120,
    totalPriceType: "FIXED",
    comments: input.comments ?? null,
    status: "CONFIRMED",
    serviceId: input.serviceId,
    serviceIds: [input.serviceId],
    serviceName: SERVICE.name,
    customerName: "Atendly (teste)",
  };
}

/** Agenda dupla: nenhuma rede, e cada chamada fica contada. */
class SchedulingDouble {
  services: SchedulingServiceDefinition[] = [SERVICE];
  slotsByCall: Array<(typeof SLOT)[]> = [];
  defaultSlots: (typeof SLOT)[] = [SLOT];
  availabilityCalls = 0;
  createCalls: ScheduleAppointmentInput[] = [];
  createIdempotencyKeys: (string | undefined)[] = [];
  failCreateWith: Error | null = null;
  /** O que a agenda mostra depois de a IA criar o agendamento. */
  agenda: SchedulingAppointment[] = [
    appointment({
      serviceId: SERVICE.id,
      date: SLOT.date,
      startTime: SLOT.startTime,
    } as ScheduleAppointmentInput),
  ];

  async listActiveServices() {
    return this.services;
  }

  async findService(serviceId: string) {
    const service = this.services.find((item) => item.id === serviceId);
    if (!service) throw new AppError("service not found", { statusCode: 404 });
    return service;
  }

  async getAvailableSlotsForServices() {
    const scripted = this.slotsByCall[this.availabilityCalls];
    this.availabilityCalls += 1;
    return scripted ?? this.defaultSlots;
  }

  async createAppointment(
    input: ScheduleAppointmentInput,
    _context?: unknown,
    idempotencyKey?: string,
  ) {
    this.createCalls.push(input);
    this.createIdempotencyKeys.push(idempotencyKey);
    if (this.failCreateWith) throw this.failCreateWith;
    return appointment(input);
  }

  /**
   * Agenda do numero da plataforma.
   *
   * O servico le daqui a **pessoa** que a IA vinculou ao agendamento que ela
   * criou: e leitura de prova, e o que autoriza a limpeza depois e o id do
   * agendamento, nunca o telefone.
   */
  async findFutureAppointmentsForPhone() {
    return this.agenda;
  }
}

/** Porta de envio dublada: o numero da plataforma nunca toca em rede aqui. */
class SenderDouble {
  sends: { phone: string; text: string; runId: string }[] = [];
  failures = 0;
  failWith: Error = new InfrastructureError("transport unavailable");

  async sendToTenantUnderTest(
    recipient: { tenantId: string; runId: string; phone: string },
    message: { text: string },
  ) {
    if (this.failures > 0) {
      this.failures -= 1;
      throw this.failWith;
    }
    this.sends.push({
      phone: recipient.phone,
      text: message.text,
      runId: recipient.runId,
    });
    return { provider: "evolution-go" as const, raw: {} };
  }
}

/**
 * A IA dublada.
 *
 * Ela substitui **o modelo**, nunca a maquina de estados: recebe a fala do
 * cliente simulado, decide o que fazer, registra as chamadas de ferramenta em
 * `runs.aiToolCalls` e grava a propria resposta na conversa — exatamente os
 * registros que o agente de verdade deixa. O servico continua sem escrever
 * nada em nome dela.
 *
 * `silent` e o contrario disso: uma IA que recebe a mensagem e nao faz nada.
 * E o caso que prova que os marcos da IA nao se completam sozinhos.
 *
 * `replyDelivery` representa o que o transporte do tenant fez com a resposta:
 * o driver de producao envia a linha que a IA gravou e reconcilia o estado, e
 * `PENDING` e exatamente o que sobra quando esse envio nao acontece.
 */
class AiDouble {
  deliveries: string[] = [];
  silent = false;
  /** Ferramentas que a IA deixa de chamar, para provar cada marco isolado. */
  skipTools = new Set<string>();
  appointmentId = "appointment-1";
  /** Estado de entrega da resposta da IA pelo canal do tenant. */
  replyDelivery: string = "SENT";
  private sequence = 0;

  constructor(private readonly runs: InMemoryActivationTestRuns) {}

  async deliver(input: {
    tenantId: string;
    channelId: string;
    text: string;
    externalMessageId: string;
  }) {
    this.deliveries.push(input.text);
    const conversationId = `conversation-${input.tenantId}`;
    const client = await this.runs.recordConversationMessage({
      tenantId: input.tenantId,
      channelId: input.channelId,
      conversationId,
      author: "CLIENT",
      body: input.text,
      correlationId: input.externalMessageId,
      externalMessageId: input.externalMessageId,
    });
    if (this.silent) {
      return {
        clientMessageId: client.id,
        conversationId,
        aiMessageId: "",
        aiText: "",
        toolCalls: [],
      };
    }

    const lowered = input.text.toLowerCase();
    const toolCalls: Array<{
      id: string;
      name: string;
      status: string;
      result: unknown;
    }> = [];
    let reply = "Certo!";

    // A ordem importa: "pode reservar esse horario" tambem contem "horario".
    if (lowered.includes("reservar")) {
      reply = `Confirmado para ${SLOT.date} as ${SLOT.startTime}.`;
      this.callTool(
        conversationId,
        "create_appointment",
        { appointment: { id: this.appointmentId } },
        toolCalls,
      );
    } else if (lowered.includes("custa")) {
      reply = `${SERVICE.name}: R$ ${SERVICE.price?.toFixed(2)}.`;
      this.callTool(conversationId, "list_services", { services: [SERVICE] }, toolCalls);
    } else if (lowered.includes("horario")) {
      reply = `Tenho ${SLOT.date} as ${SLOT.startTime}. Posso reservar?`;
      this.callTool(
        conversationId,
        "get_availability",
        { slots: [SLOT] },
        toolCalls,
      );
    }

    const aiMessage = await this.runs.recordConversationMessage({
      tenantId: input.tenantId,
      channelId: input.channelId,
      conversationId,
      author: "AI",
      body: reply,
      correlationId: `${input.externalMessageId}-ai`,
    });
    // O driver real envia a resposta pelo canal do tenant e reconcilia a
    // linha. Aqui o dublê so representa o desfecho desse envio.
    this.runs.markDelivery(aiMessage.id, this.replyDelivery);
    return {
      clientMessageId: client.id,
      conversationId,
      aiMessageId: aiMessage.id,
      aiText: reply,
      toolCalls,
      aiDelivery:
        this.replyDelivery === "SENT"
          ? ({ state: "SENT" } as const)
          : ({ state: "FAILED", detail: this.replyDelivery } as const),
    };
  }

  private callTool(
    conversationId: string,
    name: string,
    result: unknown,
    into: Array<{ id: string; name: string; status: string; result: unknown }>,
  ) {
    if (this.skipTools.has(name)) return;
    this.sequence += 1;
    const row = {
      conversationId,
      id: `tool-${this.sequence}`,
      name,
      status: "SUCCEEDED",
      result,
      createdAt: new Date(),
    };
    this.runs.aiToolCalls.push(row);
    into.push({ id: row.id, name, status: row.status, result });
  }
}

function build(
  overrides: {
    runs?: InMemoryActivationTestRuns;
    scheduling?: SchedulingDouble;
    sender?: SenderDouble;
    platformConfig?: () => PlatformWhatsAppConfig;
    now?: () => Date;
    ai?: AiDouble;
  } = {},
) {
  const runs = overrides.runs ?? new InMemoryActivationTestRuns();
  const scheduling = overrides.scheduling ?? new SchedulingDouble();
  const sender = overrides.sender ?? new SenderDouble();
  const ai = overrides.ai ?? new AiDouble(runs);
  const service = new ActivationTestService({
    runs,
    scheduling: scheduling as never,
    sender: sender as never,
    ai: ai as never,
    platformConfig: overrides.platformConfig ?? (() => PLATFORM),
    retryDelayMs: 0,
    sleep: async () => {},
    ...(overrides.now ? { now: overrides.now } : {}),
  });
  return { ai, runs, scheduling, sender, service };
}

const startInput = {
  tenantId: TENANT,
  userId: "user-1",
  requestId: "request-1",
  tenantPhone: TENANT_PHONE,
};

function reached(
  milestones: Awaited<ReturnType<InMemoryActivationTestRuns["listMilestones"]>>,
): ActivationTestMilestoneName[] {
  return activationTestProgress(milestones)
    .filter((item) => item.reached)
    .map((item) => item.milestone);
}

describe("execucao do teste real: caminho feliz", () => {
  it("percorre os seis marcos do vault e cada um aponta para o fato gravado", async () => {
    const { ai, runs, scheduling, sender, service } = build();

    const started = await service.start(startInput);
    expect(started.state).toBe("RUNNING");
    // IDs do que a execucao criou, gravados no momento da criacao: e por eles
    // que a limpeza remove depois, nunca por telefone ou nome.
    expect(started.conversationId).toBe(`conversation-${TENANT}`);
    expect(started.contactId).toBe(`contact-${TENANT}`);

    const finished = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(finished?.state).toBe("SUCCEEDED");
    expect(finished?.finishedAt).not.toBeNull();
    expect(finished?.appointmentId).toBe("appointment-1");
    expect(finished?.customerId).toBe("customer-1");

    const milestones = await runs.listMilestones(TENANT, started.id);
    const progress = activationTestProgress(milestones);
    expect(progress.map((item) => item.milestone)).toEqual([
      ...ACTIVATION_TEST_MILESTONES,
    ]);
    expect(progress.every((item) => item.reached)).toBe(true);

    // Cada marco aponta para uma mensagem que a execucao gravou de verdade.
    //
    // A comparacao e com `createdMessageIds` — o registro do que a execucao
    // criou — e nao com as linhas vivas, porque a limpeza do fim do teste
    // (Goal019 §6) ja removeu as linhas. O fato continua rastreavel: o ID do
    // marco tem de estar entre os que a execucao gravou no momento da criacao.
    const messageIds = new Set(finished?.createdMessageIds ?? []);
    expect(messageIds.size).toBeGreaterThan(0);
    for (const item of progress) {
      expect(item.source?.id).toBeTruthy();
      if (item.source?.kind === "MESSAGE") {
        expect(messageIds.has(item.source.id)).toBe(true);
      }
    }
    // E as linhas sairam: o teste real nao deixa conversa de teste para tras.
    expect(runs.messages).toHaveLength(0);
    // Os marcos da IA apontam para o que **ela** registrou: a chamada de
    // catalogo, a consulta de agenda e o agendamento que ela criou. Os ids
    // vêm de `runs.aiToolCalls`, que só a IA escreve.
    const toolCallIdOf = (name: string) =>
      runs.aiToolCalls.find((call) => call.name === name)?.id;
    expect(
      progress.find((item) => item.milestone === "SERVICE_IDENTIFIED")?.source,
    ).toEqual({ kind: "SERVICE", id: toolCallIdOf("list_services") });
    expect(
      progress.find((item) => item.milestone === "AVAILABILITY_CHECKED")
        ?.source,
    ).toEqual({
      kind: "AVAILABILITY",
      id: toolCallIdOf("get_availability"),
    });
    expect(
      progress.find((item) => item.milestone === "APPOINTMENT_CONFIRMED")
        ?.source,
    ).toEqual({ kind: "APPOINTMENT", id: "appointment-1" });

    // O aviso separado sai antes de qualquer demonstracao e nao vira marco.
    expect(sender.sends[0]?.text).toContain("conversa de teste da Atendly");
    expect(sender.sends.every((send) => send.phone === TENANT_PHONE)).toBe(
      true,
    );

    // O agendamento e criado **pela IA**, pela ferramenta dela. O servico do
    // teste nao chama a agenda para escrever em lugar nenhum: se ele voltasse
    // a chamar, esta assercao quebraria.
    expect(scheduling.createCalls).toHaveLength(0);
    expect(
      runs.aiToolCalls.map((call) => call.name),
    ).toEqual(["list_services", "get_availability", "create_appointment"]);
    // E a IA foi exercitada de verdade: cada fala do cliente simulado entrou
    // nela, e as respostas da conversa sao as que ela gravou.
    expect(ai.deliveries).toEqual([
      `Oi! Quanto custa ${SERVICE.name}?`,
      "Otimo. Qual o proximo horario disponivel?",
      "Perfeito, pode reservar esse horario.",
    ]);
  });

  it("nao depende de tela: a execucao e lida do servidor depois de terminada", async () => {
    const { service } = build();
    const started = await service.start(startInput);
    await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    const current = await service.current({
      tenantId: TENANT,
      userId: "user-1",
      requestId: "request-1",
    });
    expect(current?.id).toBe(started.id);
    expect(current?.state).toBe("SUCCEEDED");
  });
});

describe("uma unica execucao viva por tenant", () => {
  it("iniciar com outra em andamento nao cria a segunda", async () => {
    const { runs, service } = build();
    await service.start(startInput);

    await expect(service.start(startInput)).rejects.toMatchObject({
      code: ACTIVATION_TEST_REFUSALS.ALREADY_RUNNING,
      statusCode: 409,
    });
    expect(runs.runs).toHaveLength(1);
  });

  it("iniciar com uma pausada tambem nao cria a segunda", async () => {
    const { runs, service } = build();
    const started = await service.start(startInput);
    runs.humanReplies(TENANT, `conversation-${TENANT}`, "Oi, sou eu");
    await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    await expect(service.start(startInput)).rejects.toMatchObject({
      code: ACTIVATION_TEST_REFUSALS.ALREADY_RUNNING,
    });
    expect(runs.runs).toHaveLength(1);
  });

  it("reiniciar descarta a pausada e comeca uma nova, sem chamar de falha", async () => {
    const { runs, service } = build();
    const started = await service.start(startInput);
    runs.humanReplies(TENANT, `conversation-${TENANT}`, "Oi, sou eu");
    await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    const restarted = await service.restart(startInput);
    expect(restarted.id).not.toBe(started.id);
    const discarded = runs.runs.find((run) => run.id === started.id);
    expect(discarded?.state).toBe("DISCARDED");
    expect(discarded?.state).not.toBe("FAILED");
  });
});

describe("recusas de inicio", () => {
  it.each([
    [
      "sem WhatsApp conectado",
      (runs: InMemoryActivationTestRuns, scheduling: SchedulingDouble) => {
        void scheduling;
        runs.channel = null;
      },
      ACTIVATION_TEST_REFUSALS.WHATSAPP_NOT_CONNECTED,
    ],
    [
      "sem servico apto",
      (runs: InMemoryActivationTestRuns, scheduling: SchedulingDouble) => {
        void runs;
        scheduling.services = [];
      },
      ACTIVATION_TEST_REFUSALS.NO_ELIGIBLE_SERVICE,
    ],
    [
      "sem disponibilidade valida",
      (runs: InMemoryActivationTestRuns, scheduling: SchedulingDouble) => {
        void runs;
        scheduling.defaultSlots = [];
      },
      ACTIVATION_TEST_REFUSALS.NO_AVAILABILITY,
    ],
  ])(
    "%s recusa com codigo proprio, sem 500 e sem criar execucao",
    async (_label, arrange, code) => {
      const { runs, scheduling, service } = build();
      arrange(runs, scheduling);

      const error = await service.start(startInput).catch((caught) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(code);
      expect((error as AppError).statusCode).toBe(409);
      expect((error as AppError).statusCode).not.toBe(500);
      expect(runs.runs).toHaveLength(0);
    },
  );

  it("sem numero da plataforma configurado recusa antes de qualquer efeito", async () => {
    const { runs, service } = build({
      platformConfig: () => {
        throw new AppError("platform number missing", {
          statusCode: 503,
          code: "PLATFORM_NUMBER_NOT_CONFIGURED",
        });
      },
    });

    const error = await service.start(startInput).catch((caught) => caught);
    expect((error as AppError).code).toBe("PLATFORM_NUMBER_NOT_CONFIGURED");
    expect((error as AppError).statusCode).not.toBe(500);
    expect(runs.runs).toHaveLength(0);
  });

  it("numero do negocio ausente ou igual ao da plataforma recusa com codigo proprio", async () => {
    const { service } = build();
    await expect(
      service.start({ ...startInput, tenantPhone: "  " }),
    ).rejects.toMatchObject({
      code: ACTIVATION_TEST_REFUSALS.TENANT_PHONE_UNKNOWN,
      statusCode: 409,
    });
    await expect(
      service.start({ ...startInput, tenantPhone: PLATFORM.number }),
    ).rejects.toMatchObject({
      code: ACTIVATION_TEST_REFUSALS.TENANT_PHONE_UNKNOWN,
    });
  });
});

describe("interferencia humana", () => {
  it("resposta manual na conversa de teste pausa, e pausada nao e falha nem sucesso", async () => {
    const { runs, scheduling, service } = build();
    const started = await service.start(startInput);
    const humanMessageId = runs.humanReplies(
      TENANT,
      `conversation-${TENANT}`,
      "Oi, pode deixar que eu respondo",
    );

    const paused = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(paused?.state).toBe("PAUSED_BY_HUMAN");
    expect(paused?.state).not.toBe("FAILED");
    expect(paused?.state).not.toBe("SUCCEEDED");
    expect(paused?.pausedByMessageId).toBe(humanMessageId);
    // Pausada continua viva: nada de `finishedAt`, e nenhum agendamento criado.
    expect(paused?.finishedAt).toBeNull();
    expect(scheduling.createCalls).toHaveLength(0);
  });
});

describe("retentativa limitada", () => {
  it("falha transitoria gera nova tentativa ate o limite declarado no codigo", async () => {
    const sender = new SenderDouble();
    sender.failures = ACTIVATION_TEST_MAX_ATTEMPTS - 1;
    const { runs, service } = build({ sender });

    const started = await service.start(startInput);
    const finished = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(finished?.state).toBe("SUCCEEDED");
    expect(started.maxAttempts).toBe(ACTIVATION_TEST_MAX_ATTEMPTS);
    // A tentativa que falhou fica observavel na execucao.
    expect(runs.runs[0]?.lastError).toContain("transport unavailable");
  });

  it("esgotado o limite a execucao falha com o passo que falhou registrado", async () => {
    const sender = new SenderDouble();
    sender.failures = Number.POSITIVE_INFINITY;
    const { scheduling, service } = build({ sender });

    const started = await service.start(startInput);
    const failed = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(failed?.state).toBe("FAILED");
    expect(failed?.failedStep).toBe("TEST_NOTICE");
    expect(failed?.failureReason).toBe(
      "avisar que esta e uma conversa de teste",
    );
    expect(failed?.attempts).toBe(ACTIVATION_TEST_MAX_ATTEMPTS);
    expect(failed?.maxAttempts).toBe(ACTIVATION_TEST_MAX_ATTEMPTS);
    // Nenhum agendamento e criado quando o teste falha.
    expect(scheduling.createCalls).toHaveLength(0);
  });

  it("a IA que nao consulta a agenda faz o passo falhar, e nao e repetida", async () => {
    const runs = new InMemoryActivationTestRuns();
    const ai = new AiDouble(runs);
    // A IA responde, mas nao consulta a agenda. Nao ha marco de agenda
    // consultada para gravar, e repetir nao faz ela ter consultado antes.
    ai.skipTools.add("get_availability");
    const { service } = build({ ai, runs });

    const started = await service.start(startInput);
    const failed = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(failed?.state).toBe("FAILED");
    expect(failed?.failedStep).toBe("AI_CHECKS_AVAILABILITY");
    expect(failed?.failureReason).toBe("consultar a agenda");
    // Recusa de negocio nao muda de resposta se for repetida: uma tentativa.
    expect(failed?.attempts).toBe(1);

    // Marco sem fato nao aparece: os que dependiam do passo que falhou
    // continuam ausentes, mesmo com a execucao ja terminada.
    const milestones = await runs.listMilestones(TENANT, started.id);
    expect(reached(milestones)).toEqual([
      "MESSAGE_SENT",
      "SERVICE_IDENTIFIED",
      "PRICE_INFORMED",
    ]);
  });
});

/**
 * O teste real exercita a IA (Goal019, resposta ao blocker 6 da rodada 1).
 *
 * A rodada 1 tinha o servico compondo o texto "da IA" e chamando a agenda por
 * ela: o teste passava sem a IA existir. Este bloco falha se isso voltar —
 * cada marco de IA aqui depende de um registro que **so a IA** escreve.
 */
describe("o teste real exercita a IA, nao a imita", () => {
  it("IA silenciosa nao produz marco nenhum de IA: a execucao falha", async () => {
    const runs = new InMemoryActivationTestRuns();
    const ai = new AiDouble(runs);
    ai.silent = true;
    const { service } = build({ ai, runs });

    const started = await service.start(startInput);
    const failed = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(failed?.state).toBe("FAILED");
    expect(failed?.failedStep).toBe("AI_IDENTIFIES_SERVICE");
    // A mensagem do cliente saiu e foi gravada; o que nao existe e resposta.
    expect(reached(await runs.listMilestones(TENANT, started.id))).toEqual([
      "MESSAGE_SENT",
    ]);
  });

  it.each([
    ["list_services", "AI_IDENTIFIES_SERVICE"],
    ["get_availability", "AI_CHECKS_AVAILABILITY"],
    ["create_appointment", "AI_CONFIRMS_APPOINTMENT"],
  ])(
    "sem a ferramenta %s registrada pela IA, o passo %s falha",
    async (tool, step) => {
      const runs = new InMemoryActivationTestRuns();
      const ai = new AiDouble(runs);
      ai.skipTools.add(tool);
      const { service } = build({ ai, runs });

      const started = await service.start(startInput);
      const failed = await service.execute({
        tenantId: TENANT,
        runId: started.id,
        userId: "user-1",
        requestId: "request-1",
      });

      expect(failed?.state).toBe("FAILED");
      expect(failed?.failedStep).toBe(step);
    },
  );

  it("o agendamento do marco e o que a IA criou, lido do resultado da ferramenta", async () => {
    const runs = new InMemoryActivationTestRuns();
    const ai = new AiDouble(runs);
    ai.appointmentId = "appointment-da-ia";
    const { scheduling, service } = build({ ai, runs });
    scheduling.agenda = [];

    const started = await service.start(startInput);
    const finished = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(finished?.state).toBe("SUCCEEDED");
    expect(finished?.appointmentId).toBe("appointment-da-ia");
    // O servico nao chamou a agenda para escrever: quem escreveu foi a IA.
    expect(scheduling.createCalls).toHaveLength(0);
  });

  it("a resposta gravada na conversa e a que a IA compos, nao texto do teste", async () => {
    const runs = new InMemoryActivationTestRuns();
    const ai = new AiDouble(runs);
    const { service } = build({ ai, runs });

    const started = await service.start(startInput);
    // Antes da limpeza: as mensagens da IA ainda estao na conversa.
    await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    // O texto que a IA produziu passou pelo duble dela, e o servico nao tem
    // nenhum texto de resposta proprio para ter gravado no lugar.
    expect(ai.deliveries).toHaveLength(3);
  });
});

/**
 * A resposta da IA sai pelo WhatsApp do negocio (Goal019, blocker 2 da rodada
 * 2) e cada recusa diz a verdade sobre a causa (blocker 4).
 *
 * `AssistantService.handleIncomingText` **grava** a resposta e nao envia: o
 * envio e um no do grafo, que este caminho nao executa. A execucao ficava com
 * `Message{source: AI, deliveryState: PENDING}` e mesmo assim marcava "preco
 * informado" — afirmando ao negocio um envio que nunca aconteceu.
 */
describe("a resposta da IA precisa ter saido pelo canal do negocio", () => {
  it("resposta gravada e nao entregue falha com codigo proprio, nao com marco", async () => {
    const runs = new InMemoryActivationTestRuns();
    const ai = new AiDouble(runs);
    // O envio pelo canal do tenant nao aconteceu: a linha ficou como nasceu.
    ai.replyDelivery = "PENDING";
    const { service } = build({ ai, runs });

    const started = await service.start(startInput);
    const failed = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(failed?.state).toBe("FAILED");
    expect(failed?.failedStep).toBe("AI_ANSWERS_PRICE");
    expect(failed?.failureCode).toBe(
      ACTIVATION_TEST_REFUSALS.AI_REPLY_NOT_DELIVERED,
    );
    // O marco que dependia do envio nao existe.
    expect(reached(await runs.listMilestones(TENANT, started.id))).toEqual([
      "MESSAGE_SENT",
      "SERVICE_IDENTIFIED",
    ]);
  });

  it("no caminho feliz a resposta da IA esta entregue, nao apenas gravada", async () => {
    const runs = new InMemoryActivationTestRuns();
    const ai = new AiDouble(runs);
    const { service } = build({ ai, runs });

    const started = await service.start(startInput);
    const finished = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(finished?.state).toBe("SUCCEEDED");
    expect(ai.replyDelivery).toBe("SENT");
  });
});

/**
 * Codigo de recusa nao mente sobre a causa (Goal019, blocker 4 da rodada 2).
 *
 * A execucao usava `ACTIVATION_TEST_NO_ELIGIBLE_SERVICE` — documentado como
 * "nenhum servico apto a agendamento" — para dizer que a IA nao tinha
 * consultado a agenda, nao tinha respondido ou nao tinha confirmado. O codigo
 * chega ao consumidor em `failureCode` e mandava corrigir o catalogo, que
 * nunca esteve errado: o teste so comeca com servico apto e horario valido.
 */
describe("o codigo da falha nomeia a causa real", () => {
  it.each([
    ["list_services", "AI_IDENTIFIES_SERVICE"],
    ["get_availability", "AI_CHECKS_AVAILABILITY"],
    ["create_appointment", "AI_CONFIRMS_APPOINTMENT"],
  ])(
    "ferramenta %s ausente falha com AI_DID_NOT_ACT, nunca com NO_ELIGIBLE_SERVICE",
    async (tool, step) => {
      const runs = new InMemoryActivationTestRuns();
      const ai = new AiDouble(runs);
      ai.skipTools.add(tool);
      const { service } = build({ ai, runs });

      const started = await service.start(startInput);
      const failed = await service.execute({
        tenantId: TENANT,
        runId: started.id,
        userId: "user-1",
        requestId: "request-1",
      });

      expect(failed?.failedStep).toBe(step);
      expect(failed?.failureCode).toBe(
        ACTIVATION_TEST_REFUSALS.AI_DID_NOT_ACT,
      );
      expect(failed?.failureCode).not.toBe(
        ACTIVATION_TEST_REFUSALS.NO_ELIGIBLE_SERVICE,
      );
    },
  );

  it("IA silenciosa falha com AI_DID_NOT_ACT no passo que dependia dela", async () => {
    const runs = new InMemoryActivationTestRuns();
    const ai = new AiDouble(runs);
    ai.silent = true;
    const { service } = build({ ai, runs });

    const started = await service.start(startInput);
    const failed = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(failed?.failureCode).toBe(ACTIVATION_TEST_REFUSALS.AI_DID_NOT_ACT);
    expect(failed?.failureCode).not.toBe(
      ACTIVATION_TEST_REFUSALS.NO_ELIGIBLE_SERVICE,
    );
  });

  it("ferramenta de agendamento sem agendamento confirmado tem codigo proprio", async () => {
    const runs = new InMemoryActivationTestRuns();
    const ai = new AiDouble(runs);
    // A IA chamou `create_appointment`, mas so preparou: nao ha agendamento.
    ai.appointmentId = "";
    const { service } = build({ ai, runs });

    const started = await service.start(startInput);
    const failed = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(failed?.failedStep).toBe("AI_CONFIRMS_APPOINTMENT");
    expect(failed?.failureCode).toBe(
      ACTIVATION_TEST_REFUSALS.AI_DID_NOT_CONFIRM_APPOINTMENT,
    );
    // E nao a mentira anterior, que mandava corrigir a agenda.
    expect(failed?.failureCode).not.toBe(
      ACTIVATION_TEST_REFUSALS.NO_AVAILABILITY,
    );
  });

  it("nenhum codigo de falha da execucao vira 500", async () => {
    const runs = new InMemoryActivationTestRuns();
    const ai = new AiDouble(runs);
    ai.skipTools.add("get_availability");
    const { service } = build({ ai, runs });

    const started = await service.start(startInput);
    const failed = await service.execute({
      tenantId: TENANT,
      runId: started.id,
      userId: "user-1",
      requestId: "request-1",
    });

    // Falhar o teste e resultado: a chamada devolve a execucao, nao erro.
    expect(failed?.state).toBe("FAILED");
  });
});

describe("progresso derivado de fato", () => {
  let runs: InMemoryActivationTestRuns;

  beforeEach(() => {
    runs = new InMemoryActivationTestRuns();
  });

  it("execucao antiga sem marco gravado nao tem nenhum marco concluido", async () => {
    const { service } = build({ runs });
    const started = await service.start(startInput);
    // Uma hora depois do inicio, e nada aconteceu: tempo decorrido nao e fato.
    const milestones = await runs.listMilestones(TENANT, started.id);
    expect(milestones).toHaveLength(0);
    expect(
      activationTestProgress(milestones).some((item) => item.reached),
    ).toBe(false);
  });

  it("marco sem fonte e recusado antes de virar linha", async () => {
    await expect(
      runs.recordMilestone(TENANT, "run-1", "MESSAGE_SENT", {
        kind: "MESSAGE",
        id: "   ",
      }),
    ).rejects.toMatchObject({
      code: "ACTIVATION_TEST_MILESTONE_FACT_REQUIRED",
    });
    expect(runs.milestoneRows).toHaveLength(0);
  });
});

/**
 * Execucao `RUNNING` orfa (Goal019, resposta ao blocker 7 da rodada 1).
 *
 * `POST /internal/activation-test` responde `202` e a execucao segue solta no
 * processo. Se o processo morrer no meio, a linha fica viva para sempre e o
 * indice unico parcial recusa toda execucao seguinte: o tenant nunca mais
 * testa e nunca mais ativa a IA.
 *
 * Estes testes falham se a reconciliacao for removida — sem ela, `start` e
 * `restart` voltam a responder `ALREADY_RUNNING` para sempre.
 */
describe("execucao abandonada nao trava o tenant", () => {
  const START = new Date("2026-09-14T12:00:00.000Z");
  /** Bem depois do limite declarado em `ACTIVATION_TEST_STALE_AFTER_MS`. */
  const MUCH_LATER = new Date("2026-09-14T12:30:00.000Z");

  /** Deixa uma execucao `RUNNING` parada, como um processo morto deixaria. */
  async function abandonedRun(runs: InMemoryActivationTestRuns) {
    runs.clock = () => START;
    const { service } = build({ runs, now: () => START });
    const started = await service.start(startInput);
    await runs.patchRun(TENANT, started.id, {
      currentStep: "AI_CHECKS_AVAILABILITY",
    });
    return started;
  }

  it("iniciar de novo encerra a orfa como falha declarada e comeca outra", async () => {
    const runs = new InMemoryActivationTestRuns();
    const orphan = await abandonedRun(runs);

    runs.clock = () => MUCH_LATER;
    const { service } = build({ runs, now: () => MUCH_LATER });
    const fresh = await service.start(startInput);

    expect(fresh.id).not.toBe(orphan.id);
    expect(fresh.state).toBe("RUNNING");

    const abandoned = await runs.findRun(TENANT, orphan.id);
    // Falha, nao sucesso: uma execucao abandonada nunca pode ativar a IA.
    expect(abandoned?.state).toBe("FAILED");
    expect(abandoned?.failureCode).toBe("ACTIVATION_TEST_ABANDONED");
    // O passo onde ela parou continua legivel para a tela nomear.
    expect(abandoned?.failedStep).toBe("AI_CHECKS_AVAILABILITY");
    expect(abandoned?.finishedAt).not.toBeNull();
  });

  it("reiniciar depois de um processo morto nao responde ALREADY_RUNNING", async () => {
    const runs = new InMemoryActivationTestRuns();
    await abandonedRun(runs);

    runs.clock = () => MUCH_LATER;
    const { service } = build({ runs, now: () => MUCH_LATER });
    const restarted = await service.restart(startInput);
    expect(restarted.state).toBe("RUNNING");
  });

  it("a leitura do estado corrente mostra a falha, nao um RUNNING eterno", async () => {
    const runs = new InMemoryActivationTestRuns();
    const orphan = await abandonedRun(runs);

    runs.clock = () => MUCH_LATER;
    const { service } = build({ runs, now: () => MUCH_LATER });
    const current = await service.current({
      tenantId: TENANT,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(current?.id).toBe(orphan.id);
    expect(current?.state).toBe("FAILED");
    expect(current?.failureCode).toBe("ACTIVATION_TEST_ABANDONED");
  });

  it("execucao viva recente continua viva: ela nao e abandonada por existir", async () => {
    const runs = new InMemoryActivationTestRuns();
    runs.clock = () => START;
    const { service } = build({ runs, now: () => START });
    const started = await service.start(startInput);

    // Um minuto depois, dentro do limite: quem esta trabalhando nao e expirado.
    const soon = new Date("2026-09-14T12:01:00.000Z");
    const { service: later } = build({ runs, now: () => soon });
    await expect(later.start(startInput)).rejects.toMatchObject({
      code: ACTIVATION_TEST_REFUSALS.ALREADY_RUNNING,
    });
    expect((await runs.findRun(TENANT, started.id))?.state).toBe("RUNNING");
  });

  it("execucao pausada por interferencia nunca expira: ela espera a pessoa", async () => {
    const runs = new InMemoryActivationTestRuns();
    runs.clock = () => START;
    const { service } = build({ runs, now: () => START });
    const started = await service.start(startInput);
    await runs.pauseRun(TENANT, started.id, "message-human", START);

    runs.clock = () => MUCH_LATER;
    const { service: later } = build({ runs, now: () => MUCH_LATER });
    const current = await later.current({
      tenantId: TENANT,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(current?.state).toBe("PAUSED_BY_HUMAN");
    expect(current?.failureCode).toBeNull();
  });
});
