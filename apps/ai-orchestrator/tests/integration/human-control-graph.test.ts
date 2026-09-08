import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../src/config/env.js";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import { InboundMessageProcessor } from "../../src/modules/channel/InboundMessageProcessor.js";
import type { GraphRuntimePort } from "../../src/modules/graph/graph-runtime.js";
import { HandoffService } from "../../src/modules/handoff/HandoffService.js";
import { SessionService } from "../../src/modules/session/SessionService.js";

// Controle humano com HandoffService, SessionService e grafo reais contra
// PostgreSQL.
//
// A suíte anterior provava só o SessionService; o que prendia a conversa era a
// combinação dele com o espelho legado (`Conversation.humanHandoff`) lido pelo
// guard do grafo, então a prova precisa dos três juntos. Sem
// AI_TEST_DATABASE_URL a suíte é pulada, como as demais de integração.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT = "tenant-human-control";
const CHANNEL = "channel-human-control";
const CONVERSATION = "conversation-human-control";
const CONTACT = "5511966666666";

// Fronteira curta: a política é configurável e o teste exercita o limite dela.
const policy = { inactivitySeconds: 60 };

function baseMessage(
  overrides: Partial<ChannelInboundMessage> = {},
): ChannelInboundMessage {
  return {
    provider: "evolution-go",
    tenantId: TENANT,
    channelId: CHANNEL,
    userId: `user-${TENANT}`,
    requestId: "request-1",
    instanceId: `instance-${TENANT}`,
    messageId: `message-${Math.random().toString(16).slice(2)}`,
    chatId: `${CONTACT}@s.whatsapp.net`,
    customerPhone: CONTACT,
    customerName: "Maria",
    fromMe: false,
    isGroup: false,
    kind: "text",
    text: "Oi, quero agendar",
    raw: {},
    ...overrides,
  };
}

