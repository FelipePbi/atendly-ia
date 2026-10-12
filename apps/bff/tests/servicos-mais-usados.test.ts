import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { serviceListSchema } from "@avenly-ia/public-api-contract";

/**
 * Pedido do usuário de 2026-10-12 (D-170): o novo agendamento mostra os 5
 * serviços mais usados, e o uso vem do Scheduling em `usageCount`
 * (atendimentos não cancelados dos últimos 90 dias). Prova que
 * `GET /v1/services` repassa o campo pelo schema local do cliente HTTP (zod
 * sem `.strict()` o descartaria), que a resposta passa no guard de contrato do
 * Goal036 e que o Scheduling anterior, sem o campo, continua válido.
 * Sem PostgreSQL: tenant e Scheduling são dublês, como no Goal149.
 */

const ROOT = "root-internal-secret-with-32-chars-min-170";
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

const { registerV1ServiceRoutes } = await import(
  "../src/modules/services/routes.js"
);
const { registerResponseContractCheck } = await import(
  "../src/lib/response-contract.js"
);

function service(id: string, name: string, usageCount?: number) {
  return {
    id,
    name,
    durationMinutes: 30,
    priceType: "FIXED",
    price: 50,
    active: true,
    needsReview: false,
    reviewOrigin: null,
    description: null,
    colorToken: "ROSE",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    recurrenceIntervalDays: null,
    ...(usageCount === undefined ? {} : { usageCount }),
  };
}

let catalog: Array<Record<string, unknown>> = [];

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let app: FastifyInstance;

beforeEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(new Request(input as RequestInfo, init).url);
      if (url.pathname === "/internal/calendar") {
        return jsonResponse({
          data: {
            source: "AVENLY",
            timezone: "America/Sao_Paulo",
            integration: null,
            capabilities: {
              manageAvailability: true,
              manageServices: true,
              manageCustomers: true,
              createAppointments: true,
              migrate: false,
              aiActivationReady: true,
            },
          },
          requestId: "up-calendar",
        });
      }
      return jsonResponse({ data: catalog, requestId: "up-catalog" });
    }),
  );
  app = Fastify({ logger: false });
  registerResponseContractCheck(app);
  await registerV1ServiceRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("GET /v1/services repassa usageCount (D-170)", () => {
  it("devolve o uso de cada serviço, validado pelo contrato", async () => {
    catalog = [service("svc-corte", "Corte", 12), service("svc-escova", "Escova", 0)];

    const response = await app.inject({ method: "GET", url: "/v1/services" });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(
      data.items.map((item: { id: string; usageCount?: number }) => [
        item.id,
        item.usageCount,
      ]),
    ).toEqual([
      ["svc-corte", 12],
      ["svc-escova", 0],
    ]);
    expect(() => serviceListSchema.parse(data)).not.toThrow();
  });

  it("aceita o Scheduling sem o campo e sai sem ele", async () => {
    catalog = [service("svc-corte", "Corte")];

    const response = await app.inject({ method: "GET", url: "/v1/services" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.items[0]).not.toHaveProperty("usageCount");
  });
});
