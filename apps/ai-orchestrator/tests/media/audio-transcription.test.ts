/**
 * Transcricao de audio sob a politica de contato e sessao (Goal013/WU-03).
 *
 * O duble de transcricao conta chamadas de proposito: "contato ignorado nao e
 * transcrito" so esta provado se o provedor puder dizer que **nao foi
 * chamado**. Cada desfecho tambem e verificado no que foi gravado no
 * attachment — status, motivo e proveniencia —, porque "sem transcricao" nunca
 * pode ser silencio.
 */
import { describe, expect, it, vi } from "vitest";

import type { ChannelInboundMessage } from "../../src/modules/channel/domain/ChannelMessage.js";
import { AudioTranscriptionService } from "../../src/modules/media/audio-transcription.js";
import { FakeTranscriptionProvider } from "../../src/modules/media/fake-transcription-provider.js";
import type {
  AttachmentTranscriptionSnapshot,
  MessageAttachmentPort,
  RecordTranscriptionInput,
} from "../../src/modules/media/message-attachment-store.js";

const audioBytes = Buffer.from("bytes-de-audio");

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
    raw: {
      data: {
        Info: {},
        Message: {
          audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 8 },
          base64: audioBytes.toString("base64"),
        },
      },
    },
    ...overrides,
  };
}

/** Mesmo payload, sem os bytes embutidos: e o caso do download sob demanda. */
function audioMessageWithoutBase64(): ChannelInboundMessage {
  return audioMessage({
    raw: {
      data: {
        Info: {},
        Message: {
          audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 8 },
          mediaUrl: "http://minio/audio.ogg",
        },
      },
    },
  });
}

function createAttachments(
  overrides: Partial<AttachmentTranscriptionSnapshot> = {},
) {
  const row: AttachmentTranscriptionSnapshot = {
    id: "attachment-1",
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
  const recorded: RecordTranscriptionInput[] = [];
  const port: MessageAttachmentPort = {
    findForMessage: vi.fn().mockResolvedValue(row),
    recordTranscription: vi.fn(async (input: RecordTranscriptionInput) => {
      recorded.push(input);
    }),
  };
  return { row, recorded, port };
}

function createDownload(base64?: string) {
  return {
    downloadMedia: vi.fn(async () => {
      if (!base64) throw new Error("download indisponivel");
      return { provider: "evolution-go" as const, base64 };
    }),
  };
}

describe("politica antes do provedor", () => {
  it.each([
    ["CONTACT_IGNORED", "CONTACT_IGNORED"],
    ["PERSONAL_SESSION", "PERSONAL_SESSION"],
  ] as const)(
    "nao chama o provedor quando a politica bloqueia (%s) e grava SKIPPED com o motivo",
    async (block, reason) => {
      const attachments = createAttachments();
      const provider = new FakeTranscriptionProvider();
      const download = createDownload(
        `data:audio/ogg;base64,${audioBytes.toString("base64")}`,
      );
      const service = new AudioTranscriptionService(
        attachments.port,
        provider,
        download,
      );

      const outcome = await service.transcribeInboundAudio({
        message: audioMessage(),
        messageRecordId: "message-record-1",
        policyBlock: block,
      });

      expect(provider.callCount).toBe(0);
      expect(download.downloadMedia).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ status: "SKIPPED", reason });
      expect(attachments.recorded).toEqual([
        expect.objectContaining({
          attachmentId: "attachment-1",
          status: "SKIPPED",
          skipReason: reason,
          transcript: undefined,
        }),
      ]);
    },
  );

  it("grava SKIPPED sem chamar o provedor quando a midia ficou acima do teto de inline (tooLarge)", async () => {
    const attachments = createAttachments({ tooLarge: true });
    const provider = new FakeTranscriptionProvider();
    const service = new AudioTranscriptionService(attachments.port, provider);

    const outcome = await service.transcribeInboundAudio({
      message: audioMessage(),
      messageRecordId: "message-record-1",
    });

    expect(provider.callCount).toBe(0);
    expect(outcome).toMatchObject({
      status: "SKIPPED",
      reason: "MEDIA_TOO_LARGE",
    });
    expect(attachments.recorded[0]).toMatchObject({
      status: "SKIPPED",
      skipReason: "MEDIA_TOO_LARGE",
    });
  });

  it("grava SKIPPED sem chamar o provedor quando o audio passa do teto de tamanho", async () => {
    const attachments = createAttachments({ sizeBytes: 512 * 1024 * 1024 });
    const provider = new FakeTranscriptionProvider();
    const service = new AudioTranscriptionService(attachments.port, provider);

    const outcome = await service.transcribeInboundAudio({
      message: audioMessage(),
      messageRecordId: "message-record-1",
    });

    expect(provider.callCount).toBe(0);
    expect(outcome).toMatchObject({
      status: "SKIPPED",
      reason: "MEDIA_TOO_LARGE",
    });
  });

  it("grava SKIPPED sem chamar o provedor quando o audio passa do teto de duracao", async () => {
    const attachments = createAttachments({ durationSeconds: 60 * 60 });
    const provider = new FakeTranscriptionProvider();
    const service = new AudioTranscriptionService(attachments.port, provider);

    const outcome = await service.transcribeInboundAudio({
      message: audioMessage(),
      messageRecordId: "message-record-1",
    });

    expect(provider.callCount).toBe(0);
    expect(outcome).toMatchObject({
      status: "SKIPPED",
      reason: "AUDIO_TOO_LONG",
    });
    expect(attachments.recorded[0]).toMatchObject({
      skipReason: "AUDIO_TOO_LONG",
    });
  });

  it("nao chama o provedor quando a mensagem nao foi persistida: nao ha attachment onde gravar o desfecho", async () => {
    const attachments = createAttachments();
    const provider = new FakeTranscriptionProvider();
    const service = new AudioTranscriptionService(attachments.port, provider);

    const outcome = await service.transcribeInboundAudio({
      message: audioMessage(),
    });

    expect(provider.callCount).toBe(0);
    expect(attachments.recorded).toHaveLength(0);
    expect(outcome).toMatchObject({
      status: "SKIPPED",
      reason: "NO_ATTACHMENT",
    });
  });
});

