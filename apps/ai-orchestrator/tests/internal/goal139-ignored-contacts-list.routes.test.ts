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
 * Goal139/WU-01 — `GET /internal/contacts/ignored`, a `origin` dos dois `PUT`
 * de ignorar e a regra de "Remover" pela rota por telefone.
 *
 * O que esta suite prova: a leitura devolve so os ignorados do canal ativo do
 * tenant, na ordem `ignoredAt` crescente (nulos por ultimo, `id` desempata) e
 * com `total`; recusa como a marcacao por telefone quando nao ha canal ativo;
 * a origem vai e volta como texto livre (valor desconhecido lido como `null`);
 * e "Remover" por telefone deixa a sessao aberta e nao expirada em `PERSONAL`
 * so nesta conversa, sem tocar sessao expirada, contato nao ignorado nem a
 * rota da conversa.
 */
interface ContactRow {
  id: string;
  tenantId: string;
  channelId: string;
  externalContactId: string;
  displayName: string | null;
  ignored: boolean;
  ignoredAt: Date | null;
  ignoredBy: string | null;
  ignoredSource: string | null;
  categoryOverride: string | null;
  categoryOverrideAt: Date | null;
  categoryOverrideBy: string | null;
  aiPaused: boolean;
}

interface SessionRow {
  id: string;
  tenantId: string;
  channelId: string;
  conversationId: string;
  contactId: string;
  startedAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
  category: string;
  categorySource: string;
  categoryOverride: string | null;
  categoryUpdatedAt: Date | null;
  categoryUpdatedBy: string | null;
  suggestedCategory: string | null;
  humanHandling: boolean;
  inboundVersion: number;
  contextResetAt: Date | null;
  updatedAt: Date;
}

const HOUR = 3_600_000;

function contactRow(overrides: Partial<ContactRow> & { id: string }): ContactRow {
  return {
    tenantId: "tenant-a",
    channelId: "channel-tenant-a",
    externalContactId: `55${overrides.id}`,
    displayName: null,
    ignored: true,
    ignoredAt: null,
    ignoredBy: null,
    ignoredSource: null,
    categoryOverride: null,
    categoryOverrideAt: null,
    categoryOverrideBy: null,
    aiPaused: false,
    ...overrides,
  };
}

function sessionRow(
  overrides: Partial<SessionRow> & { id: string; contactId: string },
): SessionRow {
  return {
    tenantId: "tenant-a",
    channelId: "channel-tenant-a",
    conversationId: `conversation-${overrides.id}`,
    startedAt: new Date(Date.now() - HOUR),
    expiresAt: new Date(Date.now() + HOUR),
    endedAt: null,
    category: "COMMERCIAL",
    categorySource: "AUTOMATIC",
    categoryOverride: null,
    categoryUpdatedAt: null,
    categoryUpdatedBy: null,
    suggestedCategory: "COMMERCIAL",
    humanHandling: false,
    inboundVersion: 0,
    contextResetAt: null,
    updatedAt: new Date(Date.now() - HOUR),
    ...overrides,
  };
}

function matches(row: object, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = (row as Record<string, unknown>)[key];
    if (expected instanceof Date) {
      return actual instanceof Date && actual.getTime() === expected.getTime();
    }
    if (typeof expected === "object" && expected !== null) {
      const range = expected as { gte?: Date };
      if (range.gte) {
        return actual instanceof Date && actual.getTime() >= range.gte.getTime();
      }
    }
    return actual === expected;
  });
}

