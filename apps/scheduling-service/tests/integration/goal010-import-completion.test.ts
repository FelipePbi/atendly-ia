import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { ImportCompletionService } from "../../src/modules/migrations/import-completion-service.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal010 WU-06 contra PostgreSQL real: a conclusão única da importação.
 *
 * O comportamento da decisão — aceite de pendentes, retentativa idempotente,
 * histórico — já tem cobertura de unidade em
 * `tests/unit/import-completion-service.test.ts`, sobre o dublê. O que só um
 * banco de verdade prova é o que esta suíte cobre: que a segunda conclusão de
 * um negócio é recusada pelo **índice único parcial**
 * `ImportSession_one_completed_per_tenant`, com duas conexões concorrentes e
 * sem passar por linha nenhuma de código de aplicação, e que a conclusão com
 * pendentes sem aceite é recusada pelo CHECK
 * `ImportSession_completion_check`. É o mesmo recorte que os Goals 008 e 009
 * usaram para hold, série e ocupação.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal010-tenant-a";
const tenantB = "goal010-tenant-b";
const timeZone = "America/Sao_Paulo";

let prisma: PrismaClient;
let other: PrismaClient;

async function seedTenant(tenantId: string) {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "MINHA_AGENDA", timezone: timeZone },
    update: { source: "MINHA_AGENDA", timezone: timeZone },
  });
}

async function createSession(
  tenantId: string,
  overrides: {
    status?: "DRAFT" | "READY" | "PARTIAL" | "FAILED" | "SUPERSEDED";
    sourceAccountId?: string;
  } = {},
) {
  return prisma.importSession.create({
    data: {
      tenantId,
      sourceAccountId: overrides.sourceAccountId ?? "account-1",
      sourceAccountLabel: "Salao da Ana",
      createdBy: "user-1",
      status: overrides.status ?? "READY",
    },
  });
}

async function createImportedItem(
  tenantId: string,
  sessionId: string,
  externalId: string,
) {
  return prisma.importItem.create({
    data: {
      tenantId,
      sessionId,
      category: "SERVICE",
      externalId,
      status: "IMPORTED",
      entityType: "SERVICE",
      internalId: `internal-${externalId}`,
    },
  });
}

/** UPDATE cru de conclusão: nenhuma linha de código de aplicação no caminho. */
function rawComplete(
  client: PrismaClient,
  tenantId: string,
  sessionId: string,
) {
  return client.$executeRaw`
    UPDATE "ImportSession"
       SET "status" = 'COMPLETED',
           "completedAt" = now(),
           "completedBy" = 'raw-sql',
           "updatedAt" = now()
     WHERE "tenantId" = ${tenantId}
       AND "id" = ${sessionId}
  `;
}

