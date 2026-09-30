import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  assertDisposableTarget,
  browserMutation,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal081/WU-01 — a sequência de gravação que o onboarding passa a mandar com
 * Local próprio, contra persistência real: `segmento-e-nome` grava nome,
 * segmento e fuso; a etapa `modalidade` não grava; `endereco` grava endereço e
 * modalidades juntos. O contrato de PATCH /v1/onboarding não muda: este teste
 * é guarda, passa também na baseline.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(new Request(input as RequestInfo, init).url);
      if (url.pathname === "/internal/calendar") {
        return new Response(
          JSON.stringify({
            data: {
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
            requestId: "upstream-calendar",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/ai-tenant-config") {
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

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal081/WU-01: Local próprio gravado junto com o endereço",
  () => {
    it("segmento-e-nome e endereco em PATCH /v1/onboarding dão 200 e o GET traz ON_SITE e o endereço", async () => {
      const owner = await registerBusiness(app, "g081-local-proprio");
      created.push(owner);
      stubUpstream();

      const segmentAndName = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: {
          business: {
            category: "Cabelo",
            name: "Studio Aurora",
            timezone: "America/Sao_Paulo",
          },
        },
      });
      expect(segmentAndName.statusCode).toBe(200);
      expect(segmentAndName.json().data.business.modalities).toEqual([]);
      expect(segmentAndName.json().data.business.address).toBeNull();

      const address = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: {
          business: {
            address: "Rua das Flores, 100",
            category: "Cabelo",
            modalities: ["ON_SITE"],
            name: "Studio Aurora",
            timezone: "America/Sao_Paulo",
          },
        },
      });
      expect(address.statusCode).toBe(200);

      const get = await app.inject({
        method: "GET",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
      });
      expect(get.statusCode).toBe(200);
      expect(get.json().data.business.modalities).toEqual(["ON_SITE"]);
      expect(get.json().data.business.address).toBe("Rua das Flores, 100");
    });
  },
);
