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
import type {
  GenerateSuggestionsInput,
  GenerateSuggestionsResult,
} from "../../src/modules/assistant/assistant.service.js";
import { AssistantService } from "../../src/modules/assistant/assistant.service.js";
import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import type {
  KnowledgeSearchInput,
  KnowledgeSearchResult,
  KnowledgeVectorStore,
} from "../../src/modules/knowledge/knowledge-vector-store.js";
import type { CustomerMemoryPromptItem } from "../../src/modules/memory/customer-memory.js";
import {
  CustomerMemoryService,
  type CustomerMemoryPolicy,
} from "../../src/modules/memory/customer-memory-service.js";
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
import {
  fakeMemoryPrisma,
  type ContactRow,
  type MemoryRow,
  type SessionRow,
} from "../memory/fake-memory-prisma.js";

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
  /**
   * Conhecimento e memoria da pessoa (Goal012), ja recuperados como o grafo
   * faria antes do turno (`retrieveKnowledge`/`loadCustomerMemory`). O eval
   * calcula estes valores a partir de `world.knowledge`/`world.customerMemory`
   * — a bancada nao refaz sozinha o filtro de tenant, servico ou permissao.
   */
  knowledgeRequested?: boolean;
  retrievedKnowledge?: KnowledgeSearchResult[];
  customerMemory?: CustomerMemoryPromptItem[];
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
  /**
   * Catalogo de conhecimento em memoria (Goal012): mesmo contrato de
   * `KnowledgeVectorStore.search` de `tests/knowledge/knowledge-retrieval-focus.test.ts`
   * (tenant + servico geral ou em foco, nunca de outro servico), sem Postgres
   * nem pgvector. Presente, `world.knowledge` fica disponivel e e injetado no
   * `AssistantService` para o modo sugestao recuperar sozinho.
   */
  knowledgeCatalog?: Array<KnowledgeSearchResult & { tenantId: string }>;
  /**
   * Memoria do cliente em memoria (Goal012): mesmo servico real
   * (`CustomerMemoryService`) do resto do produto, sobre o dublê de Prisma de
   * `tests/memory/fake-memory-prisma.ts` — o filtro de permissao, remocao e
   * substituicao e o filtro de verdade, nao uma reimplementacao do eval.
   */
  customerMemoryRows?: MemoryRow[];
  customerMemoryPolicy?: Partial<CustomerMemoryPolicy>;
  /** Contato do turno (Goal012): usado pela porta de entrada de sugestao. */
  contact?: {
    id?: string;
    ignored?: boolean;
    categoryOverride?: ContactRow["categoryOverride"];
    customerId?: string | null;
  };
  /** Sessao vigente (Goal012): usada pela porta de entrada de sugestao. */
  session?: {
    category?: SessionRow["category"];
    humanHandling?: boolean;
  };
  /** Config do negocio para o modo sugestao (Goal012). */
  aiTenantConfig?: { enabled?: boolean; tone?: AiConversationStyle };
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

  const contact = {
    id: options.contact?.id ?? "contact-1",
    ignored: options.contact?.ignored ?? false,
    categoryOverride: options.contact?.categoryOverride ?? null,
    customerId:
      options.contact?.customerId === undefined
        ? "customer-1"
        : options.contact.customerId,
  };
  const session = {
    category: options.session?.category ?? "COMMERCIAL",
    humanHandling: options.session?.humanHandling ?? false,
  };
  const aiTenantConfig = {
    enabled: options.aiTenantConfig?.enabled ?? true,
    tone: options.aiTenantConfig?.tone ?? style,
  };

  const logger = createLoggerSpy();
  const { prisma, store } = createPrismaStub({
    conversationId,
    phone,
    contact,
    session,
    aiTenantConfig,
    businessName,
  });
  const agenda = createAgendaStub({ ...options, services });
  const knowledge = options.knowledgeCatalog
    ? createKnowledgeStub(options.knowledgeCatalog)
    : undefined;
  const customerMemory = options.customerMemoryRows
    ? createCustomerMemoryStub({
        tenantId,
        conversationId,
        contact,
        session,
        rows: options.customerMemoryRows,
        policy: options.customerMemoryPolicy,
      })
    : undefined;
  const model = createScriptedModel();
  const registry = new AssistantToolRegistry(
    prisma,
    agenda.gateway,
    undefined,
    logger,
  );
  const assistant = new AssistantService(
    prisma,
    logger,
    model,
    registry,
    undefined,
    customerMemory?.service,
    knowledge?.store,
  );

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
      knowledgeRequested: turn.knowledgeRequested,
      retrievedKnowledge: turn.retrievedKnowledge,
      customerMemory: turn.customerMemory,
    });
    // Falha legível no ponto exato: o roteiro deste turno tem que ter sido
    // todo consumido, senão o caso está afirmando menos do que escreveu.
    expect(
      model.passosPendentes(),
      `Passos do roteiro nao exercitados no turno "${turn.cliente}"`,
    ).toEqual([]);
    return reply;
  }

  async function generateSuggestions(
    overrides: Partial<GenerateSuggestionsInput> = {},
  ): Promise<GenerateSuggestionsResult> {
    return assistant.generateSuggestions({
      tenantId,
      conversationId,
      userId,
      requestId,
      ...overrides,
    });
  }

  return {
    tenantId,
    channelId,
    conversationId,
    phone,
    style,
    services,
    contact,
    session,
    assistant,
    agenda,
    knowledge: knowledge?.store,
    customerMemory,
    model,
    logger,
    store,
    send,
    generateSuggestions,
    /** Tools que o runtime realmente executou, na ordem, com desfecho. */
    execucoes: () => store.toolLedger.map(toToolExecution),
    /** Só os nomes, na ordem: a "sequência de tools" das asserções. */
    sequenciaDeTools: () => store.toolLedger.map((entry) => String(entry.name)),
    rascunho: () =>
      store.state.pendingAction as Record<string, unknown> | undefined,
    estado: () => store.state,
    conversa: () => store.conversation,
    handoffs: () => store.handoffs,
    aiRuns: () => store.aiRuns,
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
function createPrismaStub(input: {
  conversationId: string;
  phone: string;
  contact: {
    id: string;
    ignored: boolean;
    categoryOverride: ContactRow["categoryOverride"];
    customerId: string | null;
  };
  session: { category: SessionRow["category"]; humanHandling: boolean };
  aiTenantConfig: { enabled: boolean; tone: AiConversationStyle };
  businessName: string;
}) {
  const store = {
    state: {} as Record<string, unknown>,
    conversation: {
      id: input.conversationId,
      tenantId: "tenant-1",
      channelId: "channel-1",
      externalContactId: input.phone,
      contactId: input.contact.id as string | null,
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
      /** Kind da mensagem (Goal013), so populado quando o eval semeia midia. */
      kind?: string;
    }>,
    handoffs: [] as Array<Record<string, unknown>>,
    aiRuns: [] as Array<Record<string, unknown>>,
    toolLedger: [] as Array<Record<string, unknown>>,
    contactLinks: [] as unknown[],
    /**
     * Attachments em memoria (Goal013/WU-05): so usado pelos evals de
     * sugestao com audio, que semeiam a transcricao diretamente aqui em vez
     * de refazer o grafo inteiro (transcricao e node do grafo, nao de
     * `AssistantService`).
     */
    attachments: [] as Array<{
      id: string;
      tenantId: string;
      messageId: string;
      kind: string;
      transcriptStatus: string | null;
      transcript: string | null;
    }>,
  };

  let messageCounter = 0;
  let handoffCounter = 0;
  let toolCallCounter = 0;
  let aiRunCounter = 0;

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
      // Usado só pela porta de entrada de sugestão (Goal012): mesmo estado da
      // conversa única deste mundo, com `contactId` para a checagem de
      // contato ignorado/sessão pessoal.
      findFirst: async () => ({ ...store.conversation, state: store.state }),
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
          kind: args.data.kind,
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
        aiRunCounter += 1;
        const run = { id: `ai-run-${aiRunCounter}`, ...args.data };
        store.aiRuns.push(run);
        return run;
      },
      update: async (args: any) => {
        const run = store.aiRuns.find((item) => item.id === args.where.id);
        Object.assign(run ?? {}, args.data);
        return run;
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
      // Evidência do turno (Goal012): a inferência de memória lê o mesmo
      // ledger que o runtime escreveu, nunca o JSON que o modelo devolveu.
      findMany: async (args: any) =>
        store.toolLedger.filter(
          (entry: any) =>
            (!args?.where?.aiRunId || entry.aiRunId === args.where.aiRunId) &&
            (!args?.where?.status || entry.status === args.where.status) &&
            (!args?.where?.name?.in ||
              args.where.name.in.includes(entry.name)),
        ),
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
      // Usado pela porta de entrada de sugestão (Goal012): o mesmo contato
      // configurado no mundo, nunca um segundo contato inventado pelo dublê.
      findUnique: async () => ({
        ignored: input.contact.ignored,
        categoryOverride: input.contact.categoryOverride,
        customerId: input.contact.customerId,
      }),
      updateMany: async (args: unknown) => {
        store.contactLinks.push(args);
        return { count: 1 };
      },
    },
    conversationSession: {
      findFirst: async () => ({
        category: input.session.category,
        humanHandling: input.session.humanHandling,
      }),
    },
    aiTenantConfig: {
      findUnique: async () => ({
        enabled: input.aiTenantConfig.enabled,
        tone: input.aiTenantConfig.tone,
        settings: { businessName: input.businessName, timezone: "America/Sao_Paulo" },
      }),
    },
    // Goal013/WU-05: so a leitura que `generateSuggestions` usa para aceitar a
    // transcricao concluida do ultimo audio como texto.
    messageAttachment: {
      findFirst: async (args: any) =>
        store.attachments.find(
          (item) =>
            item.tenantId === args.where.tenantId &&
            item.messageId === args.where.messageId &&
            item.kind === args.where.kind,
        ) ?? null,
    },
  } as unknown as PrismaClient;

  return { prisma, store };
}

