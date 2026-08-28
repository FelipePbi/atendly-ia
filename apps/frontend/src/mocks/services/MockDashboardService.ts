import type {
  DashboardScenario,
  DashboardService,
} from "@/features/dashboard/types";

export class MockDashboardService implements DashboardService {
  async getScenario(name: DashboardScenario = "atendly") {
    return Promise.resolve(name);
  }
}
