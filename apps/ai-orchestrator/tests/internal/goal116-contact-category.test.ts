import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
]);

type Category = "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL";

interface Row {
  id: string;
  tenantId: string;
  contact: {
    customerId: string | null;
    ignored: boolean;
    ignoredAt: Date | null;
    aiPaused: boolean;
    categoryOverride: Category | null;
  };
  session: {
    category: Category;
    categorySource: "AUTOMATIC" | "MANUAL";
    categoryOverride: Category | null;
  };
}

function row(id: string, tenantId: string): Row {
  return {
    id,
    tenantId,
    contact: {
      customerId: null,
      ignored: false,
      ignoredAt: null,
      aiPaused: false,
      categoryOverride: null,
    },
    session: {
      category: "UNCLASSIFIED",
      categorySource: "AUTOMATIC",
      categoryOverride: null,
    },
  };
}

function shape(item: Row) {
  return {
    id: item.id,
    tenantId: item.tenantId,
    channelId: `channel-${item.tenantId}`,
    externalContactId: "5511999999999",
    customerName: "Maria",
    status: "ACTIVE" as const,
    humanHandoff: false,
    updatedAt: new Date("2026-10-04T10:00:00.000Z"),
    messages: [],
    handoffs: [],
    contact: item.contact,
    sessions: [
      {
        id: `session-${item.id}`,
        startedAt: new Date("2026-10-04T09:00:00.000Z"),
        expiresAt: new Date("2026-10-05T09:00:00.000Z"),
        lastContactMessageAt: null,
        category: item.session.category,
        categorySource: item.session.categorySource,
        suggestedCategory: null,
        categoryOverride: item.session.categoryOverride,
        humanHandling: false,
        humanHandlingSince: null,
      },
    ],
  };
}

function fakePrisma(rows: Row[]) {
  return {
    // Registro de atividade (D-176): gravado, não conferido aqui.
    activityLog: { create: async () => ({}) },
    // Nao lidas (D-195): o dobro nao tem mensagens, entao nada a contar.
    $queryRaw: async () => [],
    conversation: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = rows.find(
          (item) => item.id === where.id && item.tenantId === where.tenantId,
        );
        return found ? shape(found) : null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((item) => item.tenantId === where.tenantId).map(shape),
    },
  } as never;
}

function fakeSessions(rows: Row[]) {
  const find = (tenantId: string, conversationId: string) =>
    rows.find(
      (item) => item.tenantId === tenantId && item.id === conversationId,
    );
  return {
    resolveContext: async () => ({ sessionId: "unused" }),
    setCategoryOverride: async (input: {
      tenantId: string;
      conversationId: string;
      category: Category | null;
      scope?: "CONVERSATION" | "CONTACT";
    }) => {
      const item = find(input.tenantId, input.conversationId);
      if (!item) return null;
      item.session.category = input.category ?? "UNCLASSIFIED";
      item.session.categorySource = input.category ? "MANUAL" : "AUTOMATIC";
      if (input.scope === "CONVERSATION") {
        item.session.categoryOverride = input.category;
      } else {
        item.contact.categoryOverride = input.category;
        item.session.categoryOverride = null;
      }
      return null;
    },
    setIgnored: async (input: {
      tenantId: string;
      conversationId: string;
      ignored: boolean;
    }) => {
      const item = find(input.tenantId, input.conversationId);
      if (!item) return null;
      item.contact.ignored = input.ignored;
      item.contact.ignoredAt = input.ignored ? new Date() : null;
      return null;
    },
    currentSession: async () => null,
  } as never;
}

function headers(tenantId: string) {
  return {
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

describe("contactCategory no DTO de conversa (Goal116)", () => {
  let app: FastifyInstance;
  let rows: Row[];

  beforeEach(async () => {
    rows = [row("conversation-a", "tenant-a")];
    app = Fastify();
    await registerInternalRoutes(app, fakePrisma(rows), {
      inbox: { countDeadLetters: async () => 0 },
      sessions: fakeSessions(rows),
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  const get = (url: string) =>
    app.inject({ method: "GET", url, headers: headers("tenant-a") });

  it("sem decisao do contato devolve null no detalhe e na lista", async () => {
    const detail = await get("/internal/conversations/conversation-a");
    expect(detail.json().data.contactCategory).toBeNull();

    const list = await get("/internal/conversations");
    expect(list.json().data[0].contactCategory).toBeNull();
  });

  it.each(["COMMERCIAL", "UNCLASSIFIED", "PERSONAL"] as const)(
    "devolve %s quando o contato tem essa decisao, no detalhe e na lista",
    async (category) => {
      rows[0].contact.categoryOverride = category;

      const detail = await get("/internal/conversations/conversation-a");
      expect(detail.json().data.contactCategory).toBe(category);

      const list = await get("/internal/conversations");
      expect(list.json().data[0].contactCategory).toBe(category);
    },
  );

  it("Só esta conversa com o contato em Comercial: conversa Pessoal, contato Comercial", async () => {
    rows[0].contact.categoryOverride = "COMMERCIAL";

    const response = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-a/category",
      headers: headers("tenant-a"),
      payload: { category: "PERSONAL", scope: "CONVERSATION" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      category: "PERSONAL",
      categoryScope: "CONVERSATION",
      contactCategory: "COMMERCIAL",
    });
  });

  it("PUT category CONTACT: contactCategory acompanha a decisao gravada", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-a/category",
      headers: headers("tenant-a"),
      payload: { category: "PERSONAL", scope: "CONTACT" },
    });

    expect(response.json().data).toMatchObject({
      categoryScope: "CONTACT",
      contactCategory: "PERSONAL",
    });
  });

  it("PUT ignore devolve contactCategory", async () => {
    rows[0].contact.categoryOverride = "PERSONAL";

    const response = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-a/ignore",
      headers: headers("tenant-a"),
      payload: { ignored: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      ignored: true,
      contactCategory: "PERSONAL",
    });
  });
});