/**
 * Conhecimento em memória (Goal012): mesmo contrato de
 * `PGVectorKnowledgeStore.search` (tenant do turno, documento geral ou preso
 * ao serviço em foco, nunca de outro serviço), sem Postgres nem pgvector —
 * mesmo padrão de `tests/knowledge/knowledge-retrieval-focus.test.ts`.
 */
function createKnowledgeStub(
  catalog: Array<KnowledgeSearchResult & { tenantId: string }>,
) {
  const calls: KnowledgeSearchInput[] = [];
  const store: KnowledgeVectorStore = {
    indexDocument: async () => {
      throw new Error("Eval knowledge store nao indexa: e somente leitura.");
    },
    search: async (search) => {
      calls.push(search);
      const focusServiceIds = search.focusServiceIds ?? [];
      return catalog
        .filter((doc) => doc.tenantId === search.tenantId)
        .filter(
          (doc) =>
            doc.serviceId === null || focusServiceIds.includes(doc.serviceId),
        )
        .map(({ tenantId: _tenantId, ...result }) => result);
    },
  };
  return { store, calls };
}

export type EvalKnowledge = ReturnType<typeof createKnowledgeStub>;

/**
 * Memória do cliente em memória (Goal012): o `CustomerMemoryService` real —
 * não um dublê da regra — sobre o Prisma dublê de
 * `tests/memory/fake-memory-prisma.ts`. O filtro de permissão, remoção e
 * substituição é o filtro de verdade do produto; o contato, a conversa e a
 * sessão semeados aqui são os **mesmos** do resto do mundo do eval, para que
 * "contato ignorado" ou "sessão em atendimento humano" valham igual para a
 * porta de entrada de sugestão e para a inferência de memória.
 */
