import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { revenueReportSchema } from "@avenly-ia/public-api-contract";

/**
 * `GET /v1/revenue` (D-177): o BFF valida a pergunta, repassa ao Scheduling
 * só o negócio da sessão — query nenhuma escolhe tenant — e a resposta passa
 * no guard de contrato do Goal036. Sem PostgreSQL: sessão e Scheduling são
 * dublês, como em `servicos-mais-usados.test.ts`.
 */

const ROOT = "root-internal-secret-with-32-chars-min-177";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

vi.mock("../src/lib/tenant-context.js", () => ({
  requireTenantContext: async (request: FastifyRequest) => {
    request.tenantContext = {
      userId: "user-1",
      tenantId: "tenant-session",
      role: "OWNER",
    };
  },
  currentTenantContext: (request: FastifyRequest) => request.tenantContext,
}));

const { registerV1RevenueRoutes } = await import(
  "../src/modules/revenue/routes.js"
);
const { registerResponseContractCheck } = await import(
  "../src/lib/response-contract.js"
);

const report = {
  period: "month",
  start: "2026-10-01",
  end: "2026-10-31",
  today: "2026-10-16",
  timezone: "America/Sao_Paulo",
  billed: { amount: 350, count: 3, unvaluedCount: 1, averageTicket: 175 },
  expected: { amount: 150, count: 1, unvaluedCount: 0 },
  previous: {
    start: "2026-09-01",
    end: "2026-09-16",
    amount: 300,
    count: 2,
    partial: true,
  },
  lost: {
    cancelledCount: 1,
    cancelledAmount: 150,
    noShowCount: 0,
    noShowAmount: 0,
  },
  services: [
    {
      serviceId: "svc-cilios",
      name: "Cílios 5D",
      colorToken: "ROSE",
      amount: 350,
      count: 3,
      share: 1,
    },
  ],
  customers: [{ customerId: "cus-ana", name: "Ana", amount: 350, count: 3 }],
  weekdays: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    amount: weekday === 6 ? 350 : 0,
    count: weekday === 6 ? 3 : 0,
  })),
  series: [{ start: "2026-10-01", amount: 350, count: 3, expectedAmount: 0 }],
};

let upstream: Array<{ url: URL; tenantId: string | null }> = [];
let app: FastifyInstance;

beforeEach(async () => {
  upstream = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      upstream.push({
        url: new URL(request.url),
        tenantId: request.headers.get("x-tenant-id"),
      });
      return new Response(JSON.stringify({ data: report, requestId: "up" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  app = Fastify({ logger: false });
  registerResponseContractCheck(app);
  await registerV1RevenueRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("GET /v1/revenue (D-177)", () => {
  it("pergunta ao Scheduling pelo negócio da sessão e devolve o contrato", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/revenue?period=year&date=2026-03-10&tenantId=outro-negocio",
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(() => revenueReportSchema.parse(response.json().data)).not.toThrow();
    expect(upstream).toHaveLength(1);
    const [call] = upstream;
    expect(call?.url.pathname).toBe("/internal/revenue");
    expect(call?.tenantId).toBe("tenant-session");
    expect(call?.url.searchParams.get("period")).toBe("year");
    expect(call?.url.searchParams.get("date")).toBe("2026-03-10");
    expect(call?.url.searchParams.has("tenantId")).toBe(false);
  });

  it("sem período, pede o mês", async () => {
    await app.inject({ method: "GET", url: "/v1/revenue" });
    expect(upstream[0]?.url.searchParams.get("period")).toBe("month");
  });

  it("recusa período ou data fora do formato sem chamar o Scheduling", async () => {
    for (const query of ["period=quarter", "date=16/10/2026"]) {
      const response = await app.inject({
        method: "GET",
        url: `/v1/revenue?${query}`,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(upstream).toHaveLength(0);
  });
});
