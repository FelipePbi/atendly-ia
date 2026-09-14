import type { ChannelMessageKind } from "../channel/domain/ChannelMessage.js";

/** Espelha o enum Prisma `MessageKind` (schema.prisma). */
export type MessageKindValue =
  | "TEXT"
  | "AUDIO"
  | "IMAGE"
  | "DOCUMENT"
  | "VIDEO"
  | "STICKER"
  | "UNKNOWN";

/** Espelha o enum Prisma `MessageAttachmentKind` (schema.prisma). */
export type MessageAttachmentKindValue =
  | "AUDIO"
  | "IMAGE"
  | "DOCUMENT"
  | "VIDEO"
  | "STICKER";

const mediaKinds = new Set<ChannelMessageKind>([
  "audio",
  "image",
  "document",
  "video",
  "sticker",
]);

export function toMessageKind(kind: ChannelMessageKind): MessageKindValue {
  return kind.toUpperCase() as MessageKindValue;
}

/** Nulo para `text` e `unknown`: nenhum dos dois vira `MessageAttachment`. */
export function toMessageAttachmentKind(
  kind: ChannelMessageKind,
): MessageAttachmentKindValue | null {
  return mediaKinds.has(kind)
    ? (kind.toUpperCase() as MessageAttachmentKindValue)
    : null;
}
