import { z } from "zod";

import { env } from "../../config/env.js";
import {
  InternalHttpClient,
  type InternalRequestContext,
} from "../internal-http-client.js";

const messageSchema = z.object({
  id: z.string(),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  source: z.enum(["CUSTOMER", "AI", "OWNER"]).nullable(),
  body: z.string(),
  createdAt: z.string(),
  // Estado de entrega da saida, por operacao. Opcional de proposito: mensagem
  // recebida nao tem entrega, e o estoque anterior ao Goal004 nao tem estado.
  // `UNKNOWN` significa que a plataforma nao pode afirmar que chegou.
  deliveryState: z
    .enum(["PENDING", "SENT", "FAILED", "UNKNOWN"])
    .nullish()
    .optional(),
  deliveryDetail: z.string().nullish().optional(),
});

const sessionCategorySchema = z.enum([
  "COMMERCIAL",
  "UNCLASSIFIED",
  "PERSONAL",
]);

const conversationSchema = z.object({
  id: z.string(),
  externalContactId: z.string(),
  customerName: z.string().nullable(),
  status: z.enum(["ACTIVE", "HUMAN_HANDOFF", "CLOSED"]),
  humanHandoff: z.boolean(),
  handoffReason: z.string().nullable(),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
  // Goal005: organizacao da inbox, estado de atendimento, sessao vigente e
  // ignore do contato. Opcionais de proposito — a resposta anterior ao Goal005
  // continua valida, e o consumidor trata a ausencia como padrao seguro.
  category: sessionCategorySchema.optional(),
  categorySource: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
  suggestedCategory: sessionCategorySchema.nullish().optional(),
  handling: z.enum(["AI", "HUMAN"]).optional(),
  ignored: z.boolean().optional(),
  ignoredAt: z.string().nullish().optional(),
  aiPaused: z.boolean().optional(),
  session: z
    .object({
      id: z.string(),
      startedAt: z.string(),
      expiresAt: z.string(),
      lastContactMessageAt: z.string().nullish().optional(),
      humanHandlingSince: z.string().nullish().optional(),
    })
    .nullish()
    .optional(),
});

const envelope = <T extends z.ZodType>(schema: T) =>
  z.object({ data: schema, requestId: z.string() });

export class AiOrchestratorClient {
  private readonly http = new InternalHttpClient(
    env.AI_ORCHESTRATOR_BASE_URL,
    "ai-orchestrator",
  );

  async listConversations(
    context: InternalRequestContext,
    query: {
      status?: string;
      category?: string;
      handling?: string;
      ignored?: string;
      search?: string;
      limit?: number;
    },
  ) {
    return (
      await this.http.request({
        method: "GET",
        path: "/internal/conversations",
        context,
        query,
        schema: envelope(z.array(conversationSchema)),
      })
    ).data;
  }

  async getConversation(context: InternalRequestContext, id: string) {
    return (
      await this.http.request({
        method: "GET",
        path: `/internal/conversations/${encodeURIComponent(id)}`,
        context,
        schema: envelope(conversationSchema),
      })
    ).data;
  }

  async listMessages(context: InternalRequestContext, id: string) {
    return (
      await this.http.request({
        method: "GET",
        path: `/internal/conversations/${encodeURIComponent(id)}/messages`,
        context,
        schema: envelope(z.array(messageSchema)),
      })
    ).data;
  }

  // A credencial da instância não viaja mais aqui: a IA a resolve pelo vínculo
  // interno projetado no provisionamento.
  async sendMessage(
    context: InternalRequestContext,
    id: string,
    input: { text: string },
  ) {
    return (
      await this.http.request({
        method: "POST",
        path: `/internal/conversations/${encodeURIComponent(id)}/messages`,
        context,
        body: input,
        schema: envelope(messageSchema),
      })
    ).data;
  }

  /**
   * Contrato por operacao (D-011): definir ou limpar o override de categoria e
   * marcar ou desmarcar contato ignorado sao decisoes distintas, cada uma com
   * sua rota, em vez de um PATCH generico de conversa.
   */
  async setCategory(
    context: InternalRequestContext,
    id: string,
    input: { category: "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL" | null },
  ) {
    return (
      await this.http.request({
        method: "PUT",
        path: `/internal/conversations/${encodeURIComponent(id)}/category`,
        context,
        body: input,
        schema: envelope(conversationSchema),
      })
    ).data;
  }

  async setIgnored(
    context: InternalRequestContext,
    id: string,
    input: { ignored: boolean },
  ) {
    return (
      await this.http.request({
        method: "PUT",
        path: `/internal/conversations/${encodeURIComponent(id)}/ignore`,
        context,
        body: input,
        schema: envelope(conversationSchema),
      })
    ).data;
  }

  async takeover(context: InternalRequestContext, id: string) {
    return this.mutateConversation(context, id, "takeover");
  }

  async release(context: InternalRequestContext, id: string) {
    return this.mutateConversation(context, id, "release");
  }

  async resolve(context: InternalRequestContext, id: string) {
    return this.mutateConversation(context, id, "resolve");
  }

  async dashboard(context: InternalRequestContext) {
    return (
      await this.http.request({
        method: "GET",
        path: "/internal/dashboard",
        context,
        schema: envelope(
          z.object({
            conversationsNeedingAttention: z.array(conversationSchema),
            conversationsNeedingAttentionCount: z.number().int().nonnegative(),
            aiAppointmentsToday: z.number().int().nonnegative(),
            automatedConversationsToday: z.number().int().nonnegative(),
          }),
        ),
      })
    ).data;
  }

  async updateTenantConfig(
    context: InternalRequestContext,
    input: unknown,
  ): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: "/internal/ai-tenant-config",
      context,
      body: input,
      use: "provisioning",
      schema: z.object({ ok: z.literal(true), config: z.unknown() }),
    });
  }

  async provisionEvolutionChannel(
    context: InternalRequestContext,
    input: {
      externalInstanceId: string;
      displayName?: string;
      instanceCredential: string;
    },
  ): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: "/internal/channel-connections/evolution",
      context,
      body: input,
      use: "provisioning",
      schema: z.object({ ok: z.literal(true), connection: z.unknown() }),
    });
  }

  private async mutateConversation(
    context: InternalRequestContext,
    id: string,
    action: "takeover" | "release" | "resolve",
  ) {
    return (
      await this.http.request({
        method: "POST",
        path: `/internal/conversations/${encodeURIComponent(id)}/${action}`,
        context,
        schema: envelope(conversationSchema),
      })
    ).data;
  }
}

export type { InternalRequestContext };
