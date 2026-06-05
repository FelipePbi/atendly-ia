import "server-only";

import type { ApiBusinessSettings } from "@/lib/business-settings";
import type { ApiVirtualAttendantSettings } from "@/lib/virtual-attendant";

export type BackendDispatchOutboundMessage = {
  text: string;
  conversationId?: string;
  messageRecordId?: string;
  providerMessageId?: string;
  rawPayload?: unknown;
};

export async function dispatchMessageToBackend(input: {
  payload: unknown;
  instanceToken: string;
  userId?: string;
  businessSettings?: ApiBusinessSettings;
  virtualAttendantSettings?: ApiVirtualAttendantSettings;
}): Promise<{
  skipped: boolean;
  action: string | null;
  outboundMessage: BackendDispatchOutboundMessage | null;
}> {
  const baseUrl = process.env.BACKEND_API_BASE_URL?.trim();
  const adminToken = process.env.BACKEND_ADMIN_API_TOKEN?.trim();

  if (!baseUrl || !adminToken) {
    return { skipped: true, action: null, outboundMessage: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/evolution/dispatch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("Backend dispatch failed", { status: response.status });
      return { skipped: true, action: null, outboundMessage: null };
    }

    const data = (await response.json().catch(() => null)) as {
      action?: string;
      outboundMessage?: BackendDispatchOutboundMessage | null;
    } | null;

    return {
      skipped: false,
      action: data?.action ?? null,
      outboundMessage: data?.outboundMessage ?? null,
    };
  } catch (error) {
    console.warn("Backend dispatch failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return { skipped: true, action: null, outboundMessage: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function pauseBotHandoffInBackend(input: {
  phone: string;
  reason: string;
  summary?: string;
}): Promise<{
  skipped: boolean;
}> {
  const baseUrl = process.env.BACKEND_API_BASE_URL?.trim();
  const adminToken = process.env.BACKEND_ADMIN_API_TOKEN?.trim();

  if (!baseUrl || !adminToken) {
    return { skipped: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/handoffs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("Backend bot pause failed", { status: response.status });
      return { skipped: true };
    }

    return { skipped: false };
  } catch (error) {
    console.warn("Backend bot pause failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return { skipped: true };
  } finally {
    clearTimeout(timeout);
  }
}

export async function resumeBotHandoffsInBackend(input: { phones: string[] }): Promise<{
  skipped: boolean;
  resumed: number;
}> {
  const baseUrl = process.env.BACKEND_API_BASE_URL?.trim();
  const adminToken = process.env.BACKEND_ADMIN_API_TOKEN?.trim();
  const phones = [...new Set(input.phones)].filter(Boolean);

  if (!baseUrl || !adminToken || phones.length === 0) {
    return { skipped: true, resumed: 0 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/bot/resume`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ phones }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend bot resume failed with HTTP ${response.status}`);
    }

    const data = (await response.json().catch(() => null)) as { resumed?: number } | null;
    return { skipped: false, resumed: data?.resumed ?? phones.length };
  } finally {
    clearTimeout(timeout);
  }
}

export type BotHandoffStatus = {
  phone: string;
  humanHandoff: boolean;
  reason: string | null;
  summary: string | null;
  pauseUntil: string | null;
  handoffId: string | null;
};

export async function fetchBotHandoffStatusesFromBackend(input: { phones: string[] }): Promise<{
  skipped: boolean;
  statuses: BotHandoffStatus[];
}> {
  const baseUrl = process.env.BACKEND_API_BASE_URL?.trim();
  const adminToken = process.env.BACKEND_ADMIN_API_TOKEN?.trim();
  const phones = [...new Set(input.phones)].filter(Boolean);

  if (!baseUrl || !adminToken || phones.length === 0) {
    return { skipped: true, statuses: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/bot/status`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ phones }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("Backend bot status failed", { status: response.status });
      return { skipped: true, statuses: [] };
    }

    const data = (await response.json().catch(() => null)) as { statuses?: BotHandoffStatus[] } | null;
    return { skipped: false, statuses: data?.statuses ?? [] };
  } catch (error) {
    console.warn("Backend bot status failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return { skipped: true, statuses: [] };
  } finally {
    clearTimeout(timeout);
  }
}
