import { MockAuthService } from "./services/MockAuthService";
import { MockCalendarService } from "./services/MockCalendarService";
import { MockConversationService } from "./services/MockConversationService";
import { MockCustomerService } from "./services/MockCustomerService";
import { MockDashboardService } from "./services/MockDashboardService";
import { MockMigrationService } from "./services/MockMigrationService";
import { MockOnboardingService } from "./services/MockOnboardingService";
import { MockServiceCatalogService } from "./services/MockServiceCatalogService";
import { MockSettingsService } from "./services/MockSettingsService";

export const previewServices = {
  auth: new MockAuthService(),
  calendar: new MockCalendarService(),
  conversations: new MockConversationService(),
  customers: new MockCustomerService(),
  dashboard: new MockDashboardService(),
  migration: new MockMigrationService(),
  onboarding: new MockOnboardingService(),
  services: new MockServiceCatalogService(),
  settings: new MockSettingsService(),
};

export const mockServices = previewServices;
