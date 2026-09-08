import { describe, expect, it, vi } from "vitest";

import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import { InboundMessageProcessor } from "../../src/modules/channel/InboundMessageProcessor.js";
import type { GraphRuntimePort } from "../../src/modules/graph/graph-runtime.js";
import { HandoffService } from "../../src/modules/handoff/HandoffService.js";
import { SessionService } from "../../src/modules/session/SessionService.js";
import { createFakePrisma } from "./support/fake-prisma.js";

/**
 * Controle humano atravessando a troca de sessao.
 *
 * `HandoffService`, `SessionService` e o grafo reais sobre um Prisma em
 * memoria: o ponto do teste e a interacao entre a sessao e o espelho legado
 * (`Conversation.humanHandoff`), que sozinho prendia a conversa em
 * `paused_conversation` para sempre depois de um atendimento humano.
 *
 * O que sobrevive a troca de sessao — `/bot off`, `/ia_pause` e contato
 * ignorado — continua sobrevivendo.
 */

const TENANT = "tenant-1";
const CHANNEL = "channel-1";
const CONVERSATION = "conversation-1";
const CONTACT_PHONE = "5511999999999";

function baseMessage(
  overrides: Partial<ChannelInboundMessage> = {},
): ChannelInboundMessage {
  return {
    provider: "evolution-go",
    tenantId: TENANT,
    channelId: CHANNEL,
    userId: "user-1",
    requestId: "request-1",
    instanceId: "instance-1",
    messageId: `message-${Math.random().toString(16).slice(2)}`,
    chatId: `${CONTACT_PHONE}@s.whatsapp.net`,
    customerPhone: CONTACT_PHONE,
    customerName: "Maria",
    fromMe: false,
    isGroup: false,
    kind: "text",
    text: "Oi, quero agendar",
    raw: {},
    ...overrides,
  };
}

function buildSubject() {
  const { store, prisma } = createFakePrisma();
  const sessions = new SessionService(prisma, { inactivitySeconds: 60 });
  const handoff = new HandoffService(
    prisma,
    { tenantId: TENANT, channelId: CHANNEL },
    sessions,
  );

  store.conversation.rows.push({
    id: CONVERSATION,
    tenantId: TENANT,
    channelId: CHANNEL,
    externalContactId: CONTACT_PHONE,
    customerName: "Maria",
    status: "ACTIVE",
    humanHandoff: false,
    handoffPausedUntil: null,
    contactId: null,
    state: {},
  });

  let inboundCounter = 0;
  const automation = {
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
      response: { id: "model-1", text: "ok", toolCalls: [], continuation: null },
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
  const knowledge = {
    search: vi.fn().mockImplementation(() => {
      throw new Error("Knowledge retrieval must not run for blocked content.");
    }),
  };
  const provider = {
    sendText: vi
      .fn()
      .mockResolvedValue({ provider: "evolution-go", messageId: "sent-1", raw: {} }),
  };
  const idempotency = { remember: vi.fn().mockResolvedValue(true) };
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
    // Le o estado real gravado pelo espelho legado, como o runtime faz.
    loadConversation: vi.fn().mockImplementation(async () => {
      const row = store.conversation.rows[0] as Record<string, unknown>;
      return {
        status: row.status,
        humanHandoff: row.humanHandoff,
        externalContactId: row.externalContactId,
        contactId: row.contactId,
      };
    }),
    loadToolResults: vi.fn().mockResolvedValue([]),
  };
  const outboundGate = {
    shouldCancel: vi.fn().mockResolvedValue(null),
    requestCancel: vi.fn().mockResolvedValue(undefined),
  };

  return {
    store,
    prisma,
    sessions,
    handoff,
    automation,
    provider,
    processor: new InboundMessageProcessor(
      automation as never,
      provider as never,
      idempotency,
      handoff,
      undefined,
      {
        debounce: false,
        runtime,
        knowledge: knowledge as never,
        outboundGate,
        sessions,
      },
    ),
  };
}

