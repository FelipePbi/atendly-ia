import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes, requiredScope }, { expectedToken }] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
  ]);

type Category = "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL";

interface Row {
  id: string;
  tenantId: string;
  channelId: string;
  externalContactId: string;
  customerName: string | null;
  status: "ACTIVE" | "HUMAN_HANDOFF" | "CLOSED";
  humanHandoff: boolean;
  updatedAt: Date;
  contact: { ignored: boolean; ignoredAt: Date | null; aiPaused: boolean };
  session: {
    id: string;
    startedAt: Date;
    expiresAt: Date;
    lastContactMessageAt: Date | null;
    category: Category;
    categorySource: "AUTOMATIC" | "MANUAL";
    suggestedCategory: Category | null;
    humanHandling: boolean;
    humanHandlingSince: Date | null;
  };
}

function row(id: string, tenantId: string): Row {
  return {
    id,
    tenantId,
    channelId: `channel-${tenantId}`,
    externalContactId: "5511999999999",
    customerName: "Maria",
    status: "ACTIVE",
    humanHandoff: false,
    updatedAt: new Date("2026-09-07T10:00:00.000Z"),
    contact: { ignored: false, ignoredAt: null, aiPaused: false },
    session: {
      id: `session-${id}`,
      startedAt: new Date("2026-09-07T09:00:00.000Z"),
      expiresAt: new Date("2026-09-08T09:00:00.000Z"),
      lastContactMessageAt: new Date("2026-09-07T09:30:00.000Z"),
      category: "UNCLASSIFIED",
      categorySource: "AUTOMATIC",
      suggestedCategory: "COMMERCIAL",
      humanHandling: false,
      humanHandlingSince: null,
    },
  };
}

/**
 * Banco em dobro com duas linhas de tenants diferentes.
 *
 * O objetivo e provar isolamento e contrato: toda leitura filtra por
 * `tenantId`, e nenhuma rota aceita o tenant vindo de query ou body.
 */
function fakePrisma(rows: Row[]) {
  const shape = (item: Row) => ({
    ...item,
    messages: [],
    handoffs: [],
    contact: item.contact,
    sessions: [item.session],
    channel: { id: item.channelId, tenantId: item.tenantId },
  });
  return {
    conversation: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = rows.find(
          (item) => item.id === where.id && item.tenantId === where.tenantId,
        );
        return found ? shape(found) : null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const category = (
          where.sessions as { some?: { category?: Category } } | undefined
        )?.some?.category;
        const handling = (
          where.sessions as { some?: { humanHandling?: boolean } } | undefined
        )?.some?.humanHandling;
        const ignored = (where.contact as { ignored?: boolean } | undefined)
          ?.ignored;
        return rows
          .filter((item) => item.tenantId === where.tenantId)
          .filter((item) => !category || item.session.category === category)
          .filter(
            (item) =>
              handling === undefined ||
              item.session.humanHandling === handling,
          )
          .filter(
            (item) => ignored === undefined || item.contact.ignored === ignored,
          )
          .map(shape);
      },
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    handoff: {
      findFirst: async () => null,
      create: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
  } as never;
}

/**
 * Porta de sessao em dobro: aplica a mesma precedencia da implementacao real
 * (override manual sobre sugestao, ignore como regra do contato) sobre as
 * linhas em memoria.
 */
