import { type z } from "zod";

import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type accountDeletionResultSchema,
  type accountProfileResultSchema,
} from "../mappers/publicApiSchemas";

type AccountDeletionResult = z.infer<typeof accountDeletionResultSchema>;
type AccountProfileResult = z.infer<typeof accountProfileResultSchema>;

export class BffAccountService {
  constructor(private readonly http: BffHttpClient) {}

  requestDeletion(password: string, signal?: AbortSignal) {
    return this.http.request({
      body: { password },
      method: "POST",
      path: "/v1/account/deletion",
      schema: routeSchema<AccountDeletionResult>(
        "POST",
        "/v1/account/deletion",
      ),
      signal,
    });
  }

  cancelDeletion(signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: "/v1/account/deletion",
      schema: routeSchema<AccountDeletionResult>(
        "DELETE",
        "/v1/account/deletion",
      ),
      signal,
    });
  }

  /** Grava o nome do dono da conta (Goal067). */
  updateProfile(name: string, signal?: AbortSignal) {
    return this.http.request({
      body: { name },
      method: "PATCH",
      path: "/v1/account/profile",
      schema: routeSchema<AccountProfileResult>(
        "PATCH",
        "/v1/account/profile",
      ),
      signal,
    });
  }
}
