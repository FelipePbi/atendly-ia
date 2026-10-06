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
  | "calendar"
  | "calendar-external"
  | "calendar-reminders"
  | "calendar-rules"
  | "availability"
  | "conversations"
  | "account"
  | "account-deletion"
  | "loading"
  | "error";
export interface SettingsService {
  save(
    section: string,
    values: Record<string, string | boolean>,
  ): Promise<void>;
}
