import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type ActivityArea,
  type ActivityKind,
  type ActivityPage,
} from "../mappers/publicApiSchemas";

export interface ActivityQuery {
  from?: string;
  to?: string;
  actor?: "AI" | "USER";
  areas?: ActivityArea[];
  kinds?: ActivityKind[];
  q?: string;
  cursor?: string;
  limit?: number;
}

/** Registro de atividade do negócio (D-176): só leitura. */
export class BffActivityService {
  constructor(private readonly http: BffHttpClient) {}

  list(query: ActivityQuery = {}, signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/activity",
      query: {
        from: query.from,
        to: query.to,
        actor: query.actor,
        area: query.areas?.length ? query.areas.join(",") : undefined,
        kind: query.kinds?.length ? query.kinds.join(",") : undefined,
        q: query.q,
        cursor: query.cursor,
        limit: query.limit,
      },
      schema: routeSchema<ActivityPage>("GET", "/v1/activity"),
      signal,
    });
  }
}
