import type { FastifyInstance, FastifyRequest } from "fastify";

import { env } from "../config/env.js";
import {
  type AiSuppressionReason,
  type IgnoredContact,
  type IgnoredContactSource,
  type MessageType,
  type Prisma,
} from "../generated/prisma/client.js";
import { businessSettingsDto, settingsDto } from "../lib/dto.js";
import { AppError } from "../lib/errors.js";
import { dataResponse } from "../lib/http.js";
import {
  normalizeWhatsappJid,
  normalizeWhatsappPhone,
  phoneFromWhatsappJid,
  phonesMatch,
} from "../lib/phone.js";
import { getPrisma } from "../lib/prisma.js";
import {
  dispatchToAiOrchestrator,
  syncEvolutionChannelToAiOrchestrator,
} from "../services/ai-orchestrator.js";
import {
  extractConnectedPhone,
  extractQrCode,
  getEvolutionEvent,
  getEvolutionInstanceKey,
  parseEvolutionMessage,
} from "../services/evolution-webhook-parser.js";

type BackendDispatchOutboundMessage = {
  text: string;
  conversationId?: string;
  messageRecordId?: string;
  providerMessageId?: string;
  rawPayload?: unknown;
};

type SavedVisibleMessage = {
  conversation: Prisma.ConversationGetPayload<{
    include: ReturnType<typeof latestMessageInclude>;
  }>;
  message: Awaited<ReturnType<typeof createMessageRecord>>;
  duplicate: boolean;
};

