import { z } from "zod";

import { type BffHttpClient } from "../http/BffHttpClient";
import {
  conversationSchema,
  conversationSuggestionsSchema,
  messageSchema,
  type SessionCategory,
} from "../mappers/publicApiSchemas";

export interface ConversationQuery {
  category?: SessionCategory;
  handling?: "AI" | "HUMAN";
  ignored?: boolean;
  limit?: number;
  search?: string;
  status?: "ACTIVE" | "CLOSED" | "HUMAN_HANDOFF";
}

export class BffConversationService {
  constructor(private readonly http: BffHttpClient) {}

  list(query: ConversationQuery = {}, signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/conversations",
      query: {
        category: query.category,
        handling: query.handling,
        ignored: query.ignored === undefined ? undefined : String(query.ignored),
        limit: query.limit,
        search: query.search,
        status: query.status,
      },
      schema: z.array(conversationSchema),
      signal,
    });
  }

  get(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/conversations/${encodeURIComponent(id)}`,
      schema: conversationSchema,
      signal,
    });
  }

  listMessages(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/conversations/${encodeURIComponent(id)}/messages`,
      schema: z.array(messageSchema),
      signal,
    });
  }

  /**
   * Bytes de mídia de um attachment, sob demanda (Goal013). Sem tela: o
   * player e a exibição são do Goal017 — este método só busca o corpo bruto
   * via o proxy de mídia do BFF.
   */
  getMedia(conversationId: string, messageId: string, signal?: AbortSignal) {
    return this.http.requestBinary({
      path: `/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/media`,
      signal,
    });
  }

  sendMessage(id: string, text: string, signal?: AbortSignal) {
    return this.http.request({
      body: { text },
      method: "POST",
      path: `/v1/conversations/${encodeURIComponent(id)}/messages`,
      schema: messageSchema,
      signal,
    });
  }

  /**
   * Override manual da categoria. `null` limpa o override e devolve a conversa
   * a classificacao automatica.
   */
  setCategory(id: string, category: SessionCategory | null, signal?: AbortSignal) {
    return this.http.request({
      body: { category },
      method: "PUT",
      path: `/v1/conversations/${encodeURIComponent(id)}/category`,
      schema: conversationSchema,
      signal,
    });
  }

  setIgnored(id: string, ignored: boolean, signal?: AbortSignal) {
    return this.http.request({
      body: { ignored },
      method: "PUT",
      path: `/v1/conversations/${encodeURIComponent(id)}/ignore`,
      schema: conversationSchema,
      signal,
    });
  }

  takeover(id: string, signal?: AbortSignal) {
    return this.mutateState(id, "takeover", signal);
  }

  release(id: string, signal?: AbortSignal) {
    return this.mutateState(id, "release", signal);
  }

  resolve(id: string, signal?: AbortSignal) {
    return this.mutateState(id, "resolve", signal);
  }

  /**
   * Até três sugestões de resposta para a profissional editar e, se quiser,
   * enviar por `sendMessage` — esta rota nunca envia nada sozinha.
   */
  generateSuggestions(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "POST",
      path: `/v1/conversations/${encodeURIComponent(id)}/suggestions`,
      schema: conversationSuggestionsSchema,
      signal,
    });
  }

  private mutateState(
    id: string,
    action: "release" | "resolve" | "takeover",
    signal?: AbortSignal,
  ) {
    return this.http.request({
      method: "POST",
      path: `/v1/conversations/${encodeURIComponent(id)}/${action}`,
      schema: conversationSchema,
      signal,
    });
  }
}
