import { type BffHttpClient } from "../http/BffHttpClient";
import type { AiTone } from "../mappers/publicApiSchemas";
import {
  availabilitySettingsSchema,
  settingsStateSchema,
} from "../mappers/publicApiSchemas";

export interface BusinessSettingsInput {
  category: string;
  name: string;
  timezone: string;
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
}

export class BffSettingsService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/settings",
      schema: settingsStateSchema,
      signal,
    });
  }

  updateBusiness(input: BusinessSettingsInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/business",
      schema: settingsStateSchema,
      signal,
    });
  }

  updateAi(input: AiSettingsInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/ai",
      schema: settingsStateSchema,
      signal,
    });
  }

  updateAvailability(input: AvailabilitySettingsInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/availability",
      schema: availabilitySettingsSchema,
      signal,
    });
  }
}