export async function registerWebhookRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post("/webhooks/evolution-go", async (request) => {
    const query = request.query as { token?: string };
    if (
      !env.EVOLUTION_WEBHOOK_SECRET ||
      query.token !== env.EVOLUTION_WEBHOOK_SECRET
    ) {
      throw new AppError("UNAUTHORIZED", "Invalid webhook token.", 401);
    }

    const payload = request.body;
    if (!payload || typeof payload !== "object") {
      throw new AppError("VALIDATION_ERROR", "Invalid webhook payload.", 400);
    }

    const instanceKey = getEvolutionInstanceKey(payload);
    if (!instanceKey) {
      return dataResponse(request, { ignored: "missing_instance" });
    }

    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        OR: [
          { evolutionInstanceId: instanceKey },
          { evolutionInstanceName: instanceKey },
        ],
      },
      include: {
        user: {
          include: {
            profile: true,
            settings: true,
            businessSettings: true,
          },
        },
      },
    });

    if (!instance) {
      return dataResponse(request, { ignored: "unknown_instance" });
    }

    const event = getEvolutionEvent(payload);

    if (event === "QRCODE") {
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          qrcode: extractQrCode(payload) ?? instance.qrcode,
          status: "WAITING_QR",
        },
      });
      return dataResponse(request, { ok: true });
    }

    if (event === "QR_TIMEOUT") {
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: { status: "QR_EXPIRED" },
      });
      return dataResponse(request, { ok: true });
    }

    if (
      event === "QR_SUCCESS" ||
      event === "PAIR_SUCCESS" ||
      event === "CONNECTED"
    ) {
      const connectedPhone = extractConnectedPhone(payload);
      const normalizedPhone = connectedPhone
        ? normalizeWhatsappPhone(connectedPhone)
        : "";

      if (connectedPhone && !normalizedPhone) {
        await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: {
            status: "ERROR",
            phoneNumber: connectedPhone,
            qrcode: null,
          },
        });
        return dataResponse(request, { ok: true });
      }

      if (
        connectedPhone &&
        normalizedPhone &&
        shouldClearWhatsAppDataForPhoneChange(
          instance.phoneNumber,
          connectedPhone,
        )
      ) {
        await clearWhatsAppInstanceConversationData(instance.id);
      }

      const instanceUpdate = {
        status: "CONNECTED" as const,
        phoneNumber: connectedPhone ?? instance.phoneNumber,
        qrcode: null,
        connectedAt: instance.connectedAt ?? new Date(),
      };

      if (connectedPhone && normalizedPhone && instance.user.profile) {
        await prisma.$transaction([
          prisma.userProfile.update({
            where: { userId: instance.userId },
            data: {
              whatsappPhoneRaw: connectedPhone,
              whatsappPhoneNormalized: normalizedPhone,
            },
          }),
          prisma.whatsAppInstance.update({
            where: { id: instance.id },
            data: instanceUpdate,
          }),
        ]);
      } else {
        await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: instanceUpdate,
        });
      }

      return dataResponse(request, { ok: true });
    }

    if (event === "LOGGED_OUT" || event === "DISCONNECTED") {
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status: event === "LOGGED_OUT" ? "LOGGED_OUT" : "DISCONNECTED",
          qrcode: null,
        },
      });
      await deactivateAiForUserIfEnabled(instance.userId);
      return dataResponse(request, { ok: true });
    }

    if (event !== "MESSAGE" && event !== "SEND_MESSAGE") {
      return dataResponse(request, { ignored: "unsupported_event" });
    }

    const message = parseEvolutionMessage(payload);
    if (!message) {
      return dataResponse(request, { ignored: "unmapped_message" });
    }

    const saved = await saveVisibleMessage({
      userId: instance.userId,
      instanceId: instance.id,
      contactJid: message.contactJid,
      contactName: message.contactName,
      profilePictureUrl: message.profilePictureUrl,
      externalMessageId: message.externalMessageId,
      fromMe: message.fromMe,
      senderJid: message.senderJid,
      senderName: message.senderName,
      type: message.type,
      contentText: message.contentText,
      mediaType: message.mediaType,
      mediaUrl: message.mediaUrl,
      mediaBase64: message.mediaBase64,
      timestamp: message.timestamp,
      rawPayload: payload,
    });

    if (saved.duplicate) {
      if (instance.user.settings?.aiEnabled && message.fromMe) {
        const businessSettings = await getBusinessSettingsForUser(
          instance.userId,
        );
        await dispatchMessageToBackend(request, {
          payload,
          instanceToken: instance.evolutionInstanceToken,
          userId: instance.userId,
          businessSettings: businessSettingsDto(businessSettings),
          virtualAttendantSettings: settingsDto(instance.user.settings),
        });
      }

      return dataResponse(request, { duplicate: true });
    }

    const command = detectAiCommand(message.contentText);
    if (
      command?.type === "PAUSE_AI_FOR_CONTACT" &&
      message.fromMe &&
      !message.isGroup
    ) {
      await recordOwnerManualActivity({
        instanceId: instance.id,
        conversationId: saved.conversation.id,
        happenedAt: message.timestamp,
      });

      await pauseConversationAi({
        userId: instance.userId,
        instanceId: instance.id,
        jid: message.contactJid,
        displayName: message.contactName,
        pushName: message.senderName,
        source: "WHATSAPP_COMMAND",
        reason: "IA pausada por comando enviado no WhatsApp.",
        createdByUserId: instance.userId,
        createdByMessageId: saved.message.id,
      });

      const phone = phoneFromWhatsappJid(message.contactJid);
      if (phone) {
        await pauseBotHandoffInBackend(request, instance.userId, {
          phone,
          reason: "IA pausada por comando /ia_pause",
          summary: "Comando enviado pelo WhatsApp conectado.",
        });
      }

      await logAiSuppression({
        userId: instance.userId,
        instanceId: instance.id,
        conversationId: saved.conversation.id,
        messageId: saved.message.id,
        contactJid: message.contactJid,
        reason: "COMMAND_RECEIVED",
        metadata: { command: "/ia_pause" },
      });

      return dataResponse(request, { action: "ai_paused_by_command" });
    }

    if (message.fromMe) {
      const dispatchResult = instance.user.settings?.aiEnabled
        ? await dispatchMessageToBackend(request, {
            payload,
            instanceToken: instance.evolutionInstanceToken,
            userId: instance.userId,
            businessSettings: businessSettingsDto(
              await getBusinessSettingsForUser(instance.userId),
            ),
            virtualAttendantSettings: settingsDto(instance.user.settings),
          })
        : { skipped: true, action: null, outboundMessage: null };

      if (dispatchResult.action !== "ignored_bot_outbound") {
        await recordOwnerManualActivity({
          instanceId: instance.id,
          conversationId: saved.conversation.id,
          happenedAt: message.timestamp,
        });
      }

      return dataResponse(request, {
        action:
          dispatchResult.action === "ignored_bot_outbound"
            ? "bot_outbound_recorded"
            : "owner_activity_recorded",
      });
    }

    if (message.isGroup) {
      await pauseConversationAi({
        userId: instance.userId,
        instanceId: instance.id,
        jid: message.contactJid,
        displayName: message.contactName,
        source: "AUTO_SAFETY",
        reason: "IA desativada para grupos.",
        createdByMessageId: saved.message.id,
      });
      await logAiSuppression({
        userId: instance.userId,
        instanceId: instance.id,
        conversationId: saved.conversation.id,
        messageId: saved.message.id,
        contactJid: message.contactJid,
        reason: "GROUP_CHAT",
      });

      return dataResponse(request, { ignored: "group_chat" });
    }

    const ignoredContact = await findActiveIgnoredContact({
      userId: instance.userId,
      instanceId: instance.id,
      jid: message.contactJid,
    });
    if (ignoredContact) {
      await prisma.conversation.update({
        where: { id: saved.conversation.id },
        data: {
          aiPaused: true,
          aiPausedReason:
            ignoredContact.reason ?? "Contato na lista de ignorados.",
          aiPausedUpdatedAt: new Date(),
        },
      });
      await logAiSuppression({
        userId: instance.userId,
        instanceId: instance.id,
        conversationId: saved.conversation.id,
        messageId: saved.message.id,
        contactJid: message.contactJid,
        reason: "IGNORED_CONTACT",
        metadata: {
          ignoredContactId: ignoredContact.id,
          source: ignoredContact.source,
        },
      });

      return dataResponse(request, { ignored: "ignored_contact" });
    }

    if (instance.user.settings?.aiEnabled) {
      const businessSettings =
        instance.user.businessSettings ??
        (await getBusinessSettingsForUser(instance.userId));
      const businessSettingsSnapshot = businessSettingsDto(businessSettings);
      if (!businessSettingsSnapshot.configured) {
        return dataResponse(request, {
          ignored: "business_settings_incomplete",
        });
      }

      const eligibility = checkVirtualAttendantEligibility({
        settings: instance.user.settings,
        instance,
        conversation: saved.conversation,
      });

      if (!eligibility.allowed) {
        await logAiSuppression({
          userId: instance.userId,
          instanceId: instance.id,
          conversationId: saved.conversation.id,
          messageId: saved.message.id,
          contactJid: message.contactJid,
          reason:
            eligibility.reason === "away_timeout_not_reached"
              ? "AWAY_TIMEOUT_NOT_REACHED"
              : eligibility.reason === "ai_disabled"
                ? "GLOBAL_AI_DISABLED"
                : "VIRTUAL_ATTENDANT_INCOMPLETE",
          metadata: eligibility.metadata as Prisma.InputJsonValue | undefined,
        });

        return dataResponse(request, {
          ignored: eligibility.reason,
          metadata: eligibility.metadata,
        });
      }

      const dispatchResult = await dispatchMessageToBackend(request, {
        payload,
        instanceToken: instance.evolutionInstanceToken,
        userId: instance.userId,
        businessSettings: businessSettingsSnapshot,
        virtualAttendantSettings: settingsDto(instance.user.settings),
      });

      const outbound = dispatchResult.outboundMessage;
      if (outbound?.text) {
        await saveVisibleMessage({
          userId: instance.userId,
          instanceId: instance.id,
          contactJid: message.contactJid,
          contactName: message.contactName,
          profilePictureUrl: message.profilePictureUrl,
          externalMessageId:
            outbound.providerMessageId ??
            outbound.messageRecordId ??
            `backend-${message.externalMessageId}`,
          fromMe: true,
          senderJid: instance.phoneNumber,
          senderName:
            businessSettingsSnapshot.businessName ||
            instance.user.profile?.businessName ||
            null,
          type: "TEXT",
          contentText: outbound.text,
          timestamp: new Date(),
          rawPayload: outbound.rawPayload ?? null,
        });
      }
    }

    return dataResponse(request, { ok: true });
  });
}

