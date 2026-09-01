import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { startOfTodayInTimeZone } from "../../lib/dates.js";
import { AppError, toErrorMessage } from "../../lib/errors.js";
import {
  businessSettingsSchema,
  normalizeBusinessSettings,
} from "../business-settings/business-settings.js";
import {
  inspectEvolutionInboundPayload,
  mapEvolutionInbound,
} from "../channel/adapters/evolution/EvolutionInboundMapper.js";
import { EvolutionProvider } from "../channel/adapters/evolution/EvolutionProvider.js";
import { ChannelConnectionService } from "../channel/ChannelConnectionService.js";
import { buildOrchestrator } from "../channel/routes/evolutionWebhook.routes.js";
import {
  BOT_OFF_PAUSE_UNTIL,
  HandoffService,
} from "../handoff/HandoffService.js";
import {
  normalizeVirtualAttendantSettings,
  virtualAttendantSettingsSchema,
} from "../virtual-attendant/virtual-attendant.js";

const createHandoffSchema = z.object({
  phone: z.string().min(6),
  reason: z.string().min(3),
  summary: z.string().optional(),
});

const provisionChannelSchema = z.object({
  externalInstanceId: z.string().min(1),
  displayName: z.string().min(1).optional(),
});

const aiTenantConfigSchema = z.object({
  enabled: z.boolean(),
  tone: z.enum(["PROFESSIONAL_OBJECTIVE", "LIGHT_CLOSE"]),
  businessSettings: businessSettingsSchema,
});

const evolutionDispatchSchema = z.object({
  payload: z.unknown(),
  instanceToken: z.string().min(16),
  businessSettings: businessSettingsSchema.optional(),
  virtualAttendantSettings: virtualAttendantSettingsSchema.optional(),
});

