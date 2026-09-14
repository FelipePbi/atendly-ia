import { normalizePhone } from "../../../../lib/phone.js";
import type {
  ChannelMessageKind,
  MappedChannelInboundMessage,
  MediaMetadata,
} from "../../domain/ChannelMessage.js";

const messageEvents = new Set([
  "Message",
  "SendMessage",
  "MESSAGE",
  "SEND_MESSAGE",
]);

const receiptEvents = new Set(["Receipt", "RECEIPT", "READ_RECEIPT"]);

/**
 * Classificacao do evento antes de qualquer decisao de resposta HTTP.
 *
 * Ate o Goal004 tudo que nao mapeava para mensagem virava 400, e o produtor Go
 * repetia cinco vezes um evento que jamais seria aceito. Agora o transporte
 * distingue tres coisas: trabalho de conversa (`message`), reconciliacao de
 * entrega (`receipt`) e evento tecnico registravel (`technical`). Só payload
 * ilegivel continua sendo recusado.
 */
export type EvolutionEventKind = "message" | "receipt" | "technical" | "invalid";

export interface EvolutionEventClassification {
  kind: EvolutionEventKind;
  event?: string;
  instanceId?: string;
  /** Chave de dedupe do evento, estavel para o mesmo evento reentregue. */
  eventKey?: string;
  reason?: string;
}

export interface EvolutionReceipt {
  instanceId: string;
  chatId?: string;
  /** IDs do transporte reconhecidos pelo recibo; batem com correlationId. */
  messageIds: string[];
  state: "delivered" | "read";
  timestamp?: string;
  raw: unknown;
}

export function classifyEvolutionEvent(
  payload: unknown,
): EvolutionEventClassification {
  if (!isRecord(payload)) {
    return { kind: "invalid", reason: "payload_not_object" };
  }

  const event = stringValue(payload.event);
  if (!event) return { kind: "invalid", reason: "missing_event" };

  const instanceId =
    stringValue(payload.instanceId) || stringValue(payload.instance);
  if (!instanceId) {
    return { kind: "invalid", event, reason: "missing_instance_id" };
  }

  if (messageEvents.has(event)) {
    const info = recordValue(recordValue(payload.data)?.Info);
    const messageId = stringValue(info?.ID);
    if (!messageId) {
      return { kind: "invalid", event, instanceId, reason: "missing_message_id" };
    }
    return {
      kind: "message",
      event,
      instanceId,
      eventKey: `evolution-go:${instanceId}:${messageId}`,
    };
  }

  if (receiptEvents.has(event)) {
    const receipt = mapEvolutionReceipt(payload);
    if (!receipt) {
      return { kind: "invalid", event, instanceId, reason: "missing_receipt_ids" };
    }
    return {
      kind: "receipt",
      event,
      instanceId,
      eventKey: `evolution-go:${instanceId}:receipt:${receipt.state}:${receipt.messageIds.join(",")}`,
    };
  }

  return {
    kind: "technical",
    event,
    instanceId,
    // Eventos tecnicos nao trazem ID proprio; a chave usa o conteudo saneado
    // para que a reentrega do mesmo evento continue sendo duplicata.
    eventKey: `evolution-go:${instanceId}:${event}:${technicalFingerprint(payload)}`,
  };
}

/**
 * Recibo de entrega/leitura vindo do Go. Reconcilia saidas que ficaram
 * `unknown`: `MessageIDs` contem o operation-id que a Atendly enviou.
 */
export function mapEvolutionReceipt(payload: unknown): EvolutionReceipt | null {
  if (!isRecord(payload)) return null;

  const event = stringValue(payload.event);
  if (!event || !receiptEvents.has(event)) return null;

  const instanceId =
    stringValue(payload.instanceId) || stringValue(payload.instance);
  if (!instanceId) return null;

  const data = recordValue(payload.data);
  const messageIds = stringArray(data?.MessageIDs ?? data?.messageIds);
  if (messageIds.length === 0) return null;

  const state = normalizeReceiptState(
    stringValue(payload.state) ?? stringValue(data?.Type),
  );
  if (!state) return null;

  return {
    instanceId,
    chatId: stringValue(data?.Chat),
    messageIds,
    state,
    timestamp: stringValue(data?.Timestamp),
    raw: payload,
  };
}

