import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { startOfTodayInTimeZone } from "../../lib/dates.js";
import { AppError, toErrorMessage } from "../../lib/errors.js";
import {
  authorizeInternalRequest,
  type InternalScope,
} from "../../lib/internal-credentials.js";
import { normalizePhone } from "../../lib/phone.js";
import { activationTestResidueReport } from "../activation-test/activation-test-cleanup.js";
import {
  ACTIVATION_TEST_STEP_LABELS,
  type ActivationTestMilestoneRecord,
  activationTestProgress,
  isTerminalActivationTestState,
} from "../activation-test/activation-test-run.js";
import { ActivationTestAiDriver } from "../activation-test/ActivationTestAiDriver.js";
import { TenantChannelReplySender } from "../activation-test/ActivationTestReplySender.js";
import {
  type ActivationTestChannel,
  type ActivationTestRunRecord,
  ActivationTestRunStore,
} from "../activation-test/ActivationTestRunStore.js";
import { ActivationTestService } from "../activation-test/ActivationTestService.js";
import { AssistantService } from "../assistant/assistant.service.js";
import { EvolutionProvider } from "../channel/adapters/evolution/EvolutionProvider.js";
import { ChannelConnectionService } from "../channel/ChannelConnectionService.js";
import { PlatformWhatsAppSender } from "../channel/platform/PlatformWhatsAppSender.js";
import {
  type ConversationAwaitingHuman,
  listConversationsAwaitingHuman,
} from "../handoff/HandoffService.js";
import {
  type InboxPort,
  inboxRetryPolicyFromEnv,
  InboxStore,
} from "../inbox/InboxStore.js";
import { OpenAIEmbeddingProvider } from "../knowledge/embedding-provider.js";
import { PgVectorKnowledgeChunkIndexer } from "../knowledge/knowledge-chunk-indexer.js";
import {
  type KnowledgeDocumentRecord,
  KnowledgeDocumentService,
} from "../knowledge/knowledge-document-service.js";
import { KNOWLEDGE_DOCUMENT_TYPES } from "../knowledge/knowledge-vector-store.js";
import { PGVectorKnowledgeStore } from "../knowledge/pgvector-knowledge-store.js";
import type {
  MessageAttachmentKindValue,
  MessageKindValue,
} from "../media/media-metadata.js";
import type { TranscriptStatusValue } from "../media/message-attachment-store.js";
import { MessageMediaService } from "../media/message-media-service.js";
import {
  CUSTOMER_MEMORY_KINDS,
  type CustomerMemoryRecord,
} from "../memory/customer-memory.js";
import { CustomerMemoryService } from "../memory/customer-memory-service.js";
import { CustomerSummaryService } from "../memory/customer-summary-service.js";
import { LangChainModelProvider } from "../model/model-provider.js";
import { classifySendFailure } from "../outbox/outbox-policy.js";
import { OutboxStore } from "../outbox/OutboxStore.js";
import {
  CONTENT_PURGE_MAX_ROWS_LIMIT,
  ContentPurgeService,
} from "../retention/content-purge-service.js";
import {
  inboxRetentionCutoff,
  purgeExpiredInboxEvents,
} from "../retention/inbox-retention.js";
import { SchedulingClient } from "../scheduling-service/client.js";
import { SessionService } from "../session/SessionService.js";
import {
  AI_CONVERSATION_STYLES,
  aiConversationStyleSchema,
  LEGACY_AI_CONVERSATION_STYLE_ALIASES,
  UNKNOWN_AI_CONVERSATION_STYLE_CODE,
} from "../tenant-config/ai-settings.js";
import {
  businessContextSchema,
  normalizeBusinessContext,
} from "../tenant-config/business-context.js";
import { loadTenantExecutionContext } from "../tenant-config/tenant-execution-context.js";
import { AssistantToolRegistry } from "../tools/assistant-tools.js";
import {
  TENANT_PURGE_MAX_ROWS_LIMIT,
  TenantPurgeService,
} from "./tenantPurge.js";

const provisionChannelSchema = z.object({
  externalInstanceId: z.string().min(1),
  displayName: z.string().min(1).optional(),
  // Projeção da credencial entregue pelo BFF na mesma chamada de
  // provisionamento, sob a credencial interna de provisionamento.
  instanceCredential: z.string().min(16).max(512),
});

// Projecao do estilo vinda do BFF: os tres valores do produto passam, os dois
// legados passam normalizados para o vocabulario novo e qualquer outro valor e
// recusado com erro proprio. Sem `tone` no corpo, fica no equilibrado.
const aiTenantConfigSchema = z.object({
  enabled: z.boolean(),
  tone: aiConversationStyleSchema,
  businessContext: businessContextSchema,
});

const conversationParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

const messageMediaParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
  messageId: z.string().trim().min(1).max(128),
});

const conversationQuerySchema = z.object({
  status: z.enum(["ACTIVE", "HUMAN_HANDOFF", "CLOSED"]).optional(),
  // Organizacao da inbox e estado de atendimento: filtros por operacao, sem
  // sobrecarregar `status`, que continua sendo o ciclo de vida da conversa.
  category: z.enum(["COMMERCIAL", "UNCLASSIFIED", "PERSONAL"]).optional(),
  handling: z.enum(["AI", "HUMAN"]).optional(),
  ignored: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const awaitingHumanQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const categoryOverrideSchema = z.object({
  category: z.enum(["COMMERCIAL", "UNCLASSIFIED", "PERSONAL"]).nullable(),
});

const ignoreContactSchema = z.object({ ignored: z.boolean() });

// Purga de conteudo (Goal023/WU-02). Os cutoffs chegam **calculados** pelo
// BFF, que e quem conhece o prazo do negocio; esta rota nao le configuracao,
// nao deriva prazo de relogio proprio e nao tem default de janela. Sem teto
// explicito nao ha passada: "apague tudo" nao e um pedido aceitavel.
const contentPurgeSchema = z.object({
  commercialCutoff: z.iso.datetime({ offset: true }),
  personalCutoff: z.iso.datetime({ offset: true }),
  maxRows: z.number().int().min(1).max(CONTENT_PURGE_MAX_ROWS_LIMIT),
});

// Purga do negocio inteiro (Goal025/WU-05). `.strict()` recusa qualquer campo
// alem de `maxRows`: nao existe forma de mandar lista de negocios nem sinal de
// "apague tudo" pelo corpo, e o tenant nunca vem daqui — vem so do contexto
// interno ja autenticado (`trustedTenantContext`). Sem `maxRows` nao ha
// passada: e o mesmo principio do Goal023, agora sobre o negocio inteiro.
const tenantPurgeSchema = z
  .object({
    maxRows: z.number().int().min(1).max(TENANT_PURGE_MAX_ROWS_LIMIT),
  })
  .strict();

// Goal019/WU-07: ignorar por telefone, sem conversa aberta ainda — o mesmo
// limite de `startActivationTestSchema.tenantPhone` (validar aqui falha
// rapido, sem depender do upsert para um numero obviamente invalido).
const ignoreContactByPhoneSchema = z.object({
  phone: z.string().trim().min(8).max(20),
  ignored: z.boolean(),
});

const sendOwnerMessageSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  // Aceito e ignorado durante a troca de produtor: o consumer compatível entra
  // primeiro, o BFF para de enviar em seguida. O valor nunca é usado como
  // credencial — quem resolve o envio é o vínculo.
  instanceToken: z.string().min(16).max(512).optional(),
});

const knowledgeDocumentTypeSchema = z.enum(KNOWLEDGE_DOCUMENT_TYPES);

