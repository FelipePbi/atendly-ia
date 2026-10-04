import {
  calendarSourceSchema as publicCalendarSourceSchema,
  calendarStateSchema,
  customerListSchema,
  onboardingStateSchema,
  serviceListSchema,
} from "@avenly-ia/public-api-contract";
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
 * Goal109/WU-02 — a fonte do calendário passa a `AVENLY` no contrato público e
 * no BFF, tolerando `ATENDLY` na entrada e na leitura do Scheduling.
 *
 * Prova 4: o schema público decodifica os dois valores como `AVENLY`.
 * Prova 5: a escrita chega ao Scheduling como `AVENLY` e as leituras devolvem
 * `AVENLY`, qualquer que seja o valor com que o Scheduling responde.
 */
describe("Goal109 prova 4: calendarSourceSchema do contrato público", () => {
  it.each(["ATENDLY", "AVENLY"])("decodifica %s como AVENLY", (value) => {
    expect(publicCalendarSourceSchema.parse(value)).toBe("AVENLY");
  });

  it.each(["EXTERNAL", "MINHA_AGENDA", "avenly", "", null, undefined, 1])(
    "recusa %s",
    (value) => {
      expect(publicCalendarSourceSchema.safeParse(value).success).toBe(false);
    },
  );
});

const capabilities = {
  manageAvailability: true,
  manageServices: true,
  manageCustomers: true,
  createAppointments: true,
  migrate: false,
};

describe.each(["ATENDLY", "AVENLY"])(
  "Goal109 prova 4: os quatro schemas do contrato com a fonte %s",
  (source) => {
    it("calendarStateSchema devolve AVENLY", () => {
      const parsed = calendarStateSchema.parse({
        source,
        timezone: "America/Sao_Paulo",
        integration: null,
        capabilities,
      });
      expect(parsed.source).toBe("AVENLY");
    });

    it("onboardingStateSchema devolve AVENLY em calendar.source", () => {
      const parsed = onboardingStateSchema.parse({
        business: null,
        calendar: { source, timezone: "America/Sao_Paulo", integration: null },
        ai: { tone: null },
        service: null,
        availability: null,
        whatsapp: null,
        completed: false,
        completedAt: null,
      });
      expect(parsed.calendar.source).toBe("AVENLY");
    });

    it("customerListSchema devolve AVENLY em source", () => {
      const parsed = customerListSchema.parse({
        items: [],
        source,
        managedExternally: false,
      });
      expect(parsed.source).toBe("AVENLY");
    });

    it("serviceListSchema devolve AVENLY em source", () => {
      const parsed = serviceListSchema.parse({
        items: [],
        source,
        editable: true,
      });
      expect(parsed.source).toBe("AVENLY");
    });
  },
);

describe("Goal109 prova 4: os quatro schemas recusam outra fonte", () => {
  it("nenhum aceita EXTERNAL", () => {
    const source = "EXTERNAL";
    expect(
      calendarStateSchema.safeParse({
        source,
        timezone: null,
        integration: null,
        capabilities,
      }).success,
    ).toBe(false);
    expect(
      onboardingStateSchema.safeParse({
        business: null,
        calendar: { source, timezone: null, integration: null },
        ai: { tone: null },
        service: null,
        availability: null,
        whatsapp: null,
        completed: false,
        completedAt: null,
      }).success,
    ).toBe(false);
    expect(
      customerListSchema.safeParse({
        items: [],
        source,
        managedExternally: false,
      }).success,
    ).toBe(false);
    expect(
      serviceListSchema.safeParse({ items: [], source, editable: true })
        .success,
    ).toBe(false);
  });
});

