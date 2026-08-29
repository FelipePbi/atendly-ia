import type { MessageType } from "../generated/prisma/client.js";

export type EvolutionWebhookEvent =
  | "MESSAGE"
  | "SEND_MESSAGE"
  | "QRCODE"
  | "QR_TIMEOUT"
  | "QR_SUCCESS"
  | "PAIR_SUCCESS"
  | "CONNECTED"
  | "LOGGED_OUT"
  | "DISCONNECTED"
  | "UNKNOWN";

export type ParsedEvolutionMessage = {
  externalMessageId: string;
  contactJid: string;
  contactName: string | null;
  profilePictureUrl: string | null;
  fromMe: boolean;
  isGroup: boolean;
  senderJid: string | null;
  senderName: string | null;
  type: MessageType;
  contentText: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  mediaBase64: string | null;
  timestamp: Date;
};

type RecordValue = Record<string, unknown>;

export function getEvolutionEvent(payload: unknown): EvolutionWebhookEvent {
  const raw = (stringValue(recordValue(payload)?.event) ?? "")
    .replace(/[\s.-]/g, "_")
    .toUpperCase();

  if (
    raw === "MESSAGE" ||
    raw === "MESSAGES_UPSERT" ||
    raw === "MESSAGE_UPSERT"
  )
    return "MESSAGE";
  if (
    raw === "SENDMESSAGE" ||
    raw === "SEND_MESSAGE" ||
    raw === "SENDSTATUS" ||
    raw === "SEND_STATUS"
  ) {
    return "SEND_MESSAGE";
  }
  if (raw === "QRCODE" || raw === "QR_CODE") return "QRCODE";
  if (raw === "QRTIMEOUT" || raw === "QR_TIMEOUT") return "QR_TIMEOUT";
  if (raw === "QRSUCCESS" || raw === "QR_SUCCESS") return "QR_SUCCESS";
  if (raw === "PAIRSUCCESS" || raw === "PAIR_SUCCESS") return "PAIR_SUCCESS";
  if (raw === "CONNECTED") return "CONNECTED";
  if (raw === "LOGGEDOUT" || raw === "LOGGED_OUT") return "LOGGED_OUT";
  if (raw === "DISCONNECTED") return "DISCONNECTED";

  return "UNKNOWN";
}

export function getEvolutionInstanceKey(payload: unknown): string | null {
  const root = recordValue(payload);
  const data = recordValue(root?.data);

  return (
    stringValue(root?.instanceId) ||
    stringValue(root?.instance) ||
    stringValue(root?.instanceName) ||
    stringValue(data?.instanceId) ||
    stringValue(data?.instance) ||
    null
  );
}

export function extractQrCode(payload: unknown): string | null {
  const root = recordValue(payload);
  const data = recordValue(root?.data);
  const value =
    stringValue(data?.qrcode) ||
    stringValue(data?.Qrcode) ||
    stringValue(data?.qrCode) ||
    stringValue(data?.QrCode) ||
    stringValue(data?.qr) ||
    stringValue(data?.Qr) ||
    stringValue(data?.code) ||
    stringValue(data?.Code) ||
    stringValue(root?.Qrcode) ||
    stringValue(root?.qrcode);

  if (!value) return null;
  if (value.startsWith("data:image")) return value;
  if (value.startsWith("iVBOR") || value.length > 500)
    return `data:image/png;base64,${value}`;
  return value;
}

export function extractConnectedPhone(payload: unknown): string | null {
  const root = recordValue(payload);
  const data = recordValue(root?.data);

  return (
    stringValue(data?.jid) ||
    stringValue(data?.Jid) ||
    stringValue(data?.myJid) ||
    stringValue(data?.MyJid) ||
    stringValue(root?.jid) ||
    stringValue(root?.myJid) ||
    null
  );
}

