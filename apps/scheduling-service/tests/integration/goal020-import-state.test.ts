import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { ImportCompletionService } from "../../src/modules/migrations/import-completion-service.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal020 WU-01 contra PostgreSQL real: a leitura do estado da importação
 * (direito, sessão viva e histórico) que a rota interna expõe.
 *
 * O comportamento de cada método já tem cobertura de unidade isolada sobre o
 * dublê (`tests/unit/import-completion-service.test.ts`,
 * `tests/unit/import-routes.test.ts`). Esta suíte cobre o que só um banco de
 * verdade prova: isolamento entre dois negócios lendo o mesmo estado ao
 * mesmo tempo, e que a leitura combinada (direito + sessão viva + histórico)
 * não escreve nada — nem quando não há conexão, sessão ou histórico nenhum.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal020-wu01-tenant-a";
const tenantB = "goal020-wu01-tenant-b";

let prisma: PrismaClient;

async function createSession(
  tenantId: string,
  overrides: Partial<{
    sourceAccountId: string;
    sourceAccountLabel: string | null;
    status: "DRAFT" | "ANALYZING" | "READY" | "EXECUTING" | "PARTIAL";
    previewVersion: number;
  }> = {},
) {
  return prisma.importSession.create({
    data: {
      tenantId,
      sourceAccountId: overrides.sourceAccountId ?? "account-1",
      sourceAccountLabel: overrides.sourceAccountLabel ?? "Salao da Ana",
      createdBy: "user-1",
      status: overrides.status ?? "READY",
      previewVersion: overrides.previewVersion ?? 1,
      // Contadores propositalmente errados: a leitura precisa vir dos itens,
      // não deste cache, então divergir daqui prova que ela não confiou nele.
      importedCount: 999,
    },
  });
}

async function createCategory(
  tenantId: string,
  sessionId: string,
  category: "SERVICE" | "CUSTOMER",
  selected: boolean,
) {
  return prisma.importSessionCategory.create({
    data: { tenantId, sessionId, category, selected },
  });
}

async function createItem(
  tenantId: string,
  sessionId: string,
  category: "SERVICE" | "CUSTOMER",
  externalId: string,
  status: "PENDING" | "IMPORTED" | "SKIPPED" | "FAILED" | "NEEDS_REVIEW",
) {
  const resolved =
    status === "IMPORTED"
      ? { entityType: category, internalId: `internal-${externalId}` }
      : status === "PENDING"
        ? {}
        : { reasonCode: "IMPORT_TEST_REASON" };
  return prisma.importItem.create({
    data: { tenantId, sessionId, category, externalId, status, ...resolved },
  });
}

