/**
 * Retirada da fonte externa (Goal027, WU-02): existe uma fonte, entao nao
 * existe guarda de fonte.
 *
 * Os dois guards retirados — um em `internal-api/routes.ts`, outro em
 * `calendar/routes.ts` — somavam **duas** exigencias na mesma chamada: ter
 * `CalendarSettings`
 * (`404 CALENDAR_SETTINGS_NOT_FOUND`) e a fonte ser a Agenda Atendly
 * (`409`). So a segunda deixou de fazer sentido. Este arquivo existe porque
 * o risco da simplificacao e exatamente perder a primeira junto com a
 * segunda — e um tenant sem calendario configurado passar a receber `200`
 * onde recebia `404`.
 *
 * Por isso a prova e por **grupo de rota**, uma de cada, nos dois modulos que
 * tinham guard proprio: agendamento, disponibilidade, serie, cliente e
 * servico. E por isso cada grupo tambem tem o caso positivo: o tenant com a
 * linha continua entrando na rota.
 *
 * As capabilities entram aqui pelo mesmo motivo. Elas eram
 * `source === "ATENDLY"` e passaram a ser "tem `CalendarSettings`"; o teste
 * fixa os nomes e a composicao do payload, que nao podiam mudar, e o valor
 * com e sem a linha.
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createDatabaseDouble } from "./support/database-double.js";

// `registerCalendarRoutes` nao recebe o client: ele vem de `getPrisma()`, que
// sem `DATABASE_URL` abriria uma conexao real. O dublê entra por aqui para
// que as rotas de serie e de remocao sejam exercitadas de verdade, e nao
// apenas o guard isolado.
let currentClient: PrismaClient | undefined;
vi.mock("../../src/infrastructure/database/prisma.js", () => ({
  getPrisma: () => {
    if (!currentClient) throw new Error("dublê de banco não configurado");
    return currentClient;
  },
}));

import { registerCalendarRoutes } from "../../src/modules/calendar/routes.js";
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
    source: "AVENLY",
    timezone: timeZone,
    minLeadMinutes: 0,
    maxLeadDays: 90,
    granularityMinutes: 30,
  });
}

async function buildTestApp(client: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify();
  await registerManagementRoutes(app, client);
  await registerCalendarRoutes(app);
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

/**
 * Uma rota por grupo, escolhida entre as que estavam atras de um guard de
 * fonte. `calendar/routes.ts` e `internal-api/routes.ts` aparecem os dois:
 * cada um tinha o seu guard, e cada um podia perder o `404` sozinho.
 */
const guardedRoutes = [
  {
    group: "agendamento (internal-api)",
    method: "POST" as const,
    url: "/internal/appointments/auto-complete",
    // Passado o guard, a varredura roda e responde.
    passedTheGuard: { status: 200, code: undefined },
  },
  {
    group: "agendamento (calendar)",
    method: "DELETE" as const,
    url: "/internal/appointments/appointment-1",
    // Remover o que nao existe e `removed: false` por contrato, nao erro.
    passedTheGuard: { status: 200, code: undefined },
  },
  {
    group: "disponibilidade",
    method: "GET" as const,
    url: "/internal/availability-settings",
    passedTheGuard: { status: 200, code: undefined },
  },
  {
    group: "serie",
    method: "POST" as const,
    url: "/internal/appointments/series/preview",
    // Corpo vazio so e recusado depois do guard.
    passedTheGuard: { status: 400, code: "VALIDATION_ERROR" },
  },
  {
    group: "cliente",
    method: "GET" as const,
    url: "/internal/customers/customer-1",
    // 404 de pessoa inexistente, que e outro 404: o codigo distingue.
    passedTheGuard: { status: 404, code: "CUSTOMER_NOT_FOUND" },
  },
  {
    group: "servico",
    method: "POST" as const,
    url: "/internal/service-catalog",
    passedTheGuard: { status: 400, code: "VALIDATION_ERROR" },
  },
];

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

describe("tenant sem CalendarSettings continua recebendo 404 (Goal027)", () => {
  for (const route of guardedRoutes) {
    it(`${route.group}: ${route.method} ${route.url}`, async () => {
      app = await buildTestApp(database.client as never);

      const response = await app.inject({
        headers: headers(),
        method: route.method,
        payload: route.method === "GET" ? undefined : {},
        url: route.url,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("CALENDAR_SETTINGS_NOT_FOUND");
    });
  }
});

describe("tenant com CalendarSettings entra na rota (Goal027)", () => {
  for (const route of guardedRoutes) {
    it(`${route.group}: ${route.method} ${route.url} nao para no guard`, async () => {
      seedCalendar(database);
      app = await buildTestApp(database.client as never);

      const response = await app.inject({
        headers: headers(),
        method: route.method,
        payload: route.method === "GET" ? undefined : {},
        url: route.url,
      });

      // O que a rota responde depois do guard e assunto dela (400 de corpo
      // invalido, 404 de recurso inexistente, 200) e esta fixado rota a rota
      // de proposito: "nao e 404 de calendario" sozinho passaria ate num 500.
      expect({
        status: response.statusCode,
        code: response.json().error?.code,
      }).toEqual(route.passedTheGuard);
      // E, explicitamente: o 409 de fonte externa nao existe mais.
      expect(response.statusCode).not.toBe(409);
    });
  }
});

describe("capabilities dependem de haver CalendarSettings (Goal027)", () => {
  async function overview() {
    app = await buildTestApp(database.client as never);
    const response = await app.inject({
      headers: headers(),
      method: "GET",
      url: "/internal/calendar",
    });
    expect(response.statusCode).toBe(200);
    return response.json().data;
  }

  it("sem a linha: nenhuma capacidade operacional, e o payload e o mesmo", async () => {
    const data = await overview();

    expect(data.source).toBeNull();
    expect(data.capabilities).toEqual({
      manageAvailability: false,
      manageServices: false,
      manageCustomers: false,
      createAppointments: false,
      migrate: false,
      aiActivationReady: false,
    });
  });

  it("com a linha: as quatro capacidades operacionais valem, sem mudar nome nem composicao", async () => {
    seedCalendar(database);

    const data = await overview();

    expect(data.source).toBe("AVENLY");
    expect(data.capabilities).toEqual({
      manageAvailability: true,
      manageServices: true,
      manageCustomers: true,
      createAppointments: true,
      migrate: true,
      // `aiActivationReady` nao mudou de significado: continua sendo "ha ao
      // menos um servico operacional", e este tenant nao tem nenhum.
      aiActivationReady: false,
    });
  });
});
