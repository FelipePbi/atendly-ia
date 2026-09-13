/**
 * Bancada dos evals determinísticos (Goal011, critério 7 do escopo).
 *
 * Um eval aqui é uma **transcrição fixa**: as mensagens da cliente, um
 * roteiro de passos do modelo dublê e asserções sobre o que o runtime deixou
 * acontecer. Nada de rede, nada de chave de API, nada de custo — o dublê
 * segue o padrão `{ invoke: vi.fn() }` de `tests/assistant/assistant.service.test.ts`,
 * e o Scheduling é um gateway em memória que registra tudo que foi alcançado.
 *
 * O que um eval pode afirmar, e o que não pode:
 *
 * - **Pode** afirmar o que o runtime executou, recusou, calculou e
 *   persistiu: sequência de tools no ledger de `aiToolCall`, payload que
 *   chegou ao gateway, rascunho (`pendingAction`), rascunho de conversa
 *   (`appointmentDraft`), handoff aberto, prompt montado e resultado da tool
 *   que voltou ao contexto do modelo.
 * - **Não pode** afirmar que o modelo "decidiu certo": o roteiro é escrito
 *   pelo eval. Por isso nenhum caso fabrica resposta que contorne um guard —
 *   o roteiro tenta o caminho proibido de propósito, e a asserção é sobre a
 *   recusa do runtime e sobre o efeito que **não** aconteceu.
 *
 * Cada passo do roteiro carrega uma `nota` com a política que ele representa:
 * quando o caso fica vermelho, a mensagem diz qual política quebrou.
 */
