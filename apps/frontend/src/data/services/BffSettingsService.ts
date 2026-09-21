import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import type {
  AiTone,
  AvailabilitySettings,
  BusinessModality,
  ReminderPricePolicy,
  ReminderSettings,
  ReminderSlot,
  SettingsState,
} from "../mappers/publicApiSchemas";

export interface BusinessSettingsInput {
  category: string;
  name: string;
  timezone: string;
  /** Ausente preserva o que já está gravado (Goal018/WU-01). */
  modalities?: BusinessModality[];
  /** Chave ausente preserva o valor gravado; `null` apaga. */
  address?: string | null;
}

export interface AiSettingsInput {
  enabled: boolean;
  tone: AiTone;
}

export interface AvailabilitySettingsInput {
  rules: Array<{
    active?: boolean;
    dayOfWeek: number;
    endTime: string;
    startTime: string;
  }>;
  timezone: string;
  /** Regras de oferta do negócio (Goal009); ausentes preservam o valor gravado. */
  granularityMinutes?: number;
  maxLeadDays?: number;
  minLeadMinutes?: number;
}

export interface ReminderSettingsInput {
  // `rules` é sempre obrigatório na escrita, mesmo vazio (`[]` desliga os
  // lembretes de propósito, distinto de nunca ter configurado).
  rules: Array<{ slot: ReminderSlot; leadMinutes: number }>;
  confirmationEnabled?: boolean;
  pricePolicy?: ReminderPricePolicy;
}

export class BffSettingsService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/settings",
      schema: routeSchema<SettingsState>("GET", "/v1/settings"),
      signal,
    });
  }

  updateBusiness(input: BusinessSettingsInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/business",
      schema: routeSchema<SettingsState>("PATCH", "/v1/settings/business"),
      signal,
    });
  }

  updateAi(input: AiSettingsInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/ai",
      schema: routeSchema<SettingsState>("PATCH", "/v1/settings/ai"),
      signal,
    });
  }

  updateAvailability(input: AvailabilitySettingsInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/availability",
      schema: routeSchema<AvailabilitySettings>(
        "PATCH",
        "/v1/settings/availability",
      ),
      signal,
    });
  }

  getReminders(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/settings/reminders",
      schema: routeSchema<ReminderSettings>("GET", "/v1/settings/reminders"),
      signal,
    });
  }

  updateReminders(input: ReminderSettingsInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/reminders",
      schema: routeSchema<ReminderSettings>("PATCH", "/v1/settings/reminders"),
      signal,
    });
  }
}
