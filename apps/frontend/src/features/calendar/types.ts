export type AgendaScenario =
  | "atendly"
  | "external"
  | "empty"
  | "loading"
  | "integration-error"
  | "sync-conflict"
  | "new"
  | "detail"
  | "reschedule"
  | "cancel"
  | "block-time";
export interface Appointment {
  id: string;
  customer: string;
  service: string;
  start: string;
  duration: number;
  origin: "ai" | "manual" | "external";
  status: "confirmed" | "cancelled";
}
export interface CalendarService {
  list(): Promise<Appointment[]>;
  create(appointment: Appointment): Promise<Appointment>;
  cancel(id: string): Promise<void>;
}
