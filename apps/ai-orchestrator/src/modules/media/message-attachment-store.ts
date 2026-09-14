import type { PrismaClient } from "../../generated/prisma/client.js";
import type { MessageAttachmentKindValue } from "./media-metadata.js";

/** Espelha o enum Prisma `TranscriptStatus` (schema.prisma). */
export type TranscriptStatusValue = "PENDING" | "DONE" | "FAILED" | "SKIPPED";

/**
 * O que a transcrição precisa saber do attachment já persistido: o que a mídia
 * é, se os bytes chegaram e o que já foi decidido sobre ela antes.
 */
export interface AttachmentTranscriptionSnapshot {
  id: string;
  kind: MessageAttachmentKindValue;
  mimetype: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  tooLarge: boolean;
  transcript: string | null;
  transcriptStatus: TranscriptStatusValue | null;
}

export interface RecordTranscriptionInput {
  tenantId: string;
  attachmentId: string;
  status: TranscriptStatusValue;
  transcript?: string;
  /** Motivo da falha, com o código de recusa na frente. */
  error?: string;
  /** Motivo nomeado da decisão de não transcrever. */
  skipReason?: string;
  provider?: string;
  model?: string;
  transcribedAt?: Date;
}

/**
 * Porta do attachment para a transcrição.
 *
 * Só duas operações, de propósito: ler o que já se sabe da mídia e gravar o
 * desfecho da transcrição com proveniência. Criar o attachment continua sendo
 * de quem persiste a mensagem (`AssistantService.recordInboundText`).
 */
export interface MessageAttachmentPort {
  findForMessage(input: {
    tenantId: string;
    messageId: string;
    kind: MessageAttachmentKindValue;
  }): Promise<AttachmentTranscriptionSnapshot | null>;
  recordTranscription(input: RecordTranscriptionInput): Promise<void>;
}

export class PrismaMessageAttachmentStore implements MessageAttachmentPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findForMessage(input: {
    tenantId: string;
    messageId: string;
    kind: MessageAttachmentKindValue;
  }): Promise<AttachmentTranscriptionSnapshot | null> {
    const attachment = await this.prisma.messageAttachment.findFirst({
      where: {
        tenantId: input.tenantId,
        messageId: input.messageId,
        kind: input.kind,
      },
      orderBy: { createdAt: "asc" },
    });
    if (!attachment) return null;
    return {
      id: attachment.id,
      kind: attachment.kind,
      mimetype: attachment.mimetype,
      fileName: attachment.fileName,
      sizeBytes: attachment.sizeBytes,
      durationSeconds: attachment.durationSeconds,
      tooLarge: attachment.tooLarge,
      transcript: attachment.transcript,
      transcriptStatus: attachment.transcriptStatus,
    };
  }

  async recordTranscription(input: RecordTranscriptionInput): Promise<void> {
    await this.prisma.messageAttachment.updateMany({
      where: { tenantId: input.tenantId, id: input.attachmentId },
      data: {
        transcriptStatus: input.status,
        // Nulo explícito no que não vale para este desfecho: uma nova tentativa
        // não pode deixar para trás o erro (ou o texto) da tentativa anterior.
        transcript: input.transcript ?? null,
        transcriptError: input.error ?? null,
        skipReason: input.skipReason ?? null,
        transcriptProvider: input.provider ?? null,
        transcriptModel: input.model ?? null,
        transcribedAt: input.transcribedAt ?? null,
      },
    });
  }
}
