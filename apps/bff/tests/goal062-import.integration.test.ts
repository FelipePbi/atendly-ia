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
 * Contrato público da grade vigente/proposta na listagem de itens de
 * disponibilidade (Goal062 §2, WU-04) — contra sessão real.
 *
 * A regra de negócio (troca em vez de soma, decisão de item que arrasta o
 * grupo, motivo de sobreposição) já é provada nas suítes do Scheduling; aqui
 * o que se prova é o próprio contrato público: a resposta do Scheduling com
 * `currentAvailability`/`proposedAvailability` atravessa o BFF sem ser
 * removida pelo schema (`ResponseContractViolationError` derrubaria a suíte
 * se o contrato não os declarasse), e itens de outra categoria continuam sem
 * os dois campos.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  url: string;
}

const upstream: UpstreamCall[] = [];

function stubScheduling(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      upstream.push({ method: request.method, url: request.url });
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
    category: "AVAILABILITY",
    externalId: "company",
    label: "Horários da origem",
    status: "NEEDS_REVIEW",
    reasonCode: "AVAILABILITY_REPLACES_CURRENT",
    reasonDetail:
      "O negócio já tem horários de atendimento: escolha entre usar os horários da origem no lugar dos atuais ou manter os atuais.",
    entityType: null,
    internalId: null,
    attemptCount: 0,
    lastAttemptAt: null,
    processedAt: null,
    disappearedAt: null,
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
  "Goal062: grade vigente e proposta na listagem de itens de disponibilidade",
  () => {
    it("repassa currentAvailability e proposedAvailability num item AVAILABILITY", async () => {
      const owner = await registerBusiness(app, "goal062-import-a");
      created.push(owner);
      stubScheduling({
        data: {
          sessionId: "import-session-1",
          category: "AVAILABILITY",
          total: 1,
          limit: 50,
          offset: 0,
          items: [
            baseItem({
              currentAvailability: [
                { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
              ],
              proposedAvailability: [
                { dayOfWeek: 2, startTime: "08:00", endTime: "18:00" },
              ],
            }),
          ],
        },
        requestId: "upstream-availability-items",
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar/imports/import-session-1/categories/AVAILABILITY/items",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.items[0]).toMatchObject({
        currentAvailability: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
        ],
        proposedAvailability: [
          { dayOfWeek: 2, startTime: "08:00", endTime: "18:00" },
        ],
      });
    });

    it("aceita proposedAvailability nulo quando a análise não gravou grade", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: {
          sessionId: "import-session-1",
          category: "AVAILABILITY",
          total: 1,
          limit: 50,
          offset: 0,
          items: [
            baseItem({
              reasonCode: "AVAILABILITY_SOURCE_OVERLAP",
              reasonDetail:
                "Os horários da origem se sobrepõem no mesmo dia: eles não serão importados.",
              currentAvailability: [],
              proposedAvailability: null,
            }),
          ],
        },
        requestId: "upstream-availability-overlap",
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar/imports/import-session-1/categories/AVAILABILITY/items",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.items[0]).toMatchObject({
        reasonCode: "AVAILABILITY_SOURCE_OVERLAP",
        currentAvailability: [],
        proposedAvailability: null,
      });
    });

    it("item de outra categoria continua sem os dois campos de grade", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: {
          sessionId: "import-session-1",
          category: "SERVICE",
          total: 1,
          limit: 50,
          offset: 0,
          items: [
            {
              id: "item-2",
              category: "SERVICE",
              externalId: "42",
              label: "Corte",
              status: "NEEDS_REVIEW",
              reasonCode: "SERVICE_PRICE_NOT_INFORMED",
              reasonDetail:
                "Serviço sem preço informado pela origem (preço 0): revise antes de usar em cobrança.",
              entityType: null,
              internalId: null,
              attemptCount: 0,
              lastAttemptAt: null,
              processedAt: null,
              disappearedAt: null,
            },
          ],
        },
        requestId: "upstream-service-items",
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar/imports/import-session-1/categories/SERVICE/items",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      const item = response.json().data.items[0];
      expect(item.reasonCode).toBe("SERVICE_PRICE_NOT_INFORMED");
      expect(item.currentAvailability).toBeUndefined();
      expect(item.proposedAvailability).toBeUndefined();
    });
  },
);