const knowledgeChunkSchema = z
  .object({
    content: z.string().trim().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const createKnowledgeDocumentSchema = z
  .object({
    type: knowledgeDocumentTypeSchema,
    serviceId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    source: z.string().trim().min(1).optional(),
    chunks: z.array(knowledgeChunkSchema).min(1),
  })
  .strict();

const editKnowledgeDocumentSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    serviceId: z.string().trim().min(1).nullable().optional(),
    chunks: z.array(knowledgeChunkSchema).min(1),
  })
  .strict();

const listKnowledgeDocumentsQuerySchema = z.object({
  type: knowledgeDocumentTypeSchema.optional(),
  serviceId: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const knowledgeDocumentParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

const customerParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

const customerMemoryParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
  memoryId: z.string().trim().min(1).max(128),
});

// Criacao pela profissional: origem sempre PROFESSIONAL (a rota nao aceita
// declarar origem, senao o painel poderia forjar "informado pela cliente") e
// permissao **explicita**, negada por omissao, como as notas do cadastro.
const createCustomerMemorySchema = z
  .object({
    kind: z.enum(CUSTOMER_MEMORY_KINDS),
    value: z.string().trim().min(1).max(500),
    aiAllowed: z.boolean().default(false),
  })
  .strict();

const updateCustomerMemorySchema = z
  .object({ aiAllowed: z.boolean() })
  .strict();

const otherInfoSchema = z
  .object({ content: z.string().trim().min(1) })
  .strict();

// Numero do WhatsApp do negocio, projetado por quem pede o teste: e para ele
// que o numero oficial da Atendly manda a conversa de teste. Nao ha default e
// nao ha descoberta por busca — sem numero valido a execucao e recusada.
const startActivationTestSchema = z
  .object({ tenantPhone: z.string().trim().min(8).max(20) })
  .strict();

export interface InternalRoutesOptions {
  /** Inbox duravel: o dead-letter aparece como atencao no painel. */
  inbox?: Pick<InboxPort, "countDeadLetters">;
  /** Contato, sessao, categoria e controle humano (Goal005). */
  sessions?: Pick<
    SessionService,
    | "resolveContext"
    | "currentSession"
    | "setCategoryOverride"
    | "setIgnored"
    | "setIgnoredByExternalContact"
    | "releaseToAi"
    | "assumeHumanControl"
  >;
  /** Ciclo de vida do documento de conhecimento (Goal012/WU-01). */
  knowledgeDocuments?: Pick<
    KnowledgeDocumentService,
    "list" | "get" | "create" | "edit" | "deactivate" | "saveOtherInfo"
  >;
  /** Memoria da pessoa: listar, criar, permitir e remover (Goal012). */
  customerMemory?: Pick<
    CustomerMemoryService,
    "list" | "create" | "setPermission" | "remove"
  >;
  /** Resumo sob demanda, so a partir de material autorizado (Goal012). */
  customerSummary?: Pick<CustomerSummaryService, "generate">;
  /**
   * Sugestoes de resposta ao atendimento humano, sem efeito (Goal012/WU-04).
   */
  suggestions?: Pick<AssistantService, "generateSuggestions">;
  /** Bytes de mídia sob demanda, com recusa própria (Goal013/WU-05). */
  media?: Pick<MessageMediaService, "resolve">;
  /** Execução do teste real da ativação (Goal019/WU-03). */
  activationTest?: Pick<
    ActivationTestService,
    | "start"
    | "restart"
    | "execute"
    | "current"
    | "milestones"
    | "activeChannel"
  >;
}

