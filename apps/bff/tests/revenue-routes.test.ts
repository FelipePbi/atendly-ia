import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  revenueAppointmentListSchema,
  revenueReportSchema,
} from "@avenly-ia/public-api-contract";

/**
 * `GET /v1/revenue` (D-177): o BFF valida a pergunta, repassa ao Scheduling
 * só o negócio da sessão — query nenhuma escolhe tenant — e a resposta passa
 * no guard de contrato do Goal036. Sem PostgreSQL: sessão, Scheduling e IA
 * são dublês, como em `servicos-mais-usados.test.ts`.
 *
 * D-178: as mensagens de clientes fora do horário vêm da IA e são cruzadas
 * aqui com o horário de atendimento; se a IA cair, o faturamento sai igual.
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

const { registerV1RevenueRoutes } =
  await import("../src/modules/revenue/routes.js");
const { registerResponseContractCheck } =
  await import("../src/lib/response-contract.js");

const report = {
  period: "month",
  start: "2026-10-01",
  end: "2026-10-31",
  today: "2026-10-16",
  timezone: "America/Sao_Paulo",
  window: {
    from: "2026-10-01T03:00:00.000Z",
    to: "2026-10-16T18:00:00.000Z",
  },
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
  series: [
    {
      start: "2026-10-01",
      amount: 350,
      count: 3,
      expectedAmount: 0,
      aiAmount: 200,
    },
  ],
  ai: {
    billed: { amount: 200, count: 2 },
    expected: { amount: 150, count: 1 },
    share: 200 / 350,
    newCustomers: { count: 1, amount: 100, names: ["Bia"] },
    afterHours: { count: 1, amount: 100 },
    rescheduled: { count: 0, amount: 0 },
    acquired: { customers: 1, amount: 100 },
  },
};

// Seg a sex, 09:00 às 18:00.
const availability = {
  timezone: "America/Sao_Paulo",
  rules: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    id: `rule-${dayOfWeek}`,
    dayOfWeek,
    startTime: "09:00",
    endTime: "18:00",
    active: true,
  })),
};

// Terça 23h: 4 mensagens (fora). Quarta 10h: 2 (dentro). Domingo 15h: 1 (fora).
// Quarta 08h: 3 — a hora termina às 09:00, encosta no horário sem entrar: fora.
const hours = Array.from({ length: 168 }, (_, index) => {
  if (index === 2 * 24 + 23) return 4;
  if (index === 3 * 24 + 10) return 2;
  if (index === 0 * 24 + 15) return 1;
  if (index === 3 * 24 + 8) return 3;
  return 0;
});

const list = {
  kind: "cancelled",
  start: "2026-10-01",
  end: "2026-10-31",
  total: 1,
  items: [
    {
      id: "apt-1",
      date: "2026-10-12",
      time: "15:30",
      customerId: "cus-ana",
      customerName: "Ana",
      services: ["Cílios 5D"],
      amount: 150,
      bookedBy: "AI",
      changedBy: "USER",
      note: "era teste",
      unvaluedReason: null,
    },
  ],
};

let orchestratorDown = false;

let upstream: Array<{ url: URL; tenantId: string | null }> = [];
let app: FastifyInstance;

beforeEach(async () => {
  upstream = [];
  orchestratorDown = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      upstream.push({
        url: new URL(request.url),
        tenantId: request.headers.get("x-tenant-id"),
      });
      const url = new URL(request.url);
      if (url.pathname === "/internal/inbound-hours" && orchestratorDown) {
        return new Response("down", { status: 503 });
      }
      const data =
        url.pathname === "/internal/inbound-hours"
          ? { hours }
          : url.pathname === "/internal/availability-settings"
            ? availability
            : url.pathname === "/internal/revenue/appointments"
              ? list
              : report;
      return new Response(JSON.stringify({ data, requestId: "up" }), {
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
    const call = upstream.find(
      (entry) => entry.url.pathname === "/internal/revenue",
    );
    expect(call?.tenantId).toBe("tenant-session");
    expect(call?.url.searchParams.get("period")).toBe("year");
    expect(call?.url.searchParams.get("date")).toBe("2026-03-10");
    expect(call?.url.searchParams.has("tenantId")).toBe(false);
    // Toda chamada, a qualquer serviço, leva só o negócio da sessão.
    expect(upstream.map((entry) => entry.tenantId)).toEqual(
      upstream.map(() => "tenant-session"),
    );
  });

  it("conta as mensagens fora do horário pela janela do período, no fuso do negócio (D-178)", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/revenue" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.messages).toEqual({
      total: 10,
      outsideHours: 8,
    });
    expect(response.json().data.ai).toEqual(report.ai);
    const call = upstream.find(
      (entry) => entry.url.pathname === "/internal/inbound-hours",
    );
    expect(call?.url.searchParams.get("from")).toBe(report.window.from);
    expect(call?.url.searchParams.get("to")).toBe(report.window.to);
    expect(call?.url.searchParams.get("timeZone")).toBe("America/Sao_Paulo");
  });

  it("com a IA fora do ar, o faturamento sai igual e as mensagens ficam nulas", async () => {
    orchestratorDown = true;
    const response = await app.inject({ method: "GET", url: "/v1/revenue" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.messages).toBeNull();
    expect(response.json().data.billed).toEqual(report.billed);
  });

  it("sem período, pede o mês", async () => {
    await app.inject({ method: "GET", url: "/v1/revenue" });
    const call = upstream.find(
      (entry) => entry.url.pathname === "/internal/revenue",
    );
    expect(call?.url.searchParams.get("period")).toBe("month");
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

describe("GET /v1/revenue/appointments (D-179)", () => {
  it("pede a lista pelo negócio da sessão, com o tipo, e devolve o contrato", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/revenue/appointments?period=month&date=2026-10-16&kind=cancelled&tenantId=outro",
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(() =>
      revenueAppointmentListSchema.parse(response.json().data),
    ).not.toThrow();
    expect(response.json().data.items[0]).toMatchObject({
      bookedBy: "AI",
      changedBy: "USER",
    });
    const call = upstream.find(
      (entry) => entry.url.pathname === "/internal/revenue/appointments",
    );
    expect(call?.tenantId).toBe("tenant-session");
    expect(call?.url.searchParams.get("kind")).toBe("cancelled");
    expect(call?.url.searchParams.get("period")).toBe("month");
    expect(call?.url.searchParams.has("tenantId")).toBe(false);
  });

  it("recusa tipo desconhecido ou ausente sem chamar o Scheduling", async () => {
    for (const query of ["kind=all", "period=month"]) {
      const response = await app.inject({
        method: "GET",
        url: `/v1/revenue/appointments?${query}`,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(upstream).toHaveLength(0);
  });
});
