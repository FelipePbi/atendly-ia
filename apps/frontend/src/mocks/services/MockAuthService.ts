import type { AuthService } from "@/features/auth/types";
import type { AuthScenario } from "@/features/auth/AuthScreen";

export class MockAuthService implements AuthService {
  async submit(scenario: AuthScenario) {
    void scenario;
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
}
