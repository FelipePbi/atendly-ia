import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Prisma, PrismaClient } from "../../src/generated/prisma/client.js";
import {
  TENANT_PURGE_TABLES,
  TenantPurgeService,
} from "../../src/modules/internal/tenantPurge.js";

// Purga do negocio inteiro contra PostgreSQL real (Goal025/WU-05).
//
// Mesmo alvo descartavel das demais suites de banco (AI_TEST_DATABASE_URL);
// sem ela a suite e pulada, para que o gate local nao dependa de banco
// pessoal. O que esta suite prova nao e so "a linha some": e que a purga
// atravessa as tabelas com `tenantId` do schema (`TENANT_PURGE_TABLES.length`),
// respeita o teto por passada, e idempotente, e nunca toca o negocio vizinho em
// nenhuma delas.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT_A = "tenant-full-purge-a";
const TENANT_B = "tenant-full-purge-b";
const CHANNEL_A = "channel-full-purge-a";
const CHANNEL_B = "channel-full-purge-b";

// Vetor de zeros na dimensao da coluna `KnowledgeChunk.embedding`
// (`vector(1536)`, ver schema.prisma), escrito na forma textual que o proprio
// `pgvector` usa. O conteudo e irrelevante aqui: a purga nunca le, compara nem
// interpreta embedding — apaga a linha.
//
// Sem cast `::vector` de proposito. O alvo desta suite e o banco de
// durabilidade da IA (`AI_TEST_DATABASE_URL`), que nao tem `pgvector`
// instalado nem local nem no CI (`postgres:16-alpine`) e onde `KnowledgeChunk`
// existe como fixture com `embedding` em `TEXT` — ver o pulo nomeado em
// `scripts/goal012-knowledge-memory-migration-rehearsal.mjs`. O literal
// gravado e o mesmo nos dois casos.
const ZERO_EMBEDDING = `[${new Array(1536).fill(0).join(",")}]`;

/** Accessor do Prisma Client para cada tabela declarada, na mesma ordem. */
const ACCESSOR = {
  AiToolCall: "aiToolCall",
  MessageAttachment: "messageAttachment",
  ActivationTestMilestone: "activationTestMilestone",
  KnowledgeChunk: "knowledgeChunk",
  HumanTakeover: "humanTakeover",
  AiRun: "aiRun",
  ConversationSession: "conversationSession",
  Message: "message",
  Handoff: "handoff",
  Conversation: "conversation",
  ActivationTestRun: "activationTestRun",
  KnowledgeDocument: "knowledgeDocument",
  CustomerMemory: "customerMemory",
  Contact: "contact",
  ProcessedEvent: "processedEvent",
  ChannelConnection: "channelConnection",
  AiTenantConfig: "aiTenantConfig",
} as const satisfies Record<(typeof TENANT_PURGE_TABLES)[number], string>;

