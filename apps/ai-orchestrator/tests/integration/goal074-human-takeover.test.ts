import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { SessionService } from "../../src/modules/session/SessionService.js";

// Registro durável de tomada de controle humano (Goal074) contra PostgreSQL
// real: a tabela, o índice e a FK só existem depois da migration deste Goal.
// Sem AI_TEST_DATABASE_URL a suíte é pulada, como as demais de integração.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT = "tenant-goal074-takeover";
const CHANNEL = "channel-goal074-takeover";
const CONVERSATION = "conversation-goal074-takeover";
const CONTACT = "5511955555555";

const policy = { inactivitySeconds: 60 };

describe.skipIf(!databaseUrl)("HumanTakeover against PostgreSQL", () => {
  let prisma: PrismaClient;
  let sessions: SessionService;

  const scope = {
    tenantId: TENANT,
    channelId: CHANNEL,
    conversationId: CONVERSATION,
    externalContactId: CONTACT,
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    sessions = new SessionService(prisma, policy);

    await prisma.channelConnection.upsert({
      where: { tenantId_id: { tenantId: TENANT, id: CHANNEL } },
      update: {},
      create: {
        id: CHANNEL,
        tenantId: TENANT,
        userId: `user-${TENANT}`,
        provider: "EVOLUTION_GO",
        externalInstanceId: `instance-${TENANT}`,
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
      update: {},
      create: {
        id: CONVERSATION,
        tenantId: TENANT,
        channelId: CHANNEL,
        externalContactId: CONTACT,
        state: {},
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.humanTakeover.deleteMany({ where: { tenantId: TENANT } });
    await prisma.conversationSession.deleteMany({ where: { tenantId: TENANT } });
    await prisma.conversation.updateMany({
      where: { tenantId: TENANT },
      data: { contactId: null, humanHandoff: false, status: "ACTIVE", state: {} },
    });
    await prisma.contact.deleteMany({ where: { tenantId: TENANT } });
  });

  it("records one row on the real transition from AI to human", async () => {
    const opened = await sessions.resolveContext(scope);

    await sessions.assumeHumanControl({
      tenantId: TENANT,
      sessionId: opened.sessionId,
      source: "AVENLY",
      actor: "owner-1",
    });

    const rows = await prisma.humanTakeover.findMany({
      where: { tenantId: TENANT, sessionId: opened.sessionId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: TENANT,
      sessionId: opened.sessionId,
      conversationId: CONVERSATION,
      source: "AVENLY",
      actor: "owner-1",
    });
  });

  it("does not duplicate the row when the session is already in human handling", async () => {
    const opened = await sessions.resolveContext(scope);

    await sessions.assumeHumanControl({
      tenantId: TENANT,
      sessionId: opened.sessionId,
      source: "AVENLY",
      actor: "owner-1",
    });
    // Segunda mensagem manual enquanto o humano já está atendendo: mesma
    // sessão, sem nova transição.
    await sessions.assumeHumanControl({
      tenantId: TENANT,
      sessionId: opened.sessionId,
      source: "WHATSAPP",
      actor: null,
    });

    const rows = await prisma.humanTakeover.findMany({
      where: { tenantId: TENANT, sessionId: opened.sessionId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("AVENLY");
  });

  it("never writes a row for BACKFILL", async () => {
    const opened = await sessions.resolveContext(scope);

    await sessions.assumeHumanControl({
      tenantId: TENANT,
      sessionId: opened.sessionId,
      source: "BACKFILL",
      actor: null,
    });

    const rows = await prisma.humanTakeover.findMany({
      where: { tenantId: TENANT, sessionId: opened.sessionId },
    });
    expect(rows).toHaveLength(0);
  });

  it("releaseToAi does not delete the row, and a later takeover in the same session adds a second one", async () => {
    const opened = await sessions.resolveContext(scope);

    await sessions.assumeHumanControl({
      tenantId: TENANT,
      sessionId: opened.sessionId,
      source: "AVENLY",
      actor: "owner-1",
    });
    await sessions.releaseToAi({ tenantId: TENANT, conversationId: CONVERSATION });

    const afterRelease = await prisma.humanTakeover.findMany({
      where: { tenantId: TENANT, sessionId: opened.sessionId },
    });
    expect(afterRelease).toHaveLength(1);

    // A IA voltou a atender na mesma sessão (release não abre sessão nova);
    // um novo takeover é outra transição real e soma outra linha.
    await sessions.assumeHumanControl({
      tenantId: TENANT,
      sessionId: opened.sessionId,
      source: "WHATSAPP",
      actor: null,
    });
    const afterSecondTakeover = await prisma.humanTakeover.findMany({
      where: { tenantId: TENANT, sessionId: opened.sessionId },
      orderBy: { takenAt: "asc" },
    });
    expect(afterSecondTakeover).toHaveLength(2);
    expect(afterSecondTakeover.map((row) => row.source)).toEqual([
      "AVENLY",
      "WHATSAPP",
    ]);
  });

  it("cascades on session delete, like ConversationSession's own FKs", async () => {
    const opened = await sessions.resolveContext(scope);
    await sessions.assumeHumanControl({
      tenantId: TENANT,
      sessionId: opened.sessionId,
      source: "AVENLY",
      actor: "owner-1",
    });
    expect(
      await prisma.humanTakeover.count({
        where: { tenantId: TENANT, sessionId: opened.sessionId },
      }),
    ).toBe(1);

    await prisma.conversationSession.delete({
      where: { tenantId_id: { tenantId: TENANT, id: opened.sessionId } },
    });

    expect(
      await prisma.humanTakeover.count({
        where: { tenantId: TENANT, sessionId: opened.sessionId },
      }),
    ).toBe(0);
  });
});
