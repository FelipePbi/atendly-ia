import type { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { dispatchMessageToBackend, pauseBotHandoffInBackend } from "@/services/backend-dispatch";
import { saveVisibleMessage } from "@/services/conversation-message-store";
import {
  extractConnectedPhone,
  extractQrCode,
  getEvolutionEvent,
  getEvolutionInstanceKey,
  parseEvolutionMessage,
} from "@/services/evolution-webhook-parser";
import {
  clearWhatsAppInstanceConversationData,
  shouldClearWhatsAppDataForPhoneChange,
} from "@/services/whatsapp-data-retention";
import { deactivateAiForUserIfEnabled } from "@/services/ai-settings";
import { detectAiCommand } from "@/lib/ai-command-detector";
import { businessSettingsDto, getBusinessSettingsForUser } from "@/services/business-settings";
import {
  findActiveIgnoredContact,
  logAiSuppression,
  pauseConversationAi,
} from "@/services/ignored-contacts";
import {
  checkVirtualAttendantEligibility,
  recordOwnerManualActivity,
  virtualAttendantSettingsDto,
} from "@/services/virtual-attendant";
import { normalizeWhatsappPhone, phoneFromWhatsappJid } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expectedToken = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
  const receivedToken = request.nextUrl.searchParams.get("token")?.trim();

  if (!expectedToken || receivedToken !== expectedToken) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return Response.json({ ok: false, error: "Payload invalido." }, { status: 400 });
  }

  const instanceKey = getEvolutionInstanceKey(payload);
  if (!instanceKey) {
    return Response.json({ ok: true, ignored: "missing_instance" });
  }

  const instance = await prisma.whatsAppInstance.findFirst({
    where: {
      OR: [{ evolutionInstanceId: instanceKey }, { evolutionInstanceName: instanceKey }],
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
    return Response.json({ ok: true, ignored: "unknown_instance" });
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

    return Response.json({ ok: true });
  }

  if (event === "QR_TIMEOUT") {
    await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "QR_EXPIRED",
      },
    });

    return Response.json({ ok: true });
  }

  if (event === "QR_SUCCESS" || event === "PAIR_SUCCESS" || event === "CONNECTED") {
    const connectedPhone = extractConnectedPhone(payload);
    const normalizedPhone = connectedPhone ? normalizeWhatsappPhone(connectedPhone) : "";

    if (connectedPhone && !normalizedPhone) {
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status: "ERROR",
          phoneNumber: connectedPhone,
          qrcode: null,
        },
      });

      return Response.json({ ok: true });
    }

    if (connectedPhone && normalizedPhone && shouldClearWhatsAppDataForPhoneChange(instance.phoneNumber, connectedPhone)) {
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

    return Response.json({ ok: true });
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

    return Response.json({ ok: true });
  }

  if (event !== "MESSAGE" && event !== "SEND_MESSAGE") {
    return Response.json({ ok: true, ignored: "unsupported_event" });
  }

  const message = parseEvolutionMessage(payload);
  if (!message) {
    return Response.json({ ok: true, ignored: "unmapped_message" });
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
      const businessSettings = await getBusinessSettingsForUser(instance.userId, instance.user.profile);
      await dispatchMessageToBackend({
        payload,
        instanceToken: instance.evolutionInstanceToken,
        userId: instance.userId,
        businessSettings: businessSettingsDto(businessSettings),
        virtualAttendantSettings: virtualAttendantSettingsDto(instance.user.settings),
      });
    }

    return Response.json({ ok: true, duplicate: true });
  }

  const command = detectAiCommand(message.contentText);
  if (command?.type === "PAUSE_AI_FOR_CONTACT" && message.fromMe && !message.isGroup) {
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
      await pauseBotHandoffInBackend({
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

    return Response.json({ ok: true, action: "ai_paused_by_command" });
  }

  if (message.fromMe) {
    const dispatchResult = instance.user.settings?.aiEnabled
      ? await dispatchMessageToBackend({
          payload,
          instanceToken: instance.evolutionInstanceToken,
          userId: instance.userId,
          businessSettings: businessSettingsDto(await getBusinessSettingsForUser(instance.userId, instance.user.profile)),
          virtualAttendantSettings: virtualAttendantSettingsDto(instance.user.settings),
        })
      : { skipped: true, action: null, outboundMessage: null };

    if (dispatchResult.action !== "ignored_bot_outbound") {
      await recordOwnerManualActivity({
        instanceId: instance.id,
        conversationId: saved.conversation.id,
        happenedAt: message.timestamp,
      });
    }

    return Response.json({
      ok: true,
      action: dispatchResult.action === "ignored_bot_outbound" ? "bot_outbound_recorded" : "owner_activity_recorded",
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

    return Response.json({ ok: true, ignored: "group_chat" });
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
        aiPausedReason: ignoredContact.reason ?? "Contato na lista de ignorados.",
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
      metadata: { ignoredContactId: ignoredContact.id, source: ignoredContact.source },
    });

    return Response.json({ ok: true, ignored: "ignored_contact" });
  }

  if (instance.user.settings?.aiEnabled) {
    const businessSettings = instance.user.businessSettings ?? (await getBusinessSettingsForUser(instance.userId, instance.user.profile));
    const businessSettingsSnapshot = businessSettingsDto(businessSettings);
    if (!message.fromMe && !businessSettingsSnapshot.configured) {
      return Response.json({ ok: true, ignored: "business_settings_incomplete" });
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

      return Response.json({ ok: true, ignored: eligibility.reason, metadata: eligibility.metadata });
    }

    const dispatchResult = await dispatchMessageToBackend({
      payload,
      instanceToken: instance.evolutionInstanceToken,
      userId: instance.userId,
      businessSettings: businessSettingsSnapshot,
      virtualAttendantSettings: virtualAttendantSettingsDto(instance.user.settings),
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
          outbound.providerMessageId ?? outbound.messageRecordId ?? `backend-${message.externalMessageId}`,
        fromMe: true,
        senderJid: instance.phoneNumber,
        senderName: businessSettingsSnapshot.businessName || instance.user.profile?.businessName || null,
        type: "TEXT",
        contentText: outbound.text,
        timestamp: new Date(),
        rawPayload: outbound.rawPayload ?? null,
      });
    }
  }

  return Response.json({ ok: true });
}
