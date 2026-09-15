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
 * Rotas públicas novas da importação única (Goal020, WU-003): leitura do
 * estado (direito, sessão viva, histórico) e escolha de categoria — contra
 * sessão real.
 *
 * O que é do BFF e só aqui pode ser provado: o negócio sai da sessão
 * autenticada, a mutação exige CSRF e `Idempotency-Key` antes do Scheduling,
 * uma requisição sem sessão é recusada com 401 e a resposta da leitura não
 * carrega nenhum campo de credencial. A regra de negócio do estado e da
 * seleção em si é provada nas suítes do Scheduling; aqui o Scheduling é um
 * dobro HTTP.
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

function importStatePayload(overrides: Record<string, unknown> = {}) {
  return {
    right: { available: true, sessionId: null, completedAt: null },
    session: null,
    history: null,
    ...overrides,
  };
}

function categorySelectionResultPayload(
  overrides: Record<string, unknown> = {},
) {
  return {
    sessionId: "import-session-1",
    category: "SERVICE",
    selected: false,
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
  "Goal020: rotas públicas do estado da importação e seleção de categoria",
  () => {
    it("lê o estado da importação resolvendo o negócio pela sessão, ignorando header e query", async () => {
      const owner = await registerBusiness(app, "goal020-state-a");
      const other = await registerBusiness(app, "goal020-state-b");
      created.push(owner, other);
      stubScheduling({
        data: importStatePayload(),
        requestId: "upstream-state",
      });

      const response = await app.inject({
        method: "GET",
        url: `/v1/calendar/imports?tenantId=${other.tenantId}`,
        headers: { ...browserRead(owner), "x-tenant-id": other.tenantId },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json().data;
      expect(body).toMatchObject({
        right: { available: true },
        session: null,
        history: null,
      });
      expect(upstream).toHaveLength(1);
      expect(upstream[0].tenantId).toBe(owner.tenantId);
      expect(upstream[0].tenantId).not.toBe(other.tenantId);
      // Nenhum campo de credencial no corpo da resposta.
      expect(JSON.stringify(body)).not.toMatch(
        /basicAuth|password|authorization|credentials/i,
      );
    });

    it("recusa a leitura do estado sem sessão", async () => {
      stubScheduling({ data: importStatePayload(), requestId: "upstream-anon" });

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar/imports",
      });

      expect(response.statusCode).toBe(401);
      expect(upstream).toHaveLength(0);
    });

    it("marca/desmarca a categoria resolvendo o negócio pela sessão, com Idempotency-Key", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: categorySelectionResultPayload({ selected: false }),
        requestId: "upstream-selection",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/imports/import-session-1/categories/SERVICE/selection",
        headers: {
          ...browserMutation(owner),
          "idempotency-key": "import-selection-1",
        },
        payload: { selected: false },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        category: "SERVICE",
        selected: false,
      });
      expect(upstream[0].tenantId).toBe(owner.tenantId);
      expect(upstream[0].idempotencyKey).toBe("import-selection-1");
      const forwarded = JSON.parse(upstream[0].body ?? "{}");
      expect(forwarded).toEqual({ selected: false });
    });

    it("recusa por CSRF a escolha de categoria antes de chamar o Scheduling", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: categorySelectionResultPayload(),
        requestId: "upstream-csrf",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/imports/import-session-1/categories/SERVICE/selection",
        // Sessão válida por cookie, origem permitida, mas sem token de CSRF
        // nem `Idempotency-Key` — a recusa por CSRF acontece primeiro.
        headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
        payload: { selected: true },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
      expect(upstream).toHaveLength(0);
    });

    it("recusa a escolha de categoria sem Idempotency-Key antes de chamar o Scheduling", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: categorySelectionResultPayload(),
        requestId: "upstream-idem",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/imports/import-session-1/categories/SERVICE/selection",
        headers: browserMutation(owner),
        payload: { selected: true },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(upstream).toHaveLength(0);
    });
  },
);
