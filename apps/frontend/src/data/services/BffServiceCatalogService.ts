import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import type {
  Service,
  ServiceAiInstruction,
  ServiceList,
} from "../mappers/publicApiSchemas";

export type ServiceColorToken =
  "ROSE" | "AMBER" | "EMERALD" | "SKY" | "VIOLET" | "SLATE";

export interface ServiceInput {
  active?: boolean;
  // Ausente vira pendencia de revisao (Goal007); nunca zero/duracao inventada.
  durationMinutes?: number | null;
  name: string;
  price?: number | null;
  priceType: "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";
  description?: string | null;
  colorToken?: ServiceColorToken | null;
  bufferBeforeMinutes?: number | null;
  bufferAfterMinutes?: number | null;
  recurrenceIntervalDays?: number | null;
}

export type UpdateServiceInput = Partial<ServiceInput>;

export class BffServiceCatalogService {
  constructor(private readonly http: BffHttpClient) {}

  list(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/services",
      schema: routeSchema<ServiceList>("GET", "/v1/services"),
      signal,
    });
  }

  create(input: ServiceInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/services",
      schema: routeSchema<Service>("POST", "/v1/services"),
      signal,
    });
  }

  update(id: string, input: UpdateServiceInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: `/v1/services/${encodeURIComponent(id)}`,
      schema: routeSchema<Service>("PATCH", "/v1/services/:id"),
      signal,
    });
  }

  getAiInstruction(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/services/${encodeURIComponent(id)}/ai-instruction`,
      schema: routeSchema<ServiceAiInstruction>(
        "GET",
        "/v1/services/:id/ai-instruction",
      ),
      signal,
    });
  }

  updateAiInstruction(id: string, content: string, signal?: AbortSignal) {
    return this.http.request({
      body: { content },
      method: "PUT",
      path: `/v1/services/${encodeURIComponent(id)}/ai-instruction`,
      schema: routeSchema<ServiceAiInstruction>(
        "PUT",
        "/v1/services/:id/ai-instruction",
      ),
      signal,
    });
  }
}
