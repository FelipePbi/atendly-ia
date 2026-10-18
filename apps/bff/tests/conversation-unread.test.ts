import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  conversationSchema,
  conversationUnreadSummarySchema,
  findPublicApiRoute,
} from "@avenly-ia/public-api-contract";

/**
 * Conversas não lidas (D-195) no contrato e no BFF. Sem PostgreSQL e sem
 * sessão real: o tenant é um dublê de módulo e a IA é um `fetch` dublê (como
 * em `goal139-ignored-contacts.test.ts`). Prova: o contrato encontra as duas
 * rotas novas; o resumo convive com `GET /v1/conversations/:id` e passa pelo
 * contrato; a marcação repassa `readThrough` só quando vem e recusa instante
 * inválido antes da IA.
 */

const ROOT = "root-internal-secret-with-32-chars-min-d187";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

vi.mock("../src/lib/tenant-context.js", () => ({
  requireTenantContext: async (request: FastifyRequest) => {
    request.tenantContext = {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "OWNER",
    };
  },
  currentTenantContext: (request: FastifyRequest) => request.tenantContext,
}));

vi.mock("../src/modules/whatsapp/instance-link.js", () => ({
  findLinkedInstance: async () => null,
}));

const { registerV1ConversationRoutes } = await import(
  "../src/modules/conversations/routes.js"
);
const { registerResponseContractCheck } = await import(
  "../src/lib/response-contract.js"
);

interface UpstreamCall {
  method: string;
  path: string;
  tenantId: string | null;
  body: Record<string, unknown> | null;
}

const upstream: UpstreamCall[] = [];

const summaryPayload = {
  unreadConversations: 2,
  recent: [
    {
      conversationId: "conv-1",
      messageId: "msg-9",
      customerName: "Maria",
      externalContactId: "5511999990001",
      customerId: null,
      kind: "TEXT",
      preview: "Tem horário amanhã?",
      createdAt: "2026-10-18T12:04:00.000Z",
    },
    {
      conversationId: "conv-2",
      messageId: "msg-7",
      customerName: null,
      externalContactId: "5511999990002",
      customerId: "customer-2",
      kind: "AUDIO",
      preview: "",
      createdAt: "2026-10-18T12:01:00.000Z",
    },
  ],
};

const conversationPayload = {
  id: "conv-1",
  externalContactId: "5511999990001",
  customerName: "Maria",
  status: "ACTIVE",
  humanHandoff: false,
  handoffReason: null,
  lastMessage: null,
  unreadCount: 0,
  updatedAt: "2026-10-18T12:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let app: FastifyInstance;

beforeEach(async () => {
  upstream.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const bodyText = request.method === "GET" ? null : await request.text();
      upstream.push({
        method: request.method,
        path: url.pathname,
        tenantId: request.headers.get("x-tenant-id"),
        body: bodyText
          ? (JSON.parse(bodyText) as Record<string, unknown>)
          : null,
      });
      if (url.pathname === "/internal/conversations/unread-summary") {
        return jsonResponse({ data: summaryPayload, requestId: "up-sum" });
      }
      return jsonResponse({ data: conversationPayload, requestId: "up-conv" });
    }),
  );
  app = Fastify({ logger: false });
  registerResponseContractCheck(app);
  await registerV1ConversationRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("D-195: contrato das não lidas", () => {
  it("findPublicApiRoute encontra o resumo e a marcação de leitura", () => {
    expect(
      findPublicApiRoute("GET", "/v1/conversations/unread-summary")?.schema,
    ).toBe(conversationUnreadSummarySchema);
    expect(
      findPublicApiRoute("POST", "/v1/conversations/:id/read")?.schema,
    ).toBe(conversationSchema);
  });

  it("recusa contador negativo e tipo de mensagem fora do enum", () => {
    expect(
      conversationUnreadSummarySchema.safeParse({
        unreadConversations: -1,
        recent: [],
      }).success,
    ).toBe(false);
    expect(
      conversationUnreadSummarySchema.safeParse({
        ...summaryPayload,
        recent: [{ ...summaryPayload.recent[0], kind: "GIF" }],
      }).success,
    ).toBe(false);
  });
});

describe("D-195: GET /v1/conversations/unread-summary", () => {
  it("lê da IA no tenant da sessão e devolve o resumo validado pelo contrato", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/unread-summary",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(summaryPayload);
    expect(upstream).toEqual([
      {
        method: "GET",
        path: "/internal/conversations/unread-summary",
        tenantId: "tenant-1",
        body: null,
      },
    ]);
  });

  it("não engole GET /v1/conversations/:id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/conv-1",
    });
    expect(response.statusCode).toBe(200);
    expect(upstream[0]?.path).toBe("/internal/conversations/conv-1");
  });
});

describe("D-195: POST /v1/conversations/:id/read", () => {
  it("repassa readThrough e devolve a conversa", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/read",
      payload: { readThrough: "2026-10-18T12:04:00.000Z" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ id: "conv-1", unreadCount: 0 });
    expect(upstream).toEqual([
      {
        method: "POST",
        path: "/internal/conversations/conv-1/read",
        tenantId: "tenant-1",
        body: { readThrough: "2026-10-18T12:04:00.000Z" },
      },
    ]);
  });

  it("sem corpo marca até agora, sem inventar readThrough", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/read",
    });
    expect(response.statusCode).toBe(200);
    expect(upstream[0]?.body).toEqual({});
  });

  it("recusa readThrough que não é instante, antes da IA", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/read",
      payload: { readThrough: "ontem" },
    });
    expect(response.statusCode).toBe(400);
    expect(upstream).toEqual([]);
  });
});
