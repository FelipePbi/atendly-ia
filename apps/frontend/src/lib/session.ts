import "server-only";

import { bffFetch } from "@/lib/bff";
import type { ApiOnboarding, ApiSettings, ApiUser, ApiUserProfile, ApiWhatsAppInstance } from "@/types/domain";

export type CurrentSession = {
  user: ApiUser;
  profile: ApiUserProfile | null;
  onboarding: ApiOnboarding;
  settings: ApiSettings;
  whatsappInstance: ApiWhatsAppInstance | null;
};

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const { response, envelope } = await bffFetch<CurrentSession>("/auth/me");
  if (!response.ok || !envelope?.data) return null;
  return envelope.data;
}