function detectAiCommand(
  messageText: string | null | undefined,
): { type: "PAUSE_AI_FOR_CONTACT" } | null {
  const normalized = messageText?.trim().toLowerCase();
  return normalized === "/ia_pause" ? { type: "PAUSE_AI_FOR_CONTACT" } : null;
}

async function saveVisibleMessage(input: {
  userId: string;
  instanceId: string;
  contactJid: string;
  contactName?: string | null;
  profilePictureUrl?: string | null;
  externalMessageId: string;
  fromMe: boolean;
  senderJid?: string | null;
  senderName?: string | null;
  type: MessageType;
  contentText?: string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  mediaBase64?: string | null;
  timestamp?: Date;
  rawPayload?: unknown;
}): Promise<SavedVisibleMessage> {
  return getPrisma().$transaction(async (tx) => {
    const existingMessage = await tx.message.findFirst({
      where: {
        instanceId: input.instanceId,
        externalMessageId: input.externalMessageId,
      },
      include: {
        conversation: {
          include: latestMessageInclude(),
        },
      },
    });

    if (existingMessage) {
      return {
        conversation: existingMessage.conversation,
        message: existingMessage,
        duplicate: true,
      };
    }

    const contactJid =
      normalizeWhatsappJid(input.contactJid) ||
      input.contactJid.trim().toLowerCase();
    const timestamp = input.timestamp ?? new Date();
    const lastMessagePreview = previewText(
      input.contentText,
      buildMediaPreview(input.fromMe, input.mediaType),
    );
    const conversation = await tx.conversation.upsert({
      where: {
        userId_contactJid: {
          userId: input.userId,
          contactJid,
        },
      },
      update: {
        instanceId: input.instanceId,
        ...(input.contactName ? { contactName: input.contactName } : {}),
        ...(input.profilePictureUrl
          ? { profilePictureUrl: input.profilePictureUrl }
          : {}),
        lastMessagePreview,
        lastMessageAt: timestamp,
        unreadCount: input.fromMe ? 0 : { increment: 1 },
        ...(input.fromMe ? {} : { archivedAt: null }),
      },
      create: {
        userId: input.userId,
        instanceId: input.instanceId,
        contactJid,
        contactName: input.contactName ?? null,
        profilePictureUrl: input.profilePictureUrl ?? null,
        lastMessagePreview,
        lastMessageAt: timestamp,
        unreadCount: input.fromMe ? 0 : 1,
      },
      include: latestMessageInclude(),
    });
    const message = await createMessageRecord(tx, {
      ...input,
      conversationId: conversation.id,
      timestamp,
    });

    return {
      conversation: {
        ...conversation,
        messages: [message],
      },
      message,
      duplicate: false,
    };
  });
}

