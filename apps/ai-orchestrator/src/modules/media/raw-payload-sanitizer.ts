/**
 * Purga o base64 embutido do payload bruto do provedor.
 *
 * O base64 (`data.Message.base64`) só existe para dar bytes ao processamento
 * em curso (transcrição, download sob demanda); depois que o evento conclui —
 * ou quando a mensagem já virou `Message` — ele não tem mais função e continuar
 * guardando-o é só custo e superfície de dado sensível. Os demais campos do
 * proto de mídia (URL, mediaKey, directPath, fileSHA256) são preservados: são
 * a chave do download sob demanda, não os bytes em si.
 */
export function stripMediaBase64(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  const data = payload.data;
  if (!isRecord(data)) return payload;
  const message = data.Message;
  if (!isRecord(message) || !("base64" in message)) return payload;

  const { base64: _base64, ...rest } = message;
  return {
    ...payload,
    data: { ...data, Message: rest },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
