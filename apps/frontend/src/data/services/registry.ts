import {
  BffHttpClient,
  type BffHttpClientOptions,
} from "../http/BffHttpClient";
import { BffAuthService } from "./BffAuthService";
import { BffCalendarService } from "./BffCalendarService";
import { BffConversationService } from "./BffConversationService";
import { BffCustomerService } from "./BffCustomerService";
import { BffDashboardService } from "./BffDashboardService";
import { BffMigrationService } from "./BffMigrationService";
import { BffOnboardingService } from "./BffOnboardingService";
import { BffServiceCatalogService } from "./BffServiceCatalogService";
import { BffSettingsService } from "./BffSettingsService";
import { BffWhatsAppService } from "./BffWhatsAppService";

export interface BffServiceRegistry {
  auth: BffAuthService;
  calendar: BffCalendarService;
  conversations: BffConversationService;
  customers: BffCustomerService;
  dashboard: BffDashboardService;
  migration: BffMigrationService;
  onboarding: BffOnboardingService;
  serviceCatalog: BffServiceCatalogService;
  settings: BffSettingsService;
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
    auth: new BffAuthService(http),
    calendar: new BffCalendarService(http),
    conversations: new BffConversationService(http),
    customers: new BffCustomerService(http),
    dashboard: new BffDashboardService(http),
    migration: new BffMigrationService(http),
    onboarding: new BffOnboardingService(http),
    serviceCatalog: new BffServiceCatalogService(http),
    settings: new BffSettingsService(http),
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