async function createMessageRecord(
  tx: Prisma.TransactionClient,
  input: {
    conversationId: string;
    userId: string;
    instanceId: string;
    externalMessageId: string;
    fromMe: boolean;
    senderJid?: string | null;
    senderName?: string | null;
    type: MessageType;
    contentText?: string | null;
    mediaType?: string | null;
    mediaUrl?: string | null;
    mediaBase64?: string | null;
    timestamp: Date;
    rawPayload?: unknown;
  },
) {
  return tx.message.create({
    data: {
      conversationId: input.conversationId,
      userId: input.userId,
      instanceId: input.instanceId,
      externalMessageId: input.externalMessageId,
      fromMe: input.fromMe,
      senderJid: input.senderJid ?? null,
      senderName: input.senderName ?? null,
      type: input.type,
      contentText: input.contentText ?? null,
      mediaType: input.mediaType ?? null,
      mediaUrl: input.mediaUrl ?? null,
      mediaBase64: input.mediaBase64 ?? null,
      timestamp: input.timestamp,
      rawPayload: toJson(input.rawPayload),
    },
  });
}

function latestMessageInclude() {
  return {
    messages: {
      orderBy: { timestamp: "desc" as const },
      take: 1,
    },
  };
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

function shouldClearWhatsAppDataForPhoneChange(
  previousPhone: string | null | undefined,
  nextPhone: string | null | undefined,
): boolean {
  const previous = previousPhone?.trim();
  const next = nextPhone?.trim();
  if (!previous || !next) return false;
  return !phonesMatch(previous, next);
}

async function clearWhatsAppInstanceConversationData(
  instanceId: string,
): Promise<void> {
  await getPrisma().$transaction([
    getPrisma().message.deleteMany({ where: { instanceId } }),
    getPrisma().conversation.deleteMany({ where: { instanceId } }),
  ]);
}

async function deactivateAiForUserIfEnabled(userId: string) {
  await getPrisma().userSettings.updateMany({
    where: {
      userId,
      aiEnabled: true,
    },
    data: {
      aiEnabled: false,
    },
  });

  return getPrisma().userSettings.findUnique({ where: { userId } });
}

async function getBusinessSettingsForUser(userId: string) {
  return getPrisma().businessSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

async function dispatchMessageToBackend(
  request: FastifyRequest,
  input: {
    payload: unknown;
    instanceToken: string;
    userId: string;
    businessSettings?: ReturnType<typeof businessSettingsDto>;
    virtualAttendantSettings?: ReturnType<typeof settingsDto>;
  },
): Promise<{
  skipped: boolean;
  action: string | null;
  outboundMessage: BackendDispatchOutboundMessage | null;
}> {
  if (!env.INTERNAL_SERVICE_TOKEN) {
    return { skipped: true, action: null, outboundMessage: null };
  }

  const membership = await getPrisma().tenantMember.findFirst({
    where: { userId: input.userId },
    select: { tenantId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    request.log.warn(
      { userId: input.userId },
      "Backend dispatch skipped: tenant membership not found",
    );
    return { skipped: true, action: null, outboundMessage: null };
  }

  const payload = recordValue(input.payload);
  const externalInstanceId =
    typeof payload?.instanceId === "string"
      ? payload.instanceId
      : typeof payload?.instance === "string"
        ? payload.instance
        : null;
  if (!externalInstanceId) {
    request.log.warn(
      { userId: input.userId },
      "Backend dispatch skipped: Evolution instance id missing",
    );
    return { skipped: true, action: null, outboundMessage: null };
  }

  try {
    await syncEvolutionChannelToAiOrchestrator({
      tenantId: membership.tenantId,
      userId: input.userId,
      requestId: request.id,
      externalInstanceId,
    });
    const result = await dispatchToAiOrchestrator(
      "/internal/evolution/dispatch",
      {
        tenantId: membership.tenantId,
        userId: input.userId,
        requestId: request.id,
        body: input,
      },
    );
    const record = recordValue(result);
    return {
      skipped: false,
      action: typeof record?.action === "string" ? record.action : null,
      outboundMessage: isOutboundMessage(record?.outboundMessage)
        ? record.outboundMessage
        : null,
    };
  } catch (error) {
    request.log.warn({ err: errorMessage(error) }, "Backend dispatch failed");
    return { skipped: true, action: null, outboundMessage: null };
  }
}

async function pauseBotHandoffInBackend(
  request: FastifyRequest,
  userId: string,
  input: { phone: string; reason: string; summary?: string },
): Promise<{ skipped: boolean }> {
  if (!env.INTERNAL_SERVICE_TOKEN) return { skipped: true };

  try {
    await dispatchToAiOrchestrator("/internal/handoffs", {
      userId,
      requestId: request.id,
      body: input,
    });
    return { skipped: false };
  } catch (error) {
    request.log.warn({ err: errorMessage(error) }, "Backend bot pause failed");
    return { skipped: true };
  }
}

async function findActiveIgnoredContact(input: {
  userId: string;
  instanceId: string;
  jid: string;
}): Promise<IgnoredContact | null> {
  const jid = normalizeWhatsappJid(input.jid);
  if (!jid) return null;

  return getPrisma().ignoredContact.findFirst({
    where: {
      userId: input.userId,
      instanceId: input.instanceId,
      jid,
      isActive: true,
    },
  });
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
  return getPrisma().ignoredContact.upsert({
    where: {
      userId_instanceId_jid: {
        userId: input.userId,
        instanceId: input.instanceId,
        jid,
      },
    },
    update: {
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
    },
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

async function logAiSuppression(input: {
  userId: string;
  instanceId: string;
  conversationId?: string | null;
  messageId?: string | null;
  contactJid: string;
  reason: AiSuppressionReason;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await getPrisma().aiSuppressionLog.create({
      data: {
        userId: input.userId,
        instanceId: input.instanceId,
        conversationId: input.conversationId ?? null,
        messageId: input.messageId ?? null,
        contactJid: input.contactJid,
        reason: input.reason,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch {
    // Suppression logs are diagnostic; webhook processing should continue if this insert fails.
  }
}

function checkVirtualAttendantEligibility(input: {
  settings: Parameters<typeof settingsDto>[0];
  instance: { lastOwnerActivityAt?: Date | null };
  conversation: { lastOwnerActivityAt?: Date | null };
  now?: Date;
}): { allowed: boolean; reason: string; metadata?: Record<string, unknown> } {
  const settings = settingsDto(input.settings);

  if (!settings.aiEnabled) {
    return { allowed: false, reason: "ai_disabled" };
  }

  if (settings.readinessIssues.length > 0) {
    return {
      allowed: false,
      reason:
        settings.personaType === "CUSTOM"
          ? "custom_persona_not_ready"
          : "settings_incomplete",
      metadata: { readinessIssues: settings.readinessIssues },
    };
  }

  if (settings.activationMode !== "AWAY_FROM_WHATSAPP") {
    return { allowed: true, reason: "allowed" };
  }

  const timeoutMinutes = settings.awayTimeoutMinutes;
  if (!timeoutMinutes || timeoutMinutes < 1 || !settings.awayScope) {
    return { allowed: false, reason: "settings_incomplete" };
  }

  const reference =
    settings.awayScope === "GLOBAL"
      ? input.instance.lastOwnerActivityAt
      : input.conversation.lastOwnerActivityAt;
  if (!reference) {
    return { allowed: true, reason: "allowed" };
  }

  const now = input.now ?? new Date();
  const elapsedMs = now.getTime() - reference.getTime();
  const timeoutMs = timeoutMinutes * 60 * 1000;
  if (elapsedMs < timeoutMs) {
    return {
      allowed: false,
      reason: "away_timeout_not_reached",
      metadata: {
        awayScope: settings.awayScope,
        awayTimeoutMinutes: timeoutMinutes,
        lastOwnerActivityAt: reference.toISOString(),
        remainingSeconds: Math.ceil((timeoutMs - elapsedMs) / 1000),
      },
    };
  }

  return { allowed: true, reason: "allowed" };
}

async function recordOwnerManualActivity(input: {
  instanceId: string;
  conversationId: string;
  happenedAt?: Date;
}): Promise<void> {
  const happenedAt = input.happenedAt ?? new Date();
  await getPrisma().$transaction([
    getPrisma().whatsAppInstance.update({
      where: { id: input.instanceId },
      data: { lastOwnerActivityAt: happenedAt },
    }),
    getPrisma().conversation.update({
      where: { id: input.conversationId },
      data: { lastOwnerActivityAt: happenedAt },
    }),
  ]);
}

function isOutboundMessage(
  value: unknown,
): value is BackendDispatchOutboundMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { text?: unknown }).text === "string",
  );
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
