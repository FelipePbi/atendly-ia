import { type BffHttpClient } from "../http/BffHttpClient";
import {
  customerDetailSchema,
  customerListSchema,
  customerNoteSchema,
  customerPrimaryGuardianSchema,
  customerSchema,
  customerTagSchema,
  deletedSchema,
} from "../mappers/publicApiSchemas";

export interface CreateCustomerInput {
  name?: string | null;
  /** Opcional: cliente sem telefone existe e é criado manualmente. */
  phone?: string | null;
}

export interface UpdateCustomerInput {
  name?: string | null;
  phone?: string | null;
}

export interface SetPrimaryGuardianInput {
  guardianCustomerId: string;
  proposedBy?: "PROFESSIONAL" | "CUSTOMER";
  proposedByActor?: string | null;
  confirmedBy?: "PROFESSIONAL" | "CUSTOMER" | null;
  confirmedByActor?: string | null;
}

export interface CreateCustomerNoteInput {
  body: string;
  /** Uso pela IA precisa de autorização explícita; o padrão é negar. */
  aiAuthorized?: boolean;
}

export interface CreateCustomerTagInput {
  label: string;
  aiAuthorized?: boolean;
}

export class BffCustomerService {
  constructor(private readonly http: BffHttpClient) {}

  list(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/customers",
      schema: customerListSchema,
      signal,
    });
  }

  /**
   * Candidatos para um número.
   *
   * Devolve zero, uma ou várias pessoas: o telefone não identifica ninguém
   * sozinho, então quem chama precisa escolher explicitamente.
   */
  listCandidatesByPhone(phone: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/customers?phone=${encodeURIComponent(phone)}`,
      schema: customerListSchema,
      signal,
    });
  }

  get(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/customers/${encodeURIComponent(id)}`,
      schema: customerDetailSchema,
      signal,
    });
  }

  create(input: CreateCustomerInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/customers",
      schema: customerSchema,
      signal,
    });
  }

  update(id: string, input: UpdateCustomerInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: `/v1/customers/${encodeURIComponent(id)}`,
      schema: customerSchema,
      signal,
    });
  }

  setPrimaryGuardian(
    id: string,
    input: SetPrimaryGuardianInput,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "PUT",
      path: `/v1/customers/${encodeURIComponent(id)}/primary-guardian`,
      schema: customerPrimaryGuardianSchema,
      signal,
    });
  }

  confirmPrimaryGuardian(
    id: string,
    input: { confirmedBy?: "PROFESSIONAL" | "CUSTOMER" } = {},
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "POST",
      path: `/v1/customers/${encodeURIComponent(id)}/primary-guardian/confirm`,
      schema: customerPrimaryGuardianSchema,
      signal,
    });
  }

  clearPrimaryGuardian(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/customers/${encodeURIComponent(id)}/primary-guardian`,
      schema: deletedSchema.or(
        // A remoção é idempotente: `deleted: false` quando não havia relação.
        customerPrimaryGuardianSchema,
      ),
      signal,
    });
  }

  createNote(id: string, input: CreateCustomerNoteInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: `/v1/customers/${encodeURIComponent(id)}/notes`,
      schema: customerNoteSchema,
      signal,
    });
  }

  setNoteAuthorization(
    id: string,
    noteId: string,
    aiAuthorized: boolean,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: { aiAuthorized },
      method: "PATCH",
      path: `/v1/customers/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`,
      schema: customerNoteSchema,
      signal,
    });
  }

  deleteNote(id: string, noteId: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/customers/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`,
      schema: deletedSchema,
      signal,
    });
  }

  createTag(id: string, input: CreateCustomerTagInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: `/v1/customers/${encodeURIComponent(id)}/tags`,
      schema: customerTagSchema,
      signal,
    });
  }

  setTagAuthorization(
    id: string,
    tagId: string,
    aiAuthorized: boolean,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: { aiAuthorized },
      method: "PATCH",
      path: `/v1/customers/${encodeURIComponent(id)}/tags/${encodeURIComponent(tagId)}`,
      schema: customerTagSchema,
      signal,
    });
  }

  deleteTag(id: string, tagId: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/customers/${encodeURIComponent(id)}/tags/${encodeURIComponent(tagId)}`,
      schema: deletedSchema,
      signal,
    });
  }
}
