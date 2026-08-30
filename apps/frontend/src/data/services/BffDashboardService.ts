import { type BffHttpClient } from "../http/BffHttpClient";
import { dashboardSchema } from "../mappers/publicApiSchemas";

export class BffDashboardService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/dashboard",
      schema: dashboardSchema,
      signal,
    });
  }
}