function fakeSessions(rows: Row[]) {
  const find = (tenantId: string, conversationId: string) =>
    rows.find(
      (item) => item.tenantId === tenantId && item.id === conversationId,
    );
  const calls: string[] = [];
  return {
    calls,
    port: {
      resolveContext: async (scope: {
        tenantId: string;
        conversationId: string;
      }) => {
        calls.push(`resolve:${scope.conversationId}`);
        const item = find(scope.tenantId, scope.conversationId);
        return { sessionId: item?.session.id ?? "unknown" };
      },
      assumeHumanControl: async (input: { sessionId: string }) => {
        calls.push(`assume:${input.sessionId}`);
        const item = rows.find((entry) => entry.session.id === input.sessionId);
        if (item) {
          item.session.humanHandling = true;
          item.session.humanHandlingSince = new Date();
          item.humanHandoff = true;
          item.status = "HUMAN_HANDOFF";
        }
      },
      setCategoryOverride: async (input: {
        tenantId: string;
        conversationId: string;
        category: Category | null;
      }) => {
        const item = find(input.tenantId, input.conversationId);
        if (!item) return null;
        item.session.category =
          input.category ?? item.session.suggestedCategory ?? "UNCLASSIFIED";
        item.session.categorySource = input.category ? "MANUAL" : "AUTOMATIC";
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
      releaseToAi: async (input: {
        tenantId: string;
        conversationId: string;
      }) => {
        calls.push(`release:${input.conversationId}`);
        const item = find(input.tenantId, input.conversationId);
        if (!item) return null;
        item.session.humanHandling = false;
        item.session.humanHandlingSince = null;
        item.humanHandoff = false;
        item.status = "ACTIVE";
        return null;
      },
      currentSession: async () => null,
    } as never,
  };
}

async function buildApp(rows: Row[]) {
  const sessions = fakeSessions(rows);
  const app = Fastify();
  await registerInternalRoutes(app, fakePrisma(rows), {
    inbox: { countDeadLetters: async () => 0 },
    sessions: sessions.port,
  });
  return { app, sessions };
}

function headers(tenantId: string) {
  return {
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

describe("contratos de categoria, ignore e atendimento", () => {
  let app: FastifyInstance;
  let rows: Row[];
  let sessions: ReturnType<typeof fakeSessions>;

  beforeEach(async () => {
    rows = [row("conversation-a", "tenant-a"), row("conversation-b", "tenant-b")];
    ({ app, sessions } = await buildApp(rows));
  });

  afterEach(async () => {
    await app?.close();
  });

  it("expoe categoria, origem, atendimento, sessao e ignore no DTO", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/conversations/conversation-a",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      category: "UNCLASSIFIED",
      categorySource: "AUTOMATIC",
      suggestedCategory: "COMMERCIAL",
      handling: "AI",
      ignored: false,
      aiPaused: false,
      session: { id: "session-conversation-a" },
    });
  });

  it("ler a conversa nao muda estado de atendimento", async () => {
    await app.inject({
      method: "GET",
      url: "/internal/conversations/conversation-a",
      headers: headers("tenant-a"),
    });

    expect(rows[0].session.humanHandling).toBe(false);
    expect(rows[0].humanHandoff).toBe(false);
    expect(sessions.calls).toHaveLength(0);
  });

  it("o override manual prevalece e nao vaza para o outro tenant", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-a/category",
      headers: headers("tenant-a"),
      payload: { category: "PERSONAL" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      category: "PERSONAL",
      categorySource: "MANUAL",
    });
    expect(rows[1].session.category).toBe("UNCLASSIFIED");
    expect(rows[1].session.categorySource).toBe("AUTOMATIC");
  });

  it("limpar o override devolve a conversa a classificacao automatica", async () => {
    await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-a/category",
      headers: headers("tenant-a"),
      payload: { category: "PERSONAL" },
    });
    const response = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-a/category",
      headers: headers("tenant-a"),
      payload: { category: null },
    });

    expect(response.json().data).toMatchObject({
      category: "COMMERCIAL",
      categorySource: "AUTOMATIC",
    });
  });

  it("marca e desmarca contato ignorado", async () => {
    const marked = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-a/ignore",
      headers: headers("tenant-a"),
      payload: { ignored: true },
    });
    expect(marked.json().data).toMatchObject({ ignored: true });
    expect(rows[1].contact.ignored).toBe(false);

    const cleared = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-a/ignore",
      headers: headers("tenant-a"),
      payload: { ignored: false },
    });
    expect(cleared.json().data).toMatchObject({ ignored: false, ignoredAt: null });
  });

  it("takeover marca atendimento humano e release devolve a IA", async () => {
    const taken = await app.inject({
      method: "POST",
      url: "/internal/conversations/conversation-a/takeover",
      headers: headers("tenant-a"),
    });
    expect(taken.json().data).toMatchObject({ handling: "HUMAN" });

    const released = await app.inject({
      method: "POST",
      url: "/internal/conversations/conversation-a/release",
      headers: headers("tenant-a"),
    });
    expect(released.json().data).toMatchObject({ handling: "AI" });
    expect(sessions.calls).toContain("release:conversation-a");
  });

  it("filtra a lista por categoria, atendimento e ignore, dentro do tenant", async () => {
    rows[0].session.category = "PERSONAL";
    rows[1].session.category = "PERSONAL";

    const response = await app.inject({
      method: "GET",
      url: "/internal/conversations?category=PERSONAL&handling=AI&ignored=false",
      headers: headers("tenant-a"),
    });

    const data = response.json().data as Array<{ id: string }>;
    expect(data.map((item) => item.id)).toEqual(["conversation-a"]);
  });

  it("nao encontra a conversa do outro tenant, nem com tenant no query", async () => {
    const crossTenant = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-b/category?tenantId=tenant-b",
      headers: headers("tenant-a"),
      payload: { category: "PERSONAL" },
    });

    expect(crossTenant.statusCode).toBe(404);
    expect(rows[1].session.category).toBe("UNCLASSIFIED");
  });

  it("ignora tenant enviado no body: quem manda e o contexto confiavel", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-b/ignore",
      headers: headers("tenant-a"),
      payload: { ignored: true, tenantId: "tenant-b" },
    });

    expect(response.statusCode).toBe(404);
    expect(rows[1].contact.ignored).toBe(false);
  });

  it("as rotas novas exigem o escopo de escrita de conversa", () => {
    const scopeOf = (method: string, url: string) =>
      requiredScope({ method, url } as never);

    expect(scopeOf("PUT", "/internal/conversations/x/category")).toBe(
      "conversations:write",
    );
    expect(scopeOf("PUT", "/internal/conversations/x/ignore")).toBe(
      "conversations:write",
    );
    expect(scopeOf("PUT", "/internal/unknown")).toBe("internal:unmapped");
  });
});
