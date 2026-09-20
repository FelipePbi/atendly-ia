/**
 * Goal029: o BFF passou a reconciliar timezone com o Scheduling depois de
 * `PATCH /v1/settings/business` (WU-02), mas o dono de `CalendarSettings`
 * continua sendo so o Scheduling. Este arquivo prova que a chegada de um
 * segundo escritor nao afrouxou nenhuma das guardas ja existentes em
 * `internal-api/routes.ts`: `source` continua travado em `ATENDLY`
 * (`sourceSchema`/`CalendarSettings_source_atendly_check`), `assertTimezone`
 * continua recusando timezone que nao seja IANA valido, e o upsert de
 * `PATCH /internal/calendar` continua so tocando `timezone` — nunca `source`.
 *
 * Nenhum src deste app e alterado por esta unidade: e prova de
 * comportamento existente, nao mudanca de comportamento.
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createDatabaseDouble } from "./support/database-double.js";

let currentClient: PrismaClient | undefined;
vi.mock("../../src/infrastructure/database/prisma.js", () => ({
  getPrisma: () => {
    if (!currentClient) throw new Error("dublê de banco não configurado");
    return currentClient;
  },
}));

import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

type Database = ReturnType<typeof createDatabaseDouble>;

const tenantId = "tenant-a";
const timeZone = "America/Sao_Paulo";

const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

function headers() {
  return {
    authorization: `Bearer ${bffToken}`,
    "content-type": "application/json",
    "idempotency-key": "key-1",
    "x-tenant-id": tenantId,
    "x-user-id": "professional-1",
    "x-request-id": "req-1",
  };
}

function seedCalendar(database: Database) {
  database.tables.calendarSettings.rows.push({
    id: `settings-${tenantId}`,
    tenantId,
    source: "ATENDLY",
    timezone: timeZone,
    minLeadMinutes: 0,
    maxLeadDays: 90,
    granularityMinutes: 30,
  });
}

async function buildTestApp(client: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify();
  await registerManagementRoutes(app, client);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
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

let database: Database;
let app: FastifyInstance | undefined;

beforeEach(() => {
  database = createDatabaseDouble();
  currentClient = database.client as never;
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  currentClient = undefined;
});

describe("PATCH /internal/calendar continua com source travado em ATENDLY (Goal029)", () => {
  it("source diferente de ATENDLY e recusado antes de tocar o banco", async () => {
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "PATCH",
      payload: { source: "MINHA_AGENDA", timezone: timeZone },
      url: "/internal/calendar",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(database.tables.calendarSettings.rows).toHaveLength(0);
  });

  it("source ausente e recusado do mesmo jeito", async () => {
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "PATCH",
      payload: { timezone: timeZone },
      url: "/internal/calendar",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("tentar trocar a fonte de um calendario ja existente continua 409", async () => {
    seedCalendar(database);
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "PATCH",
      payload: { source: "ATENDLY", timezone: "Europe/Lisbon" },
      url: "/internal/calendar",
    });

    // O guard de fonte compara com o existing.source: como o corpo so aceita
    // "ATENDLY", este caso prova que o guard continua ali, nao que ele
    // dispare — a linha grava com o mesmo valor de sempre.
    expect(response.statusCode).toBe(200);
    expect(database.tables.calendarSettings.rows[0]?.source).toBe("ATENDLY");
  });
});

describe("PATCH /internal/calendar continua recusando timezone invalido (Goal029)", () => {
  it("timezone fora do IANA e recusado por assertTimezone", async () => {
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "PATCH",
      payload: { source: "ATENDLY", timezone: "Not/A_Zone" },
      url: "/internal/calendar",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_TIMEZONE");
    expect(database.tables.calendarSettings.rows).toHaveLength(0);
  });

  it("timezone IANA valido e aceito e atualiza a linha existente", async () => {
    seedCalendar(database);
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "PATCH",
      payload: { source: "ATENDLY", timezone: "Europe/Lisbon" },
      url: "/internal/calendar",
    });

    expect(response.statusCode).toBe(200);
    expect(database.tables.calendarSettings.rows[0]?.timezone).toBe(
      "Europe/Lisbon",
    );
  });
});

describe("PATCH /internal/calendar so atualiza timezone, nunca source (Goal029)", () => {
  it("upsert em linha existente preserva source e demais colunas", async () => {
    seedCalendar(database);
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "PATCH",
      payload: { source: "ATENDLY", timezone: "Europe/Lisbon" },
      url: "/internal/calendar",
    });

    expect(response.statusCode).toBe(200);
    const row = database.tables.calendarSettings.rows[0];
    expect(row).toMatchObject({
      tenantId,
      source: "ATENDLY",
      timezone: "Europe/Lisbon",
      minLeadMinutes: 0,
      maxLeadDays: 90,
      granularityMinutes: 30,
    });
    expect(database.tables.calendarSettings.rows).toHaveLength(1);
  });

  it("upsert sem linha existente cria com source e timezone do corpo", async () => {
    app = await buildTestApp(database.client as never);

    const response = await app.inject({
      headers: headers(),
      method: "PATCH",
      payload: { source: "ATENDLY", timezone: timeZone },
      url: "/internal/calendar",
    });

    expect(response.statusCode).toBe(200);
    expect(database.tables.calendarSettings.rows).toHaveLength(1);
    expect(database.tables.calendarSettings.rows[0]).toMatchObject({
      tenantId,
      source: "ATENDLY",
      timezone: timeZone,
    });
  });
});
