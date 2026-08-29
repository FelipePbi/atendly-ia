import crypto from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../config/env.js";
import {
  type IgnoredContact,
  type IgnoredContactSource,
  type Prisma,
} from "../generated/prisma/client.js";
import { currentUser } from "../lib/auth.js";
import { conversationDto, messageDto } from "../lib/dto.js";
import { AppError } from "../lib/errors.js";
import { dataResponse, parseBody, parseParams } from "../lib/http.js";
import {
  normalizeWhatsappJid,
  phoneFromWhatsappJid,
  whatsappPhoneCandidates,
} from "../lib/phone.js";
import { getPrisma } from "../lib/prisma.js";
import { requireTenantContext } from "../lib/tenant-context.js";
import {
  dispatchToAiOrchestrator,
  syncEvolutionChannelToAiOrchestrator,
} from "../services/ai-orchestrator.js";
import { sendEvolutionText } from "../services/evolution-go.js";

type BotHandoffStatus = {
  phone: string;
  humanHandoff: boolean;
  reason: string | null;
  summary: string | null;
  pauseUntil: string | null;
  handoffId: string | null;
};

type ConsolidationConversation = {
  id: string;
  instanceId: string;
  contactJid: string;
  contactName: string | null;
  profilePictureUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  archivedAt: Date | null;
  aiPaused: boolean;
  aiPausedReason: string | null;
  aiPausedUpdatedAt: Date | null;
  updatedAt: Date;
  messages: Array<{
    timestamp: Date;
    fromMe: boolean;
    mediaType: string | null;
    contentText: string | null;
  }>;
};

const idParamSchema = z.object({
  id: z.string().min(1),
});

const conversationQuerySchema = z.object({
  archived: z.string().optional(),
});

const conversationPatchSchema = z.object({
  archived: z.boolean().optional(),
  aiPaused: z.boolean().optional(),
  aiPausedReason: z.string().trim().max(300).optional().nullable(),
});

const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

const pauseConversationAiSchema = z.object({
  reason: z.string().trim().max(300).optional().nullable(),
});

