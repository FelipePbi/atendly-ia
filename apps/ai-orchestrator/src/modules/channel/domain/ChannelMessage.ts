import type { AiTenantSettings } from "../../tenant-config/ai-settings.js";
import type { BusinessContext } from "../../tenant-config/business-context.js";

export type ChannelProviderName = "evolution-go";
export type ChannelMessageKind =
  | "text"
  | "audio"
  | "image"
  | "document"
  | "video"
  | "sticker"
  | "unknown";

/**
 * Metadados da mídia extraídos do payload do provedor, sem os bytes.
 *
 * `hasBase64`/`hasMediaUrl` dizem como os bytes chegaram (inline ou já
 * hospedados); `mediaUrl` só existe quando o provedor hospedou a mídia. O
 * download sob demanda (WU-03) usa os campos do proto no `raw` do payload, não
 * este objeto.
 */
export interface MediaMetadata {
  mimetype?: string;
  fileName?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  sha256?: string;
  hasBase64: boolean;
  hasMediaUrl: boolean;
  mediaUrl?: string;
  tooLarge: boolean;
  /**
   * GIF do WhatsApp: chega como `videoMessage` com `gifPlayback: true`, e não
   * como mídia de tipo próprio. O produto trata GIF junto de sticker — não
   * decide nada, não responde e não renova a sessão —, então o `kind`
   * continua `video` (é o que o arquivo é e o que o attachment guarda) e esta
   * marca é o que separa os dois no grafo (Goal013).
   */
  gifPlayback?: boolean;
}

export interface MappedChannelInboundMessage {
  provider: ChannelProviderName;
  instanceId: string;
  messageId: string;
  chatId: string;
  customerPhone: string;
  customerName?: string;
  fromMe: boolean;
  isGroup: boolean;
  kind: ChannelMessageKind;
  text?: string;
  media?: MediaMetadata;
  timestamp?: string;
  raw: unknown;
}

export interface ChannelExecutionContext {
  tenantId: string;
  channelId: string;
  userId: string;
  requestId: string;
  businessContext?: BusinessContext;
  aiSettings?: AiTenantSettings;
}

export type ChannelInboundMessage = MappedChannelInboundMessage &
  ChannelExecutionContext;
