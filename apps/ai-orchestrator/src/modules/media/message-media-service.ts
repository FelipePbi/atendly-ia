import type { PrismaClient } from "../../generated/prisma/client.js";
import type { DiagnosticLogger } from "../../lib/diagnostic-log.js";
import { noopDiagnosticLogger } from "../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../lib/errors.js";
import type {
  DownloadMediaInput,
  DownloadMediaResult,
} from "../channel/ports/WhatsAppProvider.js";
import { decodeBase64Media, readMediaProto } from "./media-bytes.js";

/**
 * Bytes de mídia para exibição sob demanda (Goal013/WU-05).
 *
 * Recusa própria em vez de 500 genérico: mensagem sem attachment, mídia
 * marcada grande demais (nunca tenta baixar) e indisponível (URL hospedada
 * fora do ar ou download sob demanda falhou/sem proto/sem credencial). Nenhum
 * dos três caminhos guarda bytes: eles existem só durante a resposta HTTP.
 */
export type MediaRefusalReason =
  | "MESSAGE_NOT_FOUND"
  | "MESSAGE_ATTACHMENT_NOT_FOUND"
  | "MEDIA_TOO_LARGE"
  | "MEDIA_UNAVAILABLE";

export interface MessageMediaBytes {
  data: Uint8Array;
  mimetype: string;
  fileName?: string;
}

export type ResolveMessageMediaResult =
  | { ok: true; media: MessageMediaBytes }
  | { ok: false; reason: MediaRefusalReason };

export interface ResolveMessageMediaInput {
  tenantId: string;
  conversationId: string;
  messageId: string;
  requestId?: string;
}

export interface MessageMediaProvider {
  downloadMedia?(input: DownloadMediaInput): Promise<DownloadMediaResult>;
}

/**
 * Fábrica do provedor de download sob demanda, a partir do canal da
 * mensagem. Chamada só quando a mídia não tem `mediaUrl` hospedada: erguer a
 * credencial (`resolveChannelCredential`) por antecipação para toda mensagem
 * gastaria descriptografia à toa nos casos que nem chegam a precisar dela.
 */
export type MessageMediaProviderFactory = (channel: {
  tenantId: string;
  externalInstanceId: string;
  credentialCipher: string | null;
  credentialVersion: number;
}) => MessageMediaProvider;

export class MessageMediaService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly buildProvider: MessageMediaProviderFactory,
    private readonly fetchHostedMedia: typeof fetch = fetch,
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
  ) {}

  async resolve(
    input: ResolveMessageMediaInput,
  ): Promise<ResolveMessageMediaResult> {
    const message = await this.prisma.message.findFirst({
      where: {
        tenantId: input.tenantId,
        id: input.messageId,
        conversationId: input.conversationId,
      },
      include: {
        attachments: { orderBy: { createdAt: "asc" }, take: 1 },
        channel: true,
      },
    });
    if (!message) return { ok: false, reason: "MESSAGE_NOT_FOUND" };

    const attachment = message.attachments[0];
    if (!attachment) return { ok: false, reason: "MESSAGE_ATTACHMENT_NOT_FOUND" };
    if (attachment.tooLarge) return { ok: false, reason: "MEDIA_TOO_LARGE" };

    if (attachment.mediaUrl) {
      try {
        const response = await this.fetchHostedMedia(attachment.mediaUrl);
        if (!response.ok) {
          throw new Error(`hosted media responded with HTTP ${response.status}`);
        }
        const data = new Uint8Array(await response.arrayBuffer());
        return {
          ok: true,
          media: {
            data,
            mimetype:
              attachment.mimetype ??
              response.headers.get("content-type") ??
              "application/octet-stream",
            fileName: attachment.fileName ?? undefined,
          },
        };
      } catch (error) {
        this.logger.warn(
          { attachmentId: attachment.id, err: toErrorMessage(error) },
          "Hosted media fetch failed",
        );
        return { ok: false, reason: "MEDIA_UNAVAILABLE" };
      }
    }

    const proto = readMediaProto(message.rawPayload);
    if (!proto) return { ok: false, reason: "MEDIA_UNAVAILABLE" };

    let provider: MessageMediaProvider;
    try {
      provider = this.buildProvider(message.channel);
    } catch (error) {
      this.logger.warn(
        { attachmentId: attachment.id, err: toErrorMessage(error) },
        "Media channel credential unavailable",
      );
      return { ok: false, reason: "MEDIA_UNAVAILABLE" };
    }
    if (!provider.downloadMedia) return { ok: false, reason: "MEDIA_UNAVAILABLE" };

    try {
      const downloaded = await provider.downloadMedia({
        message: proto,
        requestId: input.requestId,
      });
      const decoded = decodeBase64Media(downloaded.base64);
      if (!decoded) return { ok: false, reason: "MEDIA_UNAVAILABLE" };
      return {
        ok: true,
        media: {
          data: decoded.data,
          mimetype:
            attachment.mimetype ?? decoded.mimetype ?? "application/octet-stream",
          fileName: attachment.fileName ?? undefined,
        },
      };
    } catch (error) {
      this.logger.warn(
        { attachmentId: attachment.id, err: toErrorMessage(error) },
        "On-demand media download failed",
      );
      return { ok: false, reason: "MEDIA_UNAVAILABLE" };
    }
  }
}
