export type SettingsScenario =
  | "hub"
  | "hub-external"
  | "business"
  | "ai"
  | "whatsapp-connected"
  | "whatsapp-disconnected"
  | "whatsapp-reconnecting"
  | "whatsapp-expired"
  | "whatsapp-error"
  | "calendar"
  | "calendar-external"
  | "availability"
  | "account"
  | "loading"
  | "error";
export interface SettingsService {
  save(
    section: string,
    values: Record<string, string | boolean>,
  ): Promise<void>;
}
