import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  assertDisposableTarget,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal103 — a listagem e a leitura de um agendamento repassam os seis campos
 * de ciclo de vida do Scheduling. O Scheduling é um dobro HTTP: o que é do BFF
 * aqui é não descartar o campo ao decodificar, e decodificar a resposta
 * anterior ao Goal com `null` nos seis.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

function stubScheduling(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

const LIFECYCLE_FIELDS = [
  "completedAt",
  "completionOrigin",
  "noShowAt",
  "noShowNote",
  "presenceConfirmedAt",
  "finalValue",
] as const;

function legacyAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "appointment-1",
    source: "USER",
    title: null,
    date: "2026-10-10",
    startTime: "09:00",
    endTime: "09:30",
    durationMinutes: 30,
    customerId: "customer-1",
    customer: { id: "customer-1", name: "Ana", phone: "5511999990000" },
    services: [
      {
        serviceId: "service-1",
        name: "Corte",
        durationMinutes: 30,
        priceType: "FIXED",
        price: 80,
      },
    ],
    totalPrice: 80,
    totalPriceType: "FIXED",
    comments: null,
    status: "COMPLETED",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    seriesId: null,
    ...overrides,
  };
}

function lifecycleFields() {
  return {
    completedAt: "2026-10-10T12:30:00.000Z",
    completionOrigin: "MANUAL",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: "2026-10-09T18:00:00.000Z",
    finalValue: 149.9,
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
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal103: o BFF repassa o ciclo de vida do agendamento",
  () => {
    it("GET /v1/appointments devolve os seis campos iguais aos do Scheduling", async () => {
      const owner = await registerBusiness(app, "goal103-list");
      created.push(owner);
      const lifecycle = lifecycleFields();
      stubScheduling({
        data: [legacyAppointment(lifecycle)],
        requestId: "upstream-list",
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/appointments?startDate=2026-10-01&endDate=2026-10-31",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      const [appointment] = response.json().data;
      for (const field of LIFECYCLE_FIELDS) {
        expect(appointment[field]).toEqual(lifecycle[field]);
      }
    });

    it("GET /v1/appointments/:id devolve os seis campos iguais aos do Scheduling", async () => {
      const owner = created[0]!;
      const lifecycle = {
        ...lifecycleFields(),
        completedAt: null,
        completionOrigin: null,
        presenceConfirmedAt: null,
        noShowAt: "2026-10-10T13:00:00.000Z",
        noShowNote: "Avisou tarde",
        finalValue: null,
      };
      stubScheduling({
        data: legacyAppointment({ ...lifecycle, status: "NO_SHOW" }),
        requestId: "upstream-get",
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/appointments/appointment-1",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      const appointment = response.json().data;
      for (const field of LIFECYCLE_FIELDS) {
        expect(appointment[field]).toEqual(lifecycle[field]);
      }
    });

    it("com a forma antiga do Scheduling, as duas rotas respondem 200 com null nos seis", async () => {
      const owner = created[0]!;

      stubScheduling({ data: [legacyAppointment()], requestId: "upstream-old" });
      const list = await app.inject({
        method: "GET",
        url: "/v1/appointments?startDate=2026-10-01&endDate=2026-10-31",
        headers: browserRead(owner),
      });
      expect(list.statusCode).toBe(200);
      for (const field of LIFECYCLE_FIELDS) {
        expect(list.json().data[0][field]).toBeNull();
      }

      stubScheduling({ data: legacyAppointment(), requestId: "upstream-old" });
      const read = await app.inject({
        method: "GET",
        url: "/v1/appointments/appointment-1",
        headers: browserRead(owner),
      });
      expect(read.statusCode).toBe(200);
      for (const field of LIFECYCLE_FIELDS) {
        expect(read.json().data[field]).toBeNull();
      }
    });
  },
);
