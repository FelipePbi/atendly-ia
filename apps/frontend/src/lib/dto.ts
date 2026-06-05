import "server-only";

import type {
  BusinessSettings,
  Conversation,
  Message,
  User,
  UserProfile,
  UserSettings,
  WhatsAppInstance,
} from "@/generated/prisma/client";
import { onboardingDto } from "@/lib/onboarding";
import { businessSettingsConfigured, normalizeBusinessSettingsInput } from "@/lib/business-settings";
import { virtualAttendantSettingsDto } from "@/services/virtual-attendant";

export function userDto(user: User) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

export function profileDto(profile: UserProfile | null | undefined) {
  if (!profile) return null;

  return {
    fullName: profile.fullName,
    birthDate: profile.birthDate ? profile.birthDate.toISOString().slice(0, 10) : null,
    sex: profile.sex,
    businessName: profile.businessName,
    whatsappPhoneRaw: profile.whatsappPhoneRaw,
    whatsappPhoneNormalized: profile.whatsappPhoneNormalized,
    onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
  };
}

export { onboardingDto };

export function settingsDto(settings: UserSettings | null | undefined) {
  return virtualAttendantSettingsDto(settings);
}

export function businessSettingsDto(settings: BusinessSettings) {
  const normalized = normalizeBusinessSettingsInput({
    businessName: settings.businessName,
    professionalName: settings.professionalName ?? "",
    businessAddress: settings.businessAddress ?? "",
    timezone: settings.timezone,
    maxSlotsToOffer: settings.maxSlotsToOffer,
    availabilityDays: settings.availabilityDays,
    slotStepMinutes: settings.slotStepMinutes,
    appointmentLookupDays: settings.appointmentLookupDays,
    delayPolicy: settings.delayPolicy ?? "",
    cancellationPolicy: settings.cancellationPolicy ?? "",
    depositPolicy: settings.depositPolicy ?? "",
  });

  return {
    id: settings.id,
    ...normalized,
    configured: businessSettingsConfigured(normalized),
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export function instanceDto(instance: WhatsAppInstance | null | undefined) {
  if (!instance) return null;

  return {
    id: instance.id,
    phoneNumber: instance.phoneNumber,
    status: instance.status,
    qrcode: instance.qrcode,
    connectedAt: instance.connectedAt?.toISOString() ?? null,
  };
}

export function conversationDto(
  conversation: Conversation & { messages?: Message[] },
  aiHandoff?: {
    aiHandoff: boolean;
    aiHandoffReason: string | null;
    aiHandoffPauseUntil: string | null;
  }
) {
  return {
    id: conversation.id,
    contactJid: conversation.contactJid,
    contactName: conversation.contactName,
    profilePictureUrl: conversation.profilePictureUrl,
    lastMessagePreview: conversation.lastMessagePreview,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    unreadCount: conversation.unreadCount,
    archivedAt: conversation.archivedAt?.toISOString() ?? null,
    lastMessageFromMe: conversation.messages?.[0]?.fromMe ?? false,
    aiPaused: conversation.aiPaused || aiHandoff?.aiHandoff || false,
    aiPausedReason: conversation.aiPausedReason ?? aiHandoff?.aiHandoffReason ?? null,
    aiPausedUpdatedAt: conversation.aiPausedUpdatedAt?.toISOString() ?? null,
    aiHandoff: aiHandoff?.aiHandoff ?? false,
    aiHandoffReason: aiHandoff?.aiHandoffReason ?? null,
    aiHandoffPauseUntil: aiHandoff?.aiHandoffPauseUntil ?? null,
  };
}

export function messageDto(message: Message) {
  return {
    id: message.id,
    fromMe: message.fromMe,
    senderName: message.senderName,
    type: message.type,
    contentText: message.contentText,
    mediaType: message.mediaType,
    timestamp: message.timestamp.toISOString(),
  };
}
