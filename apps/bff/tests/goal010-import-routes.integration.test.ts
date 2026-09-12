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
 * Rotas públicas da importação única do Minha Agenda (Goal010, WU-09) —
 * contra sessão real.
 *
 * O que é do BFF, e só aqui pode ser provado: o negócio sai da sessão
 * autenticada (header, body e query não escolhem tenant), toda mutação por
 * cookie exige CSRF antes de o Scheduling ser chamado, nenhuma rota aceita
 * `source`/`target` (a origem é sempre a integração já conectada) e o erro do
 * Scheduling chega ao cliente sem vazar detalhe de infraestrutura, segredo ou
 * payload cru de origem. A regra do ciclo de importação em si — preview,
 * conflitos, execução, lease, conclusão única — é provada nas suítes do
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

function startResultPayload(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "import-session-1",
    status: "DRAFT",
    created: true,
    replacedSessionId: null,
    ...overrides,
  };
}

function previewSummaryPayload(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "import-session-1",
    previewVersion: 1,
    generatedAt: "2026-09-10T12:00:00.000Z",
    categories: [
      {
        category: "SERVICE",
        sourceSupported: true,
        limitationCode: null,
        limitationDetail: null,
        sourceReportedCount: 3,
        readCount: 3,
        discoveredCount: 3,
        pendingCount: 3,
        needsReviewCount: 0,
        importedCount: 0,
        skippedCount: 0,
        failedCount: 0,
      },
    ],
    changesSincePreviousVersion: {
      newCount: 3,
      changedCount: 0,
      disappearedCount: 0,
    },
    ...overrides,
  };
}

function itemsPagePayload(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "import-session-1",
    category: "SERVICE",
    total: 1,
    limit: 50,
    offset: 0,
    items: [
      {
        id: "item-1",
        category: "SERVICE",
        externalId: "ext-1",
        label: "Corte",
        status: "PENDING",
        reasonCode: null,
        reasonDetail: null,
        entityType: null,
        internalId: null,
        attemptCount: 0,
        lastAttemptAt: null,
        processedAt: null,
        disappearedAt: null,
      },
    ],
    ...overrides,
  };
}

function decisionResponsePayload(overrides: Record<string, unknown> = {}) {
  return {
    item: {
      id: "item-1",
      category: "SERVICE",
      externalId: "ext-1",
      label: "Corte",
      status: "IMPORTED",
      reasonCode: "MERGED_BY_DECISION",
      reasonDetail: "Registro mesclado com um já cadastrado, por decisão explícita.",
      entityType: "SERVICE",
      internalId: "service-1",
      attemptCount: 0,
      lastAttemptAt: null,
      processedAt: "2026-09-10T12:05:00.000Z",
      disappearedAt: null,
    },
    decision: {
      id: "decision-1",
      scope: "ITEM",
      decision: "MERGE_WITH_EXISTING",
      category: "SERVICE",
      itemId: "item-1",
      externalId: "ext-1",
      targetInternalId: "service-1",
      noteCode: null,
      decidedBy: "user-1",
      decidedAt: "2026-09-10T12:05:00.000Z",
    },
    ...overrides,
  };
}

function executionResultPayload(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "import-session-1",
    previewVersion: 1,
    status: "READY",
    processed: 3,
    counts: { pending: 0, imported: 3, skipped: 0, failed: 0, needsReview: 0 },
    categories: [
      {
        category: "SERVICE",
        pending: 0,
        imported: 3,
        skipped: 0,
        failed: 0,
        needsReview: 0,
      },
    ],
    leaseOwner: "owner-1",
    leaseLost: false,
    ...overrides,
  };
}

function progressPayload(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "import-session-1",
    status: "READY",
    previewVersion: 1,
    startedAt: "2026-09-10T12:00:00.000Z",
    finishedAt: null,
    counts: { pending: 0, imported: 3, skipped: 0, failed: 0, needsReview: 0 },
    categories: [
      {
        category: "SERVICE",
        pending: 0,
        imported: 3,
        skipped: 0,
        failed: 0,
        needsReview: 0,
      },
    ],
    ...overrides,
  };
}

