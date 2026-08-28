export type DashboardScenario =
  | "atendly"
  | "external"
  | "empty"
  | "loading"
  | "integration-error"
  | "whatsapp-disconnected";

export interface DashboardService {
  getScenario(name?: DashboardScenario): Promise<DashboardScenario>;
}