function createCustomerMemoryStub(input: {
  tenantId: string;
  conversationId: string;
  contact: {
    id: string;
    ignored: boolean;
    categoryOverride: ContactRow["categoryOverride"];
    customerId: string | null;
  };
  session: { category: SessionRow["category"]; humanHandling: boolean };
  rows: MemoryRow[];
  policy?: Partial<CustomerMemoryPolicy>;
}) {
  const { prisma, state } = fakeMemoryPrisma({
    memories: input.rows,
    contacts: [
      {
        id: input.contact.id,
        tenantId: input.tenantId,
        ignored: input.contact.ignored,
        customerId: input.contact.customerId,
        categoryOverride: input.contact.categoryOverride,
      },
    ],
    conversations: [
      {
        id: input.conversationId,
        tenantId: input.tenantId,
        contactId: input.contact.id,
      },
    ],
    sessions: [
      {
        id: `${input.conversationId}-session-1`,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        category: input.session.category,
        humanHandling: input.session.humanHandling,
        endedAt: null,
        startedAt: new Date("2026-06-04T12:00:00.000Z"),
      },
    ],
  });
  const service = new CustomerMemoryService(prisma, {
    staleDays: input.policy?.staleDays ?? 180,
    promptLimit: input.policy?.promptLimit ?? 12,
  });
  return { service, state };
}

export type EvalCustomerMemory = ReturnType<typeof createCustomerMemoryStub>;

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
