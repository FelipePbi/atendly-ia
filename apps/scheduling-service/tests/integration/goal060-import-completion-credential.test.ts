import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { ImportCompletionService } from "../../src/modules/migrations/import-completion-service.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal060 §6/§7.5 contra PostgreSQL real: a credencial não sobrevive à
 * importação concluída (vault Q894).
 *
 * `ImportSession.connectionId` referencia `IntegrationConnection` com
 * `onDelete: Restrict` (schema.prisma:1109) — o histórico da importação nunca
 * some junto com a conexão. O que só um banco de verdade prova é que apagar a
 * conexão dentro da mesma transação de `completedAt`, sem violar essa FK,
 * exige desfazer a referência antes do delete, e que a invariante sobrevive a
 * falha de transação, repetição e isolamento por tenant.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal060-tenant-a";
const tenantB = "goal060-tenant-b";
const timeZone = "America/Sao_Paulo";

let prisma: PrismaClient;

async function seedTenant(tenantId: string) {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
}

async function createConnection(tenantId: string) {
  return prisma.integrationConnection.create({
    data: {
      tenantId,
      provider: "MINHA_AGENDA",
      status: "CONNECTED",
      credentialsEncrypted: Buffer.from("segredo-de-teste"),
      config: {},
    },
  });
}

async function createSession(
  tenantId: string,
  connectionId: string,
  overrides: { status?: "DRAFT" | "READY" | "PARTIAL" } = {},
) {
  return prisma.importSession.create({
    data: {
      tenantId,
      connectionId,
      sourceAccountId: "account-1",
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

describeWithDatabase(
  "goal060 import completion deletes the source credential against PostgreSQL",
  () => {
    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
      });
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
      await seedTenant(tenantA);
      await seedTenant(tenantB);
    });

    it("deletes the MINHA_AGENDA connection of the tenant in the same transaction that completes the session", async () => {
      const connection = await createConnection(tenantA);
      const session = await createSession(tenantA, connection.id);
      await createImportedItem(tenantA, session.id, "900");

      const result = await new ImportCompletionService(prisma).complete({
        tenantId: tenantA,
        sessionId: session.id,
        userId: "user-1",
      });

      expect(result.status).toBe("COMPLETED");
      const remaining = await prisma.integrationConnection.findUnique({
        where: { tenantId_provider: { tenantId: tenantA, provider: "MINHA_AGENDA" } },
      });
      expect(remaining).toBeNull();
    });

    it("leaves the other tenant's connection intact", async () => {
      const connectionA = await createConnection(tenantA);
      const sessionA = await createSession(tenantA, connectionA.id);
      await createImportedItem(tenantA, sessionA.id, "900");
      const connectionB = await createConnection(tenantB);

      await new ImportCompletionService(prisma).complete({
        tenantId: tenantA,
        sessionId: sessionA.id,
        userId: "user-1",
      });

      const stillThere = await prisma.integrationConnection.findUnique({
        where: { tenantId_provider: { tenantId: tenantB, provider: "MINHA_AGENDA" } },
      });
      expect(stillThere?.id).toBe(connectionB.id);
    });

    it("keeps the connection row when the completion transaction fails", async () => {
      const connection = await createConnection(tenantA);
      const session = await createSession(tenantA, connection.id, {
        status: "PARTIAL",
      });
      await prisma.importItem.create({
        data: {
          tenantId: tenantA,
          sessionId: session.id,
          category: "CUSTOMER",
          externalId: "500",
          status: "PENDING",
        },
      });

      // Sem `acceptPending`, a transação inteira falha antes do delete: a
      // conexão precisa sobreviver ao rollback junto com o resto da escrita.
      await expect(
        new ImportCompletionService(prisma).complete({
          tenantId: tenantA,
          sessionId: session.id,
          userId: "user-1",
        }),
      ).rejects.toMatchObject({ code: "IMPORT_PENDING_ACCEPTANCE_REQUIRED" });

      const stillThere = await prisma.integrationConnection.findUnique({
        where: { tenantId_provider: { tenantId: tenantA, provider: "MINHA_AGENDA" } },
      });
      expect(stillThere?.id).toBe(connection.id);
    });

    it("does not fail when the completion is repeated after the connection is already gone", async () => {
      const connection = await createConnection(tenantA);
      const session = await createSession(tenantA, connection.id);
      await createImportedItem(tenantA, session.id, "900");
      const completion = new ImportCompletionService(prisma);

      const first = await completion.complete({
        tenantId: tenantA,
        sessionId: session.id,
        userId: "user-1",
      });
      const second = await completion.complete({
        tenantId: tenantA,
        sessionId: session.id,
        userId: "user-1",
      });

      expect(second.completedAt.getTime()).toBe(first.completedAt.getTime());
      const remaining = await prisma.integrationConnection.findUnique({
        where: { tenantId_provider: { tenantId: tenantA, provider: "MINHA_AGENDA" } },
      });
      expect(remaining).toBeNull();
    });

    it("feeds the calendar overview's integration: null after completion", async () => {
      const connection = await createConnection(tenantA);
      const session = await createSession(tenantA, connection.id);
      await createImportedItem(tenantA, session.id, "900");

      await new ImportCompletionService(prisma).complete({
        tenantId: tenantA,
        sessionId: session.id,
        userId: "user-1",
      });

      // Mesma consulta de `calendarOverview` (internal-api/routes.ts): a
      // ausência da linha é o que faz a rota devolver `integration: null`.
      const integration = await prisma.integrationConnection.findUnique({
        where: { tenantId_provider: { tenantId: tenantA, provider: "MINHA_AGENDA" } },
      });
      expect(integration).toBeNull();
    });
  },
);
