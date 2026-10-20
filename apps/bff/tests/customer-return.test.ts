import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  customerReturnStatusSchema,
  findPublicApiRoute,
  returnCampaignDetailSchema,
  returnCandidateListSchema,
  returnMessageIssue,
  returnOverviewSchema,
  returnSettingsSchema,
} from "@avenly-ia/public-api-contract";

/**
 * D-206 — retorno de clientes no BFF. Sem PostgreSQL e sem sessão real: o
 * tenant é dublê de módulo, e o Scheduling e a IA são um `fetch` dublê (como
 * em `ai-sandbox-settings.test.ts`). Prova: as rotas estão no contrato; a
 * lista sai sem contato ignorado nem conversa pessoal, com as contagens e só
 * os campos declarados; a IA fora do ar não esconde a lista; a aprovação
 * nunca leva quem a IA exclui; texto-base inválido é recusado antes do
 * Scheduling; e o bloqueio da cliente passa pela rota humana.
 */

const ROOT = "root-internal-secret-with-32-chars-min-202";
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

const { registerV1CustomerReturnRoutes } =
  await import("../src/modules/customer-return/routes.js");
const { registerResponseContractCheck } =
  await import("../src/lib/response-contract.js");
const { AppError } = await import("../src/lib/errors.js");

interface UpstreamCall {
  method: string;
  path: string;
  search: string;
  body: Record<string, unknown> | null;
}

const upstream: UpstreamCall[] = [];
let aiDown = false;

function candidate(id: string, phone: string) {
  return {
    customerId: id,
    name: `Cliente ${id}`,
    phone,
    serviceId: "svc-1",
    serviceName: "Manutenção 5D",
    expectedDate: "2026-10-22",
    intervalDays: 15,
    intervalSource: "SERVICE",
    lastVisitDate: "2026-10-07",
    daysSinceLastVisit: 12,
    sendBy: "2026-10-20",
    habit: {
      weekdays: [5, 6],
      bandStart: "16:00",
      bandEnd: "19:00",
      usedWeekdays: [2, 5, 6],
      visits: 5,
    },
  };
}

const campaignDetail = {
  id: "campaign-1",
  kind: "RENEWAL",
  state: "ACTIVE",
  dailyLimit: 10,
  incentive: null,
  weekStart: "2026-10-19",
  winbackDays: null,
  createdAt: "2026-10-18T12:00:00.000Z",
  pausedAt: null,
  cancelledAt: null,
  completedAt: null,
  counts: {
    total: 1,
    queued: 1,
    sent: 0,
    replied: 0,
    booked: 0,
    declined: 0,
    skipped: 0,
    failed: 0,
    awaiting: 0,
    noReply: 0,
    revenue: 0,
    expectedRevenue: 0,
  },
  messageTemplate: null,
  targets: [],
};

