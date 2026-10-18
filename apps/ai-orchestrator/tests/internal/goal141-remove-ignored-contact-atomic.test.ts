import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, { expectedToken }] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
]);

/**
 * Goal141/WU-01 — "Remover" pela rota por telefone grava tudo ou nada.
 *
 * O que esta suite prova: com `ignored: false`, a limpeza do contato e a
 * decisao `PERSONAL` so nesta conversa das sessoes abertas acontecem pelo
 * cliente de uma transacao so; uma falha na escrita da sessao desfaz a
 * limpeza (o contato segue ignorado com os campos de antes) e o pedido
 * repetido aplica a regra inteira; contato nao ignorado e contato inexistente
 * seguem o caminho de antes; a marcacao e a rota da conversa nao abrem
 * transacao nem tocam sessao.
 *
 * O falso de Prisma separa o cliente raiz do cliente da transacao: so o que
 * foi escrito pelo `tx` e desfeito quando o callback falha, como no banco. Uma
 * escrita por `this.prisma` no meio da transacao sobreviveria a falha.
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
const T0 = new Date("2026-09-01T10:00:00.000Z");
const PHONE = "5511911110000";

function contactRow(overrides: Partial<ContactRow> & { id: string }): ContactRow {
  return {
    tenantId: "tenant-a",
    channelId: "channel-tenant-a",
    externalContactId: PHONE,
    displayName: null,
    ignored: true,
    ignoredAt: T0,
    ignoredBy: "user-who-marked",
    ignoredSource: "settings",
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

type Via = "root" | "tx";
interface WriteRecord {
  model: "contact" | "conversationSession";
  op: string;
  via: Via;
}

function fakePrisma(options: { contacts?: ContactRow[]; sessions?: SessionRow[] }) {
  const contacts: ContactRow[] = [...(options.contacts ?? [])];
  const sessions: SessionRow[] = [...(options.sessions ?? [])];
  const writes: WriteRecord[] = [];
  let transactions = 0;
  let open = false;
  let sequence = 0;

  const findContact = (where: Record<string, unknown>) => {
    const composite = where.tenantId_channelId_externalContactId as
      | Record<string, unknown>
      | undefined;
    const byId = where.tenantId_id as Record<string, unknown> | undefined;
    return contacts.find((row) => matches(row, composite ?? byId ?? where));
  };

  // Cada escrita pelo `tx` deixa o desfazer no diario da transacao.
  function client(via: Via, journal: (() => void)[] | null) {
    const assign = <T extends object>(row: T, data: Partial<T>) => {
      const prior = { ...row };
      journal?.push(() => Object.assign(row, prior));
      Object.assign(row, data);
    };
    const record = (model: WriteRecord["model"], op: string) =>
      writes.push({ model, op, via });
    return {
      channelConnection: {
        findUnique: async ({
          where,
        }: {
          where: { tenantId_provider: { tenantId: string; provider: string } };
        }) => ({
          id: `channel-${where.tenantId_provider.tenantId}`,
          tenantId: where.tenantId_provider.tenantId,
          status: "ACTIVE",
        }),
      },
      contact: {
        // Nome do contato no registro de atividade (D-200): sem nome aqui.
        findFirst: async () => null,
        findUnique: async ({ where }: { where: Record<string, unknown> }) =>
          findContact(where) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<ContactRow>;
        }) => {
          record("contact", "update");
          const existing = findContact(where);
          if (!existing) throw new Error("contact not found");
          assign(existing, data);
          return existing;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<ContactRow>;
        }) => {
          record("contact", "updateMany");
          const affected = contacts.filter((row) => matches(row, where));
          for (const row of affected) assign(row, data);
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
          record("contact", "upsert");
          const existing = findContact(where);
          if (existing) {
            assign(existing, update);
            return existing;
          }
          sequence += 1;
          const created = contactRow({
            id: `new-${sequence}`,
            ...create,
            ignored: create.ignored ?? false,
          });
          contacts.push(created);
          journal?.push(() => contacts.splice(contacts.indexOf(created), 1));
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
          const row = sessions.find((item) => matches(item, where.tenantId_id));
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
          record("conversationSession", "updateMany");
          const row = sessions.find((item) => matches(item, where));
          if (!row) return { count: 0 };
          assign(row, { ...data, updatedAt: new Date() });
          return { count: 1 };
        },
      },
      conversation: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async ({
          where,
        }: {
          where: { id: string; tenantId: string };
        }) => {
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
  }

  const root = client("root", null);
  const prisma = {
    // Registro de atividade (D-176): gravado, não conferido aqui.
    activityLog: { create: async () => ({}) },
    // Nao lidas (D-195): o dobro nao tem mensagens, entao nada a contar.
    $queryRaw: async () => [],
    ...root,
    contacts,
    sessions,
    writes,
    transactions: () => transactions,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      if (open) throw new Error("nested transaction");
      transactions += 1;
      open = true;
      const journal: (() => void)[] = [];
      try {
        return await fn(client("tx", journal));
      } catch (error) {
        for (const undo of journal.reverse()) undo();
        throw error;
      } finally {
        open = false;
      }
    },
  };
  return prisma;
}

type FakePrisma = ReturnType<typeof fakePrisma>;

function headers(tenantId: string) {
  return {
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

describe("Goal141 — Remover por telefone numa transacao so", () => {
  let app: FastifyInstance;
  let prisma: FakePrisma;

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
  });

  async function build(options: Parameters<typeof fakePrisma>[0]) {
    prisma = fakePrisma(options);
    app = Fastify();
    await registerInternalRoutes(app, prisma as never, {
      inbox: { countDeadLetters: async () => 0 },
    });
  }

  const byPhone = (payload: object) =>
    app.inject({
      method: "PUT",
      url: "/internal/contacts/ignore",
      headers: headers("tenant-a"),
      payload,
    });
  const remove = () => byPhone({ phone: PHONE, ignored: false });

  const ignoredContact = () => contactRow({ id: "c-1" });
  const openSession = () => sessionRow({ id: "s-open", contactId: "c-1" });
  const sessionById = (id: string) =>
    prisma.sessions.find((row) => row.id === id);

  it("grava o contato limpo e a sessao PERSONAL so nesta conversa, com o autor, pelo cliente da transacao", async () => {
    await build({ contacts: [ignoredContact()], sessions: [openSession()] });

    const response = await remove();

    expect(response.statusCode).toBe(200);
    expect(prisma.contacts[0]).toMatchObject({
      ignored: false,
      ignoredAt: null,
      ignoredBy: null,
      ignoredSource: null,
      categoryOverride: null,
    });
    expect(sessionById("s-open")).toMatchObject({
      category: "PERSONAL",
      categorySource: "MANUAL",
      categoryOverride: "PERSONAL",
      categoryUpdatedBy: "user-tenant-a",
    });
    expect(sessionById("s-open")?.categoryUpdatedAt).toBeInstanceOf(Date);
    expect(prisma.transactions()).toBe(1);
    expect(prisma.writes).toEqual([
      { model: "contact", op: "updateMany", via: "tx" },
      { model: "contact", op: "upsert", via: "tx" },
      { model: "conversationSession", op: "updateMany", via: "tx" },
    ]);
  });

  it("a limpeza e condicional a ignored true e a escrita da sessao e a condicional do recalculo, sem update cru", async () => {
    await build({ contacts: [ignoredContact()], sessions: [openSession()] });
    const clear = vi.spyOn(prisma.contact, "updateMany");
    const before = { ...openSession() };

    const spies: { where: Record<string, unknown> }[] = [];
    const original = prisma.$transaction;
    prisma.$transaction = async <T>(fn: (tx: unknown) => Promise<T>) =>
      original(async (tx) => {
        const client = tx as FakePrisma;
        const sessionWrite = client.conversationSession.updateMany;
        client.conversationSession.updateMany = async (args) => {
          spies.push({ where: args.where });
          return sessionWrite(args);
        };
        const contactWrite = client.contact.updateMany;
        client.contact.updateMany = async (args) => {
          spies.push({ where: args.where });
          return contactWrite(args);
        };
        return fn(client);
      });

    const response = await remove();

    expect(response.statusCode).toBe(200);
    expect(clear).not.toHaveBeenCalled();
    expect(spies[0]?.where).toEqual({
      tenantId: "tenant-a",
      channelId: "channel-tenant-a",
      externalContactId: PHONE,
      ignored: true,
    });
    expect(spies[1]?.where).toMatchObject({
      tenantId: "tenant-a",
      id: "s-open",
      categoryOverride: null,
      category: before.category,
      categorySource: before.categorySource,
      suggestedCategory: before.suggestedCategory,
    });
    expect(spies[1]?.where.updatedAt).toBeInstanceOf(Date);
  });

  it("nao muda a sessao expirada nem a encerrada e escreve cada sessao aberta do contato", async () => {
    await build({
      contacts: [ignoredContact()],
      sessions: [
        openSession(),
        sessionRow({ id: "s-other", contactId: "c-1" }),
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

    await remove();

    for (const id of ["s-open", "s-other"]) {
      expect(sessionById(id)).toMatchObject({
        category: "PERSONAL",
        categoryOverride: "PERSONAL",
      });
    }
    for (const id of ["s-expired", "s-ended"]) {
      expect(sessionById(id)).toMatchObject({
        category: "COMMERCIAL",
        categorySource: "AUTOMATIC",
        categoryOverride: null,
      });
    }
    expect(prisma.transactions()).toBe(1);
  });

  it.each([
    [
      "erro do banco na escrita da sessao",
      (client: FakePrisma) =>
        vi
          .spyOn(client.conversationSession, "updateMany")
          .mockRejectedValueOnce(new Error("session write failed")),
    ],
    [
      "recalculo esgotando as tentativas",
      (client: FakePrisma) =>
        vi
          .spyOn(client.conversationSession, "updateMany")
          .mockResolvedValue({ count: 0 }),
    ],
  ])(
    "falha forcada (%s): 5xx, contato segue ignorado com os campos de antes, sessao sem decisao, e repetir aplica a regra inteira",
    async (_label, fail) => {
      await build({ contacts: [ignoredContact()], sessions: [openSession()] });
      const original = prisma.$transaction;
      let failing = true;
      prisma.$transaction = async <T>(fn: (tx: unknown) => Promise<T>) =>
        original(async (tx) => {
          if (failing) fail(tx as FakePrisma);
          return fn(tx);
        });

      const failed = await remove();

      expect(failed.statusCode).toBeGreaterThanOrEqual(500);
      expect(prisma.contacts[0]).toMatchObject({
        ignored: true,
        ignoredAt: T0,
        ignoredBy: "user-who-marked",
        ignoredSource: "settings",
      });
      expect(sessionById("s-open")).toMatchObject({
        category: "COMMERCIAL",
        categorySource: "AUTOMATIC",
        categoryOverride: null,
        categoryUpdatedBy: null,
      });

      failing = false;
      vi.restoreAllMocks();
      const retried = await remove();

      expect(retried.statusCode).toBe(200);
      expect(prisma.contacts[0]).toMatchObject({
        ignored: false,
        ignoredAt: null,
        ignoredBy: null,
        ignoredSource: null,
      });
      expect(sessionById("s-open")).toMatchObject({
        category: "PERSONAL",
        categorySource: "MANUAL",
        categoryOverride: "PERSONAL",
        categoryUpdatedBy: "user-tenant-a",
      });
    },
  );

  it("pedido repetido depois do sucesso nao grava a decisao de novo", async () => {
    await build({ contacts: [ignoredContact()], sessions: [openSession()] });

    const [first, second] = await Promise.all([remove(), remove()]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(
      prisma.writes.filter((write) => write.model === "conversationSession"),
    ).toHaveLength(1);
    expect(sessionById("s-open")).toMatchObject({ categoryOverride: "PERSONAL" });
  });

  it("contato que nao estava ignorado: mesmo resultado de antes, sem decisao de sessao", async () => {
    await build({
      contacts: [
        contactRow({
          id: "c-1",
          ignored: false,
          ignoredAt: null,
          ignoredBy: null,
          ignoredSource: null,
        }),
      ],
      sessions: [openSession()],
    });

    const response = await remove();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      contactId: "c-1",
      externalContactId: PHONE,
      ignored: false,
      ignoredAt: null,
    });
    expect(prisma.contacts).toHaveLength(1);
    expect(sessionById("s-open")).toMatchObject({
      category: "COMMERCIAL",
      categorySource: "AUTOMATIC",
      categoryOverride: null,
    });
    expect(
      prisma.writes.filter((write) => write.model === "conversationSession"),
    ).toHaveLength(0);
  });

  it("contato inexistente: nasce desmarcado, como antes, sem decisao de sessao", async () => {
    await build({ contacts: [], sessions: [] });

    const response = await remove();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      externalContactId: PHONE,
      ignored: false,
      ignoredAt: null,
    });
    expect(prisma.contacts).toHaveLength(1);
    expect(prisma.contacts[0]).toMatchObject({
      tenantId: "tenant-a",
      channelId: "channel-tenant-a",
      externalContactId: PHONE,
      ignored: false,
      ignoredAt: null,
      ignoredBy: null,
      ignoredSource: null,
    });
    expect(
      prisma.writes.filter((write) => write.model === "conversationSession"),
    ).toHaveLength(0);
  });

  it("a marcacao (ignored true) grava um upsert so, sem transacao e sem tocar sessao", async () => {
    await build({
      contacts: [
        contactRow({
          id: "c-1",
          ignored: false,
          ignoredAt: null,
          ignoredBy: null,
          ignoredSource: null,
        }),
      ],
      sessions: [openSession()],
    });

    const response = await byPhone({
      phone: PHONE,
      ignored: true,
      origin: "SETTINGS",
    });

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().data).sort()).toEqual([
      "contactId",
      "externalContactId",
      "ignored",
      "ignoredAt",
    ]);
    expect(prisma.contacts[0]).toMatchObject({
      ignored: true,
      ignoredBy: "user-tenant-a",
      ignoredSource: "settings",
    });
    expect(prisma.transactions()).toBe(0);
    expect(prisma.writes).toEqual([
      { model: "contact", op: "upsert", via: "root" },
    ]);
    expect(sessionById("s-open")?.categoryOverride).toBeNull();
  });

  it("a rota da conversa (D-130 6) desmarca sem transacao e sem decisao de sessao", async () => {
    await build({ contacts: [ignoredContact()], sessions: [openSession()] });

    const response = await app.inject({
      method: "PUT",
      url: "/internal/conversations/conversation-s-open/ignore",
      headers: headers("tenant-a"),
      payload: { ignored: false },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.contacts[0]).toMatchObject({ ignored: false });
    expect(prisma.transactions()).toBe(0);
    expect(sessionById("s-open")).toMatchObject({
      category: "COMMERCIAL",
      categoryOverride: null,
    });
  });
});
