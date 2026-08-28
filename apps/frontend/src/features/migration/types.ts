export type MigrationTarget = "atendly" | "external";
export type MigrationScenario =
  | "to-atendly-intro"
  | "to-external-intro"
  | "diagnosis"
  | "diagnosis-external"
  | "diagnosis-external-available"
  | "conflicts"
  | "review"
  | "progress"
  | "success"
  | "partial"
  | "error";
export interface MigrationService {
  diagnose(
    target: MigrationTarget,
  ): Promise<{ conflicts: number; supported: boolean }>;
  run(target: MigrationTarget): Promise<void>;
}
