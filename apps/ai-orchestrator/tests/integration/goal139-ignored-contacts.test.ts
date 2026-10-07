import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { type FastifyInstance } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

// Importados depois do stub: `env` le o token uma unica vez, na primeira carga.
const [{ registerInternalRoutes }, { expectedToken }, { SessionService }] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
    import("../../src/modules/session/SessionService.js"),
  ]);
type SessionServiceInstance = InstanceType<typeof SessionService>;

// Goal139/WU-01 contra PostgreSQL real: a leitura dos contatos ignorados com a
// origem de cada marcacao e a regra de "Remover" pela rota por telefone. Sem
// AI_TEST_DATABASE_URL a suite e pulada, como as demais de integracao.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT = "tenant-goal139-ignored";
const OTHER_TENANT = "tenant-goal139-other";
const CHANNEL = "channel-goal139-ignored";
const OTHER_TENANT_CHANNEL = "channel-goal139-other-tenant";

const CONVERSATION = "conversation-goal139-chat";
const CHAT_PHONE = "5511977770001";
const ONBOARDING_PHONE = "5511977770002";
const SETTINGS_PHONE = "5511977770003";
const REMOVED_PHONE = "5511977770004";

const policy = { inactivitySeconds: 3600 };

describe.skipIf(!databaseUrl)("Goal139 ignored contacts against PostgreSQL", () => {
  let prisma: PrismaClient;
  let sessions: SessionServiceInstance;
  let app: FastifyInstance;

  const headers = (tenantId: string) => ({
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  });

  const byPhone = (payload: object, tenantId = TENANT) =>
    app.inject({
      method: "PUT",
      url: "/internal/contacts/ignore",
      headers: headers(tenantId),
      payload,
    });

  const scopeOf = (conversationId: string, phone: string) => ({
    tenantId: TENANT,
    channelId: CHANNEL,
    conversationId,
    externalContactId: phone,
  });

  async function ensureChannel(
    id: string,
    tenantId: string,
    status: "ACTIVE" | "INACTIVE",
  ) {
    await prisma.channelConnection.upsert({
      where: { tenantId_id: { tenantId, id } },
      update: { status },
      create: {
        id,
        tenantId,
        userId: `user-${tenantId}`,
        provider: "EVOLUTION_GO",
        externalInstanceId: `instance-${id}`,
        status,
      },
    });
  }

  async function ensureConversation(id: string, phone: string) {
    await prisma.conversation.upsert({
      where: {
        tenantId_channelId_id: { tenantId: TENANT, channelId: CHANNEL, id },
      },
      update: { externalContactId: phone },
      create: {
        id,
        tenantId: TENANT,
        channelId: CHANNEL,
        externalContactId: phone,
        customerName: "Cliente Goal139",
        state: {},
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    sessions = new SessionService(prisma, policy);
    app = Fastify();
    await registerInternalRoutes(app, prisma, {
      inbox: { countDeadLetters: async () => 0 },
      sessions,
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    for (const tenantId of [TENANT, OTHER_TENANT]) {
      await prisma.conversationSession.deleteMany({ where: { tenantId } });
      await prisma.conversation.updateMany({
        where: { tenantId },
        data: { contactId: null },
      });
      await prisma.contact.deleteMany({ where: { tenantId } });
    }
    await ensureChannel(CHANNEL, TENANT, "ACTIVE");
    await ensureChannel(OTHER_TENANT_CHANNEL, OTHER_TENANT, "ACTIVE");
    await ensureConversation(CONVERSATION, CHAT_PHONE);
  });

  afterEach(async () => {
    await prisma.conversationSession.deleteMany({ where: { tenantId: TENANT } });
  });

  it("reads the three origins with their dates, only for the active channel and tenant", async () => {
    // Onboarding por telefone, conversa marcada no painel e telefone marcado em
    // Configuracoes; mais um contato ignorado de outro tenant. (O banco admite
    // um unico canal por tenant e provedor; o contato de outro canal do mesmo
    // tenant fica na prova de unidade.)
    const onboarding = await byPhone({
      phone: ONBOARDING_PHONE,
      ignored: true,
      origin: "ONBOARDING",
    });
    expect(onboarding.statusCode).toBe(200);

    await sessions.resolveContext(scopeOf(CONVERSATION, CHAT_PHONE));
    const chat = await app.inject({
      method: "PUT",
      url: `/internal/conversations/${CONVERSATION}/ignore`,
      headers: headers(TENANT),
      payload: { ignored: true, origin: "CONVERSATION" },
    });
    expect(chat.statusCode).toBe(200);

    const settings = await byPhone({
      phone: SETTINGS_PHONE,
      ignored: true,
      origin: "SETTINGS",
    });
    expect(settings.statusCode).toBe(200);

    await prisma.contact.create({
      data: {
        tenantId: OTHER_TENANT,
        channelId: OTHER_TENANT_CHANNEL,
        externalContactId: "5511977779999",
        ignored: true,
        ignoredAt: new Date(),
        ignoredSource: "onboarding",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/internal/contacts/ignored",
      headers: headers(TENANT),
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.total).toBe(3);
    expect(
      data.items.map(
        (item: { externalContactId: string }) => item.externalContactId,
      ),
    ).toEqual([ONBOARDING_PHONE, CHAT_PHONE, SETTINGS_PHONE]);
    expect(
      data.items.map((item: { origin: string | null }) => item.origin),
    ).toEqual(["ONBOARDING", "CONVERSATION", "SETTINGS"]);
    expect(data.items[1].displayName).toBe("Cliente Goal139");
    expect(data.items[0].displayName).toBeNull();
    for (const item of data.items as { ignoredAt: string | null }[]) {
      expect(item.ignoredAt).not.toBeNull();
      expect(Number.isNaN(Date.parse(item.ignoredAt as string))).toBe(false);
    }
    const dates = (data.items as { ignoredAt: string }[]).map((item) =>
      Date.parse(item.ignoredAt),
    );
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);

    const page = await app.inject({
      method: "GET",
      url: "/internal/contacts/ignored?limit=1&offset=1",
      headers: headers(TENANT),
    });
    expect(page.json().data.total).toBe(3);
    expect(page.json().data.items).toHaveLength(1);
    expect(page.json().data.items[0].externalContactId).toBe(CHAT_PHONE);
  });

  it("puts the unknown stored source and a missing date at the end as null origin", async () => {
    await prisma.contact.create({
      data: {
        tenantId: TENANT,
        channelId: CHANNEL,
        externalContactId: "5511977770010",
        ignored: true,
        ignoredAt: null,
        ignoredSource: "legacy-import",
      },
    });
    await byPhone({ phone: ONBOARDING_PHONE, ignored: true });

    const response = await app.inject({
      method: "GET",
      url: "/internal/contacts/ignored",
      headers: headers(TENANT),
    });

    const items = response.json().data.items;
    expect(items.map((item: { origin: string | null }) => item.origin)).toEqual([
      "ONBOARDING",
      null,
    ]);
    expect(items[1]).toMatchObject({ ignoredAt: null, origin: null });
  });

  it("refuses the read without an active channel like the phone mark does", async () => {
    await ensureChannel(CHANNEL, TENANT, "INACTIVE");

    const response = await app.inject({
      method: "GET",
      url: "/internal/contacts/ignored",
      headers: headers(TENANT),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("CHANNEL_CONNECTION_NOT_FOUND");
  });

  describe("Remover pela rota por telefone", () => {
    async function openSessionForIgnoredContact() {
      await ensureConversation(CONVERSATION, REMOVED_PHONE);
      const opened = await sessions.resolveContext(
        scopeOf(CONVERSATION, REMOVED_PHONE),
      );
      await byPhone({ phone: REMOVED_PHONE, ignored: true });
      return opened;
    }

    const evaluate = (sessionId: string) =>
      sessions.evaluate({
        tenantId: TENANT,
        sessionId,
        observedInboundVersion: 0,
        aiEnabled: true,
        channelConnected: true,
      });

    it("keeps the open session out of the AI and the next session does not inherit the decision", async () => {
      const opened = await openSessionForIgnoredContact();
      expect(await evaluate(opened.sessionId)).toEqual({
        reason: "contact_ignored",
      });

      const removed = await byPhone({ phone: REMOVED_PHONE, ignored: false });

      expect(removed.statusCode).toBe(200);
      const contact = await prisma.contact.findFirstOrThrow({
        where: { tenantId: TENANT, externalContactId: REMOVED_PHONE },
      });
      expect(contact).toMatchObject({
        ignored: false,
        ignoredAt: null,
        ignoredBy: null,
        ignoredSource: null,
        categoryOverride: null,
      });
      const session = await prisma.conversationSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: TENANT, id: opened.sessionId } },
      });
      expect(session).toMatchObject({
        category: "PERSONAL",
        categorySource: "MANUAL",
        categoryOverride: "PERSONAL",
        categoryUpdatedBy: `user-${TENANT}`,
      });
      // A guarda de envio recusa a IA nesta sessao, mesmo com o contato livre.
      const refused = await evaluate(opened.sessionId);
      expect(refused.reason).not.toBeNull();
      expect(refused.reason).not.toBe("contact_ignored");

      // Depois da inatividade (D-009) a sessao anterior fecha e a nova nasce
      // sem a decisao "so esta conversa".
      await prisma.conversationSession.update({
        where: { tenantId_id: { tenantId: TENANT, id: opened.sessionId } },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const next = await sessions.resolveContext(
        scopeOf(CONVERSATION, REMOVED_PHONE),
      );

      expect(next.sessionId).not.toBe(opened.sessionId);
      expect(next).toMatchObject({
        category: "UNCLASSIFIED",
        categorySource: "AUTOMATIC",
      });
      const fresh = await prisma.conversationSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: TENANT, id: next.sessionId } },
      });
      expect(fresh.categoryOverride).toBeNull();
      expect(await evaluate(next.sessionId)).toEqual({ reason: null });
    });

    it("leaves an expired session untouched", async () => {
      const opened = await openSessionForIgnoredContact();
      await prisma.conversationSession.update({
        where: { tenantId_id: { tenantId: TENANT, id: opened.sessionId } },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      await byPhone({ phone: REMOVED_PHONE, ignored: false });

      const session = await prisma.conversationSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: TENANT, id: opened.sessionId } },
      });
      expect(session).toMatchObject({
        category: "UNCLASSIFIED",
        categoryOverride: null,
      });
    });

    it("does not touch the sessions of a contact that was not ignored", async () => {
      await ensureConversation(CONVERSATION, REMOVED_PHONE);
      const opened = await sessions.resolveContext(
        scopeOf(CONVERSATION, REMOVED_PHONE),
      );

      const removed = await byPhone({ phone: REMOVED_PHONE, ignored: false });

      expect(removed.statusCode).toBe(200);
      const session = await prisma.conversationSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: TENANT, id: opened.sessionId } },
      });
      expect(session).toMatchObject({
        category: "UNCLASSIFIED",
        categoryOverride: null,
      });
      expect(await evaluate(opened.sessionId)).toEqual({ reason: null });
    });

    it("gives the AI back at once when the chat route clears the mark (D-130 6)", async () => {
      const opened = await openSessionForIgnoredContact();

      const cleared = await app.inject({
        method: "PUT",
        url: `/internal/conversations/${CONVERSATION}/ignore`,
        headers: headers(TENANT),
        payload: { ignored: false },
      });

      expect(cleared.statusCode).toBe(200);
      const session = await prisma.conversationSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: TENANT, id: opened.sessionId } },
      });
      expect(session).toMatchObject({
        category: "UNCLASSIFIED",
        categoryOverride: null,
      });
      expect(await evaluate(opened.sessionId)).toEqual({ reason: null });
    });
  });
});
