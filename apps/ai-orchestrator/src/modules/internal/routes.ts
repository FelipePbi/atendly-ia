import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { startOfTodayInTimeZone } from "../../lib/dates.js";
import { AppError, toErrorMessage } from "../../lib/errors.js";
import {
  authorizeInternalRequest,
  type InternalScope,
} from "../../lib/internal-credentials.js";
import { EvolutionProvider } from "../channel/adapters/evolution/EvolutionProvider.js";
import { ChannelConnectionService } from "../channel/ChannelConnectionService.js";
import {
  type InboxPort,
  inboxRetryPolicyFromEnv,
  InboxStore,
} from "../inbox/InboxStore.js";
import { classifySendFailure } from "../outbox/outbox-policy.js";
import { OutboxStore } from "../outbox/OutboxStore.js";
import { SessionService } from "../session/SessionService.js";
import {
  businessContextSchema,
  normalizeBusinessContext,
} from "../tenant-config/business-context.js";

const provisionChannelSchema = z.object({
  externalInstanceId: z.string().min(1),
  displayName: z.string().min(1).optional(),
  // Projeção da credencial entregue pelo BFF na mesma chamada de
  // provisionamento, sob a credencial interna de provisionamento.
  instanceCredential: z.string().min(16).max(512),
});

const aiTenantConfigSchema = z.object({
  enabled: z.boolean(),
  tone: z.enum(["PROFESSIONAL_OBJECTIVE", "LIGHT_CLOSE"]),
  businessContext: businessContextSchema,
});

const conversationParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

const conversationQuerySchema = z.object({
  status: z.enum(["ACTIVE", "HUMAN_HANDOFF", "CLOSED"]).optional(),
  // Organizacao da inbox e estado de atendimento: filtros por operacao, sem
  // sobrecarregar `status`, que continua sendo o ciclo de vida da conversa.
  category: z.enum(["COMMERCIAL", "UNCLASSIFIED", "PERSONAL"]).optional(),
  handling: z.enum(["AI", "HUMAN"]).optional(),
  ignored: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const categoryOverrideSchema = z.object({
  category: z.enum(["COMMERCIAL", "UNCLASSIFIED", "PERSONAL"]).nullable(),
});

const ignoreContactSchema = z.object({ ignored: z.boolean() });

const sendOwnerMessageSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  // Aceito e ignorado durante a troca de produtor: o consumer compatível entra
  // primeiro, o BFF para de enviar em seguida. O valor nunca é usado como
  // credencial — quem resolve o envio é o vínculo.
  instanceToken: z.string().min(16).max(512).optional(),
});

export interface InternalRoutesOptions {
  /** Inbox duravel: o dead-letter aparece como atencao no painel. */
  inbox?: Pick<InboxPort, "countDeadLetters">;
  /** Contato, sessao, categoria e controle humano (Goal005). */
  sessions?: Pick<
    SessionService,
    | "resolveContext"
    | "currentSession"
    | "setCategoryOverride"
    | "setIgnored"
    | "releaseToAi"
    | "assumeHumanControl"
  >;
}