function fakePrisma(options: {
  activeChannel: boolean;
  contacts?: ContactRow[];
  sessions?: SessionRow[];
}) {
  const contacts: ContactRow[] = [...(options.contacts ?? [])];
  const sessions: SessionRow[] = [...(options.sessions ?? [])];
  let sequence = 0;
  const findContact = (where: Record<string, unknown>) => {
    const composite = where.tenantId_channelId_externalContactId as
      | Record<string, unknown>
      | undefined;
    const byId = where.tenantId_id as Record<string, unknown> | undefined;
    return contacts.find((row) =>
      matches(row, composite ?? byId ?? where),
    );
  };
  const prisma = {
    // Registro de atividade (D-176): gravado, não conferido aqui.
    activityLog: { create: async () => ({}) },
    // Nao lidas (D-195): o dobro nao tem mensagens, entao nada a contar.
    $queryRaw: async () => [],
    contacts,
    sessions,
    // Goal141: "Remover" grava numa transacao; o falso nao desfaz nada.
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
    channelConnection: {
      findUnique: async ({
        where,
      }: {
        where: { tenantId_provider: { tenantId: string; provider: string } };
      }) => {
        if (!options.activeChannel) return null;
        return {
          id: `channel-${where.tenantId_provider.tenantId}`,
          tenantId: where.tenantId_provider.tenantId,
          status: "ACTIVE",
        };
      },
    },
    contact: {
      // Nome do contato no registro de atividade (D-200): sem nome aqui.
      findFirst: async () => null,
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        findContact(where) ?? null,
      findMany: async ({
        where,
        skip,
        take,
      }: {
        where: Record<string, unknown>;
        skip: number;
        take: number;
      }) =>
        contacts
          .filter((row) => matches(row, where))
          .sort((left, right) => {
            if (left.ignoredAt && right.ignoredAt) {
              const diff = left.ignoredAt.getTime() - right.ignoredAt.getTime();
              if (diff !== 0) return diff;
            } else if (left.ignoredAt || right.ignoredAt) {
              return left.ignoredAt ? -1 : 1;
            }
            return left.id < right.id ? -1 : 1;
          })
          .slice(skip, skip + take),
      count: async ({ where }: { where: Record<string, unknown> }) =>
        contacts.filter((row) => matches(row, where)).length,
      update: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<ContactRow>;
      }) => {
        const existing = findContact(where);
        if (!existing) throw new Error("contact not found");
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<ContactRow>;
      }) => {
        const affected = contacts.filter((row) => matches(row, where));
        for (const row of affected) Object.assign(row, data);
        return { count: affected.length };
      },
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: Record<string, unknown>;
        update: Partial<ContactRow>;
        create: Partial<ContactRow>;
      }) => {
        const existing = findContact(where);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        sequence += 1;
        const created = contactRow({
          id: `new-${sequence}`,
          ...create,
          ignored: create.ignored ?? false,
        });
        contacts.push(created);
        return created;
      },
    },
    conversationSession: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        sessions.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        sessions.filter((row) => matches(row, where)),
      findUniqueOrThrow: async ({
        where,
      }: {
        where: { tenantId_id: { tenantId: string; id: string } };
      }) => {
        const row = sessions.find((item) =>
          matches(item, where.tenantId_id),
        );
        if (!row) throw new Error("session not found");
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<SessionRow>;
      }) => {
        const row = sessions.find((item) => matches(item, where));
        if (!row) return { count: 0 };
        Object.assign(row, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    conversation: {
      updateMany: async () => ({ count: 0 }),
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
        const session = sessions.find(
          (row) =>
            row.conversationId === where.id && row.tenantId === where.tenantId,
        );
        if (!session) return null;
        const contact = contacts.find((row) => row.id === session.contactId);
        return {
          id: session.conversationId,
          channelId: session.channelId,
          externalContactId: contact?.externalContactId ?? "unknown",
          customerName: null,
          status: "ACTIVE",
          humanHandoff: false,
          handoffs: [],
          messages: [],
          updatedAt: new Date(),
          contentExpiredThrough: null,
          sessions: [session],
          contact: contact ?? null,
        };
      },
    },
  };
  return prisma;
}

async function buildApp(options: Parameters<typeof fakePrisma>[0]) {
  const prisma = fakePrisma(options);
  const app = Fastify();
  await registerInternalRoutes(app, prisma as never, {
    inbox: { countDeadLetters: async () => 0 },
  });
  return { app, prisma };
}

