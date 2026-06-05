import "server-only";

type EvolutionResponse<T = unknown> = {
  message?: string;
  error?: string;
  data?: T;
  [key: string]: unknown;
};

export class EvolutionGoError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response: EvolutionResponse
  ) {
    super(message);
    this.name = "EvolutionGoError";
  }
}

type InstanceCreateData = {
  id?: string;
  name?: string;
  token?: string;
  status?: string;
};

type QrData = {
  qrcode?: string;
  Qrcode?: string;
  code?: string;
  Code?: string;
  qr?: string;
  Qr?: string;
};

type StatusData = {
  connected?: boolean;
  Connected?: boolean;
  loggedIn?: boolean;
  LoggedIn?: boolean;
  name?: string;
  Name?: string;
  myJid?: string;
  MyJid?: string;
  jid?: string;
  Jid?: string;
  status?: string;
  Status?: string;
};

type InstanceInfoData = {
  connected?: boolean;
  Connected?: boolean;
  jid?: string;
  Jid?: string;
  name?: string;
  Name?: string;
};

type SendTextData = {
  messageId?: string;
  key?: {
    id?: string;
  };
  data?: {
    Info?: {
      ID?: string;
    };
  };
};

type EvolutionContactData = {
  Jid?: string;
  jid?: string;
  Found?: boolean;
  found?: boolean;
  FirstName?: string;
  firstName?: string;
  FullName?: string;
  fullName?: string;
  PushName?: string;
  pushName?: string;
  BusinessName?: string;
  businessName?: string;
};

export type EvolutionContact = {
  jid: string;
  phoneNumber: string | null;
  firstName: string;
  fullName: string;
  pushName: string;
  businessName: string;
};

const DEFAULT_SUBSCRIPTIONS = ["MESSAGE", "SEND_MESSAGE", "CONNECTION", "QRCODE"];
const DEFAULT_ADVANCED_SETTINGS = {
  ignoreGroups: true,
};

export async function createEvolutionInstance(input: {
  name: string;
  token: string;
  webhookUrl: string;
}) {
  return evolutionFetch<InstanceCreateData>("/instance/create", {
    method: "POST",
    apiKey: requireEnv("EVOLUTION_GO_API_KEY"),
    body: {
      name: input.name,
      token: input.token,
      webhook: input.webhookUrl,
      webhookEvents: DEFAULT_SUBSCRIPTIONS,
      advancedSettings: DEFAULT_ADVANCED_SETTINGS,
    },
  });
}

export async function connectEvolutionInstance(instanceToken: string, webhookUrl: string) {
  return evolutionFetch("/instance/connect", {
    method: "POST",
    apiKey: instanceToken,
    body: {
      webhookUrl,
      webhookUrlLocal: webhookUrl,
      subscribe: DEFAULT_SUBSCRIPTIONS,
      immediate: true,
    },
  });
}

export async function getEvolutionQr(instanceToken: string) {
  const response = await evolutionFetch<QrData>("/instance/qr", {
    method: "GET",
    apiKey: instanceToken,
  });

  const data = response.data ?? {};
  const imageQr = stringValue(data.qrcode) ?? stringValue(data.Qrcode) ?? stringValue(data.qr) ?? stringValue(data.Qr) ?? "";
  const rawQr = stringValue(data.code) ?? stringValue(data.Code) ?? imageQr;
  const dataUrl = normalizeQrDataUrl(imageQr || rawQr);

  return {
    raw: response,
    qrcode: dataUrl,
    code: rawQr,
  };
}

