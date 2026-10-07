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
 * Contrato público de `candidates` e `proposedService` na listagem de itens
 * da importação (Goal136, WU-02) — contra sessão real.
 *
 * A regra de negócio (quem é candidato, o que a origem propõe) é provada nas
 * suítes do Scheduling; aqui se prova que a resposta do Scheduling atravessa o
 * BFF sem ser removida pelo schema, que a resposta sem os campos continua
 * válida e que um candidato de cliente com telefone é recusado em vez de
 * vazar.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

function stubScheduling(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    category: "CUSTOMER",
    externalId: "77",
    label: "Maria",
    status: "NEEDS_REVIEW",
    reasonCode: "CUSTOMER_MATCH_FOUND",
    reasonDetail: null,
    entityType: null,
    internalId: null,
    attemptCount: 0,
    lastAttemptAt: null,
    processedAt: null,
    disappearedAt: null,
    ...overrides,
  };
}

function page(category: string, items: unknown[]) {
  return {
    data: {
      sessionId: "import-session-1",
      category,
      total: items.length,
      limit: 50,
      offset: 0,
      items,
    },
    requestId: "upstream-items",
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
  "Goal136: candidates e proposedService na listagem de itens",
  () => {
    it("repassa candidates de cliente com só internalId e name", async () => {
      const owner = await registerBusiness(app, "goal136-import-a");
      created.push(owner);
      stubScheduling(
        page("CUSTOMER", [
          baseItem({
            candidates: [{ internalId: "cust-1", name: "Maria Souza" }],
          }),
        ]),
      );

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar/imports/import-session-1/categories/CUSTOMER/items",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.items[0].candidates).toEqual([
        { internalId: "cust-1", name: "Maria Souza" },
      ]);
    });

    it("repassa candidates de serviço e proposedService num item SERVICE", async () => {
      const owner = created[0]!;
      stubScheduling(
        page("SERVICE", [
          baseItem({
            category: "SERVICE",
            reasonCode: "SERVICE_MATCH_FOUND",
            candidates: [
              {
                internalId: "svc-1",
                name: "Corte",
                durationMinutes: 30,
                priceType: "FIXED",
                price: 50,
                active: true,
              },
            ],
            proposedService: {
              durationMinutes: 45,
              priceType: "NOT_INFORMED",
              price: null,
            },
          }),
        ]),
      );

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar/imports/import-session-1/categories/SERVICE/items",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.items[0]).toMatchObject({
        candidates: [
          {
            internalId: "svc-1",
            name: "Corte",
            durationMinutes: 30,
            priceType: "FIXED",
            price: 50,
            active: true,
          },
        ],
        proposedService: {
          durationMinutes: 45,
          priceType: "NOT_INFORMED",
          price: null,
        },
      });
    });

    it("a resposta sem os campos continua válida e sem eles", async () => {
      const owner = created[0]!;
      stubScheduling(page("CUSTOMER", [baseItem()]));

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar/imports/import-session-1/categories/CUSTOMER/items",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      const item = response.json().data.items[0];
      expect(item.candidates).toBeUndefined();
      expect(item.proposedService).toBeUndefined();
    });

    it("recusa candidato de cliente com telefone: o dado pessoal não chega ao navegador", async () => {
      const owner = created[0]!;
      stubScheduling(
        page("CUSTOMER", [
          baseItem({
            candidates: [
              { internalId: "cust-1", name: "Maria", phone: "+5555999990001" },
            ],
          }),
        ]),
      );

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar/imports/import-session-1/categories/CUSTOMER/items",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(500);
      expect(response.body).not.toContain("5555999990001");
    });
  },
);
