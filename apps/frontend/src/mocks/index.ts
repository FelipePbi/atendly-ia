import { MockAuthService } from "./services/MockAuthService";

export const previewServices = {
  auth: new MockAuthService(),
};
