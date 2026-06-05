import "server-only";

import type { UserProfile, UserSettings, WhatsAppInstance } from "@/generated/prisma/client";

export type OnboardingStep = "PROFILE" | "VIRTUAL_ATTENDANT" | "WHATSAPP" | "COMPLETE";

export function profileComplete(profile: UserProfile | null | undefined): profile is UserProfile {
  return Boolean(
    profile?.fullName.trim() &&
      profile.birthDate &&
      profile.sex &&
      profile.businessName.trim()
  );
}

export function phoneComplete(profile: UserProfile | null | undefined): profile is UserProfile {
  return profileComplete(profile) && Boolean(profile.whatsappPhoneNormalized);
}

export function virtualAttendantComplete(settings: UserSettings | null | undefined): boolean {
  return Boolean(settings?.virtualAttendantOnboardingCompleted);
}

export function onboardingComplete(
  profile: UserProfile | null | undefined,
  settings?: UserSettings | null | undefined
): boolean {
  return phoneComplete(profile) && virtualAttendantComplete(settings) && Boolean(profile?.onboardingCompletedAt);
}

export function onboardingDto(
  profile: UserProfile | null | undefined,
  instance: WhatsAppInstance | null | undefined,
  settings?: UserSettings | null | undefined
) {
  const hasProfile = profileComplete(profile);
  const hasVirtualAttendant = virtualAttendantComplete(settings);
  const hasPhone = phoneComplete(profile);
  const phoneVerified = Boolean(hasPhone && instance?.status === "CONNECTED");
  const completed = onboardingComplete(profile, settings);

  return {
    completed,
    currentStep: resolveCurrentStep({ hasProfile, hasVirtualAttendant, completed }),
    profileComplete: hasProfile,
    virtualAttendantComplete: hasVirtualAttendant,
    phoneComplete: hasPhone,
    whatsappConnected: instance?.status === "CONNECTED",
    phoneVerified,
    completedAt: profile?.onboardingCompletedAt?.toISOString() ?? null,
  };
}

function resolveCurrentStep(input: {
  hasProfile: boolean;
  hasVirtualAttendant: boolean;
  completed: boolean;
}): OnboardingStep {
  if (input.completed) return "COMPLETE";
  if (!input.hasProfile) return "PROFILE";
  if (!input.hasVirtualAttendant) return "VIRTUAL_ATTENDANT";
  return "WHATSAPP";
}
