import { type BffHttpClient } from "../http/BffHttpClient";
import type { RetentionDays } from "../mappers/publicApiSchemas";
import { retentionSettingsSchema } from "../mappers/publicApiSchemas";

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
      schema: retentionSettingsSchema,
      signal,
    });
  }

  update(input: RetentionPatchInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: "/v1/settings/retention",
      schema: retentionSettingsSchema,
      signal,
    });
  }
}