describe.skipIf(!databaseUrl)("human control across sessions against PostgreSQL", () => {
  let prisma: PrismaClient;
  let sessions: SessionService;
  let handoff: HandoffService;
  let processor: InboundMessageProcessor;
  let provider: { sendText: ReturnType<typeof vi.fn> };
  let automation: Record<string, ReturnType<typeof vi.fn>>;
  let botEnabled: boolean;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    botEnabled = env.EVOLUTION_BOT_ENABLED;
    env.EVOLUTION_BOT_ENABLED = true;

    await prisma.channelConnection.upsert({
      where: { tenantId_id: { tenantId: TENANT, id: CHANNEL } },
      update: {},
      create: {
        id: CHANNEL,
        tenantId: TENANT,
        userId: `user-${TENANT}`,
        provider: "EVOLUTION_GO",
        externalInstanceId: `instance-${TENANT}`,
      },
    });
    await prisma.conversation.upsert({
      where: {
        tenantId_channelId_id: {
          tenantId: TENANT,
          channelId: CHANNEL,
          id: CONVERSATION,
        },
      },
      update: {},
      create: {
        id: CONVERSATION,
        tenantId: TENANT,
        channelId: CHANNEL,
        externalContactId: CONTACT,
        state: {},
      },
    });
  });

  afterAll(async () => {
    env.EVOLUTION_BOT_ENABLED = botEnabled;
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.handoff.deleteMany({ where: { tenantId: TENANT } });
    await prisma.conversationSession.deleteMany({ where: { tenantId: TENANT } });
    await prisma.conversation.updateMany({
      where: { tenantId: TENANT },
      data: {
        contactId: null,
        humanHandoff: false,
        status: "ACTIVE",
        handoffPausedUntil: null,
        state: {},
      },
    });
    await prisma.contact.deleteMany({ where: { tenantId: TENANT } });

    sessions = new SessionService(prisma, policy);
    handoff = new HandoffService(
      prisma,
      { tenantId: TENANT, channelId: CHANNEL },
      sessions,
    );

    // Dobros do turno de IA: nenhum modelo, RAG ou transporte real é chamado.
    // O que está sob teste é a decisão do guard, não o conteúdo da resposta.
    let inboundCounter = 0;
    automation = {
      handleIncomingText: vi.fn(),
      markOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
      markOutboundDelivery: vi.fn().mockResolvedValue(undefined),
      recordManualOutboundText: vi.fn().mockResolvedValue({
        conversationId: CONVERSATION,
        messageRecordId: "manual-1",
      }),
      recordInboundText: vi.fn().mockImplementation(async () => {
        inboundCounter += 1;
        return {
          conversationId: CONVERSATION,
          messageRecordId: `inbound-${inboundCounter}`,
        };
      }),
      handleBufferedText: vi.fn(),
      prepareGraphTurn: vi.fn().mockResolvedValue({
        conversationId: CONVERSATION,
        tenantId: TENANT,
        channelId: CHANNEL,
      }),
      invokeGraphAgent: vi.fn().mockImplementation(async (session: unknown) => ({
        session,
        response: {
          id: "model-1",
          text: "ok",
          toolCalls: [],
          continuation: null,
        },
      })),
      executeGraphTools: vi.fn(),
      advanceGraphTurn: vi.fn(),
      completeGraphTurn: vi.fn().mockResolvedValue({
        text: "Resposta",
        conversationId: CONVERSATION,
        messageRecordId: "outbound-1",
      }),
      failGraphTurn: vi.fn().mockResolvedValue(undefined),
    };
    provider = {
      sendText: vi.fn().mockResolvedValue({
        provider: "evolution-go",
        messageId: "sent-1",
        raw: {},
      }),
    };
    const knowledge = {
      search: vi.fn().mockImplementation(() => {
        throw new Error("Knowledge retrieval must not run for blocked content.");
      }),
    };
    const runtime: GraphRuntimePort = {
      resolveConversationId: vi.fn().mockResolvedValue(CONVERSATION),
      loadTenantConfig: vi.fn().mockResolvedValue({
        channelConnected: true,
        tenantConfig: {
          aiEnabled: true,
          tone: "LIGHT_CLOSE",
          promptVersion: "scheduling_v1.0.0",
        },
      }),
      // Lê o estado persistido de verdade: é o espelho legado que o guard usa.
      loadConversation: vi.fn().mockImplementation(async () => {
        const row = await prisma.conversation.findUniqueOrThrow({
          where: { id: CONVERSATION },
        });
        return {
          status: row.status,
          humanHandoff: row.humanHandoff,
          externalContactId: row.externalContactId,
          contactId: row.contactId,
        };
      }),
      loadToolResults: vi.fn().mockResolvedValue([]),
    };

    processor = new InboundMessageProcessor(
      automation as never,
      provider as never,
      { remember: vi.fn().mockResolvedValue(true) },
      handoff,
      undefined,
      {
        debounce: false,
        runtime,
        knowledge: knowledge as never,
        outboundGate: {
          shouldCancel: vi.fn().mockResolvedValue(null),
          requestCancel: vi.fn().mockResolvedValue(undefined),
        },
        sessions,
      },
    );
  });

  /** Inatividade do contato, sem esperar o relógio real. */
  async function expireCurrentSession() {
    const { count } = await prisma.conversationSession.updateMany({
      where: { tenantId: TENANT, conversationId: CONVERSATION, endedAt: null },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    expect(count).toBeGreaterThan(0);
  }

  it("returns to the AI in a new session after a manual WhatsApp reply", async () => {
    await expect(processor.handleInboundMessage(baseMessage())).resolves
      .toMatchObject({ action: "replied" });

    await expect(
      processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "ja te respondo, viu" }),
      ),
    ).resolves.toMatchObject({ action: "manual_activity_recorded" });

    // Dentro da sessão o humano continua atendendo.
    await expect(processor.handleInboundMessage(baseMessage())).resolves
      .toMatchObject({ action: "paused_conversation" });

    await expireCurrentSession();

    await expect(processor.handleInboundMessage(baseMessage())).resolves
      .toMatchObject({ action: "replied" });
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: CONVERSATION },
    });
    expect(conversation.humanHandoff).toBe(false);
    expect(conversation.handoffPausedUntil).toBeNull();
  });

  it("returns to the AI in a new session after a panel takeover", async () => {
    await processor.handleInboundMessage(baseMessage());

    // Mesma escrita da rota `takeover`, agora sem o relógio do ano 9999.
    const takenOver = await sessions.resolveContext({
      tenantId: TENANT,
      channelId: CHANNEL,
      conversationId: CONVERSATION,
      externalContactId: CONTACT,
    });
    await prisma.conversation.update({
      where: { id: CONVERSATION },
      data: {
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        handoffPausedUntil: null,
      },
    });
    await sessions.assumeHumanControl({
      tenantId: TENANT,
      sessionId: takenOver.sessionId,
      source: "ATENDLY",
      actor: "owner",
    });

    await expect(processor.handleInboundMessage(baseMessage())).resolves
      .toMatchObject({ action: "paused_conversation" });

    await expireCurrentSession();

    await expect(processor.handleInboundMessage(baseMessage())).resolves
      .toMatchObject({ action: "replied" });
  });

  it("keeps /bot off paused after the session expires", async () => {
    await processor.handleInboundMessage(baseMessage());
    await expect(
      processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "/bot off" }),
      ),
    ).resolves.toMatchObject({ action: "bot_paused" });

    await expireCurrentSession();

    await expect(processor.handleInboundMessage(baseMessage())).resolves
      .toMatchObject({ action: "paused_conversation" });
    expect(provider.sendText).toHaveBeenCalledTimes(1);
  });

  it("keeps an ignored contact out of the AI after the session expires", async () => {
    await processor.handleInboundMessage(baseMessage());
    await sessions.setIgnored({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      ignored: true,
      actor: "owner",
    });

    await expireCurrentSession();

    await expect(processor.handleInboundMessage(baseMessage())).resolves
      .toMatchObject({ action: "ignored_contact" });
    // A mensagem continua persistida; só o processamento é que não acontece.
    expect(automation.recordInboundText).toHaveBeenCalledTimes(2);
    expect(automation.invokeGraphAgent).toHaveBeenCalledTimes(1);
  });

  it("gives the conversation back to the AI on /bot on after a manual reply", async () => {
    await processor.handleInboundMessage(baseMessage());
    await processor.handleInboundMessage(
      baseMessage({ fromMe: true, text: "ja te respondo, viu" }),
    );
    await expect(processor.handleInboundMessage(baseMessage())).resolves
      .toMatchObject({ action: "paused_conversation" });

    await expect(
      processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "/bot on" }),
      ),
    ).resolves.toMatchObject({ action: "bot_resumed" });

    const session = await sessions.currentSession(TENANT, CONVERSATION);
    expect(session?.humanHandling).toBe(false);
    expect(session?.contextResetAt).not.toBeNull();

    // Sem esperar a sessão expirar: `/bot on` é `Retomar IA` na sessão vigente.
    await expect(processor.handleInboundMessage(baseMessage())).resolves
      .toMatchObject({ action: "replied" });
  });
});