describe("fonte dos bytes", () => {
  it("usa o base64 do evento em processamento e nao baixa nada", async () => {
    const attachments = createAttachments();
    const provider = new FakeTranscriptionProvider({ text: "quero agendar" });
    const download = createDownload("data:audio/ogg;base64,outro");
    const service = new AudioTranscriptionService(
      attachments.port,
      provider,
      download,
    );

    const outcome = await service.transcribeInboundAudio({
      message: audioMessage(),
      messageRecordId: "message-record-1",
    });

    expect(download.downloadMedia).not.toHaveBeenCalled();
    expect(provider.callCount).toBe(1);
    expect(Buffer.from(provider.requests[0].audio.data).toString()).toBe(
      "bytes-de-audio",
    );
    expect(provider.requests[0].audio.mimetype).toBe("audio/ogg; codecs=opus");
    expect(outcome).toMatchObject({
      status: "DONE",
      text: "quero agendar",
      source: "inline_base64",
    });
  });

  it("baixa sob demanda com o proto guardado quando o evento nao trouxe os bytes", async () => {
    const attachments = createAttachments();
    const provider = new FakeTranscriptionProvider({ text: "pode confirmar" });
    const download = createDownload(
      `data:audio/ogg;codecs=opus;base64,${audioBytes.toString("base64")}`,
    );
    const service = new AudioTranscriptionService(
      attachments.port,
      provider,
      download,
    );

    const outcome = await service.transcribeInboundAudio({
      message: audioMessageWithoutBase64(),
      messageRecordId: "message-record-1",
    });

    expect(download.downloadMedia).toHaveBeenCalledWith({
      message: expect.objectContaining({
        audioMessage: expect.objectContaining({ seconds: 8 }),
      }),
      requestId: "request-1",
    });
    expect(provider.callCount).toBe(1);
    expect(outcome).toMatchObject({
      status: "DONE",
      text: "pode confirmar",
      source: "on_demand_download",
    });
    expect(attachments.recorded[0]).toMatchObject({
      status: "DONE",
      transcript: "pode confirmar",
      provider: "fake",
      model: "fake-transcribe",
    });
    expect(attachments.recorded[0].transcribedAt).toBeInstanceOf(Date);
  });

  it("falha do download vira MEDIA_UNAVAILABLE, sem chamar o provedor e sem lancar", async () => {
    const attachments = createAttachments();
    const provider = new FakeTranscriptionProvider();
    const download = createDownload();
    const service = new AudioTranscriptionService(
      attachments.port,
      provider,
      download,
    );

    const outcome = await service.transcribeInboundAudio({
      message: audioMessageWithoutBase64(),
      messageRecordId: "message-record-1",
    });

    expect(download.downloadMedia).toHaveBeenCalledTimes(1);
    expect(provider.callCount).toBe(0);
    expect(outcome).toMatchObject({
      status: "FAILED",
      reason: "MEDIA_UNAVAILABLE",
    });
    expect(attachments.recorded[0]).toMatchObject({
      status: "FAILED",
      error: "MEDIA_UNAVAILABLE",
      transcript: undefined,
    });
  });

  it("sem bytes e sem porta de download, a midia esta indisponivel: FAILED, nunca texto inventado", async () => {
    const attachments = createAttachments();
    const provider = new FakeTranscriptionProvider();
    const service = new AudioTranscriptionService(attachments.port, provider);

    const outcome = await service.transcribeInboundAudio({
      message: audioMessageWithoutBase64(),
      messageRecordId: "message-record-1",
    });

    expect(provider.callCount).toBe(0);
    expect(outcome).toMatchObject({
      status: "FAILED",
      reason: "MEDIA_UNAVAILABLE",
    });
    expect(outcome.text).toBeUndefined();
  });
});

