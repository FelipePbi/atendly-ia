import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  assertDisposableTarget,
  browserMutation,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Estilo de conversa da IA (Goal011, WU-07) — settings e onboarding contra
 * persistência real, com Scheduling e IA como dobros HTTP.
 *
 * Prova o que é do BFF: os três estilos do produto e os dois valores antigos
 * como alias declarado são aceitos na entrada, a resposta sempre devolve o
 * vocabulário novo — mesmo para um tenant cuja linha ainda guarda o valor
 * legado —, valor desconhecido é recusado com erro próprio antes de qualquer
 * efeito, e a projeção enviada à IA carrega sempre o vocabulário novo.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  body: string | null;
}

const upstream: UpstreamCall[] = [];

function calendarPayload(overrides: Record<string, unknown> = {}) {
  return {
    source: null,
    timezone: null,
    integration: null,
    capabilities: {
      manageAvailability: false,
      manageServices: false,
      manageCustomers: false,
      createAppointments: false,
      migrate: false,
      aiActivationReady: false,
    },
    ...overrides,
  };
}

function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const body =
        request.method === "GET" || request.method === "DELETE"
          ? null
          : await request.text();
      upstream.push({ method: request.method, path: url.pathname, body });

      if (url.pathname === "/internal/calendar") {
        return new Response(
          JSON.stringify({ data: calendarPayload(), requestId: "upstream-calendar" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/ai-tenant-config") {
        return new Response(
          JSON.stringify({ ok: true, config: {} }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: null, requestId: "upstream" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function aiTenantConfigBody(): Record<string, unknown> | null {
  const call = upstream.find((entry) => entry.path === "/internal/ai-tenant-config");
  return call?.body ? (JSON.parse(call.body) as Record<string, unknown>) : null;
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
  upstream.length = 0;
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("Goal011: estilo de conversa da IA", () => {
  it("aceita os três estilos do produto em PATCH /v1/settings/ai e devolve o vocabulário novo", async () => {
    const owner = await business("style-new-settings");
    stubUpstream();

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/settings/ai",
      headers: browserMutation(owner),
      payload: { enabled: false, tone: "CASUAL" },
    });

    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.ai.tone).toBe("CASUAL");

    const row = await getPrisma().aiSettings.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    expect(row.tone).toBe("CASUAL");

    expect(aiTenantConfigBody()?.tone).toBe("CASUAL");
  });

  it("aceita os dois valores antigos como alias em PATCH /v1/settings/ai e normaliza a resposta", async () => {
    const owner = await business("style-legacy-settings");
    stubUpstream();

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/settings/ai",
      headers: browserMutation(owner),
      payload: { enabled: false, tone: "PROFESSIONAL_OBJECTIVE" },
    });

    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.ai.tone).toBe("PROFESSIONAL");

    const row = await getPrisma().aiSettings.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    // Grava sempre o vocabulário novo, nunca o alias recebido.
    expect(row.tone).toBe("PROFESSIONAL");
    expect(aiTenantConfigBody()?.tone).toBe("PROFESSIONAL");

    const other = await app.inject({
      method: "PATCH",
      url: "/v1/settings/ai",
      headers: browserMutation(owner),
      payload: { enabled: false, tone: "LIGHT_CLOSE" },
    });
    expect(other.statusCode).toBe(200);
    expect(other.json().data.ai.tone).toBe("BALANCED");
  });

  it("recusa um estilo desconhecido em PATCH /v1/settings/ai com erro próprio, sem gravar nada", async () => {
    const owner = await business("style-unknown-settings");
    stubUpstream();

    const before = await getPrisma().aiSettings.findUnique({
      where: { tenantId: owner.tenantId },
    });

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/settings/ai",
      headers: browserMutation(owner),
      payload: { enabled: false, tone: "SASSY" },
    });

    expect(patch.statusCode).toBe(400);
    expect(patch.json().error.code).toBe("AI_CONVERSATION_STYLE_UNKNOWN");
    expect(patch.json().error.details.accepted).toEqual([
      "PROFESSIONAL",
      "BALANCED",
      "CASUAL",
    ]);
    expect(upstream).toHaveLength(0);

    const after = await getPrisma().aiSettings.findUnique({
      where: { tenantId: owner.tenantId },
    });
    expect(after?.tone ?? null).toBe(before?.tone ?? null);
  });

  it("lê um tenant legado sempre no vocabulário novo, sem exigir novo PATCH", async () => {
    const owner = await business("style-legacy-read-settings");
    await getPrisma().aiSettings.upsert({
      where: { tenantId: owner.tenantId },
      create: { tenantId: owner.tenantId, enabled: false, tone: "LIGHT_CLOSE" },
      update: { tone: "LIGHT_CLOSE" },
    });
    stubUpstream();

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings",
      headers: browserMutation(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.ai.tone).toBe("BALANCED");

    // A projeção enviada à IA também usa o vocabulário novo, nunca o legado
    // gravado na linha.
    const business_ = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: { name: "Salão Legado", category: "Beleza", timezone: "America/Sao_Paulo" },
    });
    expect(business_.statusCode).toBe(200);
    expect(aiTenantConfigBody()?.tone).toBe("BALANCED");
  });

  it("aceita os três estilos e os dois alias em PATCH /v1/onboarding e devolve o vocabulário novo", async () => {
    const owner = await business("style-onboarding");
    stubUpstream();

    const patchNew = await app.inject({
      method: "PATCH",
      url: "/v1/onboarding",
      headers: browserMutation(owner),
      payload: { ai: { tone: "PROFESSIONAL" } },
    });
    expect(patchNew.statusCode).toBe(200);
    expect(patchNew.json().data.ai.tone).toBe("PROFESSIONAL");
    expect(aiTenantConfigBody()?.tone).toBe("PROFESSIONAL");

    upstream.length = 0;
    const patchLegacy = await app.inject({
      method: "PATCH",
      url: "/v1/onboarding",
      headers: browserMutation(owner),
      payload: { ai: { tone: "LIGHT_CLOSE" } },
    });
    expect(patchLegacy.statusCode).toBe(200);
    expect(patchLegacy.json().data.ai.tone).toBe("BALANCED");

    const row = await getPrisma().aiSettings.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    expect(row.tone).toBe("BALANCED");
  });

  it("recusa um estilo desconhecido em PATCH /v1/onboarding com erro próprio", async () => {
    const owner = await business("style-onboarding-unknown");
    stubUpstream();

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/onboarding",
      headers: browserMutation(owner),
      payload: { ai: { tone: "SASSY" } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("AI_CONVERSATION_STYLE_UNKNOWN");
    expect(upstream).toHaveLength(0);
  });

  it("lê o estilo de um tenant legado no vocabulário novo em GET /v1/onboarding", async () => {
    const owner = await business("style-onboarding-legacy-read");
    await getPrisma().aiSettings.upsert({
      where: { tenantId: owner.tenantId },
      create: {
        tenantId: owner.tenantId,
        enabled: false,
        tone: "PROFESSIONAL_OBJECTIVE",
      },
      update: { tone: "PROFESSIONAL_OBJECTIVE" },
    });
    stubUpstream();

    const response = await app.inject({
      method: "GET",
      url: "/v1/onboarding",
      headers: browserMutation(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.ai.tone).toBe("PROFESSIONAL");
  });
});
