import type { PrismaClient } from "../../generated/prisma/client.js";

type LegacyMigrationJobClass =
  | "UNCLASSIFIED"
  | "TECHNICAL_COMPLETED"
  | "TECHNICAL_INCOMPLETE"
  | "TECHNICAL_FAILED"
  | "NEEDS_REVIEW";

interface ClassifiableJob {
  status: string;
  summary: unknown;
}

interface Classification {
  legacyClass: LegacyMigrationJobClass;
  reviewReason: string | null;
}

/**
 * Classifica um `MigrationJob` do protocolo antigo (Goal010, U-02).
 *
 * E classificacao pura, nunca conversao: o resultado nunca vira conclusao de
 * importacao do usuario nem consome o direito — isso vive so em
 * `ImportSession.completedAt`, uma tabela que esta nem le. `COMPLETED` sem a
 * prova esperada (o `summary.imported` que {@link CalendarMigrationService}
 * grava ao terminar) e tratado como `NEEDS_REVIEW`, nunca presumido
 * concluido; o mesmo vale para um job parado em estado nao terminal, que o
 * protocolo antigo pode deixar para tras sem nunca declarar sucesso ou
 * falha.
 */
export function classifyLegacyJob(job: ClassifiableJob): Classification {
  if (job.status === "COMPLETED") {
    return hasImportProof(job.summary)
      ? { legacyClass: "TECHNICAL_COMPLETED", reviewReason: null }
      : {
          legacyClass: "NEEDS_REVIEW",
          reviewReason: "COMPLETED_WITHOUT_IMPORT_PROOF",
        };
  }
  if (job.status === "FAILED") {
    return { legacyClass: "TECHNICAL_FAILED", reviewReason: null };
  }
  if (job.status === "PARTIAL") {
    return { legacyClass: "TECHNICAL_INCOMPLETE", reviewReason: null };
  }
  // PENDING, ANALYZING, RUNNING: o protocolo antigo nunca declarou um
  // resultado terminal para este job. Sem prova de conclusao nem de falha,
  // o caso e isolado para revisao humana em vez de presumido em qualquer
  // sentido.
  return {
    legacyClass: "NEEDS_REVIEW",
    reviewReason: "STALE_NON_TERMINAL_STATUS",
  };
}

function hasImportProof(summary: unknown): boolean {
  if (!summary || typeof summary !== "object") return false;
  const imported = (summary as Record<string, unknown>).imported;
  return Boolean(imported && typeof imported === "object");
}

export interface LegacyJobInventoryEntry {
  legacyClass: LegacyMigrationJobClass;
  count: number;
}

const allClasses: LegacyMigrationJobClass[] = [
  "UNCLASSIFIED",
  "TECHNICAL_COMPLETED",
  "TECHNICAL_INCOMPLETE",
  "TECHNICAL_FAILED",
  "NEEDS_REVIEW",
];

/**
 * Inventario e classificacao dos `MigrationJob` legados (Goal010, U-02).
 *
 * Nunca apaga nem converte uma linha: so preenche `legacyClass` e os campos
 * de auditoria da classificacao. Idempotente — job ja classificado
 * (`legacyClass !== "UNCLASSIFIED"`) nunca e reclassificado, entao rodar de
 * novo sobre o mesmo tenant nao muda o que ja foi decidido.
 */
export class LegacyMigrationJobReconciliation {
  constructor(private readonly prisma: PrismaClient) {}

  /** Classifica todo job `UNCLASSIFIED` do tenant (ou de todos, se omitido). */
  async classifyPending(
    classifiedBy: string,
    tenantId?: string,
  ): Promise<{ classified: number }> {
    const pending = await this.prisma.migrationJob.findMany({
      where: {
        legacyClass: "UNCLASSIFIED",
        ...(tenantId ? { tenantId } : {}),
      },
    });
    for (const job of pending) {
      const { legacyClass, reviewReason } = classifyLegacyJob(job);
      await this.prisma.migrationJob.update({
        where: { tenantId_id: { tenantId: job.tenantId, id: job.id } },
        data: {
          legacyClass,
          legacyClassifiedAt: new Date(),
          legacyClassifiedBy: classifiedBy,
          legacyReviewReason: reviewReason,
        },
      });
    }
    return { classified: pending.length };
  }

  /**
   * Inventario reportavel (U-02): contagem por classe, incluindo as zeradas,
   * sem apagar nem tocar nenhuma linha.
   */
  async inventory(tenantId?: string): Promise<LegacyJobInventoryEntry[]> {
    const jobs = await this.prisma.migrationJob.findMany({
      where: tenantId ? { tenantId } : {},
    });
    const counts = new Map<LegacyMigrationJobClass, number>(
      allClasses.map((legacyClass) => [legacyClass, 0]),
    );
    for (const job of jobs) {
      counts.set(job.legacyClass, (counts.get(job.legacyClass) ?? 0) + 1);
    }
    return allClasses.map((legacyClass) => ({
      legacyClass,
      count: counts.get(legacyClass) ?? 0,
    }));
  }

  /** Casos isolados para revisao humana (U-02), nunca apagados. */
  async needsReview(tenantId?: string) {
    return this.prisma.migrationJob.findMany({
      where: {
        legacyClass: "NEEDS_REVIEW",
        ...(tenantId ? { tenantId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }
}
