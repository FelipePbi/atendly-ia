export type SettingsScenario =
  | "hub"
  | "hub-external"
  | "business"
  | "business-faq"
  | "ai"
  | "whatsapp-connected"
  | "whatsapp-disconnected"
  | "whatsapp-reconnecting"
  | "whatsapp-expired"
  | "whatsapp-error"
  | "whatsapp-ignored"
  | "calendar"
  | "calendar-external"
  | "calendar-reminders"
  | "calendar-rules"
  | "availability"
  | "conversations"
  | "account"
  | "appearance"
  | "account-deletion"
  | "activity"
  | "loading"
  | "error";
export interface SettingsService {
  save(
    section: string,
    values: Record<string, string | boolean>,
  ): Promise<void>;
}
