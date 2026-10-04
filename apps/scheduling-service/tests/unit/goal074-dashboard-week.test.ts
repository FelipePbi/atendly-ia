/**
 * Goal074, WU-02: `/internal/dashboard` ganha `appointmentsThisWeek`,
 * segunda a domingo da semana local do calendario — inclusive dias ja
 * passados dela, nao so hoje em diante (a leitura anterior comecava em
 * `today`). `appointmentsToday`, `todayAppointments` e `nextAppointment`
 * continuam vindo da mesma leitura de sempre, sem mudar de valor.
 *
 * Relogio fixo numa quarta-feira, sem depender de que dia real a suite roda.
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { localDateTimeToInstant } from "../../src/shared/date-time/calendar-date-time.js";
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

// Quarta-feira fixa (2026-09-30). Segunda desta semana: 2026-09-28.
// Domingo desta semana: 2026-10-04.
const NOW = new Date("2026-09-30T15:00:00-03:00");
const TODAY = "2026-09-30";
const YESTERDAY_THIS_WEEK = "2026-09-29";
const MONDAY_THIS_WEEK = "2026-09-28";
const SUNDAY_THIS_WEEK = "2026-10-04";
const SUNDAY_LAST_WEEK = "2026-09-27";
const MONDAY_NEXT_WEEK = "2026-10-05";

const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

function headers() {
  return {
    authorization: `Bearer ${bffToken}`,
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

function seedCustomer(database: Database) {
  database.tables.customer.rows.push({
    id: "customer-1",
    tenantId,
    name: "Thais",
    phone: "5511900000001",
  });
}

function seedAppointment(
  database: Database,
  options: {
    id: string;
    date: string;
    time?: string;
    status?: "CONFIRMED" | "CANCELLED";
  },
) {
  const time = options.time ?? "10:00";
  const startAt = localDateTimeToInstant(options.date, time, timeZone);
  const endAt = new Date(startAt.getTime() + 30 * 60_000);
  database.tables.appointment.rows.push({
    id: options.id,
    tenantId,
    customerId: "customer-1",
    source: "USER",
    startAt,
    endAt,
    status: options.status ?? "CONFIRMED",
    statusRaw: options.status ?? "CONFIRMED",
    createdBy: "user-1",
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

async function fetchDashboard(app: FastifyInstance) {
  const response = await app.inject({
    headers: headers(),
    method: "GET",
    url: "/internal/dashboard",
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as {
    appointmentsToday: number;
    todayAppointments: unknown[];
    appointmentsThisWeek: number;
    nextAppointment: { id: string } | null;
  };
}

let database: Database;
let app: FastifyInstance | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  database = createDatabaseDouble();
  currentClient = database.client as never;
  seedCalendar(database);
  seedCustomer(database);
});

afterEach(async () => {
  vi.useRealTimers();
  await app?.close();
  app = undefined;
  currentClient = undefined;
});

describe("appointmentsThisWeek no /internal/dashboard (Goal074)", () => {
  it("soma atendimento de dia anterior a hoje, dentro da semana", async () => {
    seedAppointment(database, { id: "appt-monday", date: MONDAY_THIS_WEEK });
    seedAppointment(database, {
      id: "appt-yesterday",
      date: YESTERDAY_THIS_WEEK,
    });

    app = await buildTestApp(database.client as never);
    const data = await fetchDashboard(app);

    expect(data.appointmentsThisWeek).toBe(2);
  });

  it("soma tambem hoje e o domingo desta semana", async () => {
    seedAppointment(database, { id: "appt-today", date: TODAY, time: "18:00" });
    seedAppointment(database, { id: "appt-sunday", date: SUNDAY_THIS_WEEK });

    app = await buildTestApp(database.client as never);
    const data = await fetchDashboard(app);

    expect(data.appointmentsThisWeek).toBe(2);
  });

  it("nao conta o domingo da semana anterior", async () => {
    seedAppointment(database, { id: "appt-last-sunday", date: SUNDAY_LAST_WEEK });

    app = await buildTestApp(database.client as never);
    const data = await fetchDashboard(app);

    expect(data.appointmentsThisWeek).toBe(0);
  });

  it("nao conta a segunda da semana seguinte", async () => {
    seedAppointment(database, { id: "appt-next-monday", date: MONDAY_NEXT_WEEK });

    app = await buildTestApp(database.client as never);
    const data = await fetchDashboard(app);

    expect(data.appointmentsThisWeek).toBe(0);
  });

  it("nao conta atendimento de domingo anterior que cruza meia-noite para a segunda desta semana", async () => {
    seedAppointment(database, {
      id: "appt-crosses-midnight",
      date: SUNDAY_LAST_WEEK,
      time: "23:45",
    });

    app = await buildTestApp(database.client as never);
    const data = await fetchDashboard(app);

    expect(data.appointmentsThisWeek).toBe(0);
  });

  it("nao conta atendimento cancelado dentro da semana", async () => {
    seedAppointment(database, {
      id: "appt-cancelled",
      date: MONDAY_THIS_WEEK,
      status: "CANCELLED",
    });

    app = await buildTestApp(database.client as never);
    const data = await fetchDashboard(app);

    expect(data.appointmentsThisWeek).toBe(0);
  });

  it("appointmentsToday, todayAppointments e nextAppointment nao mudam de valor", async () => {
    seedAppointment(database, { id: "appt-today", date: TODAY, time: "18:00" });
    seedAppointment(database, { id: "appt-monday", date: MONDAY_THIS_WEEK });

    app = await buildTestApp(database.client as never);
    const data = await fetchDashboard(app);

    expect(data.appointmentsToday).toBe(1);
    expect(data.todayAppointments).toHaveLength(1);
    expect(data.nextAppointment?.id).toBe("appt-today");
    expect(data.appointmentsThisWeek).toBe(2);
  });
});