export async function registerInternalRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  options: InternalRoutesOptions = {},
): Promise<void> {
  const channelConnections = new ChannelConnectionService(prisma);
  const sessions = options.sessions ?? new SessionService(prisma);
  const inbox =
    options.inbox ?? new InboxStore(prisma, inboxRetryPolicyFromEnv());
  const knowledgeDocuments =
    options.knowledgeDocuments ??
    new KnowledgeDocumentService(
      prisma,
      new PgVectorKnowledgeChunkIndexer(new OpenAIEmbeddingProvider()),
    );
  const contentPurge = new ContentPurgeService(prisma);
  const tenantPurge = new TenantPurgeService(prisma);
  const customerMemoryService = new CustomerMemoryService(prisma);
  const customerMemory = options.customerMemory ?? customerMemoryService;
  const customerSummary =
    options.customerSummary ??
    new CustomerSummaryService(
      prisma,
      customerMemoryService,
      new SchedulingClient(),
      new LangChainModelProvider(),
    );
  const suggestions =
    options.suggestions ??
    new AssistantService(
      prisma,
      app.log,
      undefined,
      new AssistantToolRegistry(
        prisma,
        new SchedulingClient(),
        undefined,
        app.log,
      ),
      undefined,
      customerMemoryService,
      new PGVectorKnowledgeStore(
        prisma,
        new OpenAIEmbeddingProvider(),
        env.KNOWLEDGE_SEARCH_MIN_SCORE,
      ),
    );
  const activationTest =
    options.activationTest ??
    new ActivationTestService({
      runs: new ActivationTestRunStore(prisma),
      scheduling: new SchedulingClient(),
      sender: new PlatformWhatsAppSender(app.log),
      // A IA que o teste exercita e a mesma que atende qualquer cliente:
      // mesma porta de entrada, mesmo agente, mesmas ferramentas. Nao existe
      // aqui um assistente "de teste" com prompt ou catalogo proprio — se
      // existisse, o teste nao provaria nada sobre o atendimento real.
      ai: new ActivationTestAiDriver({
        assistant: new AssistantService(
          prisma,
          app.log,
          undefined,
          new AssistantToolRegistry(
            prisma,
            new SchedulingClient(),
            undefined,
            app.log,
          ),
          undefined,
          customerMemoryService,
        ),
        // Mesmo contexto de negocio que o webhook do canal entrega: sem ele o
        // turno inteiro vira "contexto incompleto" e a IA nao chega a
        // consultar catalogo nem agenda.
        tenantContext: (tenantId) =>
          loadTenantExecutionContext(prisma, tenantId),
        // A resposta da IA sai pelo canal **do tenant**, com a credencial do
        // vinculo dele: `handleIncomingText` grava a linha e nao envia.
        replySender: new TenantChannelReplySender(prisma, app.log),
        readToolCalls: async ({ tenantId, conversationId, since }) =>
          prisma.aiToolCall.findMany({
            where: {
              tenantId,
              createdAt: { gte: since },
              aiRun: { conversationId },
            },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, status: true, result: true },
          }),
      }),
      logger: app.log,
    });
  const messageMedia =
    options.media ??
    new MessageMediaService(prisma, (channel) => {
      const credential = channelConnections.resolveChannelCredential(channel);
      return new EvolutionProvider(
        app.log,
        credential,
        channel.externalInstanceId,
      );
    });

  // Autorização por escopo, com negação por omissão: um caminho `/internal/`
  // sem escopo declarado no mapa abaixo é recusado, então rota nova não nasce
  // aberta por esquecimento. A recusa acontece antes de qualquer efeito.
  app.addHook("preHandler", async (request) => {
    if (!request.url.startsWith("/internal/")) return;
    authorizeInternalRequest(request, requiredScope(request));
  });

  app.put("/internal/channel-connections/evolution", async (request, reply) => {
    const context = trustedTenantContext(request);
    const parsed = provisionChannelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const connection = await channelConnections.provisionEvolutionChannel({
      ...context,
      ...parsed.data,
    });
    return reply.send({
      ok: true,
      connection: {
        id: connection.id,
        tenantId: connection.tenantId,
        provider: connection.provider,
        externalInstanceId: connection.externalInstanceId,
        status: connection.status,
      },
    });
  });

  /**
   * Derruba o canal do negocio (Goal025/WU-02).
   *
   * Chamada pelo inicio da exclusao de conta, nunca por varredura: o negocio
   * deixa de ter canal ativo e, com isso, `supersededByChannelChange` passa a
   * valer — e a reconciliacao do BFF nao tem como religar a IA.
   *
   * O tenant vem so do contexto interno ja autenticado, como no `PUT` acima, e
   * o escopo e o mesmo `channel:provision`: derrubar o canal e a outra ponta
   * da mesma autoridade que o provisiona, nao uma autoridade nova.
   *
   * Idempotente: negocio sem canal ativo devolve `deactivated: 0` e `200`.
   */
  app.delete("/internal/channel-connections/evolution", async (request, reply) => {
    const context = trustedTenantContext(request);
    const deactivated = await channelConnections.deactivateTenantChannels(
      context.tenantId,
    );
    return reply.send({ ok: true, deactivated });
  });

  app.put("/internal/ai-tenant-config", async (request, reply) => {
    const context = trustedTenantContext(request);
    const parsed = aiTenantConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      // Estilo desconhecido tem erro proprio: quem escreveu a configuracao
      // precisa distinguir "vocabulario invalido" de corpo malformado.
      const unknownStyle = parsed.error.issues.some(
        (issue) =>
          issue.path[0] === "tone" &&
          issue.message === UNKNOWN_AI_CONVERSATION_STYLE_CODE,
      );
      if (unknownStyle) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: UNKNOWN_AI_CONVERSATION_STYLE_CODE,
            message: "Unknown AI conversation style.",
            accepted: [...AI_CONVERSATION_STYLES],
            legacyAliases: Object.keys(LEGACY_AI_CONVERSATION_STYLE_ALIASES),
          },
        });
      }
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const config = await channelConnections.updateAiTenantConfig({
      tenantId: context.tenantId,
      enabled: parsed.data.enabled,
      tone: parsed.data.tone,
      promptVersion: env.AI_PROMPT_VERSION,
      businessContext: normalizeBusinessContext(parsed.data.businessContext),
    });
    return reply.send({
      ok: true,
      config: {
        tenantId: config.tenantId,
        enabled: config.enabled,
        tone: config.tone,
        promptVersion: config.promptVersion,
      },
    });
  });

  /**
   * Leitura da configuração efetiva do tenant do contexto (Goal014/WU-01).
   *
   * `null` quando o tenant nunca foi projetado — sem valor default fabricado
   * aqui, o consumidor decide o que fazer com a ausência.
   */
  app.get("/internal/ai-tenant-config", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const config = await prisma.aiTenantConfig.findUnique({
      where: { tenantId },
      select: { enabled: true, tone: true, promptVersion: true },
    });
    return internalData(
      request,
      config
        ? {
            enabled: config.enabled,
            tone: config.tone,
            promptVersion: config.promptVersion,
          }
        : null,
    );
  });

  app.get("/internal/conversations", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const query = parseOrThrow(conversationQuerySchema, request.query);
    const conversations = await prisma.conversation.findMany({
      where: {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
        // Categoria e atendimento humano vivem na sessao vigente (a que ainda
        // nao terminou); `ignored` e regra do contato.
        ...(query.category || query.handling
          ? {
              sessions: {
                some: {
                  endedAt: null,
                  ...(query.category ? { category: query.category } : {}),
                  ...(query.handling
                    ? { humanHandling: query.handling === "HUMAN" }
                    : {}),
                },
              },
            }
          : {}),
        ...(query.ignored
          ? { contact: { ignored: query.ignored === "true" } }
          : {}),
        ...(query.search
          ? {
              OR: [
                {
                  customerName: { contains: query.search, mode: "insensitive" },
                },
                { externalContactId: { contains: query.search } },
              ],
            }
          : {}),
      },
      include: conversationInclude,
      orderBy: { updatedAt: "desc" },
      take: query.limit,
    });

    return internalData(
      request,
      conversations.map((conversation) => conversationDto(conversation)),
    );
  });

  app.get("/internal/conversations/:id", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  app.get("/internal/conversations/:id/messages", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    await requireConversation(prisma, tenantId, id);
    const messages = await prisma.message.findMany({
      where: { tenantId, conversationId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
      include: { attachments: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    return internalData(request, messages.map(messageDto));
  });

  /**
   * Quem esta aguardando humano, por tenant (Goal022/WU-02).
   *
   * Uma entrada por conversa, mesmo quando `pauseForHuman` grava mais de uma
   * linha `Handoff` OPEN para ela. Takeover do dono nunca aparece: a exclusao
   * acontece aqui, na leitura da IA, e nao no consumidor.
   */
  app.get("/internal/handoffs/awaiting-human", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const query = parseOrThrow(awaitingHumanQuerySchema, request.query);
    const entries = await listConversationsAwaitingHuman(
      prisma,
      tenantId,
      query.limit,
    );
    return internalData(request, entries.map(awaitingHumanDto));
  });

  /**
   * Bytes de mídia sob demanda (Goal013/WU-05).
   *
   * Não é JSON: `mediaUrl` hospedada é buscada direto, e na falta dela o
   * download acontece pela credencial da instância a partir do proto guardado
   * em `Message.rawPayload`. Cada recusa tem código próprio — mensagem sem
   * attachment, mídia marcada grande demais (nunca tenta baixar) e
   * indisponível — nunca um 500 genérico.
   */
  app.get(
    "/internal/conversations/:id/messages/:messageId/media",
    async (request, reply) => {
      const { tenantId } = trustedTenantContext(request);
      const { id, messageId } = parseOrThrow(
        messageMediaParamsSchema,
        request.params,
      );
      await requireConversation(prisma, tenantId, id);
      const outcome = await messageMedia.resolve({
        tenantId,
        conversationId: id,
        messageId,
        requestId: String(request.id),
      });
      if (!outcome.ok) {
        const statusCode =
          outcome.reason === "MESSAGE_NOT_FOUND" ||
          outcome.reason === "MESSAGE_ATTACHMENT_NOT_FOUND"
            ? 404
            : 409;
        throw new AppError("Media is not available for this message.", {
          statusCode,
          code: outcome.reason,
        });
      }
      reply.header("content-type", outcome.media.mimetype);
      if (outcome.media.fileName) {
        reply.header(
          "content-disposition",
          `inline; filename="${sanitizeFileNameHeader(outcome.media.fileName)}"`,
        );
      }
      return reply.send(Buffer.from(outcome.media.data));
    },
  );

  app.post("/internal/conversations/:id/messages", async (request, reply) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const body = parseOrThrow(sendOwnerMessageSchema, request.body);
    const { userId } = trustedTenantContext(request);
    const conversation = await requireConversation(prisma, tenantId, id);

    // Enviar assume. O takeover previo deixou de ser pre-condicao: exigir o
    // clique antes fazia a mensagem da profissional sair sem que a plataforma
    // soubesse que ela ja estava atendendo — e a resposta automatica em curso
    // continuava valendo. Agora o controle humano e gravado antes do
    // transporte, e a saida automatica pendente e cancelada.
    const session = await sessions.resolveContext({
      tenantId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      externalContactId: conversation.externalContactId,
      customerName: conversation.customerName,
    });
    await sessions.assumeHumanControl({
      tenantId,
      sessionId: session.sessionId,
      source: "ATENDLY",
      actor: userId,
    });

    // A tentativa existe antes do transporte, com operation-id estavel. Ela
    // nunca e apagada: timeout ou erro de rede depois do envio nao provam que a
    // mensagem nao chegou, e apagar a linha era exatamente a forma de a
    // profissional achar que nao mandou nada e mandar de novo.
    const correlationId = `owner-${randomUUID()}`;
    const pendingMessage = await prisma.message.create({
      data: {
        tenantId,
        channelId: conversation.channelId,
        conversationId: conversation.id,
        externalMessageId: correlationId,
        correlationId,
        direction: "OUTBOUND",
        source: "OWNER",
        role: "assistant",
        body: body.text,
        deliveryState: "PENDING",
        deliveryUpdatedAt: new Date(),
      },
    });

    const outbox = new OutboxStore(prisma);
    let sent;
    try {
      const credential = channelConnections.resolveChannelCredential(
        conversation.channel,
      );
      sent = await new EvolutionProvider(
        app.log,
        credential,
        conversation.channel.externalInstanceId,
      ).sendText({
        to: contactNumber(conversation.externalContactId),
        text: body.text,
        correlationId,
      });
    } catch (error) {
      const classification = classifySendFailure(error);
      await outbox.markUndelivered({
        messageRecordId: pendingMessage.id,
        state: classification.state,
        detail: classification.detail,
      });
      app.log.warn(
        {
          conversationId: conversation.id,
          messageRecordId: pendingMessage.id,
          deliveryState: classification.state,
          deliveryDetail: classification.detail,
          err: toErrorMessage(error),
        },
        "Owner outbound message was persisted without delivery confirmation",
      );
      const undelivered = await prisma.message.findUniqueOrThrow({
        where: { id: pendingMessage.id },
      });
      // 202: a tentativa foi aceita e esta registrada, a entrega nao foi
      // confirmada. O estado real vai no DTO, nao num sucesso presumido.
      return reply
        .code(202)
        .send(internalData(request, messageDto(undelivered)));
    }

    await outbox.markSent({
      messageRecordId: pendingMessage.id,
      providerMessageId: sent.messageId ?? correlationId,
      rawPayload: jsonValue(sent.raw),
    });
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: pendingMessage.id },
    });
    return reply.code(201).send(internalData(request, messageDto(message)));
  });

  app.post("/internal/conversations/:id/takeover", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const conversation = await requireConversation(prisma, tenantId, id);
    const existingOwnerTakeover = await prisma.handoff.findFirst({
      where: { tenantId, conversationId: id, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    if (existingOwnerTakeover?.reason !== "OWNER_TAKEOVER") {
      await prisma.handoff.create({
        data: {
          tenantId,
          channelId: conversation.channelId,
          conversationId: id,
          externalContactId: conversation.externalContactId,
          reason: "OWNER_TAKEOVER",
          summary: "Atendimento humano iniciado pelo painel.",
        },
      });
    }
    // Sem relogio: a sessao guarda o atendimento humano, entao o takeover nao
    // precisa mais de `BOT_OFF_PAUSE_UNTIL` para nao ser desfeito sozinho. O
    // relogio no ano 9999 era o que fazia a pausa sobreviver a troca de sessao
    // e prender a conversa depois de a sessao expirar.
    await prisma.conversation.update({
      where: { id },
      data: {
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        handoffPausedUntil: null,
      },
    });
    const takenOver = await sessions.resolveContext({
      tenantId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      externalContactId: conversation.externalContactId,
      customerName: conversation.customerName,
    });
    await sessions.assumeHumanControl({
      tenantId,
      sessionId: takenOver.sessionId,
      source: "ATENDLY",
      actor: userId,
    });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  /**
   * `Retomar IA`.
   *
   * Unico caminho de volta dentro da sessao: o relogio nunca devolve sozinho.
   * A retomada reavalia o contexto atual em vez de continuar do ponto anterior,
   * e nenhuma mensagem automatica anuncia a troca para o cliente.
   */
  app.post("/internal/conversations/:id/release", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const conversation = await requireConversation(prisma, tenantId, id);
    await resolveConversationHandoffs(prisma, tenantId, id);
    await prisma.conversation.update({
      where: { id },
      data: { humanHandoff: false, status: "ACTIVE", handoffPausedUntil: null },
    });
    await sessions.resolveContext({
      tenantId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      externalContactId: conversation.externalContactId,
      customerName: conversation.customerName,
    });
    await sessions.releaseToAi({ tenantId, conversationId: id, actor: userId });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  /**
   * Override manual da categoria. `category: null` limpa o override e devolve a
   * conversa a classificacao automatica; qualquer valor prevalece sobre ela.
   */
  app.put("/internal/conversations/:id/category", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const body = parseOrThrow(categoryOverrideSchema, request.body);
    const conversation = await requireConversation(prisma, tenantId, id);
    await sessions.resolveContext({
      tenantId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      externalContactId: conversation.externalContactId,
      customerName: conversation.customerName,
    });
    await sessions.setCategoryOverride({
      tenantId,
      conversationId: id,
      category: body.category,
      actor: userId,
    });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  /** Contato ignorado: regra do contato, prevalece sobre a sessao. */
  app.put("/internal/conversations/:id/ignore", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const body = parseOrThrow(ignoreContactSchema, request.body);
    const conversation = await requireConversation(prisma, tenantId, id);
    await sessions.resolveContext({
      tenantId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      externalContactId: conversation.externalContactId,
      customerName: conversation.customerName,
    });
    await sessions.setIgnored({
      tenantId,
      conversationId: id,
      ignored: body.ignored,
      actor: userId,
      source: "panel",
    });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  /**
   * Contato ignorado por telefone, sem conversa aberta ainda (Goal019/WU-07):
   * a etapa opcional entre conectar e testar tambem aceita numero informado
   * manualmente. O canal e o vinculo ativo do WhatsApp do tenant — sem ele
   * nao ha `channelId` para a chave do contato.
   */
  app.put("/internal/contacts/ignore", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const body = parseOrThrow(ignoreContactByPhoneSchema, request.body);
    const externalContactId = normalizePhone(body.phone);
    if (!externalContactId) {
      throw new AppError("Phone number is invalid after normalization.", {
        statusCode: 400,
        code: "CONTACT_PHONE_INVALID",
      });
    }
    const channel = await channelConnections.resolveTenantEvolutionChannel(
      tenantId,
    );
    const contact = await sessions.setIgnoredByExternalContact({
      tenantId,
      channelId: channel.id,
      externalContactId,
      ignored: body.ignored,
      actor: userId,
      source: "onboarding",
    });
    return internalData(request, {
      contactId: contact.contactId,
      externalContactId: contact.externalContactId,
      ignored: contact.ignored,
      ignoredAt: contact.ignoredAt?.toISOString() ?? null,
    });
  });

  app.post("/internal/conversations/:id/resolve", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    await requireConversation(prisma, tenantId, id);
    await resolveConversationHandoffs(prisma, tenantId, id);
    await prisma.conversation.update({
      where: { id },
      data: { humanHandoff: false, status: "CLOSED", handoffPausedUntil: null },
    });
    return internalData(
      request,
      conversationDto(await requireConversation(prisma, tenantId, id)),
    );
  });

  /**
   * Sugestoes de resposta ao atendimento humano, sem efeito (Goal012/WU-04).
   *
   * Nao e o caminho de envio: nao cria Message, hold, rascunho nem outbox. As
   * cinco recusas proprias viram `409` com o motivo no `code`, no mesmo
   * envelope de erro das demais rotas internas.
   */
  app.post("/internal/conversations/:id/suggestions", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id } = parseOrThrow(conversationParamsSchema, request.params);
    const result = await suggestions.generateSuggestions({
      tenantId,
      conversationId: id,
      userId,
      requestId: String(request.id),
    });
    if (!result.ok) {
      throw new AppError(
        "Suggestions are not available for this conversation.",
        { statusCode: 409, code: result.reason },
      );
    }
    // Contrato unico com o consumidor: o mesmo objeto que o BFF e o frontend
    // decodificam (`conversationSuggestionsSchema`), incluindo a conversa a
    // que as sugestoes pertencem e a versao efetiva do prompt.
    return internalData(request, {
      conversationId: id,
      suggestions: result.suggestions,
      aiRunId: result.aiRunId,
      promptVersion: result.promptVersion,
    });
  });

  app.get("/internal/knowledge/documents", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const query = parseOrThrow(
      listKnowledgeDocumentsQuerySchema,
      request.query,
    );
    const documents = await knowledgeDocuments.list({ tenantId, ...query });
    return internalData(request, documents.map(knowledgeDocumentDto));
  });

  app.post("/internal/knowledge/documents", async (request, reply) => {
    const { tenantId } = trustedTenantContext(request);
    const body = parseOrThrow(createKnowledgeDocumentSchema, request.body);
    const document = await knowledgeDocuments.create({ tenantId, ...body });
    return reply
      .code(201)
      .send(internalData(request, knowledgeDocumentDto(document)));
  });

  app.get("/internal/knowledge/documents/:id", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(knowledgeDocumentParamsSchema, request.params);
    const document = await knowledgeDocuments.get(tenantId, id);
    return internalData(request, knowledgeDocumentDto(document));
  });

  app.put("/internal/knowledge/documents/:id", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(knowledgeDocumentParamsSchema, request.params);
    const body = parseOrThrow(editKnowledgeDocumentSchema, request.body);
    const document = await knowledgeDocuments.edit({ tenantId, id, ...body });
    return internalData(request, knowledgeDocumentDto(document));
  });

  app.delete("/internal/knowledge/documents/:id", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(knowledgeDocumentParamsSchema, request.params);
    const document = await knowledgeDocuments.deactivate(tenantId, id);
    return internalData(request, knowledgeDocumentDto(document));
  });

  /** Campo livre "Outras informações importantes": documento BUSINESS_INFO
   * único por negocio, com source fixa, salvo so por esta rota. */
  app.put("/internal/knowledge/other-info", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const body = parseOrThrow(otherInfoSchema, request.body);
    const document = await knowledgeDocuments.saveOtherInfo({
      tenantId,
      content: body.content,
    });
    return internalData(request, knowledgeDocumentDto(document));
  });

  /**
   * Memoria da pessoa.
   *
   * A colecao lista o que esta vigente (nem removido, nem substituido) e cria
   * com origem `PROFESSIONAL`; o item altera a permissao e remove — inclusive
   * memoria inferida pela IA, que e o ponto do controle existir.
   */
  app.get("/internal/customers/:id/memory", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(customerParamsSchema, request.params);
    const memories = await customerMemory.list({ tenantId, customerId: id });
    return internalData(request, memories.map(customerMemoryDto));
  });

  app.post("/internal/customers/:id/memory", async (request, reply) => {
    const { tenantId } = trustedTenantContext(request);
    const { id } = parseOrThrow(customerParamsSchema, request.params);
    const body = parseOrThrow(createCustomerMemorySchema, request.body);
    const memory = await customerMemory.create({
      tenantId,
      customerId: id,
      kind: body.kind,
      value: body.value,
      // A rota nao aceita origem do chamador: cadastro pelo painel e sempre
      // cadastro da profissional.
      origin: "PROFESSIONAL",
      aiAllowed: body.aiAllowed,
    });
    return reply
      .code(201)
      .send(internalData(request, customerMemoryDto(memory)));
  });

  app.patch("/internal/customers/:id/memory/:memoryId", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const { id, memoryId } = parseOrThrow(
      customerMemoryParamsSchema,
      request.params,
    );
    const body = parseOrThrow(updateCustomerMemorySchema, request.body);
    const memory = await customerMemory.setPermission({
      tenantId,
      customerId: id,
      memoryId,
      aiAllowed: body.aiAllowed,
    });
    return internalData(request, customerMemoryDto(memory));
  });

  app.delete("/internal/customers/:id/memory/:memoryId", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id, memoryId } = parseOrThrow(
      customerMemoryParamsSchema,
      request.params,
    );
    const memory = await customerMemory.remove({
      tenantId,
      customerId: id,
      memoryId,
      removedBy: userId,
    });
    return internalData(request, customerMemoryDto(memory));
  });

  /**
   * Resumo do cliente, gerado pelo modelo sob demanda.
   *
   * Nao persiste verdade nenhuma: a unica escrita e o `AiRun` de auditoria, com
   * `kind = SUMMARY` e a versao do prompt de resumo.
   */
  app.post("/internal/customers/:id/summary", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const { id } = parseOrThrow(customerParamsSchema, request.params);
    const tenantConfig = await prisma.aiTenantConfig.findUnique({
      where: { tenantId },
      select: { settings: true },
    });
    const summary = await customerSummary.generate({
      tenantId,
      userId,
      requestId: String(request.id),
      customerId: id,
      businessContext: normalizeBusinessContext(tenantConfig?.settings),
    });
    return internalData(request, summary);
  });

  app.get("/internal/dashboard", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const tenantConfig = await prisma.aiTenantConfig.findUnique({
      where: { tenantId },
      select: { settings: true },
    });
    const startOfDay = startOfTodayInTimeZone(
      normalizeBusinessContext(tenantConfig?.settings).timezone,
    );
    const [attention, attentionCount, successfulAppointmentTools, aiRuns] =
      await Promise.all([
        prisma.conversation.findMany({
          where: { tenantId, status: "HUMAN_HANDOFF", humanHandoff: true },
          include: conversationInclude,
          orderBy: { updatedAt: "desc" },
          take: 5,
        }),
        prisma.conversation.count({
          where: { tenantId, status: "HUMAN_HANDOFF", humanHandoff: true },
        }),
        prisma.aiToolCall.count({
          where: {
            tenantId,
            name: "create_appointment",
            status: "SUCCEEDED",
            completedAt: { gte: startOfDay },
          },
        }),
        prisma.aiRun.findMany({
          where: {
            tenantId,
            status: "SUCCEEDED",
            completedAt: { gte: startOfDay },
          },
          select: { conversationId: true },
        }),
      ]);
    // Dead-letter visivel como atencao. Nao existe endpoint de reenvio em
    // massa: retomar um evento parado e decisao explicita, evento a evento.
    const inboxDeadLetters = await inbox.countDeadLetters(tenantId);
    return internalData(request, {
      conversationsNeedingAttention: attention.map(conversationDto),
      conversationsNeedingAttentionCount: attentionCount,
      inboxDeadLetters,
      aiAppointmentsToday: successfulAppointmentTools,
      automatedConversationsToday: new Set(
        aiRuns.map((run) => run.conversationId),
      ).size,
    });
  });

  /**
   * Execucao corrente do teste real (Goal019/WU-03).
   *
   * `null` e "nunca testou". Nao existe execucao fabricada para tenant que
   * nunca pediu teste, e o progresso vem dos marcos gravados, nunca do tempo
   * decorrido desde o inicio.
   */
  app.get("/internal/activation-test", async (request) => {
    const { tenantId, userId } = trustedTenantContext(request);
    // A leitura reconcilia execucao abandonada (uma por requisicao, sempre
    // para estado terminal), entao ela precisa do mesmo contexto que a
    // limpeza usa para falar com a agenda.
    const run = await activationTest.current({
      tenantId,
      userId,
      requestId: String(request.id),
    });
    if (!run) return internalData(request, null);
    const [milestones, activeChannel] = await Promise.all([
      activationTest.milestones(tenantId, run.id),
      activationTest.activeChannel(tenantId),
    ]);
    return internalData(
      request,
      activationTestRunDto(run, milestones, { activeChannel }),
    );
  });

  /**
   * Inicia o teste real.
   *
   * Responde `202` com a execucao ja persistida e seguidamente executa no
   * servidor: a partir daqui a execucao nao depende de tela nenhuma — fechar o
   * navegador nao cancela nada, e reabrir le o estado corrente daqui.
   *
   * Cada recusa tem codigo proprio e nenhuma delas e `500`; quem traduz
   * `AppError` em resposta e o error handler do app.
   */
  app.post("/internal/activation-test", async (request, reply) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const body = parseOrThrow(startActivationTestSchema, request.body);
    const run = await activationTest.start({
      tenantId,
      userId,
      requestId: String(request.id),
      tenantPhone: body.tenantPhone,
    });
    executeActivationTest(run.id, tenantId, userId, String(request.id));
    const milestones = await activationTest.milestones(tenantId, run.id);
    return reply
      .code(202)
      .send(internalData(request, activationTestRunDto(run, milestones)));
  });

  /** Reiniciar depois de interferencia humana: a pausada e descartada. */
  app.post("/internal/activation-test/restart", async (request, reply) => {
    const { tenantId, userId } = trustedTenantContext(request);
    const body = parseOrThrow(startActivationTestSchema, request.body);
    const run = await activationTest.restart({
      tenantId,
      userId,
      requestId: String(request.id),
      tenantPhone: body.tenantPhone,
    });
    executeActivationTest(run.id, tenantId, userId, String(request.id));
    const milestones = await activationTest.milestones(tenantId, run.id);
    return reply
      .code(202)
      .send(internalData(request, activationTestRunDto(run, milestones)));
  });

  /**
   * Purga de conteudo de conversa (Goal023/WU-02).
   *
   * Tenant-scoped como todas as internas: o `tenantId` vem do contexto de
   * negocio ja autenticado e e o unico filtro de todas as consultas — a purga
   * de um negocio nao alcanca linha de outro, nem para apagar nem para marcar.
   *
   * DUAS JANELAS, DE DONOS DIFERENTES, NA MESMA PASSADA:
   *
   * - **Conteudo de conversa** (`Message`, `AiRun` e filhos) expira pelos
   *   cutoffs que chegam calculados pelo BFF, porque o prazo e do negocio.
   * - **Inbox duravel** (`ProcessedEvent`) expira pelo prazo **tecnico** desta
   *   casa (`INBOX_RETENTION_DAYS`), que nao e escolha da profissional e por
   *   isso nunca vem no corpo: rastro de execucao do transporte nao e
   *   conteudo de conversa (Goal023/§6).
   *
   * O log diz **quantas linhas, de qual tabela, de qual negocio**. Nunca o que
   * havia nelas: purga que registra o conteudo purgado nao purgou nada.
   */
  app.post("/internal/retention/conversation-content", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const body = parseOrThrow(contentPurgeSchema, request.body);
    const now = new Date();
    const content = await contentPurge.purge({
      tenantId,
      commercialCutoff: new Date(body.commercialCutoff),
      personalCutoff: new Date(body.personalCutoff),
      maxRows: body.maxRows,
    });
    // Teto proprio: o inbox e outra tabela e outro prazo, e gastar nele o
    // orcamento do conteudo faria uma fila atrasar a outra.
    const inbox = await purgeExpiredInboxEvents(prisma, {
      tenantId,
      receivedBefore: inboxRetentionCutoff(now, env.INBOX_RETENTION_DAYS),
      maxRows: body.maxRows,
    });
    const result = {
      ...content,
      processedEvents: inbox.processedEvents,
      hasMore: content.hasMore || inbox.hasMore,
    };
    app.log.info(
      { tenantId, ...result },
      "Conversation content purge pass completed",
    );
    return internalData(request, result);
  });

  /**
   * Purga do negocio inteiro (Goal025/WU-05).
   *
   * Chamada pela exclusao de conta, depois do prazo de arrependimento: nao e
   * varredura periodica de conteudo (isso e `/internal/retention/conversation-content`,
   * Goal023), e apaga tudo do negocio nas ~16 tabelas com `tenantId` do schema
   * da IA, na ordem segura de chave estrangeira declarada em
   * `TENANT_PURGE_TABLES`.
   *
   * O tenant vem so do contexto interno ja autenticado, nunca do corpo — nao
   * ha campo para apagar outro negocio, nem lista, nem "apague tudo". Sob
   * teto por passada e idempotente: rodar de novo sobre negocio ja purgado
   * nao encontra linha e nao e erro.
   */
  app.post("/internal/retention/tenant", async (request) => {
    const { tenantId } = trustedTenantContext(request);
    const body = parseOrThrow(tenantPurgeSchema, request.body);
    const result = await tenantPurge.purge({
      tenantId,
      maxRows: body.maxRows,
    });
    app.log.info(
      { tenantId, ...result },
      "Tenant purge pass completed",
    );
    return internalData(request, result);
  });

  /**
   * Toca a execucao fora da requisicao.
   *
   * O resultado do teste vive na linha da execucao, nao nesta resposta: falhar
   * o teste e resultado gravado, e por isso o erro aqui so vira log — devolver
   * 500 para quem pediu o inicio diria que o pedido falhou, o que nao e
   * verdade.
   */
  function executeActivationTest(
    runId: string,
    tenantId: string,
    userId: string,
    requestId: string,
  ): void {
    void activationTest
      .execute({ tenantId, runId, userId, requestId })
      .catch((error: unknown) => {
        app.log.error(
          { tenantId, runId, err: toErrorMessage(error) },
          "Activation test execution could not be driven to a terminal state",
        );
      });
  }
}

