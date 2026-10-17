import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type RevenueAppointmentKind,
  type RevenueAppointmentList,
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

  /** Os atendimentos por trás dos números (D-179). */
  appointments(
    query: {
      period: RevenuePeriod;
      date?: string;
      kind: RevenueAppointmentKind;
    },
    signal?: AbortSignal,
  ) {
    return this.http.request({
      path: "/v1/revenue/appointments",
      query: { period: query.period, date: query.date, kind: query.kind },
      schema: routeSchema<RevenueAppointmentList>(
        "GET",
        "/v1/revenue/appointments",
      ),
      signal,
    });
  }
}
