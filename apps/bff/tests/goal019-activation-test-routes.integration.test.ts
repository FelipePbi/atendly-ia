import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
 * Goal019/WU-05 — contrato público do teste real no BFF.
 *
 * O que é do BFF, provado aqui: tenant da sessão e CSRF nas rotas de escrita,
 * a única recusa própria do BFF (IA já ativa, avaliada antes de chamar a IA),
 * cada recusa da IA repassada com o código original (nunca um `500`
 * genérico), e nenhuma rota fabricando progresso quando a leitura upstream
 * falha. A regra de negócio da execução em si é provada nas suítes da IA.
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

function activationTestRunPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    state: "RUNNING",
    terminal: false,
    startedAt: "2026-09-14T12:00:00.000Z",
    finishedAt: null,
    pausedAt: null,
    currentStep: "TEST_NOTICE",
    completedStep: null,
    attempts: 0,
    maxAttempts: 3,
    failedStep: null,
    failedStepLabel: null,
    failureCode: null,
    appointmentId: null,
    // Vínculo do teste e estado da limpeza: o contrato público os expõe, então
    // o dublê os devolve. Execução recém-criada nunca está superada e ainda
    // não limpou nada — `PENDING` não é "limpou e deu certo".
    channelId: "channel-1",
    supersededByChannelChange: false,
    cleanupState: "PENDING",
    cleanupAt: null,
    cleanupResidue: [],
    milestones: [
      { milestone: "MESSAGE_SENT", reached: false, reachedAt: null, sourceKind: null, sourceId: null },
      { milestone: "SERVICE_IDENTIFIED", reached: false, reachedAt: null, sourceKind: null, sourceId: null },
      { milestone: "PRICE_INFORMED", reached: false, reachedAt: null, sourceKind: null, sourceId: null },
      { milestone: "AVAILABILITY_CHECKED", reached: false, reachedAt: null, sourceKind: null, sourceId: null },
      { milestone: "SLOT_SELECTED", reached: false, reachedAt: null, sourceKind: null, sourceId: null },
      { milestone: "APPOINTMENT_CONFIRMED", reached: false, reachedAt: null, sourceKind: null, sourceId: null },
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Dublê HTTP da IA. Ausência de handler é erro de teste, não `200` silencioso. */
function stubUpstream(
  respond: (call: UpstreamCall) => { status: number; body: unknown },
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const bodyText =
        request.method === "GET" ? null : await request.text();
      const call: UpstreamCall = {
        method: request.method,
        path: url.pathname,
        tenantId: request.headers.get("x-tenant-id"),
        body: bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null,
      };
      upstream.push(call);
      const { status, body } = respond(call);
      return jsonResponse(body, status);
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

describe.skipIf(!RUN_INTEGRATION)("Goal019/WU-05: contrato público do teste real", () => {
  it("GET /v1/activation-test devolve null quando o negócio nunca testou", async () => {
    const owner = await business("read-null");
    stubUpstream((call) => {
      if (call.path === "/internal/activation-test" && call.method === "GET") {
        return { status: 200, body: { data: null, requestId: "up-1" } };
      }
      throw new Error(`unexpected upstream call: ${call.method} ${call.path}`);
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/activation-test",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toBeNull();
  });

  it("GET /v1/activation-test repassa o estado real, sem inventar progresso quando a leitura falha", async () => {
    const owner = await business("read-fail");
    stubUpstream((call) => {
      if (call.path === "/internal/activation-test" && call.method === "GET") {
        return {
          status: 500,
          body: { error: "boom" },
        };
      }
      throw new Error(`unexpected upstream call: ${call.method} ${call.path}`);
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/activation-test",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("UPSTREAM_ERROR");
    expect(response.json().data).toBeUndefined();
  });

  it("POST /v1/activation-test inicia o teste e repassa o 202 e a execução da IA", async () => {
    const owner = await business("start-ok");
    stubUpstream((call) => {
      if (call.path === "/internal/activation-test" && call.method === "POST") {
        expect(call.body).toEqual({ tenantPhone: "5511988887777" });
        return {
          status: 202,
          body: { data: activationTestRunPayload(), requestId: "up-2" },
        };
      }
      throw new Error(`unexpected upstream call: ${call.method} ${call.path}`);
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/activation-test",
      headers: browserMutation(owner),
      payload: { tenantPhone: "5511988887777" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().data.id).toBe("run-1");
    expect(response.json().data.state).toBe("RUNNING");
    expect(response.json().data.milestones).toHaveLength(6);
  });

  it("POST /v1/activation-test/restart descarta a pausada e repassa a execução nova", async () => {
    const owner = await business("restart-ok");
    stubUpstream((call) => {
      if (
        call.path === "/internal/activation-test/restart" &&
        call.method === "POST"
      ) {
        return {
          status: 202,
          body: {
            data: activationTestRunPayload({ id: "run-2" }),
            requestId: "up-3",
          },
        };
      }
      throw new Error(`unexpected upstream call: ${call.method} ${call.path}`);
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/activation-test/restart",
      headers: browserMutation(owner),
      payload: { tenantPhone: "5511988887777" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().data.id).toBe("run-2");
  });

  it("recusa iniciar com ACTIVATION_TEST_AI_ALREADY_ACTIVE quando a IA já está ativa, sem chamar a IA", async () => {
    const owner = await business("ai-active");
    await getPrisma().aiSettings.upsert({
      where: { tenantId: owner.tenantId },
      create: { tenantId: owner.tenantId, enabled: true },
      update: { enabled: true },
    });
    stubUpstream(() => {
      throw new Error("upstream should not be called with the AI already active");
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/activation-test",
      headers: browserMutation(owner),
      payload: { tenantPhone: "5511988887777" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("ACTIVATION_TEST_AI_ALREADY_ACTIVE");
    expect(upstream).toHaveLength(0);
  });

  it.each([
    { code: "PLATFORM_NUMBER_NOT_CONFIGURED", upstreamStatus: 503, expectedStatus: 502 },
    { code: "ACTIVATION_TEST_WHATSAPP_NOT_CONNECTED", upstreamStatus: 409, expectedStatus: 409 },
    { code: "ACTIVATION_TEST_TENANT_PHONE_UNKNOWN", upstreamStatus: 409, expectedStatus: 409 },
    { code: "ACTIVATION_TEST_NO_ELIGIBLE_SERVICE", upstreamStatus: 409, expectedStatus: 409 },
    { code: "ACTIVATION_TEST_NO_AVAILABILITY", upstreamStatus: 409, expectedStatus: 409 },
    { code: "ACTIVATION_TEST_ALREADY_RUNNING", upstreamStatus: 409, expectedStatus: 409 },
  ])(
    "repassa a recusa nomeada $code da IA como UPSTREAM_ERROR com status $expectedStatus",
    async ({ code, upstreamStatus, expectedStatus }) => {
      const owner = await business(`refusal-${code.toLowerCase()}`);
      stubUpstream((call) => {
        if (call.path === "/internal/activation-test" && call.method === "POST") {
          return {
            status: upstreamStatus,
            body: {
              error: { code, message: `Refused: ${code}` },
              requestId: "upstream-refusal",
            },
          };
        }
        throw new Error(`unexpected upstream call: ${call.method} ${call.path}`);
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/activation-test",
        headers: browserMutation(owner),
        payload: { tenantPhone: "5511988887777" },
      });

      expect(response.statusCode).toBe(expectedStatus);
      expect(response.json().error.code).toBe("UPSTREAM_ERROR");
      expect(response.json().error.details.upstreamCode).toBe(code);

      assertDocumentsRefusal(code, expectedStatus);
    },
  );

  it("recusa POST /v1/activation-test por cookie sem CSRF, antes de chamar a IA", async () => {
    const owner = await business("csrf");
    stubUpstream(() => {
      throw new Error("upstream should not be called without CSRF");
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/activation-test",
      headers: browserRead(owner),
      payload: { tenantPhone: "5511988887777" },
    });

    expect(response.statusCode).toBe(403);
    expect(upstream).toHaveLength(0);
  });
});

/**
 * `PUBLIC_API_V1.md` nomeia cada recusa junto do `error.statusCode` que ela
 * produz. Este teste falha se o código ou o status mudarem no comportamento
 * (acima) sem o documento acompanhar — ele lê o arquivo publicado, não uma
 * cópia congelada.
 */
const publicApiDoc = readFileSync(
  fileURLToPath(new URL("../PUBLIC_API_V1.md", import.meta.url)),
  "utf8",
);

function assertDocumentsRefusal(code: string, status: number): void {
  const rows = publicApiDoc
    .split("\n")
    .filter((row) => row.trimStart().startsWith(`| \`${code}\``));
  expect(rows, `PUBLIC_API_V1.md has no table row for \`${code}\``).toHaveLength(1);
  expect(
    rows[0],
    `PUBLIC_API_V1.md row for \`${code}\` does not mention status ${status}`,
  ).toContain(String(status));
}

describe("Goal019/WU-05: PUBLIC_API_V1.md nomeia a recusa própria do BFF", () => {
  it("documenta ACTIVATION_TEST_AI_ALREADY_ACTIVE com status 409", () => {
    assertDocumentsRefusal("ACTIVATION_TEST_AI_ALREADY_ACTIVE", 409);
  });

  it("documenta as três rotas novas", () => {
    expect(publicApiDoc).toContain("GET /v1/activation-test");
    expect(publicApiDoc).toContain("POST /v1/activation-test");
    expect(publicApiDoc).toContain("POST /v1/activation-test/restart");
  });
});