describeWithDatabase("goal020 import state against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
  });

  it("is a valid, empty state for a business with no connection, no session and no history", async () => {
    const completion = new ImportCompletionService(prisma);

    const [right, session, history] = await Promise.all([
      completion.getImportRight(tenantA),
      completion.getLiveSession(tenantA),
      completion.getHistory(tenantA),
    ]);

    expect(right).toEqual({
      available: true,
      sessionId: null,
      completedAt: null,
    });
    expect(session).toBeNull();
    expect(history).toBeNull();
  });

  it("reads the live session's counts and selected flags from the item and category rows, not the session's cache", async () => {
    const session = await createSession(tenantA, {
      sourceAccountId: "account-42",
      sourceAccountLabel: "Salao do Beto",
      status: "PARTIAL",
      previewVersion: 3,
    });
    await createCategory(tenantA, session.id, "SERVICE", true);
    await createCategory(tenantA, session.id, "CUSTOMER", false);
    await createItem(tenantA, session.id, "SERVICE", "900", "IMPORTED");
    await createItem(tenantA, session.id, "SERVICE", "901", "NEEDS_REVIEW");
    await createItem(tenantA, session.id, "CUSTOMER", "500", "PENDING");

    const completion = new ImportCompletionService(prisma);
    const live = await completion.getLiveSession(tenantA);

    expect(live).toMatchObject({
      sessionId: session.id,
      status: "PARTIAL",
      previewVersion: 3,
      provider: "MINHA_AGENDA",
      sourceAccountId: "account-42",
      sourceAccountLabel: "Salao do Beto",
    });
    // O contador cacheado da sessão foi gravado como 999; a leitura real diz 1.
    expect(live?.counts).toEqual({
      pending: 1,
      imported: 1,
      skipped: 0,
      failed: 0,
      needsReview: 1,
    });
    expect(live?.categories).toEqual([
      expect.objectContaining({
        category: "SERVICE",
        selected: true,
        imported: 1,
        needsReview: 1,
      }),
      expect.objectContaining({
        category: "CUSTOMER",
        selected: false,
        pending: 1,
      }),
    ]);

    // Direito ainda não consumido: a sessão está viva, não concluída.
    expect(await completion.getImportRight(tenantA)).toMatchObject({
      available: true,
    });
    expect(await completion.getHistory(tenantA)).toBeNull();
  });

  it("reads the history and no longer a live session once the import is completed", async () => {
    const session = await createSession(tenantA);
    await createItem(tenantA, session.id, "SERVICE", "900", "IMPORTED");
    const completion = new ImportCompletionService(prisma);
    await completion.complete({
      tenantId: tenantA,
      sessionId: session.id,
      userId: "user-1",
    });

    const [right, live, history] = await Promise.all([
      completion.getImportRight(tenantA),
      completion.getLiveSession(tenantA),
      completion.getHistory(tenantA),
    ]);

    expect(right).toMatchObject({ available: false, sessionId: session.id });
    expect(live).toBeNull();
    expect(history).toMatchObject({
      sessionId: session.id,
      status: "COMPLETED",
      completedBy: "user-1",
    });
  });

  it("keeps the state of two businesses in the same database from leaking into each other", async () => {
    const sessionA = await createSession(tenantA, {
      sourceAccountId: "account-a",
    });
    await createItem(tenantA, sessionA.id, "SERVICE", "900", "PENDING");
    const sessionB = await createSession(tenantB, {
      sourceAccountId: "account-b",
    });
    await createItem(tenantB, sessionB.id, "SERVICE", "900", "IMPORTED");
    const completion = new ImportCompletionService(prisma);
    await completion.complete({
      tenantId: tenantB,
      sessionId: sessionB.id,
      userId: "user-b",
    });

    // A tem uma sessão viva e nenhum histórico; B concluiu e não tem sessão
    // viva. Nenhum lado enxerga o estado do outro.
    const liveA = await completion.getLiveSession(tenantA);
    const liveB = await completion.getLiveSession(tenantB);
    expect(liveA?.sessionId).toBe(sessionA.id);
    expect(liveA?.sourceAccountId).toBe("account-a");
    expect(liveB).toBeNull();

    const historyA = await completion.getHistory(tenantA);
    const historyB = await completion.getHistory(tenantB);
    expect(historyA).toBeNull();
    expect(historyB?.sessionId).toBe(sessionB.id);

    expect(await completion.getImportRight(tenantA)).toMatchObject({
      available: true,
    });
    expect(await completion.getImportRight(tenantB)).toMatchObject({
      available: false,
      sessionId: sessionB.id,
    });
  });

  it("does not open a session, change status, bump previewVersion or spend the right", async () => {
    const completion = new ImportCompletionService(prisma);

    // Nada existe ainda: ler o estado não cria sessão nenhuma.
    await completion.getImportRight(tenantA);
    await completion.getLiveSession(tenantA);
    await completion.getHistory(tenantA);
    expect(
      await prisma.importSession.count({ where: { tenantId: tenantA } }),
    ).toBe(0);

    const session = await createSession(tenantA, {
      status: "READY",
      previewVersion: 2,
    });
    const before = await prisma.importSession.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: tenantA, id: session.id } },
    });

    // Ler repetidas vezes não muda nada da sessão viva.
    await completion.getLiveSession(tenantA);
    await completion.getLiveSession(tenantA);
    await completion.getImportRight(tenantA);

    const after = await prisma.importSession.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: tenantA, id: session.id } },
    });
    expect(after).toEqual(before);
    expect(after.status).toBe("READY");
    expect(after.previewVersion).toBe(2);
    // O direito continua livre: ler não o consumiu.
    expect(await completion.getImportRight(tenantA)).toMatchObject({
      available: true,
    });
  });
});