/**
 * DTO da execucao.
 *
 * Os seis marcos saem um a um, cada um com a fonte do fato que o sustenta.
 * `sourceId` nulo so acontece junto de `reached: false` — nao existe marco
 * concluido sem fonte para o consumidor mostrar.
 */
function activationTestRunDto(
  run: ActivationTestRunRecord,
  milestones: readonly ActivationTestMilestoneRecord[],
  /**
   * Vinculo ativo do tenant **agora**. Chave ausente significa "nao
   * consultado" — e o caso das rotas de escrita, que acabaram de criar a
   * execucao contra o vinculo corrente e por isso nao podem estar superadas.
   */
  channel: { activeChannel?: ActivationTestChannel | null } = {},
) {
  const failedStep = run.failedStep;
  return {
    id: run.id,
    state: run.state,
    // Vinculo contra o qual este teste foi feito, e se ele ainda e o do
    // negocio. Trocar ou revincular o WhatsApp faz o teste deixar de valer:
    // derivado da comparacao, nunca de um booleano que alguem tem de lembrar
    // de virar na troca.
    channelId: run.channelId,
    supersededByChannelChange: supersededByChannelChange(run, channel),
    terminal: isTerminalActivationTestState(run.state),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    pausedAt: run.pausedAt,
    currentStep: run.currentStep,
    completedStep: run.completedStep,
    attempts: run.attempts,
    maxAttempts: run.maxAttempts,
    failedStep,
    failedStepLabel: failedStep
      ? ACTIVATION_TEST_STEP_LABELS[failedStep]
      : null,
    failureCode: run.failureCode,
    appointmentId: run.appointmentId,
    // §6 exige que "a tela diz o que ficou": o estado da limpeza e o residuo
    // saem daqui com alvo e razao ja em linguagem do negocio. Sem isto o
    // consumidor so conseguiria afirmar limpeza completa — que e exatamente a
    // falha de aceite que o Goal nomeia.
    cleanupState: run.cleanupState,
    cleanupAt: run.cleanupAt,
    cleanupResidue: activationTestResidueReport(run.cleanupResidue),
    milestones: activationTestProgress(milestones).map((item) => ({
      milestone: item.milestone,
      reached: item.reached,
      reachedAt: item.reachedAt,
      sourceKind: item.source?.kind ?? null,
      sourceId: item.source?.id ?? null,
    })),
  };
}

