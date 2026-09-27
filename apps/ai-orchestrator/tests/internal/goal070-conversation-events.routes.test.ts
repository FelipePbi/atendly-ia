import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
]);

const TENANT = "tenant-a";
const OTHER_TENANT = "tenant-b";
const CONVERSATION = "conversation-a";
const FUTURE_HOLD_EXPIRES_AT = new Date(Date.now() + 3_600_000).toISOString();

interface ToolCallRow {
  id: string;
  tenantId: string;
  conversationId: string;
  name: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED";
  createdAt: Date;
  completedAt: Date | null;
  arguments: unknown;
  result: unknown;
}

function prepareRow(
  id: string,
  overrides: Partial<ToolCallRow> = {},
): ToolCallRow {
  return {
    id,
    tenantId: TENANT,
    conversationId: CONVERSATION,
    name: "create_appointment",
    status: "SUCCEEDED",
    createdAt: new Date("2026-09-27T12:00:00.000Z"),
    completedAt: new Date("2026-09-27T12:00:01.000Z"),
    arguments: { action: "prepare" },
    result: {
      ok: true,
      data: {
        pendingAction: { date: "2026-09-27", startTime: "15:30" },
        hold: { id: "hold-1", expiresAt: FUTURE_HOLD_EXPIRES_AT },
      },
    },
    ...overrides,
  };
}

function confirmRow(
  id: string,
  overrides: Partial<ToolCallRow> = {},
): ToolCallRow {
  return {
    id,
    tenantId: TENANT,
    conversationId: CONVERSATION,
    name: "create_appointment",
    status: "SUCCEEDED",
    createdAt: new Date("2026-09-27T12:05:00.000Z"),
    completedAt: new Date("2026-09-27T12:05:01.000Z"),
    arguments: { action: "confirm" },
    result: {
      ok: true,
      data: {
        appointment: { id: "appt-1", date: "2026-09-27", startTime: "15:30" },
      },
    },
    ...overrides,
  };
}

function fakePrisma(toolCalls: ToolCallRow[]) {
  return {
    conversation: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; tenantId: string };
      }) => {
        if (where.id !== CONVERSATION || where.tenantId !== TENANT) {
          return null;
        }
        return {
          id: CONVERSATION,
          tenantId: TENANT,
          externalContactId: "5511999999999",
          customerName: "Maria",
          status: "ACTIVE",
          humanHandoff: false,
          updatedAt: new Date("2026-09-27T12:00:00.000Z"),
          messages: [],
          handoffs: [],
          contact: null,
          sessions: [],
          channel: { id: "channel-a", tenantId: TENANT },
        };
      },
    },
    aiToolCall: {
      findMany: async ({
        where,
      }: {
        where: {
          tenantId: string;
          name: string;
          aiRun: { conversationId: string };
        };
      }) =>
        toolCalls
          .filter((row) => row.tenantId === where.tenantId)
          .filter((row) => row.name === where.name)
          .filter((row) => row.conversationId === where.aiRun.conversationId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((row) => ({
            id: row.id,
            createdAt: row.createdAt,
            completedAt: row.completedAt,
            status: row.status,
            arguments: row.arguments,
            result: row.result,
          })),
    },
  } as never;
}

async function buildApp(toolCalls: ToolCallRow[]) {
  const app = Fastify();
  await registerInternalRoutes(app, fakePrisma(toolCalls));
  return app;
}

function headers(tenantId: string = TENANT, use: "command" | "provisioning" = "command") {
  return {
    authorization: `Bearer ${expectedToken(use)}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": "user-tenant-a",
  };
}

describe("GET /internal/conversations/:id/events", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("devolve os eventos da conversa do tenant em ordem", async () => {
    app = await buildApp([prepareRow("call-prepare"), confirmRow("call-confirm")]);

    const response = await app.inject({
      method: "GET",
      url: `/internal/conversations/${CONVERSATION}/events`,
      headers: headers(),
    });

    expect(response.statusCode).toBe(200);
    const events = response.json().data as Array<{ type: string; id: string }>;
    expect(events.map((event) => event.type)).toEqual([
      "HOLD_PLACED",
      "APPOINTMENT_CREATED",
    ]);
  });

  it("recusa conversa de outro tenant como /messages recusa", async () => {
    app = await buildApp([prepareRow("call-prepare")]);

    const response = await app.inject({
      method: "GET",
      url: `/internal/conversations/${CONVERSATION}/events`,
      headers: headers(OTHER_TENANT),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("CONVERSATION_NOT_FOUND");
  });

  it("ignora AiToolCall de outra conversa do mesmo tenant", async () => {
    app = await buildApp([
      prepareRow("call-prepare"),
      prepareRow("call-other-conversation", { conversationId: "conversation-b" }),
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/internal/conversations/${CONVERSATION}/events`,
      headers: headers(),
    });

    const events = response.json().data as Array<{ id: string }>;
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("call-prepare");
  });

  it("caminho sem escopo declarado e recusado", async () => {
    app = await buildApp([prepareRow("call-prepare")]);

    const response = await app.inject({
      method: "GET",
      url: `/internal/conversations/${CONVERSATION}/events`,
      headers: headers(TENANT, "provisioning"),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("INTERNAL_SCOPE_DENIED");
  });
});
