/**
 * Guard antes de efeito do Goal005, preservado (Goal011, critério 5).
 *
 * A confirmação explícita por código é uma porta nova; ela não substitui a
 * porta anterior. Entre o instante em que o modelo decidiu chamar uma tool e o
 * instante em que a tool rodaria, o contexto pode ter vencido: o humano
 * assumiu, o contato foi ignorado, a sessão virou pessoal ou a cliente falou de
 * novo. Nada com efeito roda sobre contexto vencido — e "não rodou" aqui
 * significa `executeGraphTools` **não chamado**, não uma resposta engolida
 * depois do efeito já ter acontecido.
 *
 * O caso positivo no fim é o que impede o arquivo de ser vácuo: com a sessão
 * elegível, a mesma montagem executa a tool.
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
    text: "pode confirmar sim",
    raw: {},
    ...overrides,
  };
}

function snapshot(): SessionSnapshot {
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
  };
}

/**
 * Turno em que o modelo decidiu confirmar um agendamento: a primeira resposta
 * traz a tool com efeito, a segunda (depois do resultado) é só texto.
 */
function buildSubject(evaluate: { reason: string | null }) {
  let inboundCounter = 0;
  let modelCalls = 0;
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
    prepareGraphTurn: vi
      .fn()
      .mockImplementation(async (input: { turnId?: string }) => ({
        conversationId: "conversation-1",
        tenantId: "tenant-1",
        channelId: "channel-1",
        turnId: input.turnId,
      })),
    invokeGraphAgent: vi.fn().mockImplementation(async (session: unknown) => {
      modelCalls += 1;
      return {
        session,
        response:
          modelCalls === 1
            ? {
                id: "model-1",
                text: "",
                toolCalls: [
                  {
                    id: "call-confirm",
                    name: "create_appointment",
                    args: { action: "confirm" },
                  },
                ],
                continuation: null,
              }
            : { id: "model-2", text: "ok", toolCalls: [], continuation: null },
      };
    }),
    executeGraphTools: vi.fn().mockImplementation(async (session: unknown) => ({
      session,
      toolResults: [{ id: "call-confirm", content: '{"ok":true}' }],
    })),
    advanceGraphTurn: vi.fn().mockImplementation((session: unknown) => session),
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
  const current = snapshot();
  const sessions = {
    resolveContext: vi.fn().mockResolvedValue(current),
    recordContactMessage: vi.fn().mockResolvedValue(current),
    evaluate: vi.fn().mockResolvedValue(evaluate),
    assumeHumanControl: vi.fn().mockResolvedValue(current),
    setContactAiPaused: vi.fn().mockResolvedValue(undefined),
    releaseToAi: vi.fn().mockResolvedValue(current),
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
      automation,
      provider,
      idempotency,
      handoff,
      undefined,
      {
        debounce: false,
        runtime,
        outboundGate: {
          shouldCancel: vi.fn().mockResolvedValue(null),
          requestCancel: vi.fn().mockResolvedValue(undefined),
        },
        sessions,
      },
    ),
  };
}

describe("nada com efeito roda sobre contexto vencido (Goal005, preservado)", () => {
  it.each([
    ["human_handling", "o humano assumiu durante o turno"],
    ["input_superseded", "a cliente falou de novo durante o turno"],
    ["contact_ignored", "o contato foi ignorado durante o turno"],
    ["session_personal", "a sessao virou pessoal durante o turno"],
  ])("nao executa a tool com efeito quando %s", async (reason) => {
    const subject = buildSubject({ reason });

    await subject.processor.handleInboundMessage(baseMessage());

    // O modelo chegou a pedir a tool; o guard e quem impede a execucao.
    expect(subject.automation.invokeGraphAgent).toHaveBeenCalled();
    expect(subject.automation.executeGraphTools).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("executa a tool quando a sessao continua elegivel", async () => {
    const subject = buildSubject({ reason: null });

    await subject.processor.handleInboundMessage(baseMessage());

    expect(subject.automation.executeGraphTools).toHaveBeenCalledTimes(1);
  });

  it("o turno de entrada chega ao preparo do turno da IA", async () => {
    const subject = buildSubject({ reason: null });

    await subject.processor.handleInboundMessage(baseMessage());

    // O rascunho so consegue guardar o turno de origem porque ele atravessa o
    // grafo ate aqui; sem isto a confirmacao explicita nao teria o que comparar.
    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "channel-1:message-1" }),
    );
  });
});
