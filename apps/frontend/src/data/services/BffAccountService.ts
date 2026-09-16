import { type BffHttpClient } from "../http/BffHttpClient";
import { accountDeletionResultSchema } from "../mappers/publicApiSchemas";

export class BffAccountService {
  constructor(private readonly http: BffHttpClient) {}

  requestDeletion(password: string, signal?: AbortSignal) {
    return this.http.request({
      body: { password },
      method: "POST",
      path: "/v1/account/deletion",
      schema: accountDeletionResultSchema,
      signal,
    });
  }

  cancelDeletion(signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: "/v1/account/deletion",
      schema: accountDeletionResultSchema,
      signal,
    });
  }
}
