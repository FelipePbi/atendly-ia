import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { startOfTodayInTimeZone } from "../../lib/dates.js";
import { AppError } from "../../lib/errors.js";
import { EvolutionProvider } from "../channel/adapters/evolution/EvolutionProvider.js";
import { ChannelConnectionService } from "../channel/ChannelConnectionService.js";
import { BOT_OFF_PAUSE_UNTIL } from "../handoff/HandoffService.js";
import {
  businessContextSchema,
  normalizeBusinessContext,
} from "../tenant-config/business-context.js";

const provisionChannelSchema = z.object({
  externalInstanceId: z.string().min(1),
  displayName: z.string().min(1).optional(),
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
  instanceToken: z.string().min(16).max(512),
});

export async function registerInternalRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
): Promise<void> {
  const channelConnections = new ChannelConnectionService(prisma);

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/internal/")) return;
    if (!isAuthorized(request)) {
      return reply.code(401).send({ ok: false, error: "Unauthorized" });
    }
  });

  app.put("/internal/channel-connections/evolution", async (request, reply) => {
    const context = await trustedTenantContext(prisma, request, true);
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
    const context = await trustedTenantContext(prisma, request, true);
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
    const { tenantId } = await trustedTenantContext(prisma, request, true);
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
    const { tenantId } = await trustedTenantContext(prisma, request, true);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  app.get("/internal/conversations/:id/messages", async (request) => {
    const { tenantId } = await trustedTenantContext(prisma, request, true);
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
    const { tenantId } = await trustedTenantContext(prisma, request, true);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const body = parseOrThrow(sendOwnerMessageSchema, request.body);
    const conversation = await requireConversation(prisma, tenantId, id);
    if (!conversation.humanHandoff) {
      throw new AppError("Take over conversation before sending a message.", {
        statusCode: 409,
        code: "HUMAN_HANDOFF_REQUIRED",
      });
    }

    const correlationId = `owner-${randomUUID()}`;
    const pendingMessage = await prisma.message.create({
      data: {
        tenantId,
        channelId: conversation.channelId,
        conversationId: conversation.id,
        externalMessageId: correlationId,
        direction: "OUTBOUND",
        source: "OWNER",
        role: "assistant",
        body: body.text,
      },
    });

    let sent;
    try {
      sent = await new EvolutionProvider(
        app.log,
        body.instanceToken,
        conversation.channel.externalInstanceId,
      ).sendText({
        to: contactNumber(conversation.externalContactId),
        text: body.text,
        correlationId,
      });
    } catch (error) {
      await prisma.message.delete({ where: { id: pendingMessage.id } });
      throw error;
    }

    const message = await prisma.message.update({
      where: { id: pendingMessage.id },
      data: {
        externalMessageId: sent.messageId ?? correlationId,
        rawPayload: jsonValue(sent.raw),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "HUMAN_HANDOFF", humanHandoff: true },
    });
    return reply.code(201).send(internalData(request, messageDto(message)));
  });

  app.post("/internal/conversations/:id/takeover", async (request) => {
    const { tenantId } = await trustedTenantContext(prisma, request, true);
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
    const { tenantId } = await trustedTenantContext(prisma, request, true);
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
    const { tenantId } = await trustedTenantContext(prisma, request, true);
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
    const { tenantId } = await trustedTenantContext(prisma, request, true);
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
    return internalData(request, {
      conversationsNeedingAttention: attention.map(conversationDto),
      conversationsNeedingAttentionCount: attentionCount,
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
}) {
  return {
    id: message.id,
    direction: message.direction,
    source: message.source,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
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

async function trustedTenantContext(
  prisma: PrismaClient,
  request: FastifyRequest,
  requireExplicitTenant = false,
): Promise<{
  tenantId: string;
  userId: string;
}> {
  let tenantId = stringHeader(request.headers["x-tenant-id"]);
  const userId = stringHeader(request.headers["x-user-id"]);
  if (!userId) {
    throw new AppError("Trusted tenant context is required.", {
      statusCode: 400,
      code: "TENANT_CONTEXT_REQUIRED",
    });
  }
  if (!tenantId && !requireExplicitTenant) {
    tenantId = (
      await prisma.channelConnection.findFirst({
        where: { userId, status: "ACTIVE" },
        select: { tenantId: true },
        orderBy: { createdAt: "asc" },
      })
    )?.tenantId;
  }
  if (!tenantId) {
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

function isAuthorized(request: FastifyRequest): boolean {
  const token = env.INTERNAL_SERVICE_TOKEN;
  if (!token) return false;
  const authorization = request.headers.authorization;
  return authorization === `Bearer ${token}`;
}
