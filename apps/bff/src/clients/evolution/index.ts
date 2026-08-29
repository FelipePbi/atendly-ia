import { z } from "zod";

import { env, requireEnv } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { InternalHttpClient } from "../internal-http-client.js";

const createDataSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    token: z.string().optional(),
    status: z.string().optional(),
  })
  .loose();

const qrDataSchema = z
  .object({
    qrcode: z.string().optional(),
    Qrcode: z.string().optional(),
    code: z.string().optional(),
    Code: z.string().optional(),
    qr: z.string().optional(),
    Qr: z.string().optional(),
  })
  .loose();

const pairDataSchema = z
  .object({
    pairingCode: z.string().optional(),
    PairingCode: z.string().optional(),
  })
  .loose();

const statusDataSchema = z
  .object({
    connected: z.union([z.boolean(), z.string()]).optional(),
    Connected: z.union([z.boolean(), z.string()]).optional(),
    loggedIn: z.union([z.boolean(), z.string()]).optional(),
    LoggedIn: z.union([z.boolean(), z.string()]).optional(),
    name: z.string().optional(),
    Name: z.string().optional(),
    myJid: z.string().optional(),
    MyJid: z.string().optional(),
    jid: z.string().optional(),
    Jid: z.string().optional(),
    status: z.string().optional(),
    Status: z.string().optional(),
  })
  .loose();

const envelope = <T extends z.ZodType>(data: T) =>
  z
    .object({
      message: z.string().optional(),
      error: z.string().optional(),
      data: data.optional(),
    })
    .loose();

const DEFAULT_SUBSCRIPTIONS = [
  "MESSAGE",
  "SEND_MESSAGE",
  "CONNECTION",
  "QRCODE",
];

export class EvolutionClient {
  private readonly http = new InternalHttpClient(
    env.EVOLUTION_GO_BASE_URL,
    "evolution-go",
    "custom",
  );

  webhookUrl(): string {
    const baseUrl = env.AI_ORCHESTRATOR_BASE_URL.replace(/\/$/, "");
    const token = encodeURIComponent(requireEnv("EVOLUTION_WEBHOOK_SECRET"));
    return `${baseUrl}/webhooks/evolution?token=${token}`;
  }

  createInstance(
    input: { name: string; token: string; webhookUrl: string },
    requestId?: string,
  ) {
    return this.http.request({
      method: "POST",
      path: "/instance/create",
      headers: { apikey: requireEnv("EVOLUTION_GO_API_KEY") },
      requestId,
      body: {
        name: input.name,
        token: input.token,
        webhook: input.webhookUrl,
        webhookEvents: DEFAULT_SUBSCRIPTIONS,
        advancedSettings: { ignoreGroups: true },
      },
      schema: envelope(createDataSchema),
    });
  }

  connectInstance(
    instanceToken: string,
    webhookUrl: string,
    requestId?: string,
  ) {
    return this.http.request({
      method: "POST",
      path: "/instance/connect",
      headers: { apikey: instanceToken },
      requestId,
      body: {
        webhookUrl,
        webhookUrlLocal: webhookUrl,
        subscribe: DEFAULT_SUBSCRIPTIONS,
        immediate: true,
      },
      schema: envelope(z.unknown()),
    });
  }

  async getQr(instanceToken: string, requestId?: string) {
    const response = await this.http.request({
      method: "GET",
      path: "/instance/qr",
      headers: { apikey: instanceToken },
      requestId,
      schema: envelope(qrDataSchema),
    });
    const data = response.data ?? {};
    const imageQr =
      stringValue(data.qrcode) ??
      stringValue(data.Qrcode) ??
      stringValue(data.qr) ??
      stringValue(data.Qr) ??
      "";
    const rawQr = stringValue(data.code) ?? stringValue(data.Code) ?? imageQr;
    return {
      qrcode: normalizeQrDataUrl(imageQr || rawQr),
      code: rawQr,
    };
  }

  async pairInstance(instanceToken: string, phone: string, requestId?: string) {
    const response = await this.http.request({
      method: "POST",
      path: "/instance/pair",
      headers: { apikey: instanceToken },
      requestId,
      body: { phone },
      schema: envelope(pairDataSchema),
    });
    const pairingCode =
      stringValue(response.data?.pairingCode) ??
      stringValue(response.data?.PairingCode);
    if (!pairingCode) {
      throw new AppError(
        "UPSTREAM_ERROR",
        "Evolution Go did not return a pairing code.",
        502,
      );
    }
    return { pairingCode };
  }

  async getStatus(instanceToken: string, requestId?: string) {
    const response = await this.http.request({
      method: "GET",
      path: "/instance/status",
      headers: { apikey: instanceToken },
      requestId,
      schema: envelope(statusDataSchema),
    });
    const data = response.data ?? {};
    const transportConnected =
      booleanValue(data.connected) ?? booleanValue(data.Connected) ?? false;
    const loggedIn =
      booleanValue(data.loggedIn) ?? booleanValue(data.LoggedIn) ?? false;
    return {
      connected: Boolean(transportConnected && loggedIn),
      loggedIn,
      phoneNumber:
        stringValue(data.myJid) ??
        stringValue(data.MyJid) ??
        stringValue(data.jid) ??
        stringValue(data.Jid) ??
        null,
      displayName: stringValue(data.name) ?? stringValue(data.Name) ?? null,
      statusText: stringValue(data.status) ?? stringValue(data.Status) ?? null,
    };
  }

  logoutInstance(instanceToken: string, requestId?: string) {
    return this.http.request({
      method: "DELETE",
      path: "/instance/logout",
      headers: { apikey: instanceToken },
      requestId,
      body: {},
      schema: envelope(z.unknown()),
    });
  }

  deleteInstance(instanceId: string, requestId?: string) {
    return this.http.request({
      method: "DELETE",
      path: `/instance/delete/${encodeURIComponent(instanceId)}`,
      headers: { apikey: requireEnv("EVOLUTION_GO_API_KEY") },
      requestId,
      schema: envelope(z.unknown()),
    });
  }
}

function normalizeQrDataUrl(value: string): string {
  if (!value) return "";
  if (value.startsWith("data:image")) return value;
  if (value.startsWith("iVBOR") || value.length > 500)
    return `data:image/png;base64,${value}`;
  return value;
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
