/**
 * Roteamento por kind para imagem, documento, video e sticker (Goal013/WU-04).
 *
 * Antes deste Goal, toda midia nao textual caia na mesma resposta generica.
 * Estes testes provam a divisao por kind: imagem com IA elegivel vira handoff
 * deterministico sem chamar o modelo e sem interpretar a legenda; documento e
 * video confirmam o recebimento sem modelo nem handoff, mas a legenda do
 * documento segue como texto normal do contato; sticker, GIF e kind
 * desconhecido nao respondem, nao renovam sessao e nao geram handoff.
 */
import { describe, expect, it, vi } from "vitest";

import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import { InboundMessageProcessor } from "../../src/modules/channel/InboundMessageProcessor.js";
import type { GraphRuntimePort } from "../../src/modules/graph/graph-runtime.js";
import type { SessionSnapshot } from "../../src/modules/session/SessionService.js";

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
    text: "Oi, quero agendar",
    raw: {},
    ...overrides,
  };
}

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    contactId: "contact-1",
    sessionId: "session-1",
    externalContactId: "5511999999999",
    ignored: false,
    aiPaused: false,
    category: "UNCLASSIFIED",
    categorySource: "AUTOMATIC",
    humanHandling: false,
    inboundVersion: 4,
    startedAt: new Date("2026-09-13T10:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-09-14T10:00:00.000Z").toISOString(),
    contextResetAt: null,
    ...overrides,
  };
}

function buildSubject(options: { session?: SessionSnapshot } = {}) {
  let inboundCounter = 0;
  const automation = {
    handleIncomingText: vi.fn(),
    markOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
    markOutboundDelivery: vi.fn().mockResolvedValue(undefined),
    recordManualOutboundText: vi.fn().mockResolvedValue({
      conversationId: "conversation-1",
      messageRecordId: "manual-1",
    }),
    recordInboundText: vi.fn().mockImplementation(async () => {
      inboundCounter += 1;
      return {
        conversationId: "conversation-1",
        messageRecordId: `inbound-${inboundCounter}`,
      };
    }),
    handleBufferedText: vi.fn(),
    prepareGraphTurn: vi.fn().mockResolvedValue({
      conversationId: "conversation-1",
      tenantId: "tenant-1",
      channelId: "channel-1",
    }),
    invokeGraphAgent: vi.fn().mockImplementation(async (session: unknown) => ({
      session,
      response: { id: "model-1", text: "ok", toolCalls: [], continuation: null },
    })),
    executeGraphTools: vi.fn(),
    advanceGraphTurn: vi.fn(),
    completeGraphTurn: vi.fn().mockResolvedValue({
      text: "Resposta",
      conversationId: "conversation-1",
      messageRecordId: "outbound-1",
    }),
    failGraphTurn: vi.fn().mockResolvedValue(undefined),
  };
  const knowledge = { search: vi.fn().mockResolvedValue([]) };
  const provider = {
    sendText: vi.fn().mockResolvedValue({
      provider: "evolution-go",
      messageId: "sent-1",
      raw: {},
    }),
  };
  const idempotency = { remember: vi.fn().mockResolvedValue(true) };
  const handoff = {
    isBotPaused: vi.fn().mockResolvedValue(false),
    isBotOutboundMessage: vi.fn().mockResolvedValue(false),
    getBotPauseContext: vi.fn().mockResolvedValue(null),
    pauseForHuman: vi.fn().mockResolvedValue(undefined),
    pauseIndefinitely: vi.fn().mockResolvedValue(undefined),
    resumeBot: vi.fn().mockResolvedValue(undefined),
  };
  const current = options.session ?? snapshot();
  const sessions = {
    resolveContext: vi.fn().mockResolvedValue(current),
    recordContactMessage: vi.fn().mockResolvedValue(current),
    evaluate: vi.fn().mockResolvedValue({ reason: null }),
    assumeHumanControl: vi.fn().mockResolvedValue(current),
    setContactAiPaused: vi.fn().mockResolvedValue(undefined),
    releaseToAi: vi.fn().mockResolvedValue({ ...current, humanHandling: false }),
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
    }),
    loadToolResults: vi.fn().mockResolvedValue([]),
  };

  return {
    automation,
    knowledge,
    provider,
    idempotency,
    handoff,
    sessions,
    processor: new InboundMessageProcessor(
      automation as never,
      provider,
      idempotency,
      handoff,
      undefined,
      {
        debounce: false,
        runtime,
        knowledge: knowledge as never,
        sessions,
      },
    ),
  };
}

