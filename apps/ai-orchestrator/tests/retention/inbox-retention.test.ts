import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import {
  DEFAULT_INBOX_RETENTION_DAYS,
  inboxRetentionCutoff,
  purgeExpiredInboxEvents,
} from "../../src/modules/retention/inbox-retention.js";

// Retenção técnica do inbox durável (Goal023/§6, critérios 38 e 39) contra
// PostgreSQL real.
//
// Mesmo alvo descartável das demais suítes de banco. O que este arquivo prova
// não é que o `DELETE` roda, e sim **o que ele não alcança**: trabalho vivo
// (`RECEIVED`, `PROCESSING`), evidência de falha (`FAILED`), evento dentro do
// prazo, e o negócio vizinho.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT_A = "tenant-inbox-retention-a";
const TENANT_B = "tenant-inbox-retention-b";
const CHANNEL_A = "channel-inbox-retention-a";
const CHANNEL_B = "channel-inbox-retention-b";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const day = (offset: number) =>
  new Date(NOW.getTime() - offset * 24 * 60 * 60 * 1000);

const CUTOFF = inboxRetentionCutoff(NOW, DEFAULT_INBOX_RETENTION_DAYS);

describe.skipIf(!databaseUrl)("inbox retention against PostgreSQL", () => {
  let prisma: PrismaClient;

  const purgeA = (maxRows = 500) =>
    purgeExpiredInboxEvents(prisma, {
      tenantId: TENANT_A,
      receivedBefore: CUTOFF,
      maxRows,
    });

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    for (const [tenantId, channelId] of [
      [TENANT_A, CHANNEL_A],
      [TENANT_B, CHANNEL_B],
    ] as const) {
      await prisma.channelConnection.upsert({
        where: { tenantId_id: { tenantId, id: channelId } },
        update: {},
        create: {
          id: channelId,
          tenantId,
          userId: `user-${tenantId}`,
          provider: "EVOLUTION_GO",
          externalInstanceId: `instance-${tenantId}`,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.processedEvent.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
  });

  async function seedEvent(input: {
    tenantId: string;
    channelId: string;
    id: string;
    status:
      | "RECEIVED"
      | "PROCESSING"
      | "DONE"
      | "FAILED"
      | "IGNORED"
      | "LEGACY";
    receivedAt: Date;
  }): Promise<void> {
    await prisma.processedEvent.create({
      data: {
        id: input.id,
        tenantId: input.tenantId,
        channelId: input.channelId,
        provider: "EVOLUTION_GO",
        eventKey: input.id,
        messageId: input.id,
        rawPayload: { text: "rastro tecnico do transporte" },
        status: input.status,
        receivedAt: input.receivedAt,
      },
    });
  }

  const seedA = (
    id: string,
    status: Parameters<typeof seedEvent>[0]["status"],
    receivedAt: Date,
  ) =>
    seedEvent({
      tenantId: TENANT_A,
      channelId: CHANNEL_A,
      id,
      status,
      receivedAt,
    });

  const survivors = (tenantId = TENANT_A) =>
    prisma.processedEvent
      .findMany({ where: { tenantId }, select: { id: true } })
      .then((rows) => rows.map((row) => row.id).sort());

  it("o default do prazo técnico é folgado, e é ele que a IA aplica", () => {
    // O motivo está escrito junto da constante: encurtar abaixo da janela de
    // reentrega do provider faz o mesmo evento voltar a ser trabalho novo.
    expect(DEFAULT_INBOX_RETENTION_DAYS).toBe(180);
    expect(CUTOFF.toISOString()).toBe(day(180).toISOString());
  });

  it("apaga DONE, IGNORED e LEGACY fora do prazo", async () => {
    await seedA("done-old", "DONE", day(365));
    await seedA("ignored-old", "IGNORED", day(200));
    await seedA("legacy-old", "LEGACY", day(181));

    const result = await purgeA();

    expect(result.processedEvents).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(await survivors()).toEqual([]);
  });

  it("não toca RECEIVED, PROCESSING nem FAILED, por mais antigos que sejam", async () => {
    await seedA("received-old", "RECEIVED", day(900));
    await seedA("processing-old", "PROCESSING", day(900));
    await seedA("failed-old", "FAILED", day(900));

    const result = await purgeA();

    expect(result.processedEvents).toBe(0);
    expect(await survivors()).toEqual([
      "failed-old",
      "processing-old",
      "received-old",
    ]);
  });

  it("não toca evento concluído dentro do prazo", async () => {
    await seedA("done-recent", "DONE", day(179));
    await seedA("done-today", "DONE", NOW);

    expect((await purgeA()).processedEvents).toBe(0);
    expect(await survivors()).toEqual(["done-recent", "done-today"]);
  });

  it("respeita o teto e sinaliza o resto; a segunda passada termina o serviço", async () => {
    for (let index = 0; index < 5; index += 1) {
      await seedA(`done-batch-${index}`, "DONE", day(400 - index));
    }

    const first = await purgeA(2);
    expect(first.processedEvents).toBe(2);
    expect(first.hasMore).toBe(true);

    const second = await purgeA(10);
    expect(second.processedEvents).toBe(3);
    expect(second.hasMore).toBe(false);

    // Terceira passada imediata não apaga nada: repetir é inofensivo.
    expect((await purgeA()).processedEvents).toBe(0);
    expect(await survivors()).toEqual([]);
  });

  it("a purga de um negócio não alcança o inbox do vizinho", async () => {
    await seedA("done-a", "DONE", day(400));
    await seedEvent({
      tenantId: TENANT_B,
      channelId: CHANNEL_B,
      id: "done-b",
      status: "DONE",
      receivedAt: day(400),
    });

    expect((await purgeA()).processedEvents).toBe(1);
    expect(await survivors(TENANT_A)).toEqual([]);
    expect(await survivors(TENANT_B)).toEqual(["done-b"]);
  });
});
