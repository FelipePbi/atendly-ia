import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../src/modules/internal/routes.js"),
  import("../src/lib/internal-credentials.js"),
]);

/**
 * Goal075/WU-02 — teste §6.5: `GET /internal/conversations?customerId=`
 * devolve só as conversas daquela pessoa, dentro do negócio da requisição.
 */

interface ConversationRow {
  id: string;
  tenantId: string;
  externalContactId: string;
  customerName: string | null;
  status: "ACTIVE" | "HUMAN_HANDOFF" | "CLOSED";
  humanHandoff: boolean;
  updatedAt: Date;
  contentExpiredThrough: Date | null;
  contact: { ignored: boolean; aiPaused: boolean; customerId: string | null };
  messages: unknown[];
  handoffs: unknown[];
  sessions: unknown[];
}

function conversationRow(
  overrides: Partial<ConversationRow> & { id: string; tenantId: string },
): ConversationRow {
  return {
    externalContactId: `contact-${overrides.id}`,
    customerName: null,
    status: "ACTIVE",
    humanHandoff: false,
    updatedAt: new Date("2026-09-27T12:00:00.000Z"),
    contentExpiredThrough: null,
    contact: { ignored: false, aiPaused: false, customerId: null },
    messages: [],
    handoffs: [],
    sessions: [],
    ...overrides,
  };
}

function fakePrisma(conversations: ConversationRow[]) {
  return {
    conversation: {
      findMany: async ({
        where,
      }: {
        where: { tenantId: string; contact?: { customerId?: string } };
      }) => {
        return conversations.filter((row) => {
          if (row.tenantId !== where.tenantId) return false;
          const customerId = where.contact?.customerId;
          if (customerId && row.contact.customerId !== customerId) return false;
          return true;
        });
      },
    },
  };
}

async function buildApp(conversations: ConversationRow[]) {
  const prisma = fakePrisma(conversations);
  const app = Fastify();
  await registerInternalRoutes(app, prisma as never);
  return app;
}

function headers(tenantId: string) {
  return {
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

describe("GET /internal/conversations?customerId=", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("devolve só as conversas daquela pessoa, no mesmo negócio", async () => {
    app = await buildApp([
      conversationRow({
        id: "conv-maria",
        tenantId: "tenant-a",
        contact: { ignored: false, aiPaused: false, customerId: "customer-maria" },
      }),
      conversationRow({
        id: "conv-pedro",
        tenantId: "tenant-a",
        contact: { ignored: false, aiPaused: false, customerId: "customer-pedro" },
      }),
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/internal/conversations?customerId=customer-maria",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    const items = response.json().data as Array<{ id: string; customerId: string | null }>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "conv-maria", customerId: "customer-maria" });
  });

  it("não devolve a conversa dessa pessoa vinda de outro negócio", async () => {
    app = await buildApp([
      conversationRow({
        id: "conv-maria-a",
        tenantId: "tenant-a",
        contact: { ignored: false, aiPaused: false, customerId: "customer-maria" },
      }),
      conversationRow({
        id: "conv-maria-b",
        tenantId: "tenant-b",
        contact: { ignored: false, aiPaused: false, customerId: "customer-maria" },
      }),
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/internal/conversations?customerId=customer-maria",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    const items = response.json().data as Array<{ id: string }>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "conv-maria-a" });
  });

  it("sem customerId, devolve as conversas do negócio, sem filtrar por pessoa", async () => {
    app = await buildApp([
      conversationRow({
        id: "conv-maria",
        tenantId: "tenant-a",
        contact: { ignored: false, aiPaused: false, customerId: "customer-maria" },
      }),
      conversationRow({
        id: "conv-sem-vinculo",
        tenantId: "tenant-a",
        contact: { ignored: false, aiPaused: false, customerId: null },
      }),
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/internal/conversations",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(2);
  });
});
