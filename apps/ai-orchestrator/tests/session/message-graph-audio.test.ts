/**
 * Audio no grafo, sob a politica do Goal005 (Goal013/WU-03).
 *
 * O no de transcricao roda entre `recordInbound` e `sessionGate`, e e essa
 * posicao que estes testes provam: contato ignorado e sessao pessoal nunca
 * chegam ao provedor; atendimento humano e IA desligada transcrevem sem a IA
 * agir; e transcricao concluida vira o texto do turno pelo caminho normal —
 * classificacao, prompt, modelo e tools —, sem rota paralela.
 *
 * A transcricao usa o servico real com um **duble que conta chamadas**: um
 * stub da porta inteira esconderia justamente o que precisa ser verificado.
 */
import { describe, expect, it, vi } from "vitest";

import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import { InboundMessageProcessor } from "../../src/modules/channel/InboundMessageProcessor.js";
import type { GraphRuntimePort } from "../../src/modules/graph/graph-runtime.js";
import { AudioTranscriptionService } from "../../src/modules/media/audio-transcription.js";
import { AUDIO_TURN_MARKER } from "../../src/modules/media/audio-turn.js";
import { FakeTranscriptionProvider } from "../../src/modules/media/fake-transcription-provider.js";
import type {
  AttachmentTranscriptionSnapshot,
  MessageAttachmentPort,
  RecordTranscriptionInput,
} from "../../src/modules/media/message-attachment-store.js";
import type { SessionSnapshot } from "../../src/modules/session/SessionService.js";

const audioBytes = Buffer.from("bytes-de-audio");

function audioPayload(withBase64 = true) {
  return {
    data: {
      Info: {},
      Message: {
        audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 8 },
        ...(withBase64 ? { base64: audioBytes.toString("base64") } : {}),
      },
    },
  };
}

function audioMessage(
  overrides: Partial<ChannelInboundMessage> = {},
): ChannelInboundMessage {
  return {
    provider: "evolution-go",
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    instanceId: "instance-1",
    messageId: "message-audio",
    chatId: "5511999999999@s.whatsapp.net",
    customerPhone: "5511999999999",
    customerName: "Maria",
    fromMe: false,
    isGroup: false,
    kind: "audio",
    media: {
      mimetype: "audio/ogg; codecs=opus",
      durationSeconds: 8,
      hasBase64: true,
      hasMediaUrl: false,
      tooLarge: false,
    },
    raw: audioPayload(),
    ...overrides,
  };
}

