import { type z } from "zod";

import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type Customer,
  type CustomerDetail,
  type CustomerList,
  type CustomerMemory,
  type CustomerMemoryKind,
  type CustomerNote,
  type customerPrimaryGuardianSchema,
  type CustomerSummary,
  type CustomerTag,
  type deletedIdempotentSchema,
  type deletedSchema,
} from "../mappers/publicApiSchemas";
import { notifyCustomersChanged } from "./customerChanges";

type Deleted = z.infer<typeof deletedSchema>;
type DeletedIdempotent = z.infer<typeof deletedIdempotentSchema>;
type CustomerPrimaryGuardian = z.infer<typeof customerPrimaryGuardianSchema>;

export interface CreateCustomerInput {
  name?: string | null;
  /** Opcional: cliente sem telefone existe e é criado manualmente. */
  phone?: string | null;
}

export type CustomerListStatus = "active" | "inactive";
export type CustomerListSort = "name" | "last" | "frequency";

export interface CustomerListQuery {
  limit?: number;
  cursor?: string | null;
  /** Trecho do nome ou do telefone. */
  q?: string;
  /** Abas Ativos/Inativos (2026-10-18); ausente, todos. */
  status?: CustomerListStatus;
  /** Ordem (2026-10-18); ausente, nome. */
  sort?: CustomerListSort;
}

export interface UpdateCustomerInput {
  name?: string | null;
  phone?: string | null;
  /** Desativar tira da lista principal; reativar devolve (2026-10-18). */
  active?: boolean;
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

export interface CreateCustomerMemoryInput {
  kind: CustomerMemoryKind;
  value: string;
  /** Cadastro pela profissional nasce negado, como as notas do cliente. */
  aiAllowed?: boolean;
}

/** Mutação que muda o que a lista de Clientes mostra avisa quem a mantém. */
function changed<T>(value: T): T {
  notifyCustomersChanged();
  return value;
}

export class BffCustomerService {
  constructor(private readonly http: BffHttpClient) {}

  /**
   * Sem `limit` nem `cursor`, a lista inteira (seletores de cliente). Com
   * eles, uma página: `nextCursor` continua, `total` conta o filtro inteiro e
   * `q` busca no negócio todo, não só no que já foi carregado.
   */
  list(query: CustomerListQuery = {}, signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.status) params.set("status", query.status);
    if (query.sort && query.sort !== "name") params.set("sort", query.sort);
    const search = params.toString();
    return this.http.request({
      path: search ? `/v1/customers?${search}` : "/v1/customers",
      schema: routeSchema<CustomerList>("GET", "/v1/customers"),
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
      schema: routeSchema<CustomerList>("GET", "/v1/customers"),
      signal,
    });
  }

