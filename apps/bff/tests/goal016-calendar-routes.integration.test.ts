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
 * Rotas públicas do Goal016 — contra sessão real.
 *
 * O que é do BFF, e só aqui pode ser provado: a leitura de blocos resolve o
 * tenant pela sessão (nunca por query) e recusa janela ausente antes de
 * chamar o Scheduling; a indisponibilidade grava `decidedBy` a partir da
 * sessão autenticada, mesmo quando o corpo tenta impersonar outro ator. A
 * regra de negócio em si — escopo, forma do bloco, ambos-ou-nenhum de
 * decisão — é provada nas suítes do Scheduling; aqui o Scheduling é um
 * dobro HTTP.
 *
 * Sem banco descartável declarado (`BFF_RUN_INTEGRATION_TESTS`), a suíte é
 * pulada de forma declarada, como as demais suítes de integração do BFF.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  url: string;
  tenantId: string | null;
  body: string | null;
}

const upstream: UpstreamCall[] = [];

function stubScheduling(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      upstream.push({
        method: request.method,
        url: request.url,
        tenantId: request.headers.get("x-tenant-id"),
        body:
          request.method === "GET" || request.method === "DELETE"
            ? null
            : await request.text(),
      });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function timeBlockPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "block-1",
    startAt: "2026-09-10T12:00:00.000Z",
    endAt: "2026-09-10T13:00:00.000Z",
    reason: "almoço",
    kind: "BLOCK",
    title: null,
    seriesId: null,
    ...overrides,
  };
}

function exceptionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "exception-1",
    date: "2026-09-10",
    startTime: null,
    endTime: null,
    available: false,
    reason: "emergência médica",
    decidedBy: null,
    decidedReason: null,
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

describe.skipIf(!RUN_INTEGRATION)("Goal016: leitura de blocos e decisão humana", () => {
  it("lista blocos sempre no negócio da sessão, ignorando tenantId da query", async () => {
    const owner = await registerBusiness(app, "goal016-a");
    const other = await registerBusiness(app, "goal016-b");
    created.push(owner, other);
    stubScheduling({ data: [timeBlockPayload()], requestId: "upstream-list" });

    const response = await app.inject({
      method: "GET",
      url: `/v1/time-blocks?startDate=2026-09-01&endDate=2026-09-30&tenantId=${other.tenantId}`,
      headers: { ...browserRead(owner), "x-tenant-id": other.tenantId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject([{ id: "block-1" }]);
    expect(upstream).toHaveLength(1);
    expect(upstream[0].tenantId).toBe(owner.tenantId);
    expect(upstream[0].tenantId).not.toBe(other.tenantId);
    const url = new URL(upstream[0].url);
    expect(url.searchParams.get("startDate")).toBe("2026-09-01");
    expect(url.searchParams.get("endDate")).toBe("2026-09-30");
  });

  it("recusa a listagem de blocos sem a janela, sem chamar o Scheduling", async () => {
    const owner = created[0]!;
    stubScheduling({ data: [timeBlockPayload()], requestId: "upstream-list" });

    const missingBoth = await app.inject({
      method: "GET",
      url: "/v1/time-blocks",
      headers: browserRead(owner),
    });
    expect(missingBoth.statusCode).toBe(400);
    expect(missingBoth.json().error.code).toBe("VALIDATION_ERROR");

    const missingEnd = await app.inject({
      method: "GET",
      url: "/v1/time-blocks?startDate=2026-09-01",
      headers: browserRead(owner),
    });
    expect(missingEnd.statusCode).toBe(400);
    expect(missingEnd.json().error.code).toBe("VALIDATION_ERROR");

    expect(upstream).toHaveLength(0);
  });

  it("grava decidedBy a partir da sessão, ignorando o valor enviado no corpo", async () => {
    const owner = created[0]!;
    stubScheduling(
      {
        data: exceptionPayload({
          decidedBy: owner.userId,
          decidedReason: "emergência médica",
        }),
        requestId: "upstream-decision",
      },
      201,
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/availability-exceptions/unavailable",
      headers: browserMutation(owner),
      payload: {
        date: "2026-09-10",
        reason: "emergência médica",
        // Tentativa de impersonar outro ator: deve ser ignorada.
        decidedBy: "someone-else",
        decidedReason: "emergência médica",
      },
    });

    expect(response.statusCode).toBe(201);
    const forwarded = JSON.parse(upstream[0].body ?? "{}");
    expect(forwarded.decidedBy).toBe(owner.userId);
    expect(forwarded.decidedBy).not.toBe("someone-else");
    expect(forwarded.decidedReason).toBe("emergência médica");
  });

  it("não envia decidedBy ao Scheduling quando o corpo não traz decidedReason", async () => {
    const owner = created[0]!;
    stubScheduling(
      { data: exceptionPayload({ decidedBy: null, decidedReason: null }), requestId: "upstream-no-decision" },
      201,
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/availability-exceptions/unavailable",
      headers: browserMutation(owner),
      payload: {
        date: "2026-09-10",
        reason: "viagem",
        // Sem decidedReason: mesmo que um cliente antigo mande decidedBy,
        // ele não vira decisão humana sozinho.
        decidedBy: "someone-else",
      },
    });

    expect(response.statusCode).toBe(201);
    const forwarded = JSON.parse(upstream[0].body ?? "{}");
    expect(forwarded.decidedBy).toBeUndefined();
    expect(forwarded.decidedReason).toBeUndefined();
  });
});
