import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import { sealedInstanceCredentialData } from "../src/modules/whatsapp/instance-link.js";
import {
  assertDisposableTarget,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal014/WU-02 — `GET /v1/status`, read model honesto de WhatsApp e IA.
 *
 * O que é provado aqui: `whatsapp.status` só chega a `CONNECTED` depois de uma
 * verificação real contra o Evolution nesta requisição, `ai.state` só chega a
 * `ACTIVE` depois de uma verificação real contra a IA, dependência
 * indisponível vira `UNKNOWN`/`degraded: true` sem nunca virar `500`, e cada
 * negócio só enxerga o próprio estado. A IA e o Evolution são dublês HTTP.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  tenantId: string | null;
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Dublê HTTP único para IA (`/internal/ai-tenant-config`) e Evolution
 * (`/instance/status`), roteado por caminho — os dois têm base URL distinta
 * em produção, mas o teste intercepta `fetch` globalmente.
 */
function stubUpstream(handlers: {
  ai?: (call: UpstreamCall) => Response;
  evolution?: (call: UpstreamCall) => Response;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const call: UpstreamCall = {
        method: request.method,
        path: url.pathname,
        tenantId: request.headers.get("x-tenant-id"),
      };
      if (call.path === "/internal/ai-tenant-config") {
        if (!handlers.ai) throw new Error(`Unexpected AI call: ${call.path}`);
        return handlers.ai(call);
      }
      if (call.path === "/instance/status") {
        if (!handlers.evolution) {
          throw new Error(`Unexpected Evolution call: ${call.path}`);
        }
        return handlers.evolution(call);
      }
      throw new Error(`Unexpected upstream call: ${call.method} ${call.path}`);
    }),
  );
}

function aiConfig(body: {
  enabled: boolean;
  tone?: string;
  promptVersion?: string;
} | null) {
  return jsonResponse({
    data: body
      ? {
          enabled: body.enabled,
          tone: body.tone ?? "BALANCED",
          promptVersion: body.promptVersion ?? "v1",
        }
      : null,
    requestId: "up-ai-config",
  });
}

function aiUnavailable() {
  return jsonResponse(
    { error: { code: "INTERNAL_ERROR", message: "boom" }, requestId: "up-ai-error" },
    500,
  );
}

function evolutionStatus(connected: boolean, phoneNumber = "5511999999999") {
  return jsonResponse({
    data: { connected, loggedIn: connected, myJid: connected ? phoneNumber : undefined },
  });
}

function evolutionUnavailable() {
  return jsonResponse({ error: "boom" }, 500);
}

async function linkWhatsAppInstance(
  session: SessionHandle,
  name: string,
): Promise<void> {
  await getPrisma().whatsAppInstance.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      evolutionInstanceId: `${name}-id`,
      evolutionInstanceName: name,
      status: "CONNECTED",
      ...sealedInstanceCredentialData("wa_synthetic_status_credential", {
        tenantId: session.tenantId,
        evolutionInstanceName: name,
      }),
    },
  });
}

