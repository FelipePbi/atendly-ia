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
 * Goal067, WU-01 — leitura de "Outras informações importantes" por
 * `GET /v1/knowledge/other-info`, com a IA como dublê HTTP.
 *
 * O que é do BFF, provado aqui: tenant da sessão em cada chamada, e o corpo
 * que `GET /v1/knowledge/other-info` devolve é exatamente o que
 * `PUT /v1/knowledge/other-info` gravou, sem reescrita.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  tenantId: string | null;
  body: Record<string, unknown> | null;
}

const upstream: UpstreamCall[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Dublê HTTP da IA que mantém, por tenant, o texto salvo pelo `PUT` mais
 * recente — a mesma verdade que `GET` precisa devolver.
 */
function stubUpstreamOtherInfo() {
  const contentByTenant = new Map<string, string>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const bodyText =
        request.method === "GET" || request.method === "DELETE"
          ? null
          : await request.text();
      const tenantId = request.headers.get("x-tenant-id");
      const call: UpstreamCall = {
        method: request.method,
        path: url.pathname,
        tenantId,
        body: bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null,
      };
      upstream.push(call);

      if (call.path !== "/internal/knowledge/other-info") {
        throw new Error(`unexpected upstream call: ${call.method} ${call.path}`);
      }
      if (call.method === "PUT") {
        const content = String((call.body as { content: string }).content);
        contentByTenant.set(tenantId ?? "", content);
        return jsonResponse({
          data: {
            id: "document-other-info",
            type: "BUSINESS_INFO",
            serviceId: null,
            title: "Outras informações importantes",
            source: "business-info/other-important-information",
            version: "1",
            checksum: "checksum-1",
            status: "ACTIVE",
            createdAt: "2026-09-28T12:00:00.000Z",
            updatedAt: "2026-09-28T12:00:00.000Z",
          },
          requestId: "up-put",
        });
      }
      if (call.method === "GET") {
        return jsonResponse({
          data: { content: contentByTenant.get(tenantId ?? "") ?? "" },
          requestId: "up-get",
        });
      }
      throw new Error(`unexpected upstream call: ${call.method} ${call.path}`);
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
  upstream.length = 0;
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("Goal067/WU-01: leitura de outras informações importantes", () => {
  it("GET /v1/knowledge/other-info devolve o que PUT gravou", async () => {
    const owner = await business("other-info-read");
    stubUpstreamOtherInfo();

    const write = await app.inject({
      method: "PUT",
      url: "/v1/knowledge/other-info",
      headers: browserMutation(owner),
      payload: { content: "Aceitamos pets na sala de espera." },
    });
    expect(write.statusCode).toBe(200);

    const read = await app.inject({
      method: "GET",
      url: "/v1/knowledge/other-info",
      headers: browserRead(owner),
    });

    expect(read.statusCode).toBe(200);
    expect(read.json().data).toEqual({
      content: "Aceitamos pets na sala de espera.",
    });
  });

  it("GET /v1/knowledge/other-info devolve vazio quando o negócio nunca salvou nada", async () => {
    const owner = await business("other-info-empty");
    stubUpstreamOtherInfo();

    const read = await app.inject({
      method: "GET",
      url: "/v1/knowledge/other-info",
      headers: browserRead(owner),
    });

    expect(read.statusCode).toBe(200);
    expect(read.json().data).toEqual({ content: "" });
  });
});
