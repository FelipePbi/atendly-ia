import { type BffHttpClient } from "../http/BffHttpClient";
import { serviceListSchema, serviceSchema } from "../mappers/publicApiSchemas";

export interface ServiceInput {
  active?: boolean;
  durationMinutes: number;
  name: string;
  price?: number | null;
  priceType: "FIXED" | "ON_REQUEST";
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