/**
 * O teste ainda vale para o WhatsApp que o negocio usa hoje?
 *
 * Sem vinculo ativo, nao vale: nao ha numero para o qual aquele teste sirva.
 * Com vinculo, a comparacao e pela **instancia**, nao pelo `id` da linha:
 * `ChannelConnection` e unica por `(tenantId, provider)`, entao revincular
 * atualiza a mesma linha e troca `externalInstanceId` sem mudar o `id`.
 * Comparar so o `id` deixaria o teste de um numero valendo para outro.
 *
 * Execucao anterior a coluna `channelInstanceId` (nula) cai na comparacao por
 * `id`: e o maximo que se pode afirmar sobre ela sem inventar instancia.
 */
function supersededByChannelChange(
  run: ActivationTestRunRecord,
  channel: { activeChannel?: ActivationTestChannel | null },
): boolean {
  if (!("activeChannel" in channel)) return false;
  const active = channel.activeChannel;
  if (!active) return true;
  if (active.id !== run.channelId) return true;
  return run.channelInstanceId !== null
    ? active.externalInstanceId !== run.channelInstanceId
    : false;
}

function parseOrThrow<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError("Request validation failed.", {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      details: z.flattenError(parsed.error).fieldErrors,
    });
  }
  return parsed.data;
}

