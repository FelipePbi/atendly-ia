import { z } from "zod";

import { env } from "../../config/env.js";
import {
  InternalHttpClient,
  type InternalRequestContext,
} from "../internal-http-client.js";

// Goal013/WU-06: tipo de conteudo e attachment de midia. Opcionais de
// proposito — mensagem de texto e o estoque anterior a este Goal nao trazem
// os dois campos, e o consumidor trata a ausencia como TEXT sem attachment.
const messageKindSchema = z.enum([
  "TEXT",
  "AUDIO",
  "IMAGE",
  "DOCUMENT",
  "VIDEO",
  "STICKER",
  "UNKNOWN",
]);

const messageAttachmentSchema = z.object({
  kind: z.enum(["AUDIO", "IMAGE", "DOCUMENT", "VIDEO", "STICKER"]),
  mimetype: z.string().nullable(),
  fileName: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  tooLarge: z.boolean(),
  transcript: z.string().nullable(),
  transcriptStatus: z.enum(["PENDING", "DONE", "FAILED", "SKIPPED"]).nullable(),
  transcriptError: z.string().nullable(),
  // A IA decide se os bytes ainda podem ser buscados (mediaUrl vigente ou
  // download sob demanda possivel); o DTO nunca expoe mediaUrl bruta.
  mediaAvailable: z.boolean(),
});

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
  kind: messageKindSchema.nullish().optional(),
  attachment: messageAttachmentSchema.nullish().optional(),
});

const sessionCategorySchema = z.enum([
  "COMMERCIAL",
  "UNCLASSIFIED",
  "PERSONAL",
]);

// Goal070: eventos de agenda que a IA fez na conversa, derivados só do
// ledger `AiToolCall` de `create_appointment` (D-073). Espelha
// `ConversationEvent` da rota interna equivalente.
const conversationEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("HOLD_PLACED"),
    id: z.string(),
    occurredAt: z.string(),
    date: z.string(),
    startTime: z.string(),
    holdExpiresAt: z.string(),
  }),
  z.object({
    type: z.literal("HOLD_EXPIRED"),
    id: z.string(),
    occurredAt: z.string(),
    date: z.string(),
    startTime: z.string(),
  }),
  z.object({
    type: z.literal("APPOINTMENT_CREATED"),
    id: z.string(),
    occurredAt: z.string(),
    appointmentId: z.string(),
    date: z.string(),
    startTime: z.string(),
  }),
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
  // Goal017: vinculo do contato com o cliente do Scheduling. Nulo quando o
  // contato ainda nao foi vinculado; ausente quando o estoque anterior a
  // este Goal ainda nao repassa o campo.
  customerId: z.string().nullish().optional(),
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
  // Goal023: ate quando o conteudo desta conversa ja foi purgado. Aditivo,
  // como os anteriores — nulo quando nada expirou, ausente quando a IA ainda
  // nao repassa o campo. Nenhum campo acima muda de forma, tipo ou
  // significado por causa dele.
  contentExpiredThrough: z.string().nullish().optional(),
});

