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
 * Goal012, WU-06 — conhecimento, memória do cliente, resumo e sugestões no
 * BFF, com a IA como dublê HTTP.
 *
 * O que é do BFF, provado aqui: tenant da sessão e CSRF em cada rota nova, o
 * corpo repassado ao contrato interno especificado no Goal, o DTO da IA
 * devolvido sem reescrita, e erro próprio da IA chegando com o código
 * original preservado (nunca um 500 genérico). A regra de negócio em si —
 * versionamento do documento, proveniência da memória, material do resumo,
 * ausência de efeito da sugestão — é provada nas suítes da IA.
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

function knowledgeDocumentPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-1",
    type: "FAQ",
    serviceId: null,
    title: "Horário de funcionamento",
    source: "faq/horario",
    version: "1",
    checksum: "checksum-1",
    status: "ACTIVE",
    createdAt: "2026-09-13T12:00:00.000Z",
    updatedAt: "2026-09-13T12:00:00.000Z",
    ...overrides,
  };
}

function customerMemoryPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "memory-1",
    customerId: "customer-1",
    kind: "PREFERRED_PERIOD",
    value: "tarde",
    origin: "PROFESSIONAL",
    aiAllowed: false,
    confidence: null,
    sourceConversationId: null,
    sourceMessageIds: [],
    observedAt: "2026-09-13T12:00:00.000Z",
    lastReinforcedAt: null,
    supersededById: null,
    removedAt: null,
    removedBy: null,
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
 * Dublê HTTP da IA por rota interna. `respond` decide o corpo/status de cada
 * caminho; ausência de handler é erro de teste, não 200 silencioso.
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

