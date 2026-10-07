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

// Importados depois do stub: `env` le o token uma unica vez, na primeira carga.
const [{ registerInternalRoutes }, { expectedToken }, { SessionService }] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
    import("../../src/modules/session/SessionService.js"),
  ]);
type SessionServiceInstance = InstanceType<typeof SessionService>;

// Goal146/WU-01 contra PostgreSQL real: as duas colunas novas do contato, o
// backfill da migration e a lista de conversas por `customerId`. Sem
// AI_TEST_DATABASE_URL a suite e pulada, como as demais de integracao.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const MIGRATION_SQL = readFileSync(
  fileURLToPath(
    new URL(
      "../../prisma/migrations/20261007120000_goal146_contact_last_scheduled_customer/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

const TENANT = "tenant-goal146-last-scheduled";
const CHANNEL = "channel-goal146-last-scheduled";

const MARIA = "customer-goal146-maria";
const PEDRO = "customer-goal146-pedro";

const MARIA_CONVERSATION = "conversation-goal146-maria";
const MARIA_PHONE = "5511966660001";
const OTHER_CONVERSATION = "conversation-goal146-other";
const OTHER_PHONE = "5511966660002";

const policy = { inactivitySeconds: 3600 };

describe.skipIf(!databaseUrl)(
  "Goal146 Contact.lastScheduledCustomerId against PostgreSQL",
  () => {
    let prisma: PrismaClient;
    let sessions: SessionServiceInstance;
    let app: FastifyInstance;
    let raw: pg.Client;

    const headers = {
      authorization: `Bearer ${expectedToken("command")}`,
      "x-service-audience": "ai-orchestrator",
      "x-tenant-id": TENANT,
      "x-user-id": `user-${TENANT}`,
    };

    const scopeOf = (conversationId: string, phone: string) => ({
      tenantId: TENANT,
      channelId: CHANNEL,
      conversationId,
      externalContactId: phone,
    });

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
          customerName: "Cliente Goal146",
          state: {},
        },
      });
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
      await prisma.conversationSession.deleteMany({
        where: { tenantId: TENANT },
      });
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
          userId: `user-${TENANT}`,
          provider: "EVOLUTION_GO",
          externalInstanceId: `instance-${CHANNEL}`,
          status: "ACTIVE",
        },
      });
      await ensureConversation(MARIA_CONVERSATION, MARIA_PHONE);
      await ensureConversation(OTHER_CONVERSATION, OTHER_PHONE);
    });

    it("adds two nullable columns without a default", async () => {
      const columns = await raw.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_name = 'Contact'
            AND column_name IN ('lastScheduledCustomerId', 'lastScheduledAt')
          ORDER BY column_name`,
      );

      expect(columns.rows).toEqual([
        {
          column_name: "lastScheduledAt",
          data_type: "timestamp without time zone",
          is_nullable: "YES",
          column_default: null,
        },
        {
          column_name: "lastScheduledCustomerId",
          data_type: "text",
          is_nullable: "YES",
          column_default: null,
        },
      ]);
    });

    it("backfills the linked contact once and changes nothing on a second run", async () => {
      const linkedAt = new Date("2026-09-20T13:00:00.000Z");
      const dependentAt = new Date("2026-09-25T10:00:00.000Z");
      const linked = await prisma.contact.create({
        data: {
          tenantId: TENANT,
          channelId: CHANNEL,
          externalContactId: MARIA_PHONE,
          customerId: MARIA,
          customerLinkedAt: linkedAt,
        },
      });
      const unlinked = await prisma.contact.create({
        data: {
          tenantId: TENANT,
          channelId: CHANNEL,
          externalContactId: OTHER_PHONE,
        },
      });
      const alreadyDone = await prisma.contact.create({
        data: {
          tenantId: TENANT,
          channelId: CHANNEL,
          externalContactId: "5511966660003",
          customerId: MARIA,
          customerLinkedAt: linkedAt,
          lastScheduledCustomerId: PEDRO,
          lastScheduledAt: dependentAt,
        },
      });

      const snapshot = async () =>
        (
          await prisma.contact.findMany({
            where: { tenantId: TENANT },
            orderBy: { externalContactId: "asc" },
          })
        ).map((contact) => ({
          id: contact.id,
          customerId: contact.customerId,
          customerLinkedAt: contact.customerLinkedAt,
          lastScheduledCustomerId: contact.lastScheduledCustomerId,
          lastScheduledAt: contact.lastScheduledAt,
          updatedAt: contact.updatedAt,
        }));
      const byId = (rows: Awaited<ReturnType<typeof snapshot>>, id: string) =>
        rows.find((contact) => contact.id === id);

      await raw.query(MIGRATION_SQL);
      const afterFirst = await snapshot();

      // Copia o vinculo para a ultima pessoa agendada.
      expect(byId(afterFirst, linked.id)).toMatchObject({
        customerId: MARIA,
        lastScheduledCustomerId: MARIA,
        lastScheduledAt: linkedAt,
      });
      // Sem vinculo, nada a copiar.
      expect(byId(afterFirst, unlinked.id)).toMatchObject({
        customerId: null,
        lastScheduledCustomerId: null,
        lastScheduledAt: null,
      });
      // Quem ja tem a ultima pessoa agendada (o dependente) nao e sobrescrito.
      expect(byId(afterFirst, alreadyDone.id)).toMatchObject({
        customerId: MARIA,
        lastScheduledCustomerId: PEDRO,
        lastScheduledAt: dependentAt,
      });

      await raw.query(MIGRATION_SQL);
      expect(await snapshot()).toEqual(afterFirst);
    });

    it("lists the conversation of the linked customer by customerId", async () => {
      await sessions.resolveContext(scopeOf(MARIA_CONVERSATION, MARIA_PHONE));
      await sessions.resolveContext(scopeOf(OTHER_CONVERSATION, OTHER_PHONE));
      await prisma.contact.updateMany({
        where: {
          tenantId: TENANT,
          channelId: CHANNEL,
          externalContactId: MARIA_PHONE,
        },
        data: {
          customerId: MARIA,
          customerLinkedAt: new Date(),
          lastScheduledCustomerId: PEDRO,
          lastScheduledAt: new Date(),
        },
      });

      const ofMaria = await app.inject({
        method: "GET",
        url: `/internal/conversations?customerId=${MARIA}`,
        headers,
      });
      expect(ofMaria.statusCode).toBe(200);
      expect(
        ofMaria.json().data.map((item: { id: string }) => item.id),
      ).toEqual([MARIA_CONVERSATION]);

      // O dependente agendado nao e quem escreve: a lista segue o vinculo.
      const ofPedro = await app.inject({
        method: "GET",
        url: `/internal/conversations?customerId=${PEDRO}`,
        headers,
      });
      expect(ofPedro.statusCode).toBe(200);
      expect(ofPedro.json().data).toEqual([]);
    });
  },
);
