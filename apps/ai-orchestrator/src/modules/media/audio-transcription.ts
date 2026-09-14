import { env } from "../../config/env.js";
import {
  channelMessageLogContext,
  type DiagnosticLogger,
  noopDiagnosticLogger,
  truncateDiagnostic,
} from "../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../lib/errors.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import type {
  DownloadMediaInput,
  DownloadMediaResult,
} from "../channel/ports/WhatsAppProvider.js";
import {
  decodeBase64Media,
  readInlineMediaBase64,
  readMediaProto,
} from "./media-bytes.js";
import type {
  AttachmentTranscriptionSnapshot,
  MessageAttachmentPort,
  TranscriptStatusValue,
} from "./message-attachment-store.js";
import type { TranscriptionProvider } from "./transcription-provider.js";

/**
 * Motivo nomeado de **não** transcrever. Nenhum deles é erro: são decisões, e
 * cada uma fica gravada no attachment para que a inbox e o review saibam por
 * que aquele áudio não tem texto.
 */
export type TranscriptionSkipReason =
  "CONTACT_IGNORED" | "PERSONAL_SESSION" | "MEDIA_TOO_LARGE" | "AUDIO_TOO_LONG";

/** Motivo da falha. `MEDIA_UNAVAILABLE` é a origem, não a transcrição. */
export type TranscriptionFailureReason =
  "MEDIA_UNAVAILABLE" | "PROVIDER_FAILED" | "EMPTY_TRANSCRIPT";

/** Só existe attachment quando a mensagem foi persistida nesta execução. */
export type TranscriptionUnavailableReason = "NO_ATTACHMENT";

export type TranscriptionBytesSource =
  "inline_base64" | "on_demand_download" | "already_transcribed";

export interface InboundTranscription {
  status: TranscriptStatusValue;
  /** Texto transcrito; ausente em tudo que não seja `DONE`. */
  text?: string;
  reason?:
    | TranscriptionSkipReason
    | TranscriptionFailureReason
    | TranscriptionUnavailableReason;
  source?: TranscriptionBytesSource;
}

/** Política do contato e da sessão, decidida antes por quem chama. */
export type TranscriptionPolicyBlock = "CONTACT_IGNORED" | "PERSONAL_SESSION";

export interface TranscribeInboundAudioInput {
  message: ChannelInboundMessage;
  /** `Message.id` já persistido; sem ele não há attachment para gravar. */
  messageRecordId?: string;
  policyBlock?: TranscriptionPolicyBlock;
}

export interface InboundAudioTranscriptionPort {
  transcribeInboundAudio(
    input: TranscribeInboundAudioInput,
  ): Promise<InboundTranscription>;
}

export interface MediaDownloadPort {
  downloadMedia(input: DownloadMediaInput): Promise<DownloadMediaResult>;
}

/**
 * Transcrição de áudio recebido, sob a política de contato e sessão.
 *
 * A ordem é a regra: primeiro a política (contato ignorado e sessão pessoal
 * nunca chegam ao provedor), depois os tetos (mídia grande demais é decisão,
 * não falha), depois os bytes e só então a rede. Cada caminho grava um desfecho
 * no attachment — `DONE`, `FAILED` com motivo ou `SKIPPED` com motivo — para
 * que "sem transcrição" nunca seja silêncio.
 *
 * Um áudio é transcrito **uma vez**: qualquer status terminal já gravado é
 * reaproveitado sem nova chamada. É o que permite o mesmo áudio atravessar o
 * agrupamento de fragmentos (a passagem diferida e a final) sem pagar duas
 * transcrições.
 */
export class AudioTranscriptionService implements InboundAudioTranscriptionPort {
  constructor(
    private readonly attachments: MessageAttachmentPort,
    private readonly provider: TranscriptionProvider,
    private readonly media?: MediaDownloadPort,
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
  ) {}

  async transcribeInboundAudio(
    input: TranscribeInboundAudioInput,
  ): Promise<InboundTranscription> {
    const { message, messageRecordId } = input;
    const logContext = channelMessageLogContext(message);

    if (!messageRecordId) {
      this.logger.warn(
        logContext,
        "Inbound audio has no persisted message: transcription has nowhere to be recorded",
      );
      return { status: "SKIPPED", reason: "NO_ATTACHMENT" };
    }

    const attachment = await this.attachments.findForMessage({
      tenantId: message.tenantId,
      messageId: messageRecordId,
      kind: "AUDIO",
    });
    if (!attachment) {
      this.logger.warn(
        { ...logContext, messageRecordId },
        "Inbound audio has no attachment row: nothing to transcribe against",
      );
      return { status: "SKIPPED", reason: "NO_ATTACHMENT" };
    }

    const settled = readSettledOutcome(attachment);
    if (settled) return settled;

    if (input.policyBlock) {
      return this.settle(message, attachment.id, {
        status: "SKIPPED",
        reason: input.policyBlock,
      });
    }

    const overLimit = readLimitSkipReason(attachment);
    if (overLimit) {
      return this.settle(message, attachment.id, {
        status: "SKIPPED",
        reason: overLimit,
      });
    }

    const audio = await this.loadAudioBytes(message, attachment);
    if (!audio) {
      return this.settle(message, attachment.id, {
        status: "FAILED",
        reason: "MEDIA_UNAVAILABLE",
      });
    }

    // Os bytes baixados também respeitam o teto: o tamanho declarado no proto
    // pode faltar, e transcrever um arquivo acima do limite da API só trocaria
    // uma decisão explícita por um erro de rede.
    if (audio.data.byteLength > env.AUDIO_TRANSCRIPTION_MAX_BYTES) {
      return this.settle(message, attachment.id, {
        status: "SKIPPED",
        reason: "MEDIA_TOO_LARGE",
      });
    }

    try {
      const result = await this.provider.transcribe({
        audio: {
          data: audio.data,
          mimetype:
            attachment.mimetype ?? audio.mimetype ?? message.media?.mimetype,
          fileName: attachment.fileName ?? undefined,
          durationSeconds: attachment.durationSeconds ?? undefined,
        },
        language: env.OPENAI_TRANSCRIPTION_LANGUAGE || undefined,
        requestId: message.requestId,
      });
      const text = result.text.trim();
      if (!text) {
        return this.settle(message, attachment.id, {
          status: "FAILED",
          reason: "EMPTY_TRANSCRIPT",
          provider: result.provider,
          model: result.model,
        });
      }
      return this.settle(message, attachment.id, {
        status: "DONE",
        text,
        source: audio.source,
        provider: result.provider,
        model: result.model,
      });
    } catch (error) {
      // Falha de transcrição não inventa texto e não derruba o turno: fica
      // gravada com motivo, e quem chamou decide o que responder.
      this.logger.error(
        { ...logContext, messageRecordId, err: toErrorMessage(error) },
        "Audio transcription provider failed",
      );
      return this.settle(message, attachment.id, {
        status: "FAILED",
        reason: "PROVIDER_FAILED",
        detail: toErrorMessage(error),
        provider: this.provider.provider,
        model: this.provider.model,
      });
    }
  }