describe.skipIf(!RUN_INTEGRATION)("Goal012: conhecimento, memória, resumo e sugestões", () => {
  it("cria, lista, obtém, edita e desativa documento de conhecimento por /v1/knowledge/documents", async () => {
    const owner = await business("knowledge-crud");
    stubUpstream((call) => {
      if (call.path === "/internal/knowledge/documents" && call.method === "POST") {
        return {
          status: 201,
          body: { data: knowledgeDocumentPayload(call.body ?? {}), requestId: "up-1" },
        };
      }
      if (call.path === "/internal/knowledge/documents" && call.method === "GET") {
        return { status: 200, body: { data: [knowledgeDocumentPayload()], requestId: "up-2" } };
      }
      if (call.path === "/internal/knowledge/documents/document-1" && call.method === "GET") {
        return { status: 200, body: { data: knowledgeDocumentPayload(), requestId: "up-3" } };
      }
      if (call.path === "/internal/knowledge/documents/document-1" && call.method === "PUT") {
        return {
          status: 200,
          body: {
            data: knowledgeDocumentPayload({ version: "2", ...call.body }),
            requestId: "up-4",
          },
        };
      }
      if (call.path === "/internal/knowledge/documents/document-1" && call.method === "DELETE") {
        return {
          status: 200,
          body: { data: knowledgeDocumentPayload({ status: "INACTIVE" }), requestId: "up-5" },
        };
      }
      throw new Error(`unexpected upstream call: ${call.method} ${call.path}`);
    });

    const created_ = await app.inject({
      method: "POST",
      url: "/v1/knowledge/documents",
      headers: browserMutation(owner),
      payload: {
        type: "FAQ",
        title: "Horário de funcionamento",
        chunks: [{ content: "Abrimos das 9h às 18h." }],
      },
    });
    expect(created_.statusCode).toBe(201);
    expect(created_.json().data.id).toBe("document-1");
    expect(upstream[0]?.tenantId).toBe(owner.tenantId);
    expect(upstream[0]?.body).toMatchObject({
      type: "FAQ",
      title: "Horário de funcionamento",
      chunks: [{ content: "Abrimos das 9h às 18h." }],
    });

    const list = await app.inject({
      method: "GET",
      url: "/v1/knowledge/documents?type=FAQ",
      headers: browserRead(owner),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);

    const got = await app.inject({
      method: "GET",
      url: "/v1/knowledge/documents/document-1",
      headers: browserRead(owner),
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().data.id).toBe("document-1");

    const edited = await app.inject({
      method: "PUT",
      url: "/v1/knowledge/documents/document-1",
      headers: browserMutation(owner),
      payload: { title: "Horário atualizado", chunks: [{ content: "Abrimos das 8h às 19h." }] },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().data.version).toBe("2");

    const deactivated = await app.inject({
      method: "DELETE",
      url: "/v1/knowledge/documents/document-1",
      headers: browserMutation(owner),
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().data.status).toBe("INACTIVE");
  });

  it("grava o campo livre por PUT /v1/knowledge/other-info", async () => {
    const owner = await business("knowledge-other-info");
    stubUpstream((call) => {
      expect(call.path).toBe("/internal/knowledge/other-info");
      expect(call.method).toBe("PUT");
      return {
        status: 200,
        body: {
          data: knowledgeDocumentPayload({
            type: "BUSINESS_INFO",
            source: "business-info/other-important-information",
          }),
          requestId: "up-other-info",
        },
      };
    });

    const response = await app.inject({
      method: "PUT",
      url: "/v1/knowledge/other-info",
      headers: browserMutation(owner),
      payload: { content: "Aceitamos pets na sala de espera." },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.type).toBe("BUSINESS_INFO");
    expect(upstream[0]?.body).toEqual({ content: "Aceitamos pets na sala de espera." });
  });

  it("repassa KNOWLEDGE_INDEX_UNAVAILABLE com código próprio, nunca como 500 genérico", async () => {
    const owner = await business("knowledge-index-unavailable");
    stubUpstream((call) => {
      expect(call.path).toBe("/internal/knowledge/documents");
      return {
        status: 502,
        body: {
          error: {
            code: "KNOWLEDGE_INDEX_UNAVAILABLE",
            message: "Knowledge index is unavailable.",
          },
          requestId: "up-fail",
        },
      };
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/knowledge/documents",
      headers: browserMutation(owner),
      payload: {
        type: "FAQ",
        title: "Horário",
        chunks: [{ content: "Abrimos das 9h às 18h." }],
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("UPSTREAM_ERROR");
    expect(response.json().error.details.upstreamCode).toBe("KNOWLEDGE_INDEX_UNAVAILABLE");
  });

  it("recusa POST /v1/knowledge/documents por cookie sem CSRF, antes de chamar a IA", async () => {
    const owner = await business("knowledge-csrf");
    stubUpstream(() => {
      throw new Error("upstream should not be called without CSRF");
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/knowledge/documents",
      headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
      payload: { type: "FAQ", title: "Horário", chunks: [{ content: "Abrimos das 9h." }] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
    expect(upstream).toHaveLength(0);
  });

  it("cria, lista, altera permissão e remove memória por /v1/customers/:id/memory", async () => {
    const owner = await business("customer-memory-crud");
    stubUpstream((call) => {
      if (call.path === "/internal/customers/customer-1/memory" && call.method === "POST") {
        return {
          status: 201,
          body: { data: customerMemoryPayload(call.body ?? {}), requestId: "up-1" },
        };
      }
      if (call.path === "/internal/customers/customer-1/memory" && call.method === "GET") {
        return { status: 200, body: { data: [customerMemoryPayload()], requestId: "up-2" } };
      }
      if (
        call.path === "/internal/customers/customer-1/memory/memory-1" &&
        call.method === "PATCH"
      ) {
        return {
          status: 200,
          body: {
            data: customerMemoryPayload({ aiAllowed: (call.body as { aiAllowed: boolean }).aiAllowed }),
            requestId: "up-3",
          },
        };
      }
      if (
        call.path === "/internal/customers/customer-1/memory/memory-1" &&
        call.method === "DELETE"
      ) {
        return {
          status: 200,
          body: {
            data: customerMemoryPayload({ removedAt: "2026-09-13T13:00:00.000Z", removedBy: owner.userId }),
            requestId: "up-4",
          },
        };
      }
      throw new Error(`unexpected upstream call: ${call.method} ${call.path}`);
    });

    const createdMemory = await app.inject({
      method: "POST",
      url: "/v1/customers/customer-1/memory",
      headers: browserMutation(owner),
      payload: { kind: "PREFERRED_PERIOD", value: "tarde" },
    });
    expect(createdMemory.statusCode).toBe(201);
    // Origem nunca vem do corpo: cadastro pelo painel é sempre PROFESSIONAL, e
    // a permissão nasce negada quando não declarada.
    expect(upstream[0]?.body).toEqual({ kind: "PREFERRED_PERIOD", value: "tarde", aiAllowed: false });
    expect(upstream[0]?.body).not.toHaveProperty("origin");
    expect(createdMemory.json().data.origin).toBe("PROFESSIONAL");

    const list = await app.inject({
      method: "GET",
      url: "/v1/customers/customer-1/memory",
      headers: browserRead(owner),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);

    const permission = await app.inject({
      method: "PATCH",
      url: "/v1/customers/customer-1/memory/memory-1",
      headers: browserMutation(owner),
      payload: { aiAllowed: true },
    });
    expect(permission.statusCode).toBe(200);
    expect(permission.json().data.aiAllowed).toBe(true);

    const removed = await app.inject({
      method: "DELETE",
      url: "/v1/customers/customer-1/memory/memory-1",
      headers: browserMutation(owner),
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data.removedAt).not.toBeNull();
  });

  it("recusa mutação de memória por cookie sem CSRF", async () => {
    const owner = await business("customer-memory-csrf");
    stubUpstream(() => {
      throw new Error("upstream should not be called without CSRF");
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/customers/customer-1/memory",
      headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
      payload: { kind: "PREFERRED_PERIOD", value: "tarde" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
    expect(upstream).toHaveLength(0);
  });

  it("gera resumo do cliente por POST /v1/customers/:id/summary", async () => {
    const owner = await business("customer-summary");
    stubUpstream((call) => {
      expect(call.path).toBe("/internal/customers/customer-1/summary");
      expect(call.method).toBe("POST");
      expect(call.tenantId).toBe(owner.tenantId);
      return {
        status: 200,
        body: {
          data: {
            customerId: "customer-1",
            summary: "Prefere atendimento à tarde; próxima consulta em 20/09.",
            promptVersion: "summary-v1",
            aiRunId: "run-1",
            sources: { memory: 1, notes: 2, tags: 1, upcomingAppointments: 1 },
          },
          requestId: "up-summary",
        },
      };
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/customers/customer-1/summary",
      headers: browserMutation(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.summary).toContain("tarde");
    expect(response.json().data.sources).toEqual({
      memory: 1,
      notes: 2,
      tags: 1,
      upcomingAppointments: 1,
    });
  });

  it("repassa CUSTOMER_NOT_LINKED do resumo com código próprio", async () => {
    const owner = await business("customer-summary-not-linked");
    stubUpstream(() => ({
      status: 404,
      body: {
        error: { code: "CUSTOMER_NOT_LINKED", message: "Customer is not linked to a contact." },
        requestId: "up-fail",
      },
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/customers/customer-1/summary",
      headers: browserMutation(owner),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("UPSTREAM_ERROR");
    expect(response.json().error.details.upstreamCode).toBe("CUSTOMER_NOT_LINKED");
  });

  it("gera até três sugestões por POST /v1/conversations/:id/suggestions, sem tocar o envio", async () => {
    const owner = await business("conversation-suggestions");
    stubUpstream((call) => {
      expect(call.path).toBe("/internal/conversations/conversation-1/suggestions");
      expect(call.method).toBe("POST");
      expect(call.tenantId).toBe(owner.tenantId);
      // Exatamente o DTO que `POST /internal/conversations/:id/suggestions`
      // devolve — conversa, sugestões, auditoria e versão do prompt. Um stub
      // com forma própria esconderia justamente a divergência de contrato.
      return {
        status: 200,
        body: {
          data: {
            conversationId: "conversation-1",
            suggestions: [
              "Claro! Temos horário amanhã às 14h.",
              "Posso te encaixar na quinta de manhã, funciona?",
            ],
            aiRunId: "run-suggestion-1",
            promptVersion: "prompt-v2-balanced-abc1234567",
          },
          requestId: "up-suggestions",
        },
      };
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations/conversation-1/suggestions",
      headers: browserMutation(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.suggestions).toHaveLength(2);
    expect(response.json().data.suggestions.length).toBeLessThanOrEqual(3);
    expect(response.json().data).toMatchObject({
      conversationId: "conversation-1",
      aiRunId: "run-suggestion-1",
      promptVersion: "prompt-v2-balanced-abc1234567",
    });
    // A rota de sugestão não é a rota de envio: nenhuma outra chamada
    // upstream aconteceu (nem mensagem, nem outbox).
    expect(upstream).toHaveLength(1);
  });

  it("repassa uma recusa própria de sugestão (sem atendimento humano vigente) com código, não 500 genérico", async () => {
    const owner = await business("conversation-suggestions-refusal");
    // `HUMAN_HANDLING_REQUIRED` é a recusa que a IA realmente emite
    // (`SuggestionRefusalReason`); um código inventado no dublê provaria
    // repasse de algo que nunca chega.
    stubUpstream(() => ({
      status: 409,
      body: {
        error: {
          code: "HUMAN_HANDLING_REQUIRED",
          message: "Suggestions are not available for this conversation.",
        },
        requestId: "up-refusal",
      },
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations/conversation-1/suggestions",
      headers: browserMutation(owner),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("UPSTREAM_ERROR");
    expect(response.json().error.details.upstreamCode).toBe(
      "HUMAN_HANDLING_REQUIRED",
    );
  });

  it("recusa POST /v1/conversations/:id/suggestions por cookie sem CSRF", async () => {
    const owner = await business("conversation-suggestions-csrf");
    stubUpstream(() => {
      throw new Error("upstream should not be called without CSRF");
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations/conversation-1/suggestions",
      headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
    expect(upstream).toHaveLength(0);
  });
});
