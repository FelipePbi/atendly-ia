import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appointmentSchema } from "@avenly-ia/public-api-contract";

/**
 * D-207 — duração do serviço por atendimento. O BFF transporta o ajuste da
 * profissional (criação, reserva, disponibilidade e o ajuste depois de
 * marcado em `/v1/appointments/:id/duration`) sempre como `source: USER`, e a
 * resposta com `defaultDurationMinutes` passa no guard de contrato do
 * Goal036. Sem PostgreSQL: sessão e Scheduling são dublês.
 */

vi.stubEnv("INTERNAL_SERVICE_TOKEN", "root-internal-secret-with-32-chars-min-203");

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

const { registerV1CalendarRoutes } =
  await import("../src/modules/calendar/routes.js");
const { registerResponseContractCheck } =
  await import("../src/lib/response-contract.js");

const appointment = {
  id: "apt-1",
  source: "USER",
  title: null,
  date: "2026-10-20",
  startTime: "14:00",
  endTime: "15:00",
  durationMinutes: 60,
  customerId: "cus-ana",
  customer: { id: "cus-ana", name: "Ana", phone: null },
  services: [
    {
      serviceId: "svc-corte",
      name: "Corte",
      durationMinutes: 60,
      defaultDurationMinutes: 40,
      priceType: "FIXED",
      price: 50,
    },
  ],
  totalPrice: 50,
  totalPriceType: "FIXED",
  comments: null,
  status: "CONFIRMED",
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  seriesId: null,
  completedAt: null,
  completionOrigin: null,
  noShowAt: null,
  noShowNote: null,
  presenceConfirmedAt: null,
  finalValue: null,
};

type Upstream = {
  url: URL;
  method: string;
  body: unknown;
  idempotencyKey: string | null;
};

let upstream: Upstream[] = [];
let upstreamResponse: { status: number; body: unknown } | null = null;
let app: FastifyInstance;

beforeEach(async () => {
  upstream = [];
  upstreamResponse = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const text = await request.text();
      const url = new URL(request.url);
      upstream.push({
        url,
        method: request.method,
        body: text ? JSON.parse(text) : null,
        idempotencyKey: request.headers.get("idempotency-key"),
      });
      if (upstreamResponse) {
        return new Response(JSON.stringify(upstreamResponse.body), {
          status: upstreamResponse.status,
          headers: { "content-type": "application/json" },
        });
      }
      const data =
        url.pathname === "/internal/availability"
          ? [{ date: "2026-10-20", startTime: "08:00", endTime: "09:00" }]
          : appointment;
      return new Response(JSON.stringify({ data, requestId: "up" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  app = Fastify({ logger: false });
  registerResponseContractCheck(app);
  await registerV1CalendarRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("POST /v1/appointments/:id/duration (D-207)", () => {
  it("repassa a duração de cada serviço como USER, com a chave, e devolve o contrato", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/appointments/apt-1/duration",
      headers: { "idempotency-key": "key-duration" },
      payload: {
        services: [{ serviceId: "svc-corte", durationMinutes: 60 }],
        source: "AI",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const data = appointmentSchema.parse(response.json().data);
    expect(data.services[0]).toMatchObject({
      durationMinutes: 60,
      defaultDurationMinutes: 40,
    });
    const call = upstream.find((entry) =>
      entry.url.pathname.endsWith("/duration"),
    );
    expect(call).toMatchObject({
      method: "POST",
      idempotencyKey: "key-duration",
      body: {
        services: [{ serviceId: "svc-corte", durationMinutes: 60 }],
        // A origem é da rota, nunca do corpo.
        source: "USER",
      },
    });
  });

  it("transporta o encaixe com motivo", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/appointments/apt-1/duration",
      headers: { "idempotency-key": "key-override" },
      payload: {
        services: [{ serviceId: "svc-corte", durationMinutes: 60 }],
        overlapOverride: true,
        overlapOverrideReason: "Caso especial",
      },
    });
    expect(upstream[0]?.body).toMatchObject({
      overlapOverride: true,
      overlapOverrideReason: "Caso especial",
    });
  });

  it("recusa duração inválida e falta de chave sem chamar o Scheduling", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/appointments/apt-1/duration",
      headers: { "idempotency-key": "key-invalid" },
      payload: { services: [{ serviceId: "svc-corte", durationMinutes: 0 }] },
    });
    expect(invalid.statusCode).toBe(400);
    const empty = await app.inject({
      method: "POST",
      url: "/v1/appointments/apt-1/duration",
      headers: { "idempotency-key": "key-empty" },
      payload: { services: [] },
    });
    expect(empty.statusCode).toBe(400);
    const withoutKey = await app.inject({
      method: "POST",
      url: "/v1/appointments/apt-1/duration",
      payload: { services: [{ serviceId: "svc-corte", durationMinutes: 60 }] },
    });
    expect(withoutKey.statusCode).toBe(400);
    expect(upstream).toHaveLength(0);
  });

  it("a recusa de horário do Scheduling chega com o código de origem", async () => {
    upstreamResponse = {
      status: 409,
      body: {
        error: {
          code: "SLOT_UNAVAILABLE",
          message: "Slot is unavailable for the service duration.",
        },
        requestId: "up",
      },
    };
    const response = await app.inject({
      method: "POST",
      url: "/v1/appointments/apt-1/duration",
      headers: { "idempotency-key": "key-conflict" },
      payload: { services: [{ serviceId: "svc-corte", durationMinutes: 90 }] },
    });
    // O status do Scheduling chega como está; o código de origem vai em
    // `details.upstreamCode` pelo tratador de erro do app (fora deste dublê).
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("UPSTREAM_ERROR");
  });
});

describe("criação, reserva e disponibilidade com duração ajustada (D-207)", () => {
  it("criação e reserva levam `serviceDurations` ao Scheduling", async () => {
    const serviceDurations = [{ serviceId: "svc-corte", durationMinutes: 60 }];
    const created = await app.inject({
      method: "POST",
      url: "/v1/appointments",
      headers: { "idempotency-key": "key-create" },
      payload: {
        serviceIds: ["svc-corte"],
        serviceDurations,
        date: "2026-10-20",
        startTime: "14:00",
        customerId: "cus-ana",
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    await app.inject({
      method: "POST",
      url: "/v1/holds",
      headers: { "idempotency-key": "key-hold" },
      payload: {
        serviceIds: ["svc-corte"],
        serviceDurations,
        date: "2026-10-20",
        startTime: "14:00",
      },
    });
    expect(upstream.map((entry) => entry.body)).toEqual([
      expect.objectContaining({ serviceDurations, source: "USER" }),
      expect.objectContaining({ serviceDurations, source: "USER" }),
    ]);
  });

  it("a disponibilidade repassa `servico:minutos` e recusa o formato errado", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/availability?serviceIds=svc-corte&serviceDurations=svc-corte:60&startDate=2026-10-20",
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(upstream[0]?.url.searchParams.get("serviceDurations")).toBe(
      "svc-corte:60",
    );
    const invalid = await app.inject({
      method: "GET",
      url: "/v1/availability?serviceIds=svc-corte&serviceDurations=svc-corte&startDate=2026-10-20",
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("serviço sem `defaultDurationMinutes` (Scheduling anterior) continua válido", () => {
    const { defaultDurationMinutes: _default, ...legacy } =
      appointment.services[0];
    void _default;
    expect(
      appointmentSchema.parse({ ...appointment, services: [legacy] })
        .services[0].defaultDurationMinutes ?? null,
    ).toBeNull();
  });
});
