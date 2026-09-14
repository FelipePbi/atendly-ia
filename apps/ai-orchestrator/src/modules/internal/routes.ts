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
import { AssistantService } from "../assistant/assistant.service.js";
import { EvolutionProvider } from "../channel/adapters/evolution/EvolutionProvider.js";
import { ChannelConnectionService } from "../channel/ChannelConnectionService.js";
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
import { AssistantToolRegistry } from "../tools/assistant-tools.js";

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

const categoryOverrideSchema = z.object({
  category: z.enum(["COMMERCIAL", "UNCLASSIFIED", "PERSONAL"]).nullable(),
});

const ignoreContactSchema = z.object({ ignored: z.boolean() });

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
      new AssistantToolRegistry(prisma, new SchedulingClient(), undefined, app.log),
      undefined,
      customerMemoryService,
      new PGVectorKnowledgeStore(
        prisma,
        new OpenAIEmbeddingProvider(),
        env.KNOWLEDGE_SEARCH_MIN_SCORE,
      ),
    );
  const messageMedia =
    options.media ??
    new MessageMediaService(prisma, (channel) => {
      const credential = channelConnections.resolveChannelCredential(channel);
      return new EvolutionProvider(app.log, credential, channel.externalInstanceId);
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
    category: session?.category ?? "UNCLASSIFIED",
    categorySource: session?.categorySource ?? "AUTOMATIC",
    suggestedCategory: session?.suggestedCategory ?? null,
    // "Voce atendendo" x "IA atendendo": estado de atendimento, nao ciclo de
    // vida. Aberto ou lido nao muda nada disto.
    handling: humanHandling ? "HUMAN" : "AI",
    ignored: conversation.contact?.ignored ?? false,
    ignoredAt: conversation.contact?.ignoredAt?.toISOString() ?? null,
    aiPaused: conversation.contact?.aiPaused ?? false,
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
  if (path === "/internal/ai-tenant-config" && method === "PUT") {
    return "tenant-config:write";
  }
  if (path === "/internal/dashboard" && method === "GET") {
    return "dashboard:read";
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

  return "internal:unmapped";
}
