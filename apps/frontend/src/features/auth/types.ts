import type { AuthScenario } from "./AuthScreen";

export interface AuthService {
  submit(scenario: AuthScenario): Promise<void>;
}
