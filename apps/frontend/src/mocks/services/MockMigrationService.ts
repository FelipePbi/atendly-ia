import type {
  MigrationService,
  MigrationTarget,
} from "@/features/migration/types";
export class MockMigrationService implements MigrationService {
  async diagnose(target: MigrationTarget) {
    return Promise.resolve({
      conflicts: target === "atendly" ? 2 : 1,
      supported: target === "atendly",
    });
  }
  async run(target: MigrationTarget) {
    void target;
    return Promise.resolve();
  }
}
