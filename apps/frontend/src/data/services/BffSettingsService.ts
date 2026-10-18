import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import type {
  AgendaInitialView,
  AgendaViewPreference,
  AiSandboxSettings,
  AiSandboxSettingsInput,
  AiTone,
  AppearancePreference,
  AvailabilitySettings,
  BusinessAddressParts,
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
  /** Partes do endereço; o BFF monta `address` a partir delas. */
  addressParts?: BusinessAddressParts | null;
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
  /** Prazo mínimo para o cliente cancelar/remarcar pela IA (Goal073); ausente preserva o valor gravado. */
  customerChangeMinNoticeMinutes?: number;
}

export interface AgendaViewPreferenceInput {
  /** Ausente preserva o que já está gravado. */
  hiddenWeekdays?: number[];
  /** `null` limpa a escolha; ausente preserva. */
  initialView?: AgendaInitialView | null;
}

/** Aparência da conta (D-181); campo ausente preserva o que está gravado. */
export type AppearancePreferenceInput = Partial<AppearancePreference>;

export interface ReminderSettingsInput {
  // `rules` é sempre obrigatório na escrita, mesmo vazio (`[]` desliga os
  // lembretes de propósito, distinto de nunca ter configurado).
  rules: Array<{ slot: ReminderSlot; leadMinutes: number }>;
  confirmationEnabled?: boolean;
  pricePolicy?: ReminderPricePolicy;
  /** D-197: ausente mantém a gravada; `null` volta ao padrão. */
  messageExample?: string | null;
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

  getAgendaViewPreference(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/settings/agenda-view",
      schema: routeSchema<AgendaViewPreference>(
        "GET",
        "/v1/settings/agenda-view",
      ),
      signal,
    });
  }

  updateAgendaViewPreference(
    input: AgendaViewPreferenceInput,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/agenda-view",
      schema: routeSchema<AgendaViewPreference>(
        "PATCH",
        "/v1/settings/agenda-view",
      ),
      signal,
    });
  }

  getAppearance(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/settings/appearance",
      schema: routeSchema<AppearancePreference>(
        "GET",
        "/v1/settings/appearance",
      ),
      signal,
    });
  }

  updateAppearance(input: AppearancePreferenceInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/appearance",
      schema: routeSchema<AppearancePreference>(
        "PATCH",
        "/v1/settings/appearance",
      ),
      signal,
    });
  }

  /** Modo sandbox da IA (D-199). */
  getAiSandbox(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/settings/ai/sandbox",
      schema: routeSchema<AiSandboxSettings>("GET", "/v1/settings/ai/sandbox"),
      signal,
    });
  }

  /** Campo ausente preserva o gravado; a lista, quando vem, substitui. */
  updateAiSandbox(input: AiSandboxSettingsInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/ai/sandbox",
      schema: routeSchema<AiSandboxSettings>(
        "PATCH",
        "/v1/settings/ai/sandbox",
      ),
      signal,
    });
  }
}