export async function getEvolutionStatus(instanceToken: string) {
  const response = await evolutionFetch<StatusData>("/instance/status", {
    method: "GET",
    apiKey: instanceToken,
  });

  const data = response.data ?? {};
  const transportConnected = booleanValue(data.connected) ?? booleanValue(data.Connected) ?? false;
  const loggedIn = booleanValue(data.loggedIn) ?? booleanValue(data.LoggedIn) ?? false;
  const connected = Boolean(transportConnected && loggedIn);

  return {
    raw: response,
    connected,
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

export async function getEvolutionInstanceInfo(instanceId: string) {
  const response = await evolutionFetch<InstanceInfoData>(`/instance/info/${encodeURIComponent(instanceId)}`, {
    method: "GET",
    apiKey: requireEnv("EVOLUTION_GO_API_KEY"),
  });

  const data = response.data ?? {};

  return {
    raw: response,
    connected: booleanValue(data.connected) ?? booleanValue(data.Connected) ?? false,
    phoneNumber: stringValue(data.jid) ?? stringValue(data.Jid) ?? null,
    displayName: stringValue(data.name) ?? stringValue(data.Name) ?? null,
  };
}

export async function logoutEvolutionInstance(instanceToken: string) {
  return evolutionFetch("/instance/logout", {
    method: "DELETE",
    apiKey: instanceToken,
    body: {},
  });
}

export async function deleteEvolutionInstance(instanceId: string) {
  return evolutionFetch(`/instance/delete/${encodeURIComponent(instanceId)}`, {
    method: "DELETE",
    apiKey: requireEnv("EVOLUTION_GO_API_KEY"),
  });
}

export async function sendEvolutionText(input: {
  instanceToken: string;
  to: string;
  text: string;
  correlationId: string;
  quotedMessageId?: string;
  quotedParticipant?: string;
}) {
  const body: Record<string, unknown> = {
    number: input.to,
    text: input.text,
    id: input.correlationId,
  };

  if (input.quotedMessageId) {
    body.quoted = {
      messageId: input.quotedMessageId,
      ...(input.quotedParticipant ? { participant: input.quotedParticipant } : {}),
    };
  }

  const response = await evolutionFetch<SendTextData>(process.env.EVOLUTION_GO_SEND_TEXT_PATH?.trim() || "/send/text", {
    method: "POST",
    apiKey: input.instanceToken,
    body,
  });

  const data = response.data ?? {};

  return {
    raw: response,
    messageId: stringValue(response.messageId) ?? data.messageId ?? data.data?.Info?.ID ?? data.key?.id,
  };
}

export async function getEvolutionContacts(instanceToken: string): Promise<EvolutionContact[]> {
  const response = await evolutionFetch<EvolutionContactData[] | { contacts?: EvolutionContactData[] }>("/user/contacts", {
    method: "GET",
    apiKey: instanceToken,
  });

  const rawContacts = Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.data?.contacts)
      ? response.data.contacts
      : [];

  return rawContacts.map(normalizeEvolutionContact).filter((contact): contact is EvolutionContact => Boolean(contact));
}

export function buildWebhookUrl(): string {
  const appUrl = requireEnv("APP_PUBLIC_URL").replace(/\/$/, "");
  const secret = requireEnv("EVOLUTION_WEBHOOK_SECRET");
  return `${appUrl}/api/webhooks/evolution-go?token=${encodeURIComponent(secret)}`;
}

function normalizeEvolutionContact(contact: EvolutionContactData): EvolutionContact | null {
  const jid = stringValue(contact.Jid) ?? stringValue(contact.jid);
  if (!jid) return null;

  return {
    jid,
    phoneNumber: jid.endsWith("@s.whatsapp.net") ? jid.split("@")[0] ?? null : null,
    firstName: stringValue(contact.FirstName) ?? stringValue(contact.firstName) ?? "",
    fullName: stringValue(contact.FullName) ?? stringValue(contact.fullName) ?? "",
    pushName: stringValue(contact.PushName) ?? stringValue(contact.pushName) ?? "",
    businessName: stringValue(contact.BusinessName) ?? stringValue(contact.businessName) ?? "",
  };
}

async function evolutionFetch<T>(
  path: string,
  input: {
    method: "GET" | "POST" | "DELETE";
    apiKey: string;
    body?: unknown;
  }
): Promise<EvolutionResponse<T>> {
  const url = `${requireEnv("EVOLUTION_GO_BASE_URL").replace(/\/$/, "")}${path}`;
  const response = await fetch(url, {
    method: input.method,
    headers: {
      "content-type": "application/json",
      apikey: input.apiKey,
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    cache: "no-store",
  });

  const parsed = await parseEvolutionResponse<T>(response);
  if (!response.ok) {
    const message = parsed.error ?? parsed.message ?? `Evolution Go retornou HTTP ${response.status}`;
    throw new EvolutionGoError(message, response.status, parsed);
  }

  return parsed;
}

async function parseEvolutionResponse<T>(response: Response): Promise<EvolutionResponse<T>> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as EvolutionResponse<T>;
  } catch {
    return { message: text };
  }
}

function normalizeQrDataUrl(value: string): string {
  if (!value) return "";
  if (value.startsWith("data:image")) return value;
  if (value.startsWith("iVBOR") || value.length > 500) return `data:image/png;base64,${value}`;
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

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Variavel de ambiente ausente: ${key}`);
  }
  return value;
}
