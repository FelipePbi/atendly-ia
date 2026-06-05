import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { env } from "../../config/env.js";
import { toErrorMessage } from "../../lib/errors.js";
import { AssistantService } from "../assistant/assistant.service.js";
import { businessSettingsSchema, normalizeBusinessSettings } from "../business-settings/business-settings.js";
import { normalizeVirtualAttendantSettings, virtualAttendantSettingsSchema } from "../virtual-attendant/virtual-attendant.js";
import { MessageOrchestrator } from "../automation/MessageOrchestrator.js";
import { EvolutionProvider } from "../channel/adapters/evolution/EvolutionProvider.js";
import { inspectEvolutionInboundPayload, mapEvolutionInbound } from "../channel/adapters/evolution/EvolutionInboundMapper.js";
import { HandoffService } from "../handoff/HandoffService.js";
import { BOT_OFF_PAUSE_UNTIL } from "../handoff/HandoffService.js";
import { IdempotencyStore } from "../idempotency/IdempotencyStore.js";

const createHandoffSchema = z.object({
  phone: z.string().min(6),
  reason: z.string().min(3),
  summary: z.string().optional()
});

const evolutionDispatchSchema = z.object({
  payload: z.unknown(),
  instanceToken: z.string().min(16),
  userId: z.string().optional(),
  businessSettings: businessSettingsSchema.optional(),
  virtualAttendantSettings: virtualAttendantSettingsSchema.optional()
});

const resumeBotSchema = z.object({
  phones: z.array(z.string().regex(/^\d{10,15}$/)).min(1).max(500)
});

const botStatusSchema = z.object({
  phones: z.array(z.string().regex(/^\d{10,15}$/)).min(1).max(500)
});

export async function registerInternalRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/internal/")) return;
    if (!isAuthorized(request)) {
      return reply.code(401).send({ ok: false, error: "Unauthorized" });
    }
  });

  app.get("/internal/handoffs", async () => {
    const handoffs = await prisma.handoff.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return { ok: true, handoffs };
  });

  app.post("/internal/handoffs", async (request, reply) => {
    const parsed = createHandoffSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const conversation = await prisma.conversation.upsert({
      where: { whatsappPhone: parsed.data.phone },
      update: {
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        handoffPausedUntil: BOT_OFF_PAUSE_UNTIL
      },
      create: {
        whatsappPhone: parsed.data.phone,
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        handoffPausedUntil: BOT_OFF_PAUSE_UNTIL,
        state: {}
      }
    });

    const handoff = await prisma.handoff.create({
      data: {
        conversationId: conversation.id,
        phone: parsed.data.phone,
        reason: parsed.data.reason,
        summary: parsed.data.summary ?? null,
        status: "OPEN"
      }
    });

    return reply.code(201).send({ ok: true, handoff });
  });

  app.patch("/internal/handoffs/:id/resolve", async (request, reply) => {
    const params = request.params as { id: string };
    const handoff = await prisma.handoff.update({
      where: { id: params.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date()
      }
    });

    if (handoff.conversationId) {
      await prisma.conversation.update({
        where: { id: handoff.conversationId },
        data: {
          humanHandoff: false,
          status: "ACTIVE",
          handoffPausedUntil: null
        }
      });
    }

    return reply.send({ ok: true, handoff });
  });

  app.post("/internal/bot/resume", async (request, reply) => {
    const parsed = resumeBotSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const handoff = new HandoffService(prisma);
    const phones = [...new Set(parsed.data.phones)];

    for (const phone of phones) {
      await handoff.resumeBot(phone);
    }

    return reply.send({ ok: true, resumed: phones.length });
  });

  app.post("/internal/bot/status", async (request, reply) => {
    const parsed = botStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const handoff = new HandoffService(prisma);
    const phones = [...new Set(parsed.data.phones)];
    const statuses: Array<{
      phone: string;
      humanHandoff: true;
      reason: string | null;
      summary: string | null;
      pauseUntil: string | null;
      handoffId: string | null;
    }> = [];

    for (const phone of phones) {
      const paused = await handoff.isBotPaused(phone);
      if (!paused) continue;

      const pauseContext = await handoff.getBotPauseContext(phone);
      statuses.push({
        phone,
        humanHandoff: true,
        reason: pauseContext?.reason ?? null,
        summary: pauseContext?.summary ?? null,
        pauseUntil: pauseContext?.pauseUntil?.toISOString() ?? null,
        handoffId: pauseContext?.handoffId ?? null
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
    const message = mapEvolutionInbound(parsed.data.payload);
    if (!message) {
      app.log.warn(inspection, "Internal Evolution dispatch ignored: payload did not map to inbound message");
      return reply.code(400).send({ ok: false, error: "Payload did not map to inbound message", inspection });
    }
    const businessSettings = normalizeBusinessSettings(parsed.data.businessSettings);
    const virtualAttendantSettings = normalizeVirtualAttendantSettings(parsed.data.virtualAttendantSettings);
    const messageWithContext = {
      ...message,
      userId: parsed.data.userId,
      businessSettings,
      virtualAttendantSettings
    };

    const assistant = new AssistantService(prisma, app.log);
    const provider = new EvolutionProvider(app.log, parsed.data.instanceToken);
    const idempotency = new IdempotencyStore(prisma);
    const handoff = new HandoffService(prisma);
    const orchestrator = new MessageOrchestrator(assistant, provider, idempotency, handoff, app.log);

    try {
      const result = await orchestrator.handleInboundMessage(messageWithContext);
      return reply.send({
        ok: true,
        action: result.action,
        outboundMessage: result.outboundMessage ?? null
      });
    } catch (error) {
      app.log.error({ err: toErrorMessage(error) }, "Internal Evolution dispatch failed");
      return reply.code(500).send({ ok: false, error: "Dispatch failed" });
    }
  });
}

function isAuthorized(request: FastifyRequest): boolean {
  const validTokens = [env.ADMIN_API_TOKEN, env.INTERNAL_SERVICE_TOKEN].filter(Boolean);
  if (validTokens.length === 0) return false;

  const authorization = request.headers.authorization;
  const adminToken = request.headers["x-admin-token"];

  for (const token of validTokens) {
    if (authorization === `Bearer ${token}`) return true;
    if (adminToken === token) return true;
  }

  return false;
}
