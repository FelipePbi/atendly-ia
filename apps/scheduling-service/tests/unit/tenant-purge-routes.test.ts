import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

/**
 * Goal025/WU-06 — `POST /internal/retention/tenant`, a purga do negocio
 * inteiro no Scheduling.
 *
 * Sem banco real: a prova de que a purga atravessa as 27 tabelas e nunca
 * toca o negocio vizinho fica em
 * `tests/integration/goal025-tenant-purge.test.ts`. Esta suite prova a
 * fronteira da rota — o que ela recusa antes de qualquer efeito, e o formato
 * da resposta.
 */
function fakePrisma(): PrismaClient {
  return {
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
  } as never;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await registerManagementRoutes(app, fakePrisma());
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        requestId: request.id,
      });
    }
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: (error as Error).message },
      requestId: request.id,
    });
  });
  return app;
}

const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

function headers(tenantId = "tenant-a") {
  return {
    authorization: `Bearer ${bffToken}`,
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
    "x-request-id": "req-1",
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
        authorization: `Bearer ${bffToken}`,
        "x-request-id": "req-1",
      },
      payload: { maxRows: 100 },
    });
    expect(response.statusCode).toBe(400);
  });

  it("recusa sem credencial interna valida", async () => {
    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/internal/retention/tenant",
      headers: { ...headers(), authorization: "Bearer not-a-valid-token" },
      payload: { maxRows: 100 },
    });
    expect(response.statusCode).toBe(401);
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
    expect(data.deleted.Appointment).toBe(0);
    expect(data.deleted.CalendarSettings).toBe(0);
  });
});
