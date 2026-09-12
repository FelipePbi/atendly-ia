/**
 * Reconciliação dos `MigrationJob` legados (Goal010, U-02): classificação é
 * conservadora e nunca apaga ou converte uma linha em conclusão de
 * importação do usuário.
 */
import { describe, expect, it } from "vitest";

import {
  classifyLegacyJob,
  LegacyMigrationJobReconciliation,
} from "../../src/modules/migrations/legacy-job-reconciliation.js";

interface FakeJob {
  id: string;
  tenantId: string;
  status: string;
  summary: unknown;
  legacyClass: string;
  legacyClassifiedAt: Date | null;
  legacyClassifiedBy: string | null;
  legacyReviewReason: string | null;
  createdAt: Date;
}

function createFakePrisma(jobs: FakeJob[]) {
  return {
    migrationJob: {
      findMany: async (args: { where?: Record<string, unknown> } = {}) =>
        jobs.filter((job) =>
          Object.entries(args.where ?? {}).every(
            ([key, value]) => (job as Record<string, unknown>)[key] === value,
          ),
        ),
      update: async (args: {
        where: { tenantId_id: { tenantId: string; id: string } };
        data: Partial<FakeJob>;
      }) => {
        const job = jobs.find(
          (item) =>
            item.tenantId === args.where.tenantId_id.tenantId &&
            item.id === args.where.tenantId_id.id,
        );
        if (!job) throw new Error("job not found");
        Object.assign(job, args.data);
        return job;
      },
    },
  };
}

