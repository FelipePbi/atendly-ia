import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError, toErrorMessage } from "../../lib/errors.js";
import {
  businessSettingsSchema,
  normalizeBusinessSettings,
} from "../business-settings/business-settings.js";
import {
  inspectEvolutionInboundPayload,
  mapEvolutionInbound,
} from "../channel/adapters/evolution/EvolutionInboundMapper.js";
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
