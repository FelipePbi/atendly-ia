import { type BffHttpClient } from "../http/BffHttpClient";
import { systemStatusSchema } from "../mappers/publicApiSchemas";

export class BffStatusService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/status",
      schema: systemStatusSchema,
      signal,
    });
  }
}