function job(overrides: Partial<FakeJob>): FakeJob {
  return {
    id: `job-${Math.random()}`,
    tenantId: "tenant-a",
    status: "COMPLETED",
    summary: null,
    legacyClass: "UNCLASSIFIED",
    legacyClassifiedAt: null,
    legacyClassifiedBy: null,
    legacyReviewReason: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("classifyLegacyJob", () => {
  it("classifica COMPLETED com prova de importação como TECHNICAL_COMPLETED", () => {
    expect(
      classifyLegacyJob({
        status: "COMPLETED",
        summary: { imported: { services: 1 } },
      }),
    ).toEqual({ legacyClass: "TECHNICAL_COMPLETED", reviewReason: null });
  });

  it("isola COMPLETED sem prova de importação para revisão", () => {
    expect(
      classifyLegacyJob({ status: "COMPLETED", summary: { diagnosis: {} } }),
    ).toEqual({
      legacyClass: "NEEDS_REVIEW",
      reviewReason: "COMPLETED_WITHOUT_IMPORT_PROOF",
    });
  });

  it("classifica FAILED como TECHNICAL_FAILED", () => {
    expect(classifyLegacyJob({ status: "FAILED", summary: null })).toEqual({
      legacyClass: "TECHNICAL_FAILED",
      reviewReason: null,
    });
  });

  it("classifica PARTIAL como TECHNICAL_INCOMPLETE", () => {
    expect(classifyLegacyJob({ status: "PARTIAL", summary: null })).toEqual({
      legacyClass: "TECHNICAL_INCOMPLETE",
      reviewReason: null,
    });
  });

  it.each(["PENDING", "ANALYZING", "RUNNING"])(
    "isola %s (sem estado terminal) para revisão",
    (status) => {
      expect(classifyLegacyJob({ status, summary: null })).toEqual({
        legacyClass: "NEEDS_REVIEW",
        reviewReason: "STALE_NON_TERMINAL_STATUS",
      });
    },
  );
});

describe("LegacyMigrationJobReconciliation", () => {
  it("classifica todo job pendente e grava autor e data, sem apagar nada", async () => {
    const jobs = [
      job({ id: "j1", status: "COMPLETED", summary: { imported: {} } }),
      job({ id: "j2", status: "FAILED" }),
      job({ id: "j3", status: "RUNNING" }),
    ];
    const reconciliation = new LegacyMigrationJobReconciliation(
      createFakePrisma(jobs) as never,
    );

    const result = await reconciliation.classifyPending("tech-lead-agent");

    expect(result).toEqual({ classified: 3 });
    expect(jobs).toHaveLength(3);
    expect(jobs.find((item) => item.id === "j1")).toMatchObject({
      legacyClass: "TECHNICAL_COMPLETED",
      legacyClassifiedBy: "tech-lead-agent",
      legacyReviewReason: null,
    });
    expect(jobs.find((item) => item.id === "j1")?.legacyClassifiedAt).toBeInstanceOf(
      Date,
    );
    expect(jobs.find((item) => item.id === "j2")).toMatchObject({
      legacyClass: "TECHNICAL_FAILED",
    });
    expect(jobs.find((item) => item.id === "j3")).toMatchObject({
      legacyClass: "NEEDS_REVIEW",
      legacyReviewReason: "STALE_NON_TERMINAL_STATUS",
    });
  });

  it("é idempotente: job já classificado nunca é reclassificado", async () => {
    const jobs = [
      job({
        id: "j1",
        status: "COMPLETED",
        summary: { imported: {} },
        legacyClass: "NEEDS_REVIEW",
        legacyReviewReason: "REVISADO_MANUALMENTE",
      }),
    ];
    const reconciliation = new LegacyMigrationJobReconciliation(
      createFakePrisma(jobs) as never,
    );

    const result = await reconciliation.classifyPending("tech-lead-agent");

    expect(result).toEqual({ classified: 0 });
    expect(jobs[0]).toMatchObject({
      legacyClass: "NEEDS_REVIEW",
      legacyReviewReason: "REVISADO_MANUALMENTE",
    });
  });

  it("nunca converte COMPLETED do protocolo antigo em conclusão de importação", async () => {
    const jobs = [
      job({ id: "j1", status: "COMPLETED", summary: { imported: {} } }),
    ];
    const reconciliation = new LegacyMigrationJobReconciliation(
      createFakePrisma(jobs) as never,
    );

    await reconciliation.classifyPending("tech-lead-agent");

    // A classificação não introduz nenhum campo de conclusão de importação
    // (isso é exclusividade de `ImportSession.completedAt`, outra tabela).
    expect(jobs[0]).not.toHaveProperty("completedAt");
    expect(jobs[0].legacyClass).toBe("TECHNICAL_COMPLETED");
  });

  it("relata o inventário completo por classe, mesmo com contagem zero", async () => {
    const jobs = [
      job({ id: "j1", legacyClass: "TECHNICAL_COMPLETED" }),
      job({ id: "j2", legacyClass: "TECHNICAL_COMPLETED" }),
      job({ id: "j3", legacyClass: "NEEDS_REVIEW" }),
    ];
    const reconciliation = new LegacyMigrationJobReconciliation(
      createFakePrisma(jobs) as never,
    );

    const inventory = await reconciliation.inventory();

    expect(inventory).toEqual([
      { legacyClass: "UNCLASSIFIED", count: 0 },
      { legacyClass: "TECHNICAL_COMPLETED", count: 2 },
      { legacyClass: "TECHNICAL_INCOMPLETE", count: 0 },
      { legacyClass: "TECHNICAL_FAILED", count: 0 },
      { legacyClass: "NEEDS_REVIEW", count: 1 },
    ]);
  });

  it("lista os casos NEEDS_REVIEW sem apagá-los", async () => {
    const jobs = [
      job({ id: "j1", legacyClass: "NEEDS_REVIEW" }),
      job({ id: "j2", legacyClass: "TECHNICAL_COMPLETED" }),
    ];
    const reconciliation = new LegacyMigrationJobReconciliation(
      createFakePrisma(jobs) as never,
    );

    const review = await reconciliation.needsReview();

    expect(review.map((item) => item.id)).toEqual(["j1"]);
    expect(jobs).toHaveLength(2);
  });
});