const overview = {
  timezone: "America/Sao_Paulo",
  today: "2026-10-20",
  campaigns: { total: 2, live: 1 },
  totals: {
    total: 12,
    queued: 4,
    sent: 8,
    replied: 4,
    booked: 3,
    declined: 1,
    skipped: 0,
    failed: 0,
    awaiting: 2,
    noReply: 2,
    revenue: 240,
    expectedRevenue: 120,
  },
  customersBack: 3,
  upcoming: {
    days: [
      { date: "2026-10-20", count: 2 },
      { date: "2026-10-21", count: 2 },
    ],
    next: [
      {
        targetId: "target-1",
        campaignId: "campaign-1",
        customerId: "customer-1",
        customerName: "Ana",
        kind: "RENEWAL",
        serviceName: "Manutenção 5D",
        plannedDate: "2026-10-20",
        position: 3,
      },
    ],
    later: 0,
    paused: 0,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const text = request.method === "GET" ? null : await request.text();
      const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      upstream.push({
        method: request.method,
        path: url.pathname,
        search: url.search,
        body,
      });
      if (url.pathname === "/internal/customer-return/candidates") {
        return jsonResponse({
          data: {
            kind: "RENEWAL",
            timezone: "America/Sao_Paulo",
            today: "2026-10-18",
            weekStart: "2026-10-19",
            weekEnd: "2026-10-25",
            days: null,
            candidates: [
              candidate("ok", "+55 11 97777-0000"),
              candidate("ignored", "+55 55 99693-6463"),
              candidate("personal", "+55 11 98888-0000"),
            ],
            excluded: {
              deactivated: 2,
              noPhone: 1,
              futureAppointment: 0,
              blocked: 0,
              recentlyContacted: 0,
              queued: 0,
            },
          },
          requestId: "up",
        });
      }
      if (url.pathname === "/internal/contacts/return-eligibility") {
        if (aiDown) return jsonResponse({ ok: false }, 503);
        return jsonResponse({
          data: {
            excluded: [
              { phone: "+55 55 99693-6463", reason: "IGNORED" },
              { phone: "+55 11 98888-0000", reason: "PERSONAL" },
            ],
          },
          requestId: "up",
        });
      }
      if (url.pathname === "/internal/customer-return/overview") {
        return jsonResponse({ data: overview, requestId: "up" });
      }
      if (url.pathname === "/internal/customer-return/campaigns") {
        return jsonResponse({ data: campaignDetail, requestId: "up" }, 201);
      }
      if (url.pathname === "/internal/customer-return/settings") {
        return jsonResponse({
          data: {
            configured: true,
            dailyLimit: 12,
            windowDays: [1, 2, 3, 4, 5, 6],
            windowStart: "09:00",
            windowEnd: "19:00",
            leadDays: 2,
            winbackDays: 60,
            winbackIncentive: null,
            renewalMessage: null,
            winbackMessage: null,
          },
          requestId: "up",
        });
      }
      if (url.pathname === "/internal/customers/customer-1/return-status") {
        return jsonResponse({
          data: {
            customerId: "customer-1",
            blocked: false,
            permanent: false,
            blockedUntil: null,
            reason: null,
            lastMessageAt: null,
          },
          requestId: "up",
        });
      }
      return jsonResponse({ error: "unexpected" }, 404);
    }),
  );
}

let app: FastifyInstance;

beforeEach(async () => {
  upstream.length = 0;
  aiDown = false;
  stubUpstream();
  app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
        requestId: request.id,
      });
    }
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR" } });
  });
  registerResponseContractCheck(app);
  await registerV1CustomerReturnRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("D-206: contrato do retorno de clientes", () => {
  it("as rotas estão no contrato com os schemas do retorno", () => {
    expect(
      findPublicApiRoute("GET", "/v1/customer-return/settings")?.schema,
    ).toBe(returnSettingsSchema);
    expect(
      findPublicApiRoute("GET", "/v1/customer-return/candidates")?.schema,
    ).toBe(returnCandidateListSchema);
    expect(
      findPublicApiRoute("POST", "/v1/customer-return/campaigns")?.schema,
    ).toBe(returnCampaignDetailSchema);
    expect(
      findPublicApiRoute("PUT", "/v1/customers/:id/return-messages")?.schema,
    ).toBe(customerReturnStatusSchema);
    expect(
      findPublicApiRoute("GET", "/v1/customer-return/overview")?.schema,
    ).toBe(returnOverviewSchema);
  });

  it("texto-base: campo desconhecido, data e horário escritos à mão são recusados", () => {
    expect(
      returnMessageIssue("Oi {nome}, {servico} {quando} {horarios}"),
    ).toBeNull();
    expect(returnMessageIssue("Oi {apelido}")).toEqual({
      id: "UNKNOWN_FIELD",
      field: "apelido",
    });
    expect(returnMessageIssue("Tenho sexta 17h30")).toEqual({
      id: "WRITTEN_TIME",
    });
    expect(returnMessageIssue("Dia 24/10")).toEqual({ id: "WRITTEN_DATE" });
  });
});

