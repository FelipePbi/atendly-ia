import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../src/lib/errors.js";
import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import { InboundMessageProcessor } from "../../src/modules/channel/InboundMessageProcessor.js";
import type { GraphRuntimePort } from "../../src/modules/graph/graph-runtime.js";
import type { OutboundGate } from "../../src/modules/graph/message-graph.js";
import {
  MESSAGE_PART_GAP_MS,
  type MessagePartProgressPort,
} from "../../src/modules/outbox/message-dispatch.js";

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
    outboundGate?: OutboundGate;
    replyDispatch?: { progress?: MessagePartProgressPort; sleep?: (ms: number) => Promise<void> };
  } = {},
) {
  let inboundCounter = 0;
  const automation = {
    handleIncomingText: vi.fn().mockResolvedValue({
      text: "Resposta",
      conversationId: "conversation-1",
      messageRecordId: "outbound-1",
      correlationId: "ai-operation-1",
    }),
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
    handleBufferedText: vi.fn().mockResolvedValue({
      text: "Resposta",
      conversationId: "conversation-1",
      messageRecordId: "outbound-1",
      correlationId: "ai-operation-1",
    }),
  };
  const provider = {
    sendText: vi.fn().mockResolvedValue({
      provider: "evolution-go",
      messageId: "sent-1",
      raw: { messageId: "sent-1" },
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
    loadConversation: vi
      .fn()
      .mockResolvedValue({ status: "ACTIVE", humanHandoff: false }),
    loadToolResults: vi.fn().mockResolvedValue([]),
  };

  return {
    automation,
    provider,
    handoff,
    processor: new InboundMessageProcessor(
      automation,
      provider,
      idempotency,
      handoff,
      undefined,
      {
        debounce: false,
        runtime,
        outboundGate: options.outboundGate,
        replyDispatch: options.replyDispatch,
      },
    ),
  };
}

describe("outbound delivery state", () => {
  it("records SENT with the id the transport returned", async () => {
    const subject = buildSubject();

    const result = await subject.processor.handleInboundMessage(baseMessage());

    expect(result.action).toBe("replied");
    expect(subject.provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: "ai-operation-1" }),
    );
    expect(subject.automation.markOutboundDelivery).toHaveBeenCalledTimes(1);
    expect(subject.automation.markOutboundDelivery).toHaveBeenCalledWith({
      messageRecordId: "outbound-1",
      state: "SENT",
      providerMessageId: "sent-1",
      rawPayload: { messageId: "sent-1" },
    });
  });

  it("keeps a timed-out attempt as UNKNOWN and does not retry it", async () => {
    const subject = buildSubject();
    subject.provider.sendText.mockRejectedValueOnce(
      new AppError("Evolution Go send timed out.", {
        statusCode: 504,
        code: "EVOLUTION_SEND_TIMEOUT",
      }),
    );

    const result = await subject.processor.handleInboundMessage(baseMessage());

    // Nem excecao (que faria o inbox retentar e duplicar a mensagem do
    // cliente) nem sucesso presumido: a tentativa fica registrada como incerta.
    expect(result).toMatchObject({ ok: true, action: "send_failed" });
    expect(subject.automation.markOutboundDelivery).toHaveBeenCalledWith({
      messageRecordId: "outbound-1",
      state: "UNKNOWN",
      detail: "transport_timeout",
    });
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
  });

  it("rethrows only when the failure provably happened before the send", async () => {
    const subject = buildSubject();
    subject.provider.sendText.mockRejectedValueOnce(
      Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        }),
      }),
    );

    await expect(
      subject.processor.handleInboundMessage(baseMessage()),
    ).rejects.toThrow("fetch failed");
    expect(subject.automation.markOutboundDelivery).toHaveBeenCalledWith({
      messageRecordId: "outbound-1",
      state: "FAILED",
      detail: "transport_unreachable_econnrefused",
    });
  });

  it("cancels a response that has not been sent when a new message arrives", async () => {
    const subject = buildSubject({
      outboundGate: {
        shouldCancel: async () => "superseded_by_new_inbound_message",
      },
    });

    const result = await subject.processor.handleInboundMessage(baseMessage());

    expect(result).toMatchObject({ ok: true, action: "superseded" });
    expect(subject.provider.sendText).not.toHaveBeenCalled();
    expect(subject.automation.markOutboundDelivery).toHaveBeenCalledWith({
      messageRecordId: "outbound-1",
      state: "FAILED",
      detail: "superseded_by_new_inbound_message",
    });
  });

  it("does not lose the response when the human took over before the send", async () => {
    const subject = buildSubject();
    subject.handoff.isBotPaused
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await subject.processor.handleInboundMessage(baseMessage());

    expect(result).toMatchObject({ action: "paused_conversation" });
    expect(subject.provider.sendText).not.toHaveBeenCalled();
    expect(subject.automation.markOutboundDelivery).toHaveBeenCalledWith({
      messageRecordId: "outbound-1",
      state: "FAILED",
      detail: "paused_before_send",
    });
  });

  it("answers a persisted batch once, in order, without the in-memory buffer", async () => {
    const subject = buildSubject();

    const result = await subject.processor.handleInboundBatch([
      baseMessage({ messageId: "message-1", text: "Oi" }),
      baseMessage({ messageId: "message-2", text: "tudo bem?" }),
    ]);

    expect(result.action).toBe("replied");
    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(2);
    expect(subject.automation.handleBufferedText).toHaveBeenCalledTimes(1);
    expect(subject.automation.handleBufferedText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Oi\ntudo bem?",
        messageRecordIds: ["inbound-1", "inbound-2"],
      }),
    );
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
  });
});

