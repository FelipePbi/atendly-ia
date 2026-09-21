import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import type { SystemStatus } from "../mappers/publicApiSchemas";

export class BffStatusService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/status",
      schema: routeSchema<SystemStatus>("GET", "/v1/status"),
      signal,
    });
  }
}
