import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import type {
  AiTone,
  BusinessModality,
  CalendarSource,
  OnboardingState,
} from "../mappers/publicApiSchemas";

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
    /** Ausente preserva o que já está gravado (Goal018/WU-01). */
    modalities?: BusinessModality[];
    /** Chave ausente preserva o valor gravado; `null` apaga. */
    address?: string | null;
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
      schema: routeSchema<OnboardingState>("GET", "/v1/onboarding"),
      signal,
    });
  }

  update(input: OnboardingPatch, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/onboarding",
      schema: routeSchema<OnboardingState>("PATCH", "/v1/onboarding"),
      signal,
    });
  }

  complete(signal?: AbortSignal) {
    return this.http.request({
      method: "POST",
      path: "/v1/onboarding/complete",
      schema: routeSchema<OnboardingState>("POST", "/v1/onboarding/complete"),
      signal,
    });
  }
}
