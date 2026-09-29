import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
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
 * Goal073/WU-03 — campo de política no Scheduling proxiado pelo BFF e
 * preferência de visualização da agenda, só do BFF.
 *
 * O que é provado aqui, contra PostgreSQL real e o Scheduling como dublê HTTP:
 *
 * - `PATCH /v1/settings/availability` grava `customerChangeMinNoticeMinutes`
 *   e `GET /v1/settings` devolve o prazo gravado;
 * - `GET /v1/settings/agenda-view` sem linha devolve o default do produto
 *   (`hiddenWeekdays: []`, `initialView: null`) sem gravar linha;
 * - `PATCH /v1/settings/agenda-view` grava, recusa sete dias ocultos, dia
 *   repetido e dia fora de 0–6, e não toca outro tenant;
 * - sem sessão, `401`.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function calendarPayload() {
  return {
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
    integration: null,
    capabilities: {
      manageAvailability: true,
      manageServices: true,
      manageCustomers: true,
      createAppointments: true,
      migrate: true,
      aiActivationReady: true,
    },
  };
}

function availabilityPayload(customerChangeMinNoticeMinutes: number) {
  return {
    timezone: "America/Sao_Paulo",
    rules: [],
    minLeadMinutes: 0,
    maxLeadDays: 90,
    granularityMinutes: 30,
    customerChangeMinNoticeMinutes,
  };
}

/** Dublê HTTP do Scheduling: só o calendário e a disponibilidade importam aqui. */
function stubScheduling() {
  const store = new Map<string, number>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const tenantId = request.headers.get("x-tenant-id");
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.pathname === "/internal/calendar" && request.method === "GET") {
        return jsonResponse({ data: calendarPayload(), requestId: "up-calendar" });
      }
      if (url.pathname === "/internal/availability-settings") {
        const current = (tenantId && store.get(tenantId)) ?? 0;
        if (request.method === "PATCH") {
          const next = body?.customerChangeMinNoticeMinutes ?? current;
          if (tenantId) store.set(tenantId, next);
          return jsonResponse({
            data: availabilityPayload(next),
            requestId: "up-patch",
          });
        }
        return jsonResponse({
          data: availabilityPayload(current),
          requestId: "up-get",
        });
      }
      throw new Error(
        `Unexpected upstream call: ${request.method} ${url.pathname}`,
      );
    }),
  );
}

async function patchAvailability(
  owner: SessionHandle,
  body: Record<string, unknown>,
) {
  return app.inject({
    method: "PATCH",
    url: "/v1/settings/availability",
    headers: browserMutation(owner),
    payload: body,
  });
}

async function readSettings(owner: SessionHandle) {
  const response = await app.inject({
    method: "GET",
    url: "/v1/settings",
    headers: browserRead(owner),
  });
  expect(response.statusCode).toBe(200);
  return response.json().data;
}

async function getAgendaView(owner: SessionHandle) {
  return app.inject({
    method: "GET",
    url: "/v1/settings/agenda-view",
    headers: browserRead(owner),
  });
}

async function patchAgendaView(
  owner: SessionHandle,
  body: Record<string, unknown>,
) {
  return app.inject({
    method: "PATCH",
    url: "/v1/settings/agenda-view",
    headers: browserMutation(owner),
    payload: body,
  });
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
  "Goal073/WU-03: política de antecedência mínima e visualização da agenda",
  () => {
    it("PATCH /v1/settings/availability grava customerChangeMinNoticeMinutes e GET /v1/settings devolve o prazo", async () => {
      const owner = await business("policy-notice-minutes");
      stubScheduling();

      const patch = await patchAvailability(owner, {
        rules: [],
        customerChangeMinNoticeMinutes: 120,
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().data.customerChangeMinNoticeMinutes).toBe(120);

      const settings = await readSettings(owner);
      expect(settings.availability.customerChangeMinNoticeMinutes).toBe(120);
    });

    it("GET /v1/settings/agenda-view sem linha devolve hiddenWeekdays [] e initialView null, sem gravar linha", async () => {
      const owner = await business("agenda-view-default");

      const response = await getAgendaView(owner);
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual({
        hiddenWeekdays: [],
        initialView: null,
      });

      const row = await getPrisma().agendaViewPreference.findUnique({
        where: { tenantId: owner.tenantId },
      });
      expect(row).toBeNull();
    });

    it("PATCH /v1/settings/agenda-view grava e não toca outro tenant", async () => {
      const owner = await business("agenda-view-write-own");
      const other = await business("agenda-view-write-other");

      const patch = await patchAgendaView(owner, {
        hiddenWeekdays: [0, 6],
        initialView: "WEEK",
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().data).toEqual({
        hiddenWeekdays: [0, 6],
        initialView: "WEEK",
      });

      const ownerRow = await getPrisma().agendaViewPreference.findUniqueOrThrow(
        { where: { tenantId: owner.tenantId } },
      );
      expect(ownerRow.hiddenWeekdays).toEqual([0, 6]);
      expect(ownerRow.initialView).toBe("WEEK");

      const otherRow = await getPrisma().agendaViewPreference.findUnique({
        where: { tenantId: other.tenantId },
      });
      expect(otherRow).toBeNull();
    });

    it("recusa sete dias ocultos, dia repetido e dia fora de 0–6, com 400 VALIDATION_ERROR", async () => {
      const owner = await business("agenda-view-invalid");

      const sevenDays = await patchAgendaView(owner, {
        hiddenWeekdays: [0, 1, 2, 3, 4, 5, 6],
      });
      expect(sevenDays.statusCode).toBe(400);
      expect(sevenDays.json().error.code).toBe("VALIDATION_ERROR");

      const repeated = await patchAgendaView(owner, {
        hiddenWeekdays: [1, 1],
      });
      expect(repeated.statusCode).toBe(400);
      expect(repeated.json().error.code).toBe("VALIDATION_ERROR");

      const outOfRange = await patchAgendaView(owner, {
        hiddenWeekdays: [7],
      });
      expect(outOfRange.statusCode).toBe(400);
      expect(outOfRange.json().error.code).toBe("VALIDATION_ERROR");

      const row = await getPrisma().agendaViewPreference.findUnique({
        where: { tenantId: owner.tenantId },
      });
      expect(row).toBeNull();
    });

    it("sem sessão devolve 401 em GET e PATCH /v1/settings/agenda-view", async () => {
      const getNoSession = await app.inject({
        method: "GET",
        url: "/v1/settings/agenda-view",
      });
      expect(getNoSession.statusCode).toBe(401);

      const patchNoSession = await app.inject({
        method: "PATCH",
        url: "/v1/settings/agenda-view",
        payload: { hiddenWeekdays: [] },
      });
      expect(patchNoSession.statusCode).toBe(401);
    });
  },
);
