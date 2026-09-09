import { type BffHttpClient } from "../http/BffHttpClient";
import { serviceListSchema, serviceSchema } from "../mappers/publicApiSchemas";

export type ServiceColorToken =
  | "ROSE"
  | "AMBER"
  | "EMERALD"
  | "SKY"
  | "VIOLET"
  | "SLATE";

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
      schema: serviceListSchema,
      signal,
    });
  }

  create(input: ServiceInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/services",
      schema: serviceSchema,
      signal,
    });
  }

  update(id: string, input: UpdateServiceInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: `/v1/services/${encodeURIComponent(id)}`,
      schema: serviceSchema,
      signal,
    });
  }
}
