import "server-only";

import type { BusinessSettings, UserProfile } from "@/generated/prisma/client";
import {
  businessSettingsConfigured,
  DEFAULT_BUSINESS_SETTINGS,
  normalizeBusinessSettingsInput,
  type ApiBusinessSettings,
  type BusinessSettingsInput,
} from "@/lib/business-settings";
import { prisma } from "@/lib/prisma";

export function businessSettingsDto(settings: BusinessSettings): ApiBusinessSettings {
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

export async function getBusinessSettingsForUser(
  userId: string,
  profile?: Pick<UserProfile, "businessName"> | null
): Promise<BusinessSettings> {
  return prisma.businessSettings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      ...DEFAULT_BUSINESS_SETTINGS,
      businessName: profile?.businessName?.trim() ?? DEFAULT_BUSINESS_SETTINGS.businessName,
    },
  });
}

export async function updateBusinessSettingsForUser(
  userId: string,
  input: BusinessSettingsInput
): Promise<BusinessSettings> {
  const data = normalizeBusinessSettingsInput(input);

  return prisma.businessSettings.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      ...data,
    },
  });
}

export async function businessSettingsAreConfiguredForUser(userId: string): Promise<boolean> {
  const settings = await getBusinessSettingsForUser(userId);
  return businessSettingsConfigured(settings);
}