// Contagens de uma passada de purga na IA (Goal023/WU-02). Linhas, por tabela:
// nada aqui descreve o que foi apagado, e nada disto chega ao cliente final.
const contentPurgeResultSchema = z.object({
  messages: z.number().int().nonnegative(),
  messageAttachments: z.number().int().nonnegative(),
  aiRuns: z.number().int().nonnegative(),
  aiToolCalls: z.number().int().nonnegative(),
  conversationsMarked: z.number().int().nonnegative(),
  // Inbox duravel da IA (Goal023/§6). O prazo dele e tecnico e mora na IA: o
  // BFF nao o envia, nao o conhece e so registra o que voltou.
  processedEvents: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type ContentPurgeResult = z.infer<typeof contentPurgeResultSchema>;

// Contagens de uma passada de purga do negocio inteiro (Goal025/WU-05). As
// tabelas sao as da IA e a lista e dela: o BFF registra o que voltou e nao
// replica aqui um schema que nao e seu — um modelo novo na IA nao pode exigir
// deploy do BFF para continuar sendo purgado.
const tenantPurgeResultSchema = z.object({
  deleted: z.record(z.string(), z.number().int().nonnegative()),
  totalDeleted: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type TenantPurgeResult = z.infer<typeof tenantPurgeResultSchema>;

// Central de notificacoes (Goal022): uma entrada por conversa que espera
// atendimento humano. `contactName` e o nome do contato quando a conversa tem
// um e `null` quando nao tem: telefone nao atravessa esta fronteira em forma
// nenhuma, porque o valor termina gravado em `TenantNotification.payload`.
const conversationAwaitingHumanSchema = z.object({
  conversationId: z.string(),
  contactName: z.string().nullable(),
  reason: z.string(),
  openedAt: z.string(),
});

const envelope = <T extends z.ZodType>(schema: T) =>
  z.object({ data: schema, requestId: z.string() });

// Goal019/WU-07: contato ignorado por telefone, sem conversa aberta ainda —
// a etapa opcional entre conectar e testar tambem aceita numero informado
// manualmente, criando o contato quando ele nao existe.
const ignoredContactSchema = z.object({
  contactId: z.string(),
  externalContactId: z.string(),
  ignored: z.boolean(),
  ignoredAt: z.string().nullable(),
});

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

// Goal014/WU-02: leitura da configuração efetiva do tenant na IA, para o read
// model de status. `null` é resposta válida — tenant ainda não projetado —,
// distinta de indisponibilidade, que o chamador trata pelo próprio erro da
// requisição (`UPSTREAM_ERROR`), nunca fabricado aqui.
const aiTenantConfigStateSchema = z
  .object({
    enabled: z.boolean(),
    tone: z.string(),
    promptVersion: z.string(),
  })
  .nullable();

// Goal019/WU-05: execucao do teste real. Espelha o DTO de
// `activation-test/routes.ts` na IA — os oito passos e os seis marcos do
// vault, cada marco com a fonte do fato que o sustenta.
const activationTestStepSchema = z.enum([
  "TEST_NOTICE",
  "CLIENT_ASKS_PRICE",
  "AI_IDENTIFIES_SERVICE",
  "AI_ANSWERS_PRICE",
  "CLIENT_ASKS_SLOT",
  "AI_CHECKS_AVAILABILITY",
  "CLIENT_ACCEPTS_SLOT",
  "AI_CONFIRMS_APPOINTMENT",
]);

const activationTestRunSchema = z.object({
  id: z.string(),
  state: z.enum([
    "RUNNING",
    "PAUSED_BY_HUMAN",
    "SUCCEEDED",
    "FAILED",
    "DISCARDED",
  ]),
  terminal: z.boolean(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  pausedAt: z.string().nullable(),
  currentStep: activationTestStepSchema.nullable(),
  completedStep: activationTestStepSchema.nullable(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().nonnegative(),
  failedStep: activationTestStepSchema.nullable(),
  failedStepLabel: z.string().nullable(),
  failureCode: z.string().nullable(),
  appointmentId: z.string().nullable(),
  // Vínculo de WhatsApp contra o qual o teste rodou, e se ele ainda é o do
  // negócio. Trocar ou revincular o número faz o teste deixar de valer — o
  // vault exige teste novo —, e a IA não pode continuar ativa por uma prova
  // que já não existe. Derivado pela IA, nunca por um booleano local.
  channelId: z.string(),
  supersededByChannelChange: z.boolean(),
  // Estado da limpeza e o que sobrou dela. Declarados aqui porque §6 do
  // Goal019 exige que a tela diga o que ficou: sem estes campos o consumidor
  // so conseguiria afirmar limpeza completa, que e a falha de aceite nomeada.
  // `CLEAN` **so** existe com residuo vazio — quem produz o par e a IA.
  cleanupState: z.enum(["PENDING", "CLEAN", "RESIDUAL"]),
  cleanupAt: z.string().nullable(),
  cleanupResidue: z.array(
    z.object({
      target: z.enum([
        "MESSAGE",
        "CONVERSATION",
        "CONTACT",
        "APPOINTMENT",
        "CUSTOMER",
      ]),
      id: z.string(),
      reason: z.enum([
        "OPERATION_UNAVAILABLE",
        "WOULD_TOUCH_OTHER_ROWS",
        "REMOVAL_FAILED",
        "STILL_VISIBLE",
      ]),
      /** Alvo em linguagem do negocio; a tela nao traduz enum por conta propria. */
      label: z.string(),
      explanation: z.string(),
    }),
  ),
  milestones: z.array(
    z.object({
      milestone: z.enum([
        "MESSAGE_SENT",
        "SERVICE_IDENTIFIED",
        "PRICE_INFORMED",
        "AVAILABILITY_CHECKED",
        "SLOT_SELECTED",
        "APPOINTMENT_CONFIRMED",
      ]),
      reached: z.boolean(),
      reachedAt: z.string().nullable(),
      sourceKind: z
        .enum(["MESSAGE", "SERVICE", "AVAILABILITY", "APPOINTMENT"])
        .nullable(),
      sourceId: z.string().nullable(),
    }),
  ),
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

  /**
   * Eventos de agenda que a IA fez nesta conversa (Goal070). Proxy fino,
   * igual a `listMessages`: repassa o array que a rota interna devolve.
   */
  async listConversationEvents(context: InternalRequestContext, id: string) {
    return (
      await this.http.request({
        method: "GET",
        path: `/internal/conversations/${encodeURIComponent(id)}/events`,
        context,
        schema: envelope(z.array(conversationEventSchema)),
      })
    ).data;
  }

  /**
   * Bytes de mídia de um attachment, sob demanda (Goal013/WU-06). Repassa
   * `content-type` e nome exatamente como a rota interna devolve; recusas
   * próprias da IA (sem attachment, `tooLarge`, origem indisponível) chegam
   * como `UPSTREAM_ERROR` com `upstreamCode`, nunca `500` genérico.
   */
  async getMedia(
    context: InternalRequestContext,
    conversationId: string,
    messageId: string,
  ) {
    return this.http.requestBinary({
      path: `/internal/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/media`,
      context,
    });
  }

  /**
   * A credencial da instância não viaja mais aqui: a IA a resolve pelo vínculo
   * interno projetado no provisionamento.
   *
   * O status acompanha a mensagem: a IA responde `201` quando o transporte
   * aceitou a saída e `202` quando a tentativa ficou gravada sem confirmação
   * de envio (`internal/routes.ts`). São dois sucessos com sentidos distintos,
   * e só o status bruto os separa — o envelope é igual nos dois.
   */
  async sendMessage(
    context: InternalRequestContext,
    id: string,
    input: { text: string },
  ) {
    const { data, status } = await this.http.requestWithStatus({
      method: "POST",
      path: `/internal/conversations/${encodeURIComponent(id)}/messages`,
      context,
      body: input,
      schema: envelope(messageSchema),
    });
    return { message: data.data, status };
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

  /**
   * Contato ignorado por telefone, sem conversa aberta ainda (Goal019/WU-07):
   * a etapa opcional do onboarding entre conectar e testar também aceita
   * número informado manualmente, criando o contato quando ele não existe.
   */
  async ignoreContactByPhone(
    context: InternalRequestContext,
    input: { phone: string; ignored: boolean },
  ) {
    return (
      await this.http.request({
        method: "PUT",
        path: "/internal/contacts/ignore",
        context,
        body: input,
        schema: envelope(ignoredContactSchema),
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

  async getAiTenantConfig(context: InternalRequestContext) {
    return (
      await this.http.request({
        method: "GET",
        path: "/internal/ai-tenant-config",
        context,
        schema: envelope(aiTenantConfigStateSchema),
      })
    ).data;
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
   * Derruba o canal do negocio na IA (Goal025/WU-02).
   *
   * Usado pelo inicio da exclusao de conta. Sem canal ativo a IA responde
   * `supersededByChannelChange: true` para a execucao que autorizou a
   * ativacao, e `reconcileAiActivation` deixa de ter como religar a IA — a
   * nao-reativacao vira propriedade verificavel, nao promessa.
   *
   * Mesma credencial de `provisionEvolutionChannel` (`provisioning`): desligar
   * o vinculo e a outra ponta da autoridade que o liga.
   */
  async deactivateEvolutionChannel(
    context: InternalRequestContext,
  ): Promise<number> {
    const result = await this.http.request({
      method: "DELETE",
      path: "/internal/channel-connections/evolution",
      context,
      use: "provisioning",
      schema: z.object({ ok: z.literal(true), deactivated: z.number() }),
    });
    return result.deactivated;
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

  /** Leitura do campo livre "Outras informações importantes" (Goal067/§1).
   * Vazio quando o tenant nunca salvou nada. */
  async getOtherInfo(context: InternalRequestContext) {
    return (
      await this.http.request({
        method: "GET",
        path: "/internal/knowledge/other-info",
        context,
        schema: envelope(z.object({ content: z.string() })),
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

  /**
   * Quem esta aguardando humano, por negocio (Goal022).
   *
   * Uma entrada por **conversa**, mesmo quando a IA gravou mais de uma linha
   * `Handoff` OPEN para ela, e sem o takeover do dono: as duas regras moram na
   * leitura da IA, nao aqui. A central so materializa o que veio.
   */
  async listConversationsAwaitingHuman(
    context: InternalRequestContext,
    query: { limit?: number } = {},
  ) {
    return (
      await this.http.request({
        method: "GET",
        path: "/internal/handoffs/awaiting-human",
        context,
        query: { limit: query.limit },
        schema: envelope(z.array(conversationAwaitingHumanSchema)),
      })
    ).data;
  }

  /**
   * Execucao corrente do teste real (Goal019/WU-05). `null` e "nunca testou",
   * nunca fabricado a partir de outro estado.
   */
  async getActivationTest(context: InternalRequestContext) {
    return (
      await this.http.request({
        method: "GET",
        path: "/internal/activation-test",
        context,
        schema: envelope(activationTestRunSchema.nullable()),
      })
    ).data;
  }

  /**
   * Inicia o teste real. A IA responde `202`: a execucao ja esta persistida e
   * roda no servidor a partir daqui, sem depender desta requisicao terminar.
   */
  async startActivationTest(
    context: InternalRequestContext,
    input: { tenantPhone: string },
  ) {
    const { data, status } = await this.http.requestWithStatus({
      method: "POST",
      path: "/internal/activation-test",
      context,
      body: input,
      schema: envelope(activationTestRunSchema),
    });
    return { run: data.data, status };
  }

  /** Reinicia depois de interferencia humana: a execucao pausada e descartada. */
  async restartActivationTest(
    context: InternalRequestContext,
    input: { tenantPhone: string },
  ) {
    const { data, status } = await this.http.requestWithStatus({
      method: "POST",
      path: "/internal/activation-test/restart",
      context,
      body: input,
      schema: envelope(activationTestRunSchema),
    });
    return { run: data.data, status };
  }

  /**
   * Purga de conteudo de conversa na IA (Goal023/WU-02).
   *
   * Os cutoffs vao **calculados** daqui: o prazo e do negocio e vive no BFF, e
   * a IA nao deriva janela por conta propria. O teto limita a passada; `hasMore`
   * diz se sobrou trabalho para a proxima. Chamador: a varredura, nunca uma
   * rota publica.
   */
  async purgeConversationContent(
    context: InternalRequestContext,
    input: { commercialCutoff: Date; personalCutoff: Date; maxRows: number },
  ): Promise<ContentPurgeResult> {
    return (
      await this.http.request({
        method: "POST",
        path: "/internal/retention/conversation-content",
        context,
        body: {
          commercialCutoff: input.commercialCutoff.toISOString(),
          personalCutoff: input.personalCutoff.toISOString(),
          maxRows: input.maxRows,
        },
        schema: envelope(contentPurgeResultSchema),
      })
    ).data;
  }

  /**
   * Purga do negocio inteiro na IA (Goal025/WU-07 chamando a rota do WU-05).
   *
   * Sem cutoff nenhum, ao contrario de `purgeConversationContent`: aqui nao ha
   * janela de prazo, o negocio inteiro vai embora. O tenant viaja so no
   * contexto interno ja autenticado — nao existe campo de corpo para apagar
   * outro negocio. O teto limita a passada e `hasMore` diz se sobrou trabalho;
   * rodar de novo sobre negocio ja purgado nao e erro. Chamador: a purga de
   * conta vencida, nunca uma rota publica.
   */
  async purgeTenant(
    context: InternalRequestContext,
    input: { maxRows: number },
  ): Promise<TenantPurgeResult> {
    return (
      await this.http.request({
        method: "POST",
        path: "/internal/retention/tenant",
        context,
        body: { maxRows: input.maxRows },
        schema: envelope(tenantPurgeResultSchema),
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