async function requireConversation(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, tenantId },
    include: { ...conversationInclude, channel: true },
  });
  if (!conversation) {
    throw new AppError("Conversation not found.", {
      statusCode: 404,
      code: "CONVERSATION_NOT_FOUND",
    });
  }
  return conversation;
}

/**
 * Include comum das leituras de conversa.
 *
 * A sessao vigente e a que ainda nao terminou; `take: 1` com ordem
 * decrescente por inicio deixa a leitura deterministica mesmo se um resto de
 * corrida tiver aberto duas.
 */
const conversationInclude = {
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: { attachments: { orderBy: { createdAt: "asc" }, take: 1 } },
  },
  handoffs: {
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
  contact: true,
  sessions: {
    where: { endedAt: null },
    orderBy: { startedAt: "desc" },
    take: 1,
  },
} as const satisfies Prisma.ConversationInclude;

interface ConversationDtoInput {
  id: string;
  externalContactId: string;
  customerName: string | null;
  status: "ACTIVE" | "HUMAN_HANDOFF" | "CLOSED";
  humanHandoff: boolean;
  updatedAt: Date;
  contentExpiredThrough?: Date | null;
  handoffs: Array<{ reason: string }>;
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    source: "CUSTOMER" | "AI" | "OWNER" | null;
    body: string;
    createdAt: Date;
    kind?: MessageKindValue;
    attachments?: MessageDtoAttachment[];
  }>;
  contact?: {
    customerId: string | null;
    ignored: boolean;
    ignoredAt: Date | null;
    aiPaused: boolean;
  } | null;
  sessions?: Array<{
    id: string;
    startedAt: Date;
    expiresAt: Date;
    lastContactMessageAt: Date | null;
    category: "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL";
    categorySource: "AUTOMATIC" | "MANUAL";
    suggestedCategory: "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL" | null;
    humanHandling: boolean;
    humanHandlingSince: Date | null;
  }>;
}

