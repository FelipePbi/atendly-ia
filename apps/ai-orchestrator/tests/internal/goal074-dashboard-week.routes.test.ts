import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
]);

const TENANT = "tenant-a";

// Quarta-feira fixa, com folga confortavel de dois dias para "esta semana,
// nao hoje" (segunda) e para "semana passada" (domingo anterior), sem
// depender de que dia real e quando a suite roda.
const NOW = new Date("2026-09-30T15:00:00-03:00");
const TODAY = NOW;
const MONDAY_THIS_WEEK = new Date("2026-09-28T10:00:00-03:00");
const SUNDAY_LAST_WEEK = new Date("2026-09-27T23:00:00-03:00");

interface ToolCallRow {
  tenantId: string;
  name: string;
  status: "SUCCEEDED" | "FAILED";
  completedAt: Date;
  arguments: unknown;
  result: unknown;
}

interface TakeoverRow {
  tenantId: string;
  conversationId: string;
  takenAt: Date;
}

function appointmentCall(overrides: Partial<ToolCallRow> = {}): ToolCallRow {
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

function takeover(overrides: Partial<TakeoverRow> = {}): TakeoverRow {
  return {
    tenantId: TENANT,
    conversationId: "conversation-1",
    takenAt: TODAY,
    ...overrides,
  };
}

function fakePrisma(toolCalls: ToolCallRow[], takeovers: TakeoverRow[] = []) {
  return {
    aiTenantConfig: { findUnique: async () => null },
    conversation: {
      findMany: async () => [],
      count: async () => 0,
    },
    aiToolCall: {
      findMany: async ({
        where,
      }: {
        where: { tenantId: string; completedAt: { gte: Date } };
      }) =>
        toolCalls
          .filter((call) => call.tenantId === where.tenantId)
          .filter((call) => call.completedAt >= where.completedAt.gte)
          .map((call) => ({
            name: call.name,
            arguments: call.arguments,
            result: call.result,
            completedAt: call.completedAt,
          })),
    },
    aiRun: { findMany: async () => [] },
    humanTakeover: {
      findMany: async ({
        where,
      }: {
        where: { tenantId: string; takenAt: { gte: Date } };
      }) =>
        takeovers
          .filter((row) => row.tenantId === where.tenantId)
          .filter((row) => row.takenAt >= where.takenAt.gte)
          .map((row) => ({ conversationId: row.conversationId })),
    },
  } as never;
}

async function buildApp(toolCalls: ToolCallRow[], takeovers: TakeoverRow[] = []) {
  const app = Fastify();
  await registerInternalRoutes(app, fakePrisma(toolCalls, takeovers), {
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
  return response.json().data as {
    aiAppointmentsToday: number;
    aiAppointmentsThisWeek: number;
    conversationsTakenOverThisWeek: number;
  };
}

describe("números da semana no /internal/dashboard (Goal074)", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app?.close();
  });

  it("aiAppointmentsThisWeek soma confirmacao de hoje e do inicio da semana", async () => {
    app = await buildApp([
      appointmentCall({ completedAt: TODAY }),
      appointmentCall({ completedAt: MONDAY_THIS_WEEK }),
    ]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsThisWeek).toBe(2);
  });

  it("aiAppointmentsToday nao muda de valor com confirmacao so da semana", async () => {
    app = await buildApp([
      appointmentCall({ completedAt: TODAY }),
      appointmentCall({ completedAt: MONDAY_THIS_WEEK }),
    ]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsToday).toBe(1);
    expect(data.aiAppointmentsThisWeek).toBe(2);
  });

  it("prepare na semana nao conta", async () => {
    app = await buildApp([
      appointmentCall({
        completedAt: MONDAY_THIS_WEEK,
        arguments: { action: "prepare" },
      }),
    ]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsThisWeek).toBe(0);
    expect(data.aiAppointmentsToday).toBe(0);
  });

  it("confirmacao da semana passada nao conta", async () => {
    app = await buildApp([appointmentCall({ completedAt: SUNDAY_LAST_WEEK })]);

    const data = await fetchDashboard(app);

    expect(data.aiAppointmentsThisWeek).toBe(0);
  });

  it("conversationsTakenOverThisWeek conta conversas distintas desde segunda", async () => {
    app = await buildApp(
      [],
      [
        takeover({ conversationId: "conversation-1", takenAt: MONDAY_THIS_WEEK }),
        takeover({ conversationId: "conversation-1", takenAt: TODAY }),
        takeover({ conversationId: "conversation-2", takenAt: TODAY }),
      ],
    );

    const data = await fetchDashboard(app);

    expect(data.conversationsTakenOverThisWeek).toBe(2);
  });

  it("tomada da semana passada nao conta em conversationsTakenOverThisWeek", async () => {
    app = await buildApp(
      [],
      [takeover({ conversationId: "conversation-1", takenAt: SUNDAY_LAST_WEEK })],
    );

    const data = await fetchDashboard(app);

    expect(data.conversationsTakenOverThisWeek).toBe(0);
  });
});
