import { type BffHttpClient } from "../http/BffHttpClient";
import {
  customerListSchema,
  customerSchema,
} from "../mappers/publicApiSchemas";

export interface CreateCustomerInput {
  name?: string | null;
  phone: string;
}

export class BffCustomerService {
  constructor(private readonly http: BffHttpClient) {}

  list(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/customers",
      schema: customerListSchema,
      signal,
    });
  }

  get(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/customers/${encodeURIComponent(id)}`,
      schema: customerSchema,
      signal,
    });
  }

  create(input: CreateCustomerInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/customers",
      schema: customerSchema,
      signal,
    });
  }
}