function headers(tenantId: string) {
  return {
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

const T0 = new Date("2026-09-01T10:00:00.000Z");
const T1 = new Date("2026-09-02T10:00:00.000Z");
const T2 = new Date("2026-09-18T10:00:00.000Z");

describe("GET /internal/contacts/ignored", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  async function build() {
    ({ app } = await buildApp({
      activeChannel: true,
      contacts: [
        contactRow({
          id: "c-late",
          displayName: "Tarde",
          ignoredAt: T2,
          ignoredSource: "panel",
        }),
        contactRow({
          id: "c-null",
          displayName: null,
          ignoredAt: null,
          ignoredSource: "legacy-import",
        }),
        contactRow({
          id: "c-tie-b",
          displayName: "Empate B",
          ignoredAt: T1,
          ignoredSource: "settings",
        }),
        contactRow({
          id: "c-first",
          displayName: "Mae",
          ignoredAt: T0,
          ignoredSource: "onboarding",
        }),
        contactRow({
          id: "c-tie-a",
          displayName: "Empate A",
          ignoredAt: T1,
          ignoredSource: null,
        }),
        contactRow({ id: "c-not-ignored", ignored: false }),
        contactRow({
          id: "c-other-tenant",
          tenantId: "tenant-b",
          channelId: "channel-tenant-b",
          ignoredAt: T0,
        }),
        // Mesmo `channelId` de outro tenant: so o filtro de tenant o exclui.
        contactRow({
          id: "c-other-tenant-same-channel",
          tenantId: "tenant-b",
          ignoredAt: T0,
        }),
        contactRow({
          id: "c-other-channel",
          channelId: "channel-secondary",
          ignoredAt: T0,
        }),
      ],
    }));
  }

  it("devolve so os ignorados do canal ativo do tenant, na ordem da escolha 1, com total", async () => {
    await build();

    const response = await app.inject({
      method: "GET",
      url: "/internal/contacts/ignored",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.items.map((item: { contactId: string }) => item.contactId)).toEqual(
      ["c-first", "c-tie-a", "c-tie-b", "c-late", "c-null"],
    );
    expect(data.total).toBe(5);
    expect(data.limit).toBe(100);
    expect(data.offset).toBe(0);
    expect(data.items[0]).toEqual({
      contactId: "c-first",
      externalContactId: "55c-first",
      displayName: "Mae",
      ignoredAt: T0.toISOString(),
      origin: "ONBOARDING",
    });
    expect(data.items[4]).toMatchObject({
      displayName: null,
      ignoredAt: null,
      origin: null,
    });
  });

  it("mapeia ignoredSource para a origem nos tres sentidos e valor desconhecido vira null", async () => {
    await build();

    const response = await app.inject({
      method: "GET",
      url: "/internal/contacts/ignored",
      headers: headers("tenant-a"),
    });

    const origins = Object.fromEntries(
      response
        .json()
        .data.items.map((item: { contactId: string; origin: string | null }) => [
          item.contactId,
          item.origin,
        ]),
    );
    expect(origins).toEqual({
      "c-first": "ONBOARDING",
      "c-late": "CONVERSATION",
      "c-tie-b": "SETTINGS",
      "c-tie-a": null,
      "c-null": null,
    });
  });

  it("pagina com limit e offset mantendo o total do canal", async () => {
    await build();

    const response = await app.inject({
      method: "GET",
      url: "/internal/contacts/ignored?limit=2&offset=3",
      headers: headers("tenant-a"),
    });

    const data = response.json().data;
    expect(data.items.map((item: { contactId: string }) => item.contactId)).toEqual(
      ["c-late", "c-null"],
    );
    expect(data.total).toBe(5);
    expect(data.limit).toBe(2);
    expect(data.offset).toBe(3);
  });

  it("outro tenant le so o que e dele", async () => {
    await build();

    const response = await app.inject({
      method: "GET",
      url: "/internal/contacts/ignored",
      headers: headers("tenant-b"),
    });

    const data = response.json().data;
    expect(data.items.map((item: { contactId: string }) => item.contactId)).toEqual(
      ["c-other-tenant"],
    );
    expect(data.total).toBe(1);
  });

  it.each([
    ["limit=0"],
    ["limit=201"],
    ["limit=abc"],
    ["offset=-1"],
  ])("recusa a consulta fora da faixa (%s) com 400", async (query) => {
    await build();

    const response = await app.inject({
      method: "GET",
      url: `/internal/contacts/ignored?${query}`,
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
  });

  it("recusa como a marcacao por telefone quando nao ha canal ativo", async () => {
    ({ app } = await buildApp({ activeChannel: false }));

    const response = await app.inject({
      method: "GET",
      url: "/internal/contacts/ignored",
      headers: headers("tenant-a"),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("CHANNEL_CONNECTION_NOT_FOUND");
  });

  it("a rota nova exige conversations:read", () => {
    const scopeOf = (method: string, url: string) =>
      requiredScope({ method, url } as never);

    expect(scopeOf("GET", "/internal/contacts/ignored")).toBe(
      "conversations:read",
    );
    expect(scopeOf("GET", "/internal/contacts/ignored?limit=10")).toBe(
      "conversations:read",
    );
    expect(scopeOf("PUT", "/internal/contacts/ignore")).toBe(
      "conversations:write",
    );
  });
});

describe("origin nos dois PUT de ignorar", () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof fakePrisma>;

  beforeEach(async () => {
    const contact = contactRow({
      id: "c-chat",
      ignored: false,
      externalContactId: "5511911110000",
    });
    ({ app, prisma } = await buildApp({
      activeChannel: true,
      contacts: [contact],
      sessions: [sessionRow({ id: "s-chat", contactId: "c-chat" })],
    }));
  });

  afterEach(async () => {
    await app?.close();
  });

  const byPhone = (payload: object) =>
    app.inject({
      method: "PUT",
      url: "/internal/contacts/ignore",
      headers: headers("tenant-a"),
      payload,
    });
  const byConversation = (payload: object) =>
    app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-s-chat/ignore",
      headers: headers("tenant-a"),
      payload,
    });

  it.each([
    ["ONBOARDING", "onboarding"],
    ["CONVERSATION", "panel"],
    ["SETTINGS", "settings"],
  ])("por telefone, origin %s grava %s", async (origin, stored) => {
    const response = await byPhone({
      phone: "5511999990000",
      ignored: true,
      origin,
    });

    expect(response.statusCode).toBe(200);
    expect(
      prisma.contacts.find((row) => row.externalContactId === "5511999990000"),
    ).toMatchObject({ ignoredSource: stored });
  });

  it.each([
    ["ONBOARDING", "onboarding"],
    ["CONVERSATION", "panel"],
    ["SETTINGS", "settings"],
  ])("na conversa, origin %s grava %s", async (origin, stored) => {
    const response = await byConversation({ ignored: true, origin });

    expect(response.statusCode).toBe(200);
    expect(prisma.contacts[0]).toMatchObject({ ignoredSource: stored });
  });

  it("sem origin, os dois PUT gravam o mesmo de hoje", async () => {
    await byPhone({ phone: "5511999990000", ignored: true });
    await byConversation({ ignored: true });

    expect(
      prisma.contacts.find((row) => row.externalContactId === "5511999990000")
        ?.ignoredSource,
    ).toBe("onboarding");
    expect(prisma.contacts[0]?.ignoredSource).toBe("panel");
  });

  it("origin fora do enum e recusado com 400 e nada e gravado", async () => {
    const phone = await byPhone({
      phone: "5511999990000",
      ignored: true,
      origin: "ELSEWHERE",
    });
    const conversation = await byConversation({
      ignored: true,
      origin: "ELSEWHERE",
    });

    expect(phone.statusCode).toBe(400);
    expect(conversation.statusCode).toBe(400);
    expect(prisma.contacts).toHaveLength(1);
    expect(prisma.contacts[0]?.ignored).toBe(false);
  });

  it("com ignored false o origin e aceito e nao grava nada", async () => {
    const response = await byConversation({ ignored: false, origin: "SETTINGS" });

    expect(response.statusCode).toBe(200);
    expect(prisma.contacts[0]).toMatchObject({
      ignored: false,
      ignoredAt: null,
      ignoredSource: null,
    });
  });
});

describe("Remover pela rota por telefone", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  const remove = () =>
    app.inject({
      method: "PUT",
      url: "/internal/contacts/ignore",
      headers: headers("tenant-a"),
      payload: { phone: "5511911110000", ignored: false },
    });

  function seed(contactIgnored: boolean) {
    return buildApp({
      activeChannel: true,
      contacts: [
        contactRow({
          id: "c-1",
          externalContactId: "5511911110000",
          ignored: contactIgnored,
          ignoredAt: T0,
          ignoredBy: "user-tenant-a",
          ignoredSource: "onboarding",
        }),
      ],
      sessions: [
        sessionRow({ id: "s-open", contactId: "c-1" }),
        sessionRow({
          id: "s-expired",
          contactId: "c-1",
          expiresAt: new Date(Date.now() - HOUR),
        }),
        sessionRow({
          id: "s-ended",
          contactId: "c-1",
          endedAt: new Date(Date.now() - HOUR),
        }),
      ],
    });
  }

  it("deixa a sessao aberta e nao expirada em PERSONAL so nesta conversa, com o autor do pedido", async () => {
    const built = await seed(true);
    app = built.app;

    const response = await remove();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ ignored: false });
    expect(built.prisma.contacts[0]).toMatchObject({
      ignored: false,
      ignoredAt: null,
      ignoredBy: null,
      ignoredSource: null,
      categoryOverride: null,
    });
    expect(built.prisma.sessions[0]).toMatchObject({
      category: "PERSONAL",
      categorySource: "MANUAL",
      categoryOverride: "PERSONAL",
      categoryUpdatedBy: "user-tenant-a",
    });
  });

  it("nao muda a sessao expirada nem a encerrada", async () => {
    const built = await seed(true);
    app = built.app;

    await remove();

    const byId = (id: string) =>
      built.prisma.sessions.find((row) => row.id === id);
    expect(byId("s-open")).toMatchObject({
      category: "PERSONAL",
      categoryOverride: "PERSONAL",
    });
    for (const id of ["s-expired", "s-ended"]) {
      expect(byId(id)).toMatchObject({
        category: "COMMERCIAL",
        categorySource: "AUTOMATIC",
        categoryOverride: null,
      });
    }
  });

  it("contato que nao estava ignorado nao muda nenhuma sessao", async () => {
    const built = await seed(false);
    app = built.app;

    const response = await remove();

    expect(response.statusCode).toBe(200);
    for (const session of built.prisma.sessions) {
      expect(session).toMatchObject({
        category: "COMMERCIAL",
        categorySource: "AUTOMATIC",
        categoryOverride: null,
      });
    }
  });

  it("marcar (ignored true) nao grava categoria em sessao nenhuma", async () => {
    const built = await seed(false);
    app = built.app;

    await app.inject({
      method: "PUT",
      url: "/internal/contacts/ignore",
      headers: headers("tenant-a"),
      payload: { phone: "5511911110000", ignored: true },
    });

    for (const session of built.prisma.sessions) {
      expect(session.categoryOverride).toBeNull();
    }
  });

  it("desmarcar pela rota da conversa (D-130 6) nao grava categoria", async () => {
    const built = await seed(true);
    app = built.app;

    const response = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-s-open/ignore",
      headers: headers("tenant-a"),
      payload: { ignored: false },
    });

    expect(response.statusCode).toBe(200);
    expect(built.prisma.contacts[0]).toMatchObject({
      ignored: false,
      categoryOverride: null,
    });
    for (const session of built.prisma.sessions) {
      expect(session).toMatchObject({
        category: "COMMERCIAL",
        categoryOverride: null,
      });
    }
  });
});
