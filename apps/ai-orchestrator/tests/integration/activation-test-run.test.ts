import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { ACTIVATION_TEST_REFUSALS } from "../../src/modules/activation-test/activation-test-run.js";
import { ActivationTestRunStore } from "../../src/modules/activation-test/ActivationTestRunStore.js";

// Execucao do teste real contra PostgreSQL de verdade.
//
// O que so o banco prova: a exclusividade de uma execucao viva por tenant
// (indice unico parcial), a impossibilidade de marco sem fonte (NOT NULL) e a
// ausencia de backfill — tenant que nunca testou continua sem linha nenhuma.
// Sem AI_TEST_DATABASE_URL a suite e pulada; validate:integration a fornece.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT = "tenant-activation-test";
const OTHER_TENANT = "tenant-activation-other";
const NEVER_TESTED = "tenant-activation-never";
const CHANNEL = "channel-activation-test";
const CHANNEL_INSTANCE = "instance-activation-test";
const PLATFORM_NUMBER = "5511911112222";

function runInput(tenantId = TENANT) {
  return {
    tenantId,
    channelId: CHANNEL,
    channelInstanceId: CHANNEL_INSTANCE,
    tenantPhone: "5511988887777",
    platformNumber: PLATFORM_NUMBER,
    maxAttempts: 3,
    serviceId: "service-1",
    serviceName: "Corte",
  };
}

describe.skipIf(!databaseUrl)("activation test run against PostgreSQL", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const store = new ActivationTestRunStore(prisma);

  async function reset() {
    await prisma.activationTestRun.deleteMany({
      where: { tenantId: { in: [TENANT, OTHER_TENANT, NEVER_TESTED] } },
    });
    await prisma.message.deleteMany({ where: { tenantId: TENANT } });
    await prisma.conversation.deleteMany({ where: { tenantId: TENANT } });
    await prisma.contact.deleteMany({ where: { tenantId: TENANT } });
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
  }

  beforeEach(reset);

  afterAll(async () => {
    await reset();
    await prisma.channelConnection.deleteMany({ where: { tenantId: TENANT } });
    await prisma.$disconnect();
  });

  it("tenant que nunca testou nao tem execucao, e isso nao e falha", async () => {
    expect(await store.findLiveRun(NEVER_TESTED)).toBeNull();
    expect(await store.latestRun(NEVER_TESTED)).toBeNull();
  });

  it("aceita uma execucao viva por tenant e recusa a segunda", async () => {
    const run = await store.createRun(runInput());
    expect(run.state).toBe("RUNNING");
    expect(run.finishedAt).toBeNull();
    expect(run.maxAttempts).toBe(3);

    await expect(store.createRun(runInput())).rejects.toMatchObject({
      code: ACTIVATION_TEST_REFUSALS.ALREADY_RUNNING,
      statusCode: 409,
    });

    // A exclusividade e por tenant: outro tenant continua podendo testar.
    const other = await store.createRun(runInput(OTHER_TENANT));
    expect(other.tenantId).toBe(OTHER_TENANT);
  });

  it("pausada continua viva; terminada libera o tenant", async () => {
    const run = await store.createRun(runInput());
    const paused = await store.pauseRun(
      TENANT,
      run.id,
      "message-owner-1",
      new Date(),
    );
    expect(paused.state).toBe("PAUSED_BY_HUMAN");
    expect(paused.finishedAt).toBeNull();

    await expect(store.createRun(runInput())).rejects.toMatchObject({
      code: ACTIVATION_TEST_REFUSALS.ALREADY_RUNNING,
    });

    const finished = await store.finishRun(TENANT, run.id, "DISCARDED");
    expect(finished.finishedAt).not.toBeNull();

    const next = await store.createRun(runInput());
    expect(next.id).not.toBe(run.id);
  });

  it("grava marco so com a fonte do fato, e uma unica vez", async () => {
    const run = await store.createRun(runInput());

    await expect(
      store.recordMilestone(TENANT, run.id, "MESSAGE_SENT", {
        kind: "MESSAGE",
        id: "  ",
      }),
    ).rejects.toMatchObject({
      code: "ACTIVATION_TEST_MILESTONE_FACT_REQUIRED",
    });
    expect(await store.listMilestones(TENANT, run.id)).toHaveLength(0);

    const first = await store.recordMilestone(TENANT, run.id, "MESSAGE_SENT", {
      kind: "MESSAGE",
      id: "message-1",
    });
    const repeated = await store.recordMilestone(
      TENANT,
      run.id,
      "MESSAGE_SENT",
      { kind: "MESSAGE", id: "message-2" },
    );
    // Primeira observacao vence: repetir nao duplica progresso nem reescreve a
    // fonte original.
    expect(repeated.factId).toBe(first.factId);
    expect(await store.listMilestones(TENANT, run.id)).toHaveLength(1);
  });

  it("persiste os IDs do que criou e enxerga a resposta humana na conversa", async () => {
    const run = await store.createRun(runInput());
    const conversation = await store.openTestConversation({
      tenantId: TENANT,
      channelId: CHANNEL,
      platformNumber: PLATFORM_NUMBER,
    });
    const withIds = await store.patchRun(TENANT, run.id, {
      conversationId: conversation.conversationId,
      contactId: conversation.contactId,
    });
    expect(withIds.conversationId).toBe(conversation.conversationId);
    expect(withIds.contactId).toBe(conversation.contactId);

    const clientMessage = await store.recordConversationMessage({
      tenantId: TENANT,
      channelId: CHANNEL,
      conversationId: conversation.conversationId,
      author: "CLIENT",
      body: "Quanto custa?",
      correlationId: `activation-test-${run.id}-client`,
    });
    const withMessage = await store.patchRun(TENANT, run.id, {
      appendMessageIds: [clientMessage.id],
    });
    expect(withMessage.createdMessageIds).toEqual([clientMessage.id]);

    // Antes da resposta humana nao ha interferencia nenhuma.
    expect(
      await store.findHumanMessage({
        tenantId: TENANT,
        conversationId: conversation.conversationId,
        since: run.startedAt,
      }),
    ).toBeNull();

    // A deteccao usa `source: OWNER`, o que a plataforma ja sabe distinguir.
    const owner = await prisma.message.create({
      data: {
        tenantId: TENANT,
        channelId: CHANNEL,
        conversationId: conversation.conversationId,
        externalMessageId: "owner-1",
        correlationId: "owner-1",
        direction: "OUTBOUND",
        source: "OWNER",
        role: "assistant",
        body: "Oi, pode deixar que eu respondo",
      },
      select: { id: true },
    });
    const human = await store.findHumanMessage({
      tenantId: TENANT,
      conversationId: conversation.conversationId,
      since: run.startedAt,
    });
    expect(human?.id).toBe(owner.id);
  });
});