export async function registerConversationRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/conversations")) {
      await requireTenantContext(request);
    }
  });

  app.get("/conversations", async (request) => {
    const user = currentUser(request);
    const showArchived = parseShowArchived(request.query);
    const conversations = await getPrisma().conversation.findMany({
      where: {
        userId: user.id,
        archivedAt: showArchived ? { not: null } : null,
      },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 100,
      include: latestMessageInclude(),
    });
    const phonesByConversationId = new Map(
      conversations
        .map(
          (conversation) =>
            [
              conversation.id,
              whatsappPhoneCandidates(conversation.contactJid),
            ] as const,
        )
        .filter(([, phones]) => phones.length > 0),
    );
    const handoffStatuses = await fetchBotHandoffStatusesFromApi(
      request,
      user.id,
      [...new Set([...phonesByConversationId.values()].flat())],
    );
    const handoffByPhone = new Map(
      handoffStatuses.map((status) => [status.phone, status]),
    );

    return dataResponse(request, {
      conversations: conversations.map((conversation) => {
        const phones = phonesByConversationId.get(conversation.id) ?? [];
        const handoff = phones
          .map((phone) => handoffByPhone.get(phone))
          .find(Boolean);

        return conversationDto(
          conversation,
          handoff
            ? {
                aiHandoff: true,
                aiHandoffReason: handoff.reason,
                aiHandoffPauseUntil: handoff.pauseUntil,
              }
            : undefined,
        );
      }),
    });
  });

  app.post("/conversations/consolidate", async (request) => {
    const user = currentUser(request);
    const result = await consolidateEquivalentConversationsForUser(user.id);
    return dataResponse(request, result);
  });

  app.get("/conversations/:id/messages", async (request) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    }

    const messages = await prisma.message.findMany({
      where: {
        userId: user.id,
        conversationId: conversation.id,
      },
      orderBy: { timestamp: "asc" },
      take: 300,
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 0 },
    });

    return dataResponse(request, { messages: messages.map(messageDto) });
  });

  app.patch("/conversations/:id", async (request) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const data = parseBody(conversationPatchSchema, request.body);
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    }

    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        ...(data.archived === undefined
          ? {}
          : { archivedAt: data.archived ? new Date() : null }),
        ...(data.aiPaused === undefined
          ? {}
          : {
              aiPaused: data.aiPaused,
              aiPausedReason: data.aiPaused
                ? (data.aiPausedReason ?? null)
                : null,
              aiPausedUpdatedAt: new Date(),
            }),
      },
      include: latestMessageInclude(),
    });

    return dataResponse(request, { conversation: conversationDto(updated) });
  });

  app.post("/conversations/:id/messages", async (request, reply) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const data = parseBody(sendMessageSchema, request.body);
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
      include: {
        instance: true,
        user: {
          include: {
            settings: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    }

    if (conversation.instance.status !== "CONNECTED") {
      throw new AppError("CONFLICT", "WhatsApp is not connected.", 409);
    }

    const phone = whatsappPhoneCandidates(conversation.contactJid)[0];
    if (!phone) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid conversation phone.",
        400,
      );
    }

    const correlationId = `manual-${crypto.randomUUID()}`;
    const sent = await sendEvolutionText({
      instanceToken: conversation.instance.evolutionInstanceToken,
      to: phone,
      text: data.text,
      correlationId,
    });
    const externalMessageId = sent.messageId ?? correlationId;
    const timestamp = new Date();
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        instanceId: conversation.instanceId,
        externalMessageId,
        fromMe: true,
        senderJid: conversation.instance.phoneNumber ?? null,
        senderName: user.email ?? null,
        type: "TEXT",
        contentText: data.text,
        timestamp,
        rawPayload: toJson(sent.raw),
      },
    });
    const updatedConversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessagePreview: data.text,
        lastMessageAt: timestamp,
        unreadCount: 0,
      },
      include: latestMessageInclude(),
    });

    let warning: string | undefined;
    if (conversation.user.settings?.aiEnabled) {
      const dispatchResult = await dispatchManualMessageToApi(
        request,
        user.id,
        {
          payload: buildManualOutboundPayload({
            instanceKey:
              conversation.instance.evolutionInstanceId ??
              conversation.instance.evolutionInstanceName,
            contactJid: conversation.contactJid,
            senderJid: conversation.instance.phoneNumber,
            externalMessageId,
            senderName: user.email ?? null,
            text: data.text,
            timestamp,
          }),
          instanceToken: conversation.instance.evolutionInstanceToken,
        },
      );

      if (dispatchResult.skipped) {
        const paused = await pauseBotHandoffInApi(request, user.id, phone, {
          reason: "Atendimento humano iniciado pelo painel",
          summary: "Mensagem manual enviada pelo chat do frontend.",
        });

        if (!paused) {
          warning =
            "Mensagem enviada, mas nao foi possivel pausar a IA automaticamente.";
        }
      }
    }

    reply.code(201);
    return dataResponse(request, {
      message: messageDto(message),
      conversation: conversationDto(updatedConversation),
      warning,
    });
  });

  app.post("/conversations/:id/ai/pause", async (request) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const data = parseBody(pauseConversationAiSchema, request.body);
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
      include: latestMessageInclude(),
    });

    if (!conversation) {
      throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    }

    const reason = cleanOptionalText(data.reason) ?? "Usuario pausou pelo chat";
    await pauseConversationAi({
      userId: user.id,
      instanceId: conversation.instanceId,
      jid: conversation.contactJid,
      displayName: conversation.contactName,
      source: "CHAT_ACTION",
      reason,
      createdByUserId: user.id,
    });

    const phone = phoneFromWhatsappJid(conversation.contactJid);
    if (phone) {
      await pauseBotHandoffInApi(request, user.id, phone, {
        reason: "IA pausada pela lista de ignorados",
        summary: reason,
      });
    }

    const updated = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: latestMessageInclude(),
    });

    return dataResponse(request, { conversation: conversationDto(updated) });
  });

  app.post("/conversations/:id/ai/resume", async (request) => {
    const user = currentUser(request);
    const params = parseParams(idParamSchema, request.params);
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
      include: latestMessageInclude(),
    });

    if (!conversation) {
      throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    }

    const phones = whatsappPhoneCandidates(conversation.contactJid);
    if (phones.length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid conversation phone.",
        400,
      );
    }

    await resumeBotHandoffsInApi(request, user.id, phones);
    await resumeConversationAiByJid({
      userId: user.id,
      instanceId: conversation.instanceId,
      jid: conversation.contactJid,
    });

    const updated = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: latestMessageInclude(),
    });

    return dataResponse(request, {
      conversation: conversationDto(updated, {
        aiHandoff: false,
        aiHandoffReason: null,
        aiHandoffPauseUntil: null,
      }),
    });
  });
}

