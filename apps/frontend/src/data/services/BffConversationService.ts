import { type z } from "zod";

import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type Conversation,
  type ConversationSuggestions,
  type IgnoredContact,
  type Message,
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
        ignored:
          query.ignored === undefined ? undefined : String(query.ignored),
        limit: query.limit,
        search: query.search,
        status: query.status,
      },
      schema: routeSchema<Conversation[]>("GET", "/v1/conversations"),
      signal,
    });
  }

  get(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/conversations/${encodeURIComponent(id)}`,
      schema: routeSchema<Conversation>("GET", "/v1/conversations/:id"),
      signal,
    });
  }

  listMessages(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/conversations/${encodeURIComponent(id)}/messages`,
      schema: routeSchema<Message[]>("GET", "/v1/conversations/:id/messages"),
      signal,
    });
  }

  /**
   * Bytes de mídia de um attachment, sob demanda (Goal013). Serve o player de
   * áudio e o visualizador do chat (Goal017), que pedem os bytes só quando a
   * profissional pede — aqui só se busca o corpo bruto pelo proxy do BFF.
   */
  getMedia(conversationId: string, messageId: string, signal?: AbortSignal) {
    return this.http.requestBinary({
      path: `/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/media`,
      signal,
    });
  }

  /**
   * `status` acompanha a mensagem porque `201` é a saída gravada e despachada
   * ao transporte e `202` é a tentativa gravada sem confirmação de envio — o
   * mesmo sucesso HTTP em dois sentidos distintos, que só o status bruto
   * diferencia. Nenhum dos dois afirma entrega: isso é `deliveryState`.
   */
  async sendMessage(
    id: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<{ message: Message; status: number }> {
    const { data, status } = await this.http.requestWithStatus({
      body: { text },
      method: "POST",
      path: `/v1/conversations/${encodeURIComponent(id)}/messages`,
      schema: routeSchema<Message>("POST", "/v1/conversations/:id/messages"),
      signal,
    });
    return { message: data, status };
  }

  /**
   * Override manual da categoria. `null` limpa o override e devolve a conversa
   * a classificacao automatica.
   */
  setCategory(
    id: string,
    category: SessionCategory | null,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: { category },
      method: "PUT",
      path: `/v1/conversations/${encodeURIComponent(id)}/category`,
      schema: routeSchema<Conversation>(
        "PUT",
        "/v1/conversations/:id/category",
      ),
      signal,
    });
  }

  setIgnored(id: string, ignored: boolean, signal?: AbortSignal) {
    return this.http.request({
      body: { ignored },
      method: "PUT",
      path: `/v1/conversations/${encodeURIComponent(id)}/ignore`,
      schema: routeSchema<Conversation>("PUT", "/v1/conversations/:id/ignore"),
      signal,
    });
  }

  /**
   * Contato ignorado por telefone informado manualmente, sem conversa ainda
   * (Goal019/WU-07). Cria o contato quando ele não existe.
   */
  ignoreByPhone(phone: string, ignored: boolean, signal?: AbortSignal) {
    return this.http.request({
      body: { phone, ignored },
      method: "PUT",
      path: "/v1/conversations/ignored-contacts",
      schema: routeSchema<IgnoredContact>(
        "PUT",
        "/v1/conversations/ignored-contacts",
      ),
      signal,
    });
  }

  takeover(id: string, signal?: AbortSignal) {
    return this.mutateState(
      id,
      "takeover",
      routeSchema<Conversation>("POST", "/v1/conversations/:id/takeover"),
      signal,
    );
  }

  release(id: string, signal?: AbortSignal) {
    return this.mutateState(
      id,
      "release",
      routeSchema<Conversation>("POST", "/v1/conversations/:id/release"),
      signal,
    );
  }

  resolve(id: string, signal?: AbortSignal) {
    return this.mutateState(
      id,
      "resolve",
      routeSchema<Conversation>("POST", "/v1/conversations/:id/resolve"),
      signal,
    );
  }

  /**
   * Até três sugestões de resposta para a profissional editar e, se quiser,
   * enviar por `sendMessage` — esta rota nunca envia nada sozinha.
   */
  generateSuggestions(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "POST",
      path: `/v1/conversations/${encodeURIComponent(id)}/suggestions`,
      schema: routeSchema<ConversationSuggestions>(
        "POST",
        "/v1/conversations/:id/suggestions",
      ),
      signal,
    });
  }

  private mutateState(
    id: string,
    action: "release" | "resolve" | "takeover",
    schema: z.ZodType<Conversation>,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      method: "POST",
      path: `/v1/conversations/${encodeURIComponent(id)}/${action}`,
      schema,
      signal,
    });
  }
}