import { afterAll, beforeAll, expect, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { DiagnosticLogger } from "../../src/lib/diagnostic-log.js";
import { DomainError } from "../../src/lib/errors.js";
import { AssistantService } from "../../src/modules/assistant/assistant.service.js";
import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import type {
  ModelRequest,
  ModelResponse,
  ModelToolCall,
} from "../../src/modules/model/model-provider.js";
import type { SchedulingGateway } from "../../src/modules/scheduling-service/client.js";
import type {
  ConfirmAppointmentSeriesInput,
  CreateSchedulingHoldInput,
  RescheduleAppointmentInput,
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingCustomerCandidate,
  SchedulingRequestContext,
  SchedulingServiceDefinition,
} from "../../src/modules/scheduling-service/types.js";
import type { AiConversationStyle } from "../../src/modules/tenant-config/ai-settings.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";

export interface EvalSlot {
  date: string;
  startTime: string;
  endTime: string;
}

/** Passo do roteiro do dublê: uma iteração do laço agente/tools. */
export interface EvalModelStep {
  /** Política que este passo representa; aparece no erro quando sobra. */
  nota: string;
  /** Tool calls que o dublê emite nesta iteração. */
  toolCalls?: ModelToolCall[];
  /** Decisão estruturada final do turno (vira o JSON que o runtime parseia). */
  decision?: Record<string, unknown>;
  /** Texto cru, quando o caso precisa de resposta não estruturada. */
  text?: string;
}

export interface EvalTurn {
  /** Mensagem da cliente. */
  cliente: string;
  /** Roteiro do dublê para este turno. Vazio quando o runtime não chama o modelo. */
  modelo?: EvalModelStep[];
}

/** Uma execução de tool como o runtime a registrou em `aiToolCall`. */
export interface EvalToolExecution {
  name: string;
  args: Record<string, unknown>;
  status: string;
  ok: boolean;
  code?: string;
  result?: Record<string, unknown>;
}

/** Um alcance ao Scheduling: membro do gateway e o que foi enviado. */
export interface EvalAgendaReach {
  member: string;
  payload: unknown;
  context?: SchedulingRequestContext;
}

export interface EvalWorldOptions {
  tenantId?: string;
  channelId?: string;
  userId?: string;
  requestId?: string;
  conversationId?: string;
  phone?: string;
  customerName?: string;
  businessName?: string;
  style?: AiConversationStyle;
  services?: SchedulingServiceDefinition[];
  /** Slots devolvidos por `get_availability`. Função permite variar por serviço/data. */
  slots?:
    | EvalSlot[]
    | ((serviceIds: string[], startDate: string | undefined) => EvalSlot[]);
  customerCandidates?: SchedulingCustomerCandidate[];
  futureAppointments?: SchedulingAppointment[];
  /** Substitui membros do gateway (falha de infraestrutura, de domínio, etc.). */
  gateway?: Partial<SchedulingGateway>;
}

/**
 * Uso do dublê no arquivo de eval corrente.
 *
 * Cada arquivo de teste tem sua própria instância deste módulo, então os
 * contadores são do arquivo. É isto que faz a suíte falhar quando o dublê
 * não foi exercitado ou quando um roteiro ficou por usar.
 */
const usage = {
  invocations: 0,
  consumedSteps: 0,
  unusedSteps: [] as string[],
};

export function evalDoubleUsage(): Readonly<typeof usage> {
  return usage;
}

/**
 * Rede fechada durante o arquivo de eval: qualquer `fetch` — do SDK do
 * modelo ou do `SchedulingClient` — vira falha imediata e nomeada, em vez de
 * uma chamada real silenciosa.
 */
export function proibirRede(): void {
  beforeAll(() => {
    vi.stubGlobal("fetch", (input: unknown) => {
      throw new Error(
        `Eval abriu rede (${String(input)}). Evals rodam sem rede, sem chave e sem custo.`,
      );
    });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });
}

export const CATALOGO_PADRAO: SchedulingServiceDefinition[] = [
  {
    id: "service-1",
    name: "Aplicacao 5D",
    duration: 60,
    priceType: "FIXED",
    price: 190,
    colorId: 1,
    recurrenceIntervalDays: null,
  },
  {
    id: "service-2",
    name: "Design de sobrancelha",
    duration: 30,
    priceType: "FIXED",
    price: 40,
    colorId: 2,
    recurrenceIntervalDays: null,
  },
];

export const SLOT_PADRAO: EvalSlot = {
  date: "2026-06-08",
  startTime: "13:30",
  endTime: "14:30",
};

export function createEvalWorld(options: EvalWorldOptions = {}) {
  const tenantId = options.tenantId ?? "tenant-1";
  const channelId = options.channelId ?? "channel-1";
  const userId = options.userId ?? "user-1";
  const requestId = options.requestId ?? "request-1";
  const conversationId = options.conversationId ?? "conversation-1";
  const phone = options.phone ?? "5511999999999";
  const customerName = options.customerName ?? "Maria";
  const businessName = options.businessName ?? "Camili Krauser Beauty";
  const style = options.style ?? "BALANCED";
  const services = options.services ?? CATALOGO_PADRAO;

  const logger = createLoggerSpy();
  const { prisma, store } = createPrismaStub({ conversationId, phone });
  const agenda = createAgendaStub({ ...options, services });
  const model = createScriptedModel();
  const registry = new AssistantToolRegistry(
    prisma,
    agenda.gateway,
    undefined,
    logger,
  );
  const assistant = new AssistantService(prisma, logger, model, registry);

  let inboundCounter = 0;

  async function send(turn: EvalTurn) {
    inboundCounter += 1;
    model.carregar(turn.modelo ?? []);
    const reply = await assistant.handleIncomingText({
      phone,
      text: turn.cliente,
      channelMessage: {
        provider: "evolution-go",
        instanceId: "instance-1",
        messageId: `message-${inboundCounter}`,
        chatId: `${phone}@s.whatsapp.net`,
        customerPhone: phone,
        customerName,
        fromMe: false,
        isGroup: false,
        kind: "text",
        text: turn.cliente,
        raw: {},
        tenantId,
        channelId,
        userId,
        requestId,
      } as ChannelInboundMessage,
      businessContext: { ...DEFAULT_BUSINESS_CONTEXT, businessName },
      aiSettings: { aiEnabled: true, tone: style },
    });
    // Falha legível no ponto exato: o roteiro deste turno tem que ter sido
    // todo consumido, senão o caso está afirmando menos do que escreveu.
    expect(
      model.passosPendentes(),
      `Passos do roteiro nao exercitados no turno "${turn.cliente}"`,
    ).toEqual([]);
    return reply;
  }

  return {
    tenantId,
    channelId,
    phone,
    style,
    services,
    assistant,
    agenda,
    model,
    logger,
    store,
    send,
    /** Tools que o runtime realmente executou, na ordem, com desfecho. */
    execucoes: () => store.toolLedger.map(toToolExecution),
    /** Só os nomes, na ordem: a "sequência de tools" das asserções. */
    sequenciaDeTools: () => store.toolLedger.map((entry) => String(entry.name)),
    rascunho: () =>
      store.state.pendingAction as Record<string, unknown> | undefined,
    estado: () => store.state,
    conversa: () => store.conversation,
    handoffs: () => store.handoffs,
  };
}

export type EvalWorld = ReturnType<typeof createEvalWorld>;

/** Dublê do modelo: responde o roteiro, registra o que recebeu. */
function createScriptedModel() {
  const steps: EvalModelStep[] = [];
  const calls: Array<{
    instructions: string;
    messages: ModelRequest["messages"];
    turns: ModelRequest["turns"];
    toolNames: string[];
  }> = [];

  const invoke = vi.fn(
    async (request: ModelRequest): Promise<ModelResponse> => {
      calls.push({
        instructions: request.instructions,
        messages: request.messages,
        turns: request.turns,
        toolNames: request.tools.map((definition) => definition.name),
      });
      const step = steps.shift();
      if (!step) {
        throw new Error(
          "O dublê recebeu mais uma chamada do que o roteiro previa: a transcrição do eval está incompleta.",
        );
      }
      usage.invocations += 1;
      usage.consumedSteps += 1;
      return {
        id: `dublê-${calls.length}`,
        text: step.decision ? JSON.stringify(step.decision) : (step.text ?? ""),
        toolCalls: step.toolCalls ?? [],
        continuation: null,
      };
    },
  );

  return {
    invoke,
    calls,
    carregar(next: EvalModelStep[]) {
      steps.push(...next);
    },
    passosPendentes() {
      const pendentes = steps.map((step) => step.nota);
      usage.unusedSteps.push(...pendentes);
      steps.length = 0;
      return pendentes;
    },
    /** Contexto que o runtime entregou ao modelo na n-ésima chamada. */
    chamada(index: number) {
      const call = calls[index];
      if (!call) {
        throw new Error(
          `O dublê nao foi chamado ${index + 1} vez(es); houve ${calls.length}.`,
        );
      }
      return call;
    },
    /** Resultados de tool que voltaram ao contexto do modelo na n-ésima chamada. */
    resultadosDeTool(index: number) {
      return this.chamada(index).turns.flatMap((turn) =>
        turn.toolResults.map((result) => ({
          toolName: result.toolName,
          content: result.content,
          parsed: JSON.parse(result.content) as Record<string, unknown>,
        })),
      );
    },
  };
}

export type EvalModel = ReturnType<typeof createScriptedModel>;

/** Gateway do Scheduling em memória: registra alcance e guarda os efeitos. */
function createAgendaStub(
  options: EvalWorldOptions & { services: SchedulingServiceDefinition[] },
) {
  const reached: EvalAgendaReach[] = [];
  const effects = {
    createAppointment: [] as ScheduleAppointmentInput[],
    rescheduleAppointment: [] as RescheduleAppointmentInput[],
    cancelAppointment: [] as string[],
    confirmAppointmentSeries: [] as ConfirmAppointmentSeriesInput[],
    createHold: [] as CreateSchedulingHoldInput[],
    releaseHold: [] as string[],
  };
  const services = options.services;
  const slotsFor = (serviceIds: string[], startDate: string | undefined) => {
    if (typeof options.slots === "function") {
      return options.slots(serviceIds, startDate);
    }
    if (options.slots) return options.slots;
    const total = serviceIds
      .map((id) => services.find((service) => service.id === id)?.duration ?? 0)
      .reduce((sum, duration) => sum + duration, 0);
    return [
      {
        date: startDate ?? SLOT_PADRAO.date,
        startTime: SLOT_PADRAO.startTime,
        endTime: addMinutes(SLOT_PADRAO.startTime, total),
      },
    ];
  };
  const record = (
    member: string,
    payload: unknown,
    context?: SchedulingRequestContext,
  ) => {
    reached.push({ member, payload, context });
  };

  let holdCounter = 0;

  // Anotado como `SchedulingGateway` sem cast: é o que faz o dublê quebrar
  // quando o contrato do Scheduling mudar, em vez de mentir silenciosamente.
  const base: SchedulingGateway = {
    listActiveServices: async (context) => {
      record("listActiveServices", null, context);
      return services;
    },
    findService: async (serviceId, context) => {
      record("findService", { serviceId }, context);
      const service = services.find((item) => item.id === serviceId);
      if (!service) {
        // Serviço de outro negócio, ou id inventado: falha de domínio, com
        // código próprio — nunca um agendamento silencioso.
        throw new DomainError(
          `Servico ${serviceId} nao encontrado na agenda deste negocio.`,
          { code: "SERVICE_NOT_FOUND", statusCode: 404 },
        );
      }
      return service;
    },
    getAvailableSlotsForServices: async (
      serviceIds,
      startDate,
      _businessContext,
      context,
    ) => {
      record(
        "getAvailableSlotsForServices",
        { serviceIds, startDate },
        context,
      );
      return slotsFor(serviceIds, startDate);
    },
    findCustomerCandidatesByPhone: async (phone, context) => {
      record("findCustomerCandidatesByPhone", { phone }, context);
      return options.customerCandidates ?? [];
    },
    getAuthorizedCustomerContext: async (customerId, context) => {
      record("getAuthorizedCustomerContext", { customerId }, context);
      return {
        id: customerId,
        name: null,
        phone: null,
        notes: [],
        tags: [],
        primaryGuardian: null,
      };
    },
    findFutureAppointmentsForPhone: async (
      phone,
      _businessContext,
      context,
    ) => {
      record("findFutureAppointmentsForPhone", { phone }, context);
      return options.futureAppointments ?? [];
    },
    findFutureAppointmentsForCustomer: async (
      customerId,
      _businessContext,
      context,
    ) => {
      record("findFutureAppointmentsForCustomer", { customerId }, context);
      return options.futureAppointments ?? [];
    },
    createHold: async (input, context) => {
      record("createHold", input, context);
      effects.createHold.push(input);
      holdCounter += 1;
      const duration = totalDuration(services, input.serviceIds);
      return {
        id: `hold-${holdCounter}`,
        date: input.date,
        startTime: input.startTime,
        endTime: addMinutes(input.startTime, duration),
        duration,
        serviceIds: input.serviceIds,
        expiresAt: "2026-06-08T16:45:00.000Z",
        status: "ACTIVE" as const,
      };
    },
    releaseHold: async (holdId, context) => {
      record("releaseHold", { holdId }, context);
      effects.releaseHold.push(holdId);
      return {
        id: holdId,
        date: SLOT_PADRAO.date,
        startTime: SLOT_PADRAO.startTime,
        endTime: SLOT_PADRAO.endTime,
        duration: 0,
        serviceIds: [],
        expiresAt: "2026-06-08T16:45:00.000Z",
        status: "RELEASED" as const,
      };
    },
    createAppointment: async (input, context) => {
      record("createAppointment", input, context);
      effects.createAppointment.push(input);
      return buildAppointment(services, {
        serviceIds: input.serviceIds ?? [input.serviceId],
        date: input.date,
        startTime: input.startTime,
        customerId: input.customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        comments: input.comments,
      });
    },
    rescheduleAppointment: async (input, context) => {
      record("rescheduleAppointment", input, context);
      effects.rescheduleAppointment.push(input);
      return {
        ...buildAppointment(services, {
          serviceIds: [services[0].id],
          date: input.date,
          startTime: input.startTime,
        }),
        id: input.appointmentId,
      };
    },
    cancelAppointment: async (appointmentId, context) => {
      record("cancelAppointment", { appointmentId }, context);
      effects.cancelAppointment.push(appointmentId);
      return { appointmentId, cancelled: true as const };
    },
    previewAppointmentSeries: async (input, context) => {
      record("previewAppointmentSeries", input, context);
      return Array.from({ length: input.occurrenceCount }, (_, index) => ({
        index,
        requestedDate: input.firstDate,
        date: input.firstDate,
        startTime: input.firstStartTime,
        endTime: addMinutes(
          input.firstStartTime,
          totalDuration(services, input.serviceIds),
        ),
        adjusted: false,
        holdId: `hold-series-${index}`,
        unavailable: false,
      }));
    },
    confirmAppointmentSeries: async (input, context) => {
      record("confirmAppointmentSeries", input, context);
      effects.confirmAppointmentSeries.push(input);
      return [];
    },
  };

  const gateway = { ...base, ...(options.gateway ?? {}) } as SchedulingGateway;

  return {
    gateway,
    reached,
    effects,
    /** Membros do gateway alcançados, na ordem. */
    membros: () => reached.map((item) => item.member),
    /** Todo efeito com consequência real na agenda, achatado. */
    efeitosComConsequencia: () => [
      ...effects.createAppointment.map((input) => ({
        member: "createAppointment",
        input,
      })),
      ...effects.rescheduleAppointment.map((input) => ({
        member: "rescheduleAppointment",
        input,
      })),
      ...effects.cancelAppointment.map((input) => ({
        member: "cancelAppointment",
        input,
      })),
      ...effects.confirmAppointmentSeries.map((input) => ({
        member: "confirmAppointmentSeries",
        input,
      })),
    ],
  };
}

export type EvalAgenda = ReturnType<typeof createAgendaStub>;

function createLoggerSpy() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } satisfies DiagnosticLogger;
}