function completionResultPayload(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "import-session-1",
    provider: "MINHA_AGENDA",
    sourceAccountId: "account-1",
    sourceAccountLabel: null,
    status: "COMPLETED",
    completedAt: "2026-09-10T12:10:00.000Z",
    completedBy: "user-1",
    counts: { pending: 0, imported: 3, skipped: 0, failed: 0, needsReview: 0 },
    categories: [
      {
        category: "SERVICE",
        pending: 0,
        imported: 3,
        skipped: 0,
        failed: 0,
        needsReview: 0,
        discovered: 3,
        sourceSupported: true,
        limitationCode: null,
      },
    ],
    pendingAcceptance: null,
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

describe.skipIf(!RUN_INTEGRATION)("Goal010: rotas públicas da importação única", () => {
  it("abre a sessão de importação resolvendo o negócio pela sessão, ignorando header, body e query", async () => {
    const owner = await registerBusiness(app, "goal010-a");
    const other = await registerBusiness(app, "goal010-b");
    created.push(owner, other);
    stubScheduling(
      { data: startResultPayload(), requestId: "upstream-start" },
      201,
    );

    const response = await app.inject({
      method: "POST",
      url: `/v1/calendar/imports?tenantId=${other.tenantId}`,
      headers: {
        ...browserMutation(owner),
        "x-tenant-id": other.tenantId,
        "idempotency-key": "import-start-1",
      },
      payload: {
        sourceAccountId: "account-1",
        tenantId: other.tenantId,
        userId: other.userId,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ sessionId: "import-session-1" });
    expect(upstream).toHaveLength(1);
    expect(upstream[0].tenantId).toBe(owner.tenantId);
    expect(upstream[0].tenantId).not.toBe(other.tenantId);
    expect(upstream[0].idempotencyKey).toBe("import-start-1");
    // Nenhum campo de fonte/tenant escolhido pelo corpo chega ao Scheduling.
    const forwarded = JSON.parse(upstream[0].body ?? "{}");
    expect(forwarded.tenantId).toBeUndefined();
    expect(forwarded.userId).toBeUndefined();
    expect(forwarded.source).toBeUndefined();
    expect(forwarded.target).toBeUndefined();
  });

  it("analisa, lista itens paginados, decide, executa, lê progresso e conclui — todas resolvendo o negócio da sessão", async () => {
    const owner = created[0]!;

    stubScheduling(
      { data: previewSummaryPayload(), requestId: "upstream-analyze" },
    );
    const analyze = await app.inject({
      method: "POST",
      url: "/v1/calendar/imports/import-session-1/analyze",
      headers: { ...browserMutation(owner), "idempotency-key": "import-analyze-1" },
    });
    expect(analyze.statusCode).toBe(200);
    expect(analyze.json().data.categories).toHaveLength(1);
    // Resumo da análise não carrega os itens; a listagem é rota própria.
    expect(analyze.json().data.items).toBeUndefined();
    expect(upstream[0].tenantId).toBe(owner.tenantId);
    upstream.length = 0;

    stubScheduling({ data: itemsPagePayload(), requestId: "upstream-items" });
    const items = await app.inject({
      method: "GET",
      url: `/v1/calendar/imports/import-session-1/categories/SERVICE/items?limit=10&offset=0&tenantId=other-tenant`,
      headers: { ...browserRead(owner), "x-tenant-id": "other-tenant" },
    });
    expect(items.statusCode).toBe(200);
    expect(items.json().data.items).toHaveLength(1);
    expect(upstream[0].tenantId).toBe(owner.tenantId);
    upstream.length = 0;

    stubScheduling({ data: decisionResponsePayload(), requestId: "upstream-decision" });
    const decision = await app.inject({
      method: "POST",
      url: "/v1/calendar/imports/import-session-1/items/item-1/decision",
      headers: { ...browserMutation(owner), "idempotency-key": "import-decision-1" },
      payload: { decision: "MERGE_WITH_EXISTING", targetInternalId: "service-1" },
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json().data.item).toMatchObject({ status: "IMPORTED" });
    expect(upstream[0].idempotencyKey).toBe("import-decision-1");
    upstream.length = 0;

    stubScheduling({ data: executionResultPayload(), requestId: "upstream-execute" });
    const execute = await app.inject({
      method: "POST",
      url: "/v1/calendar/imports/import-session-1/execute",
      headers: { ...browserMutation(owner), "idempotency-key": "import-execute-1" },
      // A versao aprovada e obrigatoria no contrato publico: sem ela a rota
      // recusa antes de chegar ao Scheduling.
      payload: { previewVersion: 1, maxItems: 100 },
    });
    expect(execute.statusCode).toBe(200);
    expect(execute.json().data).toMatchObject({ status: "READY", processed: 3 });
    expect(upstream[0].idempotencyKey).toBe("import-execute-1");
    upstream.length = 0;

    stubScheduling({ data: progressPayload(), requestId: "upstream-progress" });
    const progress = await app.inject({
      method: "GET",
      url: "/v1/calendar/imports/import-session-1/progress",
      headers: browserRead(owner),
    });
    expect(progress.statusCode).toBe(200);
    expect(progress.json().data).toMatchObject({ status: "READY" });
    expect(upstream[0].tenantId).toBe(owner.tenantId);
    upstream.length = 0;

    stubScheduling({ data: completionResultPayload(), requestId: "upstream-complete" });
    const complete = await app.inject({
      method: "POST",
      url: "/v1/calendar/imports/import-session-1/complete",
      headers: { ...browserMutation(owner), "idempotency-key": "import-complete-1" },
      payload: { acceptPending: false },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().data).toMatchObject({ status: "COMPLETED" });
    expect(upstream[0].idempotencyKey).toBe("import-complete-1");
    expect(upstream[0].tenantId).toBe(owner.tenantId);
  });

  it("recusa por CSRF toda mutação da importação, antes de chamar o Scheduling", async () => {
    const owner = created[0]!;
    stubScheduling({ data: startResultPayload(), requestId: "upstream-csrf" }, 201);

    const mutations: Array<{
      method: "POST";
      url: string;
      payload?: Record<string, unknown>;
    }> = [
      {
        method: "POST",
        url: "/v1/calendar/imports",
        payload: { sourceAccountId: "account-1" },
      },
      { method: "POST", url: "/v1/calendar/imports/import-session-1/analyze" },
      {
        method: "POST",
        url: "/v1/calendar/imports/import-session-1/items/item-1/decision",
        payload: { decision: "EXCLUDE" },
      },
      { method: "POST", url: "/v1/calendar/imports/import-session-1/execute" },
      { method: "POST", url: "/v1/calendar/imports/import-session-1/complete" },
    ];

    for (const mutation of mutations) {
      const response = await app.inject({
        method: mutation.method,
        url: mutation.url,
        // Sessão válida por cookie, origem permitida, mas sem o token de CSRF
        // nem `Idempotency-Key` — a recusa por CSRF acontece primeiro.
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

  it("recusa mutação sem Idempotency-Key antes de chamar o Scheduling", async () => {
    const owner = created[0]!;
    stubScheduling({ data: startResultPayload(), requestId: "upstream-idem" }, 201);

    const response = await app.inject({
      method: "POST",
      url: "/v1/calendar/imports",
      headers: browserMutation(owner),
      payload: { sourceAccountId: "account-1" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(upstream).toHaveLength(0);
  });

  it("o erro do Scheduling chega ao cliente sem vazar detalhe de infraestrutura, segredo ou payload cru de origem", async () => {
    const owner = created[0]!;
    stubScheduling(
      {
        error: {
          code: "IMPORT_ALREADY_COMPLETED",
          message: "This business has already completed its single import; there is no second one.",
          details: { sessionId: "import-session-1", completedAt: "2026-09-01T00:00:00.000Z" },
        },
        requestId: "upstream-conflict",
      },
      409,
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/calendar/imports",
      headers: { ...browserMutation(owner), "idempotency-key": "import-start-conflict" },
      payload: { sourceAccountId: "account-1" },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.error).toMatchObject({
      code: "UPSTREAM_ERROR",
      details: {
        upstreamCode: "IMPORT_ALREADY_COMPLETED",
        upstreamDetails: { sessionId: "import-session-1" },
      },
    });
    // Sem credencial, cabeçalho interno ou payload cru de origem no corpo.
    expect(JSON.stringify(body)).not.toMatch(/basicAuth|password|authorization/i);
  });
});
