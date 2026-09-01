import { describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import { InboundMessageProcessor } from "../../src/modules/channel/InboundMessageProcessor.js";
import type { GraphRuntimePort } from "../../src/modules/graph/graph-runtime.js";

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
    text: "Oi",
    raw: {},
    ...overrides,
  };
}

function buildSubject(
  options: {
    debounce?:
      | false
      | { minSeconds: number; maxSeconds: number; maxWaitSeconds: number };
  } = {},
) {
  let inboundCounter = 0;
  const automation = {
    handleIncomingText: vi.fn().mockResolvedValue({
      text: "Resposta",
      conversationId: "conversation-1",
      messageRecordId: "outbound-1",
    }),
    markOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
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
    handleBufferedText: vi.fn().mockResolvedValue({
      text: "Resposta",
      conversationId: "conversation-1",
      messageRecordId: "outbound-1",
    }),
  };
  const provider = {
    sendText: vi.fn().mockResolvedValue({
      provider: "evolution-go",
      messageId: "sent-1",
      raw: { messageId: "sent-1" },
    }),
  };
  const idempotency = {
    remember: vi.fn().mockResolvedValue(true),
  };
  const handoff = {
    isBotPaused: vi.fn().mockResolvedValue(false),
    isBotOutboundMessage: vi.fn().mockResolvedValue(false),
    getBotPauseContext: vi.fn().mockResolvedValue(null),
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
        tone: "LIGHT_CLOSE",
        promptVersion: "scheduling_v1.0.0",
      },
    }),
    loadConversation: vi.fn().mockResolvedValue({
      status: "ACTIVE",
      humanHandoff: false,
    }),
    loadToolResults: vi.fn().mockResolvedValue([]),
  };

  return {
    automation,
    provider,
    idempotency,
    handoff,
    processor: new InboundMessageProcessor(
      automation,
      provider,
      idempotency,
      handoff,
      undefined,
      {
        debounce: options.debounce ?? false,
        runtime,
      },
    ),
  };
}

