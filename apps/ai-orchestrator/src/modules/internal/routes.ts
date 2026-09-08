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
import { BOT_OFF_PAUSE_UNTIL } from "../handoff/HandoffService.js";
import {
  type InboxPort,
  inboxRetryPolicyFromEnv,
  InboxStore,
} from "../inbox/InboxStore.js";
import { classifySendFailure } from "../outbox/outbox-policy.js";
import { OutboxStore } from "../outbox/OutboxStore.js";
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
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

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
}

export async function registerInternalRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  options: InternalRoutesOptions = {},
): Promise<void> {
  const channelConnections = new ChannelConnectionService(prisma);
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
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        handoffs: {
          where: { status: "OPEN" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
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
    const conversation = await requireConversation(prisma, tenantId, id);
    if (!conversation.humanHandoff) {
      throw new AppError("Take over conversation before sending a message.", {
        statusCode: 409,
        code: "HUMAN_HANDOFF_REQUIRED",
      });
    }

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
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "HUMAN_HANDOFF", humanHandoff: true },
    });
    return reply.code(201).send(internalData(request, messageDto(message)));
  });

  app.post("/internal/conversations/:id/takeover", async (request) => {
    const { tenantId } = trustedTenantContext(request);
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
    await prisma.conversation.update({
      where: { id },
      data: {
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        handoffPausedUntil: BOT_OFF_PAUSE_UNTIL,
      },
    });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  app.post("/internal/conversations/:id/release", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    await requireConversation(prisma, tenantId, id);
    await resolveConversationHandoffs(prisma, tenantId, id);
    await prisma.conversation.update({
      where: { id },
      data: { humanHandoff: false, status: "ACTIVE", handoffPausedUntil: null },
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
          include: {
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
            handoffs: {
              where: { status: "OPEN" },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
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
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      handoffs: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      channel: true,
    },
  });
  if (!conversation) {
    throw new AppError("Conversation not found.", {
      statusCode: 404,
      code: "CONVERSATION_NOT_FOUND",
    });
  }
  return conversation;
}

function conversationDto(conversation: {
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
}) {
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
  }

  return "internal:unmapped";
}
