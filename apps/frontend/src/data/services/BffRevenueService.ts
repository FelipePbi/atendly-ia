import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type RevenuePeriod,
  type RevenueReport,
} from "../mappers/publicApiSchemas";

/** Faturamento do negócio (D-177): só leitura, já somado no servidor. */
export class BffRevenueService {
  constructor(private readonly http: BffHttpClient) {}

  get(query: { period: RevenuePeriod; date?: string }, signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/revenue",
      query: { period: query.period, date: query.date },
      schema: routeSchema<RevenueReport>("GET", "/v1/revenue"),
      signal,
    });
  }
}
