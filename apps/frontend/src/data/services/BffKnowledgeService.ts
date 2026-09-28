import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type KnowledgeChunk,
  type KnowledgeDocument,
  type KnowledgeDocumentStatus,
  type KnowledgeDocumentType,
} from "../mappers/publicApiSchemas";

export interface ListKnowledgeDocumentsQuery {
  type?: KnowledgeDocumentType;
  serviceId?: string;
  status?: KnowledgeDocumentStatus;
}

export interface CreateKnowledgeDocumentInput {
  type: KnowledgeDocumentType;
  serviceId?: string;
  title: string;
  source?: string;
  chunks: KnowledgeChunk[];
}

export interface EditKnowledgeDocumentInput {
  title?: string;
  serviceId?: string | null;
  chunks: KnowledgeChunk[];
}

/**
 * Conhecimento do negocio editavel pelo modulo (Goal012): FAQ geral e por
 * servico, orientacoes, cuidados, procedimentos e politicas textuais, alem do
 * campo livre "Outras informacoes importantes". Sem tela: a experiencia e do
 * Goal015.
 */
export class BffKnowledgeService {
  constructor(private readonly http: BffHttpClient) {}

  list(query: ListKnowledgeDocumentsQuery = {}, signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/knowledge/documents",
      query: {
        type: query.type,
        serviceId: query.serviceId,
        status: query.status,
      },
      schema: routeSchema<KnowledgeDocument[]>(
        "GET",
        "/v1/knowledge/documents",
      ),
      signal,
    });
  }

  create(input: CreateKnowledgeDocumentInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/knowledge/documents",
      schema: routeSchema<KnowledgeDocument>("POST", "/v1/knowledge/documents"),
      signal,
    });
  }

  get(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/knowledge/documents/${encodeURIComponent(id)}`,
      schema: routeSchema<KnowledgeDocument>(
        "GET",
        "/v1/knowledge/documents/:id",
      ),
      signal,
    });
  }

  /** Cada edicao gera versao nova e inativa a anterior; nunca apaga. */
  edit(id: string, input: EditKnowledgeDocumentInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "PUT",
      path: `/v1/knowledge/documents/${encodeURIComponent(id)}`,
      schema: routeSchema<KnowledgeDocument>(
        "PUT",
        "/v1/knowledge/documents/:id",
      ),
      signal,
    });
  }

  /** Desativa (`INACTIVE`), nunca remove a linha. */
  deactivate(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/knowledge/documents/${encodeURIComponent(id)}`,
      schema: routeSchema<KnowledgeDocument>(
        "DELETE",
        "/v1/knowledge/documents/:id",
      ),
      signal,
    });
  }

  /** Documento `BUSINESS_INFO` unico por negocio, source fixa. */
  saveOtherInfo(content: string, signal?: AbortSignal) {
    return this.http.request({
      body: { content },
      method: "PUT",
      path: "/v1/knowledge/other-info",
      schema: routeSchema<KnowledgeDocument>("PUT", "/v1/knowledge/other-info"),
      signal,
    });
  }

  /** Leitura do campo livre "Outras informacoes importantes" (Goal067). */
  getOtherInfo(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/knowledge/other-info",
      schema: routeSchema<{ content: string }>(
        "GET",
        "/v1/knowledge/other-info",
      ),
      signal,
    });
  }
}
