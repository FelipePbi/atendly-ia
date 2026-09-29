import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
]);

interface ToolCallRow {
  tenantId: string;
  name: string;
  status: "SUCCEEDED" | "FAILED";
  completedAt: Date;
  arguments: unknown;
  result: unknown;
}

const TENANT = "tenant-a";
const TODAY = new Date();
const YESTERDAY = new Date(TODAY.getTime() - 48 * 60 * 60 * 1000);

function createAppointmentCall(
  overrides: Partial<ToolCallRow> = {},
): ToolCallRow {
  return {
    tenantId: TENANT,
    name: "create_appointment",
    status: "SUCCEEDED",
    completedAt: TODAY,
    arguments: { action: "confirm" },
    result: { ok: true, data: { appointment: { id: "appt-1" } } },
    ...overrides,
  };
}

function confirmRecurringCall(
  count: number,
  overrides: Partial<ToolCallRow> = {},
): ToolCallRow {
  return {
    tenantId: TENANT,
    name: "confirm_recurring_appointments",
    status: "SUCCEEDED",
    completedAt: TODAY,
    arguments: { holdIds: ["hold-1"] },
    result: {
      ok: true,
      data: {
        appointments: Array.from({ length: count }, (_, index) => ({
          id: `appt-series-${index}`,
        })),
      },
    },
    ...overrides,
  };
}

/**
 * Banco em dobro: `aiToolCall.findMany` filtra pelos mesmos campos que a
 * rota consulta, para provar que a agregacao acontece sobre o resultado
 * real da query, nao sobre uma lista pre-filtrada pelo teste.
 */
function fakePrisma(toolCalls: ToolCallRow[]) {
  return {
    aiTenantConfig: {
      findUnique: async () => null,
    },
    conversation: {
      findMany: async () => [],
      count: async () => 0,
    },
    aiToolCall: {
      findMany: async ({
        where,
      }: {
        where: {
          tenantId: string;
          name: { in: string[] };
          status: string;
          completedAt: { gte: Date };
        };
      }) =>
        toolCalls
          .filter((call) => call.tenantId === where.tenantId)
          .filter((call) => where.name.in.includes(call.name))
          .filter((call) => call.status === where.status)
          .filter((call) => call.completedAt >= where.completedAt.gte)
          .map((call) => ({
            name: call.name,
            arguments: call.arguments,
            result: call.result,
            completedAt: call.completedAt,
          })),
    },
    aiRun: {
      findMany: async () => [],
    },
    humanTakeover: {
      findMany: async () => [],
    },
  } as never;
}

async function buildApp(toolCalls: ToolCallRow[]) {
  const app = Fastify();
  await registerInternalRoutes(app, fakePrisma(toolCalls), {
    inbox: { countDeadLetters: async () => 0 },
  });
  return app;
}

function headers() {
  return {
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": TENANT,
    "x-user-id": "user-tenant-a",
  };
}

async function fetchDashboard(app: FastifyInstance) {
  const response = await app.inject({
    method: "GET",
    url: "/internal/dashboard",
    headers: headers(),
  });
  return response.json().data as { aiAppointmentsToday: number };
}

describe("aiAppointmentsToday conta so agendamento criado", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("prepare sem confirm da 0", async () => {
    app = await buildApp([
      createAppointmentCall({ arguments: { action: "prepare" } }),
    ]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsToday).toBe(0);
  });

  it("cada confirm de create_appointment conta 1", async () => {
    app = await buildApp([
      createAppointmentCall(),
      createAppointmentCall({ result: { ok: true, data: { appointment: { id: "appt-2" } } } }),
    ]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsToday).toBe(2);
  });

  it("serie recorrente confirmada de N conta N", async () => {
    app = await buildApp([confirmRecurringCall(3)]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsToday).toBe(3);
  });

  it("mistura confirm avulso e serie recorrente soma os dois", async () => {
    app = await buildApp([createAppointmentCall(), confirmRecurringCall(2)]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsToday).toBe(3);
  });

  it("FAILED nao conta", async () => {
    app = await buildApp([
      createAppointmentCall({ status: "FAILED", result: { ok: false, error: { code: "X", message: "x" } } }),
    ]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsToday).toBe(0);
  });

  it("hold vencido (confirm_recurring_appointments FAILED) nao conta", async () => {
    app = await buildApp([
      confirmRecurringCall(2, {
        status: "FAILED",
        result: { ok: false, code: "APPOINTMENT_HOLD_EXPIRED", error: "expirou" },
      }),
    ]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsToday).toBe(0);
  });

  it("reschedule_appointment confirmado nao conta", async () => {
    app = await buildApp([
      createAppointmentCall({
        name: "reschedule_appointment",
        arguments: { action: "confirm" },
      }),
    ]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsToday).toBe(0);
  });

  it("cancel_appointment confirmado nao conta", async () => {
    app = await buildApp([
      createAppointmentCall({
        name: "cancel_appointment",
        arguments: { action: "confirm" },
      }),
    ]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsToday).toBe(0);
  });

  it("chamada de fora de hoje nao conta", async () => {
    app = await buildApp([createAppointmentCall({ completedAt: YESTERDAY })]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsToday).toBe(0);
  });
});