describe.skipIf(!databaseUrl)("tenant purge against PostgreSQL", () => {
  let prisma: PrismaClient;
  let purge: TenantPurgeService;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    purge = new TenantPurgeService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Leaf-to-root: a mesma ordem segura de chave estrangeira da purga.
    for (const table of TENANT_PURGE_TABLES) {
      const accessor = (
        prisma as unknown as Record<
          string,
          { deleteMany: (args: unknown) => Promise<unknown> }
        >
      )[ACCESSOR[table]];
      await accessor.deleteMany({
        where: { tenantId: { in: [TENANT_A, TENANT_B] } },
      });
    }
  });

  /**
   * Povoa um grafo relacional completo para o negocio: uma linha em cada uma
   * das 16 tabelas, encadeadas o suficiente para provar que a purga nao
   * quebra chave estrangeira nenhuma ao apagar todas juntas.
   */
  async function seedTenant(tenantId: string, channelId: string) {
    await prisma.channelConnection.create({
      data: {
        id: channelId,
        tenantId,
        userId: `user-${tenantId}`,
        provider: "EVOLUTION_GO",
        externalInstanceId: `instance-${tenantId}`,
      },
    });

    const conversationId = `conversation-${tenantId}`;
    await prisma.conversation.create({
      data: {
        id: conversationId,
        tenantId,
        channelId,
        externalContactId: `5511900000000-${tenantId}`,
      },
    });

    const contact = await prisma.contact.create({
      data: {
        tenantId,
        channelId,
        externalContactId: `5511900000000-${tenantId}`,
      },
    });

    const session = await prisma.conversationSession.create({
      data: {
        tenantId,
        channelId,
        conversationId,
        contactId: contact.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await prisma.humanTakeover.create({
      data: {
        tenantId,
        sessionId: session.id,
        conversationId,
        source: "AVENLY",
        actor: `owner-${tenantId}`,
      },
    });

    const messageId = `message-${tenantId}`;
    await prisma.message.create({
      data: {
        id: messageId,
        tenantId,
        channelId,
        conversationId,
        direction: "INBOUND",
        role: "user",
        body: "conteudo de teste",
      },
    });

    await prisma.messageAttachment.create({
      data: { tenantId, messageId, kind: "AUDIO" },
    });

    await prisma.processedEvent.create({
      data: {
        tenantId,
        channelId,
        provider: "EVOLUTION_GO",
        eventKey: `event-${tenantId}`,
        messageId: `external-${tenantId}`,
      },
    });

    const aiRunId = `ai-run-${tenantId}`;
    await prisma.aiRun.create({
      data: {
        id: aiRunId,
        tenantId,
        channelId,
        conversationId,
        provider: "openai",
        model: "test-model",
        promptVersion: "v1",
        inputMessageIds: [],
      },
    });

    await prisma.aiToolCall.create({
      data: {
        tenantId,
        aiRunId,
        name: "check_availability",
        arguments: {},
      },
    });

    await prisma.handoff.create({
      data: {
        tenantId,
        channelId,
        conversationId,
        externalContactId: `5511900000000-${tenantId}`,
        reason: "seed",
      },
    });

    await prisma.aiTenantConfig.create({ data: { tenantId } });

    const documentId = `knowledge-document-${tenantId}`;
    await prisma.knowledgeDocument.create({
      data: {
        id: documentId,
        tenantId,
        type: "FAQ",
        title: "Documento de teste",
        source: "seed",
        version: "v1",
        checksum: `checksum-${tenantId}`,
      },
    });

    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "KnowledgeChunk" (
          "id", "tenantId", "documentId", "content", "embedding",
          "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${tenantId}, ${documentId}, 'conteudo de teste',
          ${ZERO_EMBEDDING}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`,
    );

    await prisma.customerMemory.create({
      data: {
        tenantId,
        customerId: `customer-${tenantId}`,
        kind: "PREFERRED_PERIOD",
        value: "manha",
        origin: "CUSTOMER_STATED",
      },
    });

    const runId = `activation-test-run-${tenantId}`;
    await prisma.activationTestRun.create({
      data: {
        id: runId,
        tenantId,
        channelId,
        tenantPhone: `5511900000000${tenantId.length}`,
        platformNumber: "5511888888888",
        maxAttempts: 3,
      },
    });

    await prisma.activationTestMilestone.create({
      data: {
        tenantId,
        runId,
        milestone: "MESSAGE_SENT",
        factKind: "MESSAGE",
        factId: messageId,
      },
    });
  }

  /** Uma linha por tabela, para o negocio dado — o que a seed acima grava. */
  async function countsFor(
    tenantId: string,
  ): Promise<Record<(typeof TENANT_PURGE_TABLES)[number], number>> {
    const counts = {} as Record<(typeof TENANT_PURGE_TABLES)[number], number>;
    for (const table of TENANT_PURGE_TABLES) {
      const accessor = (
        prisma as unknown as Record<
          string,
          { count: (args: unknown) => Promise<number> }
        >
      )[ACCESSOR[table]];
      counts[table] = await accessor.count({ where: { tenantId } });
    }
    return counts;
  }

  it("apaga todas as tabelas do negocio, sem violar chave estrangeira", async () => {
    await seedTenant(TENANT_A, CHANNEL_A);

    const before = await countsFor(TENANT_A);
    for (const table of TENANT_PURGE_TABLES) {
      expect(before[table], `${table} deveria ter uma linha semeada`).toBe(1);
    }

    const result = await purge.purge({ tenantId: TENANT_A, maxRows: 1_000 });

    expect(result.hasMore).toBe(false);
    expect(result.totalDeleted).toBe(TENANT_PURGE_TABLES.length);
    const after = await countsFor(TENANT_A);
    for (const table of TENANT_PURGE_TABLES) {
      expect(after[table], `${table} deveria estar vazia depois da purga`).toBe(
        0,
      );
    }
  });

  it("e idempotente: a segunda passada nao encontra nada e nao e erro", async () => {
    await seedTenant(TENANT_A, CHANNEL_A);
    await purge.purge({ tenantId: TENANT_A, maxRows: 1_000 });

    const second = await purge.purge({ tenantId: TENANT_A, maxRows: 1_000 });

    expect(second.totalDeleted).toBe(0);
    expect(second.hasMore).toBe(false);
    for (const value of Object.values(second.deleted)) {
      expect(value).toBe(0);
    }
  });

  it("respeita o teto por passada e sinaliza o resto, ate esvaziar", async () => {
    await seedTenant(TENANT_A, CHANNEL_A);

    const first = await purge.purge({ tenantId: TENANT_A, maxRows: 6 });
    expect(first.totalDeleted).toBe(6);
    expect(first.hasMore).toBe(true);

    const remainingAfterFirst = await countsFor(TENANT_A);
    const remainingRows = Object.values(remainingAfterFirst).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(remainingRows).toBe(TENANT_PURGE_TABLES.length - 6);

    const second = await purge.purge({ tenantId: TENANT_A, maxRows: 1_000 });
    expect(second.hasMore).toBe(false);
    expect(second.totalDeleted).toBe(TENANT_PURGE_TABLES.length - 6);

    const after = await countsFor(TENANT_A);
    for (const table of TENANT_PURGE_TABLES) {
      expect(after[table]).toBe(0);
    }
  });

  it("nao apaga nem toca nenhuma linha do negocio vizinho, em nenhuma tabela", async () => {
    await seedTenant(TENANT_A, CHANNEL_A);
    await seedTenant(TENANT_B, CHANNEL_B);

    const neighbourBefore = await countsFor(TENANT_B);

    const result = await purge.purge({ tenantId: TENANT_A, maxRows: 1_000 });
    expect(result.totalDeleted).toBe(TENANT_PURGE_TABLES.length);

    const targetAfter = await countsFor(TENANT_A);
    const neighbourAfter = await countsFor(TENANT_B);
    for (const table of TENANT_PURGE_TABLES) {
      expect(targetAfter[table]).toBe(0);
      expect(neighbourAfter[table]).toBe(neighbourBefore[table]);
      expect(neighbourAfter[table]).toBe(1);
    }
  });
});
