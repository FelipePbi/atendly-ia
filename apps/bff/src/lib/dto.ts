import type { BusinessSettings, IgnoredContact, User, UserProfile, UserSettings, WhatsAppInstance } from "../generated/prisma/client.js";

type SettingsRecord = UserSettings & {
  identityMode?: string | null;
  assistantName?: string | null;
  assistantSex?: string | null;
  professionalSex?: string | null;
  personaType?: string | null;
  customInstructions?: string | null;
  activationMode?: string | null;
  awayTimeoutMinutes?: number | null;
  awayScope?: string | null;
  customPersonaStatus?: string | null;
  customPersonaProfileJson?: unknown;
  customPersonaGeneratedAt?: Date | string | null;
  virtualAttendantOnboardingCompleted?: boolean | null;
  updatedAt?: Date | string | null;
};

type ProfileRecord = (UserProfile & { birthDate?: Date | string | null; onboardingCompletedAt?: Date | string | null }) | null;
type InstanceRecord = (WhatsAppInstance & { connectedAt?: Date | string | null }) | null;

export function userDto(user: Pick<User, "id" | "email" | "createdAt">) {
  return {
    id: user.id,
    email: user.email,
    createdAt: toIso(user.createdAt)
  };
}

export function profileDto(profile: ProfileRecord) {
  if (!profile) return null;

  return {
    fullName: profile.fullName,
    birthDate: profile.birthDate ? toIso(profile.birthDate).slice(0, 10) : null,
    sex: profile.sex,
    businessName: profile.businessName,
    whatsappPhoneRaw: profile.whatsappPhoneRaw,
    whatsappPhoneNormalized: profile.whatsappPhoneNormalized,
    onboardingCompletedAt: profile.onboardingCompletedAt ? toIso(profile.onboardingCompletedAt) : null
  };
}

export function onboardingDto(profile: ProfileRecord, instance: InstanceRecord, settings?: SettingsRecord | null) {
  const hasProfile = profileComplete(profile);
  const hasVirtualAttendant = Boolean(settings?.virtualAttendantOnboardingCompleted);
  const hasPhone = hasProfile && Boolean(profile?.whatsappPhoneNormalized);
  const completed = hasPhone && hasVirtualAttendant && Boolean(profile?.onboardingCompletedAt);

  return {
    completed,
    currentStep: completed ? "COMPLETE" : !hasProfile ? "PROFILE" : !hasVirtualAttendant ? "VIRTUAL_ATTENDANT" : "WHATSAPP",
    profileComplete: hasProfile,
    virtualAttendantComplete: hasVirtualAttendant,
    phoneComplete: hasPhone,
    whatsappConnected: instance?.status === "CONNECTED",
    phoneVerified: Boolean(hasPhone && instance?.status === "CONNECTED"),
    completedAt: profile?.onboardingCompletedAt ? toIso(profile.onboardingCompletedAt) : null
  };
}