describe("desfecho da transcricao", () => {
  it("falha do provedor grava FAILED com motivo e nao inventa texto", async () => {
    const attachments = createAttachments();
    const provider = new FakeTranscriptionProvider({
      failWith: new Error("openai fora do ar"),
    });
    const service = new AudioTranscriptionService(attachments.port, provider);

    const outcome = await service.transcribeInboundAudio({
      message: audioMessage(),
      messageRecordId: "message-record-1",
    });

    expect(provider.callCount).toBe(1);
    expect(outcome).toMatchObject({
      status: "FAILED",
      reason: "PROVIDER_FAILED",
    });
    expect(outcome.text).toBeUndefined();
    expect(attachments.recorded[0]).toMatchObject({
      status: "FAILED",
      transcript: undefined,
      provider: "fake",
    });
    expect(attachments.recorded[0].error).toContain("PROVIDER_FAILED");
    expect(attachments.recorded[0].error).toContain("openai fora do ar");
  });

  it("transcricao vazia e falha, nao resultado", async () => {
    const attachments = createAttachments();
    const provider = new FakeTranscriptionProvider({ text: "   " });
    const service = new AudioTranscriptionService(attachments.port, provider);

    const outcome = await service.transcribeInboundAudio({
      message: audioMessage(),
      messageRecordId: "message-record-1",
    });

    expect(outcome).toMatchObject({
      status: "FAILED",
      reason: "EMPTY_TRANSCRIPT",
    });
    expect(attachments.recorded[0].transcript).toBeUndefined();
  });

  it("audio ja transcrito nao e transcrito de novo: o lote agrupado nao paga duas chamadas", async () => {
    const attachments = createAttachments({
      transcriptStatus: "DONE",
      transcript: "quero agendar amanha",
    });
    const provider = new FakeTranscriptionProvider();
    const service = new AudioTranscriptionService(attachments.port, provider);

    const outcome = await service.transcribeInboundAudio({
      message: audioMessage(),
      messageRecordId: "message-record-1",
    });

    expect(provider.callCount).toBe(0);
    expect(attachments.recorded).toHaveLength(0);
    expect(outcome).toMatchObject({
      status: "DONE",
      text: "quero agendar amanha",
      source: "already_transcribed",
    });
  });

  it("desfecho terminal anterior (FAILED) nao e retentado dentro do mesmo turno", async () => {
    const attachments = createAttachments({ transcriptStatus: "FAILED" });
    const provider = new FakeTranscriptionProvider();
    const service = new AudioTranscriptionService(attachments.port, provider);

    const outcome = await service.transcribeInboundAudio({
      message: audioMessage(),
      messageRecordId: "message-record-1",
    });

    expect(provider.callCount).toBe(0);
    expect(outcome).toMatchObject({ status: "FAILED" });
  });
});