function normalizeReceiptState(
  value: string | undefined,
): "delivered" | "read" | null {
  const normalized = value?.toLowerCase();
  if (!normalized) return null;
  if (normalized === "delivered" || normalized === "delivery_ack") {
    return "delivered";
  }
  // ReadSelf e leitura do proprio dono em outro aparelho: continua sendo prova
  // de que a mensagem existe no transporte.
  if (normalized.startsWith("read")) return "read";
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringValue(item))
    .filter((item): item is string => Boolean(item));
}

// Impressao curta e estavel do evento tecnico, sem segredo: o payload que chega
// aqui ja passou por `redactSensitive`.
function technicalFingerprint(payload: Record<string, unknown>): string {
  const data = recordValue(payload.data);
  const parts = [
    stringValue(payload.state),
    stringValue(data?.Timestamp) ?? stringValue(data?.timestamp),
    stringValue(data?.ID) ?? stringValue(data?.Chat) ?? stringValue(data?.JID),
  ].filter(Boolean);
  if (parts.length > 0) return parts.join("|");
  return hashFingerprint(JSON.stringify(payload.data ?? null));
}

function hashFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export interface EvolutionInboundInspection {
  isObject: boolean;
  event?: string;
  supportedEvent: boolean;
  hasData: boolean;
  hasInfo: boolean;
  hasMessage: boolean;
  hasInstanceId: boolean;
  hasMessageId: boolean;
  hasChatId: boolean;
  rejectionReason?: string;
}

export function mapEvolutionInbound(
  payload: unknown,
): MappedChannelInboundMessage | null {
  if (!isRecord(payload)) return null;

  const event = stringValue(payload.event);
  if (!event || !messageEvents.has(event)) return null;

  const data = recordValue(payload.data);
  const info = recordValue(data?.Info);
  const message = recordValue(data?.Message);
  if (!info || !message) return null;

  const instanceId =
    stringValue(payload.instanceId) || stringValue(payload.instance);
  const messageId = stringValue(info.ID);
  const chatId = stringValue(info.Chat);
  if (!instanceId || !messageId || !chatId) return null;

  const mediaType = stringValue(info.MediaType);
  const infoType = stringValue(info.Type);
  const fromMe = booleanValue(info.IsFromMe);
  const kind = resolveKind(infoType, mediaType);
  const text = extractText(message);
  const media = extractMediaMetadata(message, kind);
  const customerJid = fromMe ? chatId : stringValue(info.Sender) || chatId;

  return {
    provider: "evolution-go",
    instanceId,
    messageId,
    chatId,
    customerPhone: normalizePhone(customerJid),
    customerName: stringValue(info.PushName),
    fromMe,
    isGroup: booleanValue(info.IsGroup) || chatId.endsWith("@g.us"),
    kind,
    text,
    media,
    timestamp: stringValue(info.Timestamp),
    raw: payload,
  };
}

export function inspectEvolutionInboundPayload(
  payload: unknown,
): EvolutionInboundInspection {
  if (!isRecord(payload)) {
    return {
      isObject: false,
      supportedEvent: false,
      hasData: false,
      hasInfo: false,
      hasMessage: false,
      hasInstanceId: false,
      hasMessageId: false,
      hasChatId: false,
      rejectionReason: "payload_not_object",
    };
  }

  const event = stringValue(payload.event);
  const data = recordValue(payload.data);
  const info = recordValue(data?.Info);
  const message = recordValue(data?.Message);
  const supportedEvent = Boolean(event && messageEvents.has(event));
  const hasInstanceId = Boolean(
    stringValue(payload.instanceId) || stringValue(payload.instance),
  );
  const hasMessageId = Boolean(stringValue(info?.ID));
  const hasChatId = Boolean(stringValue(info?.Chat));

  let rejectionReason: string | undefined;
  if (!event) rejectionReason = "missing_event";
  else if (!supportedEvent) rejectionReason = "unsupported_event";
  else if (!data) rejectionReason = "missing_data";
  else if (!info) rejectionReason = "missing_info";
  else if (!message) rejectionReason = "missing_message";
  else if (!hasInstanceId) rejectionReason = "missing_instance_id";
  else if (!hasMessageId) rejectionReason = "missing_message_id";
  else if (!hasChatId) rejectionReason = "missing_chat_id";

  return {
    isObject: true,
    event,
    supportedEvent,
    hasData: Boolean(data),
    hasInfo: Boolean(info),
    hasMessage: Boolean(message),
    hasInstanceId,
    hasMessageId,
    hasChatId,
    rejectionReason,
  };
}

