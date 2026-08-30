import { type BffHttpClient } from "../http/BffHttpClient";
import {
  whatsappConnectionSchema,
  whatsappConnectResultSchema,
  whatsappDisconnectResultSchema,
} from "../mappers/publicApiSchemas";

export type WhatsAppConnectInput =
  { mode: "PAIRING_CODE"; phone: string } | { mode: "QR"; phone?: never };

export class BffWhatsAppService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/whatsapp",
      schema: whatsappConnectionSchema.nullable(),
      signal,
    });
  }

  connect(input: WhatsAppConnectInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/whatsapp/connect",
      schema: whatsappConnectResultSchema,
      signal,
    });
  }

  reconnect(input: WhatsAppConnectInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/whatsapp/reconnect",
      schema: whatsappConnectResultSchema,
      signal,
    });
  }

  disconnect(signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: "/v1/whatsapp",
      schema: whatsappDisconnectResultSchema,
      signal,
    });
  }
}