const phonesSchema = z.object({
  phones: z
    .array(z.string().regex(/^\d{10,15}$/))
    .min(1)
    .max(500),
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
      businessSettings: normalizeBusinessSettings(parsed.data.businessSettings),
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
      normalizeBusinessSettings(tenantConfig?.settings).timezone,
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

  app.get("/internal/handoffs", async (request) => {
    const { tenantId } = await trustedTenantContext(prisma, request);
    const channel =
      await channelConnections.resolveTenantEvolutionChannel(tenantId);
    const handoffs = await prisma.handoff.findMany({
      where: {
        tenantId,
        channelId: channel.id,
        status: "OPEN",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      ok: true,
      handoffs: handoffs.map((handoff) => ({
        ...handoff,
        phone: handoff.externalContactId,
      })),
    };
  });

  app.post("/internal/handoffs", async (request, reply) => {
    const context = await trustedTenantContext(prisma, request);
    const parsed = createHandoffSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const channel = await channelConnections.resolveTenantEvolutionChannel(
      context.tenantId,
    );
    const handoffService = new HandoffService(prisma, {
      tenantId: context.tenantId,
      channelId: channel.id,
    });
    await handoffService.pauseForHuman({
      phone: parsed.data.phone,
      reason: parsed.data.reason,
      summary: parsed.data.summary,
      pauseUntil: BOT_OFF_PAUSE_UNTIL,
    });
    const handoff = await prisma.handoff.findFirstOrThrow({
      where: {
        tenantId: context.tenantId,
        channelId: channel.id,
        externalContactId: parsed.data.phone,
        status: "OPEN",
      },
      orderBy: { createdAt: "desc" },
    });
    return reply.code(201).send({
      ok: true,
      handoff: { ...handoff, phone: handoff.externalContactId },
    });
  });

  app.patch("/internal/handoffs/:id/resolve", async (request, reply) => {
    const { tenantId } = await trustedTenantContext(prisma, request);
    const params = request.params as { id: string };
    const existing = await prisma.handoff.findFirst({
      where: { id: params.id, tenantId },
    });
    if (!existing) {
      throw new AppError("Handoff not found.", {
        statusCode: 404,
        code: "HANDOFF_NOT_FOUND",
      });
    }

    const handoff = await prisma.handoff.update({
      where: { id: existing.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    if (handoff.conversationId) {
      await prisma.conversation.updateMany({
        where: {
          id: handoff.conversationId,
          tenantId,
          channelId: handoff.channelId,
        },
        data: {
          humanHandoff: false,
          status: "ACTIVE",
          handoffPausedUntil: null,
        },
      });
    }
    return reply.send({
      ok: true,
      handoff: { ...handoff, phone: handoff.externalContactId },
    });
  });

  app.post("/internal/bot/resume", async (request, reply) => {
    const context = await trustedTenantContext(prisma, request);
    const parsed = phonesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }
    const handoff = await tenantHandoffService(
      prisma,
      channelConnections,
      context.tenantId,
    );
    const phones = [...new Set(parsed.data.phones)];
    for (const phone of phones) await handoff.resumeBot(phone);
    return reply.send({ ok: true, resumed: phones.length });
  });

  app.post("/internal/bot/status", async (request, reply) => {
    const context = await trustedTenantContext(prisma, request);
    const parsed = phonesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }
    const handoff = await tenantHandoffService(
      prisma,
      channelConnections,
      context.tenantId,
    );
    const statuses = [];
    for (const phone of [...new Set(parsed.data.phones)]) {
      if (!(await handoff.isBotPaused(phone))) continue;
      const pauseContext = await handoff.getBotPauseContext(phone);
      statuses.push({
        phone,
        humanHandoff: true as const,
        reason: pauseContext?.reason ?? null,
        summary: pauseContext?.summary ?? null,
        pauseUntil: pauseContext?.pauseUntil?.toISOString() ?? null,
        handoffId: pauseContext?.handoffId ?? null,
      });
    }
    return reply.send({ ok: true, statuses });
  });

  app.post("/internal/evolution/dispatch", async (request, reply) => {
    const parsed = evolutionDispatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const inspection = inspectEvolutionInboundPayload(parsed.data.payload);
    const mappedMessage = mapEvolutionInbound(parsed.data.payload);
    if (!mappedMessage) {
      app.log.warn(
        inspection,
        "Internal Evolution dispatch ignored: payload did not map to inbound message",
      );
      return reply.code(400).send({
        ok: false,
        error: "Payload did not map to inbound message",
        inspection,
      });
    }

    const message = await channelConnections.resolveEvolutionInbound({
      message: mappedMessage,
      requestId: request.id,
      businessSettings: normalizeBusinessSettings(parsed.data.businessSettings),
      virtualAttendantSettings: normalizeVirtualAttendantSettings(
        parsed.data.virtualAttendantSettings,
      ),
    });
    assertRequestedTenantMatchesResolvedChannel(request, message.tenantId);
    const orchestrator = buildOrchestrator({
      app,
      prisma,
      tenantId: message.tenantId,
      channelId: message.channelId,
      instanceId: message.instanceId,
      instanceToken: parsed.data.instanceToken,
    });

    try {
      const result = await orchestrator.handleInboundMessage(message);
      return reply.send({
        ok: true,
        action: result.action,
        outboundMessage: result.outboundMessage ?? null,
      });
    } catch (error) {
      app.log.error(
        { err: toErrorMessage(error) },
        "Internal Evolution dispatch failed",
      );
      return reply.code(500).send({ ok: false, error: "Dispatch failed" });
    }
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

async function tenantHandoffService(
  prisma: PrismaClient,
  channelConnections: ChannelConnectionService,
  tenantId: string,
) {
  const channel =
    await channelConnections.resolveTenantEvolutionChannel(tenantId);
  return new HandoffService(prisma, { tenantId, channelId: channel.id });
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

function assertRequestedTenantMatchesResolvedChannel(
  request: FastifyRequest,
  resolvedTenantId: string,
): void {
  const requestedTenantId = stringHeader(request.headers["x-tenant-id"]);
  if (requestedTenantId && requestedTenantId !== resolvedTenantId) {
    throw new AppError(
      "Resolved channel does not belong to requested tenant.",
      {
        statusCode: 403,
        code: "CHANNEL_TENANT_MISMATCH",
      },
    );
  }
}

function stringHeader(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isAuthorized(request: FastifyRequest): boolean {
  const validTokens = [env.ADMIN_API_TOKEN, env.INTERNAL_SERVICE_TOKEN].filter(
    Boolean,
  );
  if (validTokens.length === 0) return false;
  const authorization = request.headers.authorization;
  const adminToken = request.headers["x-admin-token"];
  return validTokens.some(
    (token) => authorization === `Bearer ${token}` || adminToken === token,
  );
}