function textMessage(
  overrides: Partial<ChannelInboundMessage> = {},
): ChannelInboundMessage {
  return audioMessage({
    messageId: "message-text",
    kind: "text",
    text: "oi, tudo bem?",
    media: undefined,
    raw: {},
    ...overrides,
  });
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

/**
 * Attachments em memoria, com o estado vivo entre as passagens do grafo: e o
 * que permite ver que o mesmo audio num lote agrupado nao e transcrito duas
 * vezes.
 */
function createAttachments(
  overrides: Partial<AttachmentTranscriptionSnapshot>,
) {
  const rows = new Map<string, AttachmentTranscriptionSnapshot>();
  const recorded: RecordTranscriptionInput[] = [];
  const port: MessageAttachmentPort = {
    findForMessage: async ({ messageId }) => {
      const existing = rows.get(messageId);
      if (existing) return existing;
      const row: AttachmentTranscriptionSnapshot = {
        id: `attachment-${messageId}`,
        kind: "AUDIO",
        mimetype: "audio/ogg; codecs=opus",
        fileName: null,
        sizeBytes: 12_000,
        durationSeconds: 8,
        tooLarge: false,
        transcript: null,
        transcriptStatus: null,
        ...overrides,
      };
      rows.set(messageId, row);
      return row;
    },
    recordTranscription: async (input) => {
      recorded.push(input);
      for (const row of rows.values()) {
        if (row.id !== input.attachmentId) continue;
        row.transcriptStatus = input.status;
        row.transcript = input.transcript ?? null;
      }
    },
  };
  return { port, recorded };
}

function buildSubject(
  options: {
    session?: SessionSnapshot;
    aiEnabled?: boolean;
    transcript?: string;
    failTranscription?: Error;
    attachment?: Partial<AttachmentTranscriptionSnapshot>;
    withTranscription?: boolean;
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
    downloadMedia: vi.fn().mockResolvedValue({
      provider: "evolution-go",
      base64: `data:audio/ogg;base64,${audioBytes.toString("base64")}`,
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
    releaseToAi: vi
      .fn()
      .mockResolvedValue({ ...current, humanHandling: false }),
  };
  const runtime: GraphRuntimePort = {
    resolveConversationId: vi.fn().mockResolvedValue("conversation-1"),
    loadTenantConfig: vi.fn().mockResolvedValue({
      channelConnected: true,
      tenantConfig: {
        aiEnabled: options.aiEnabled ?? true,
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

  const attachments = createAttachments(options.attachment ?? {});
  const transcriptionProvider = new FakeTranscriptionProvider({
    text: options.transcript ?? "quero agendar amanha de manha",
    failWith: options.failTranscription,
  });
  const transcription = new AudioTranscriptionService(
    attachments.port,
    transcriptionProvider,
    provider,
  );

  return {
    automation,
    knowledge,
    provider,
    sessions,
    attachments,
    transcriptionProvider,
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
        transcription:
          options.withTranscription === false ? undefined : transcription,
      },
    ),
  };
}

describe("politica do contato e da sessao antes da transcricao", () => {
  it("contato ignorado persiste o audio e nunca chega ao provedor de transcricao", async () => {
    const subject = buildSubject({ session: snapshot({ ignored: true }) });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "ignored_contact" });

    expect(subject.automation.recordInboundText).toHaveBeenCalledTimes(1);
    expect(subject.transcriptionProvider.callCount).toBe(0);
    expect(subject.provider.downloadMedia).not.toHaveBeenCalled();
    expect(subject.attachments.recorded).toEqual([
      expect.objectContaining({
        status: "SKIPPED",
        skipReason: "CONTACT_IGNORED",
      }),
    ]);
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("sessao pessoal persiste o audio e nunca chega ao provedor de transcricao", async () => {
    const subject = buildSubject({
      session: snapshot({ category: "PERSONAL" }),
    });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "personal_session" });

    expect(subject.transcriptionProvider.callCount).toBe(0);
    expect(subject.attachments.recorded).toEqual([
      expect.objectContaining({
        status: "SKIPPED",
        skipReason: "PERSONAL_SESSION",
      }),
    ]);
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
  });

  it("atendimento humano transcreve, mas a IA nao age", async () => {
    const subject = buildSubject({
      session: snapshot({ humanHandling: true }),
    });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "paused_conversation" });

    // A transcricao e o que a inbox mostra para a profissional: ela acontece
    // mesmo com a IA fora da conversa.
    expect(subject.transcriptionProvider.callCount).toBe(1);
    expect(subject.attachments.recorded).toEqual([
      expect.objectContaining({
        status: "DONE",
        transcript: "quero agendar amanha de manha",
        provider: "fake",
        model: "fake-transcribe",
      }),
    ]);
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });

  it("IA desligada transcreve, mas a IA nao age", async () => {
    const subject = buildSubject({ aiEnabled: false });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "bot_disabled" });

    expect(subject.transcriptionProvider.callCount).toBe(1);
    expect(subject.attachments.recorded[0]).toMatchObject({ status: "DONE" });
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
  });
});