describe("imagem: handoff deterministico sem modelo", () => {
  it("gera handoff com reason proprio e resposta fixa, sem chamar o modelo", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ kind: "image", text: undefined }),
      ),
    ).resolves.toMatchObject({ action: "unsupported_handoff" });

    expect(subject.handoff.pauseIndefinitely).toHaveBeenCalledWith(
      "5511999999999",
      "image_received",
      expect.any(String),
    );
    expect(subject.provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "5511999999999",
        text: expect.stringContaining("imagem"),
      }),
    );
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.automation.handleIncomingText).not.toHaveBeenCalled();
  });

  it("nao interpreta a legenda da imagem como pedido", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({
          kind: "image",
          text: "quero agendar amanha as 10h, é urgente",
        }),
      ),
    ).resolves.toMatchObject({ action: "unsupported_handoff" });

    expect(subject.handoff.pauseIndefinitely).toHaveBeenCalledWith(
      "5511999999999",
      "image_received",
      expect.any(String),
    );
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.automation.handleIncomingText).not.toHaveBeenCalled();
  });

  it("em atendimento humano so persiste a imagem, sem handoff nem resposta", async () => {
    const subject = buildSubject({
      session: snapshot({ humanHandling: true }),
    });

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ kind: "image", text: undefined }),
      ),
    ).resolves.toMatchObject({ action: "paused_conversation" });

    expect(subject.handoff.pauseIndefinitely).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("contato ignorado persiste a imagem sem handoff nem resposta", async () => {
    const subject = buildSubject({ session: snapshot({ ignored: true }) });

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ kind: "image", text: undefined }),
      ),
    ).resolves.toMatchObject({ action: "ignored_contact" });

    expect(subject.handoff.pauseIndefinitely).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });
});

describe("documento: aparece sem interpretacao", () => {
  it("sem legenda responde com confirmacao fixa e nao chama o modelo", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ kind: "document", text: undefined }),
      ),
    ).resolves.toMatchObject({ action: "unsupported_message" });

    expect(subject.provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("documento") }),
    );
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.handoff.pauseIndefinitely).not.toHaveBeenCalled();
  });

  it("legenda vira texto do contato e o arquivo fica fora do modelo", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({
          kind: "document",
          text: "quanto custa o servico de manutencao?",
        }),
      ),
    ).resolves.toMatchObject({ action: "replied" });

    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "quanto custa o servico de manutencao?",
      }),
    );
  });
});

describe("video: aparece sem interpretacao", () => {
  it("responde com confirmacao fixa e nao chama o modelo, mesmo com legenda", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ kind: "video", text: "olha esse video" }),
      ),
    ).resolves.toMatchObject({ action: "unsupported_message" });

    expect(subject.provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("video") }),
    );
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.handoff.pauseIndefinitely).not.toHaveBeenCalled();
  });
});

describe("gif: video que nao decide nada", () => {
  it("persiste sem resposta, sem handoff e sem renovar sessao", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({
          kind: "video",
          text: undefined,
          media: {
            mimetype: "video/mp4",
            hasBase64: true,
            hasMediaUrl: false,
            tooLarge: false,
            gifPlayback: true,
          },
        }),
      ),
    ).resolves.toMatchObject({ action: "unsupported_media_kind" });

    expect(subject.provider.sendText).not.toHaveBeenCalled();
    expect(subject.handoff.pauseIndefinitely).not.toHaveBeenCalled();
    expect(subject.sessions.recordContactMessage).not.toHaveBeenCalled();
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    // Persistido como qualquer outra mensagem do contato: o que muda e a
    // decisao, nao a visibilidade na inbox.
    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(1);
  });

  it("video comum (sem gifPlayback) continua confirmando o recebimento", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({
          kind: "video",
          text: undefined,
          media: {
            mimetype: "video/mp4",
            hasBase64: true,
            hasMediaUrl: false,
            tooLarge: false,
          },
        }),
      ),
    ).resolves.toMatchObject({ action: "unsupported_message" });

    expect(subject.provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("video") }),
    );
    expect(subject.sessions.recordContactMessage).toHaveBeenCalled();
  });
});

describe("sticker e kind desconhecido: nao decidem nada", () => {
  it.each(["sticker", "unknown"] as const)(
    "persiste sem handoff, sem resposta e sem renovar sessao para kind %s",
    async (kind) => {
      const subject = buildSubject();

      await expect(
        subject.processor.handleInboundMessage(
          baseMessage({ kind, text: undefined }),
        ),
      ).resolves.toMatchObject({ action: "unsupported_media_kind" });

      expect(subject.handoff.pauseIndefinitely).not.toHaveBeenCalled();
      expect(subject.provider.sendText).not.toHaveBeenCalled();
      expect(subject.sessions.recordContactMessage).not.toHaveBeenCalled();
      expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    },
  );
});
