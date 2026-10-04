/**
 * Reescopo dos endpoints de integração para o ciclo da importação (Goal010,
 * §6), agora com o corpo de e-mail e senha do Goal060 (§2).
 *
 * O que está em prova aqui é **alcançabilidade**: depois do corte do writer
 * remoto todo negócio opera na Agenda Avenly, e era exatamente isso que o
 * `connect` recusava. Sem esta correção, nenhum negócio conseguiria conectar
 * a origem — e sem `IntegrationConnection` nenhuma sessão de importação
 * começa, o que deixaria o ciclo novo inteiro inalcançável na fiação real.
 *
 * A origem é sempre um dublê de `fetch` (Goal060): o login e a descoberta do
 * profissional são cobertos em detalhe por
 * `goal060-minha-agenda-connection.test.ts`; aqui o que interessa provar é o
 * efeito no banco e a porta aberta para a importação.
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

type Database = ReturnType<typeof createDatabaseDouble>;

const tenantId = "tenant-a";
const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

const connectPayload = {
  email: "dono@example.com",
  password: "super-secret-password",
};

function headers(extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${bffToken}`,
    "x-tenant-id": tenantId,
    "x-user-id": "professional-1",
    "x-request-id": "req-1",
    "content-type": "application/json",
    ...extra,
  };
}

/** O negócio que o corte produziu: agenda operacional é a Avenly. */
function seedAvenlyCalendar(db: Database) {
  db.client.calendarSettings.rows.push({
    id: "settings-1",
    tenantId,
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  } as never);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function tokenResponse(): Response {
  return jsonResponse({
    access_token: "tok-123",
    token_type: "bearer",
    expires_in: 3_600,
  });
}

function professionalsResponse(ids: number[]): Response {
  return jsonResponse(ids.map((id) => ({ id })));
}

async function buildTestApp(client: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify();
  await registerManagementRoutes(app, client);
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

describe("integração Minha Agenda reescopada para a importação (Goal010 §6, Goal060 §2)", () => {
  let db: Database;
  let app: FastifyInstance;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = createDatabaseDouble();
    app = await buildTestApp(db.client as unknown as PrismaClient);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  it("conecta a origem com a agenda operacional na Avenly e abre caminho para a importação", async () => {
    seedAvenlyCalendar(db);
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(professionalsResponse([42]));

    const connected = await app.inject({
      method: "POST",
      url: "/internal/calendar/integration/connect",
      headers: headers(),
      payload: connectPayload,
    });

    expect(connected.statusCode).toBe(200);
    // A agenda operacional não muda de fonte por conectar a origem.
    expect(connected.json().data).toMatchObject({
      source: "AVENLY",
      integration: { status: "CONNECTED" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const stored = db.client.integrationConnection.rows[0];
    expect(stored).toMatchObject({ tenantId, provider: "MINHA_AGENDA" });
    // O profissional descoberto é gravado, e nada mais (Goal060 §1/§2).
    expect(stored.config).toEqual({ employeeId: 42 });
    // Segredo guardado cifrado: nunca em texto puro na linha.
    expect(JSON.stringify(stored.config)).not.toContain(connectPayload.email);
    expect(JSON.stringify(stored.config)).not.toContain(
      connectPayload.password,
    );

    // É esta a ponta que estava quebrada: com a conexão gravada, a sessão de
    // importação começa de verdade.
    const session = await app.inject({
      method: "POST",
      url: "/internal/calendar/imports",
      headers: headers({ "idempotency-key": "start-1" }),
      payload: { sourceAccountId: "account-1" },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json().data).toMatchObject({ status: "DRAFT" });
    expect(db.client.importSession.rows[0]).toMatchObject({
      sourceAccountId: "account-1",
      connectionId: stored.id,
    });
    expect(db.client.importSession.rows).toHaveLength(1);
  });

  it("desconectar a origem não desativa a agenda operacional", async () => {
    seedAvenlyCalendar(db);
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(professionalsResponse([1]));
    await app.inject({
      method: "POST",
      url: "/internal/calendar/integration/connect",
      headers: headers(),
      payload: connectPayload,
    });

    const { "content-type": _contentType, ...deleteHeaders } = headers();
    const response = await app.inject({
      method: "DELETE",
      url: "/internal/calendar/integration",
      headers: deleteHeaders,
    });

    expect(response.json().error ?? null).toBeNull();
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      source: "AVENLY",
      integration: null,
      capabilities: { createAppointments: true, manageServices: true },
    });
    expect(db.client.integrationConnection.rows).toHaveLength(0);
    // A agenda do negócio continua lá, com a mesma fonte e o mesmo fuso.
    expect(db.client.calendarSettings.rows[0]).toMatchObject({
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    });
  });
});