export type EvalLogger = ReturnType<typeof createLoggerSpy>;

/**
 * Prisma em memória com o estado da conversa vivo entre tools e decisão: é o
 * mesmo objeto que `AssistantToolRegistry` e `AssistantService` leem e
 * escrevem, como em produção.
 */
function createPrismaStub(input: { conversationId: string; phone: string }) {
  const store = {
    state: {} as Record<string, unknown>,
    conversation: {
      id: input.conversationId,
      tenantId: "tenant-1",
      channelId: "channel-1",
      externalContactId: input.phone,
      customerName: null as string | null,
      humanHandoff: false,
      status: "ACTIVE",
      handoffPausedUntil: null as Date | null,
      currentIntent: null as string | null,
    },
    messages: [] as Array<{
      id: string;
      conversationId: string;
      direction: "INBOUND" | "OUTBOUND";
      source?: string | null;
      role: string;
      body: string;
      createdAt: Date;
      correlationId?: string | null;
    }>,
    handoffs: [] as Array<Record<string, unknown>>,
    aiRuns: [] as Array<Record<string, unknown>>,
    toolLedger: [] as Array<Record<string, unknown>>,
    contactLinks: [] as unknown[],
  };

  let messageCounter = 0;
  let handoffCounter = 0;
  let toolCallCounter = 0;

  const prisma = {
    conversation: {
      upsert: async (args: any) => {
        store.conversation = {
          ...store.conversation,
          tenantId: args.create?.tenantId ?? store.conversation.tenantId,
          channelId: args.create?.channelId ?? store.conversation.channelId,
          customerName:
            args.update?.customerName ?? store.conversation.customerName,
          humanHandoff:
            args.update?.humanHandoff ?? store.conversation.humanHandoff,
          status: args.update?.status ?? store.conversation.status,
          handoffPausedUntil:
            args.update?.handoffPausedUntil ??
            store.conversation.handoffPausedUntil,
        };
        return { ...store.conversation, state: store.state };
      },
      findUnique: async () => ({ ...store.conversation, state: store.state }),
      update: async (args: any) => {
        if (args.data.state) store.state = args.data.state;
        store.conversation = {
          ...store.conversation,
          humanHandoff:
            args.data.humanHandoff ?? store.conversation.humanHandoff,
          status: args.data.status ?? store.conversation.status,
          handoffPausedUntil:
            args.data.handoffPausedUntil ??
            store.conversation.handoffPausedUntil,
          currentIntent:
            args.data.currentIntent ?? store.conversation.currentIntent,
        };
        return { ...store.conversation, state: store.state };
      },
    },
    message: {
      create: async (args: any) => {
        messageCounter += 1;
        const message = {
          id: `message-record-${messageCounter}`,
          conversationId: args.data.conversationId,
          direction: args.data.direction,
          source: args.data.source,
          role: args.data.role,
          body: args.data.body,
          correlationId: args.data.correlationId ?? null,
          createdAt: new Date(Date.UTC(2026, 5, 4, 12, messageCounter)),
        };
        store.messages.push(message);
        return message;
      },
      findMany: async () => [...store.messages].reverse(),
      update: async (args: any) => {
        const message = store.messages.find(
          (item) => item.id === args.where.id,
        );
        return { ...message, ...args.data };
      },
    },
    aiRun: {
      create: async (args: any) => {
        const run = { id: "ai-run-1", ...args.data };
        store.aiRuns.push(run);
        return run;
      },
      update: async (args: any) => {
        Object.assign(store.aiRuns[store.aiRuns.length - 1] ?? {}, args.data);
        return store.aiRuns[store.aiRuns.length - 1];
      },
    },
    aiToolCall: {
      findFirst: async (args: any) =>
        store.toolLedger.find(
          (entry) =>
            entry.externalCallId === args.where.externalCallId &&
            entry.name === args.where.name &&
            entry.completedAt,
        ) ?? null,
      create: async (args: any) => {
        toolCallCounter += 1;
        const record = { id: `tool-call-${toolCallCounter}`, ...args.data };
        store.toolLedger.push(record);
        return record;
      },
      update: async (args: any) => {
        const record = store.toolLedger.find(
          (entry) => entry.id === args.where.id,
        );
        if (record) Object.assign(record, args.data);
        return record;
      },
    },
    handoff: {
      findFirst: async () =>
        store.handoffs.find((handoff) => handoff.status === "OPEN") ?? null,
      create: async (args: any) => {
        handoffCounter += 1;
        const handoff = { id: `handoff-${handoffCounter}`, ...args.data };
        store.handoffs.push(handoff);
        return handoff;
      },
    },
    contact: {
      findUnique: async () => null,
      updateMany: async (args: unknown) => {
        store.contactLinks.push(args);
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;

  return { prisma, store };
}

function toToolExecution(entry: Record<string, unknown>): EvalToolExecution {
  const result = (entry.result ?? undefined) as
    Record<string, unknown> | undefined;
  const error = result?.error as { code?: string } | undefined;
  return {
    name: String(entry.name),
    args: (entry.arguments ?? {}) as Record<string, unknown>,
    status: String(entry.status),
    ok: result?.ok === true,
    ...(error?.code ? { code: error.code } : {}),
    ...(result ? { result } : {}),
  };
}

function totalDuration(
  services: SchedulingServiceDefinition[],
  serviceIds: string[],
): number {
  return serviceIds
    .map((id) => services.find((service) => service.id === id)?.duration ?? 0)
    .reduce((sum, duration) => sum + duration, 0);
}

function addMinutes(startTime: string, minutes: number): string {
  const [hours = 0, mins = 0] = startTime.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
}

function buildAppointment(
  services: SchedulingServiceDefinition[],
  input: {
    serviceIds: string[];
    date: string;
    startTime: string;
    customerId?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    comments?: string | null;
  },
): SchedulingAppointment {
  const serviceIds = input.serviceIds;
  const selected = services.filter((service) =>
    serviceIds.includes(service.id),
  );
  const duration = selected.reduce((sum, service) => sum + service.duration, 0);
  return {
    id: "appointment-1",
    title: null,
    date: input.date,
    startTime: input.startTime,
    endTime: addMinutes(input.startTime, duration),
    duration,
    customerId: input.customerId ?? "customer-1",
    customer: {
      id: input.customerId ?? "customer-1",
      name: input.customerName ?? null,
      phone: input.customerPhone ?? null,
    },
    services: selected.map((service) => ({
      serviceId: service.id,
      name: service.name,
      duration: service.duration,
      priceType: service.priceType,
      price: service.price,
    })),
    price: selected.reduce((sum, service) => sum + (service.price ?? 0), 0),
    totalPriceType: "FIXED",
    comments: input.comments ?? null,
    status: "CONFIRMED",
    serviceId: serviceIds[0] ?? null,
    serviceIds,
    serviceName: selected.map((service) => service.name).join(", "),
    customerName: input.customerName ?? null,
  };
}
