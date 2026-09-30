import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  ALLOWED_ORIGIN,
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal078, WU-03 — BFF e contrato de `/v1/services/:id/ai-instruction`, com
 * o Scheduling e a IA como dublês HTTP.
 *
 * O que é do BFF, provado aqui: tenant da sessão e CSRF na mutação, posse do
 * serviço conferida por `scheduling.listServices` antes de chamar a IA (com
 * `404 SERVICE_NOT_FOUND` e nenhuma chamada à IA quando o serviço não é do
 * negócio), e o corpo `{ content }` validado no BFF (limite de 2000
 * caracteres, sem campo a mais) antes de tocar qualquer upstream.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  tenantId: string | null;
  body: Record<string, unknown> | null;
}

const upstream: UpstreamCall[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function servicePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "service-1",
    name: "Corte de cabelo",
    durationMinutes: 30,
    priceType: "FIXED",
    price: 50,
    active: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Dublê HTTP do Scheduling e da IA por rota interna. `respond` decide o
 * corpo/status de cada caminho; ausência de handler é erro de teste, não
 * `200` silencioso.
 */
function stubUpstream(
  respond: (call: UpstreamCall) => { status: number; body: unknown },
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const bodyText =
        request.method === "GET" || request.method === "DELETE"
          ? null
          : await request.text();
      const call: UpstreamCall = {
        method: request.method,
        path: url.pathname,
        tenantId: request.headers.get("x-tenant-id"),
        body: bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null,
      };
      upstream.push(call);
      const { status, body } = respond(call);
      return jsonResponse(body, status);
    }),
  );
}

function stubOwnService(respondInstruction: (call: UpstreamCall) => { status: number; body: unknown }) {
  stubUpstream((call) => {
    if (call.path === "/internal/service-catalog" && call.method === "GET") {
      return { status: 200, body: { data: [servicePayload()], requestId: "up-catalog" } };
    }
    return respondInstruction(call);
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
  upstream.length = 0;
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("Goal078: instrução privada por serviço", () => {
  it("lê e grava por GET/PUT /v1/services/:id/ai-instruction com o tenant da sessão", async () => {
    const owner = await business("service-instruction-crud");
    stubOwnService((call) => {
      expect(call.path).toBe("/internal/knowledge/service-instructions/service-1");
      if (call.method === "GET") {
        return { status: 200, body: { data: { content: "" }, requestId: "up-get" } };
      }
      expect(call.method).toBe("PUT");
      expect(call.tenantId).toBe(owner.tenantId);
      return {
        status: 200,
        body: { data: { content: "Nunca oferecer desconto sem autorização." }, requestId: "up-put" },
      };
    });

    const read = await app.inject({
      method: "GET",
      url: "/v1/services/service-1/ai-instruction",
      headers: browserRead(owner),
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data).toEqual({ content: "" });

    const written = await app.inject({
      method: "PUT",
      url: "/v1/services/service-1/ai-instruction",
      headers: browserMutation(owner),
      payload: { content: "Nunca oferecer desconto sem autorização." },
    });
    expect(written.statusCode).toBe(200);
    expect(written.json().data).toEqual({ content: "Nunca oferecer desconto sem autorização." });
    expect(upstream.find((call) => call.method === "PUT")?.body).toEqual({
      content: "Nunca oferecer desconto sem autorização.",
    });
  });

  it("responde 401 sem sessão", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/services/service-1/ai-instruction",
    });
    expect(response.statusCode).toBe(401);
  });

  it("recusa PUT por cookie sem CSRF, antes de chamar qualquer upstream", async () => {
    const owner = await business("service-instruction-csrf");
    stubUpstream(() => {
      throw new Error("upstream should not be called without CSRF");
    });

    const response = await app.inject({
      method: "PUT",
      url: "/v1/services/service-1/ai-instruction",
      headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
      payload: { content: "Instrução qualquer." },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
    expect(upstream).toHaveLength(0);
  });

  it("responde 404 SERVICE_NOT_FOUND para serviço inexistente, sem chamar a IA", async () => {
    const owner = await business("service-instruction-missing");
    stubUpstream((call) => {
      expect(call.path).toBe("/internal/service-catalog");
      return { status: 200, body: { data: [servicePayload()], requestId: "up-catalog" } };
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/services/other-service/ai-instruction",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("SERVICE_NOT_FOUND");
    expect(upstream.some((call) => call.path.startsWith("/internal/knowledge/service-instructions"))).toBe(
      false,
    );
  });

  it("responde 404 SERVICE_NOT_FOUND para serviço de outro negócio, sem chamar a IA", async () => {
    const owner = await business("service-instruction-cross-tenant");
    const otherOwner = await business("service-instruction-cross-tenant-other");
    stubUpstream((call) => {
      expect(call.path).toBe("/internal/service-catalog");
      // O catálogo do Scheduling já é escopado pelo tenant do contexto
      // interno; o negócio B nunca vê o serviço do negócio A na lista.
      expect(call.tenantId).toBe(otherOwner.tenantId);
      return { status: 200, body: { data: [servicePayload()], requestId: "up-catalog" } };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/v1/services/service-owned-by-a/ai-instruction",
      headers: browserMutation(otherOwner),
      payload: { content: "Tentativa de acesso cruzado." },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("SERVICE_NOT_FOUND");
    expect(upstream.some((call) => call.path.startsWith("/internal/knowledge/service-instructions"))).toBe(
      false,
    );
    void owner;
  });

  it("recusa corpo com mais de 2000 caracteres antes de chamar qualquer upstream", async () => {
    const owner = await business("service-instruction-too-long");
    stubUpstream(() => {
      throw new Error("upstream should not be called for an invalid body");
    });

    const response = await app.inject({
      method: "PUT",
      url: "/v1/services/service-1/ai-instruction",
      headers: browserMutation(owner),
      payload: { content: "a".repeat(2_001) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(upstream).toHaveLength(0);
  });

  it("recusa corpo com campo a mais antes de chamar qualquer upstream", async () => {
    const owner = await business("service-instruction-extra-field");
    stubUpstream(() => {
      throw new Error("upstream should not be called for an invalid body");
    });

    const response = await app.inject({
      method: "PUT",
      url: "/v1/services/service-1/ai-instruction",
      headers: browserMutation(owner),
      payload: { content: "Instrução válida.", extra: "campo indevido" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(upstream).toHaveLength(0);
  });
});
