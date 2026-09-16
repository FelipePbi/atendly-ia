import {
  BffHttpClient,
  type BffHttpClientOptions,
} from "../http/BffHttpClient";
import { BffAccountService } from "./BffAccountService";
import { BffActivationTestService } from "./BffActivationTestService";
import { BffAuthService } from "./BffAuthService";
import { BffCalendarService } from "./BffCalendarService";
import { BffConversationService } from "./BffConversationService";
import { BffCustomerService } from "./BffCustomerService";
import { BffDashboardService } from "./BffDashboardService";
import { BffKnowledgeService } from "./BffKnowledgeService";
import { BffMigrationService } from "./BffMigrationService";
import { BffNotificationService } from "./BffNotificationService";
import { BffOnboardingService } from "./BffOnboardingService";
import { BffRetentionService } from "./BffRetentionService";
import { BffServiceCatalogService } from "./BffServiceCatalogService";
import { BffSettingsService } from "./BffSettingsService";
import { BffStatusService } from "./BffStatusService";
import { BffWhatsAppService } from "./BffWhatsAppService";

export interface BffServiceRegistry {
  account: BffAccountService;
  activationTest: BffActivationTestService;
  auth: BffAuthService;
  calendar: BffCalendarService;
  conversations: BffConversationService;
  customers: BffCustomerService;
  dashboard: BffDashboardService;
  knowledge: BffKnowledgeService;
  migration: BffMigrationService;
  notifications: BffNotificationService;
  onboarding: BffOnboardingService;
  retention: BffRetentionService;
  serviceCatalog: BffServiceCatalogService;
  settings: BffSettingsService;
  status: BffStatusService;
  whatsapp: BffWhatsAppService;
}

export interface BffServiceRegistryOptions extends Omit<
  BffHttpClientOptions,
  "baseUrl"
> {
  baseUrl?: string;
}

export function createBffServiceRegistry(
  options: BffServiceRegistryOptions = {},
): BffServiceRegistry {
  const http = new BffHttpClient({
    ...options,
    baseUrl: options.baseUrl ?? requiredBffBaseUrl(),
  });

  return {
    account: new BffAccountService(http),
    activationTest: new BffActivationTestService(http),
    auth: new BffAuthService(http),
    calendar: new BffCalendarService(http),
    conversations: new BffConversationService(http),
    customers: new BffCustomerService(http),
    dashboard: new BffDashboardService(http),
    knowledge: new BffKnowledgeService(http),
    migration: new BffMigrationService(http),
    notifications: new BffNotificationService(http),
    onboarding: new BffOnboardingService(http),
    retention: new BffRetentionService(http),
    serviceCatalog: new BffServiceCatalogService(http),
    settings: new BffSettingsService(http),
    status: new BffStatusService(http),
    whatsapp: new BffWhatsAppService(http),
  };
}

function requiredBffBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_BFF_URL?.trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_BFF_URL is required to use BFF services.");
  }
  return value;
}
