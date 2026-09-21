import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import { type Dashboard } from "../mappers/publicApiSchemas";

export class BffDashboardService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/dashboard",
      schema: routeSchema<Dashboard>("GET", "/v1/dashboard"),
      signal,
    });
  }
}
