import { type z } from "zod";

import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type WhatsAppConnection,
  type whatsappConnectResultSchema,
  type WhatsappContactList,
  type whatsappDisconnectResultSchema,
  type whatsappQrResultSchema,
} from "../mappers/publicApiSchemas";

type WhatsAppConnectResult = z.infer<typeof whatsappConnectResultSchema>;
type WhatsAppDisconnectResult = z.infer<typeof whatsappDisconnectResultSchema>;
export type WhatsAppQrResult = z.infer<typeof whatsappQrResultSchema>;

// Consentimento exigido a cada conexão/reconexão (Goal071): sem alias
// opcional, para que esquecer o campo no chamador vire erro de tipo, não um
// corpo silenciosamente incompleto.
export type WhatsAppConnectInput = (
  | { mode: "PAIRING_CODE"; phone: string }
  | { mode: "QR"; phone?: never }
) & { consentAccepted: true };

export class BffWhatsAppService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/whatsapp",
      schema: routeSchema<WhatsAppConnection | null>("GET", "/v1/whatsapp"),
      signal,
    });
  }

  /**
   * Contatos do número conectado (validação de 2026-10-11), lidos na hora da
   * Evolution e nunca gravados: só para escolher quem a IA ignora.
   */
  contacts(
    query: { search?: string; limit?: number } = {},
    signal?: AbortSignal,
  ) {
    return this.http.request({
      path: "/v1/whatsapp/contacts",
      query: { limit: query.limit, search: query.search || undefined },
      schema: routeSchema<WhatsappContactList>("GET", "/v1/whatsapp/contacts"),
      signal,
    });
  }

  // GET /v1/whatsapp/qr (Goal071/WU-01): relê o QR corrente da vinculação em
  // curso, sem abrir uma nova. Recusa `WHATSAPP_QR_NOT_IN_PROGRESS` quando não
  // há vinculação por QR em andamento.
  qr(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/whatsapp/qr",
      schema: routeSchema<WhatsAppQrResult>("GET", "/v1/whatsapp/qr"),
      signal,
    });
  }

  connect(input: WhatsAppConnectInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/whatsapp/connect",
      schema: routeSchema<WhatsAppConnectResult>(
        "POST",
        "/v1/whatsapp/connect",
      ),
      signal,
    });
  }

  reconnect(input: WhatsAppConnectInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/whatsapp/reconnect",
      schema: routeSchema<WhatsAppConnectResult>(
        "POST",
        "/v1/whatsapp/reconnect",
      ),
      signal,
    });
  }

  disconnect(signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: "/v1/whatsapp",
      schema: routeSchema<WhatsAppDisconnectResult>("DELETE", "/v1/whatsapp"),
      signal,
    });
  }
}
