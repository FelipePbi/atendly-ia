/**
 * Evals de áudio e mídia não textual (Goal013/WU-05), no nível do processador
 * de mensagens.
 *
 * `tests/session/message-graph-audio.test.ts` e
 * `tests/graph/message-graph-media.test.ts` já provam, nó a nó, a política de
 * transcrição e o roteamento por kind. Este arquivo reencena os mesmos
 * cenários com o vocabulário de eval (roteiro nomeado, sem rede, com
 * asserção de que o roteiro do dublê foi consumido) porque é aqui que o
 * Goal013 nomeia o que precisa ficar coberto: confirmação por áudio,
 * transcrição ambígua ou que falhou, contato ignorado e sessão pessoal antes
 * do provedor, atendimento humano que transcreve sem a IA agir, e imagem,
 * documento e sticker sem chamar o modelo.
 *
 * O dublê aqui é `automation.invokeGraphAgent` (o passo que chama o modelo
 * dentro do grafo), não `AssistantService.handleIncomingText` — é o mesmo
 * seam que `message-graph-audio.test.ts` usa, porque é isso que o roteamento
 * por kind decide antes de tocar o modelo.
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
import { proibirRede } from "./harness.js";

proibirRede();

const audioBytes = Buffer.from("bytes-de-audio");

function audioPayload() {
  return {
    data: {
      Info: {},
      Message: {
        audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 8 },
        base64: audioBytes.toString("base64"),
      },
    },
  };
}

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

function audioMessage(
  overrides: Partial<ChannelInboundMessage> = {},
): ChannelInboundMessage {
  return baseMessage({
    kind: "audio",
    text: undefined,
    media: {
      mimetype: "audio/ogg; codecs=opus",
      durationSeconds: 8,
      hasBase64: true,
      hasMediaUrl: false,
      tooLarge: false,
    },
    raw: audioPayload(),
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

/** Attachments em memória, com estado vivo entre passagens do grafo. */
function createAttachments(overrides: Partial<AttachmentTranscriptionSnapshot>) {
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

/** Passo do roteiro do dublê que fica no lugar do modelo dentro do grafo. */
interface AgentScriptStep {
  /** Política que este passo representa; aparece no erro quando sobra. */
  nota: string;
  text: string;
}

function scriptedAgent() {
  const steps: AgentScriptStep[] = [];
  const fn = vi.fn(async (session: unknown) => {
    const step = steps.shift();
    if (!step) {
      throw new Error(
        "O dublê recebeu uma chamada ao modelo que o roteiro deste eval nao previa.",
      );
    }
    return {
      session,
      response: { id: `dublê-${steps.length}`, text: step.text, toolCalls: [], continuation: null },
    };
  });
  return {
    fn,
    carregar(next: AgentScriptStep[]) {
      steps.push(...next);
    },
    /** Notas dos passos que sobraram sem uso; esvazia a fila. */
    passosPendentes() {
      const notas = steps.map((step) => step.nota);
      steps.length = 0;
      return notas;
    },
  };
}

function buildSubject(
  options: {
    session?: SessionSnapshot;
    aiEnabled?: boolean;
    transcript?: string;
    failTranscription?: Error;
    attachment?: Partial<AttachmentTranscriptionSnapshot>;
  } = {},
) {
  let inboundCounter = 0;
  const agent = scriptedAgent();
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
    invokeGraphAgent: agent.fn,
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
    releaseToAi: vi.fn().mockResolvedValue({ ...current, humanHandling: false }),
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
    agent,
    automation,
    provider,
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
        transcription,
      },
    ),
  };
}

describe("confirmação clara em áudio vale como confirmação da cliente", () => {
  it("política: confirmação em áudio segue o mesmo caminho de confirmação por texto", async () => {
    const subject = buildSubject({ transcript: "sim, pode confirmar" });
    subject.agent.carregar([
      {
        nota: "confirmacao clara em audio vale como confirmacao, mesma regra do texto",
        text: "Perfeito, confirmado! Ate amanha.",
      },
    ]);

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "replied" });

    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: `${AUDIO_TURN_MARKER} sim, pode confirmar`,
      }),
    );
    expect(subject.agent.passosPendentes()).toEqual([]);
    expect(subject.provider.sendText).toHaveBeenCalledTimes(1);
  });
});