export function parseEvolutionMessage(
  payload: unknown,
): ParsedEvolutionMessage | null {
  const root = recordValue(payload);
  const data = recordValue(root?.data);
  const info = recordValue(data?.Info) ?? recordValue(data?.info);
  const message = recordValue(data?.Message) ?? recordValue(data?.message);
  const key = recordValue(data?.key);
  const event = getEvolutionEvent(payload);

  const externalMessageId =
    stringValue(info?.ID) || stringValue(info?.id) || stringValue(key?.id);
  const chat =
    stringValue(info?.Chat) ||
    stringValue(info?.chat) ||
    stringValue(key?.remoteJid);
  const fromMe =
    booleanValue(info?.IsFromMe) ??
    booleanValue(info?.fromMe) ??
    booleanValue(key?.fromMe) ??
    event === "SEND_MESSAGE";
  const sender =
    stringValue(info?.Sender) ||
    stringValue(info?.sender) ||
    stringValue(key?.participant);
  const contactJid = chat || sender;
  const isGroup = Boolean(
    booleanValue(info?.IsGroup) ??
    booleanValue(info?.isGroup) ??
    chat?.endsWith("@g.us"),
  );

  if (!externalMessageId || !contactJid) return null;

  const mediaType =
    stringValue(info?.MediaType) || stringValue(info?.mediaType);
  const infoType = stringValue(info?.Type) || stringValue(info?.type);
  const contentText = extractText(message);
  const type = resolveMessageType(infoType, mediaType, message, contentText);
  const timestamp = parseTimestamp(
    stringValue(info?.Timestamp) ||
      stringValue(info?.timestamp) ||
      stringValue(data?.messageTimestamp) ||
      stringValue(data?.timestamp),
  );

  return {
    externalMessageId,
    contactJid,
    contactName:
      stringValue(info?.PushName) || stringValue(data?.pushName) || null,
    profilePictureUrl: extractProfilePictureUrl(payload),
    fromMe,
    isGroup,
    senderJid: sender || chat || null,
    senderName:
      stringValue(info?.PushName) || stringValue(data?.pushName) || null,
    type,
    contentText,
    mediaType: mediaType || null,
    mediaUrl:
      stringValue(message?.url) ||
      stringValue(message?.URL) ||
      stringValue(recordValue(message?.imageMessage)?.url) ||
      stringValue(recordValue(message?.ImageMessage)?.URL) ||
      stringValue(recordValue(message?.documentMessage)?.url) ||
      stringValue(recordValue(message?.DocumentMessage)?.URL) ||
      null,
    mediaBase64:
      stringValue(message?.base64) || stringValue(message?.mediaBase64) || null,
    timestamp,
  };
}

export function extractProfilePictureUrl(payload: unknown): string | null {
  const root = recordValue(payload);
  const data = recordValue(root?.data);
  const info = recordValue(data?.Info) ?? recordValue(data?.info);
  const sender = recordValue(data?.Sender) ?? recordValue(data?.sender);
  const contact = recordValue(data?.Contact) ?? recordValue(data?.contact);

  return (
    stringValue(info?.ProfilePictureUrl) ||
    stringValue(info?.profilePictureUrl) ||
    stringValue(info?.ProfilePicURL) ||
    stringValue(info?.profilePicUrl) ||
    stringValue(data?.profilePictureUrl) ||
    stringValue(data?.profilePicUrl) ||
    stringValue(data?.profilePicURL) ||
    stringValue(sender?.profilePictureUrl) ||
    stringValue(sender?.profilePicUrl) ||
    stringValue(contact?.profilePictureUrl) ||
    stringValue(contact?.profilePicUrl) ||
    stringValue(root?.profilePictureUrl) ||
    stringValue(root?.profilePicUrl) ||
    null
  );
}

function extractText(message: RecordValue | null): string | null {
  if (!message) return null;

  return (
    stringValue(message.conversation) ||
    stringValue(message.Conversation) ||
    stringValue(recordValue(message.extendedTextMessage)?.text) ||
    stringValue(recordValue(message.extendedTextMessage)?.Text) ||
    stringValue(recordValue(message.ExtendedTextMessage)?.Text) ||
    stringValue(recordValue(message.ExtendedTextMessage)?.text) ||
    stringValue(recordValue(message.imageMessage)?.caption) ||
    stringValue(recordValue(message.imageMessage)?.Caption) ||
    stringValue(recordValue(message.ImageMessage)?.Caption) ||
    stringValue(recordValue(message.documentMessage)?.caption) ||
    stringValue(recordValue(message.documentMessage)?.Caption) ||
    stringValue(recordValue(message.DocumentMessage)?.Caption) ||
    stringValue(recordValue(message.videoMessage)?.caption) ||
    stringValue(recordValue(message.videoMessage)?.Caption) ||
    stringValue(recordValue(message.VideoMessage)?.Caption) ||
    null
  );
}

function resolveMessageType(
  infoType: string | null,
  mediaType: string | null,
  message: RecordValue | null,
  contentText: string | null,
): MessageType {
  const source = `${infoType ?? ""} ${mediaType ?? ""}`.toLowerCase();

  if (
    source.includes("audio") ||
    message?.audioMessage ||
    message?.AudioMessage
  )
    return "AUDIO";
  if (
    source.includes("image") ||
    message?.imageMessage ||
    message?.ImageMessage
  )
    return "IMAGE";
  if (
    source.includes("document") ||
    message?.documentMessage ||
    message?.DocumentMessage
  )
    return "DOCUMENT";
  if (contentText) return "TEXT";

  return "UNKNOWN";
}

function parseTimestamp(value: string | null): Date {
  if (!value) return new Date();

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function recordValue(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}