/**
 * DTO de conversa.
 *
 * Campos do Goal005 sao aditivos: `category`, `categorySource`, `handling`,
 * `session` e `ignored`. Conversa sem sessao materializada ainda (estoque em
 * migracao) responde com o padrao seguro — `Nao classificadas`, automatica,
 * nao ignorada — em vez de omitir o campo e obrigar o consumidor a adivinhar.
 */
function conversationDto(conversation: ConversationDtoInput) {
  const session = conversation.sessions?.[0];
  const humanHandling = session?.humanHandling ?? conversation.humanHandoff;
  return {
    id: conversation.id,
    externalContactId: conversation.externalContactId,
    customerName: conversation.customerName,
    status: conversation.status,
    humanHandoff: conversation.humanHandoff,
    handoffReason: conversation.handoffs[0]?.reason ?? null,
    lastMessage: conversation.messages[0]
      ? messageDto(conversation.messages[0])
      : null,
    unreadCount: 0,
    updatedAt: conversation.updatedAt.toISOString(),
    // Goal023/WU-02: ate quando o conteudo desta conversa ja foi purgado.
    // Aditivo e nulo enquanto nada expirou — a tela le isto em vez de inferir
    // expiracao pela ausencia de mensagem.
    contentExpiredThrough:
      conversation.contentExpiredThrough?.toISOString() ?? null,
    category: session?.category ?? "UNCLASSIFIED",
    categorySource: session?.categorySource ?? "AUTOMATIC",
    suggestedCategory: session?.suggestedCategory ?? null,
    // "Voce atendendo" x "IA atendendo": estado de atendimento, nao ciclo de
    // vida. Aberto ou lido nao muda nada disto.
    handling: humanHandling ? "HUMAN" : "AI",
    ignored: conversation.contact?.ignored ?? false,
    ignoredAt: conversation.contact?.ignoredAt?.toISOString() ?? null,
    aiPaused: conversation.contact?.aiPaused ?? false,
    customerId: conversation.contact?.customerId ?? null,
    session: session
      ? {
          id: session.id,
          startedAt: session.startedAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          lastContactMessageAt:
            session.lastContactMessageAt?.toISOString() ?? null,
          humanHandlingSince: session.humanHandlingSince?.toISOString() ?? null,
        }
      : null,
  };
}

interface MessageDtoAttachment {
  kind: MessageAttachmentKindValue;
  mimetype: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  mediaUrl: string | null;
  tooLarge: boolean;
  transcript: string | null;
  transcriptStatus: TranscriptStatusValue | null;
  transcriptError: string | null;
}

function messageDto(message: {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  source: "CUSTOMER" | "AI" | "OWNER" | null;
  body: string;
  createdAt: Date;
  kind?: MessageKindValue;
  deliveryState?: "PENDING" | "SENT" | "FAILED" | "UNKNOWN" | null;
  deliveryDetail?: string | null;
  attachments?: MessageDtoAttachment[];
}) {
  const attachment = message.attachments?.[0];
  return {
    id: message.id,
    direction: message.direction,
    source: message.source,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    // Legado sem backfill continua TEXT: a coluna nasceu com esse default
    // (Goal013/WU-02), entao toda linha anterior ja responde assim sozinha.
    kind: message.kind ?? "TEXT",
    // Nulo em INBOUND e no estoque anterior ao Goal004; o consumidor trata o
    // campo como opcional.
    deliveryState: message.deliveryState ?? null,
    deliveryDetail: message.deliveryDetail ?? null,
    attachment: attachment
      ? {
          kind: attachment.kind,
          mimetype: attachment.mimetype,
          fileName: attachment.fileName,
          sizeBytes: attachment.sizeBytes,
          durationSeconds: attachment.durationSeconds,
          tooLarge: attachment.tooLarge,
          transcript: attachment.transcript,
          transcriptStatus: attachment.transcriptStatus,
          transcriptError: attachment.transcriptError,
          // Dica para a UI decidir se oferece "ver midia": so falsa quando ja
          // se sabe de antemao que a midia e grande demais. Nao garante que o
          // download sob demanda vai ter sucesso — isso so a rota sabe.
          mediaAvailable: !attachment.tooLarge,
        }
      : null,
  };
}