export function settingsDto(settings: SettingsRecord | null | undefined) {
  const dto = {
    aiEnabled: Boolean(settings?.aiEnabled),
    identityMode: settings?.identityMode === "SEPARATE_ASSISTANT" ? "SEPARATE_ASSISTANT" : "PROFESSIONAL",
    assistantName: settings?.assistantName?.trim() ?? "",
    assistantSex: settings?.assistantSex === "FEMALE" || settings?.assistantSex === "MALE" ? settings.assistantSex : null,
    professionalSex: settings?.professionalSex === "MALE" ? "MALE" : "FEMALE",
    personaType:
      settings?.personaType === "CORPORATE" || settings?.personaType === "WARM" || settings?.personaType === "CUSTOM"
        ? settings.personaType
        : null,
    customInstructions: settings?.customInstructions?.trim() ?? "",
    activationMode: settings?.activationMode === "AWAY_FROM_WHATSAPP" ? "AWAY_FROM_WHATSAPP" : "ALWAYS",
    awayTimeoutMinutes: settings?.awayTimeoutMinutes ?? null,
    awayScope: settings?.awayScope === "GLOBAL" || settings?.awayScope === "CONVERSATION" ? settings.awayScope : null,
    customPersonaStatus: isCustomPersonaStatus(settings?.customPersonaStatus) ? settings.customPersonaStatus : "NOT_STARTED",
    customPersonaProfile: parseJsonObject(settings?.customPersonaProfileJson),
    customPersonaGeneratedAt: settings?.customPersonaGeneratedAt ? toIso(settings.customPersonaGeneratedAt) : null,
    virtualAttendantOnboardingCompleted: Boolean(settings?.virtualAttendantOnboardingCompleted),
    configured: false,
    canEnable: false,
    readinessIssues: [] as string[],
    updatedAt: settings?.updatedAt ? toIso(settings.updatedAt) : null
  };

  dto.readinessIssues = readinessIssues(dto);
  dto.configured = dto.readinessIssues.length === 0;
  dto.canEnable = dto.configured;
  return dto;
}

export function instanceDto(instance: InstanceRecord) {
  if (!instance) return null;

  return {
    id: instance.id,
    phoneNumber: instance.phoneNumber,
    status: instance.status,
    qrcode: instance.qrcode,
    connectedAt: instance.connectedAt ? toIso(instance.connectedAt) : null
  };
}

export function businessSettingsDto(settings: BusinessSettings) {
  return {
    id: settings.id,
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
    configured: settings.businessName.trim().length >= 2,
    createdAt: toIso(settings.createdAt),
    updatedAt: toIso(settings.updatedAt)
  };
}

export function ignoredContactDto(contact: IgnoredContact) {
  return {
    id: contact.id,
    jid: contact.jid,
    phoneNumber: contact.phoneNumber,
    displayName: contact.displayName,
    pushName: contact.pushName,
    businessName: contact.businessName,
    source: contact.source,
    reason: contact.reason,
    isActive: contact.isActive,
    createdAt: toIso(contact.createdAt),
    updatedAt: toIso(contact.updatedAt)
  };
}

function profileComplete(profile: ProfileRecord): boolean {
  return Boolean(profile?.fullName.trim() && profile.birthDate && profile.sex && profile.businessName.trim());
}

function readinessIssues(settings: {
  identityMode: string;
  assistantName: string;
  assistantSex: string | null;
  personaType: string | null;
  activationMode: string;
  awayTimeoutMinutes: number | null;
  awayScope: string | null;
  customPersonaStatus: string;
}): string[] {
  const issues: string[] = [];

  if (settings.identityMode === "SEPARATE_ASSISTANT" && !settings.assistantName.trim()) {
    issues.push("Defina o nome da atendente virtual.");
  }
  if (settings.identityMode === "SEPARATE_ASSISTANT" && !settings.assistantSex) {
    issues.push("Defina o sexo da atendente virtual.");
  }
  if (!settings.personaType) {
    issues.push("Escolha uma persona.");
  }
  if (settings.activationMode === "AWAY_FROM_WHATSAPP") {
    if (!settings.awayTimeoutMinutes || settings.awayTimeoutMinutes < 1) {
      issues.push("Informe um tempo de inatividade de pelo menos 1 minuto.");
    }
    if (!settings.awayScope) {
      issues.push("Escolha o escopo da ausência.");
    }
  }
  if (settings.personaType === "CUSTOM" && settings.customPersonaStatus !== "READY") {
    issues.push("Gere a persona personalizada com pelo menos 3 conversas TXT válidas.");
  }

  return issues;
}

function isCustomPersonaStatus(value: unknown): value is string {
  return (
    value === "NOT_STARTED" ||
    value === "WAITING_UPLOADS" ||
    value === "PROCESSING" ||
    value === "READY" ||
    value === "FAILED" ||
    value === "NEEDS_PARTICIPANT"
  );
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