describe("transcrição ambígua exige pergunta, nunca adivinhação", () => {
  it("política: transcrição truncada ou ambígua chega ao modelo marcada, e o turno segue normal para a pergunta de esclarecimento", async () => {
    const subject = buildSubject({
      transcript: "marca pra mim... acho que terca? ou quinta, nao lembro direito",
    });
    subject.agent.carregar([
      {
        nota: "transcricao ambigua: pergunta e espera, nunca supoe o dado que faltou",
        text: "Nao consegui entender direito o dia — pode confirmar por escrito?",
      },
    ]);

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "replied" });

    expect(subject.automation.prepareGraphTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: `${AUDIO_TURN_MARKER} marca pra mim... acho que terca? ou quinta, nao lembro direito`,
      }),
    );
    expect(subject.agent.passosPendentes()).toEqual([]);
  });
});

describe("falha de transcrição não inventa conteúdo", () => {
  it("política: falha do provedor grava FAILED, pede texto e nunca chama o modelo", async () => {
    const subject = buildSubject({
      failTranscription: new Error("openai fora do ar"),
    });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "unsupported_message" });

    expect(subject.attachments.recorded[0]).toMatchObject({ status: "FAILED" });
    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.agent.passosPendentes()).toEqual([]);
    const sent = subject.provider.sendText.mock.calls[0][0].text as string;
    expect(sent).toContain("texto");
  });
});

describe("contato ignorado nunca chega ao provedor de transcrição", () => {
  it("política: contato ignorado persiste o áudio e recusa a transcrição antes da rede", async () => {
    const subject = buildSubject({ session: snapshot({ ignored: true }) });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "ignored_contact" });

    expect(subject.transcriptionProvider.callCount).toBe(0);
    expect(subject.attachments.recorded).toEqual([
      expect.objectContaining({ status: "SKIPPED", skipReason: "CONTACT_IGNORED" }),
    ]);
    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.agent.passosPendentes()).toEqual([]);
  });
});

describe("sessão pessoal nunca chega ao provedor de transcrição", () => {
  it("política: sessão pessoal persiste o áudio e recusa a transcrição antes da rede", async () => {
    const subject = buildSubject({ session: snapshot({ category: "PERSONAL" }) });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "personal_session" });

    expect(subject.transcriptionProvider.callCount).toBe(0);
    expect(subject.attachments.recorded).toEqual([
      expect.objectContaining({ status: "SKIPPED", skipReason: "PERSONAL_SESSION" }),
    ]);
    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.agent.passosPendentes()).toEqual([]);
  });
});

describe("atendimento humano transcreve para a inbox, mas a IA não age", () => {
  it("política: transcrição serve a profissional; o modelo nunca é chamado com humano atendendo", async () => {
    const subject = buildSubject({ session: snapshot({ humanHandling: true }) });

    await expect(
      subject.processor.handleInboundMessage(audioMessage()),
    ).resolves.toMatchObject({ action: "paused_conversation" });

    expect(subject.transcriptionProvider.callCount).toBe(1);
    expect(subject.attachments.recorded).toEqual([
      expect.objectContaining({ status: "DONE" }),
    ]);
    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
    expect(subject.agent.passosPendentes()).toEqual([]);
  });
});

describe("imagem vira handoff sem modelo", () => {
  it("política: imagem com IA elegível pausa para a profissional sem chamar o modelo, mesmo com legenda", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ kind: "image", text: "quero agendar amanha as 10h" }),
      ),
    ).resolves.toMatchObject({ action: "unsupported_handoff" });

    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("imagem") }),
    );
    expect(subject.agent.passosPendentes()).toEqual([]);
  });
});

describe("documento sem legenda confirma sem modelo", () => {
  it("política: documento sem legenda responde com confirmação fixa, sem chamar o modelo", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ kind: "document", text: undefined }),
      ),
    ).resolves.toMatchObject({ action: "unsupported_message" });

    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("documento") }),
    );
    expect(subject.agent.passosPendentes()).toEqual([]);
  });
});

describe("sticker não gera resposta nem chama o modelo", () => {
  it("política: sticker persiste sem handoff, sem resposta e sem renovar sessão", async () => {
    const subject = buildSubject();

    await expect(
      subject.processor.handleInboundMessage(
        baseMessage({ kind: "sticker", text: undefined }),
      ),
    ).resolves.toMatchObject({ action: "unsupported_media_kind" });

    expect(subject.automation.invokeGraphAgent).not.toHaveBeenCalled();
    expect(subject.provider.sendText).not.toHaveBeenCalled();
    expect(subject.agent.passosPendentes()).toEqual([]);
  });
});
