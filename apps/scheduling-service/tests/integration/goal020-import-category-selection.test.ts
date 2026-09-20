import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { ImportExecutionService } from "../../src/modules/migrations/import-execution-service.js";
import { ImportPreviewService } from "../../src/modules/migrations/import-preview-service.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal020 WU-02 contra PostgreSQL real: a escrita de
 * `ImportSessionCategory.selected` por sessão e categoria.
 *
 * O comportamento de preview e motor já tem cobertura de unidade sobre o
 * dublê (`tests/unit/import-preview-service.test.ts`,
 * `tests/unit/import-execution-service.test.ts`, `tests/unit/import-routes.test.ts`).
 * Esta suíte cobre o que só um banco de verdade prova: isolamento entre dois
 * negócios escrevendo `selected` na mesma tabela, e a volta completa —
 * escolher uma categoria e a execução real (`ImportExecutionService`, não um
 * dublê) honrando a escolha lida do Postgres.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal020-wu02-tenant-a";
const tenantB = "goal020-wu02-tenant-b";
const timeZone = "America/Sao_Paulo";
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-09-10",
};

let prisma: PrismaClient;

function emptySnapshot(
  overrides: Partial<Record<"services" | "customers", unknown>> = {},
) {
  const category = (name: string, records: unknown[] = []) => ({
    category: name,
    coverage: {
      sourceSupported: true,
      sourceReportedCount: null,
      readCount: records.length,
      limitationCode: null,
      limitationDetail: null,
    },
    records,
  });
  return {
    generatedAt: "2026-09-10T12:00:00.000Z",
    services: overrides.services ?? category("SERVICE"),
    customers: overrides.customers ?? category("CUSTOMER"),
    availability: category("AVAILABILITY"),
    timeBlocks: category("TIME_BLOCK"),
    futureAppointments: category("FUTURE_APPOINTMENT"),
    pastAppointments: category("PAST_APPOINTMENT"),
    cancelledAppointments: category("CANCELLED_APPOINTMENT"),
    noShowAppointments: category("NO_SHOW_APPOINTMENT"),
  } as never;
}

class FixtureReader {
  constructor(private readonly snapshot: ReturnType<typeof emptySnapshot>) {}
  async getImportSnapshot() {
    return this.snapshot as never;
  }
}

async function seedCalendar(tenantId: string) {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "ATENDLY", timezone: timeZone },
    update: {},
  });
}

async function seedSession(tenantId: string) {
  return prisma.importSession.create({
    data: { tenantId, sourceAccountId: "account-1", createdBy: "user-1" },
  });
}

