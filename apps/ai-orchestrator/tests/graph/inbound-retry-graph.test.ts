/**
 * Retry de lote com a resposta já gravada, no processador e no grafo
 * (validação de 2026-10-11/12).
 *
 * "Queria marcar um horario" fez a IA chamar quatro ferramentas; o grafo
 * estourou o limite de passos do LangGraph **depois** de gravar a resposta, e
 * o retry do lote tentava gravar de novo a mensagem já salva: "Unique
 * constraint failed" em todo retry, e a IA parou de responder a conversa.
 * `tests/assistant/inbound-retry.test.ts` cobre o `AssistantService`
 * (`recordInboundText` devolve `alreadyAnswered`); aqui fica a outra metade:
 * com `alreadyAnswered`, o nó `recordInbound` e `handleInboundBatch` terminam
 * em `duplicate`, sem rodar o turno nem mandar nada de novo à cliente.
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
    text: "Queria marcar um horario",
    raw: {},
    ...overrides,
  };
}

const session: SessionSnapshot = {
  contactId: "contact-1",
  sessionId: "session-1",
  externalContactId: "5511999999999",
  ignored: false,
  aiPaused: false,
  category: "UNCLASSIFIED",
  categorySource: "AUTOMATIC",
  humanHandling: false,
  inboundVersion: 4,
  startedAt: new Date("2026-10-11T10:00:00.000Z").toISOString(),
  expiresAt: new Date("2026-10-12T10:00:00.000Z").toISOString(),
  contextResetAt: null,
};

/**
 * `answered`: ids externos (`messageId`) cuja mensagem o retry encontra já
 * gravada **e** já respondida pela IA.
 */
function buildSubject(answered: string[]) {
  const automation = {
    handleIncomingText: vi.fn(),
    markOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
    markOutboundDelivery: vi.fn().mockResolvedValue(undefined),
    recordManualOutboundText: vi.fn(),
    recordInboundText: vi.fn().mockImplementation(
      async (input: { channelMessage: ChannelInboundMessage }) => ({
        conversationId: "conversation-1",
        messageRecordId: `inbound-${input.channelMessage.messageId}`,
        ...(answered.includes(input.channelMessage.messageId)
          ? { alreadyAnswered: true }
          : {}),
      }),
    ),
    handleBufferedText: vi.fn(),
    prepareGraphTurn: vi.fn().mockResolvedValue({
      conversationId: "conversation-1",
      tenantId: "tenant-1",
      channelId: "channel-1",
    }),
    invokeGraphAgent: vi.fn().mockImplementation(async (graphSession: unknown) => ({
      session: graphSession,
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
  const sessions = {
    resolveContext: vi.fn().mockResolvedValue(session),
    recordContactMessage: vi.fn().mockResolvedValue(session),
    evaluate: vi.fn().mockResolvedValue({ reason: null }),
    assumeHumanControl: vi.fn().mockResolvedValue(session),
    setContactAiPaused: vi.fn().mockResolvedValue(undefined),
    releaseToAi: vi.fn().mockResolvedValue(session),
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
    provider,
    processor: new InboundMessageProcessor(
      automation as never,
      provider,
      idempotency,
      handoff,
      undefined,
      {
        debounce: false,
        runtime,
        knowledge: { search: vi.fn().mockResolvedValue([]) } as never,
        sessions,
      },
    ),
  };
}

function expectNoNewTurn(subject: ReturnType<typeof buildSubject>) {
  expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
  expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
  expect(subject.automation.completeGraphTurn).not.toHaveBeenCalled();
  expect(subject.automation.handleBufferedText).not.toHaveBeenCalled();
  expect(subject.provider.sendText).not.toHaveBeenCalled();
}

describe("nó recordInbound: mensagem já respondida termina em duplicate", () => {
  // Evita: o retry de um turno que já respondeu rodava o turno de novo (e,
  // antes, morria em "Unique constraint failed"), em vez de encerrar quieto.
  it("lote de uma mensagem já respondida não roda o turno nem envia nada", async () => {
    const subject = buildSubject(["message-1"]);

    await expect(
      subject.processor.handleInboundBatch([baseMessage()]),
    ).resolves.toEqual({ ok: true, action: "duplicate" });

    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(1);
    expectNoNewTurn(subject);
  });

  it("sem resposta gravada, a mesma mensagem segue para o turno normalmente", async () => {
    const subject = buildSubject([]);

    await expect(
      subject.processor.handleInboundBatch([baseMessage()]),
    ).resolves.toMatchObject({ action: "replied" });

    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledTimes(1);
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
  });
});

describe("handleInboundBatch: lote inteiro já respondido termina em duplicate", () => {
  // Evita: o retry do lote agrupado (fragmentos de texto) respondia de novo a
  // mensagens que a IA já tinha respondido antes do estouro de passos.
  it("todos os fragmentos com alreadyAnswered: duplicate, sem turno agrupado", async () => {
    const subject = buildSubject(["message-1", "message-2"]);

    await expect(
      subject.processor.handleInboundBatch([
        baseMessage({ messageId: "message-1", text: "Oi" }),
        baseMessage({ messageId: "message-2", text: "Queria marcar um horario" }),
      ]),
    ).resolves.toEqual({ ok: true, action: "duplicate" });

    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(2);
    expectNoNewTurn(subject);
  });

  it("basta um fragmento novo para o lote ser respondido, com todos os fragmentos", async () => {
    const subject = buildSubject(["message-1"]);

    await expect(
      subject.processor.handleInboundBatch([
        baseMessage({ messageId: "message-1", text: "Oi" }),
        baseMessage({ messageId: "message-2", text: "Queria marcar um horario" }),
      ]),
    ).resolves.toMatchObject({ action: "replied" });

    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledTimes(1);
    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Oi\nQueria marcar um horario",
        messageRecordIds: ["inbound-message-1", "inbound-message-2"],
      }),
    );
    // Os fragmentos já gravados não são gravados de novo no turno final.
    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(2);
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
  });
});

describe("handleInboundBatch: fragmento de audio ja respondido", () => {
  // Evita (achado do teste de regressao de 2026-10-12): fragmento de audio
  // passa por recordInbound -> transcribeAudio -> bufferRecordedInbound, que
  // perdia o alreadyAnswered; o retry de um lote com audio ja respondido
  // respondia a cliente de novo.
  it("audio e texto ja respondidos: duplicate, sem turno nem envio", async () => {
    const subject = buildSubject(["message-1", "message-2"]);

    await expect(
      subject.processor.handleInboundBatch([
        baseMessage({ messageId: "message-1", kind: "audio", text: undefined }),
        baseMessage({ messageId: "message-2", text: "Queria marcar um horario" }),
      ]),
    ).resolves.toEqual({ ok: true, action: "duplicate" });

    expectNoNewTurn(subject);
  });
});