function awaitingHumanDto(entry: ConversationAwaitingHuman) {
  return {
    conversationId: entry.conversationId,
    // Nome quando a conversa tem um, `null` quando nao. Telefone nao sai desta
    // rota em nenhuma forma — quem precisa identificar o contato abre a
    // conversa.
    contactName: entry.contactName,
    reason: entry.reason,
    openedAt: entry.openedAt.toISOString(),
  };
}

function knowledgeDocumentDto(document: KnowledgeDocumentRecord) {
  return {
    id: document.id,
    type: document.type,
    serviceId: document.serviceId,
    title: document.title,
    source: document.source,
    version: document.version,
    checksum: document.checksum,
    status: document.status,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function customerMemoryDto(memory: CustomerMemoryRecord) {
  return {
    id: memory.id,
    customerId: memory.customerId,
    kind: memory.kind,
    value: memory.value,
    origin: memory.origin,
    aiAllowed: memory.aiAllowed,
    confidence: memory.confidence,
    sourceConversationId: memory.sourceConversationId,
    sourceMessageIds: memory.sourceMessageIds,
    observedAt: memory.observedAt.toISOString(),
    lastReinforcedAt: memory.lastReinforcedAt?.toISOString() ?? null,
    supersededById: memory.supersededById,
    removedAt: memory.removedAt?.toISOString() ?? null,
    removedBy: memory.removedBy,
  };
}

function internalData<T>(request: FastifyRequest, data: T) {
  return { data, requestId: request.id };
}

async function resolveConversationHandoffs(
  prisma: PrismaClient,
  tenantId: string,
  conversationId: string,
): Promise<void> {
  await prisma.handoff.updateMany({
    where: { tenantId, conversationId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}

function contactNumber(value: string): string {
  const number = value.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (number.length < 6) {
    throw new AppError("Conversation contact is invalid.", {
      statusCode: 409,
      code: "INVALID_CONVERSATION_CONTACT",
    });
  }
  return number;
}

/** Remove aspas e quebras de linha do nome do arquivo antes de ir ao header. */
function sanitizeFileNameHeader(fileName: string): string {
  return fileName.replace(/["\r\n]/gu, "");
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

/**
 * Contexto de negócio recebido de chamador interno já autenticado.
 *
 * Os headers não autenticam: eles só são lidos depois de a credencial ter sido
 * verificada e o escopo concedido. O tenant precisa vir explícito — não existe
 * mais a inferência pela primeira associação ativa do usuário, que escolhia um
 * dono quando a associação era ambígua.
 */
function trustedTenantContext(request: FastifyRequest): {
  tenantId: string;
  userId: string;
} {
  const tenantId = stringHeader(request.headers["x-tenant-id"]);
  const userId = stringHeader(request.headers["x-user-id"]);
  if (!tenantId || !userId) {
    throw new AppError("Trusted tenant context is required.", {
      statusCode: 400,
      code: "TENANT_CONTEXT_REQUIRED",
    });
  }
  return { tenantId, userId };
}

function stringHeader(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Escopo exigido por operação interna.
 *
 * Provisionamento e comando comum são credenciais distintas: a credencial de
 * provisionamento não lista os escopos de conversa, e a de comando não lista
 * `channel:provision` nem `tenant-config:write`. Caminho sem escopo declarado
 * cai em `internal:unmapped`, que nenhuma credencial possui.
 */
export function requiredScope(request: FastifyRequest): InternalScope {
  const path = request.url.split("?")[0] ?? "";
  const method = request.method.toUpperCase();

  if (path === "/internal/channel-connections/evolution" && method === "PUT") {
    return "channel:provision";
  }
  // Derrubar o canal (Goal025/WU-02) e a outra ponta da mesma autoridade que o
  // provisiona: quem pode ligar o vinculo pode desliga-lo. Escopo novo aqui
  // exigiria credencial nova para uma operacao que a credencial de
  // provisionamento ja domina.
  if (
    path === "/internal/channel-connections/evolution" &&
    method === "DELETE"
  ) {
    return "channel:provision";
  }
  if (path === "/internal/ai-tenant-config" && method === "PUT") {
    return "tenant-config:write";
  }
  if (path === "/internal/ai-tenant-config" && method === "GET") {
    return "tenant-config:read";
  }
  if (path === "/internal/dashboard" && method === "GET") {
    return "dashboard:read";
  }
  if (path.startsWith("/internal/activation-test")) {
    return method === "GET" ? "activation-test:read" : "activation-test:write";
  }
  if (path.startsWith("/internal/knowledge/")) {
    return method === "GET" ? "knowledge:read" : "knowledge:write";
  }
  // Resumo antes da memoria: os dois caem sob `/internal/customers/`, e gerar
  // resumo e uma credencial propria, nao "escrever memoria".
  if (/^\/internal\/customers\/[^/]+\/summary$/u.test(path)) {
    if (method === "POST") return "customer-summary:write";
  }
  if (/^\/internal\/customers\/[^/]+\/memory(\/[^/]+)?$/u.test(path)) {
    return method === "GET" ? "customer-memory:read" : "customer-memory:write";
  }
  // Mesma decisao de leitura de conversas: quem esta aguardando humano e uma
  // projecao delas, nao uma decisao de escrita.
  if (path === "/internal/handoffs/awaiting-human" && method === "GET") {
    return "conversations:read";
  }
  if (path.startsWith("/internal/conversations")) {
    if (method === "GET") return "conversations:read";
    if (path.endsWith("/messages") && method === "POST") {
      return "messages:send";
    }
    if (method === "POST") return "conversations:write";
    // Categoria e ignore sao decisao sobre a conversa, no mesmo escopo de
    // takeover/release: `PUT` sem escopo declarado cairia em `internal:unmapped`.
    if (method === "PUT") return "conversations:write";
  }
  // Ignorar por telefone (Goal019/WU-07) e a mesma decisao de `ignore` por
  // conversa, so que sem conversa aberta ainda: mesmo escopo de escrita.
  if (path === "/internal/contacts/ignore" && method === "PUT") {
    return "conversations:write";
  }
  // Purga (Goal023) tem escopo proprio: apagar conteudo de cliente nao e
  // consequencia de poder escrever na conversa, e nenhuma credencial existente
  // passa a poder apagar sem que isto esteja escrito aqui.
  if (
    path === "/internal/retention/conversation-content" &&
    method === "POST"
  ) {
    return "retention:purge";
  }
  // Purga do negocio inteiro (Goal025/WU-05) tem escopo proprio, distinto de
  // `retention:purge`: apagar tudo do negocio nao e consequencia de poder
  // apagar so o conteudo de conversa.
  if (path === "/internal/retention/tenant" && method === "POST") {
    return "tenant:purge";
  }

  return "internal:unmapped";
}