function resolveKind(
  infoType: string | undefined,
  mediaType: string | undefined,
): ChannelMessageKind {
  const normalizedMediaType = mediaType?.toLowerCase();
  if (normalizedMediaType === "audio") return "audio";
  if (normalizedMediaType === "image") return "image";
  if (normalizedMediaType === "document") return "document";
  if (normalizedMediaType === "video") return "video";
  if (normalizedMediaType === "sticker") return "sticker";

  const normalizedInfoType = infoType?.toLowerCase();
  if (
    !normalizedInfoType ||
    normalizedInfoType === "text" ||
    normalizedInfoType.includes("text")
  )
    return "text";
  if (normalizedInfoType.includes("audio")) return "audio";
  if (normalizedInfoType.includes("image")) return "image";
  if (normalizedInfoType.includes("document")) return "document";
  if (normalizedInfoType.includes("video")) return "video";
  if (normalizedInfoType.includes("sticker")) return "sticker";

  return "unknown";
}

const mediaMessageKeyByKind: Partial<Record<ChannelMessageKind, string>> = {
  audio: "audioMessage",
  image: "imageMessage",
  document: "documentMessage",
  video: "videoMessage",
  sticker: "stickerMessage",
};

/**
 * Metadados da mídia, sem os bytes.
 *
 * `mimetype`/`fileName`/`sizeBytes` preferem o objeto do proto (`audioMessage`,
 * `imageMessage`, ...) e caem para os campos que o Go mescla em `data.Message`
 * só quando a mídia excedeu o teto de embutir inline (`mediaTooLarge`), caso em
 * que o proto ainda descreve o arquivo mas os bytes nunca chegaram embutidos.
 */
function extractMediaMetadata(
  message: Record<string, unknown>,
  kind: ChannelMessageKind,
): MediaMetadata | undefined {
  const key = mediaMessageKeyByKind[kind];
  if (!key) return undefined;
  const nested = recordValue(message[key]);

  const mediaUrl = stringValue(message.mediaUrl);
  return {
    mimetype: stringValue(nested?.mimetype) ?? stringValue(message.mimetype),
    fileName: stringValue(nested?.fileName) ?? stringValue(message.fileName),
    sizeBytes:
      numberValue(nested?.fileLength) ?? numberValue(message.mediaSize),
    durationSeconds: numberValue(nested?.seconds),
    sha256: stringValue(nested?.fileSHA256),
    hasBase64: Boolean(stringValue(message.base64)),
    hasMediaUrl: Boolean(mediaUrl),
    mediaUrl,
    tooLarge: message.mediaTooLarge === true,
    // Só quando verdadeiro: o proto só traz a chave em vídeo, e um `false`
    // explícito em áudio, imagem ou documento seria ruído no metadado.
    gifPlayback: booleanValue(nested?.gifPlayback) || undefined,
  };
}

function extractText(message: Record<string, unknown>): string | undefined {
  const conversation = stringValue(message.conversation);
  if (conversation) return conversation;

  const extendedTextMessage = recordValue(message.extendedTextMessage);
  const extendedText = stringValue(extendedTextMessage?.text);
  if (extendedText) return extendedText;

  const imageMessage = recordValue(message.imageMessage);
  const imageCaption = stringValue(imageMessage?.caption);
  if (imageCaption) return imageCaption;

  const documentMessage = recordValue(message.documentMessage);
  const documentCaption = stringValue(documentMessage?.caption);
  if (documentCaption) return documentCaption;

  const videoMessage = recordValue(message.videoMessage);
  const videoCaption = stringValue(videoMessage?.caption);
  if (videoCaption) return videoCaption;

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