async function consolidateEquivalentConversationsForUser(userId: string) {
  const prisma = getPrisma();
  const conversations = await prisma.conversation.findMany({
    where: { userId },
    include: latestMessageInclude(),
  });
  const groups = new Map<string, typeof conversations>();

  for (const conversation of conversations) {
    const key = conversationDedupeKey(conversation.contactJid);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), conversation]);
  }

  const result = {
    mergedGroups: 0,
    movedMessages: 0,
    removedConversations: 0,
  };

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const canonical = [...group].sort(
      (left, right) => conversationTime(right) - conversationTime(left),
    )[0];
    const duplicates = group.filter(
      (conversation) => conversation.id !== canonical.id,
    );
    const existingExternalMessageIds = new Set(
      (
        await prisma.message.findMany({
          where: {
            conversationId: canonical.id,
            externalMessageId: { not: null },
          },
          select: { externalMessageId: true },
        })
      )
        .map((message) => message.externalMessageId)
        .filter((externalMessageId): externalMessageId is string =>
          Boolean(externalMessageId),
        ),
    );

    for (const duplicate of duplicates) {
      const duplicateMessages = await prisma.message.findMany({
        where: { conversationId: duplicate.id },
        select: {
          id: true,
          externalMessageId: true,
        },
      });
      const duplicateMessageIds = duplicateMessages
        .filter(
          (message) =>
            message.externalMessageId &&
            existingExternalMessageIds.has(message.externalMessageId),
        )
        .map((message) => message.id);
      const messageIdsToMove = duplicateMessages
        .filter((message) => !duplicateMessageIds.includes(message.id))
        .map((message) => message.id);

      if (duplicateMessageIds.length > 0) {
        await prisma.message.deleteMany({
          where: { id: { in: duplicateMessageIds } },
        });
      }

      if (messageIdsToMove.length > 0) {
        await prisma.message.updateMany({
          where: { id: { in: messageIdsToMove } },
          data: { conversationId: canonical.id },
        });
        result.movedMessages += messageIdsToMove.length;

        for (const message of duplicateMessages) {
          if (
            message.externalMessageId &&
            messageIdsToMove.includes(message.id)
          ) {
            existingExternalMessageIds.add(message.externalMessageId);
          }
        }
      }

      await prisma.aiSuppressionLog.updateMany({
        where: { conversationId: duplicate.id },
        data: { conversationId: canonical.id },
      });
      await prisma.conversation.delete({ where: { id: duplicate.id } });
      result.removedConversations += 1;
    }

    await recomputeConversationSummary(canonical.id, group);
    result.mergedGroups += 1;
  }

  return result;
}

async function recomputeConversationSummary(
  canonicalId: string,
  mergedConversations: ConsolidationConversation[],
) {
  const prisma = getPrisma();
  const latestMessage = await prisma.message.findFirst({
    where: { conversationId: canonicalId },
    orderBy: { timestamp: "desc" },
  });
  const newestConversation = [...mergedConversations].sort(
    (left, right) => conversationTime(right) - conversationTime(left),
  )[0];
  const pausedConversation = [...mergedConversations]
    .filter((conversation) => conversation.aiPaused)
    .sort((left, right) => {
      const leftTime = (left.aiPausedUpdatedAt ?? left.updatedAt).getTime();
      const rightTime = (right.aiPausedUpdatedAt ?? right.updatedAt).getTime();
      return rightTime - leftTime;
    })[0];

  await prisma.conversation.update({
    where: { id: canonicalId },
    data: {
      instanceId: newestConversation.instanceId,
      contactName: newestConversation.contactName,
      profilePictureUrl: newestConversation.profilePictureUrl,
      lastMessagePreview: latestMessage
        ? previewText(
            latestMessage.contentText,
            buildMediaPreview(latestMessage.fromMe, latestMessage.mediaType),
          )
        : newestConversation.lastMessagePreview,
      lastMessageAt:
        latestMessage?.timestamp ?? newestConversation.lastMessageAt,
      unreadCount: mergedConversations.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      ),
      archivedAt: mergedConversations.some(
        (conversation) => conversation.archivedAt === null,
      )
        ? null
        : newestConversation.archivedAt,
      aiPaused: Boolean(pausedConversation),
      aiPausedReason: pausedConversation?.aiPausedReason ?? null,
      aiPausedUpdatedAt: pausedConversation?.aiPausedUpdatedAt ?? null,
    },
  });
}

function conversationDedupeKey(value: string): string {
  const normalizedJid = normalizeWhatsappJid(value);
  if (!normalizedJid) return fallbackJidKey(value);
  if (normalizedJid.endsWith("@g.us")) return `group:${normalizedJid}`;
  if (normalizedJid.endsWith("@lid")) return `lid:${normalizedJid}`;
  const phoneCandidates = whatsappPhoneCandidates(normalizedJid).sort();
  return phoneCandidates.length > 0
    ? `phone:${phoneCandidates.join("|")}`
    : fallbackJidKey(normalizedJid);
}

