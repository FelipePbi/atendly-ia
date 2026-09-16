import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes, requiredScope }, { expectedToken }] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
  ]);

/**
 * Goal025/WU-05 — `POST /internal/retention/tenant`, a purga do negocio
 * inteiro na IA.
 *
 * Sem banco real: a prova de que a purga atravessa as 16 tabelas e nunca
 * toca o negocio vizinho fica em `tests/retention/tenant-purge.test.ts`. Esta
 * suite prova a fronteira da rota — o que ela recusa antes de qualquer
 * efeito, e o formato da resposta.
 */
function fakePrisma() {
  return {
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
  } as never;
}

async function buildApp() {
  const app = Fastify();
  await registerInternalRoutes(app, fakePrisma());
  return app;
}

function headers(tenantId = "tenant-a") {
  return {
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

describe("POST /internal/retention/tenant", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("recusa corpo sem maxRows", async () => {
    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/internal/retention/tenant",
      headers: headers(),
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("recusa lista de negocios no corpo", async () => {
    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/internal/retention/tenant",
      headers: headers(),
      payload: { maxRows: 100, tenantIds: ["tenant-a", "tenant-b"] },
    });
    expect(response.statusCode).toBe(400);
  });

  it("recusa qualquer forma declarada de apagar tudo", async () => {
    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/internal/retention/tenant",
      headers: headers(),
      payload: { maxRows: 100, all: true },
    });
    expect(response.statusCode).toBe(400);
  });

  it("recusa teto acima do limite maximo permitido", async () => {
    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/internal/retention/tenant",
      headers: headers(),
      payload: { maxRows: 999_999 },
    });
    expect(response.statusCode).toBe(400);
  });

  it("recusa sem contexto de tenant no cabecalho", async () => {
    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/internal/retention/tenant",
      headers: {
        authorization: `Bearer ${expectedToken("command")}`,
        "x-service-audience": "ai-orchestrator",
      },
      payload: { maxRows: 100 },
    });
    expect(response.statusCode).toBe(400);
  });

  it("devolve zero linhas, por tabela, quando o negocio nao tem nada a apagar", async () => {
    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/internal/retention/tenant",
      headers: headers(),
      payload: { maxRows: 500 },
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.totalDeleted).toBe(0);
    expect(data.hasMore).toBe(false);
    expect(data.deleted.ChannelConnection).toBe(0);
    expect(data.deleted.AiTenantConfig).toBe(0);
  });

  it("exige o escopo proprio de purga do negocio", () => {
    expect(
      requiredScope({
        method: "POST",
        url: "/internal/retention/tenant",
      } as never),
    ).toBe("tenant:purge");
  });
});
