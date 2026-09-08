import { describe, expect, it, vi } from "vitest";

import { env } from "../../src/config/env.js";
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
    startedAt: new Date("2026-09-07T10:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-09-08T10:00:00.000Z").toISOString(),
    contextResetAt: null,
    ...overrides,
  };
}

/**
 * Dobros do turno da IA.
 *
 * `prepareGraphTurn` e a porta da leitura de conteudo — memoria, prompt e
 * historico —, `invokeGraphAgent` e o modelo e `knowledge.search` e o
 * RAG/embedding. Todos falham se chamados quando o conteudo nao podia ser
 * lido, entao "nao processou" nao pode passar por engano.
 */
function buildSubject(
  options: {
    session?: SessionSnapshot;
    evaluate?: { reason: string | null };
    aiEnabled?: boolean;
    channelConnected?: boolean;
    withSessions?: boolean;
  } = {},
) {
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
  const knowledge = {
    search: vi.fn().mockImplementation(() => {
      throw new Error("Knowledge retrieval must not run for blocked content.");
    }),
  };
  const provider = { sendText: vi.fn().mockResolvedValue({
    provider: "evolution-go",
    messageId: "sent-1",
    raw: {},
  }) };
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
    evaluate: vi.fn().mockResolvedValue(options.evaluate ?? { reason: null }),
    assumeHumanControl: vi.fn().mockResolvedValue(current),
    setContactAiPaused: vi.fn().mockResolvedValue(undefined),
    releaseToAi: vi
      .fn()
      .mockResolvedValue({ ...current, humanHandling: false }),
  };
  const outboundGate = {
    shouldCancel: vi.fn().mockResolvedValue(null),
    requestCancel: vi.fn().mockResolvedValue(undefined),
  };
  const runtime: GraphRuntimePort = {
    resolveConversationId: vi.fn().mockResolvedValue("conversation-1"),
    loadTenantConfig: vi.fn().mockResolvedValue({
      channelConnected: options.channelConnected ?? true,
      tenantConfig: {
        aiEnabled: options.aiEnabled ?? true,
        tone: "LIGHT_CLOSE",
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
    outboundGate,
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
        outboundGate,
        sessions: options.withSessions === false ? undefined : sessions,
      },
    ),
  };
}

describe("inbox independente do processamento", () => {
  it("persiste a mensagem do cliente com a IA desligada", async () => {
    const subject = buildSubject({ aiEnabled: false });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "bot_disabled" });

    // A inbox nao depende da decisao: a mensagem existe antes dela.
    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(1);
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("persiste a mensagem do cliente com o canal desconectado", async () => {
    const subject = buildSubject({ channelConnected: false });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "channel_disconnected" });

    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(1);
    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
  });

  it("persiste a mensagem do cliente com a conversa em atendimento humano", async () => {
    const subject = buildSubject({
      session: snapshot({ humanHandling: true }),
    });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "paused_conversation" });

    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(1);
    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("persiste a mensagem de contato ignorado sem deixar o conteudo chegar a IA", async () => {
    const subject = buildSubject({ session: snapshot({ ignored: true }) });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "ignored_contact" });

    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(1);
    // Nada de classificacao, modelo, RAG, embedding nem memoria.
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.knowledge.search).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("persiste a mensagem de sessao pessoal sem deixar o conteudo chegar a IA", async () => {
    const subject = buildSubject({ session: snapshot({ category: "PERSONAL" }) });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "personal_session" });

    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(1);
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.knowledge.search).not.toHaveBeenCalled();
  });

  it("nao processa nem persiste mensagem de grupo", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(baseMessage({ isGroup: true })),
    ).resolves.toMatchObject({ action: "ignored_group" });

    expect(subject.automation.recordInboundText).not.toHaveBeenCalled();
    expect(subject.idempotency.remember).not.toHaveBeenCalled();
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
  });

  it("responde normalmente quando a sessao esta elegivel", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "replied" });

    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(1);
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
  });
});

