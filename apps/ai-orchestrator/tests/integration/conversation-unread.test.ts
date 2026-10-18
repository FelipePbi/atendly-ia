import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { type FastifyInstance } from "fastify";
import pg from "pg";
import {
  afterAll,
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

const [{ registerInternalRoutes }, { expectedToken }, { SessionService }] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
    import("../../src/modules/session/SessionService.js"),
  ]);
type SessionServiceInstance = InstanceType<typeof SessionService>;

// Conversas nao lidas (D-195) contra PostgreSQL real: a coluna e o backfill
// da migration, o `unreadCount` da lista e do detalhe, a marca de leitura e o
// resumo da navegacao. Sem AI_TEST_DATABASE_URL a suite e pulada.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const MIGRATION_SQL = readFileSync(
  fileURLToPath(
    new URL(
      "../../prisma/migrations/20261018120000_conversation_owner_read/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

const TENANT = "tenant-d187-unread";
const OTHER_TENANT = "tenant-d187-unread-other";
const CHANNEL = "channel-d187-unread";
const OTHER_CHANNEL = "channel-d187-unread-other";

const MARIA = { id: "conversation-d187-maria", phone: "5511955550001" };
const JOAO = { id: "conversation-d187-joao", phone: "5511955550002" };
const MAE = { id: "conversation-d187-mae", phone: "5511955550003" };
const IGNORADO = { id: "conversation-d187-ignorado", phone: "5511955550004" };
const OUTRO = { id: "conversation-d187-outro", phone: "5511955550005" };

const policy = { inactivitySeconds: 3600 };

const at = (minute: number) =>
  new Date(Date.UTC(2026, 8, 18, 12, minute, 0, 0));

describe.skipIf(!databaseUrl)(
  "D-195 conversas nao lidas against PostgreSQL",
  () => {
    let prisma: PrismaClient;
    let sessions: SessionServiceInstance;
    let app: FastifyInstance;
    let raw: pg.Client;

    const headers = (tenantId = TENANT) => ({
      authorization: `Bearer ${expectedToken("command")}`,
      "x-service-audience": "ai-orchestrator",
      "x-tenant-id": tenantId,
      "x-user-id": `user-${tenantId}`,
    });

    async function channel(tenantId: string, id: string) {
      await prisma.channelConnection.upsert({
        where: { tenantId_id: { tenantId, id } },
        update: { status: "ACTIVE" },
        create: {
          id,
          tenantId,
          userId: `user-${tenantId}`,
          provider: "EVOLUTION_GO",
          externalInstanceId: `instance-${id}`,
          status: "ACTIVE",
        },
      });
    }

    async function conversation(
      item: { id: string; phone: string },
      name: string | null,
      tenantId = TENANT,
      channelId = CHANNEL,
    ) {
      await prisma.conversation.create({
        data: {
          id: item.id,
          tenantId,
          channelId,
          externalContactId: item.phone,
          customerName: name,
          state: {},
          updatedAt: at(0),
        },
      });
      await sessions.resolveContext({
        tenantId,
        channelId,
        conversationId: item.id,
        externalContactId: item.phone,
        customerName: name,
      });
    }

    let sequence = 0;
    async function message(
      conversationId: string,
      kind: "CUSTOMER" | "AI" | "OWNER",
      body: string,
      createdAt: Date,
      tenantId = TENANT,
      channelId = CHANNEL,
    ) {
      sequence += 1;
      return prisma.message.create({
        data: {
          tenantId,
          channelId,
          conversationId,
          externalMessageId: `d187-${sequence}`,
          direction: kind === "CUSTOMER" ? "INBOUND" : "OUTBOUND",
          source: kind,
          role: kind === "CUSTOMER" ? "user" : "assistant",
          body,
          createdAt,
        },
      });
    }

    async function unreadOf(id: string) {
      const response = await app.inject({
        method: "GET",
        url: `/internal/conversations/${id}`,
        headers: headers(),
      });
      expect(response.statusCode).toBe(200);
      return response.json().data.unreadCount as number;
    }

    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
      });
      raw = new pg.Client({ connectionString: databaseUrl });
      await raw.connect();
      sessions = new SessionService(prisma, policy);
      app = Fastify();
      await registerInternalRoutes(app, prisma, {
        inbox: { countDeadLetters: async () => 0 },
        sessions,
      });
    });

    afterAll(async () => {
      await app?.close();
      await raw?.end();
      await prisma?.$disconnect();
    });

    beforeEach(async () => {
      for (const tenantId of [TENANT, OTHER_TENANT]) {
        await prisma.message.deleteMany({ where: { tenantId } });
        await prisma.conversationSession.deleteMany({ where: { tenantId } });
        await prisma.conversation.deleteMany({ where: { tenantId } });
        await prisma.contact.deleteMany({ where: { tenantId } });
      }
      await channel(TENANT, CHANNEL);
      await channel(OTHER_TENANT, OTHER_CHANNEL);
    });

    it("adds a nullable column and the backfill marks only the conversations still unmarked", async () => {
      const column = await raw.query<{
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_name = 'Conversation' AND column_name = 'ownerReadAt'`,
      );
      expect(column.rows).toEqual([
        {
          data_type: "timestamp without time zone",
          is_nullable: "YES",
          column_default: null,
        },
      ]);

      await conversation(MARIA, "Maria");
      await conversation(JOAO, "João");
      await prisma.$executeRaw`
        UPDATE "Conversation" SET "ownerReadAt" = ${at(5)} WHERE "id" = ${JOAO.id}
      `;

      await raw.query(MIGRATION_SQL);
      const after = await prisma.conversation.findMany({
        where: { tenantId: TENANT },
        orderBy: { id: "asc" },
        select: { id: true, ownerReadAt: true },
      });
      const joao = after.find((item) => item.id === JOAO.id);
      const maria = after.find((item) => item.id === MARIA.id);
      expect(joao?.ownerReadAt).toEqual(at(5));
      expect(maria?.ownerReadAt).not.toBeNull();

      await raw.query(MIGRATION_SQL);
      expect(
        await prisma.conversation.findMany({
          where: { tenantId: TENANT },
          orderBy: { id: "asc" },
          select: { id: true, ownerReadAt: true },
        }),
      ).toEqual(after);
    });

    it("counts customer messages after the read mark until the owner replies", async () => {
      await conversation(MARIA, "Maria");
      await message(MARIA.id, "CUSTOMER", "Oi", at(1));
      await message(MARIA.id, "CUSTOMER", "Tem horário amanhã?", at(2));
      // Nunca aberta: as duas contam.
      expect(await unreadOf(MARIA.id)).toBe(2);

      // A IA respondeu: a profissional continua sem ter visto.
      await message(MARIA.id, "AI", "Tenho às 10h.", at(3));
      expect(await unreadOf(MARIA.id)).toBe(2);

      const list = await app.inject({
        method: "GET",
        url: "/internal/conversations",
        headers: headers(),
      });
      expect(list.json().data).toEqual([
        expect.objectContaining({ id: MARIA.id, unreadCount: 2 }),
      ]);

      // A profissional respondeu (pelo app ou pelo WhatsApp): viu tudo antes.
      await message(MARIA.id, "OWNER", "Pode vir às 10h", at(4));
      expect(await unreadOf(MARIA.id)).toBe(0);

      await message(MARIA.id, "CUSTOMER", "Combinado", at(5));
      expect(await unreadOf(MARIA.id)).toBe(1);
    });

    it("marks as read through the shown message, never backwards and without touching updatedAt", async () => {
      await conversation(MARIA, "Maria");
      const first = await message(MARIA.id, "CUSTOMER", "Oi", at(1));
      await message(MARIA.id, "CUSTOMER", "Tudo bem?", at(2));
      const before = await prisma.conversation.findUniqueOrThrow({
        where: { id: MARIA.id },
      });

      const partial = await app.inject({
        method: "POST",
        url: `/internal/conversations/${MARIA.id}/read`,
        headers: headers(),
        payload: { readThrough: first.createdAt.toISOString() },
      });
      expect(partial.statusCode).toBe(200);
      expect(partial.json().data).toMatchObject({
        id: MARIA.id,
        unreadCount: 1,
      });

      const full = await app.inject({
        method: "POST",
        url: `/internal/conversations/${MARIA.id}/read`,
        headers: headers(),
      });
      expect(full.json().data.unreadCount).toBe(0);

      // Uma marca mais antiga nao "desve" o que ja foi visto.
      await app.inject({
        method: "POST",
        url: `/internal/conversations/${MARIA.id}/read`,
        headers: headers(),
        payload: { readThrough: at(0).toISOString() },
      });
      expect(await unreadOf(MARIA.id)).toBe(0);

      const after = await prisma.conversation.findUniqueOrThrow({
        where: { id: MARIA.id },
      });
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it("refuses to mark a conversation of another business", async () => {
      await conversation(OUTRO, "Outra", OTHER_TENANT, OTHER_CHANNEL);
      const response = await app.inject({
        method: "POST",
        url: `/internal/conversations/${OUTRO.id}/read`,
        headers: headers(),
      });
      expect(response.statusCode).toBe(404);
    });

    it("summarizes unread business conversations, without ignored contacts nor personal sessions", async () => {
      await conversation(MARIA, "Maria");
      await conversation(JOAO, null);
      await conversation(MAE, "Mãe");
      await conversation(IGNORADO, "Ignorado");
      await conversation(OUTRO, "Outra", OTHER_TENANT, OTHER_CHANNEL);

      await message(MARIA.id, "CUSTOMER", "Oi", at(1));
      await message(MARIA.id, "CUSTOMER", "\n  Quero marcar\nsegunda linha", at(4));
      await message(JOAO.id, "CUSTOMER", "Bom dia", at(3));
      await message(MAE.id, "CUSTOMER", "Filho, liga pra mim", at(5));
      await message(IGNORADO.id, "CUSTOMER", "Promoção!", at(6));
      await message(
        OUTRO.id,
        "CUSTOMER",
        "De outro negócio",
        at(7),
        OTHER_TENANT,
        OTHER_CHANNEL,
      );
      await prisma.conversationSession.updateMany({
        where: { tenantId: TENANT, conversationId: MAE.id },
        data: { category: "PERSONAL" },
      });
      await prisma.contact.updateMany({
        where: { tenantId: TENANT, externalContactId: IGNORADO.phone },
        data: { ignored: true },
      });

      const response = await app.inject({
        method: "GET",
        url: "/internal/conversations/unread-summary",
        headers: headers(),
      });
      expect(response.statusCode).toBe(200);
      const summary = response.json().data;
      expect(summary.unreadConversations).toBe(2);
      expect(summary.recent).toEqual([
        expect.objectContaining({
          conversationId: MARIA.id,
          customerName: "Maria",
          externalContactId: MARIA.phone,
          kind: "TEXT",
          preview: "Quero marcar",
          createdAt: at(4).toISOString(),
        }),
        expect.objectContaining({
          conversationId: JOAO.id,
          customerName: null,
          preview: "Bom dia",
        }),
      ]);

      // A conversa pessoal continua com o proprio contador na linha.
      expect(await unreadOf(MAE.id)).toBe(1);

      await app.inject({
        method: "POST",
        url: `/internal/conversations/${MARIA.id}/read`,
        headers: headers(),
      });
      const afterRead = await app.inject({
        method: "GET",
        url: "/internal/conversations/unread-summary",
        headers: headers(),
      });
      expect(afterRead.json().data.unreadConversations).toBe(1);
      expect(
        afterRead
          .json()
          .data.recent.map((item: { conversationId: string }) => item.conversationId),
      ).toEqual([JOAO.id]);
    });

    it("answers zero and an empty list when nothing is unread", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/internal/conversations/unread-summary",
        headers: headers(),
      });
      expect(response.json().data).toEqual({
        unreadConversations: 0,
        recent: [],
      });
    });
  },
);