async function setDesiredAi(
  session: SessionHandle,
  enabled: boolean,
): Promise<void> {
  await getPrisma().aiSettings.upsert({
    where: { tenantId: session.tenantId },
    create: { tenantId: session.tenantId, enabled },
    update: { enabled },
  });
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("Goal014: GET /v1/status", () => {
  it("CONNECTED + ACTIVE quando o negócio quer a IA ligada e as duas dependências confirmam", async () => {
    const owner = await business("status-active");
    await linkWhatsAppInstance(owner, "status_active");
    await setDesiredAi(owner, true);
    stubUpstream({
      ai: () => aiConfig({ enabled: true }),
      evolution: () => evolutionStatus(true),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.whatsapp.status).toBe("CONNECTED");
    expect(body.whatsapp.phoneNumber).toBe("5511999999999");
    expect(typeof body.whatsapp.checkedAt).toBe("string");
    expect(body.ai).toEqual({
      desiredEnabled: true,
      effectiveEnabled: true,
      state: "ACTIVE",
    });
    expect(body.degraded).toBe(false);
  });

  it("DISCONNECTED quando existe vínculo mas o Evolution relata desconectado, sem vazar para CONNECTED", async () => {
    const owner = await business("status-disconnected");
    await linkWhatsAppInstance(owner, "status_disconnected");
    stubUpstream({
      ai: () => aiConfig({ enabled: false }),
      evolution: () => evolutionStatus(false),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.whatsapp.status).toBe("DISCONNECTED");
  });

  it("DISCONNECTED (não UNKNOWN) quando o negócio nunca vinculou um número", async () => {
    const owner = await business("status-absent");
    stubUpstream({ ai: () => aiConfig({ enabled: false }) });

    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.whatsapp.status).toBe("DISCONNECTED");
    expect(body.whatsapp.phoneNumber).toBeNull();
    expect(body.degraded).toBe(false);
  });

  it("UNKNOWN e degraded quando o Evolution não responde, nunca 500", async () => {
    const owner = await business("status-evolution-down");
    await linkWhatsAppInstance(owner, "status_evolution_down");
    stubUpstream({
      ai: () => aiConfig({ enabled: false }),
      evolution: () => evolutionUnavailable(),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.whatsapp.status).toBe("UNKNOWN");
    expect(body.whatsapp.phoneNumber).toBeNull();
    expect(body.degraded).toBe(true);
  });

  it("OFF quando o desejado está desligado, mesmo que a IA relate ligada", async () => {
    const owner = await business("status-off");
    await setDesiredAi(owner, false);
    stubUpstream({
      ai: () => aiConfig({ enabled: true }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.ai).toEqual({
      desiredEnabled: false,
      effectiveEnabled: true,
      state: "OFF",
    });
  });

  it("PENDING quando o desejado está ligado mas a IA ainda não projetou o tenant (efetivo nulo)", async () => {
    const owner = await business("status-pending-null");
    await setDesiredAi(owner, true);
    stubUpstream({
      ai: () => aiConfig(null),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.ai).toEqual({
      desiredEnabled: true,
      effectiveEnabled: null,
      state: "PENDING",
    });
  });

  it("PENDING quando o desejado está ligado mas a IA relata efetivo desligado", async () => {
    const owner = await business("status-pending-mismatch");
    await setDesiredAi(owner, true);
    stubUpstream({
      ai: () => aiConfig({ enabled: false }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.ai).toEqual({
      desiredEnabled: true,
      effectiveEnabled: false,
      state: "PENDING",
    });
  });

  it("UNKNOWN e degraded quando a IA não responde, nunca 500", async () => {
    const owner = await business("status-ai-down");
    await setDesiredAi(owner, true);
    stubUpstream({ ai: () => aiUnavailable() });

    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.ai).toEqual({
      desiredEnabled: true,
      effectiveEnabled: null,
      state: "UNKNOWN",
    });
    expect(body.degraded).toBe(true);
  });

  it("isola o status por sessão: negócios com estados opostos nunca leem um o do outro", async () => {
    const connected = await business("status-isolation-a");
    const disconnected = await business("status-isolation-b");
    await linkWhatsAppInstance(connected, "status_isolation_a");
    await linkWhatsAppInstance(disconnected, "status_isolation_b");
    await setDesiredAi(connected, true);
    await setDesiredAi(disconnected, false);
    stubUpstream({
      ai: (call) =>
        aiConfig({ enabled: call.tenantId === connected.tenantId }),
      evolution: () => evolutionStatus(true),
    });

    const forConnected = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(connected),
    });
    expect(forConnected.json().data.ai.state).toBe("ACTIVE");

    // Mesmo Evolution reportando conectado para as duas instâncias, o segundo
    // negócio continua OFF pelo próprio desejo — e nunca lê a configuração do
    // primeiro.
    const forDisconnected = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(disconnected),
    });
    expect(forDisconnected.json().data.ai).toEqual({
      desiredEnabled: false,
      effectiveEnabled: false,
      state: "OFF",
    });
  });
});
