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
 * Contrato público do início assíncrono da importação (Goal061, WU-03) —
 * contra sessão real.
 *
 * O que é do BFF e só aqui pode ser provado: `analyze`/`execute` repassam o
 * `202` que o Scheduling responde, sem apresentá-lo como concluído; a leitura
 * nova do preview resolve o negócio pela sessão; e a recusa por lease vivo
 * chega ao cliente como `UPSTREAM_ERROR` com `details.upstreamCode`, no mesmo
 * mecanismo genérico do proxy interno. O trabalho em si — lease, fencing,
 * retomada — é provado nas suítes do Scheduling; aqui ele é um dobro HTTP.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  url: string;
  tenantId: string | null;
  idempotencyKey: string | null;
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
      });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function workStartPayload(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "import-session-1",
    status: "ANALYZING",
    previewVersion: 1,
    ...overrides,
  };
}

function previewSnapshotPayload(overrides: Record<string, unknown> = {}) {
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
  "Goal061: início assíncrono, leitura do preview e recusa por lease",
  () => {
    it("repassa o 202 de analyze sem apresentá-lo como concluído", async () => {
      const owner = await registerBusiness(app, "goal061-async-a");
      created.push(owner);
      stubScheduling(
        { data: workStartPayload({ status: "ANALYZING" }), requestId: "upstream-analyze" },
        202,
      );

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/imports/import-session-1/analyze",
        headers: { ...browserMutation(owner), "idempotency-key": "goal061-analyze-1" },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json().data).toEqual({
        sessionId: "import-session-1",
        status: "ANALYZING",
        previewVersion: 1,
      });
      expect(upstream[0].tenantId).toBe(owner.tenantId);
      expect(upstream[0].idempotencyKey).toBe("goal061-analyze-1");
    });

    it("repassa o 202 de execute sem apresentá-lo como concluído", async () => {
      const owner = created[0]!;
      stubScheduling(
        { data: workStartPayload({ status: "EXECUTING" }), requestId: "upstream-execute" },
        202,
      );

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/imports/import-session-1/execute",
        headers: { ...browserMutation(owner), "idempotency-key": "goal061-execute-1" },
        payload: { previewVersion: 1 },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json().data).toEqual({
        sessionId: "import-session-1",
        status: "EXECUTING",
        previewVersion: 1,
      });
    });

    it("lê o preview gravado resolvendo o negócio pela sessão, sem Idempotency-Key", async () => {
      const owner = created[0]!;
      const other = await registerBusiness(app, "goal061-async-b");
      created.push(other);
      stubScheduling(
        { data: previewSnapshotPayload(), requestId: "upstream-preview" },
      );

      const response = await app.inject({
        method: "GET",
        url: `/v1/calendar/imports/import-session-1/preview?tenantId=${other.tenantId}`,
        headers: { ...browserRead(owner), "x-tenant-id": other.tenantId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        sessionId: "import-session-1",
        previewVersion: 1,
        categories: [expect.objectContaining({ category: "SERVICE" })],
      });
      expect(upstream[0].tenantId).toBe(owner.tenantId);
      expect(upstream[0].tenantId).not.toBe(other.tenantId);
    });

    it("recusa a leitura do preview sem sessão", async () => {
      stubScheduling({ data: previewSnapshotPayload(), requestId: "upstream-preview-anon" });

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar/imports/import-session-1/preview",
      });

      expect(response.statusCode).toBe(401);
      expect(upstream).toHaveLength(0);
    });

    it("IMPORT_SESSION_LEASE_HELD chega como UPSTREAM_ERROR com details.upstreamCode", async () => {
      const owner = created[0]!;
      stubScheduling(
        {
          error: {
            code: "IMPORT_SESSION_LEASE_HELD",
            message: "Import session cannot be analyzed while in status EXECUTING.",
            details: { status: "EXECUTING" },
          },
          requestId: "upstream-lease-held",
        },
        409,
      );

      const response = await app.inject({
        method: "POST",
        url: "/v1/calendar/imports/import-session-1/analyze",
        headers: { ...browserMutation(owner), "idempotency-key": "goal061-lease-held-1" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toMatchObject({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode: "IMPORT_SESSION_LEASE_HELD" },
      });
    });

    it("recusa por CSRF o início de analyze/execute antes de chamar o Scheduling", async () => {
      const owner = created[0]!;
      stubScheduling({ data: workStartPayload(), requestId: "upstream-csrf" }, 202);

      for (const url of [
        "/v1/calendar/imports/import-session-1/analyze",
        "/v1/calendar/imports/import-session-1/execute",
      ]) {
        const response = await app.inject({
          method: "POST",
          url,
          headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
          payload: {},
        });
        expect({ url, status: response.statusCode }).toEqual({ url, status: 403 });
        expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
      }
      expect(upstream).toHaveLength(0);
    });
  },
);