function fallbackJidKey(value: string): string {
  const input = value.trim().toLowerCase();
  return input ? `raw:${input}` : "";
}

function conversationTime(conversation: {
  messages?: Array<{ timestamp: Date }>;
  lastMessageAt: Date | null;
  updatedAt: Date;
}): number {
  return (
    conversation.messages?.[0]?.timestamp ??
    conversation.lastMessageAt ??
    conversation.updatedAt
  ).getTime();
}

function previewText(
  text: string | null | undefined,
  fallback = "Mensagem",
): string {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 180) : fallback;
}

function buildMediaPreview(
  fromMe: boolean,
  mediaType: string | null | undefined,
): string {
  if (mediaType) {
    return `Midia ${fromMe ? "enviada" : "recebida"}: ${mediaType}`;
  }

  return `Midia ${fromMe ? "enviada" : "recebida"}`;
}

function latestMessageInclude() {
  return {
    messages: {
      orderBy: { timestamp: "desc" as const },
      take: 1,
    },
  };
}

function parseShowArchived(query: unknown): boolean {
  const parsed = conversationQuerySchema.safeParse(query);
  return parsed.success && parsed.data.archived === "true";
}

async function fetchBotHandoffStatusesFromApi(
  request: FastifyRequest,
  userId: string,
  phones: string[],
): Promise<BotHandoffStatus[]> {
  const uniquePhones = [...new Set(phones)].filter(Boolean);
  if (!env.INTERNAL_SERVICE_TOKEN || uniquePhones.length === 0) return [];

  try {
    const result = await dispatchToAiOrchestrator("/internal/bot/status", {
      userId,
      requestId: request.id,
      body: { phones: uniquePhones },
    });
    return isBotStatusResponse(result) ? result.statuses : [];
  } catch (error) {
    request.log.warn({ err: errorMessage(error) }, "Backend bot status failed");
    return [];
  }
}

async function dispatchManualMessageToApi(
  request: FastifyRequest,
  userId: string,
  body: {
    payload: unknown;
    instanceToken: string;
  },
): Promise<{ skipped: boolean }> {
  if (!env.INTERNAL_SERVICE_TOKEN) return { skipped: true };

  try {
    const membership = await getPrisma().tenantMember.findFirst({
      where: { userId },
      select: { tenantId: true },
      orderBy: { createdAt: "asc" },
    });
    const payload =
      body.payload &&
      typeof body.payload === "object" &&
      !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null;
    const externalInstanceId =
      typeof payload?.instanceId === "string"
        ? payload.instanceId
        : typeof payload?.instance === "string"
          ? payload.instance
          : null;
    if (!membership || !externalInstanceId) return { skipped: true };

    await syncEvolutionChannelToAiOrchestrator({
      tenantId: membership.tenantId,
      userId,
      requestId: request.id,
      externalInstanceId,
    });
    await dispatchToAiOrchestrator("/internal/evolution/dispatch", {
      tenantId: membership.tenantId,
      userId,
      requestId: request.id,
      body,
    });
    return { skipped: false };
  } catch (error) {
    request.log.warn({ err: errorMessage(error) }, "Backend dispatch failed");
    return { skipped: true };
  }
}

async function pauseBotHandoffInApi(
  request: FastifyRequest,
  userId: string,
  phone: string,
  body: { reason: string; summary?: string },
): Promise<boolean> {
  if (!env.INTERNAL_SERVICE_TOKEN || !phone) return false;

  try {
    await dispatchToAiOrchestrator("/internal/handoffs", {
      userId,
      requestId: request.id,
      body: {
        phone,
        reason: body.reason,
        summary: body.summary,
      },
    });
    return true;
  } catch (error) {
    request.log.warn({ err: errorMessage(error) }, "Backend bot pause failed");
    return false;
  }
}

async function resumeBotHandoffsInApi(
  request: FastifyRequest,
  userId: string,
  phones: string[],
): Promise<boolean> {
  const uniquePhones = [...new Set(phones)].filter(Boolean);
  if (!env.INTERNAL_SERVICE_TOKEN || uniquePhones.length === 0) return false;

  try {
    await dispatchToAiOrchestrator("/internal/bot/resume", {
      userId,
      requestId: request.id,
      body: { phones: uniquePhones },
    });
    return true;
  } catch (error) {
    request.log.warn({ err: errorMessage(error) }, "Backend bot resume failed");
    return false;
  }
}

