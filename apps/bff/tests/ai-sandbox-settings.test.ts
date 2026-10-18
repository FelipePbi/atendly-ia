import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  aiSandboxSettingsSchema,
  findPublicApiRoute,
  systemStatusSchema,
} from "@avenly-ia/public-api-contract";

/**
 * D-199 — modo sandbox da IA no BFF. Sem PostgreSQL e sem sessão real: o
 * tenant e o Prisma são dublês de módulo e a IA é um `fetch` dublê (como em
 * `goal139-ignored-contacts.test.ts`). Prova: o contrato encontra as duas
 * rotas; a leitura passa pelo contrato; a escrita normaliza e deduplica os
 * telefones antes da IA, recusa número inválido sem chamar a IA, registra a
 * atividade sem os telefones, projeta a configuração e repete quando a IA
 * ainda não a tem, e devolve o erro (nunca sucesso) quando a IA falha.
 */

const ROOT = "root-internal-secret-with-32-chars-min-199";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

vi.mock("../src/lib/tenant-context.js", () => ({
  requireTenantContext: async (request: FastifyRequest) => {
    request.tenantContext = {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "OWNER",
    };
  },
  currentTenantContext: (request: FastifyRequest) => request.tenantContext,
}));

const activity: Array<Record<string, unknown>> = [];
vi.mock("../src/lib/prisma.js", () => ({
  getPrisma: () => ({
    activityLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        activity.push(data);
        return data;
      },
    },
    aiSettings: {
      upsert: async () => ({ tenantId: "tenant-1", enabled: false, tone: "BALANCED" }),
    },
    businessProfile: {
      upsert: async () => ({
        tenantId: "tenant-1",
        businessName: "Studio",
        timezone: "America/Sao_Paulo",
        category: "Beleza",
        modalities: [],
        address: null,
        businessContextVersion: 1,
        businessContextProjectedVersion: 1,
      }),
      update: async () => ({}),
    },
  }),
}));

const { registerV1SettingsRoutes } = await import(
  "../src/modules/settings/routes.js"
);
const { registerResponseContractCheck } = await import(
  "../src/lib/response-contract.js"
);
const { AppError } = await import("../src/lib/errors.js");

interface UpstreamCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

const upstream: UpstreamCall[] = [];
let stored = {
  enabled: false,
  exceptionPhones: [] as string[],
  updatedAt: null as string | null,
};
let notProjectedOnce = false;
let failPut = false;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const text = request.method === "GET" ? null : await request.text();
      const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      upstream.push({ method: request.method, path: url.pathname, body });
      if (url.pathname === "/internal/ai-tenant-config") {
        return jsonResponse({ ok: true, config: {} });
      }
      if (url.pathname === "/internal/ai-sandbox" && request.method === "GET") {
        return jsonResponse({ data: stored, requestId: "up-get" });
      }
      if (url.pathname === "/internal/ai-sandbox" && request.method === "PUT") {
        if (failPut) {
          return jsonResponse(
            { ok: false, error: { code: "INTERNAL", message: "db down" } },
            500,
          );
        }
        if (notProjectedOnce) {
          notProjectedOnce = false;
          return jsonResponse(
            {
              ok: false,
              error: {
                code: "AI_TENANT_CONFIG_NOT_PROJECTED",
                message: "AI tenant config has not been projected yet.",
              },
            },
            409,
          );
        }
        stored = {
          enabled: (body?.enabled as boolean | undefined) ?? stored.enabled,
          exceptionPhones:
            (body?.exceptionPhones as string[] | undefined) ??
            stored.exceptionPhones,
          updatedAt: "2026-10-18T12:00:00.000Z",
        };
        return jsonResponse({
          // A IA pode mandar campo a mais; o contrato publico nao o declara.
          data: { ...stored, internalOnly: true },
          requestId: "up-put",
        });
      }
      return jsonResponse({ error: "unexpected" }, 404);
    }),
  );
}

let app: FastifyInstance;

beforeEach(async () => {
  upstream.length = 0;
  activity.length = 0;
  stored = { enabled: false, exceptionPhones: [], updatedAt: null };
  notProjectedOnce = false;
  failPut = false;
  stubUpstream();
  app = Fastify({ logger: false });
  // O mesmo envelope de erro de `app.ts`, para a prova ler o `code`.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
        requestId: request.id,
      });
    }
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR" } });
  });
  registerResponseContractCheck(app);
  await registerV1SettingsRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const patch = (payload: unknown) =>
  app.inject({ method: "PATCH", url: "/v1/settings/ai/sandbox", payload });

