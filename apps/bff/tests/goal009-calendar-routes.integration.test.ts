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
 * Rotas públicas do Goal009 — contra sessão real.
 *
 * O que é do BFF, e só aqui pode ser provado: o negócio sai da sessão
 * autenticada (header, body e query não escolhem tenant), toda mutação por
 * cookie exige CSRF antes de o Scheduling ser chamado, e a decisão humana de
 * conflito (pular ocorrências, forçar sobreposição com motivo, indisponibilidade
 * sobre atendimento confirmado) atravessa intacta até o serviço. A regra em si
 * — ocupação, buffers, séries, atomicidade — é provada nas suítes do
 * Scheduling; aqui o Scheduling é um dobro HTTP.
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
  idempotencyKey: string | null;
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
        idempotencyKey: request.headers.get("idempotency-key"),
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

function exceptionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "exception-1",
    date: "2026-09-10",
    startTime: null,
    endTime: null,
    available: false,
    reason: "viagem",
    decidedBy: null,
    decidedReason: null,
    ...overrides,
  };
}

function blockSeriesPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "block-series-1",
    kind: "BLOCK",
    title: "Almoço",
    daysOfWeek: [1, 2, 3],
    startTime: "12:00",
    endTime: "13:00",
    seriesStartDate: "2026-09-10",
    seriesEndDate: null,
    occurrenceCount: 4,
    status: "ACTIVE",
    supersededById: null,
    ...overrides,
  };
}

function appointmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "appointment-1",
    source: "USER",
    title: null,
    date: "2026-09-10",
    startTime: "09:00",
    endTime: "10:00",
    durationMinutes: 60,
    customerId: "customer-1",
    customer: {
      id: "customer-1",
      name: "Thaís",
      phone: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    services: [
      {
        serviceId: "service-1",
        name: "Aplicação",
        durationMinutes: 60,
        priceType: "FIXED",
        price: 100,
      },
    ],
    totalPrice: 100,
    totalPriceType: "FIXED",
    comments: null,
    status: "CONFIRMED",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    seriesId: "appointment-series-1",
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

describe.skipIf(!RUN_INTEGRATION)("Goal009: rotas públicas de agenda", () => {
  it("resolve o negócio pela sessão nas exceções, ignorando header, body e query", async () => {
    const owner = await registerBusiness(app, "goal009-a");
    const other = await registerBusiness(app, "goal009-b");
    created.push(owner, other);
    stubScheduling({ data: exceptionPayload(), requestId: "upstream-exception" }, 201);

    const response = await app.inject({
      method: "POST",
      url: `/v1/availability-exceptions/unavailable?tenantId=${other.tenantId}`,
      headers: { ...browserMutation(owner), "x-tenant-id": other.tenantId },
      payload: {
        date: "2026-09-10",
        reason: "viagem",
        tenantId: other.tenantId,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ id: "exception-1" });
    expect(upstream).toHaveLength(1);
    expect(upstream[0].tenantId).toBe(owner.tenantId);
    expect(upstream[0].tenantId).not.toBe(other.tenantId);
  });

  it("lista e remove exceção sempre no negócio da sessão", async () => {
    const owner = created[0]!;
    const other = created[1]!;
    stubScheduling({ data: [exceptionPayload()], requestId: "upstream-list" });

    const list = await app.inject({
      method: "GET",
      url: `/v1/availability-exceptions?startDate=2026-09-01&endDate=2026-09-30&tenantId=${other.tenantId}`,
      headers: { ...browserRead(owner), "x-tenant-id": other.tenantId },
    });
    expect(list.statusCode).toBe(200);
    expect(upstream[0].tenantId).toBe(owner.tenantId);

    upstream.length = 0;
    stubScheduling({ data: { deleted: true }, requestId: "upstream-remove" });
    const removed = await app.inject({
      method: "DELETE",
      url: "/v1/availability-exceptions/exception-1",
      headers: browserMutation(owner),
    });
    expect(removed.statusCode).toBe(200);
    expect(upstream[0].tenantId).toBe(owner.tenantId);
  });

  it("recusa por CSRF toda mutação nova do Goal009, antes de chamar o Scheduling", async () => {
    const owner = created[0]!;
    stubScheduling({ data: exceptionPayload(), requestId: "upstream-csrf" });

    const mutations: Array<{
      method: "POST" | "PATCH" | "DELETE";
      url: string;
      payload?: Record<string, unknown>;
    }> = [
      {
        method: "POST",
        url: "/v1/availability-exceptions/extra",
        payload: { date: "2026-09-10", startTime: "19:00", endTime: "20:00" },
      },
      {
        method: "POST",
        url: "/v1/availability-exceptions/unavailable",
        payload: { date: "2026-09-10" },
      },
      { method: "DELETE", url: "/v1/availability-exceptions/exception-1" },
      {
        method: "POST",
        url: "/v1/block-series",
        payload: {
          rule: {
            daysOfWeek: [1],
            startTime: "12:00",
            endTime: "13:00",
            seriesStartDate: "2026-09-10",
            occurrenceCount: 2,
          },
        },
      },
      {
        method: "PATCH",
        url: "/v1/block-series/block-series-1/from-date",
        payload: { fromDate: "2026-09-17", rule: {} },
      },
      { method: "DELETE", url: "/v1/block-series/block-series-1" },
      { method: "DELETE", url: "/v1/time-blocks/block-1/occurrence" },
      {
        method: "PATCH",
        url: "/v1/time-blocks/block-1/occurrence",
        payload: {
          startAt: "2026-09-10T15:00:00-03:00",
          endAt: "2026-09-10T16:00:00-03:00",
        },
      },
      {
        method: "POST",
        url: "/v1/appointments/series/preview",
        payload: {
          serviceIds: ["service-1"],
          occurrenceCount: 2,
          intervalDays: 7,
          firstDate: "2026-09-10",
          firstStartTime: "09:00",
        },
      },
      {
        method: "POST",
        url: "/v1/appointments/series/confirm",
        payload: {
          occurrences: [{ holdId: "hold-1" }],
          serviceIds: ["service-1"],
          intervalDays: 7,
        },
      },
    ];

    for (const mutation of mutations) {
      const response = await app.inject({
        method: mutation.method,
        url: mutation.url,
        // Sessão válida por cookie, origem permitida, mas sem o token de CSRF.
        headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
        payload: mutation.payload ?? {},
      });
      expect(
        { url: mutation.url, status: response.statusCode },
        `${mutation.method} ${mutation.url}`,
      ).toEqual({ url: mutation.url, status: 403 });
      expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
    }
    // Nenhuma delas chegou ao Scheduling.
    expect(upstream).toHaveLength(0);
  });

  it("a decisão humana de conflito atravessa intacta na criação da série de bloqueio", async () => {
    const owner = created[0]!;
    stubScheduling({ data: blockSeriesPayload(), requestId: "upstream-series" }, 201);

    const response = await app.inject({
      method: "POST",
      url: "/v1/block-series",
      headers: browserMutation(owner),
      payload: {
        rule: {
          kind: "PERSONAL",
          title: "Fisioterapia",
          daysOfWeek: [1, 3],
          startTime: "12:00",
          endTime: "13:00",
          seriesStartDate: "2026-09-10",
          occurrenceCount: 4,
        },
        skipConflicts: false,
        forceOverlapReason: "compromisso inadiável",
      },
    });

    expect(response.statusCode).toBe(201);
    const forwarded = JSON.parse(upstream[0].body ?? "{}");
    expect(forwarded).toMatchObject({
      skipConflicts: false,
      forceOverlapReason: "compromisso inadiável",
      rule: { kind: "PERSONAL", title: "Fisioterapia" },
    });
    // `source` nunca é escolhido pelo corpo: quem prova a origem é a
    // credencial do chamador, do lado do Scheduling.
    expect(forwarded.source).toBeUndefined();
    expect(upstream[0].tenantId).toBe(owner.tenantId);
  });

  it("a indisponibilidade sobre atendimento confirmado leva ator e motivo da decisão humana", async () => {
    const owner = created[0]!;
    stubScheduling(
      {
        data: exceptionPayload({
          decidedBy: "user-1",
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
        decidedBy: "user-1",
        decidedReason: "emergência médica",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({
      decidedBy: "user-1",
      decidedReason: "emergência médica",
    });
    expect(JSON.parse(upstream[0].body ?? "{}")).toMatchObject({
      decidedBy: "user-1",
      decidedReason: "emergência médica",
    });
  });

  it("confirmar a série de atendimento repassa a Idempotency-Key ao Scheduling", async () => {
    const owner = created[0]!;
    stubScheduling(
      { data: [appointmentPayload()], requestId: "upstream-confirm" },
      201,
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/appointments/series/confirm",
      headers: {
        ...browserMutation(owner),
        "idempotency-key": "series-key-1",
      },
      payload: {
        occurrences: [{ holdId: "hold-1" }, { holdId: "hold-2" }],
        serviceIds: ["service-1"],
        intervalDays: 7,
        customerId: "customer-1",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data[0]).toMatchObject({
      id: "appointment-1",
      seriesId: "appointment-series-1",
    });
    expect(upstream[0].idempotencyKey).toBe("series-key-1");
    expect(upstream[0].tenantId).toBe(owner.tenantId);
  });

  it("a ocorrência que falhou e as alternativas chegam ao cliente sem serem reescritas", async () => {
    const owner = created[0]!;
    stubScheduling(
      {
        error: {
          code: "SLOT_UNAVAILABLE",
          message: "Slot is unavailable for the service duration.",
          details: {
            occurrenceIndex: 1,
            holdId: "hold-2",
            occurrenceDate: "2026-09-17",
            alternatives: [
              { date: "2026-09-17", startTime: "10:00", endTime: "11:00" },
            ],
          },
        },
        requestId: "upstream-conflict",
      },
      409,
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/appointments/series/confirm",
      headers: {
        ...browserMutation(owner),
        "idempotency-key": "series-key-2",
      },
      payload: {
        occurrences: [{ holdId: "hold-1" }, { holdId: "hold-2" }],
        serviceIds: ["service-1"],
        intervalDays: 7,
        customerId: "customer-1",
      },
    });

    // O BFF embrulha todo erro de serviço interno em `UPSTREAM_ERROR`
    // (contrato do Goal008, comum a todas as rotas) preservando o código
    // original. O que o Goal009 acrescenta é que os detalhes da ocorrência —
    // qual delas falhou e as alternativas — chegam junto, em vez de morrerem
    // no BFF: sem isso, o critério 6 não alcança quem opera.
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatchObject({
      code: "UPSTREAM_ERROR",
      details: {
        upstreamCode: "SLOT_UNAVAILABLE",
        upstreamDetails: {
          occurrenceIndex: 1,
          holdId: "hold-2",
          occurrenceDate: "2026-09-17",
          alternatives: [
            { date: "2026-09-17", startTime: "10:00", endTime: "11:00" },
          ],
        },
      },
    });
  });
});
