import { type BffHttpClient } from "../http/BffHttpClient";
import {
  type CalendarSource,
  migrationDiagnosisSchema,
  migrationSchema,
  migrationStartSchema,
} from "../mappers/publicApiSchemas";

export class BffMigrationService {
  constructor(private readonly http: BffHttpClient) {}

  diagnose(target: CalendarSource, signal?: AbortSignal) {
    return this.http.request({
      body: { target },
      method: "POST",
      path: "/v1/calendar/migrations/diagnose",
      schema: migrationDiagnosisSchema,
      signal,
    });
  }

  create(target: CalendarSource, signal?: AbortSignal) {
    return this.http.request({
      body: { target },
      method: "POST",
      path: "/v1/calendar/migrations",
      schema: migrationStartSchema,
      signal,
    });
  }

  get(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/calendar/migrations/${encodeURIComponent(id)}`,
      schema: migrationSchema,
      signal,
    });
  }
}
