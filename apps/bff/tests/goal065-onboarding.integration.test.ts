import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * PATCH /v1/onboarding: quatro tipos de preço no service (Goal065, WU-01).
 * `priceType` ganha `STARTING_AT` e `NOT_INFORMED`, ao lado de `FIXED` e
 * `ON_REQUEST` já aceitos; a regra de price obrigatório/proibido é a mesma
 * `priceRequiresValue` de `apps/frontend/src/features/services/ServiceForm.tsx`,
 * aplicada aqui antes de chamar o Scheduling.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface StubService {
  id: string;
  name: string;
  durationMinutes: number | null;
  priceType: string;
  price: number | null;
  active: boolean;
  needsReview: boolean;
  reviewOrigin: null;
  description: null;
  colorToken: string | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  recurrenceIntervalDays: null;
}

let services: StubService[] = [];
let nextServiceSeq = 0;

function resetServiceCatalog(): void {
  services = [];
  nextServiceSeq = 0;
}

function envelope(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, requestId: "upstream" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function calendarPayload() {
  return {
    source: "ATENDLY" as const,
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
  };
}

function availabilitySettingsPayload() {
  return {
    timezone: "America/Sao_Paulo",
    rules: [],
    minLeadMinutes: 0,
    maxLeadDays: 90,
    granularityMinutes: 30,
  };
}

/**
 * Stub do Scheduling com um catálogo de serviços com estado — em memória,
 * por processo de teste — porque este arquivo precisa provar leitura depois
 * de escrita (GET reflete o que o PATCH gravou) e ordem estável entre duas
 * criações, não só que o BFF encaminhou o corpo.
 */
function stubUpstream(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);

      if (url.pathname === "/internal/calendar") {
        return envelope(calendarPayload());
      }
      if (url.pathname === "/internal/availability-settings") {
        return envelope(availabilitySettingsPayload());
      }
      if (url.pathname === "/internal/ai-tenant-config") {
        return new Response(JSON.stringify({ ok: true, config: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.pathname === "/internal/service-catalog") {
        if (request.method === "GET") return envelope(services);
        if (request.method === "POST") {
          const body = JSON.parse(await request.text()) as Record<
            string,
            unknown
          >;
          nextServiceSeq += 1;
          const service: StubService = {
            id: `svc-${nextServiceSeq}`,
            name: body.name as string,
            durationMinutes: (body.durationMinutes as number) ?? null,
            priceType: body.priceType as string,
            price: (body.price as number | null | undefined) ?? null,
            active: (body.active as boolean) ?? true,
            needsReview: false,
            reviewOrigin: null,
            description: null,
            colorToken: (body.colorToken as string | undefined) ?? null,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
            recurrenceIntervalDays: null,
          };
          services.push(service);
          return envelope(service, 201);
        }
      }
      const patchMatch = url.pathname.match(
        /^\/internal\/service-catalog\/(.+)$/,
      );
      if (patchMatch && request.method === "PATCH") {
        const id = decodeURIComponent(patchMatch[1]!);
        const existing = services.find((service) => service.id === id);
        if (!existing) {
          return new Response(
            JSON.stringify({ error: { code: "NOT_FOUND" }, requestId: "upstream" }),
            { status: 404, headers: { "content-type": "application/json" } },
          );
        }
        const body = JSON.parse(await request.text()) as Record<
          string,
          unknown
        >;
        Object.assign(existing, body);
        return envelope(existing);
      }
      return envelope(null);
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
  resetServiceCatalog();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal065/WU-01: PATCH /v1/onboarding aceita os quatro tipos de preço",
  () => {
    it("grava e relê FIXED, STARTING_AT, ON_REQUEST e NOT_INFORMED, com price nulo nos dois últimos", async () => {
      const owner = await business("goal065-price-types");
      stubUpstream();

      let serviceId: string | undefined;
      const cases: Array<
        [priceType: string, price: number | undefined, expectedPrice: number | null]
      > = [
        ["FIXED", 150, 150],
        ["STARTING_AT", 80, 80],
        ["ON_REQUEST", undefined, null],
        ["NOT_INFORMED", undefined, null],
      ];

      for (const [priceType, price, expectedPrice] of cases) {
        const payload: Record<string, unknown> = {
          name: "Corte",
          durationMinutes: 30,
          priceType,
          active: true,
        };
        if (price !== undefined) payload.price = price;
        if (serviceId) payload.id = serviceId;

        const patch = await app.inject({
          method: "PATCH",
          url: "/v1/onboarding",
          headers: browserMutation(owner),
          payload: { service: payload },
        });
        expect(patch.statusCode).toBe(200);
        expect(patch.json().data.service.priceType).toBe(priceType);
        expect(patch.json().data.service.price).toBe(expectedPrice);
        serviceId = patch.json().data.service.id;

        const read = await app.inject({
          method: "GET",
          url: "/v1/onboarding",
          headers: browserRead(owner),
        });
        expect(read.json().data.service.priceType).toBe(priceType);
        expect(read.json().data.service.price).toBe(expectedPrice);
      }
    });

    it("STARTING_AT sem price responde 400 VALIDATION_ERROR com o campo, sem gravar", async () => {
      const owner = await business("goal065-starting-at-no-price");
      stubUpstream();

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: {
          service: {
            name: "Corte",
            durationMinutes: 30,
            priceType: "STARTING_AT",
            active: true,
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      const fieldErrors = response.json().error.details.fieldErrors as Record<
        string,
        string[]
      >;
      expect(fieldErrors.service?.join(" ")).toContain("price");
      expect(services).toHaveLength(0);
    });

    it("FIXED com price negativo responde 400 VALIDATION_ERROR com o campo, sem gravar", async () => {
      const owner = await business("goal065-fixed-negative-price");
      stubUpstream();

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: {
          service: {
            name: "Corte",
            durationMinutes: 30,
            priceType: "FIXED",
            price: -10,
            active: true,
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(services).toHaveLength(0);
    });

    it("depois de criar dois serviços por POST /v1/services, GET /v1/onboarding devolve sempre o mesmo service.id", async () => {
      const owner = await business("goal065-stable-service-id");
      stubUpstream();

      const first = await app.inject({
        method: "POST",
        url: "/v1/services",
        headers: browserMutation(owner),
        payload: {
          name: "Primeiro serviço",
          durationMinutes: 30,
          priceType: "FIXED",
          price: 50,
          active: true,
          colorToken: "ROSE",
        },
      });
      expect(first.statusCode).toBe(201);
      const firstId = first.json().data.id as string;

      const second = await app.inject({
        method: "POST",
        url: "/v1/services",
        headers: browserMutation(owner),
        payload: {
          name: "Segundo serviço",
          durationMinutes: 45,
          priceType: "STARTING_AT",
          price: 70,
          active: true,
          colorToken: "SKY",
        },
      });
      expect(second.statusCode).toBe(201);

      const readA = await app.inject({
        method: "GET",
        url: "/v1/onboarding",
        headers: browserRead(owner),
      });
      const readB = await app.inject({
        method: "GET",
        url: "/v1/onboarding",
        headers: browserRead(owner),
      });
      expect(readA.json().data.service.id).toBe(firstId);
      expect(readB.json().data.service.id).toBe(firstId);
    });
  },
);

/**
 * Decisão de 2026-10-12: criação manual pela API pública exige a cor; o
 * onboarding cria sem perguntar e o Scheduling sorteia a cor da paleta.
 */
describe.skipIf(!RUN_INTEGRATION)(
  "Cor do serviço: obrigatória em POST /v1/services, sorteada no onboarding",
  () => {
    it("POST /v1/services sem cor responde 400 VALIDATION_ERROR, sem chamar o Scheduling", async () => {
      const owner = await business("color-required-post");
      stubUpstream();

      const response = await app.inject({
        method: "POST",
        url: "/v1/services",
        headers: browserMutation(owner),
        payload: {
          name: "Corte",
          durationMinutes: 30,
          priceType: "FIXED",
          price: 50,
          active: true,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(services).toHaveLength(0);
    });

    it("PATCH /v1/onboarding cria o serviço sem cor no corpo: o Scheduling decide", async () => {
      const owner = await business("color-onboarding");
      stubUpstream();

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: {
          service: {
            name: "Barba",
            durationMinutes: 30,
            priceType: "FIXED",
            price: 40,
            active: true,
            colorToken: "ROSE",
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(services).toHaveLength(1);
      // O corpo do onboarding não carrega cor: nem a que o cliente mandou.
      expect(services[0]?.colorToken).toBeNull();
    });
  },
);
