import { describe, expect, it, vi } from "vitest";

import { env } from "../../src/config/env.js";
import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import { InboundMessageProcessor } from "../../src/modules/channel/InboundMessageProcessor.js";
import type { GraphRuntimePort } from "../../src/modules/graph/graph-runtime.js";
import { PrismaGraphRuntime } from "../../src/modules/graph/graph-runtime.js";
import type {
  KnowledgeSearchInput,
  KnowledgeSearchResult,
} from "../../src/modules/knowledge/knowledge-vector-store.js";

function baseMessage(
  overrides: Partial<ChannelInboundMessage> = {},
): ChannelInboundMessage {
  return {
    provider: "evolution-go",
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    instanceId: "instance-1",
    messageId: "message-1",
    chatId: "5511999999999@s.whatsapp.net",
    customerPhone: "5511999999999",
    customerName: "Maria",
    fromMe: false,
    isGroup: false,
    kind: "text",
    text: "Tenho uma duvida sobre cuidado apos o procedimento",
    raw: {},
    ...overrides,
  };
}

/**
 * Dublê de banco só com o que `loadConversation` lê: sem coluna vetorial nem
 * demais tabelas, porque essa é a única superfície que a resolução do
 * servico em foco toca.
 */
function fakePrismaWithConversationState(state: unknown) {
  return {
    conversation: {
      findUnique: vi.fn().mockResolvedValue({
        status: "ACTIVE",
        humanHandoff: false,
        externalContactId: "5511999999999",
        contactId: "contact-1",
        state,
      }),
    },
  };
}

describe("PrismaGraphRuntime.loadConversation: servico em foco nunca vem de texto livre", () => {
  it("le o servico do rascunho de agendamento (appointmentDraft.services)", async () => {
    const runtime = new PrismaGraphRuntime(
      fakePrismaWithConversationState({
        appointmentDraft: {
          services: [{ serviceId: "service-1" }, { serviceId: 2 }],
          status: "draft",
        },
      }) as never,
    );

    const conversation = await runtime.loadConversation({
      tenantId: "tenant-1",
      channelId: "channel-1",
      conversationId: "conversation-1",
    });

    expect(conversation.focusServiceIds).toEqual(["service-1", "2"]);
  });

  it("le o servico da acao pendente (pendingAction.serviceId e serviceIds)", async () => {
    const runtime = new PrismaGraphRuntime(
      fakePrismaWithConversationState({
        pendingAction: { serviceId: "service-9", serviceIds: ["service-9", "service-10"] },
      }) as never,
    );

    const conversation = await runtime.loadConversation({
      tenantId: "tenant-1",
      channelId: "channel-1",
      conversationId: "conversation-1",
    });

    expect(conversation.focusServiceIds).toEqual(["service-9", "service-10"]);
  });

  it("sem rascunho nem acao pendente, nao ha servico em foco", async () => {
    const runtime = new PrismaGraphRuntime(
      fakePrismaWithConversationState(null) as never,
    );

    const conversation = await runtime.loadConversation({
      tenantId: "tenant-1",
      channelId: "channel-1",
      conversationId: "conversation-1",
    });

    expect(conversation.focusServiceIds).toEqual([]);
  });
});

/**
 * Dublê do store: aplica o mesmo contrato de `PGVectorKnowledgeStore.search`
 * (tenant + ACTIVE implicito no catalogo, servico geral ou em foco, servico
 * em foco antes dos gerais) contra um catalogo fixo em memoria, sem precisar
 * de Postgres/pgvector.
 */
function fakeKnowledgeStore(catalog: Array<KnowledgeSearchResult & { tenantId: string }>) {
  const search = vi.fn(async (input: KnowledgeSearchInput) => {
    const focusServiceIds = input.focusServiceIds ?? [];
    return catalog
      .filter((doc) => doc.tenantId === input.tenantId)
      .filter(
        (doc) => doc.serviceId === null || focusServiceIds.includes(doc.serviceId),
      )
      .sort((a, b) => Number(b.serviceId !== null) - Number(a.serviceId !== null));
  });
  return { search };
}