  /**
   * Bytes do áudio: o `base64` embutido no evento em processamento primeiro e,
   * na falta dele, o download sob demanda com o proto guardado.
   */
  private async loadAudioBytes(
    message: ChannelInboundMessage,
    attachment: AttachmentTranscriptionSnapshot,
  ): Promise<{
    data: Uint8Array;
    mimetype?: string;
    source: TranscriptionBytesSource;
  } | null> {
    const inline = readInlineMediaBase64(message.raw);
    if (inline) {
      const decoded = decodeBase64Media(inline);
      if (decoded) return { ...decoded, source: "inline_base64" };
      this.logger.warn(
        channelMessageLogContext(message),
        "Inbound audio carried a base64 payload that could not be decoded",
      );
    }

    const proto = readMediaProto(message.raw);
    if (!this.media || !proto) return null;

    try {
      const downloaded = await this.media.downloadMedia({
        message: proto,
        requestId: message.requestId,
      });
      const decoded = decodeBase64Media(downloaded.base64);
      if (!decoded) return null;
      return { ...decoded, source: "on_demand_download" };
    } catch (error) {
      this.logger.warn(
        {
          ...channelMessageLogContext(message),
          attachmentId: attachment.id,
          err: toErrorMessage(error),
        },
        "On-demand media download failed: audio is unavailable at the origin",
      );
      return null;
    }
  }

  private async settle(
    message: ChannelInboundMessage,
    attachmentId: string,
    outcome: {
      status: TranscriptStatusValue;
      text?: string;
      reason?: InboundTranscription["reason"];
      detail?: string;
      source?: TranscriptionBytesSource;
      provider?: string;
      model?: string;
    },
  ): Promise<InboundTranscription> {
    await this.attachments.recordTranscription({
      tenantId: message.tenantId,
      attachmentId,
      status: outcome.status,
      transcript: outcome.text,
      error:
        outcome.status === "FAILED"
          ? truncateDiagnostic(
              outcome.detail
                ? `${outcome.reason}: ${outcome.detail}`
                : outcome.reason,
            )
          : undefined,
      skipReason: outcome.status === "SKIPPED" ? outcome.reason : undefined,
      provider: outcome.provider,
      model: outcome.model,
      transcribedAt: outcome.status === "DONE" ? new Date() : undefined,
    });
    this.logger.info(
      {
        ...channelMessageLogContext(message),
        attachmentId,
        transcriptStatus: outcome.status,
        reason: outcome.reason,
        source: outcome.source,
        transcriptProvider: outcome.provider,
        transcriptModel: outcome.model,
      },
      "Inbound audio transcription settled",
    );
    return {
      status: outcome.status,
      text: outcome.status === "DONE" ? outcome.text : undefined,
      reason: outcome.reason,
      source: outcome.source,
    };
  }
}

/**
 * Desfecho já gravado para este áudio. `PENDING` não conta: é fila, não
 * decisão, e pode ser retomado.
 */
function readSettledOutcome(
  attachment: AttachmentTranscriptionSnapshot,
): InboundTranscription | null {
  if (attachment.transcriptStatus === "DONE" && attachment.transcript?.trim()) {
    return {
      status: "DONE",
      text: attachment.transcript.trim(),
      source: "already_transcribed",
    };
  }
  if (
    attachment.transcriptStatus === "FAILED" ||
    attachment.transcriptStatus === "SKIPPED"
  ) {
    return { status: attachment.transcriptStatus };
  }
  return null;
}

function readLimitSkipReason(
  attachment: AttachmentTranscriptionSnapshot,
): TranscriptionSkipReason | null {
  if (attachment.tooLarge) return "MEDIA_TOO_LARGE";
  if (
    attachment.sizeBytes !== null &&
    attachment.sizeBytes > env.AUDIO_TRANSCRIPTION_MAX_BYTES
  ) {
    return "MEDIA_TOO_LARGE";
  }
  if (
    attachment.durationSeconds !== null &&
    attachment.durationSeconds > env.AUDIO_TRANSCRIPTION_MAX_SECONDS
  ) {
    return "AUDIO_TOO_LONG";
  }
  return null;
}