export async function registerInternalRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  options: InternalRoutesOptions = {},
): Promise<void> {
  const channelConnections = new ChannelConnectionService(prisma);
  const sessions = options.sessions ?? new SessionService(prisma);
  const inbox =
    options.inbox ?? new InboxStore(prisma, inboxRetryPolicyFromEnv());

  // Autorização por escopo, com negação por omissão: um caminho `/internal/`
  // sem escopo declarado no mapa abaixo é recusado, então rota nova não nasce
  // aberta por esquecimento. A recusa acontece antes de qualquer efeito.
  app.addHook("preHandler", async (request) => {
    if (!request.url.startsWith("/internal/")) return;
    authorizeInternalRequest(request, requiredScope(request));
  });

  app.put("/internal/channel-connections/evolution", async (request, reply) => {
    const context = trustedTenantContext(request);
    const parsed = provisionChannelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const connection = await channelConnections.provisionEvolutionChannel({
      ...context,
      ...parsed.data,
    });
    return reply.send({
      ok: true,
      connection: {
        id: connection.id,
        tenantId: connection.tenantId,
        provider: connection.provider,
        externalInstanceId: connection.externalInstanceId,
        status: connection.status,
      },
    });
  });

  app.put("/internal/ai-tenant-config", async (request, reply) => {
    const context = trustedTenantContext(request);
    const parsed = aiTenantConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const config = await channelConnections.updateAiTenantConfig({
      tenantId: context.tenantId,
      enabled: parsed.data.enabled,
      tone: parsed.data.tone,
      promptVersion: env.AI_PROMPT_VERSION,
      businessContext: normalizeBusinessContext(parsed.data.businessContext),
    });
    return reply.send({
      ok: true,
      config: {
        tenantId: config.tenantId,
        enabled: config.enabled,
        tone: config.tone,
        promptVersion: config.promptVersion,
      },
    });
  });

  app.get("/internal/conversations", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const query = parseOrThrow(conversationQuerySchema, request.query);
    const conversations = await prisma.conversation.findMany({
      where: {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
        // Categoria e atendimento humano vivem na sessao vigente (a que ainda
        // nao terminou); `ignored` e regra do contato.
        ...(query.category || query.handling
          ? {
              sessions: {
                some: {
                  endedAt: null,
                  ...(query.category ? { category: query.category } : {}),
                  ...(query.handling
                    ? { humanHandling: query.handling === "HUMAN" }
                    : {}),
                },
              },
            }
          : {}),
        ...(query.ignored
          ? { contact: { ignored: query.ignored === "true" } }
          : {}),
        ...(query.search
          ? {
              OR: [
                {
                  customerName: { contains: query.search, mode: "insensitive" },
                },
                { externalContactId: { contains: query.search } },
              ],
            }
          : {}),
      },
      include: conversationInclude,
      orderBy: { updatedAt: "desc" },
      take: query.limit,
    });

    return internalData(
      request,
      conversations.map((conversation) => conversationDto(conversation)),
    );
  });

  app.get("/internal/conversations/:id", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  app.get("/internal/conversations/:id/messages", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    await requireConversation(prisma, tenantId, id);
    const messages = await prisma.message.findMany({
      where: { tenantId, conversationId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
    });
    return internalData(request, messages.map(messageDto));
  });

  app.post("/internal/conversations/:id/messages", async (request, reply) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const body = parseOrThrow(sendOwnerMessageSchema, request.body);
    const { userId } = trustedTenantContext(request);
    const conversation = await requireConversation(prisma, tenantId, id);

    // Enviar assume. O takeover previo deixou de ser pre-condicao: exigir o
    // clique antes fazia a mensagem da profissional sair sem que a plataforma
    // soubesse que ela ja estava atendendo — e a resposta automatica em curso
    // continuava valendo. Agora o controle humano e gravado antes do
    // transporte, e a saida automatica pendente e cancelada.
    const session = await sessions.resolveContext({
      tenantId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      externalContactId: conversation.externalContactId,
      customerName: conversation.customerName,
    });
    await sessions.assumeHumanControl({
      tenantId,
      sessionId: session.sessionId,
      source: "ATENDLY",
      actor: userId,
    });

    // A tentativa existe antes do transporte, com operation-id estavel. Ela
    // nunca e apagada: timeout ou erro de rede depois do envio nao provam que a
    // mensagem nao chegou, e apagar a linha era exatamente a forma de a
    // profissional achar que nao mandou nada e mandar de novo.
    const correlationId = `owner-${randomUUID()}`;
    const pendingMessage = await prisma.message.create({
      data: {
        tenantId,
        channelId: conversation.channelId,
        conversationId: conversation.id,
        externalMessageId: correlationId,
        correlationId,
        direction: "OUTBOUND",
        source: "OWNER",
        role: "assistant",
        body: body.text,
        deliveryState: "PENDING",
        deliveryUpdatedAt: new Date(),
      },
    });

    const outbox = new OutboxStore(prisma);
    let sent;
    try {
      const credential = channelConnections.resolveChannelCredential(
        conversation.channel,
      );
      sent = await new EvolutionProvider(
        app.log,
        credential,
        conversation.channel.externalInstanceId,
      ).sendText({
        to: contactNumber(conversation.externalContactId),
        text: body.text,
        correlationId,
      });
    } catch (error) {
      const classification = classifySendFailure(error);
      await outbox.markUndelivered({
        messageRecordId: pendingMessage.id,
        state: classification.state,
        detail: classification.detail,
      });
      app.log.warn(
        {
          conversationId: conversation.id,
          messageRecordId: pendingMessage.id,
          deliveryState: classification.state,
          deliveryDetail: classification.detail,
          err: toErrorMessage(error),
        },
        "Owner outbound message was persisted without delivery confirmation",
      );
      const undelivered = await prisma.message.findUniqueOrThrow({
        where: { id: pendingMessage.id },
      });
      // 202: a tentativa foi aceita e esta registrada, a entrega nao foi
      // confirmada. O estado real vai no DTO, nao num sucesso presumido.
      return reply.code(202).send(internalData(request, messageDto(undelivered)));
    }

    await outbox.markSent({
      messageRecordId: pendingMessage.id,
      providerMessageId: sent.messageId ?? correlationId,
      rawPayload: jsonValue(sent.raw),
    });
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: pendingMessage.id },
    });
    return reply.code(201).send(internalData(request, messageDto(message)));
  });

  app.post("/internal/conversations/:id/takeover", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const conversation = await requireConversation(prisma, tenantId, id);
    const existingOwnerTakeover = await prisma.handoff.findFirst({
      where: { tenantId, conversationId: id, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    if (existingOwnerTakeover?.reason !== "OWNER_TAKEOVER") {
      await prisma.handoff.create({
        data: {
          tenantId,
          channelId: conversation.channelId,
          conversationId: id,
          externalContactId: conversation.externalContactId,
          reason: "OWNER_TAKEOVER",
          summary: "Atendimento humano iniciado pelo painel.",
        },
      });
    }
    // Sem relogio: a sessao guarda o atendimento humano, entao o takeover nao
    // precisa mais de `BOT_OFF_PAUSE_UNTIL` para nao ser desfeito sozinho. O
    // relogio no ano 9999 era o que fazia a pausa sobreviver a troca de sessao
    // e prender a conversa depois de a sessao expirar.
    await prisma.conversation.update({
      where: { id },
      data: {
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        handoffPausedUntil: null,
      },
    });
    const takenOver = await sessions.resolveContext({
      tenantId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      externalContactId: conversation.externalContactId,
      customerName: conversation.customerName,
    });
    await sessions.assumeHumanControl({
      tenantId,
      sessionId: takenOver.sessionId,
      source: "ATENDLY",
      actor: userId,
    });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  /**
   * `Retomar IA`.
   *
   * Unico caminho de volta dentro da sessao: o relogio nunca devolve sozinho.
   * A retomada reavalia o contexto atual em vez de continuar do ponto anterior,
   * e nenhuma mensagem automatica anuncia a troca para o cliente.
   */
  app.post("/internal/conversations/:id/release", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const conversation = await requireConversation(prisma, tenantId, id);
    await resolveConversationHandoffs(prisma, tenantId, id);
    await prisma.conversation.update({
      where: { id },
      data: { humanHandoff: false, status: "ACTIVE", handoffPausedUntil: null },
    });
    await sessions.resolveContext({
      tenantId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      externalContactId: conversation.externalContactId,
      customerName: conversation.customerName,
    });
    await sessions.releaseToAi({ tenantId, conversationId: id, actor: userId });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  /**
   * Override manual da categoria. `category: null` limpa o override e devolve a
   * conversa a classificacao automatica; qualquer valor prevalece sobre ela.
   */
  app.put("/internal/conversations/:id/category", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const body = parseOrThrow(categoryOverrideSchema, request.body);
    const conversation = await requireConversation(prisma, tenantId, id);
    await sessions.resolveContext({
      tenantId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      externalContactId: conversation.externalContactId,
      customerName: conversation.customerName,
    });
    await sessions.setCategoryOverride({
      tenantId,
      conversationId: id,
      category: body.category,
      actor: userId,
    });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  /** Contato ignorado: regra do contato, prevalece sobre a sessao. */
  app.put("/internal/conversations/:id/ignore", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const body = parseOrThrow(ignoreContactSchema, request.body);
    const conversation = await requireConversation(prisma, tenantId, id);
    await sessions.resolveContext({
      tenantId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      externalContactId: conversation.externalContactId,
      customerName: conversation.customerName,
    });
    await sessions.setIgnored({
      tenantId,
      conversationId: id,
      ignored: body.ignored,
      actor: userId,
      source: "panel",
    });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  app.post("/internal/conversations/:id/resolve", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    await requireConversation(prisma, tenantId, id);
    await resolveConversationHandoffs(prisma, tenantId, id);
    await prisma.conversation.update({
      where: { id },
      data: { humanHandoff: false, status: "CLOSED", handoffPausedUntil: null },
    });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  app.get("/internal/dashboard", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const tenantConfig = await prisma.aiTenantConfig.findUnique({
      where: { tenantId },
      select: { settings: true },
    });
    const startOfDay = startOfTodayInTimeZone(
      normalizeBusinessContext(tenantConfig?.settings).timezone,
    );
    const [attention, attentionCount, successfulAppointmentTools, aiRuns] =
      await Promise.all([
        prisma.conversation.findMany({
          where: { tenantId, status: "HUMAN_HANDOFF", humanHandoff: true },
          include: conversationInclude,
          orderBy: { updatedAt: "desc" },
          take: 5,
        }),
        prisma.conversation.count({
          where: { tenantId, status: "HUMAN_HANDOFF", humanHandoff: true },
        }),
        prisma.aiToolCall.count({
          where: {
            tenantId,
            name: "create_appointment",
            status: "SUCCEEDED",
            completedAt: { gte: startOfDay },
          },
        }),
        prisma.aiRun.findMany({
          where: {
            tenantId,
            status: "SUCCEEDED",
            completedAt: { gte: startOfDay },
          },
          select: { conversationId: true },
        }),
      ]);
    // Dead-letter visivel como atencao. Nao existe endpoint de reenvio em
    // massa: retomar um evento parado e decisao explicita, evento a evento.
    const inboxDeadLetters = await inbox.countDeadLetters(tenantId);
    return internalData(request, {
      conversationsNeedingAttention: attention.map(conversationDto),
      conversationsNeedingAttentionCount: attentionCount,
      inboxDeadLetters,
      aiAppointmentsToday: successfulAppointmentTools,
      automatedConversationsToday: new Set(
        aiRuns.map((run) => run.conversationId),
      ).size,
    });
  });
}

function parseOrThrow<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError("Request validation failed.", {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      details: z.flattenError(parsed.error).fieldErrors,
    });
  }
  return parsed.data;
}

async function requireConversation(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, tenantId },
    include: { ...conversationInclude, channel: true },
  });
  if (!conversation) {
    throw new AppError("Conversation not found.", {
      statusCode: 404,
      code: "CONVERSATION_NOT_FOUND",
    });
  }
  return conversation;
}

/**
 * Include comum das leituras de conversa.
 *
 * A sessao vigente e a que ainda nao terminou; `take: 1` com ordem
 * decrescente por inicio deixa a leitura deterministica mesmo se um resto de
 * corrida tiver aberto duas.
 */
const conversationInclude = {
  messages: { orderBy: { createdAt: "desc" }, take: 1 },
  handoffs: {
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
  contact: true,
  sessions: {
    where: { endedAt: null },
    orderBy: { startedAt: "desc" },
    take: 1,
  },
} as const satisfies Prisma.ConversationInclude;

interface ConversationDtoInput {
  id: string;
  externalContactId: string;
  customerName: string | null;
  status: "ACTIVE" | "HUMAN_HANDOFF" | "CLOSED";
  humanHandoff: boolean;
  updatedAt: Date;
  handoffs: Array<{ reason: string }>;
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    source: "CUSTOMER" | "AI" | "OWNER" | null;
    body: string;
    createdAt: Date;
  }>;
  contact?: {
    ignored: boolean;
    ignoredAt: Date | null;
    aiPaused: boolean;
  } | null;
  sessions?: Array<{
    id: string;
    startedAt: Date;
    expiresAt: Date;
    lastContactMessageAt: Date | null;
    category: "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL";
    categorySource: "AUTOMATIC" | "MANUAL";
    suggestedCategory: "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL" | null;
    humanHandling: boolean;
    humanHandlingSince: Date | null;
  }>;
}

/**
 * DTO de conversa.
 *
 * Campos do Goal005 sao aditivos: `category`, `categorySource`, `handling`,
 * `session` e `ignored`. Conversa sem sessao materializada ainda (estoque em
 * migracao) responde com o padrao seguro — `Nao classificadas`, automatica,
 * nao ignorada — em vez de omitir o campo e obrigar o consumidor a adivinhar.
 */
function conversationDto(conversation: ConversationDtoInput) {
  const session = conversation.sessions?.[0];
  const humanHandling = session?.humanHandling ?? conversation.humanHandoff;
  return {
    id: conversation.id,
    externalContactId: conversation.externalContactId,
    customerName: conversation.customerName,
    status: conversation.status,
    humanHandoff: conversation.humanHandoff,
    handoffReason: conversation.handoffs[0]?.reason ?? null,
    lastMessage: conversation.messages[0]
      ? messageDto(conversation.messages[0])
      : null,
    unreadCount: 0,
    updatedAt: conversation.updatedAt.toISOString(),
    category: session?.category ?? "UNCLASSIFIED",
    categorySource: session?.categorySource ?? "AUTOMATIC",
    suggestedCategory: session?.suggestedCategory ?? null,
    // "Voce atendendo" x "IA atendendo": estado de atendimento, nao ciclo de
    // vida. Aberto ou lido nao muda nada disto.
    handling: humanHandling ? "HUMAN" : "AI",
    ignored: conversation.contact?.ignored ?? false,
    ignoredAt: conversation.contact?.ignoredAt?.toISOString() ?? null,
    aiPaused: conversation.contact?.aiPaused ?? false,
    session: session
      ? {
          id: session.id,
          startedAt: session.startedAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          lastContactMessageAt:
            session.lastContactMessageAt?.toISOString() ?? null,
          humanHandlingSince:
            session.humanHandlingSince?.toISOString() ?? null,
        }
      : null,
  };
}

function messageDto(message: {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  source: "CUSTOMER" | "AI" | "OWNER" | null;
  body: string;
  createdAt: Date;
  deliveryState?: "PENDING" | "SENT" | "FAILED" | "UNKNOWN" | null;
  deliveryDetail?: string | null;
}) {
  return {
    id: message.id,
    direction: message.direction,
    source: message.source,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    // Nulo em INBOUND e no estoque anterior ao Goal004; o consumidor trata o
    // campo como opcional.
    deliveryState: message.deliveryState ?? null,
    deliveryDetail: message.deliveryDetail ?? null,
  };
}

function internalData<T>(request: FastifyRequest, data: T) {
  return { data, requestId: request.id };
}

async function resolveConversationHandoffs(
  prisma: PrismaClient,
  tenantId: string,
  conversationId: string,
): Promise<void> {
  await prisma.handoff.updateMany({
    where: { tenantId, conversationId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}

function contactNumber(value: string): string {
  const number = value.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (number.length < 6) {
    throw new AppError("Conversation contact is invalid.", {
      statusCode: 409,
      code: "INVALID_CONVERSATION_CONTACT",
    });
  }
  return number;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

/**
 * Contexto de negócio recebido de chamador interno já autenticado.
 *
 * Os headers não autenticam: eles só são lidos depois de a credencial ter sido
 * verificada e o escopo concedido. O tenant precisa vir explícito — não existe
 * mais a inferência pela primeira associação ativa do usuário, que escolhia um
 * dono quando a associação era ambígua.
 */
function trustedTenantContext(request: FastifyRequest): {
  tenantId: string;
  userId: string;
} {
  const tenantId = stringHeader(request.headers["x-tenant-id"]);
  const userId = stringHeader(request.headers["x-user-id"]);
  if (!tenantId || !userId) {
    throw new AppError("Trusted tenant context is required.", {
      statusCode: 400,
      code: "TENANT_CONTEXT_REQUIRED",
    });
  }
  return { tenantId, userId };
}

function stringHeader(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Escopo exigido por operação interna.
 *
 * Provisionamento e comando comum são credenciais distintas: a credencial de
 * provisionamento não lista os escopos de conversa, e a de comando não lista
 * `channel:provision` nem `tenant-config:write`. Caminho sem escopo declarado
 * cai em `internal:unmapped`, que nenhuma credencial possui.
 */
export function requiredScope(request: FastifyRequest): InternalScope {
  const path = request.url.split("?")[0] ?? "";
  const method = request.method.toUpperCase();

  if (path === "/internal/channel-connections/evolution" && method === "PUT") {
    return "channel:provision";
  }
  if (path === "/internal/ai-tenant-config" && method === "PUT") {
    return "tenant-config:write";
  }
  if (path === "/internal/dashboard" && method === "GET") {
    return "dashboard:read";
  }
  if (path.startsWith("/internal/conversations")) {
    if (method === "GET") return "conversations:read";
    if (path.endsWith("/messages") && method === "POST") {
      return "messages:send";
    }
    if (method === "POST") return "conversations:write";
    // Categoria e ignore sao decisao sobre a conversa, no mesmo escopo de
    // takeover/release: `PUT` sem escopo declarado cairia em `internal:unmapped`.
    if (method === "PUT") return "conversations:write";
  }

  return "internal:unmapped";
}