describe("InboundMessageProcessor", () => {
  it("ignores group messages before touching idempotency or automation", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(baseMessage({ isGroup: true })),
    ).resolves.toMatchObject({
      action: "ignored_group",
    });

    expect(subject.idempotency.remember).not.toHaveBeenCalled();
    expect(subject.automation.handleIncomingText).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("ignores duplicate deliveries", async () => {
    const subject = buildSubject();
    subject.idempotency.remember.mockResolvedValue(false);

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({
      action: "duplicate",
    });

    expect(subject.automation.handleIncomingText).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("records owner activity when a manual fromMe message is detected", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "respondi pelo celular" }),
      ),
    ).resolves.toMatchObject({
      action: "manual_activity_recorded",
    });

    expect(subject.handoff.pauseForHuman).not.toHaveBeenCalled();
    expect(subject.automation.recordManualOutboundText).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "5511999999999",
        text: "respondi pelo celular",
      }),
    );
    expect(subject.automation.handleIncomingText).not.toHaveBeenCalled();
  });

  it("pauses indefinitely with /ia_pause when sent by the connected number", async () => {
    const subject = buildSubject({
      debounce: {
        minSeconds: 8,
        maxSeconds: 35,
        maxWaitSeconds: 60,
      },
    });

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ messageId: "message-1", text: "Oi" }),
      ),
    ).resolves.toMatchObject({
      action: "buffered",
    });

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({
          messageId: "command-1",
          fromMe: true,
          text: "/ia_pause",
        }),
      ),
    ).resolves.toMatchObject({
      action: "ai_pause_command",
    });

    expect(subject.handoff.pauseIndefinitely).toHaveBeenCalledWith(
      "5511999999999",
      "IA pausada por comando /ia_pause",
      "Comando enviado pelo WhatsApp conectado.",
    );
    expect(subject.automation.recordManualOutboundText).not.toHaveBeenCalled();
    await expect(
      subject.processor.flushBufferedMessagesForTesting("5511999999999"),
    ).resolves.toBeNull();
  });

  it("does not pause when /ia_pause is sent by the customer", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ text: "/ia_pause" }),
      ),
    ).resolves.toMatchObject({
      action: "replied",
    });

    expect(subject.handoff.pauseIndefinitely).not.toHaveBeenCalled();
    expect(subject.automation.handleIncomingText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "/ia_pause",
      }),
    );
  });

  it("ignores fromMe messages that were sent by the bot", async () => {
    const subject = buildSubject();
    subject.handoff.isBotOutboundMessage.mockResolvedValue(true);

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "resposta do bot" }),
      ),
    ).resolves.toMatchObject({
      action: "ignored_bot_outbound",
    });

    expect(subject.automation.recordManualOutboundText).not.toHaveBeenCalled();
    expect(subject.handoff.pauseForHuman).not.toHaveBeenCalled();
  });

  it("processes fromMe self-chat messages when self-chat testing is enabled", async () => {
    const original = env.EVOLUTION_ALLOW_SELF_CHAT;
    env.EVOLUTION_ALLOW_SELF_CHAT = true;

    try {
      const subject = buildSubject();

      await expect(
        subject.processor.handleInboundMessage(
          baseMessage({
            fromMe: true,
            chatId: "5511999999999@lid",
            customerPhone: "5511999999999",
            raw: {
              data: {
                Info: {
                  Chat: "5511999999999@lid",
                  Sender: "5511999999999@lid",
                },
              },
            },
          }),
        ),
      ).resolves.toMatchObject({
        action: "replied",
      });

      expect(subject.automation.handleIncomingText).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: "5511999999999",
          text: "Oi",
        }),
      );
      expect(subject.handoff.pauseForHuman).not.toHaveBeenCalled();
      expect(subject.provider.sendText).toHaveBeenCalled();
    } finally {
      env.EVOLUTION_ALLOW_SELF_CHAT = original;
    }
  });

  it("still records manual fromMe messages to other chats when self-chat testing is enabled", async () => {
    const original = env.EVOLUTION_ALLOW_SELF_CHAT;
    env.EVOLUTION_ALLOW_SELF_CHAT = true;

    try {
      const subject = buildSubject();

      await expect(
        subject.processor.handleInboundMessage(
          baseMessage({
            fromMe: true,
            chatId: "5511888888888@s.whatsapp.net",
            customerPhone: "5511888888888",
            raw: {
              data: {
                Info: {
                  Chat: "5511888888888@s.whatsapp.net",
                  Sender: "5511777777777@s.whatsapp.net",
                },
              },
            },
          }),
        ),
      ).resolves.toMatchObject({
        action: "manual_activity_recorded",
      });

      expect(subject.automation.handleIncomingText).not.toHaveBeenCalled();
      expect(subject.automation.recordManualOutboundText).toHaveBeenCalled();
      expect(subject.handoff.pauseForHuman).not.toHaveBeenCalled();
      expect(subject.provider.sendText).not.toHaveBeenCalled();
    } finally {
      env.EVOLUTION_ALLOW_SELF_CHAT = original;
    }
  });

  it("reactivates the bot with /bot on", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ fromMe: true, text: "/bot on" }),
      ),
    ).resolves.toMatchObject({
      action: "bot_resumed",
    });

    expect(subject.handoff.resumeBot).toHaveBeenCalledWith("5511999999999");
  });

  it("does not respond while the conversation is paused", async () => {
    const subject = buildSubject();
    subject.handoff.isBotPaused.mockResolvedValue(true);

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({
      action: "paused_conversation",
    });

    expect(subject.automation.handleIncomingText).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("resumes and responds when a text arrives after an unsupported-message pause", async () => {
    const subject = buildSubject();
    subject.handoff.isBotPaused
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    subject.handoff.getBotPauseContext.mockResolvedValue({
      phone: "5511999999999",
      reason: "Mensagem unknown nao suportada pelo bot",
      summary: "Cliente enviou mensagem fora do suporte textual do MVP.",
      pauseUntil: new Date("9999-12-31T23:59:59.000Z"),
      handoffId: "handoff-1",
    });

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ text: "Quero agendar" }),
      ),
    ).resolves.toMatchObject({
      action: "replied",
    });

    expect(subject.handoff.resumeBot).toHaveBeenCalledWith("5511999999999");
    expect(subject.automation.handleIncomingText).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "5511999999999",
        text: "Quero agendar",
      }),
    );
    expect(subject.provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "5511999999999",
        text: "Resposta",
      }),
    );
  });

  it("does not pause indefinitely for new unsupported messages", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ kind: "unknown", text: undefined }),
      ),
    ).resolves.toMatchObject({
      action: "unsupported_message",
    });

    expect(subject.handoff.pauseIndefinitely).not.toHaveBeenCalled();
    expect(subject.automation.handleIncomingText).not.toHaveBeenCalled();
    expect(subject.provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "5511999999999",
      }),
    );
  });

  it("sends assistant replies through the Evolution provider", async () => {
    const subject = buildSubject();

    const result = await subject.processor.handleInboundMessage(baseMessage());

    expect(result).toMatchObject({
      action: "replied",
      outboundMessage: {
        text: "Resposta",
        conversationId: "conversation-1",
        messageRecordId: "outbound-1",
        providerMessageId: "sent-1",
        rawPayload: { messageId: "sent-1" },
      },
    });

    expect(subject.automation.handleIncomingText).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "5511999999999",
        text: "Oi",
      }),
    );
    expect(subject.provider.sendText).toHaveBeenCalledWith({
      to: "5511999999999",
      text: "Resposta",
      quotedMessageId: "message-1",
      quotedParticipant: "5511999999999@s.whatsapp.net",
      correlationId: "outbound-1",
    });
    expect(subject.automation.markOutboundMessageSent).toHaveBeenNthCalledWith(
      1,
      {
        messageRecordId: "outbound-1",
        providerMessageId: "outbound-1",
      },
    );
    expect(subject.automation.markOutboundMessageSent).toHaveBeenNthCalledWith(
      2,
      {
        messageRecordId: "outbound-1",
        providerMessageId: "sent-1",
        rawPayload: { messageId: "sent-1" },
      },
    );
  });

  it("checks for a pause again before sending the assistant reply", async () => {
    const subject = buildSubject();
    subject.handoff.isBotPaused
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).resolves.toMatchObject({
      action: "paused_conversation",
    });

    expect(subject.automation.handleIncomingText).toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
    expect(subject.automation.markOutboundMessageSent).not.toHaveBeenCalled();
  });

  it("buffers consecutive customer messages and processes them as one grouped turn", async () => {
    const subject = buildSubject({
      debounce: {
        minSeconds: 8,
        maxSeconds: 35,
        maxWaitSeconds: 60,
      },
    });

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ messageId: "message-1", text: "Oi" }),
      ),
    ).resolves.toMatchObject({
      action: "buffered",
    });
    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({
          messageId: "message-2",
          text: "queria horario pra sobrancelha amanha",
        }),
      ),
    ).resolves.toMatchObject({
      action: "buffered",
    });

    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(2);
    expect(subject.automation.handleIncomingText).not.toHaveBeenCalled();
    expect(subject.automation.handleBufferedText).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();

    await expect(
      subject.processor.flushBufferedMessagesForTesting("5511999999999"),
    ).resolves.toMatchObject({
      action: "replied",
    });

    expect(subject.automation.handleBufferedText).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "5511999999999",
        text: "Oi\nqueria horario pra sobrancelha amanha",
        messageRecordIds: ["inbound-1", "inbound-2"],
      }),
    );
    expect(subject.provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "5511999999999",
        text: "Resposta",
        quotedMessageId: "message-2",
      }),
    );
  });
});