describe("transcricao concluida vira o texto do turno", () => {
  it("o turno de audio segue o caminho normal, com o texto marcado como transcrito", async () => {
    const subject = buildSubject({ transcript: "quero agendar amanha" });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "replied" });

    expect(subject.transcriptionProvider.callCount).toBe(1);
    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: `${AUDIO_TURN_MARKER} quero agendar amanha`,
        // Mesmo turno derivado da mensagem, como no texto: nenhuma excecao de
        // guard nasce do audio.
        turnId: "channel-1:message-audio",
      }),
    );
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
  });

  it("confirmacao clara em audio chega ao turno como confirmacao, pelo mesmo caminho do texto", async () => {
    const subject = buildSubject({ transcript: "sim, pode confirmar" });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "replied" });

    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: `${AUDIO_TURN_MARKER} sim, pode confirmar`,
        turnId: "channel-1:message-audio",
      }),
    );
  });

  it("baixa sob demanda quando o evento nao trouxe os bytes e transcreve do mesmo jeito", async () => {
    const subject = buildSubject({ transcript: "oi, quero remarcar" });

    await subject.processor.handleInboundMessage(
      audioMessage({ raw: audioPayload(false) }),
    );

    expect(subject.provider.downloadMedia).toHaveBeenCalledWith({
      message: expect.objectContaining({
        audioMessage: expect.objectContaining({ seconds: 8 }),
      }),
      requestId: "request-1",
    });
    expect(subject.transcriptionProvider.callCount).toBe(1);
    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: `${AUDIO_TURN_MARKER} oi, quero remarcar`,
      }),
    );
  });
});

describe("audio sem transcricao nao inventa conteudo", () => {
  it("falha do provedor grava FAILED, responde pedindo texto e nao chama o modelo", async () => {
    const subject = buildSubject({
      failTranscription: new Error("openai fora do ar"),
    });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "unsupported_message" });

    expect(subject.attachments.recorded[0]).toMatchObject({
      status: "FAILED",
      transcript: undefined,
    });
    expect(subject.attachments.recorded[0].error).toContain("PROVIDER_FAILED");
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    const sent = subject.provider.sendText.mock.calls[0][0].text as string;
    expect(sent).toContain("Recebi seu audio");
    expect(sent).toContain("texto");
  });

  it("falha do download vira MEDIA_UNAVAILABLE sem derrubar o turno", async () => {
    const subject = buildSubject();
    subject.provider.downloadMedia.mockRejectedValue(
      new Error("Evolution Go media download failed with HTTP 500"),
    );

    await expect(
      subject.processor.handleInboundMessage(
        audioMessage({ raw: audioPayload(false) }),
      ),
    ).resolves.toMatchObject({ action: "unsupported_message" });

    expect(subject.attachments.recorded[0]).toMatchObject({
      status: "FAILED",
      error: "MEDIA_UNAVAILABLE",
    });
    expect(subject.transcriptionProvider.callCount).toBe(0);
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
  });

  it("audio acima do teto grava SKIPPED, nao chama o provedor e pede texto", async () => {
    const subject = buildSubject({ attachment: { tooLarge: true } });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "unsupported_message" });

    expect(subject.transcriptionProvider.callCount).toBe(0);
    expect(subject.attachments.recorded[0]).toMatchObject({
      status: "SKIPPED",
      skipReason: "MEDIA_TOO_LARGE",
    });
    expect(subject.automation.prepareGraphTurn).not.toHaveBeenCalled();
  });

  it("sem porta de transcricao, o audio volta a resposta generica anterior a este Goal", async () => {
    const subject = buildSubject({ withTranscription: false });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "unsupported_message" });

    expect(subject.attachments.recorded).toHaveLength(0);
    expect(subject.provider.sendText.mock.calls[0][0].text).toContain(
      "Recebi sua mensagem",
    );
  });
});

describe("audio participa do agrupamento de fragmentos", () => {
  it("audio e texto no mesmo lote viram um turno so, com o audio marcado", async () => {
    const subject = buildSubject({ transcript: "e amanha de tarde da?" });

    await expect(
      subject.processor.handleInboundBatch([
        textMessage({ text: "oi, boa tarde" }),
        audioMessage(),
      ]),
    ).resolves.toMatchObject({ action: "replied" });

    // Uma transcricao por audio: a passagem diferida transcreve, a final
    // reaproveita o que ja esta gravado.
    expect(subject.transcriptionProvider.callCount).toBe(1);
    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: `oi, boa tarde\n${AUDIO_TURN_MARKER} e amanha de tarde da?`,
        messageRecordIds: ["inbound-1", "inbound-2"],
      }),
    );
  });
});
