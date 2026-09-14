/**
 * Leitura dos bytes de mídia que atravessam o webhook.
 *
 * Duas fontes, nesta ordem: o `base64` que o Go embutiu no evento **em
 * processamento** (existe só até o evento concluir — ver `stripMediaBase64`) e,
 * na falta dele, o download sob demanda, que precisa do proto guardado no
 * mesmo payload. Nenhuma das duas guarda bytes: elas só os expõem enquanto o
 * turno está sendo processado.
 */

export interface DecodedMedia {
  data: Uint8Array;
  /** Mimetype declarado na data URL, quando ela trouxe um. */
  mimetype?: string;
}

const mediaProtoKeys = [
  "audioMessage",
  "imageMessage",
  "documentMessage",
  "videoMessage",
  "stickerMessage",
] as const;

/** `data.Message.base64`, do payload bruto do provedor. */
export function readInlineMediaBase64(raw: unknown): string | undefined {
  const message = readProviderMessage(raw);
  const base64 = message?.base64;
  return typeof base64 === "string" && base64.trim() ? base64 : undefined;
}

/**
 * Proto da mídia guardado no payload, no formato que `POST
 * /message/downloadmedia` aceita (`{ message: waE2E.Message }`).
 *
 * O `base64` sai daqui: quando o download sob demanda é necessário ele não
 * existe, e mandá-lo de volta ao Go só inflaria o corpo. Os campos que o Go
 * mescla (`mediaUrl`, `mimetype`, ...) ficam: o decode do lado do Go ignora
 * chave desconhecida, e removê-los seletivamente é palpite sobre o proto.
 */
export function readMediaProto(
  raw: unknown,
): Record<string, unknown> | undefined {
  const message = readProviderMessage(raw);
  if (!message) return undefined;
  const hasMedia = mediaProtoKeys.some((key) => isRecord(message[key]));
  if (!hasMedia) return undefined;
  const { base64: _base64, ...rest } = message;
  return rest;
}

/**
 * Decodifica base64 puro ou data URL (`data:audio/ogg;codecs=opus;base64,...`),
 * que é como o Go devolve o download sob demanda.
 */
export function decodeBase64Media(value: string): DecodedMedia | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let payload = trimmed;
  let mimetype: string | undefined;
  const dataUrl = /^data:([^;,]*)(;[^,]*)?,/u.exec(trimmed);
  if (dataUrl) {
    mimetype = dataUrl[1] || undefined;
    payload = trimmed.slice(dataUrl[0].length);
    if (!/;base64/iu.test(dataUrl[2] ?? "")) return null;
  }

  const data = Buffer.from(payload, "base64");
  if (data.length === 0) return null;
  return { data: new Uint8Array(data), mimetype };
}

function readProviderMessage(
  raw: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(raw) || !isRecord(raw.data)) return undefined;
  return isRecord(raw.data.Message) ? raw.data.Message : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
