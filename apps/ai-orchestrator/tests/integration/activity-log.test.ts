import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { type FastifyInstance } from "fastify";
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

// Registro de atividade (D-176) contra PostgreSQL real: assumir e devolver a
// conversa e trocar a categoria ficam registrados como ato da profissional,
// com o antes e o depois; a leitura so devolve o negocio do cabecalho e o
// registro recusa UPDATE. Sem AI_TEST_DATABASE_URL a suite e pulada.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT = "tenant-activity-a";
const OTHER_TENANT = "tenant-activity-b";
const CHANNEL = "channel-activity-a";
const OTHER_CHANNEL = "channel-activity-b";
const CONVERSATION = "conversation-activity-a";
const OTHER_CONVERSATION = "conversation-activity-b";

describe.skipIf(!databaseUrl)("activity log against PostgreSQL", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  const headers = (tenantId: string) => ({
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  });

  async function ensureConversation(
    tenantId: string,
    channelId: string,
    id: string,
    customerName: string,
  ) {
    await prisma.channelConnection.upsert({
      where: { tenantId_id: { tenantId, id: channelId } },
      update: { status: "ACTIVE" },
      create: {
        id: channelId,
        tenantId,
        userId: `user-${tenantId}`,
        provider: "EVOLUTION_GO",
        externalInstanceId: `instance-${channelId}`,
        status: "ACTIVE",
      },
    });
    await prisma.conversation.upsert({
      where: { tenantId_channelId_id: { tenantId, channelId, id } },
      update: { customerName, humanHandoff: false, status: "ACTIVE" },
      create: {
        id,
        tenantId,
        channelId,
        externalContactId: `55119${id.length}0000001`,
        customerName,
        state: {},
      },
    });
  }

  async function activity(tenantId: string, query = "") {
    const response = await app.inject({
      method: "GET",
      url: `/internal/activity${query ? `?${query}` : ""}`,
      headers: headers(tenantId),
    });
    expect(response.statusCode).toBe(200);
    return response.json().data as {
      items: Array<{
        actorType: string;
        actorId: string | null;
        area: string;
        action: string;
        entityLabel: string | null;
        changes: Array<{ field: string; before: unknown; after: unknown }>;
      }>;
      hasMore: boolean;
    };
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    app = Fastify();
    await registerInternalRoutes(app, prisma, {
      inbox: { countDeadLetters: async () => 0 },
      sessions: new SessionService(prisma, { inactivitySeconds: 3600 }),
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    for (const tenantId of [TENANT, OTHER_TENANT]) {
      await prisma.activityLog.deleteMany({ where: { tenantId } });
      await prisma.handoff.deleteMany({ where: { tenantId } });
      await prisma.humanTakeover.deleteMany({ where: { tenantId } });
      await prisma.conversationSession.deleteMany({ where: { tenantId } });
    }
    await ensureConversation(TENANT, CHANNEL, CONVERSATION, "Ana");
    await ensureConversation(
      OTHER_TENANT,
      OTHER_CHANNEL,
      OTHER_CONVERSATION,
      "Bruna",
    );
  });

  it("registra assumir, devolver e trocar a categoria como ato da profissional", async () => {
    for (const action of ["takeover", "release"]) {
      const response = await app.inject({
        method: "POST",
        url: `/internal/conversations/${CONVERSATION}/${action}`,
        headers: headers(TENANT),
      });
      expect(response.statusCode).toBe(200);
    }
    const categorized = await app.inject({
      method: "PUT",
      url: `/internal/conversations/${CONVERSATION}/category`,
      headers: headers(TENANT),
      payload: { category: "PERSONAL", scope: "CONVERSATION" },
    });
    expect(categorized.statusCode).toBe(200);

    const { items } = await activity(TENANT);
    expect(items.map((item) => item.action)).toEqual([
      "conversation.category_changed",
      "conversation.released_to_ai",
      "conversation.taken_over",
    ]);
    for (const item of items) {
      expect(item).toMatchObject({
        actorType: "USER",
        actorId: `user-${TENANT}`,
        area: "CONVERSATIONS",
        entityLabel: "Ana",
      });
    }
    expect(items[0].changes).toEqual([
      { field: "category", before: "UNCLASSIFIED", after: "PERSONAL" },
    ]);
  });

  it("nunca mostra o registro de um negocio para outro", async () => {
    await app.inject({
      method: "POST",
      url: `/internal/conversations/${CONVERSATION}/takeover`,
      headers: headers(TENANT),
    });
    await app.inject({
      method: "POST",
      url: `/internal/conversations/${OTHER_CONVERSATION}/takeover`,
      headers: headers(OTHER_TENANT),
    });

    expect((await activity(TENANT)).items.map((i) => i.entityLabel)).toEqual([
      "Ana",
    ]);
    expect(
      (await activity(OTHER_TENANT)).items.map((i) => i.entityLabel),
    ).toEqual(["Bruna"]);
    expect((await activity(OTHER_TENANT, "q=Ana")).items).toEqual([]);
    // Nem a conversa de outro negocio aceita o comando.
    const crossed = await app.inject({
      method: "POST",
      url: `/internal/conversations/${CONVERSATION}/takeover`,
      headers: headers(OTHER_TENANT),
    });
    expect(crossed.statusCode).toBe(404);
    expect((await activity(OTHER_TENANT)).items).toHaveLength(1);
  });

  it("recusa UPDATE no registro: ele so cresce", async () => {
    await app.inject({
      method: "POST",
      url: `/internal/conversations/${CONVERSATION}/takeover`,
      headers: headers(TENANT),
    });
    const row = await prisma.activityLog.findFirstOrThrow({
      where: { tenantId: TENANT },
    });
    await expect(
      prisma.activityLog.update({
        where: { id: row.id },
        data: { entityLabel: "Outro" },
      }),
    ).rejects.toThrow(/append-only/u);
  });
});