describeWithDatabase(
  "goal010 single import completion against PostgreSQL",
  () => {
    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
      });
      other = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
      const [database] = await prisma.$queryRaw<
        Array<{ current_database: string }>
      >`SELECT current_database()`;
      expect(database.current_database).toMatch(/test/iu);
    });

    afterAll(async () => {
      await resetTenant(prisma, tenantA);
      await resetTenant(prisma, tenantB);
      await prisma?.$disconnect();
      await other?.$disconnect();
    });

    beforeEach(async () => {
      await resetTenant(prisma, tenantA);
      await resetTenant(prisma, tenantB);
      await seedTenant(tenantA);
      await seedTenant(tenantB);
    });

    it("refuses a second completed session for the same business, from two concurrent connections, in raw SQL", async () => {
      const live = await createSession(tenantA, { status: "READY" });
      // Uma sessão descartada continua existindo — e é justamente por ela que
      // uma segunda conclusão poderia ser tentada por fora do serviço.
      const discarded = await createSession(tenantA, { status: "SUPERSEDED" });

      const outcomes = await Promise.allSettled([
        prisma.$transaction(async (transaction) => {
          await transaction.$executeRaw`
          UPDATE "ImportSession"
             SET "status" = 'COMPLETED',
                 "completedAt" = now(),
                 "completedBy" = 'connection-1',
                 "updatedAt" = now()
           WHERE "tenantId" = ${tenantA}
             AND "id" = ${live.id}
        `;
        }),
        other.$transaction(async (transaction) => {
          await transaction.$executeRaw`
          UPDATE "ImportSession"
             SET "status" = 'COMPLETED',
                 "completedAt" = now(),
                 "completedBy" = 'connection-2',
                 "updatedAt" = now()
           WHERE "tenantId" = ${tenantA}
             AND "id" = ${discarded.id}
        `;
        }),
      ]);

      expect(
        outcomes.filter((entry) => entry.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = outcomes.find((entry) => entry.status === "rejected");
      expect(String((rejected as PromiseRejectedResult).reason)).toMatch(
        /23505|one_completed_per_tenant/u,
      );
      const completed = await prisma.importSession.findMany({
        where: { tenantId: tenantA, completedAt: { not: null } },
      });
      expect(completed).toHaveLength(1);
    });

    it("two concurrent connections completing the same session write the decision once", async () => {
      const session = await createSession(tenantA);
      await createImportedItem(tenantA, session.id, "900");

      const [one, two] = await Promise.all([
        new ImportCompletionService(prisma).complete({
          tenantId: tenantA,
          sessionId: session.id,
          userId: "user-1",
        }),
        new ImportCompletionService(other).complete({
          tenantId: tenantA,
          sessionId: session.id,
          userId: "user-2",
        }),
      ]);

      expect(one.completedAt.getTime()).toBe(two.completedAt.getTime());
      expect(one.completedBy).toBe(two.completedBy);
      const completed = await prisma.importSession.findMany({
        where: { tenantId: tenantA, completedAt: { not: null } },
      });
      expect(completed).toHaveLength(1);
      expect(completed[0]?.status).toBe("COMPLETED");
    });

    it("refuses the second completion through the service, after the first one is committed", async () => {
      const first = await createSession(tenantA);
      await createImportedItem(tenantA, first.id, "900");
      await new ImportCompletionService(prisma).complete({
        tenantId: tenantA,
        sessionId: first.id,
        userId: "user-1",
      });

      // Sessão nova só existiria por fora do serviço; ainda assim o banco
      // recusa concluí-la.
      const second = await createSession(tenantA, {
        sourceAccountId: "account-2",
      });
      await expect(
        new ImportCompletionService(other).complete({
          tenantId: tenantA,
          sessionId: second.id,
          userId: "user-2",
        }),
      ).rejects.toMatchObject({ code: "IMPORT_ALREADY_COMPLETED" });
      await expect(rawComplete(other, tenantA, second.id)).rejects.toThrow();
    });

    it("refuses completing with pending items and no acceptance, at the database", async () => {
      const session = await createSession(tenantA, { status: "PARTIAL" });
      await prisma.importItem.create({
        data: {
          tenantId: tenantA,
          sessionId: session.id,
          category: "CUSTOMER",
          externalId: "500",
          status: "PENDING",
        },
      });
      await prisma.importSession.update({
        where: { tenantId_id: { tenantId: tenantA, id: session.id } },
        data: { pendingCount: 1 },
      });

      // Pelo serviço: recusa com erro próprio.
      await expect(
        new ImportCompletionService(prisma).complete({
          tenantId: tenantA,
          sessionId: session.id,
          userId: "user-1",
        }),
      ).rejects.toMatchObject({ code: "IMPORT_PENDING_ACCEPTANCE_REQUIRED" });
      // Por fora do serviço: recusa do CHECK, porque a regra é do banco.
      await expect(rawComplete(prisma, tenantA, session.id)).rejects.toThrow();

      const accepted = await new ImportCompletionService(prisma).complete(
        { tenantId: tenantA, sessionId: session.id, userId: "user-9" },
        { acceptPending: true },
      );
      expect(accepted.pendingAcceptance).toMatchObject({
        acceptedBy: "user-9",
        pendingCount: 1,
      });
      const row = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: session.id } },
      });
      expect(row.pendingAcceptedBy).toBe("user-9");
      expect(row.pendingAcceptedCount).toBe(1);
      expect(row.pendingAcceptedAt).not.toBeNull();
      const decisions = await prisma.importDecision.findMany({
        where: { tenantId: tenantA, sessionId: session.id },
      });
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toMatchObject({
        scope: "SESSION",
        decision: "ACCEPT_PENDING_COMPLETION",
        decidedBy: "user-9",
      });
    });

    it("does not spend the import right on a technical failure before the completion", async () => {
      const failed = await createSession(tenantA, { status: "READY" });
      await prisma.importSession.update({
        where: { tenantId_id: { tenantId: tenantA, id: failed.id } },
        data: { status: "FAILED", errorCode: "SOURCE_UNAVAILABLE" },
      });
      const completion = new ImportCompletionService(prisma);

      expect(await completion.getImportRight(tenantA)).toMatchObject({
        available: true,
      });
      const started = await completion.startSession({
        tenantId: tenantA,
        userId: "user-1",
        sourceAccountId: "account-1",
      });
      expect(started.created).toBe(true);
      await createImportedItem(tenantA, started.sessionId, "900");
      await prisma.importSession.update({
        where: { tenantId_id: { tenantId: tenantA, id: started.sessionId } },
        data: { status: "READY" },
      });

      const result = await completion.complete({
        tenantId: tenantA,
        sessionId: started.sessionId,
        userId: "user-1",
      });

      expect(result.status).toBe("COMPLETED");
      // A sessão que falhou continua no banco, intacta e não concluída.
      const previous = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: failed.id } },
      });
      expect(previous.status).toBe("FAILED");
      expect(previous.completedAt).toBeNull();
      // E o direito, agora consumido, não abre uma segunda importação.
      await expect(
        completion.startSession({
          tenantId: tenantA,
          userId: "user-1",
          sourceAccountId: "account-1",
        }),
      ).rejects.toMatchObject({ code: "IMPORT_ALREADY_COMPLETED" });
    });

    it("keeps the completion right and the history of one business out of the other", async () => {
      const sessionA = await createSession(tenantA);
      await createImportedItem(tenantA, sessionA.id, "900");
      const sessionB = await createSession(tenantB);
      await createImportedItem(tenantB, sessionB.id, "900");
      const completion = new ImportCompletionService(prisma);

      await completion.complete({
        tenantId: tenantA,
        sessionId: sessionA.id,
        userId: "user-a",
      });
      const forB = await completion.complete({
        tenantId: tenantB,
        sessionId: sessionB.id,
        userId: "user-b",
      });

      expect(forB.status).toBe("COMPLETED");
      const historyA = await completion.getHistory(tenantA);
      const historyB = await completion.getHistory(tenantB);
      expect(historyA?.sessionId).toBe(sessionA.id);
      expect(historyB?.sessionId).toBe(sessionB.id);
      expect(historyA).toMatchObject({
        provider: "MINHA_AGENDA",
        sourceAccountId: "account-1",
        status: "COMPLETED",
        completedBy: "user-a",
      });
      expect(historyA?.counts.imported).toBe(1);
      expect(historyA?.categories).toEqual([
        expect.objectContaining({ category: "SERVICE", imported: 1 }),
      ]);
      // Concluir do lado A não pode ter alcançado a sessão de B.
      await expect(
        completion.complete({
          tenantId: tenantA,
          sessionId: sessionB.id,
          userId: "user-a",
        }),
      ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_FOUND" });
    });
  },
);
