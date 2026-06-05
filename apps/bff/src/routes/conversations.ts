import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { currentUser, requireAuth } from "../lib/auth.js";
import { AppError } from "../lib/errors.js";
import { dataResponse, parseBody, parseParams } from "../lib/http.js";
import { getPrisma } from "../lib/prisma.js";
import { sendEvolutionText } from "../services/evolution-go.js";

const idParamSchema = z.object({
  id: z.string().min(1)
});

const conversationPatchSchema = z.object({
  archived: z.boolean().optional(),
  aiPaused: z.boolean().optional(),
  aiPausedReason: z.string().trim().max(300).optional().nullable()
});

const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000)
});

export async function registerConversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/conversations")) {
      await requireAuth(request);
    }
  });

  app.get("/conversations", async (request) => {
    const user = currentUser(request);
    const conversations = await getPrisma().conversation.findMany({
      where: {
        userId: user.id,
        archivedAt: null
      },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 100
    });

    return dataResponse(request, { conversations });
  });

  app.get("/conversations/:id/messages", async (request) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const messages = await getPrisma().message.findMany({
      where: {
        userId: user.id,
        conversationId: params.id
      },
      orderBy: { timestamp: "asc" },
      take: 500
    });

    return dataResponse(request, { messages });
  });

  app.patch("/conversations/:id", async (request) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const data = parseBody(conversationPatchSchema, request.body);
    const conversation = await getPrisma().conversation.updateMany({
      where: {
        id: params.id,
        userId: user.id
      },
      data: {
        ...(data.archived === undefined ? {} : { archivedAt: data.archived ? new Date() : null }),
        ...(data.aiPaused === undefined
          ? {}
          : {
              aiPaused: data.aiPaused,
              aiPausedReason: data.aiPaused ? (data.aiPausedReason ?? null) : null,
              aiPausedUpdatedAt: new Date()
            })
      }
    });

    if (conversation.count === 0) {
      throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    }

    return dataResponse(request, { ok: true });
  });

  app.post("/conversations/:id/messages", async (request, reply) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const data = parseBody(sendMessageSchema, request.body);
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: params.id,
        userId: user.id
      },
      include: {
        instance: true
      }
    });

    if (!conversation) {
      throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    }

    const correlationId = crypto.randomUUID();
    const sent = await sendEvolutionText({
      instanceToken: conversation.instance.evolutionInstanceToken,
      to: conversation.contactJid,
      text: data.text,
      correlationId
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        instanceId: conversation.instanceId,
        externalMessageId: correlationId,
        fromMe: true,
        senderJid: conversation.instance.phoneNumber ?? null,
        type: "TEXT",
        contentText: data.text,
        timestamp: new Date(),
        rawPayload: toJson(sent)
      }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessagePreview: data.text,
        lastMessageAt: message.timestamp
      }
    });

    reply.code(201);
    return dataResponse(request, { message });
  });

  app.post("/conversations/:id/ai/pause", async (request) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const data = parseBody(
      z.object({
        reason: z.string().trim().max(300).optional().nullable()
      }),
      request.body
    );
    const updated = await getPrisma().conversation.updateMany({
      where: {
        id: params.id,
        userId: user.id
      },
      data: {
        aiPaused: true,
        aiPausedReason: data.reason ?? null,
        aiPausedUpdatedAt: new Date()
      }
    });

    if (updated.count === 0) {
      throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    }

    return dataResponse(request, { ok: true });
  });

  app.post("/conversations/:id/ai/resume", async (request) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const updated = await getPrisma().conversation.updateMany({
      where: {
        id: params.id,
        userId: user.id
      },
      data: {
        aiPaused: false,
        aiPausedReason: null,
        aiPausedUpdatedAt: new Date()
      }
    });

    if (updated.count === 0) {
      throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    }

    return dataResponse(request, { ok: true });
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
