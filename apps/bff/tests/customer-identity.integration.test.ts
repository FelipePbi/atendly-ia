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
 * Rotas públicas de cliente do Goal006 — contra sessão real.
 *
 * O que é do BFF: o negócio sai da sessão autenticada, `tenantId` por header,
 * body ou query não escolhe negócio nenhum, mutação por cookie exige CSRF, e o
 * telefone deixou de ser obrigatório. A regra de identidade em si (telefone não
 * exclusivo, criação só na confirmação, autorização de notas e tags) é provada
 * nas suítes do Scheduling; aqui o Scheduling é um dobro HTTP.
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

const phone = "5511999990000";

function customerPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "customer-1",
    name: "Maria",
    phone: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function stubScheduling(payload: unknown) {
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

describe.skipIf(!RUN_INTEGRATION)("public customer routes", () => {
  it("cria pessoa sem telefone e resolve o negócio pela sessão", async () => {
    const owner = await registerBusiness(app, "customers-a");
    const other = await registerBusiness(app, "customers-b");
    created.push(owner, other);
    stubScheduling({ data: customerPayload(), requestId: "upstream-create" });

    const response = await app.inject({
      method: "POST",
      url: `/v1/customers?tenantId=${other.tenantId}`,
      headers: { ...browserMutation(owner), "x-tenant-id": other.tenantId },
      payload: { name: "Maria", tenantId: other.tenantId },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ id: "customer-1", phone: null });
    expect(upstream).toHaveLength(1);
    expect(upstream[0].tenantId).toBe(owner.tenantId);
    expect(upstream[0].tenantId).not.toBe(other.tenantId);
  });

  it("recusa uma pessoa sem nome e sem telefone antes de chamar o Scheduling", async () => {
    const owner = created[0]!;
    stubScheduling({ data: customerPayload(), requestId: "upstream-invalid" });

    const response = await app.inject({
      method: "POST",
      url: "/v1/customers",
      headers: browserMutation(owner),
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(upstream).toHaveLength(0);
  });

  it("devolve candidatos quando a busca é por telefone", async () => {
    const owner = created[0]!;
    stubScheduling({
      data: {
        items: [
          customerPayload({ id: "customer-maria", name: "Maria", phone }),
          customerPayload({ id: "customer-pedro", name: "Pedro", phone }),
        ],
        source: "ATENDLY",
        managedExternally: false,
        filteredByPhone: true,
      },
      requestId: "upstream-list",
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/customers?phone=${phone}`,
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    // Um número, duas pessoas: a busca devolve candidatos, não uma identidade.
    expect(response.json().data.items).toHaveLength(2);
    expect(upstream[0].url).toContain(`phone=${phone}`);
    expect(upstream[0].tenantId).toBe(owner.tenantId);
  });

  it("recusa a mutação por cookie sem CSRF, antes de chamar o Scheduling", async () => {
    const owner = created[0]!;
    stubScheduling({ data: customerPayload(), requestId: "upstream-csrf" });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/customers/customer-1",
      headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
      payload: { name: "Maria Silva" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
    expect(upstream).toHaveLength(0);
  });

  it("recusa sem CSRF também as rotas de responsável, nota e tag", async () => {
    const owner = created[0]!;
    stubScheduling({ data: customerPayload(), requestId: "upstream-csrf-2" });

    const mutations: Array<{ method: "PUT" | "POST" | "DELETE"; url: string }> = [
      { method: "PUT", url: "/v1/customers/customer-1/primary-guardian" },
      { method: "DELETE", url: "/v1/customers/customer-1/primary-guardian" },
      { method: "POST", url: "/v1/customers/customer-1/notes" },
      { method: "POST", url: "/v1/customers/customer-1/tags" },
      { method: "DELETE", url: "/v1/customers/customer-1/tags/tag-1" },
    ];

    for (const mutation of mutations) {
      const response = await app.inject({
        method: mutation.method,
        url: mutation.url,
        headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
        payload: { guardianCustomerId: "customer-2", body: "x", label: "x" },
      });
      expect(response.statusCode).toBe(403);
    }
    expect(upstream).toHaveLength(0);
  });

  it("grava nota como não autorizada quando a autorização não foi pedida", async () => {
    const owner = created[0]!;
    stubScheduling({
      data: {
        id: "note-1",
        body: "Prefere atendimento à tarde",
        aiAuthorized: false,
        authorizedAt: null,
        authorizedBy: null,
        createdBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      requestId: "upstream-note",
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/customers/customer-1/notes",
      headers: browserMutation(owner),
      payload: { body: "Prefere atendimento à tarde" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.aiAuthorized).toBe(false);
    // A autorização é atributo do registro e nasce negada: o BFF não pode
    // deixar o Scheduling adivinhar o padrão.
    expect(JSON.parse(upstream[0].body ?? "{}")).toMatchObject({
      aiAuthorized: false,
    });
  });
});
