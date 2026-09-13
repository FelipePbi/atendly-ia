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

// Goal012/WU-01: tipos do documento de conhecimento (`KnowledgeDocument`).
const knowledgeDocumentTypeSchema = z.enum([
  "FAQ",
  "GUIDANCE",
  "CARE",
  "PROCEDURE",
  "BUSINESS_INFO",
  "TEXT_POLICY",
]);
type KnowledgeDocumentType = z.infer<typeof knowledgeDocumentTypeSchema>;

const knowledgeDocumentSchema = z.object({
  id: z.string(),
  type: knowledgeDocumentTypeSchema,
  serviceId: z.string().nullable(),
  title: z.string(),
  source: z.string(),
  version: z.string(),
  checksum: z.string(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

interface KnowledgeChunkInput {
  content: string;
  metadata?: Record<string, unknown>;
}

// Goal012/WU-01: `CustomerMemory`, memoria da pessoa por (tenantId, customerId).
const customerMemoryOriginSchema = z.enum([
  "CUSTOMER_STATED",
  "AI_INFERRED",
  "PROFESSIONAL",
]);

const customerMemorySchema = z.object({
  id: z.string(),
  customerId: z.string(),
  kind: z.string(),
  value: z.string(),
  origin: customerMemoryOriginSchema,
  aiAllowed: z.boolean(),
  confidence: z.number().nullable(),
  sourceConversationId: z.string().nullable(),
  sourceMessageIds: z.array(z.string()),
  observedAt: z.string(),
  lastReinforcedAt: z.string().nullable(),
  supersededById: z.string().nullable(),
  removedAt: z.string().nullable(),
  removedBy: z.string().nullable(),
});

// Resumo do cliente (Goal012): nunca persistido como verdade, so o `AiRun`
// de auditoria nasce da geracao. `aiRunId` nao e opcional: resumo sem `AiRun`
// nao existe — a IA recusa antes de chamar o modelo.
const customerSummarySchema = z.object({
  customerId: z.string(),
  summary: z.string(),
  promptVersion: z.string(),
  aiRunId: z.string(),
  sources: z.object({
    memory: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
    tags: z.number().int().nonnegative(),
    upcomingAppointments: z.number().int().nonnegative(),
  }),
});

// Sugestoes de resposta no atendimento humano (Goal012): sem efeito, sem
// envio; so o que volta para a profissional editar e, se quiser, enviar pelo
// caminho humano ja existente.
const conversationSuggestionsSchema = z.object({
  conversationId: z.string(),
  suggestions: z.array(z.string()),
  // Auditoria e versao do prompt sempre existem: a geracao so devolve
  // sugestao depois de criar o `AiRun` com `kind = SUGGESTION`.
  aiRunId: z.string(),
  promptVersion: z.string(),
});

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

  /**
   * Conhecimento do negocio, editavel pelo modulo (Goal012/WU-01).
   *
   * Cada salvamento cria versao nova e inativa a anterior no lado da IA;
   * aqui so repassamos o contrato. `KNOWLEDGE_INDEX_UNAVAILABLE` chega como
   * qualquer outro erro proprio da IA, pelo envelope de `UPSTREAM_ERROR`.
   */
  async listKnowledgeDocuments(
    context: InternalRequestContext,
    query: { type?: string; serviceId?: string; status?: string },
  ) {
    return (
      await this.http.request({
        method: "GET",
        path: "/internal/knowledge/documents",
        context,
        query,
        schema: envelope(z.array(knowledgeDocumentSchema)),
      })
    ).data;
  }

  async createKnowledgeDocument(
    context: InternalRequestContext,
    input: {
      type: KnowledgeDocumentType;
      serviceId?: string;
      title: string;
      source?: string;
      chunks: KnowledgeChunkInput[];
    },
  ) {
    return (
      await this.http.request({
        method: "POST",
        path: "/internal/knowledge/documents",
        context,
        body: input,
        schema: envelope(knowledgeDocumentSchema),
      })
    ).data;
  }

  async getKnowledgeDocument(context: InternalRequestContext, id: string) {
    return (
      await this.http.request({
        method: "GET",
        path: `/internal/knowledge/documents/${encodeURIComponent(id)}`,
        context,
        schema: envelope(knowledgeDocumentSchema),
      })
    ).data;
  }

  async editKnowledgeDocument(
    context: InternalRequestContext,
    id: string,
    input: {
      title?: string;
      serviceId?: string | null;
      chunks: KnowledgeChunkInput[];
    },
  ) {
    return (
      await this.http.request({
        method: "PUT",
        path: `/internal/knowledge/documents/${encodeURIComponent(id)}`,
        context,
        body: input,
        schema: envelope(knowledgeDocumentSchema),
      })
    ).data;
  }

  async deactivateKnowledgeDocument(
    context: InternalRequestContext,
    id: string,
  ) {
    return (
      await this.http.request({
        method: "DELETE",
        path: `/internal/knowledge/documents/${encodeURIComponent(id)}`,
        context,
        schema: envelope(knowledgeDocumentSchema),
      })
    ).data;
  }

  /** Campo livre "Outras informações importantes": documento BUSINESS_INFO
   * unico por negocio, source fixa, so por esta rota. */
  async saveOtherInfo(
    context: InternalRequestContext,
    input: { content: string },
  ) {
    return (
      await this.http.request({
        method: "PUT",
        path: "/internal/knowledge/other-info",
        context,
        body: input,
        schema: envelope(knowledgeDocumentSchema),
      })
    ).data;
  }

  /**
   * Memoria do cliente (Goal012/WU-01): proveniencia, permissao explicita e
   * relevancia decrescente. A colecao e a criacao ficam sob `/memory`; o item
   * altera permissao e remove, inclusive memoria inferida.
   */
  async listCustomerMemory(context: InternalRequestContext, customerId: string) {
    return (
      await this.http.request({
        method: "GET",
        path: `/internal/customers/${encodeURIComponent(customerId)}/memory`,
        context,
        schema: envelope(z.array(customerMemorySchema)),
      })
    ).data;
  }

  async createCustomerMemory(
    context: InternalRequestContext,
    customerId: string,
    input: { kind: string; value: string; aiAllowed?: boolean },
  ) {
    return (
      await this.http.request({
        method: "POST",
        path: `/internal/customers/${encodeURIComponent(customerId)}/memory`,
        context,
        body: input,
        schema: envelope(customerMemorySchema),
      })
    ).data;
  }

  async setCustomerMemoryPermission(
    context: InternalRequestContext,
    customerId: string,
    memoryId: string,
    input: { aiAllowed: boolean },
  ) {
    return (
      await this.http.request({
        method: "PATCH",
        path: `/internal/customers/${encodeURIComponent(customerId)}/memory/${encodeURIComponent(memoryId)}`,
        context,
        body: input,
        schema: envelope(customerMemorySchema),
      })
    ).data;
  }

  async removeCustomerMemory(
    context: InternalRequestContext,
    customerId: string,
    memoryId: string,
  ) {
    return (
      await this.http.request({
        method: "DELETE",
        path: `/internal/customers/${encodeURIComponent(customerId)}/memory/${encodeURIComponent(memoryId)}`,
        context,
        schema: envelope(customerMemorySchema),
      })
    ).data;
  }

  /**
   * Resumo do cliente, gerado pelo modelo sob demanda, so a partir do
   * material autorizado (Goal012/WU-01). Nao persiste verdade nenhuma.
   */
  async generateCustomerSummary(
    context: InternalRequestContext,
    customerId: string,
  ) {
    return (
      await this.http.request({
        method: "POST",
        path: `/internal/customers/${encodeURIComponent(customerId)}/summary`,
        context,
        schema: envelope(customerSummarySchema),
      })
    ).data;
  }

  /**
   * Ate tres sugestoes de resposta no atendimento humano, sem autoenvio
   * (Goal012/WU-04). Enviar continua sendo `sendMessage`, pelo caminho
   * humano ja existente.
   */
  async generateSuggestions(
    context: InternalRequestContext,
    conversationId: string,
  ) {
    return (
      await this.http.request({
        method: "POST",
        path: `/internal/conversations/${encodeURIComponent(conversationId)}/suggestions`,
        context,
        schema: envelope(conversationSuggestionsSchema),
      })
    ).data;
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