  get(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/customers/${encodeURIComponent(id)}`,
      schema: routeSchema<CustomerDetail>("GET", "/v1/customers/:id"),
      signal,
    });
  }

  create(input: CreateCustomerInput, signal?: AbortSignal) {
    return this.http
      .request({
        body: input,
        method: "POST",
        path: "/v1/customers",
        schema: routeSchema<Customer>("POST", "/v1/customers"),
        signal,
      })
      .then(changed);
  }

  update(id: string, input: UpdateCustomerInput, signal?: AbortSignal) {
    return this.http
      .request({
        body: input,
        method: "PATCH",
        path: `/v1/customers/${encodeURIComponent(id)}`,
        schema: routeSchema<Customer>("PATCH", "/v1/customers/:id"),
        signal,
      })
      .then(changed);
  }

  setPrimaryGuardian(
    id: string,
    input: SetPrimaryGuardianInput,
    signal?: AbortSignal,
  ) {
    return this.http
      .request({
        body: input,
        method: "PUT",
        path: `/v1/customers/${encodeURIComponent(id)}/primary-guardian`,
        schema: routeSchema<CustomerPrimaryGuardian>(
          "PUT",
          "/v1/customers/:id/primary-guardian",
        ),
        signal,
      })
      .then(changed);
  }

  confirmPrimaryGuardian(
    id: string,
    input: { confirmedBy?: "PROFESSIONAL" | "CUSTOMER" } = {},
    signal?: AbortSignal,
  ) {
    return this.http
      .request({
        body: input,
        method: "POST",
        path: `/v1/customers/${encodeURIComponent(id)}/primary-guardian/confirm`,
        schema: routeSchema<CustomerPrimaryGuardian>(
          "POST",
          "/v1/customers/:id/primary-guardian/confirm",
        ),
        signal,
      })
      .then(changed);
  }

  clearPrimaryGuardian(id: string, signal?: AbortSignal) {
    return this.http
      .request({
        method: "DELETE",
        path: `/v1/customers/${encodeURIComponent(id)}/primary-guardian`,
        // A remoção é idempotente: `deleted: false` quando não havia relação.
        schema: routeSchema<DeletedIdempotent | CustomerPrimaryGuardian>(
          "DELETE",
          "/v1/customers/:id/primary-guardian",
        ),
        signal,
      })
      .then(changed);
  }

  createNote(id: string, input: CreateCustomerNoteInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: `/v1/customers/${encodeURIComponent(id)}/notes`,
      schema: routeSchema<CustomerNote>("POST", "/v1/customers/:id/notes"),
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
      schema: routeSchema<CustomerNote>(
        "PATCH",
        "/v1/customers/:id/notes/:childId",
      ),
      signal,
    });
  }

  deleteNote(id: string, noteId: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/customers/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`,
      schema: routeSchema<Deleted>(
        "DELETE",
        "/v1/customers/:id/notes/:childId",
      ),
      signal,
    });
  }

  createTag(id: string, input: CreateCustomerTagInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: `/v1/customers/${encodeURIComponent(id)}/tags`,
      schema: routeSchema<CustomerTag>("POST", "/v1/customers/:id/tags"),
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
      schema: routeSchema<CustomerTag>(
        "PATCH",
        "/v1/customers/:id/tags/:childId",
      ),
      signal,
    });
  }

  deleteTag(id: string, tagId: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/customers/${encodeURIComponent(id)}/tags/${encodeURIComponent(tagId)}`,
      schema: routeSchema<Deleted>("DELETE", "/v1/customers/:id/tags/:childId"),
      signal,
    });
  }

  /** Memoria vigente do cliente: nem removida, nem substituida. */
  listMemory(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/customers/${encodeURIComponent(id)}/memory`,
      schema: routeSchema<CustomerMemory[]>("GET", "/v1/customers/:id/memory"),
      signal,
    });
  }

  /**
   * Origem sempre `PROFESSIONAL` — a rota não aceita origem no corpo, para o
   * painel não conseguir se passar por "informado pela cliente".
   */
  createMemory(
    id: string,
    input: CreateCustomerMemoryInput,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "POST",
      path: `/v1/customers/${encodeURIComponent(id)}/memory`,
      schema: routeSchema<CustomerMemory>("POST", "/v1/customers/:id/memory"),
      signal,
    });
  }

  /** Único campo alterável no item: a permissão de uso pela IA. */
  setMemoryPermission(
    id: string,
    memoryId: string,
    aiAllowed: boolean,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: { aiAllowed },
      method: "PATCH",
      path: `/v1/customers/${encodeURIComponent(id)}/memory/${encodeURIComponent(memoryId)}`,
      schema: routeSchema<CustomerMemory>(
        "PATCH",
        "/v1/customers/:id/memory/:memoryId",
      ),
      signal,
    });
  }

  /** Remove qualquer item, inclusive memória inferida pela IA. */
  deleteMemory(id: string, memoryId: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/customers/${encodeURIComponent(id)}/memory/${encodeURIComponent(memoryId)}`,
      schema: routeSchema<CustomerMemory>(
        "DELETE",
        "/v1/customers/:id/memory/:memoryId",
      ),
      signal,
    });
  }

  /**
   * Resumo gerado sob demanda, exclusivamente a partir de material
   * autorizado. Nunca persistido como memória, nota nem cadastro.
   */
  generateSummary(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "POST",
      path: `/v1/customers/${encodeURIComponent(id)}/summary`,
      schema: routeSchema<CustomerSummary>("POST", "/v1/customers/:id/summary"),
      signal,
    });
  }
}
