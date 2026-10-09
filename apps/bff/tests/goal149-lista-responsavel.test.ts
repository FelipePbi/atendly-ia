import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { customerListSchema } from "@avenly-ia/public-api-contract";

/**
 * Goal149/WU-02 — `GET /v1/customers` repassa `guardian` e `dependents` que o
 * Scheduling devolve na lista. Sem PostgreSQL e sem sessão real: o tenant é um
 * dublê de módulo e o Scheduling é um `fetch` dublê (como em
 * `goal139-ignored-contacts.test.ts`). Prova: os dois campos atravessam o
 * schema local do cliente HTTP (zod sem `.strict()` os descartaria), a
 * resposta sem eles segue válida e sai sem eles, a resposta passa no guard de
 * contrato do Goal036 e o detalhe do cliente não ganha os campos.
 */

const ROOT = "root-internal-secret-with-32-chars-min-149";
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

const { registerV1CustomerRoutes } = await import(
  "../src/modules/customers/routes.js"
);
const { registerResponseContractCheck, responseContractViolation } =
  await import("../src/lib/response-contract.js");

interface UpstreamCall {
  method: string;
  path: string;
  search: string;
}

const upstream: UpstreamCall[] = [];
let listItems: Array<Record<string, unknown>> = [];

const withRelations = [
  {
    id: "cus-pedro",
    name: "Pedro Souza",
    phone: null,
    guardian: { id: "cus-maria", name: "Maria Souza" },
    dependents: [],
  },
  {
    id: "cus-maria",
    name: "Maria Souza",
    phone: "5511999990001",
    guardian: null,
    dependents: [
      { id: "cus-pedro", name: "Pedro Souza" },
      { id: "cus-sem-nome", name: null },
    ],
  },
];

const withoutRelations = [
  { id: "cus-ana", name: "Ana", phone: "5511999990002" },
];

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      upstream.push({
        method: request.method,
        path: url.pathname,
        search: url.search,
      });
      if (url.pathname === "/internal/customers") {
        return jsonResponse({
          data: {
            items: listItems,
            source: "ATENDLY",
            managedExternally: false,
            ...(url.searchParams.has("phone")
              ? { filteredByPhone: true }
              : {}),
          },
          requestId: "up-list",
        });
      }
      return jsonResponse({
        data: {
          id: "cus-maria",
          name: "Maria Souza",
          phone: "5511999990001",
          // Mesmo que o Scheduling vazasse os campos no detalhe, o BFF não
          // os declara ali.
          guardian: null,
          dependents: [{ id: "cus-pedro", name: "Pedro Souza" }],
          primaryGuardian: null,
          notes: [],
          tags: [],
        },
        requestId: "up-detail",
      });
    }),
  );
}

let app: FastifyInstance;

beforeEach(async () => {
  upstream.length = 0;
  listItems = withRelations;
  stubUpstream();
  app = Fastify({ logger: false });
  registerResponseContractCheck(app);
  await registerV1CustomerRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("Goal149/WU-02: GET /v1/customers repassa guardian e dependents", () => {
  it("devolve guardian e dependents vindos do Scheduling, validados pelo contrato", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/customers",
    });

    expect(response.statusCode).toBe(200);
    expect(upstream).toHaveLength(1);
    expect(upstream[0]?.path).toBe("/internal/customers");

    const { data } = response.json();
    expect(data.items).toEqual(withRelations);
    expect(() => customerListSchema.parse(data)).not.toThrow();
  });

  it("repassa os campos também na busca por telefone", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/customers?phone=5511999990001",
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.filteredByPhone).toBe(true);
    expect(data.items[1].dependents).toEqual(withRelations[1]?.dependents);
    expect(data.items[0].guardian).toEqual({
      id: "cus-maria",
      name: "Maria Souza",
    });
  });

  it("aceita resposta do Scheduling sem os campos e sai sem eles", async () => {
    listItems = withoutRelations;

    const response = await app.inject({
      method: "GET",
      url: "/v1/customers",
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.items).toEqual(withoutRelations);
    expect(data.items[0]).not.toHaveProperty("guardian");
    expect(data.items[0]).not.toHaveProperty("dependents");
  });

  it("passa no guard de contrato do Goal036 e ele reprova campo a mais dentro do responsável", () => {
    const request = {
      method: "GET",
      routeOptions: { url: "/v1/customers" },
    } as unknown as FastifyRequest;
    const body = (items: unknown) =>
      JSON.stringify({
        data: { items, source: "ATENDLY", managedExternally: false },
        requestId: "req-goal149",
      });

    expect(responseContractViolation(request, 200, body(withRelations))).toBeNull();

    const leaked = [
      {
        ...withRelations[0],
        guardian: { id: "cus-maria", name: "Maria Souza", phone: "x" },
      },
    ];
    expect(
      responseContractViolation(request, 200, body(leaked))?.fieldPaths,
    ).toEqual(["data.items[0].guardian.phone"]);
  });

  it("não muda o detalhe do cliente: guardian e dependents não aparecem", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/customers/cus-maria",
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data).not.toHaveProperty("guardian");
    expect(data).not.toHaveProperty("dependents");
    expect(data.primaryGuardian).toBeNull();
  });
});