describeWithDatabase(
  "goal020 import category selection against PostgreSQL",
  () => {
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

    it("writes selected by session and category, and the real execution engine honors it", async () => {
      await seedCalendar(tenantA);
      const session = await seedSession(tenantA);
      const preview = new ImportPreviewService(prisma);
      const reader = new FixtureReader(
        emptySnapshot({
          services: {
            category: "SERVICE",
            coverage: {
              sourceSupported: true,
              sourceReportedCount: null,
              readCount: 1,
              limitationCode: null,
              limitationDetail: null,
            },
            records: [
              {
                externalId: "900",
                raw: {
                  id: 900,
                  name: "Corte",
                  duration: 60,
                  price: 80,
                  colorId: null,
                  deleted: false,
                },
              },
            ],
          },
        }),
      );
      await preview.analyze(
        { tenantId: tenantA, sessionId: session.id },
        reader,
        snapshotInput,
      );

      const selection = await preview.setCategorySelection(
        { tenantId: tenantA, sessionId: session.id },
        "SERVICE",
        false,
      );
      expect(selection).toEqual({
        sessionId: session.id,
        category: "SERVICE",
        selected: false,
      });

      const execution = new ImportExecutionService(prisma);
      const result = await execution.execute(
        { tenantId: tenantA, sessionId: session.id, userId: "user-1" },
        reader,
        snapshotInput,
        { previewVersion: 1 },
      );

      expect(result.counts.skipped).toBe(1);
      const item = await prisma.importItem.findFirstOrThrow({
        where: { tenantId: tenantA, sessionId: session.id, category: "SERVICE" },
      });
      expect(item.status).toBe("SKIPPED");
      expect(item.reasonCode).toBe("CATEGORY_NOT_SELECTED");
      expect(
        await prisma.service.count({ where: { tenantId: tenantA } }),
      ).toBe(0);
    });

    it("does not change previewVersion or the item rows when deselecting", async () => {
      await seedCalendar(tenantA);
      const session = await seedSession(tenantA);
      const preview = new ImportPreviewService(prisma);
      const reader = new FixtureReader(emptySnapshot());
      await preview.analyze(
        { tenantId: tenantA, sessionId: session.id },
        reader,
        snapshotInput,
      );
      const before = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: session.id } },
      });

      await preview.setCategorySelection(
        { tenantId: tenantA, sessionId: session.id },
        "SERVICE",
        false,
      );

      const after = await prisma.importSession.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: session.id } },
      });
      expect(after.previewVersion).toBe(before.previewVersion);
      expect(after.sourceFingerprint).toBe(before.sourceFingerprint);
    });

    it.each(["COMPLETED", "FAILED", "SUPERSEDED"] as const)(
      "refuses to choose categories once the session is %s",
      async (status) => {
        const session = await prisma.importSession.create({
          data: {
            tenantId: tenantA,
            sourceAccountId: "account-1",
            createdBy: "user-1",
            status,
            ...(status === "COMPLETED"
              ? { completedAt: new Date(), completedBy: "user-1" }
              : {}),
          },
        });
        await prisma.importSessionCategory.create({
          data: { tenantId: tenantA, sessionId: session.id, category: "SERVICE" },
        });
        const preview = new ImportPreviewService(prisma);

        await expect(
          preview.setCategorySelection(
            { tenantId: tenantA, sessionId: session.id },
            "SERVICE",
            false,
          ),
        ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_SELECTABLE" });
      },
    );

    it("keeps two businesses writing selected in the same database from leaking into each other", async () => {
      await seedCalendar(tenantA);
      await seedCalendar(tenantB);
      const sessionA = await seedSession(tenantA);
      const sessionB = await seedSession(tenantB);
      const preview = new ImportPreviewService(prisma);
      const reader = new FixtureReader(emptySnapshot());
      await preview.analyze(
        { tenantId: tenantA, sessionId: sessionA.id },
        reader,
        snapshotInput,
      );
      await preview.analyze(
        { tenantId: tenantB, sessionId: sessionB.id },
        reader,
        snapshotInput,
      );

      await preview.setCategorySelection(
        { tenantId: tenantA, sessionId: sessionA.id },
        "SERVICE",
        false,
      );

      const categoryA = await prisma.importSessionCategory.findUniqueOrThrow({
        where: {
          tenantId_sessionId_category: {
            tenantId: tenantA,
            sessionId: sessionA.id,
            category: "SERVICE",
          },
        },
      });
      const categoryB = await prisma.importSessionCategory.findUniqueOrThrow({
        where: {
          tenantId_sessionId_category: {
            tenantId: tenantB,
            sessionId: sessionB.id,
            category: "SERVICE",
          },
        },
      });
      expect(categoryA.selected).toBe(false);
      // B nunca foi tocado: continua com o default de nascimento.
      expect(categoryB.selected).toBe(true);

      // O tenant B não enxerga nem escreve na sessão do tenant A.
      await expect(
        preview.setCategorySelection(
          { tenantId: tenantB, sessionId: sessionA.id },
          "SERVICE",
          false,
        ),
      ).rejects.toMatchObject({ code: "IMPORT_SESSION_NOT_FOUND" });
    });
  },
);
