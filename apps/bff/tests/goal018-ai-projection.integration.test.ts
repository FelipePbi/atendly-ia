import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  assertDisposableTarget,
  browserMutation,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Estado projetado/pendente do contexto de negocio para a IA (Goal018,
 * WU-03) — falha de projecao nunca vira erro da requisicao: o negocio ja foi
 * gravado antes da chamada, a resposta continua 200 com PENDING como aviso
 * explicito, e o estado so volta a PROJECTED depois de uma chamada
 * subsequente bem-sucedida, nunca por retentativa automatica.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

function calendarPayload(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

let aiTenantConfigShouldFail = false;

function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);

      if (url.pathname === "/internal/calendar") {
        return new Response(
          JSON.stringify({ data: calendarPayload(), requestId: "upstream-calendar" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/ai-tenant-config") {
        if (aiTenantConfigShouldFail) {
          return new Response(
            JSON.stringify({
              error: {
                code: "UPSTREAM_UNAVAILABLE",
                message: "AI orchestrator is unavailable.",
              },
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ ok: true, config: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: null, requestId: "upstream" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
  aiTenantConfigShouldFail = false;
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal018/WU-03: estado de projeção do contexto de negócio para a IA",
  () => {
    it("projeção bem-sucedida em PATCH /v1/settings/business deixa o estado PROJECTED", async () => {
      const owner = await business("projection-settings-success");
      stubUpstream();

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/settings/business",
        headers: browserMutation(owner),
        payload: {
          name: "Studio Projetado",
          category: "Beleza",
          timezone: "America/Sao_Paulo",
        },
      });
      expect(response.statusCode).toBe(200);
      const { business: businessDto } = response.json().data;
      expect(businessDto.contextProjectionStatus).toBe("PROJECTED");
      expect(businessDto.contextProjectedVersion).toBe(businessDto.contextVersion);
    });

    it("projeção que falha grava o negócio, responde 200 com PENDING, e nunca vira 500", async () => {
      const owner = await business("projection-settings-failure");
      aiTenantConfigShouldFail = true;
      stubUpstream();

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/settings/business",
        headers: browserMutation(owner),
        payload: {
          name: "Studio Pendente",
          category: "Beleza",
          timezone: "America/Sao_Paulo",
        },
      });
      expect(response.statusCode).toBe(200);
      const { business: businessDto } = response.json().data;
      expect(businessDto.name).toBe("Studio Pendente");
      expect(businessDto.contextProjectionStatus).toBe("PENDING");
      expect(businessDto.contextProjectedVersion).not.toBe(businessDto.contextVersion);

      const row = await getPrisma().businessProfile.findUniqueOrThrow({
        where: { tenantId: owner.tenantId },
      });
      expect(row.businessName).toBe("Studio Pendente");
    });

    it("estado PENDING não muda sozinho, e uma projeção subsequente bem-sucedida vira PROJECTED", async () => {
      const owner = await business("projection-settings-recovers");
      aiTenantConfigShouldFail = true;
      stubUpstream();

      const failing = await app.inject({
        method: "PATCH",
        url: "/v1/settings/business",
        headers: browserMutation(owner),
        payload: {
          name: "Studio Recupera",
          category: "Beleza",
          timezone: "America/Sao_Paulo",
        },
      });
      expect(failing.statusCode).toBe(200);
      expect(failing.json().data.business.contextProjectionStatus).toBe("PENDING");

      // Sem nenhuma nova gravação, o estado continua PENDING: nenhuma
      // retentativa automática acontece só por ler o estado de novo.
      const stillPending = await app.inject({
        method: "GET",
        url: "/v1/settings",
        headers: browserMutation(owner),
      });
      expect(stillPending.statusCode).toBe(200);
      expect(stillPending.json().data.business.contextProjectionStatus).toBe(
        "PENDING",
      );

      aiTenantConfigShouldFail = false;
      stubUpstream();
      const recovered = await app.inject({
        method: "PATCH",
        url: "/v1/settings/ai",
        headers: browserMutation(owner),
        payload: { enabled: false, tone: "BALANCED" },
      });
      expect(recovered.statusCode).toBe(200);
      expect(recovered.json().data.business.contextProjectionStatus).toBe(
        "PROJECTED",
      );
    });

    it("PATCH /v1/onboarding com seção ai grava PENDING quando a projeção falha e PROJECTED quando recupera", async () => {
      const owner = await business("projection-onboarding");
      stubUpstream();

      const patchBusiness = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: {
          business: {
            name: "Studio Onboarding",
            category: "Beleza",
            timezone: "America/Sao_Paulo",
          },
        },
      });
      expect(patchBusiness.statusCode).toBe(200);

      aiTenantConfigShouldFail = true;
      stubUpstream();
      const failingAi = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: { ai: { tone: "BALANCED" } },
      });
      expect(failingAi.statusCode).toBe(200);
      expect(failingAi.json().data.business.contextProjectionStatus).toBe(
        "PENDING",
      );

      aiTenantConfigShouldFail = false;
      stubUpstream();
      const recoveredAi = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: { ai: { tone: "BALANCED" } },
      });
      expect(recoveredAi.statusCode).toBe(200);
      expect(recoveredAi.json().data.business.contextProjectionStatus).toBe(
        "PROJECTED",
      );
    });
  },
);
