import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  ALLOWED_ORIGIN,
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  HOSTILE_ORIGIN,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal019/WU-07 — `PUT /v1/conversations/ignored-contacts`, a etapa opcional
 * de contatos ignorados entre conectar e testar aceitando telefone informado
 * manualmente, sem conversa aberta ainda.
 *
 * O que é do BFF, provado aqui: o negócio sai da sessão autenticada (nunca do
 * corpo), a mutação por cookie exige CSRF e origem permitida, e a recusa da
 * IA (sem canal WhatsApp ativo) chega como `UPSTREAM_ERROR` com o código
 * original, nunca um `500` genérico. A regra de negócio em si (upsert do
 * contato, normalização do telefone) é provada nas suítes da IA.
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

function ignoredContactPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      contactId: "contact-1",
      externalContactId: "5511999990000",
      ignored: true,
      ignoredAt: new Date().toISOString(),
      ...overrides,
    },
    requestId: "upstream-1",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubUpstream(
  respond: (call: UpstreamCall) => { status: number; body: unknown },
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const bodyText = request.method === "GET" ? null : await request.text();
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

describe.skipIf(!RUN_INTEGRATION)(
  "PUT /v1/conversations/ignored-contacts",
  () => {
    it("resolve o negócio pela sessão e repassa o telefone à IA", async () => {
      const owner = await registerBusiness(app, "ignored-phone-a");
      const other = await registerBusiness(app, "ignored-phone-b");
      created.push(owner, other);
      stubUpstream((call) => {
        expect(call.path).toBe("/internal/contacts/ignore");
        expect(call.body).toEqual({ phone: "+55 11 99999-0000", ignored: true });
        return { status: 200, body: ignoredContactPayload() };
      });

      const response = await app.inject({
        method: "PUT",
        url: "/v1/conversations/ignored-contacts?tenantId=" + other.tenantId,
        headers: {
          ...browserMutation(owner),
          "x-tenant-id": other.tenantId,
        },
        payload: {
          phone: "+55 11 99999-0000",
          ignored: true,
          tenantId: other.tenantId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        contactId: "contact-1",
        externalContactId: "5511999990000",
        ignored: true,
      });
      expect(upstream).toHaveLength(1);
      // O tenant que chega à IA é o da sessão, nunca o injetado por query/body.
      expect(upstream[0].tenantId).toBe(owner.tenantId);
      expect(upstream[0].tenantId).not.toBe(other.tenantId);
    });

    it("recusa a mutação por cookie sem CSRF, antes de chamar a IA", async () => {
      const owner = created[0] ?? (await registerBusiness(app, "ignored-phone-c"));
      if (!created.includes(owner)) created.push(owner);
      stubUpstream(() => ({ status: 200, body: ignoredContactPayload() }));

      const response = await app.inject({
        method: "PUT",
        url: "/v1/conversations/ignored-contacts",
        headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
        payload: { phone: "5511999990000", ignored: true },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
      expect(upstream).toHaveLength(0);
    });

    it("recusa a mutação vinda de origem não permitida", async () => {
      const owner = created[0]!;
      stubUpstream(() => ({ status: 200, body: ignoredContactPayload() }));

      const response = await app.inject({
        method: "PUT",
        url: "/v1/conversations/ignored-contacts",
        headers: { ...browserMutation(owner), origin: HOSTILE_ORIGIN },
        payload: { phone: "5511999990000", ignored: true },
      });

      expect(response.statusCode).toBe(403);
      expect(upstream).toHaveLength(0);
    });

    it("recusa telefone fora do tamanho aceito antes de chamar a IA", async () => {
      const owner = created[0]!;
      stubUpstream(() => {
        throw new Error("upstream should not be called with an invalid phone");
      });

      const response = await app.inject({
        method: "PUT",
        url: "/v1/conversations/ignored-contacts",
        headers: browserMutation(owner),
        payload: { phone: "123", ignored: true },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(upstream).toHaveLength(0);
    });

    it("repassa a recusa da IA sem canal WhatsApp ativo, com o código original", async () => {
      const owner = created[0]!;
      stubUpstream(() => ({
        status: 404,
        body: {
          error: {
            code: "CHANNEL_CONNECTION_NOT_FOUND",
            message: "Active Evolution channel was not found for tenant.",
          },
          requestId: "upstream-refusal",
        },
      }));

      const response = await app.inject({
        method: "PUT",
        url: "/v1/conversations/ignored-contacts",
        headers: browserMutation(owner),
        payload: { phone: "5511999990000", ignored: true },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("UPSTREAM_ERROR");
      expect(response.json().error.details.upstreamCode).toBe(
        "CHANNEL_CONNECTION_NOT_FOUND",
      );
    });
  },
);
