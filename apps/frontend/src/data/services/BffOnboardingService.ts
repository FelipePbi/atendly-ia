import { type BffHttpClient } from "../http/BffHttpClient";
import type { AiTone, CalendarSource } from "../mappers/publicApiSchemas";
import { onboardingStateSchema } from "../mappers/publicApiSchemas";

export interface OnboardingPatch {
  ai?: { tone: AiTone };
  availability?: {
    rules: Array<{
      active?: boolean;
      dayOfWeek: number;
      endTime: string;
      startTime: string;
    }>;
    timezone: string;
  };
  business?: {
    category: string;
    name: string;
    timezone: string;
  };
  calendar?: {
    source: CalendarSource;
    timezone: string;
  };
  service?: {
    active?: boolean;
    durationMinutes: number;
    id?: string;
    name: string;
    price?: number | null;
    priceType: "FIXED" | "ON_REQUEST";
  };
}

export class BffOnboardingService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/onboarding",
      schema: onboardingStateSchema,
      signal,
    });
  }

  update(input: OnboardingPatch, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/onboarding",
      schema: onboardingStateSchema,
      signal,
    });
  }

  complete(signal?: AbortSignal) {
    return this.http.request({
      method: "POST",
      path: "/v1/onboarding/complete",
      schema: onboardingStateSchema,
      signal,
    });
  }
}