let app: FastifyInstance;
const created: SessionHandle[] = [];
const calendarWrites: unknown[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function calendarPayload(source: "ATENDLY" | "AVENLY" | null) {
  return {
    source,
    timezone: source ? "America/Sao_Paulo" : null,
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

function envelope(data: unknown) {
  return new Response(JSON.stringify({ data, requestId: "upstream" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function stubScheduling(respondsWith: "ATENDLY" | "AVENLY"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);

      if (url.pathname === "/internal/calendar") {
        if (request.method !== "GET") {
          calendarWrites.push(JSON.parse(await request.text()));
        }
        return envelope(calendarPayload(respondsWith));
      }
      if (url.pathname === "/internal/dashboard") {
        return envelope({
          appointmentsToday: 0,
          todayAppointments: [],
          appointmentsThisWeek: 0,
          nextAppointment: null,
          estimatedRevenueToday: null,
          calendar: calendarPayload(respondsWith),
        });
      }
      if (url.pathname === "/internal/service-catalog") return envelope([]);
      if (url.pathname === "/internal/availability-settings") {
        return envelope({
          timezone: "America/Sao_Paulo",
          rules: [],
          minLeadMinutes: 0,
          maxLeadDays: 90,
          granularityMinutes: 30,
        });
      }
      if (url.pathname === "/internal/customers") {
        return envelope({
          items: [],
          source: respondsWith,
          managedExternally: false,
        });
      }
      return envelope(null);
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
  calendarWrites.length = 0;
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal109 prova 5: BFF com a fonte AVENLY",
  () => {
    it.each(["ATENDLY", "AVENLY"])(
      "PATCH /v1/onboarding com %s chega ao Scheduling como AVENLY",
      async (sent) => {
        const owner = await business(`avenly-write-${sent.toLowerCase()}`);
        stubScheduling("AVENLY");

        const response = await app.inject({
          method: "PATCH",
          url: "/v1/onboarding",
          headers: browserMutation(owner),
          payload: {
            business: {
              name: "Studio Teste",
              category: "Beleza",
              timezone: "America/Sao_Paulo",
            },
            calendar: { source: sent },
          },
        });

        expect(response.statusCode).toBe(200);
        expect(calendarWrites).toEqual([
          { source: "AVENLY", timezone: "America/Sao_Paulo" },
        ]);
        expect(response.json().data.calendar.source).toBe("AVENLY");
      },
    );

    it("PATCH /v1/onboarding recusa outra fonte", async () => {
      const owner = await business("avenly-write-other");
      stubScheduling("AVENLY");

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/onboarding",
        headers: browserMutation(owner),
        payload: { calendar: { source: "EXTERNAL" } },
      });

      expect(response.statusCode).toBe(400);
      expect(calendarWrites).toEqual([]);
    });

    describe.each(["AVENLY", "ATENDLY"] as const)(
      "com o Scheduling respondendo %s",
      (upstream) => {
        it("as leituras devolvem AVENLY", async () => {
          const owner = await business(`avenly-read-${upstream.toLowerCase()}`);
          stubScheduling(upstream);

          const onboarding = await app.inject({
            method: "GET",
            url: "/v1/onboarding",
            headers: browserRead(owner),
          });
          expect(onboarding.statusCode).toBe(200);
          expect(onboarding.json().data.calendar.source).toBe("AVENLY");

          const settings = await app.inject({
            method: "GET",
            url: "/v1/settings",
            headers: browserRead(owner),
          });
          expect(settings.statusCode).toBe(200);
          expect(settings.json().data.calendar.source).toBe("AVENLY");

          const calendar = await app.inject({
            method: "GET",
            url: "/v1/calendar",
            headers: browserRead(owner),
          });
          expect(calendar.statusCode).toBe(200);
          expect(calendar.json().data.source).toBe("AVENLY");

          const services = await app.inject({
            method: "GET",
            url: "/v1/services",
            headers: browserRead(owner),
          });
          expect(services.statusCode).toBe(200);
          expect(services.json().data.source).toBe("AVENLY");

          const customers = await app.inject({
            method: "GET",
            url: "/v1/customers",
            headers: browserRead(owner),
          });
          expect(customers.statusCode).toBe(200);
          expect(customers.json().data.source).toBe("AVENLY");

          const dashboard = await app.inject({
            method: "GET",
            url: "/v1/dashboard",
            headers: browserRead(owner),
          });
          expect(dashboard.statusCode).toBe(200);
          expect(dashboard.json().data.scheduling.status).toBe("ok");
          expect(dashboard.json().data.scheduling.data.calendar.source).toBe(
            "AVENLY",
          );
        });
      },
    );
  },
);
