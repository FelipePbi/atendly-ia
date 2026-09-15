import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes, requiredScope }, { expectedToken }] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
  ]);

/**
 * Goal022/WU-02 — `GET /internal/handoffs/awaiting-human`, a leitura que a
 * central de notificacoes vai consumir para materializar
 * `CUSTOMER_WAITING_HUMAN`.
 *
 * O que esta suite prova: duas linhas `Handoff` OPEN na mesma conversa
 * colapsam em uma entrada (pela mais antiga), takeover do dono nunca aparece,
 * a identificacao e o nome do contato ou `null` — telefone nao sai daqui em
 * forma nenhuma, porque o valor termina gravado em `payload` de notificacao
 * (Goal022 criterio 5) —, a leitura e escopada por tenant, tem teto e ordena
 * por instante de abertura.
 */
interface HandoffRow {
  id: string;
  tenantId: string;
  channelId: string;
  conversationId: string | null;
  externalContactId: string;
  reason: string;
  status: "OPEN" | "RESOLVED";
  createdAt: Date;
}

interface ConversationRow {
  id: string;
  tenantId: string;
  customerName: string | null;
  externalContactId: string;
}

function fakePrisma(handoffs: HandoffRow[], conversations: ConversationRow[]) {
  return {
    handoff: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where: {
          tenantId: string;
          status: string;
          conversationId?: { not: null };
          reason?: { not: string };
        };
        orderBy: { createdAt: "asc" | "desc" };
      }) => {
        const rows = handoffs
          .filter((row) => row.tenantId === where.tenantId)
          .filter((row) => row.status === where.status)
          .filter((row) => row.conversationId !== null)
          .filter((row) => row.reason !== where.reason?.not);
        rows.sort((a, b) =>
          orderBy.createdAt === "asc"
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime(),
        );
        return rows.map((row) => ({
          ...row,
          conversation:
            conversations.find(
              (conversation) =>
                conversation.id === row.conversationId &&
                conversation.tenantId === row.tenantId,
            ) ?? null,
        }));
      },
    },
  } as never;
}