describe("resposta da IA em varias mensagens (2026-10-11)", () => {
  const multiPart = {
    text: "Oi! A Aplicação 5D custa R$ 190 💖\n\nSe quiser, posso te ajudar a agendar também.",
    conversationId: "conversation-1",
    messageRecordId: "outbound-1",
    correlationId: "ai-operation-1",
  };

  function memoryProgress() {
    const state = { partsSent: 0 };
    const progress: MessagePartProgressPort = {
      readPartsSent: async () => state.partsSent,
      recordPartsSent: async ({ partsSent }) => {
        state.partsSent = partsSent;
      },
    };
    return { state, progress };
  }

  it("envia as partes em ordem, espera entre elas e so marca SENT depois da ultima", async () => {
    const sleep = vi.fn(async () => undefined);
    const { progress } = memoryProgress();
    const subject = buildSubject({ replyDispatch: { progress, sleep } });
    subject.automation.handleIncomingText.mockResolvedValue(multiPart);
    const order: string[] = [];
    subject.provider.sendText.mockImplementation(async (input: { text: string; correlationId?: string }) => {
      order.push(`send:${input.text}`);
      return { provider: "evolution-go", messageId: input.correlationId, raw: { id: input.correlationId } };
    });
    subject.automation.markOutboundDelivery.mockImplementation(async (input: { state: string }) => {
      order.push(`mark:${input.state}`);
    });

    const result = await subject.processor.handleInboundMessage(baseMessage());

    expect(result.action).toBe("replied");
    expect(order).toEqual([
      "send:Oi!",
      "send:A Aplicação 5D custa R$ 190 💖",
      "send:Se quiser, posso te ajudar a agendar também.",
      "mark:SENT",
    ]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(MESSAGE_PART_GAP_MS);
    expect(subject.provider.sendText.mock.calls[0][0]).toMatchObject({
      quotedMessageId: "message-1",
      correlationId: "ai-operation-1-p1",
    });
    expect(subject.automation.markOutboundDelivery).toHaveBeenCalledWith({
      messageRecordId: "outbound-1",
      state: "SENT",
      providerMessageId: "ai-operation-1",
      rawPayload: { id: "ai-operation-1" },
    });
  });

  it("falha retentavel no meio: linha FAILED, retry retoma da parte pendente sem duplicar", async () => {
    const { state, progress } = memoryProgress();
    const subject = buildSubject({
      replyDispatch: { progress, sleep: async () => undefined },
    });
    subject.automation.handleIncomingText.mockResolvedValue(multiPart);
    subject.provider.sendText.mockImplementation(async (input: { correlationId?: string }) => ({
      provider: "evolution-go",
      messageId: input.correlationId,
      raw: null,
    }));
    subject.provider.sendText
      .mockResolvedValueOnce({ provider: "evolution-go", messageId: "ai-operation-1-p1", raw: null })
      .mockRejectedValueOnce(
        Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
        }),
      );

    await expect(subject.processor.handleInboundMessage(baseMessage())).rejects.toThrow(
      "fetch failed",
    );
    expect(state.partsSent).toBe(1);
    expect(subject.automation.markOutboundDelivery).toHaveBeenLastCalledWith({
      messageRecordId: "outbound-1",
      state: "FAILED",
      detail: "transport_unreachable_econnrefused",
    });

    // O inbox retenta o mesmo evento: o grafo retoma em sendResponse.
    const retried = await subject.processor.handleInboundMessage(baseMessage());

    expect(retried.action).toBe("replied");
    const ids = subject.provider.sendText.mock.calls.map(([input]) => input.correlationId);
    expect(ids).toEqual([
      "ai-operation-1-p1",
      "ai-operation-1-p2",
      "ai-operation-1-p2",
      "ai-operation-1",
    ]);
    expect(subject.automation.handleIncomingText).toHaveBeenCalledTimes(1);
    expect(subject.automation.markOutboundDelivery).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "SENT", providerMessageId: "ai-operation-1" }),
    );
  });

  it("humano assumindo no meio da sequencia descarta as partes restantes", async () => {
    const subject = buildSubject({ replyDispatch: { sleep: async () => undefined } });
    subject.automation.handleIncomingText.mockResolvedValue(multiPart);
    let pausedChecks = 0;
    // guard, agent e persist veem a IA ativa; a checagem entre partes ve a pausa.
    subject.handoff.isBotPaused.mockImplementation(async () => {
      pausedChecks += 1;
      return pausedChecks > 3;
    });

    const result = await subject.processor.handleInboundMessage(baseMessage());

    expect(result).toMatchObject({ ok: true, action: "superseded" });
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
    expect(subject.automation.markOutboundDelivery).toHaveBeenCalledTimes(1);
    expect(subject.automation.markOutboundDelivery).toHaveBeenCalledWith({
      messageRecordId: "outbound-1",
      state: "FAILED",
      detail: "paused_before_send_after_part_1_of_3",
    });
  });
});
