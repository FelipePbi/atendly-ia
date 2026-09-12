/**
 * Reescopo dos endpoints de integração para o ciclo da importação (Goal010,
 * §6).
 *
 * O que está em prova aqui é **alcançabilidade**: depois do corte do writer
 * remoto todo negócio opera na Agenda Atendly, e era exatamente isso que o
 * `connect` recusava. Sem esta correção, nenhum negócio conseguiria conectar
 * a origem — e sem `IntegrationConnection` nenhuma sessão de importação
 * começa, o que deixaria o ciclo novo inteiro inalcançável na fiação real.
 *
 * A rede da origem é a única coisa dublada: `listServices()` é o teste de
 * credencial do `connect`, e o que interessa provar é o efeito no banco e a
 * porta aberta para a importação, não o HTTP do Minha Agenda (coberto em
 * `minha-agenda-client.test.ts`).
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

const origin = vi.hoisted(() => ({ credentialChecks: [] as unknown[] }));

vi.mock("../../src/modules/integrations/minha-agenda/provider.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/modules/integrations/minha-agenda/provider.js")
  >("../../src/modules/integrations/minha-agenda/provider.js");
  return {
    ...actual,
    MinhaAgendaCalendarProvider: class {
      constructor(private readonly config: { tenantId: string }) {}
      async listServices() {
        origin.credentialChecks.push(this.config);
        return [];
      }
    },
  };
});

type Database = ReturnType<typeof createDatabaseDouble>;

const tenantId = "tenant-a";
const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

const connectPayload = {
  credentials: {
    basicAuth: "super-secret-basic-auth",
    username: "minha-agenda-user",
    password: "super-secret-password",
  },
  configuration: {
    baseUrl: "https://minha-agenda.example.com",
    employeeId: 1,
    paymentMethod: "cash",
  },
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

/** O negócio que o corte produziu: agenda operacional é a Atendly. */
function seedAtendlyCalendar(db: Database) {
  db.client.calendarSettings.rows.push({
    id: "settings-1",
    tenantId,
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
  } as never);
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

describe("integração Minha Agenda reescopada para a importação (Goal010 §6)", () => {
  let db: Database;
  let app: FastifyInstance;

  beforeEach(async () => {
    origin.credentialChecks.length = 0;
    db = createDatabaseDouble();
    app = await buildTestApp(db.client as unknown as PrismaClient);
  });

  afterEach(async () => {
    await app.close();
  });

  it("conecta a origem com a agenda operacional na Atendly e abre caminho para a importação", async () => {
    seedAtendlyCalendar(db);

    const connected = await app.inject({
      method: "POST",
      url: "/internal/calendar/integration/connect",
      headers: headers(),
      payload: connectPayload,
    });

    expect(connected.statusCode).toBe(200);
    // A agenda operacional não muda de fonte por conectar a origem.
    expect(connected.json().data).toMatchObject({
      source: "ATENDLY",
      integration: { status: "CONNECTED" },
    });
    expect(origin.credentialChecks).toHaveLength(1);
    const stored = db.client.integrationConnection.rows[0];
    expect(stored).toMatchObject({ tenantId, provider: "MINHA_AGENDA" });
    // Segredo guardado cifrado: nunca em texto puro na linha.
    expect(JSON.stringify(stored.config)).not.toContain(
      connectPayload.credentials.password,
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

  it("recusa guardar credencial de origem que se declara de escrita", async () => {
    seedAtendlyCalendar(db);

    const response = await app.inject({
      method: "POST",
      url: "/internal/calendar/integration/connect",
      headers: headers(),
      payload: {
        ...connectPayload,
        configuration: { ...connectPayload.configuration, enableWrites: true },
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("INTEGRATION_WRITES_NOT_SUPPORTED");
    // Nada gravado, e a origem nem chegou a ser chamada.
    expect(db.client.integrationConnection.rows).toHaveLength(0);
    expect(origin.credentialChecks).toHaveLength(0);
  });

  it("desconectar a origem não desativa a agenda operacional", async () => {
    seedAtendlyCalendar(db);
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
      source: "ATENDLY",
      integration: null,
      capabilities: { createAppointments: true, manageServices: true },
    });
    expect(db.client.integrationConnection.rows).toHaveLength(0);
    // A agenda do negócio continua lá, com a mesma fonte e o mesmo fuso.
    expect(db.client.calendarSettings.rows[0]).toMatchObject({
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    });
  });
});
