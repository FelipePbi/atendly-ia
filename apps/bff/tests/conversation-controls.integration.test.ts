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
 * Contratos de categoria, ignore e retomada — contra sessão real.
 *
 * O que esta suíte prova é o que é do BFF: o negócio sai da sessão autenticada,
 * as mutações por cookie exigem CSRF e origem, e `tenantId` enviado por header,
 * body ou query não escolhe negócio nenhum. A política de sessão em si é
 * exercitada na IA; aqui a IA é um dobro HTTP.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  url: string;
  tenantId: string | null;
  body: string | null;
}

const upstream: UpstreamCall[] = [];

function conversationPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: "conversation-1",
      externalContactId: "5511999999999",
      customerName: "Maria",
      status: "ACTIVE",
      humanHandoff: false,
      handoffReason: null,
      lastMessage: null,
      unreadCount: 0,
      updatedAt: new Date().toISOString(),
      category: "UNCLASSIFIED",
      categorySource: "AUTOMATIC",
      suggestedCategory: null,
      handling: "AI",
      ignored: false,
      ignoredAt: null,
      aiPaused: false,
      session: {
        id: "session-1",
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        lastContactMessageAt: null,
        humanHandlingSince: null,
      },
      ...overrides,
    },
    requestId: "upstream-1",
  };
}

function stubOrchestrator(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      upstream.push({
        method: request.method,
        url: request.url,
        tenantId: request.headers.get("x-tenant-id"),
        body: request.method === "GET" ? null : await request.text(),
      });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
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

describe.skipIf(!RUN_INTEGRATION)("conversation controls", () => {
  it("resolve o negócio pela sessão, não pelo que o browser mandou", async () => {
    const owner = await registerBusiness(app, "controls-a");
    const other = await registerBusiness(app, "controls-b");
    created.push(owner, other);
    stubOrchestrator(conversationPayload({ category: "PERSONAL" }));

    const response = await app.inject({
      method: "PUT",
      url: "/v1/conversations/conversation-1/category?tenantId=" + other.tenantId,
      headers: {
        ...browserMutation(owner),
        "x-tenant-id": other.tenantId,
      },
      payload: { category: "PERSONAL", tenantId: other.tenantId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ category: "PERSONAL" });
    // O tenant que chegou na IA é o da sessão, e não o injetado.
    expect(upstream).toHaveLength(1);
    expect(upstream[0].tenantId).toBe(owner.tenantId);
    expect(upstream[0].tenantId).not.toBe(other.tenantId);
    expect(upstream[0].method).toBe("PUT");
  });

  it("recusa a mutação por cookie sem CSRF, antes de chamar a IA", async () => {
    const owner = created[0] ?? (await registerBusiness(app, "controls-c"));
    if (!created.includes(owner)) created.push(owner);
    stubOrchestrator(conversationPayload());

    // Origem permitida e cookie válido; só o token de CSRF falta. As duas
    // verificações são independentes, e é a do token que este caso isola.
    const response = await app.inject({
      method: "PUT",
      url: "/v1/conversations/conversation-1/ignore",
      headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
      payload: { ignored: true },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
    expect(upstream).toHaveLength(0);
  });

  it("recusa a mutação vinda de origem não permitida", async () => {
    const owner = created[0]!;
    stubOrchestrator(conversationPayload());

    const response = await app.inject({
      method: "PUT",
      url: "/v1/conversations/conversation-1/category",
      headers: { ...browserMutation(owner), origin: HOSTILE_ORIGIN },
      payload: { category: "COMMERCIAL" },
    });

    expect(response.statusCode).toBe(403);
    expect(upstream).toHaveLength(0);
  });

  it("aceita a lista filtrada por categoria e estado de atendimento", async () => {
    const owner = created[0]!;
    stubOrchestrator({
      data: [conversationPayload({ handling: "HUMAN" }).data],
      requestId: "upstream-list",
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations?category=PERSONAL&handling=HUMAN&ignored=false",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    const called = new URL(upstream[0].url);
    expect(called.searchParams.get("category")).toBe("PERSONAL");
    expect(called.searchParams.get("handling")).toBe("HUMAN");
    expect(called.searchParams.get("ignored")).toBe("false");
  });

  it("aceita resposta antiga, sem os campos do Goal005", async () => {
    const owner = created[0]!;
    stubOrchestrator({
      data: {
        id: "conversation-1",
        externalContactId: "5511999999999",
        customerName: null,
        status: "ACTIVE",
        humanHandoff: false,
        handoffReason: null,
        lastMessage: null,
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
      },
      requestId: "upstream-legacy",
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/conversation-1",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.category).toBeUndefined();
  });

  it("retomar a IA é uma operação própria e chega à IA como release", async () => {
    const owner = created[0]!;
    stubOrchestrator(conversationPayload({ handling: "AI" }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations/conversation-1/release",
      headers: browserMutation(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(upstream[0].url).toContain("/internal/conversations/conversation-1/release");
    expect(upstream[0].tenantId).toBe(owner.tenantId);
  });
});