describe("D-206: lista pré-selecionada", () => {
  it("tira contato ignorado e conversa pessoal, conta os dois e só devolve campos declarados", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/customer-return/candidates?kind=RENEWAL&week=this",
    });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(
      data.candidates.map((c: { customerId: string }) => c.customerId),
    ).toEqual(["ok"]);
    expect(data.candidates[0]).not.toHaveProperty("serviceId");
    expect(data.candidates[0].habit).toEqual({
      weekdays: [5, 6],
      bandStart: "16:00",
      bandEnd: "19:00",
    });
    expect(data.excluded).toMatchObject({
      deactivated: 2,
      noPhone: 1,
      ignored: 1,
      personal: 1,
    });
    const scheduling = upstream.find(
      (call) => call.path === "/internal/customer-return/candidates",
    );
    expect(scheduling?.search).toBe("?kind=RENEWAL&week=this");
    const eligibility = upstream.find(
      (call) => call.path === "/internal/contacts/return-eligibility",
    );
    // Os telefones vão no corpo, nunca na URL.
    expect(eligibility?.method).toBe("POST");
    expect(eligibility?.body).toEqual({
      phones: ["+55 11 97777-0000", "+55 55 99693-6463", "+55 11 98888-0000"],
    });
  });

  it("IA fora do ar não esconde a lista", async () => {
    aiDown = true;
    const response = await app.inject({
      method: "GET",
      url: "/v1/customer-return/candidates?kind=RENEWAL",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.candidates).toHaveLength(3);
  });
});

describe("D-206: aprovação e configuração", () => {
  it("a rodada nunca leva quem a IA exclui", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/customer-return/campaigns",
      payload: {
        kind: "RENEWAL",
        week: "this",
        customerIds: ["ok", "ignored", "personal"],
      },
    });
    expect(response.statusCode).toBe(201);
    const create = upstream.find(
      (call) =>
        call.method === "POST" &&
        call.path === "/internal/customer-return/campaigns",
    );
    expect(create?.body).toMatchObject({ customerIds: ["ok"] });
  });

  it("texto-base inválido é recusado sem chamar o Scheduling", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/customer-return/settings",
      payload: { renewalMessage: "Oi {apelido}" },
    });
    expect(response.statusCode).toBe(400);
    expect(upstream).toHaveLength(0);
  });

  it("limite diário acima de 30 é recusado", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/customer-return/settings",
      payload: { dailyLimit: 31 },
    });
    expect(response.statusCode).toBe(400);
  });

  it("configuração válida passa ao Scheduling e volta pelo contrato", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/customer-return/settings",
      payload: { dailyLimit: 12, winbackIncentive: "  hidratação de brinde  " },
    });
    expect(response.statusCode).toBe(200);
    expect(upstream[0].body).toEqual({
      dailyLimit: 12,
      winbackIncentive: "hidratação de brinde",
    });
  });

  it("liberar a cliente passa pela rota do Scheduling", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/v1/customers/customer-1/return-messages",
      payload: { blocked: false },
    });
    expect(response.statusCode).toBe(200);
    expect(upstream[0]).toMatchObject({
      method: "PUT",
      path: "/internal/customers/customer-1/return-status",
      body: { blocked: false },
    });
  });
});

describe("D-210: visão geral do retorno", () => {
  it("devolve a situação, o valor e a fila pelo contrato, sem campo a mais", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/customer-return/overview",
    });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(returnOverviewSchema.parse(data)).toBeTruthy();
    expect(data.totals).toMatchObject({ booked: 3, noReply: 2, awaiting: 2 });
    expect(data.upcoming.next[0]).not.toHaveProperty("position");
    expect(upstream[0]).toMatchObject({
      method: "GET",
      path: "/internal/customer-return/overview",
    });
  });
});
