import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import type {
  RetentionDays,
  RetentionSettings,
} from "../mappers/publicApiSchemas";
import { notifyRetentionChanged } from "./retentionChanges";

export interface RetentionPatchInput {
  commercialRetentionDays?: RetentionDays;
  personalRetentionDays?: RetentionDays;
  // Sem default: reduzir sem isto é recusado pelo BFF; aumentar nunca exige.
  confirmReduction?: boolean;
}

export class BffRetentionService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/settings/retention",
      schema: routeSchema<RetentionSettings>("GET", "/v1/settings/retention"),
      signal,
    });
  }

  update(input: RetentionPatchInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/retention",
      schema: routeSchema<RetentionSettings>("PATCH", "/v1/settings/retention"),
      signal,
    }).then((value) => {
      notifyRetentionChanged();
      return value;
    });
  }
}