async function pauseConversationAi(input: {
  userId: string;
  instanceId: string;
  jid: string;
  displayName?: string | null;
  pushName?: string | null;
  businessName?: string | null;
  source: IgnoredContactSource;
  reason: string;
  createdByUserId?: string | null;
  createdByMessageId?: string | null;
}) {
  const contact = await upsertIgnoredContact(input);

  await getPrisma().conversation.updateMany({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      contactJid: contact.jid,
    },
    data: {
      aiPaused: true,
      aiPausedReason: input.reason,
      aiPausedUpdatedAt: new Date(),
    },
  });

  return contact;
}

async function resumeConversationAiByJid(input: {
  userId: string;
  instanceId: string;
  jid: string;
}): Promise<void> {
  const jid = normalizeWhatsappJid(input.jid);
  if (!jid) return;

  const now = new Date();
  await getPrisma().ignoredContact.updateMany({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      jid,
      isActive: true,
    },
    data: {
      isActive: false,
      deletedAt: now,
    },
  });

  await getPrisma().conversation.updateMany({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      contactJid: jid,
    },
    data: {
      aiPaused: false,
      aiPausedReason: null,
      aiPausedUpdatedAt: now,
    },
  });
}

async function upsertIgnoredContact(input: {
  userId: string;
  instanceId: string;
  jid: string;
  displayName?: string | null;
  pushName?: string | null;
  businessName?: string | null;
  source: IgnoredContactSource;
  reason?: string | null;
  createdByUserId?: string | null;
  createdByMessageId?: string | null;
}): Promise<IgnoredContact> {
  const jid = normalizeWhatsappJid(input.jid);
  if (!jid) {
    throw new AppError("VALIDATION_ERROR", "Invalid WhatsApp JID.", 400);
  }

  const phoneNumber = phoneFromWhatsappJid(jid) || null;
  const updateData: Prisma.IgnoredContactUpdateInput = {
    phoneNumber,
    source: input.source,
    reason: cleanOptionalText(input.reason),
    isActive: true,
    deletedAt: null,
    ...(cleanOptionalText(input.displayName) !== undefined
      ? { displayName: cleanOptionalText(input.displayName) }
      : {}),
    ...(cleanOptionalText(input.pushName) !== undefined
      ? { pushName: cleanOptionalText(input.pushName) }
      : {}),
    ...(cleanOptionalText(input.businessName) !== undefined
      ? { businessName: cleanOptionalText(input.businessName) }
      : {}),
    ...(input.createdByUserId !== undefined
      ? { createdByUserId: input.createdByUserId }
      : {}),
    ...(input.createdByMessageId !== undefined
      ? { createdByMessageId: input.createdByMessageId }
      : {}),
  };

  return getPrisma().ignoredContact.upsert({
    where: {
      userId_instanceId_jid: {
        userId: input.userId,
        instanceId: input.instanceId,
        jid,
      },
    },
    update: updateData,
    create: {
      userId: input.userId,
      instanceId: input.instanceId,
      jid,
      phoneNumber,
      displayName: cleanOptionalText(input.displayName) ?? null,
      pushName: cleanOptionalText(input.pushName) ?? null,
      businessName: cleanOptionalText(input.businessName) ?? null,
      source: input.source,
      reason: cleanOptionalText(input.reason) ?? null,
      createdByUserId: input.createdByUserId ?? null,
      createdByMessageId: input.createdByMessageId ?? null,
    },
  });
}

function buildManualOutboundPayload(input: {
  instanceKey: string;
  contactJid: string;
  senderJid: string | null;
  externalMessageId: string;
  senderName: string | null;
  text: string;
  timestamp: Date;
}) {
  return {
    event: "SendMessage",
    instanceId: input.instanceKey,
    data: {
      Info: {
        Chat: input.contactJid,
        Sender: input.senderJid ?? "",
        IsFromMe: true,
        IsGroup: input.contactJid.endsWith("@g.us"),
        ID: input.externalMessageId,
        Type: "text",
        Timestamp: input.timestamp.toISOString(),
        PushName: input.senderName,
      },
      Message: {
        conversation: input.text,
      },
    },
  };
}

function isBotStatusResponse(
  value: unknown,
): value is { statuses: BotHandoffStatus[] } {
  if (!value || typeof value !== "object" || !("statuses" in value))
    return false;
  const statuses = (value as { statuses?: unknown }).statuses;
  return Array.isArray(statuses);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function cleanOptionalText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  const text = value?.trim() ?? "";
  return text ? text : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