describe("D-199: contrato do modo sandbox", () => {
  it("as duas rotas existem no contrato com o schema do sandbox", () => {
    expect(findPublicApiRoute("GET", "/v1/settings/ai/sandbox")?.schema).toBe(
      aiSandboxSettingsSchema,
    );
    expect(findPublicApiRoute("PATCH", "/v1/settings/ai/sandbox")?.schema).toBe(
      aiSandboxSettingsSchema,
    );
  });

  it("o schema recusa telefone fora do formato canonico", () => {
    expect(() =>
      aiSandboxSettingsSchema.parse({
        enabled: true,
        exceptionPhones: ["(11) 91234-5678"],
        updatedAt: null,
      }),
    ).toThrow();
  });

  it("status: sandboxEnabled e opcional e anulavel (resposta antiga continua valida)", () => {
    const base = {
      whatsapp: { status: "CONNECTED", phoneNumber: null, checkedAt: "x" },
      ai: {
        desiredEnabled: true,
        effectiveEnabled: true,
        state: "ACTIVE",
        reconciled: "NOOP",
      },
      accountDeletion: { status: "NONE", dueAt: null },
      degraded: false,
    };
    expect(systemStatusSchema.parse(base).ai.sandboxEnabled).toBeUndefined();
    expect(
      systemStatusSchema.parse({ ...base, ai: { ...base.ai, sandboxEnabled: null } })
        .ai.sandboxEnabled,
    ).toBeNull();
    expect(
      systemStatusSchema.parse({ ...base, ai: { ...base.ai, sandboxEnabled: true } })
        .ai.sandboxEnabled,
    ).toBe(true);
  });
});

describe("D-199: GET/PATCH /v1/settings/ai/sandbox", () => {
  it("GET devolve o estado da IA, pelo contrato", async () => {
    stored = {
      enabled: true,
      exceptionPhones: ["5511912345678"],
      updatedAt: "2026-10-18T12:00:00.000Z",
    };

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings/ai/sandbox",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(stored);
  });

  it("PATCH normaliza e deduplica os telefones antes da IA e registra a atividade sem eles", async () => {
    const response = await patch({
      enabled: true,
      exceptionPhones: ["(11) 91234-5678", "+55 11 1234-5678", "21 99999-0000"],
    });

    expect(response.statusCode).toBe(200);
    const put = upstream.find(
      (call) => call.method === "PUT" && call.path === "/internal/ai-sandbox",
    );
    expect(put?.body).toEqual({
      enabled: true,
      exceptionPhones: ["5511912345678", "5521999990000"],
    });
    // Sem a chave interna que a IA mandou a mais.
    expect(response.json().data).toEqual({
      enabled: true,
      exceptionPhones: ["5511912345678", "5521999990000"],
      updatedAt: "2026-10-18T12:00:00.000Z",
    });
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      action: "settings.ai_sandbox_enabled",
      area: "SETTINGS",
    });
    expect(JSON.stringify(activity[0])).not.toContain("912345678");
    // O numero entra mascarado: DDD e os quatro ultimos digitos (D-200).
    expect(activity[0]?.changes).toEqual([
      { field: "enabled", before: false, after: true },
      {
        field: "exceptionPhones",
        before: null,
        after: "+55 11 •••••-5678, +55 21 •••••-0000",
      },
    ]);
  });

  it("PATCH so com a lista mantem o ligado e registra a alteracao da lista", async () => {
    stored = { enabled: true, exceptionPhones: [], updatedAt: null };

    const response = await patch({ exceptionPhones: ["11912345678"] });

    expect(response.statusCode).toBe(200);
    const put = upstream.find((call) => call.method === "PUT");
    expect(put?.body).toEqual({ exceptionPhones: ["5511912345678"] });
    expect(activity[0]).toMatchObject({
      action: "settings.ai_sandbox_updated",
      changes: [
        { field: "exceptionPhones", before: null, after: "+55 11 •••••-5678" },
      ],
    });
  });

  it("PATCH desligando registra settings.ai_sandbox_disabled", async () => {
    stored = { enabled: true, exceptionPhones: [], updatedAt: null };

    await patch({ enabled: false });

    expect(activity[0]).toMatchObject({ action: "settings.ai_sandbox_disabled" });
  });

  it("PATCH com numero invalido e 400 e a IA nao e chamada", async () => {
    const response = await patch({ exceptionPhones: ["(00) 1234-5678"] });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(upstream).toHaveLength(0);
    expect(activity).toHaveLength(0);
  });

  it("PATCH com campo desconhecido e 400", async () => {
    const response = await patch({ enabled: true, extra: 1 });
    expect(response.statusCode).toBe(400);
    expect(upstream).toHaveLength(0);
  });

  it("PATCH com mais de 20 excecoes e 400", async () => {
    const phones = Array.from({ length: 21 }, (_, i) => `119${String(10000000 + i)}`);
    const response = await patch({ exceptionPhones: phones });
    expect(response.statusCode).toBe(400);
    expect(upstream).toHaveLength(0);
  });

  it("negocio ainda sem configuracao na IA: projeta e repete uma vez", async () => {
    notProjectedOnce = true;

    const response = await patch({ enabled: true });

    expect(response.statusCode).toBe(200);
    expect(upstream.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /internal/ai-sandbox",
      "PUT /internal/ai-sandbox",
      "PUT /internal/ai-tenant-config",
      "PUT /internal/ai-sandbox",
    ]);
    expect(response.json().data.enabled).toBe(true);
  });

  it("falha da IA ao gravar e erro, nunca sucesso, e nada vai para a atividade", async () => {
    failPut = true;

    const response = await patch({ enabled: true });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(activity).toHaveLength(0);
  });
});