/** Inatividade do contato: a sessao vigente vence sem ninguem tocar nela. */
function expireCurrentSession(store: ReturnType<typeof buildSubject>["store"]) {
  const rows = store.conversationSession.rows as Array<Record<string, unknown>>;
  const open = rows.filter((row) => row.endedAt === null);
  expect(open.length).toBeGreaterThan(0);
  for (const row of open) {
    row.expiresAt = new Date(Date.now() - 60_000);
  }
}

function conversationRow(store: ReturnType<typeof buildSubject>["store"]) {
  return store.conversation.rows[0] as Record<string, unknown>;
}

describe("controle humano entre sessoes", () => {
  it("a IA volta na sessao nova depois de uma resposta manual pelo WhatsApp", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "replied" });

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "ja te respondo, viu" }),
      ),
    ).resolves.toMatchObject({ action: "manual_activity_recorded" });

    // Dentro da sessao o humano continua atendendo.
    expect(conversationRow(subject.store).humanHandoff).toBe(true);
    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "paused_conversation" });

    expireCurrentSession(subject.store);

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "replied" });
    // O espelho legado acompanhou a sessao nova.
    expect(conversationRow(subject.store).humanHandoff).toBe(false);
    expect(conversationRow(subject.store).handoffPausedUntil).toBe(null);
  });

  it("a IA volta na sessao nova depois do takeover pelo painel", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "replied" });

    // Mesma escrita da rota `takeover`, agora sem o relogio do ano 9999.
    const takenOver = await subject.sessions.resolveContext({
      tenantId: TENANT,
      channelId: CHANNEL,
      conversationId: CONVERSATION,
      externalContactId: CONTACT_PHONE,
    });
    await subject.prisma.conversation.update({
      where: { id: CONVERSATION },
      data: {
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        handoffPausedUntil: null,
      },
    });
    await subject.sessions.assumeHumanControl({
      tenantId: TENANT,
      sessionId: takenOver.sessionId,
      source: "ATENDLY",
      actor: "user-1",
    });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "paused_conversation" });

    expireCurrentSession(subject.store);

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "replied" });
  });

  it("/bot off continua valendo depois de a sessao expirar", async () => {
    const subject = buildSubject();

    await subject.processor.handleInboundMessage(baseMessage());
    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "/bot off" }),
      ),
    ).resolves.toMatchObject({ action: "bot_paused" });

    expireCurrentSession(subject.store);

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "paused_conversation" });
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
    expect(conversationRow(subject.store).humanHandoff).toBe(true);
  });

  it("contato ignorado continua ignorado depois de a sessao expirar", async () => {
    const subject = buildSubject();

    await subject.processor.handleInboundMessage(baseMessage());
    await subject.sessions.setIgnored({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      ignored: true,
      actor: "user-1",
    });

    expireCurrentSession(subject.store);

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "ignored_contact" });
    // A mensagem continua persistida, mas nao chega ao modelo.
    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(2);
    expect(subject.automation.invokeGraphAgent).toHaveBeenCalledTimes(1);
  });

  it("/bot on devolve a conversa a IA depois de uma resposta manual", async () => {
    const subject = buildSubject();

    await subject.processor.handleInboundMessage(baseMessage());
    await subject.processor.handleInboundMessage(
      baseMessage({ fromMe: true, text: "ja te respondo, viu" }),
    );
    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "paused_conversation" });

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "/bot on" }),
      ),
    ).resolves.toMatchObject({ action: "bot_resumed" });

    // Sem esperar a sessao expirar: `/bot on` e `Retomar IA` na sessao vigente.
    const session = await subject.sessions.currentSession(TENANT, CONVERSATION);
    expect(session?.humanHandling).toBe(false);
    expect(session?.contextResetAt).not.toBe(null);

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "replied" });
  });
});
