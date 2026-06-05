import type { ApiOnboarding, ApiWhatsAppInstance } from "@/types/domain";

export function postAuthPath(input: {
  onboarding?: ApiOnboarding | null;
  whatsappInstance?: ApiWhatsAppInstance | null;
}): "/onboarding" | "/chat" {
  if (!input.onboarding?.completed) return "/onboarding";
  return "/chat";
}