async function buildApp(
  handoffs: HandoffRow[],
  conversations: ConversationRow[],
) {
  const app = Fastify();
  await registerInternalRoutes(app, fakePrisma(handoffs, conversations), {
    inbox: { countDeadLetters: async () => 0 },
  });
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

describe("GET /internal/handoffs/awaiting-human", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("colapsa duas linhas OPEN da mesma conversa em uma entrada, pela mais antiga", async () => {
    app = await buildApp(
      [
        {
          id: "handoff-1",
          tenantId: "tenant-a",
          channelId: "channel-a",
          conversationId: "conversation-1",
          externalContactId: "5511999990000",
          reason: "KEYWORD",
          status: "OPEN",
          createdAt: new Date("2026-09-15T10:00:00.000Z"),
        },
        {
          id: "handoff-2",
          tenantId: "tenant-a",
          channelId: "channel-a",
          conversationId: "conversation-1",
          externalContactId: "5511999990000",
          reason: "ESCALATION",
          status: "OPEN",
          createdAt: new Date("2026-09-15T11:00:00.000Z"),
        },
      ],
      [
        {
          id: "conversation-1",
          tenantId: "tenant-a",
          customerName: "Maria",
          externalContactId: "5511999990000",
        },
      ],
    );

    const response = await app.inject({
      method: "GET",
      url: "/internal/handoffs/awaiting-human",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      conversationId: "conversation-1",
      contactName: "Maria",
      reason: "KEYWORD",
      openedAt: "2026-09-15T10:00:00.000Z",
    });
  });

  it("exclui handoff de takeover do dono", async () => {
    app = await buildApp(
      [
        {
          id: "handoff-takeover",
          tenantId: "tenant-a",
          channelId: "channel-a",
          conversationId: "conversation-1",
          externalContactId: "5511999990000",
          reason: "OWNER_TAKEOVER",
          status: "OPEN",
          createdAt: new Date("2026-09-15T10:00:00.000Z"),
        },
      ],
      [
        {
          id: "conversation-1",
          tenantId: "tenant-a",
          customerName: "Maria",
          externalContactId: "5511999990000",
        },
      ],
    );

    const response = await app.inject({
      method: "GET",
      url: "/internal/handoffs/awaiting-human",
      headers: headers("tenant-a"),
    });

    expect(response.json().data).toEqual([]);
  });

  it("sem nome o contato vem nulo: telefone nao sai desta rota, nem formatado", async () => {
    app = await buildApp(
      [
        {
          id: "handoff-1",
          tenantId: "tenant-a",
          channelId: "channel-a",
          conversationId: "conversation-1",
          externalContactId: "5511999990000",
          reason: "KEYWORD",
          status: "OPEN",
          createdAt: new Date("2026-09-15T10:00:00.000Z"),
        },
      ],
      [
        {
          id: "conversation-1",
          tenantId: "tenant-a",
          customerName: null,
          externalContactId: "5511999990000",
        },
      ],
    );

    const response = await app.inject({
      method: "GET",
      url: "/internal/handoffs/awaiting-human",
      headers: headers("tenant-a"),
    });

    // O valor termina gravado em `TenantNotification.payload`, onde telefone
    // nao pode entrar (Goal022 criterio 5). Nem o formatado: formatar nao
    // deixa de ser o numero. Quem exibe cai na frase generica da especie.
    const entry = response.json().data[0];
    expect(entry.contactName).toBeNull();
    expect(JSON.stringify(entry)).not.toContain("99999");
  });

  it("escopa por tenant e ordena pelo instante de abertura", async () => {
    app = await buildApp(
      [
        {
          id: "handoff-a",
          tenantId: "tenant-a",
          channelId: "channel-a",
          conversationId: "conversation-a2",
          externalContactId: "5511999990001",
          reason: "KEYWORD",
          status: "OPEN",
          createdAt: new Date("2026-09-15T12:00:00.000Z"),
        },
        {
          id: "handoff-b",
          tenantId: "tenant-a",
          channelId: "channel-a",
          conversationId: "conversation-a1",
          externalContactId: "5511999990002",
          reason: "KEYWORD",
          status: "OPEN",
          createdAt: new Date("2026-09-15T09:00:00.000Z"),
        },
        {
          id: "handoff-c",
          tenantId: "tenant-b",
          channelId: "channel-b",
          conversationId: "conversation-b1",
          externalContactId: "5511999990003",
          reason: "KEYWORD",
          status: "OPEN",
          createdAt: new Date("2026-09-15T08:00:00.000Z"),
        },
      ],
      [],
    );

    const response = await app.inject({
      method: "GET",
      url: "/internal/handoffs/awaiting-human",
      headers: headers("tenant-a"),
    });

    const data = response.json().data;
    expect(data.map((entry: { conversationId: string }) => entry.conversationId)).toEqual([
      "conversation-a1",
      "conversation-a2",
    ]);
  });

  it("aceita teto de resultados por query", async () => {
    app = await buildApp(
      [
        {
          id: "handoff-a",
          tenantId: "tenant-a",
          channelId: "channel-a",
          conversationId: "conversation-a1",
          externalContactId: "5511999990001",
          reason: "KEYWORD",
          status: "OPEN",
          createdAt: new Date("2026-09-15T09:00:00.000Z"),
        },
        {
          id: "handoff-b",
          tenantId: "tenant-a",
          channelId: "channel-a",
          conversationId: "conversation-a2",
          externalContactId: "5511999990002",
          reason: "KEYWORD",
          status: "OPEN",
          createdAt: new Date("2026-09-15T10:00:00.000Z"),
        },
      ],
      [],
    );

    const response = await app.inject({
      method: "GET",
      url: "/internal/handoffs/awaiting-human?limit=1",
      headers: headers("tenant-a"),
    });

    expect(response.json().data).toHaveLength(1);
  });

  it("exige o escopo de leitura de conversas", () => {
    const scopeOf = (method: string, url: string) =>
      requiredScope({ method, url } as never);

    expect(scopeOf("GET", "/internal/handoffs/awaiting-human")).toBe(
      "conversations:read",
    );
  });
});
