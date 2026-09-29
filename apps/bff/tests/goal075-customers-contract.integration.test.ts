import type { FastifyInstance, FastifyRequest } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { responseContractViolation } from "../src/lib/response-contract.js";
import {
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal075/WU-02 — teste §6.4: `GET /v1/customers` e `GET /v1/customers/:id`
 * passam `nextAppointment`, `lastAppointment` e `appointmentStats` pelo
 * schema do contrato (`@atendly-ia/public-api-contract`), e a verificação de
 * contrato de resposta (Goal036) reprova qualquer campo que o contrato não
 * declare dentro desses três objetos novos.
 */

function requestFor(method: string, pathPattern: string): FastifyRequest {
  return {
    method,
    routeOptions: { url: pathPattern },
  } as unknown as FastifyRequest;
}

function envelope(data: unknown): string {
  return JSON.stringify({ data, requestId: "req-goal075" });
}

function customerListWithAppointments(
  nextAppointment: Record<string, unknown> | null,
  lastAppointment: Record<string, unknown> | null,
) {
  return {
    items: [{ id: "cus-1", name: "Ana", phone: null, nextAppointment, lastAppointment }],
    source: "ATENDLY",
    managedExternally: false,
  };
}

function customerDetailWithStats(
  appointmentStats: Record<string, unknown>,
  highlights: {
    nextAppointment?: Record<string, unknown> | null;
    lastAppointment?: Record<string, unknown> | null;
  } = {},
) {
  return {
    id: "cus-1",
    name: "Ana",
    phone: null,
    ...highlights,
    primaryGuardian: null,
    notes: [],
    tags: [],
    appointmentStats,
  };
}

const DECLARED_STATS = {
  completed: 4,
  noShows: 1,
  cancelled: 0,
  averageIntervalDays: 21.5,
  firstAppointmentDate: "2026-01-10",
};

describe("responseContractViolation: campos novos do Goal075", () => {
  it("não acha nada quando nextAppointment e lastAppointment são só os campos declarados", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/customers"),
      200,
      envelope(
        customerListWithAppointments(
          { date: "2026-10-05", startTime: "15:00", status: "CONFIRMED" },
          null,
        ),
      ),
    );

    expect(violation).toBeNull();
  });

  it("reprova campo não declarado dentro de nextAppointment", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/customers"),
      200,
      envelope(
        customerListWithAppointments(
          {
            date: "2026-10-05",
            startTime: "15:00",
            status: "CONFIRMED",
            serviceName: "Corte",
          },
          null,
        ),
      ),
    );

    expect(violation?.fieldPaths).toEqual([
      "data.items[0].nextAppointment.serviceName",
    ]);
  });

  it("não acha nada quando appointmentStats são só os campos declarados", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/customers/:id"),
      200,
      envelope(
        customerDetailWithStats({
          completed: 4,
          noShows: 1,
          cancelled: 0,
          averageIntervalDays: 21.5,
          firstAppointmentDate: "2026-01-10",
        }),
      ),
    );

    expect(violation).toBeNull();
  });

  it("reprova campo não declarado dentro de appointmentStats", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/customers/:id"),
      200,
      envelope(
        customerDetailWithStats({
          completed: 4,
          noShows: 1,
          cancelled: 0,
          averageIntervalDays: null,
          firstAppointmentDate: null,
          totalRevenue: 500,
        }),
      ),
    );

    expect(violation?.fieldPaths).toEqual([
      "data.appointmentStats.totalRevenue",
    ]);
  });

  it("não acha nada quando o detalhe traz nextAppointment e lastAppointment declarados", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/customers/:id"),
      200,
      envelope(
        customerDetailWithStats(DECLARED_STATS, {
          nextAppointment: {
            date: "2026-10-05",
            startTime: "15:00",
            status: "CONFIRMED",
          },
          lastAppointment: {
            date: "2026-09-10",
            startTime: "09:00",
            status: "COMPLETED",
          },
        }),
      ),
    );

    expect(violation).toBeNull();
  });

  it("reprova campo não declarado dentro de lastAppointment do detalhe", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/customers/:id"),
      200,
      envelope(
        customerDetailWithStats(DECLARED_STATS, {
          nextAppointment: null,
          lastAppointment: {
            date: "2026-09-10",
            startTime: "09:00",
            status: "COMPLETED",
            professionalName: "Rita",
          },
        }),
      ),
    );

    expect(violation?.fieldPaths).toEqual([
      "data.lastAppointment.professionalName",
    ]);
  });
});

/**
 * Ponta a ponta, contra sessão real: os dois campos da lista e o do detalhe
 * atravessam o Scheduling (dobrado por HTTP) até o corpo que o BFF devolve,
 * sem a verificação de contrato de resposta reprovar o caminho feliz.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];
const upstream: string[] = [];

function stubScheduling(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      upstream.push(request.url);
      return new Response(JSON.stringify(payload), {
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

describe.skipIf(!RUN_INTEGRATION)("GET /v1/customers e /v1/customers/:id: Goal075", () => {
  it("devolve nextAppointment e lastAppointment na lista", async () => {
    const owner = await registerBusiness(app, "customers-goal075");
    created.push(owner);
    stubScheduling({
      data: {
        items: [
          {
            id: "customer-1",
            name: "Ana",
            phone: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            nextAppointment: {
              date: "2026-10-05",
              startTime: "15:00",
              status: "CONFIRMED",
            },
            lastAppointment: null,
          },
        ],
        source: "ATENDLY",
        managedExternally: false,
      },
      requestId: "upstream-list",
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/customers",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.items[0]).toMatchObject({
      nextAppointment: { date: "2026-10-05", startTime: "15:00", status: "CONFIRMED" },
      lastAppointment: null,
    });
  });

  it("devolve appointmentStats, nextAppointment e lastAppointment no detalhe", async () => {
    const owner = created[0]!;
    stubScheduling({
      data: {
        id: "customer-1",
        name: "Ana",
        phone: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nextAppointment: {
          date: "2026-10-05",
          startTime: "15:00",
          status: "CONFIRMED",
        },
        lastAppointment: {
          date: "2026-09-10",
          startTime: "09:00",
          status: "COMPLETED",
        },
        appointmentStats: {
          completed: 4,
          noShows: 1,
          cancelled: 0,
          averageIntervalDays: 21.5,
          firstAppointmentDate: "2026-01-10",
        },
      },
      requestId: "upstream-detail",
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/customers/customer-1",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.appointmentStats).toEqual({
      completed: 4,
      noShows: 1,
      cancelled: 0,
      averageIntervalDays: 21.5,
      firstAppointmentDate: "2026-01-10",
    });
    expect(response.json().data).toMatchObject({
      nextAppointment: { date: "2026-10-05", startTime: "15:00", status: "CONFIRMED" },
      lastAppointment: { date: "2026-09-10", startTime: "09:00", status: "COMPLETED" },
    });
  });
});