describe("controle humano deterministico", () => {
  it("mensagem manual do dono pelo WhatsApp assume a sessao e cancela a saida pendente", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "ja te respondo, viu" }),
      ),
    ).resolves.toMatchObject({ action: "manual_activity_recorded" });

    expect(subject.sessions.assumeHumanControl).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1", source: "WHATSAPP" }),
    );
    expect(subject.outboundGate.requestCancel).toHaveBeenCalledWith(
      "human_took_over_the_session",
    );
    // Nenhuma mensagem automatica anuncia a troca para o cliente.
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("nao envia a resposta automatica quando o humano assumiu durante o turno", async () => {
    const subject = buildSubject({
      evaluate: { reason: "human_handling" },
    });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "superseded" });

    expect(subject.automation.completeGraphTurn).toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
    expect(subject.automation.markOutboundDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "FAILED",
        detail: "human_handling",
      }),
    );
  });

  it("descarta a saida quando o cliente falou de novo desde o inicio do turno", async () => {
    const subject = buildSubject({ evaluate: { reason: "input_superseded" } });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "superseded" });

    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("nao envia quando o contato foi ignorado durante o turno", async () => {
    const subject = buildSubject({ evaluate: { reason: "contact_ignored" } });

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "superseded" });

    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("comandos do WhatsApp continuam funcionando e marcam a pausa no contato", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "/bot off" }),
      ),
    ).resolves.toMatchObject({ action: "bot_paused" });

    expect(subject.handoff.pauseIndefinitely).toHaveBeenCalled();
    expect(subject.sessions.setContactAiPaused).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "contact-1", paused: true }),
    );
    expect(subject.automation.recordManualOutboundText).not.toHaveBeenCalled();
  });

  it("/bot on devolve a sessao a IA, nao so a pausa do contato", async () => {
    // Depois de uma resposta manual, `humanHandling` fica verdadeiro na sessao:
    // limpar so `aiPaused` deixava a conversa presa em atendimento humano.
    const subject = buildSubject({ session: snapshot({ humanHandling: true }) });

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "/bot on" }),
      ),
    ).resolves.toMatchObject({ action: "bot_resumed" });

    expect(subject.handoff.resumeBot).toHaveBeenCalledWith("5511999999999");
    expect(subject.sessions.releaseToAi).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conversation-1" }),
    );
  });

  it("/bot on ainda limpa a pausa do contato quando nao ha sessao vigente", async () => {
    const subject = buildSubject();
    subject.sessions.releaseToAi.mockResolvedValue(null);

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "/bot on" }),
      ),
    ).resolves.toMatchObject({ action: "bot_resumed" });

    expect(subject.sessions.setContactAiPaused).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "contact-1", paused: false }),
    );
  });

  it("passa a marca de reavaliacao de contexto para o turno seguinte", async () => {
    const contextResetAt = new Date("2026-09-07T12:00:00.000Z").toISOString();
    const subject = buildSubject({ session: snapshot({ contextResetAt }) });

    await subject.processor.handleInboundMessage(baseMessage());

    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledWith(
      expect.objectContaining({ contextSince: contextResetAt }),
    );
  });

  it("mantem a politica anterior quando a porta de sessao nao esta ligada", async () => {
    const subject = buildSubject({ withSessions: false });
    subject.handoff.isBotPaused.mockResolvedValue(true);

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({ action: "paused_conversation" });

    expect(subject.sessions.resolveContext).not.toHaveBeenCalled();
    // Mesmo sem a porta de sessao a mensagem continua sendo persistida.
    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(1);
  });

  it("ignora grupos apenas enquanto a configuracao mandar", async () => {
    const original = env.EVOLUTION_IGNORE_GROUPS;
    env.EVOLUTION_IGNORE_GROUPS = true;
    try {
      const subject = buildSubject();
      await expect(
        subject.processor.handleInboundMessage(baseMessage({ isGroup: true })),
      ).resolves.toMatchObject({ action: "ignored_group" });
    } finally {
      env.EVOLUTION_IGNORE_GROUPS = original;
    }
  });
});
