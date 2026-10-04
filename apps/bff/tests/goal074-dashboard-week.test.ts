import Fastify, { type FastifyRequest } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dashboardSchema } from "@avenly-ia/public-api-contract";

/**
 * Goal074/WU-03 §7.4 — `GET /v1/dashboard` acrescenta `aiAppointmentsThisWeek`
 * e `conversationsTakenOverThisWeek` em `ai.data`, e `appointmentsThisWeek` em
 * `scheduling.data`. Prova, sem PostgreSQL e sem sessão real: os clientes do
 * BFF decodificam os três campos que o orquestrador e o Scheduling já
 * devolvem (WU-01/WU-02), a rota os repassa sem alteração e a resposta
 * inteira continua validando contra `dashboardSchema`.
 *
 * Tenant, prisma, reconciliação e vínculo de WhatsApp são dublês de módulo,
 * como em `goal025-ai-activation-deletion-guard.test.ts`: nada aqui depende
 * de sessão autenticada ou de linha gravada — só o contrato entre o BFF e as
 * duas rotas internas de dashboard.
 */

const ROOT = "root-internal-secret-with-32-chars-min-074";
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

vi.mock("../src/lib/prisma.js", () => ({
  getPrisma: () => ({
    tenant: {
      findUnique: async () => ({ id: "tenant-1", name: "Negócio Goal074" }),
    },
    businessProfile: {
      findUnique: async () => ({
        tenantId: "tenant-1",
        timezone: "America/Sao_Paulo",
        onboardingCompletedAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
    },
  }),
}));

vi.mock("../src/lib/ai-activation.js", () => ({
  reconcileAiActivation: async () => "NOOP",
  activationTestCompleted: async () => false,
}));

vi.mock("../src/modules/whatsapp/instance-link.js", () => ({
  findLinkedInstance: async () => null,
}));

const { registerV1DashboardRoutes } = await import(
  "../src/modules/dashboard/routes.js"
);

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function stubUpstream(options: {
  aiAppointmentsThisWeek: number;
  conversationsTakenOverThisWeek: number;
  appointmentsThisWeek: number;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);

      // Bases distintas por porta (3000 = IA, 3003 = Scheduling), como o
      // dublê de goal019-ai-activation-reconciliation.integration.test.ts.
      if (url.port === "3000" && url.pathname === "/internal/dashboard") {
        return jsonResponse({
          data: {
            conversationsNeedingAttention: [],
            conversationsNeedingAttentionCount: 0,
            aiAppointmentsToday: 2,
            aiAppointmentsThisWeek: options.aiAppointmentsThisWeek,
            automatedConversationsToday: 3,
            conversationsTakenOverThisWeek:
              options.conversationsTakenOverThisWeek,
          },
          requestId: "up-ai-dashboard",
        });
      }
      if (url.port === "3003" && url.pathname === "/internal/dashboard") {
        return jsonResponse({
          data: {
            appointmentsToday: 1,
            todayAppointments: [],
            appointmentsThisWeek: options.appointmentsThisWeek,
            nextAppointment: null,
            estimatedRevenueToday: null,
            calendar: {
              source: null,
              timezone: null,
              integration: null,
              capabilities: {
                manageAvailability: false,
                manageServices: false,
                manageCustomers: false,
                createAppointments: false,
                migrate: false,
                aiActivationReady: false,
              },
            },
          },
          requestId: "up-scheduling-dashboard",
        });
      }
      throw new Error(
        `Unexpected upstream call: ${request.method} ${url.toString()}`,
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Goal074/WU-03 §7.4: GET /v1/dashboard ganha os três contadores da semana", () => {
  it("devolve aiAppointmentsThisWeek, conversationsTakenOverThisWeek e appointmentsThisWeek, e a resposta passa em dashboardSchema", async () => {
    stubUpstream({
      aiAppointmentsThisWeek: 5,
      conversationsTakenOverThisWeek: 4,
      appointmentsThisWeek: 7,
    });
    const app = Fastify({ logger: false });
    await registerV1DashboardRoutes(app);
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/v1/dashboard" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.ai.status).toBe("ok");
    expect(body.data.ai.data.aiAppointmentsThisWeek).toBe(5);
    expect(body.data.ai.data.conversationsTakenOverThisWeek).toBe(4);
    expect(body.data.scheduling.status).toBe("ok");
    expect(body.data.scheduling.data.appointmentsThisWeek).toBe(7);
    // Passa em dashboardSchema (packages/public-api-contract): nenhum campo
    // existente perdeu forma, e os três novos são aceitos.
    expect(() => dashboardSchema.parse(body.data)).not.toThrow();

    await app.close();
  });
});
