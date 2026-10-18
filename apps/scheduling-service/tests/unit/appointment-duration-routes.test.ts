/**
 * D-207 — as rotas internas transportam a duração ajustada: criação,
 * disponibilidade e o ajuste depois de marcado (`/duration`). A origem vem da
 * credencial: o BFF fala por uma pessoa (USER), a IA por ela mesma (AI), e a
 * IA nunca ajusta duração.
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

import { registerCalendarRoutes } from "../../src/modules/calendar/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

const tenantId = "tenant-a";
const timeZone = "America/Sao_Paulo";
const serviceId = "service-corte";
const customerId = "customer-ana";
const date = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

function headers(caller: "bff" | "ai-orchestrator", key = "key-1") {
  return {
    authorization: `Bearer ${deriveInternalToken(
      TEST_INTERNAL_SERVICE_TOKEN,
      caller,
      SERVICE_AUDIENCE,
      "command",
    )}`,
    "content-type": "application/json",
    "idempotency-key": key,
    "x-tenant-id": tenantId,
    "x-user-id": "professional-1",
    "x-request-id": "req-1",
  };
}

function databaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function seed() {
  const database = createDatabaseDouble();
  database.tables.calendarSettings.rows.push({
    id: `settings-${tenantId}`,
    tenantId,
    source: "AVENLY",
    timezone: timeZone,
    minLeadMinutes: 0,
    maxLeadDays: 90,
    granularityMinutes: 15,
    customerChangeMinNoticeMinutes: 0,
  });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    database.tables.availabilityRule.rows.push({
      id: `rule-${dayOfWeek}`,
      tenantId,
      dayOfWeek,
      startTime: databaseTime("08:00"),
      endTime: databaseTime("18:00"),
      active: true,
    });
  }
  database.tables.service.rows.push({
    id: serviceId,
    tenantId,
    name: "Corte",
    durationMinutes: 40,
    priceType: "FIXED",
    price: 50,
    active: true,
    needsReview: false,
    colorToken: null,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    recurrenceIntervalDays: null,
  });
  database.tables.customer.rows.push({
    id: customerId,
    tenantId,
    name: "Ana",
    phone: "+5511999990000",
    normalizedPhone: "5511999990000",
  });
  return database;
}

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();
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

let app: FastifyInstance;

beforeEach(async () => {
  currentClient = seed().client as unknown as PrismaClient;
  app = await buildTestApp();
});

afterEach(async () => {
  await app.close();
  currentClient = undefined;
});

async function create(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/internal/appointments",
    headers: headers("bff", `create-${Math.random()}`),
    payload: {
      serviceIds: [serviceId],
      date,
      startTime: "09:00",
      customerId,
      ...body,
    },
  });
}

describe("D-207: rotas internas da duração ajustada", () => {
  it("cria com a duração ajustada e devolve o padrão ao lado", async () => {
    const response = await create({
      serviceDurations: [{ serviceId, durationMinutes: 60 }],
    });
    expect(response.statusCode).toBe(201);
    const { data } = response.json();
    expect(data.endTime).toBe("10:00");
    expect(data.services[0]).toMatchObject({
      durationMinutes: 60,
      defaultDurationMinutes: 40,
    });
  });

  it("a disponibilidade aceita `servico:minutos` na consulta", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/internal/availability?serviceIds=${serviceId}&serviceDurations=${serviceId}:60&startDate=${date}&days=1&maxSlots=1`,
      headers: headers("bff"),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      { date, startTime: "08:00", endTime: "09:00" },
    ]);
  });

  it("ajusta depois de marcado pela rota /duration", async () => {
    const created = (await create({})).json().data;
    const response = await app.inject({
      method: "POST",
      url: `/internal/appointments/${created.id}/duration`,
      headers: headers("bff", "duration-1"),
      payload: { services: [{ serviceId, durationMinutes: 60 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      startTime: "09:00",
      endTime: "10:00",
      durationMinutes: 60,
    });
  });

  it("recusa duração inválida no corpo", async () => {
    const created = (await create({})).json().data;
    const response = await app.inject({
      method: "POST",
      url: `/internal/appointments/${created.id}/duration`,
      headers: headers("bff", "duration-invalid"),
      payload: { services: [{ serviceId, durationMinutes: 0 }] },
    });
    expect(response.statusCode).toBe(400);
  });

  it("a IA não ajusta duração, nem na criação nem depois", async () => {
    const createdByAi = await app.inject({
      method: "POST",
      url: "/internal/appointments",
      headers: headers("ai-orchestrator", "ai-create"),
      payload: {
        serviceIds: [serviceId],
        serviceDurations: [{ serviceId, durationMinutes: 60 }],
        date,
        startTime: "09:00",
        customerId,
      },
    });
    expect(createdByAi.statusCode).toBe(403);
    expect(createdByAi.json().error.code).toBe(
      "SERVICE_DURATION_OVERRIDE_NOT_ALLOWED",
    );

    const created = (await create({})).json().data;
    const changedByAi = await app.inject({
      method: "POST",
      url: `/internal/appointments/${created.id}/duration`,
      headers: headers("ai-orchestrator", "ai-duration"),
      payload: { services: [{ serviceId, durationMinutes: 60 }] },
    });
    expect(changedByAi.statusCode).toBe(403);
  });
});
