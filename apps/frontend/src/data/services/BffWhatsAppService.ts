import { type z } from "zod";

import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type WhatsAppConnection,
  type whatsappConnectResultSchema,
  type whatsappDisconnectResultSchema,
} from "../mappers/publicApiSchemas";

type WhatsAppConnectResult = z.infer<typeof whatsappConnectResultSchema>;
type WhatsAppDisconnectResult = z.infer<typeof whatsappDisconnectResultSchema>;

export type WhatsAppConnectInput =
  { mode: "PAIRING_CODE"; phone: string } | { mode: "QR"; phone?: never };

export class BffWhatsAppService {
  constructor(private readonly http: BffHttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/whatsapp",
      schema: routeSchema<WhatsAppConnection | null>("GET", "/v1/whatsapp"),
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
