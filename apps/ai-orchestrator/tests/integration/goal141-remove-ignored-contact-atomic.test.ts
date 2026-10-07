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

// Goal141/WU-02 contra PostgreSQL real: "Remover" pela rota por telefone grava
// tudo ou nada. Sem AI_TEST_DATABASE_URL a suite e pulada, como as demais de
// integracao.
//
// O mecanismo de falha e de pausa fica so aqui: um espiao sobre
// `writeEffectiveCategory`, o metodo que o "Remover" chama dentro da transacao
// para gravar a decisao de cada sessao aberta. Ele falha ou espera um
// `Deferred` e depois chama o metodo original. Nenhum gancho entra no codigo de
// producao.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT = "tenant-goal141-remove";
const CHANNEL = "channel-goal141-remove";
const CONVERSATION = "conversation-goal141-chat";
const PHONE = "5511966660001";
const ACTOR = `user-${TENANT}`;

const policy = { inactivitySeconds: 3600 };

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// `writeEffectiveCategory` e privado: o espiao enxerga so o que os testes usam.
interface CategoryWriter {
  writeEffectiveCategory: (...args: unknown[]) => Promise<unknown>;
}

describe.skipIf(!databaseUrl)(
  "Goal141 remove an ignored contact all or nothing against PostgreSQL",
  () => {
    let prisma: PrismaClient;
    // Outro cliente, outra conexao: a leitura "de fora" da transacao do Remover.
    let outsider: PrismaClient;
    let sessions: SessionServiceInstance;
    let writer: CategoryWriter;
    let app: FastifyInstance;

    const headers = {
      authorization: `Bearer ${expectedToken("command")}`,
      "x-service-audience": "ai-orchestrator",
      "x-tenant-id": TENANT,
      "x-user-id": ACTOR,
    };

    const byPhone = (payload: object) =>
      app.inject({
        method: "PUT",
        url: "/internal/contacts/ignore",
        headers,
        payload,
      });

    const scope = {
      tenantId: TENANT,
      channelId: CHANNEL,
      conversationId: CONVERSATION,
      externalContactId: PHONE,
    };

    const evaluate = (sessionId: string) =>
      sessions.evaluate({
        tenantId: TENANT,
        sessionId,
        observedInboundVersion: 0,
        aiEnabled: true,
        channelConnected: true,
      });

    const contactOf = (db: PrismaClient) =>
      db.contact.findFirstOrThrow({
        where: { tenantId: TENANT, externalContactId: PHONE },
      });

    const sessionOf = (db: PrismaClient, sessionId: string) =>
      db.conversationSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: TENANT, id: sessionId } },
      });

    async function openSessionForIgnoredContact() {
      const opened = await sessions.resolveContext(scope);
      const marked = await byPhone({ phone: PHONE, ignored: true });
      expect(marked.statusCode).toBe(200);
      return opened;
    }

    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
      });
      outsider = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
      });
      sessions = new SessionService(prisma, policy);
      writer = sessions as unknown as CategoryWriter;
      app = Fastify();
      await registerInternalRoutes(app, prisma, {
        inbox: { countDeadLetters: async () => 0 },
        sessions,
      });
    });

    afterAll(async () => {
      await app?.close();
      await prisma?.$disconnect();
      await outsider?.$disconnect();
    });

    beforeEach(async () => {
      await prisma.conversationSession.deleteMany({ where: { tenantId: TENANT } });
      await prisma.conversation.updateMany({
        where: { tenantId: TENANT },
        data: { contactId: null },
      });
      await prisma.contact.deleteMany({ where: { tenantId: TENANT } });
      await prisma.channelConnection.upsert({
        where: { tenantId_id: { tenantId: TENANT, id: CHANNEL } },
        update: { status: "ACTIVE" },
        create: {
          id: CHANNEL,
          tenantId: TENANT,
          userId: ACTOR,
          provider: "EVOLUTION_GO",
          externalInstanceId: `instance-${CHANNEL}`,
          status: "ACTIVE",
        },
      });
      await prisma.conversation.upsert({
        where: {
          tenantId_channelId_id: {
            tenantId: TENANT,
            channelId: CHANNEL,
            id: CONVERSATION,
          },
        },
        update: { externalContactId: PHONE },
        create: {
          id: CONVERSATION,
          tenantId: TENANT,
          channelId: CHANNEL,
          externalContactId: PHONE,
          customerName: "Cliente Goal141",
          state: {},
        },
      });
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await prisma.conversationSession.deleteMany({ where: { tenantId: TENANT } });
    });

    it("(i) a failing session write rolls the contact back, and the repeated request applies the whole rule", async () => {
      const opened = await openSessionForIgnoredContact();
      const before = await contactOf(prisma);
      expect(before.ignored).toBe(true);
      expect(before.ignoredAt).not.toBeNull();
      expect(before.ignoredBy).toBe(ACTOR);
      expect(await evaluate(opened.sessionId)).toEqual({
        reason: "contact_ignored",
      });

      const failure = vi
        .spyOn(writer, "writeEffectiveCategory")
        .mockRejectedValueOnce(new Error("goal141 forced session write failure"));
      const failed = await byPhone({ phone: PHONE, ignored: false });

      expect(failure).toHaveBeenCalledTimes(1);
      expect(failed.statusCode).toBeGreaterThanOrEqual(500);
      const afterFailure = await contactOf(prisma);
      expect(afterFailure).toMatchObject({
        ignored: true,
        ignoredAt: before.ignoredAt,
        ignoredBy: before.ignoredBy,
        ignoredSource: before.ignoredSource,
      });
      expect(await sessionOf(prisma, opened.sessionId)).toMatchObject({
        category: "UNCLASSIFIED",
        categorySource: "AUTOMATIC",
        categoryOverride: null,
        categoryUpdatedBy: null,
      });
      expect(await evaluate(opened.sessionId)).toEqual({
        reason: "contact_ignored",
      });

      // Sem a falha, o mesmo pedido encontra o contato ainda ignorado.
      vi.restoreAllMocks();
      const repeated = await byPhone({ phone: PHONE, ignored: false });

      expect(repeated.statusCode).toBe(200);
      expect(await contactOf(prisma)).toMatchObject({
        ignored: false,
        ignoredAt: null,
        ignoredBy: null,
        ignoredSource: null,
      });
      expect(await sessionOf(prisma, opened.sessionId)).toMatchObject({
        category: "PERSONAL",
        categorySource: "MANUAL",
        categoryOverride: "PERSONAL",
        categoryUpdatedBy: ACTOR,
      });
      const refused = await evaluate(opened.sessionId);
      expect(refused.reason).not.toBeNull();
      expect(refused.reason).not.toBe("contact_ignored");
    });

    it("(ii) another client sees the contact still ignored until the transaction commits, then contact and session change together", async () => {
      const opened = await openSessionForIgnoredContact();
      const original = writer.writeEffectiveCategory.bind(writer);
      const reached = deferred();
      const release = deferred();
      vi.spyOn(writer, "writeEffectiveCategory").mockImplementation(
        async (...args) => {
          // A limpeza do contato ja foi feita; a sessao ainda nao.
          reached.resolve();
          await release.promise;
          return original(...args);
        },
      );

      const pending = byPhone({ phone: PHONE, ignored: false });
      await reached.promise;

      const seenContact = await contactOf(outsider);
      const seenSession = await sessionOf(outsider, opened.sessionId);
      expect(seenContact.ignored).toBe(true);
      expect(seenContact.ignoredSource).not.toBeNull();
      expect(seenSession).toMatchObject({
        category: "UNCLASSIFIED",
        categoryOverride: null,
      });

      release.resolve();
      const removed = await pending;

      expect(removed.statusCode).toBe(200);
      expect(await contactOf(outsider)).toMatchObject({
        ignored: false,
        ignoredAt: null,
        ignoredBy: null,
        ignoredSource: null,
      });
      expect(await sessionOf(outsider, opened.sessionId)).toMatchObject({
        category: "PERSONAL",
        categorySource: "MANUAL",
        categoryOverride: "PERSONAL",
        categoryUpdatedBy: ACTOR,
      });
    });

    it("(iii) two simultaneous removals both answer 200 and write one decision", async () => {
      const opened = await openSessionForIgnoredContact();
      const original = writer.writeEffectiveCategory.bind(writer);
      const reached = deferred();
      const release = deferred();
      let firstCall = true;
      const spy = vi
        .spyOn(writer, "writeEffectiveCategory")
        .mockImplementation(async (...args) => {
          // So a primeira escrita espera: a segunda requisicao entra enquanto a
          // transacao da primeira ainda esta aberta.
          if (firstCall) {
            firstCall = false;
            reached.resolve();
            await release.promise;
          }
          return original(...args);
        });

      const first = byPhone({ phone: PHONE, ignored: false });
      await reached.promise;
      const second = byPhone({ phone: PHONE, ignored: false });
      await new Promise((done) => setTimeout(done, 300));
      release.resolve();
      const [firstResponse, secondResponse] = await Promise.all([first, second]);

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(await contactOf(prisma)).toMatchObject({
        ignored: false,
        ignoredAt: null,
        ignoredBy: null,
        ignoredSource: null,
      });
      expect(await sessionOf(prisma, opened.sessionId)).toMatchObject({
        category: "PERSONAL",
        categorySource: "MANUAL",
        categoryOverride: "PERSONAL",
        categoryUpdatedBy: ACTOR,
      });
      const decisions = await prisma.conversationSession.findMany({
        where: { tenantId: TENANT, categoryOverride: "PERSONAL" },
      });
      expect(decisions).toHaveLength(1);
    });

    it("(iv) the next session of the same contact is born without the decision", async () => {
      const opened = await openSessionForIgnoredContact();
      const removed = await byPhone({ phone: PHONE, ignored: false });
      expect(removed.statusCode).toBe(200);
      expect((await sessionOf(prisma, opened.sessionId)).categoryOverride).toBe(
        "PERSONAL",
      );

      // Depois da inatividade (D-009) a sessao anterior fecha e a nova nasce
      // sem a decisao "so esta conversa".
      await prisma.conversationSession.update({
        where: { tenantId_id: { tenantId: TENANT, id: opened.sessionId } },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const next = await sessions.resolveContext(scope);

      expect(next.sessionId).not.toBe(opened.sessionId);
      expect(next).toMatchObject({
        category: "UNCLASSIFIED",
        categorySource: "AUTOMATIC",
      });
      expect((await sessionOf(prisma, next.sessionId)).categoryOverride).toBeNull();
      expect(await evaluate(next.sessionId)).toEqual({ reason: null });
    });
  },
);
