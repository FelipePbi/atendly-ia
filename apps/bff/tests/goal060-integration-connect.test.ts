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
 * Goal060/WU-03 — `POST /v1/calendar/integration/connect` com o corpo
 * público novo (§2, §4), contra sessão real.
 *
 * O que só o BFF prova aqui: o corpo passa a ser `{ email, password }`
 * estrito, o corpo antigo (`credentials`/`configuration`) é recusado com
 * `VALIDATION_ERROR` antes de qualquer chamada ao Scheduling, e as duas
 * classes de erro do Scheduling (`MINHA_AGENDA_AUTH_FAILED` 422,
 * `MINHA_AGENDA_NOT_CONFIGURED` 503) chegam sem tradução, como
 * `UPSTREAM_ERROR` com `details.upstreamCode` e o mesmo status da origem. A
 * regra de negócio da conexão em si — endereço do sistema, descoberta do
 * profissional, classes de erro — é provada na suíte do Scheduling; aqui o
 * Scheduling é um dobro HTTP.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  body: string | null;
}

const upstream: UpstreamCall[] = [];

function stubScheduling(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      upstream.push({
        method: request.method,
        path: url.pathname,
        body: request.method === "GET" ? null : await request.text(),
      });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function calendarPayload(overrides: Record<string, unknown> = {}) {
  return {
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
    integration: {
      status: "CONNECTED",
      lastSuccessfulSyncAt: "2026-09-27T12:00:00.000Z",
      lastErrorAt: null,
      lastErrorCode: null,
    },
    capabilities: {
      manageAvailability: true,
      manageServices: true,
      manageCustomers: true,
      createAppointments: true,
      migrate: true,
      aiActivationReady: false,
    },
    ...overrides,
  };
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

describe.skipIf(!RUN_INTEGRATION)(
  "Goal060/WU-03: POST /v1/calendar/integration/connect",
  () => {
    it("aceita { email, password } e a resposta de sucesso passa no schema do contrato", async () => {
      const owner = await registerBusiness(app, "goal060-connect-ok");
      created.push(owner);
      stubScheduling({
        data: calendarPayload(),
        requestId: "upstream-connect-ok",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/integration/connect",
        headers: browserMutation(owner),
        payload: { email: "dono@example.invalid", password: "s3nha-forte" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        source: "AVENLY",
        capabilities: { manageAvailability: true },
      });
      expect(upstream).toHaveLength(1);
      expect(upstream[0]!.path).toBe("/internal/calendar/integration/connect");
      expect(JSON.parse(upstream[0]!.body!)).toEqual({
        email: "dono@example.invalid",
        password: "s3nha-forte",
      });
    });

    it("recusa o corpo antigo (credentials/configuration) com VALIDATION_ERROR, sem chamar o Scheduling", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: calendarPayload(),
        requestId: "upstream-connect-old-body",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/integration/connect",
        headers: browserMutation(owner),
        payload: {
          credentials: {
            basicAuth: "Basic dGVzdDp0ZXN0",
            username: "dono@example.invalid",
            password: "s3nha-forte",
          },
          configuration: {
            baseUrl: "https://portal.minhaagenda.example.invalid",
            employeeId: 1,
            paymentMethod: "PIX",
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(upstream).toHaveLength(0);
    });

    it("recusa corpo sem email/password com VALIDATION_ERROR, sem chamar o Scheduling", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: calendarPayload(),
        requestId: "upstream-connect-missing-fields",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/integration/connect",
        headers: browserMutation(owner),
        payload: { email: "dono@example.invalid" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(upstream).toHaveLength(0);
    });

    it("MINHA_AGENDA_AUTH_FAILED chega como UPSTREAM_ERROR 422 com o upstreamCode", async () => {
      const owner = created[0]!;
      stubScheduling(
        {
          error: {
            code: "MINHA_AGENDA_AUTH_FAILED",
            message:
              "Minha Agenda authentication failed: invalid credentials.",
            details: { originStatus: 401 },
          },
          requestId: "upstream-auth-failed",
        },
        422,
      );

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/integration/connect",
        headers: browserMutation(owner),
        payload: { email: "dono@example.invalid", password: "senha-errada" },
      });

      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body.error).toMatchObject({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode: "MINHA_AGENDA_AUTH_FAILED" },
      });
      // Sem senha, e-mail nem cabeçalho de credencial no corpo do erro.
      expect(JSON.stringify(body)).not.toMatch(
        /senha-errada|basicAuth|authorization/i,
      );
    });

    it("MINHA_AGENDA_NOT_CONFIGURED chega como UPSTREAM_ERROR com o mesmo status 503, não 502", async () => {
      const owner = created[0]!;
      stubScheduling(
        {
          error: {
            code: "MINHA_AGENDA_NOT_CONFIGURED",
            message: "The Minha Agenda origin is not configured on this environment.",
          },
          requestId: "upstream-not-configured",
        },
        503,
      );

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/integration/connect",
        headers: browserMutation(owner),
        payload: { email: "dono@example.invalid", password: "s3nha-forte" },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error).toMatchObject({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode: "MINHA_AGENDA_NOT_CONFIGURED" },
      });
    });

    it("recusa por CSRF antes de chamar o Scheduling", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: calendarPayload(),
        requestId: "upstream-connect-csrf",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/integration/connect",
        headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
        payload: { email: "dono@example.invalid", password: "s3nha-forte" },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
      expect(upstream).toHaveLength(0);
    });
  },
);