describe("retrieveKnowledge do grafo: filtro por tenant e servico em foco com store dublê", () => {
  it("passa o tenant e o servico em foco lidos da conversa para o store, que devolve o servico em foco antes do geral e nunca de outro servico", async () => {
    const catalog: Array<KnowledgeSearchResult & { tenantId: string }> = [
      {
        tenantId: "tenant-1",
        documentId: "doc-general",
        chunkId: "chunk-general",
        type: "FAQ",
        serviceId: null,
        title: "FAQ geral",
        source: "faq/geral",
        version: "1",
        content: "Resposta geral.",
        metadata: null,
        score: 0.9,
      },
      {
        tenantId: "tenant-1",
        documentId: "doc-focus-service",
        chunkId: "chunk-focus-service",
        type: "FAQ",
        serviceId: "service-1",
        title: "FAQ do servico em foco",
        source: "faq/service-1",
        version: "1",
        content: "Resposta do servico em foco.",
        metadata: null,
        score: 0.7,
      },
      {
        tenantId: "tenant-1",
        documentId: "doc-other-service",
        chunkId: "chunk-other-service",
        type: "FAQ",
        serviceId: "service-2",
        title: "FAQ de outro servico",
        source: "faq/service-2",
        version: "1",
        content: "Nao deve aparecer.",
        metadata: null,
        score: 0.95,
      },
      {
        tenantId: "tenant-2",
        documentId: "doc-other-tenant",
        chunkId: "chunk-other-tenant",
        type: "FAQ",
        serviceId: null,
        title: "FAQ de outro tenant",
        source: "faq/tenant-2",
        version: "1",
        content: "Nao deve aparecer.",
        metadata: null,
        score: 0.99,
      },
    ];
    const knowledge = fakeKnowledgeStore(catalog);
    const automation = {
      handleIncomingText: vi.fn().mockResolvedValue({
        text: "ok",
        conversationId: "conversation-1",
        messageRecordId: "outbound-1",
      }),
      markOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
      recordManualOutboundText: vi.fn(),
      recordInboundText: vi.fn().mockResolvedValue({
        conversationId: "conversation-1",
        messageRecordId: "inbound-1",
      }),
    };
    const provider = {
      sendText: vi
        .fn()
        .mockResolvedValue({ provider: "evolution-go", messageId: "sent-1", raw: {} }),
    };
    const idempotency = { remember: vi.fn().mockResolvedValue(true) };
    const handoff = {
      isBotPaused: vi.fn().mockResolvedValue(false),
      isBotOutboundMessage: vi.fn().mockResolvedValue(false),
      pauseForHuman: vi.fn().mockResolvedValue(undefined),
      pauseIndefinitely: vi.fn().mockResolvedValue(undefined),
      resumeBot: vi.fn().mockResolvedValue(undefined),
    };
    const runtime: GraphRuntimePort = {
      resolveConversationId: vi.fn().mockResolvedValue("conversation-1"),
      loadTenantConfig: vi.fn().mockResolvedValue({
        channelConnected: true,
        tenantConfig: {
          aiEnabled: true,
          tone: "BALANCED",
          promptVersion: "scheduling_v1.0.0",
        },
      }),
      loadConversation: vi.fn().mockResolvedValue({
        status: "ACTIVE",
        humanHandoff: false,
        externalContactId: "5511999999999",
        contactId: "contact-1",
        focusServiceIds: ["service-1"],
      }),
      loadToolResults: vi.fn().mockResolvedValue([]),
    };

    const processor = new InboundMessageProcessor(
      automation,
      provider,
      idempotency,
      handoff,
      undefined,
      { debounce: false, runtime, knowledge: knowledge as never },
    );

    await processor.handleInboundMessage(baseMessage());

    expect(knowledge.search).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        limit: env.KNOWLEDGE_SEARCH_LIMIT,
        focusServiceIds: ["service-1"],
      }),
    );

    const results = await knowledge.search({
      tenantId: "tenant-1",
      query: "duvida sobre cuidado",
      limit: env.KNOWLEDGE_SEARCH_LIMIT,
      focusServiceIds: ["service-1"],
    });
    expect(results.map((result) => result.documentId)).toEqual([
      "doc-focus-service",
      "doc-general",
    ]);
  });
});
