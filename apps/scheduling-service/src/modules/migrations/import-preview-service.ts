import { env } from "../../config/env.js";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type {
  ExternalEntityType,
  ImportCategory,
  ImportItemStatus,
  ImportSessionStatus,
  IntegrationProvider,
} from "../../generated/prisma/enums.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  normalizePhone,
  phoneEquivalenceCandidates,
} from "../../shared/phone/phone.js";
import {
  type AvailabilityGridRule,
  isValidAvailabilityGrid,
} from "../availability/availability-grid.js";
import { migrationAvailabilityRules } from "../integrations/minha-agenda/availability.js";
import type {
  GetImportSnapshotInput,
  MinhaAgendaImportCategorySnapshot,
  MinhaAgendaImportRecord,
  MinhaAgendaImportSnapshot,
} from "../integrations/minha-agenda/import-source-reader.js";
import {
  type WorkSchedule,
  workScheduleSchema,
} from "../integrations/minha-agenda/types.js";
import {
  acquireImportLease,
  type ImportLease,
  importLeaseHeldError,
  ImportLeaseHolder,
  importWorkFailure,
  newImportLeaseOwner,
} from "./import-lease.js";
import {
  knownPositiveDuration,
  proposedServiceFrom,
  resolvePrice,
} from "./import-source-values.js";

/**
 * Superficie minima que o preview precisa da origem: so a leitura por
 * categoria (Goal010, WU-02). Um dublê de teste implementa isto direto, sem
 * precisar simular o client HTTP inteiro.
 */
export interface ImportPreviewSourceReader {
  getImportSnapshot(
    input: GetImportSnapshotInput,
  ): Promise<MinhaAgendaImportSnapshot>;
}

/**
 * Leitor resolvido so dentro do trabalho (Goal061 §1): montar o leitor
 * decifra a credencial, e a requisicao que inicia nunca toca a origem nem o
 * que a alcanca. Falha ao montar e falha do trabalho, gravada como as outras.
 */
export type ImportSourceReaderFactory = () => Promise<ImportPreviewSourceReader>;

export type ImportSourceInput =
  | ImportPreviewSourceReader
  | ImportSourceReaderFactory;

/** Resolve o leitor, seja ele dado pronto ou montado sob demanda. */
export async function resolveImportSource(
  source: ImportSourceInput,
): Promise<ImportPreviewSourceReader> {
  return typeof source === "function" ? source() : source;
}

/** Opcoes de lease comuns ao inicio e ao trabalho da analise e da execucao. */
export interface ImportWorkLeaseOptions {
  /** Identidade da instancia; omitida, uma nova e gerada por passada. */
  leaseOwner?: string;
  /** TTL do lease em segundos; o padrao e `IMPORT_LEASE_TTL_SECONDS`. */
  leaseTtlSeconds?: number;
  /** Milissegundos entre renovacoes; so o teste encurta. */
  leaseRenewIntervalMs?: number;
}

/**
 * O que a requisicao de inicio da analise devolve e o que o trabalho precisa
 * para continuar (Goal061 §1). `status` e sempre `ANALYZING`: e o que o
 * `UPDATE` da reivindicacao gravou.
 */
export interface ImportAnalysisStart {
  tenantId: string;
  sessionId: string;
  status: "ANALYZING";
  /** Versao vigente no inicio; a analise concluida grava a seguinte. */
  previewVersion: number;
  provider: IntegrationProvider;
  /** Estado a que a sessao volta se o trabalho falhar. */
  restoreStatus: ImportSessionStatus;
  /** Estado que a analise concluida grava: o mesmo da baseline. */
  finalStatus: "READY" | "PARTIAL";
  lease: ImportLease;
}

/** A analise perdeu o lease: outra passada, `replace` ou outra instancia. */
export const IMPORT_SESSION_LEASE_LOST = "IMPORT_SESSION_LEASE_LOST";

class AnalysisLeaseLost extends Error {}

export type ImportMatchClass = "NONE" | "EXACT" | "SIMILAR" | "DIVERGENT";

export interface ImportPreviewItemResult {
  category: ImportCategory;
  externalId: string;
  label: string;
  status: ImportItemStatus;
  reasonCode: string | null;
  reasonDetail: string | null;
  /**
   * Classificacao calculada nesta analise contra a base ja preenchida.
   * `EXACT` e mesclavel, `SIMILAR` so sugere, `DIVERGENT` exige decisao
   * explicita. Nunca persistido no item: e recalculada a cada analise.
   */
  matchClass: ImportMatchClass;
  matchCandidateInternalIds: string[];
  isNew: boolean;
  changed: boolean;
}

export interface ImportPreviewCategoryResult {
  category: ImportCategory;
  sourceSupported: boolean;
  limitationCode: string | null;
  limitationDetail: string | null;
  sourceReportedCount: number | null;
  readCount: number;
  discoveredCount: number;
  pendingCount: number;
  needsReviewCount: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
}

export interface ImportPreviewResult {
  sessionId: string;
  previewVersion: number;
  generatedAt: string;
  categories: ImportPreviewCategoryResult[];
  items: ImportPreviewItemResult[];
  changesSincePreviousVersion: {
    newCount: number;
    changedCount: number;
    disappearedCount: number;
  };
}

/**
 * Preview gravado pela última análise, lido sem tocar a origem (Goal061
 * §7.4, WU-02). Só o que `recordAnalysis` já persistiu em `ImportSession` e
 * `ImportSessionCategory` — nunca `changesSincePreviousVersion`, que é
 * calculado na hora da análise e não é reconstruível de uma leitura
 * posterior.
 */
export interface ImportPreviewSnapshot {
  sessionId: string;
  previewVersion: number;
  generatedAt: string | null;
  categories: ImportPreviewCategoryResult[];
}

/** A sessão nunca foi analisada: não há preview gravado para ler. */
export const IMPORT_SESSION_PREVIEW_NOT_AVAILABLE =
  "IMPORT_SESSION_PREVIEW_NOT_AVAILABLE";

/**
 * Tipo de entidade de destino por categoria: e a chave de idempotencia por
 * origem/item em `ExternalEntityMap`. Exportado porque o motor de execucao
 * (WU-04) precisa exatamente do mesmo mapeamento — duas copias dele seriam
 * duas definicoes de identidade da mesma coisa.
 */
export const CATEGORY_ENTITY_TYPE: Record<ImportCategory, ExternalEntityType> = {
  SERVICE: "SERVICE",
  CUSTOMER: "CUSTOMER",
  AVAILABILITY: "AVAILABILITY",
  TIME_BLOCK: "TIME_BLOCK",
  FUTURE_APPOINTMENT: "APPOINTMENT",
  PAST_APPOINTMENT: "APPOINTMENT",
  CANCELLED_APPOINTMENT: "APPOINTMENT",
  NO_SHOW_APPOINTMENT: "APPOINTMENT",
};

/**
 * Sessao ainda analisavel: nao comecou execucao nem chegou a um terminal.
 * `ANALYZING` so e reivindicavel com o lease vencido ou livre — a condicao
 * vive no `WHERE` de `acquireImportLease`, nao aqui.
 */
const ANALYZABLE_STATUS_LIST: ImportSessionStatus[] = [
  "DRAFT",
  "ANALYZING",
  "READY",
  "PARTIAL",
];
const ANALYZABLE_STATUSES = new Set<string>(ANALYZABLE_STATUS_LIST);

/** A mesma ordem do motor e do histórico: a leitura do preview lê como a tela mostra. */
const PREVIEW_CATEGORY_ORDER: ImportCategory[] = [
  "SERVICE",
  "CUSTOMER",
  "AVAILABILITY",
  "TIME_BLOCK",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
];

/**
 * Disponibilidade da origem contra a grade vigente (Goal062 §2). O negocio ja
 * tem horario ativo: a grade da origem so entra **no lugar** dela, e so com
 * `INCLUDE` de item. Sem essa decisao, nada de disponibilidade e gravado.
 */
export const AVAILABILITY_REPLACES_CURRENT = "AVAILABILITY_REPLACES_CURRENT";
/**
 * A grade da origem se sobrepoe a si mesma (ou tem inicio depois do fim) pela
 * mesma regra da tela de configuracao: nunca e gravada, nem com decisao.
 */
export const AVAILABILITY_SOURCE_OVERLAP = "AVAILABILITY_SOURCE_OVERLAP";
/**
 * Na execucao, o negocio tem horario ativo e a troca nao foi confirmada — a
 * grade ganhou regra depois da analise. Nada e gravado; e preciso analisar
 * de novo.
 */
export const AVAILABILITY_CHANGED_SINCE_ANALYSIS =
  "AVAILABILITY_CHANGED_SINCE_ANALYSIS";

/** A sessao ja terminou (Goal020, WU-02): nao ha mais o que escolher. */
export const IMPORT_SESSION_NOT_SELECTABLE = "IMPORT_SESSION_NOT_SELECTABLE";
/** A categoria pedida nunca foi descoberta por uma analise desta sessao. */
export const IMPORT_SESSION_CATEGORY_NOT_FOUND =
  "IMPORT_SESSION_CATEGORY_NOT_FOUND";

/**
 * `COMPLETED` ja importou, `FAILED` e `SUPERSEDED` nao seguem para execucao
 * nenhuma: escolher categoria depois disso e decisao sem efeito. `EXECUTING`
 * fica de fora de proposito, no mesmo espirito do WU-06 — a escolha so vale
 * na proxima passada, e recusa-la no meio de uma corrente ja em andamento
 * nao protege nada que a leitura fresca de categorias no inicio de cada
 * `execute()` nao ja resolva.
 */
const TERMINAL_SESSION_STATUSES = new Set(["COMPLETED", "FAILED", "SUPERSEDED"]);

/** Item ja resolvido por uma execucao anterior: reanalise nunca reverte. */
const RESOLVED_ITEM_STATUSES = new Set<ImportItemStatus>([
  "IMPORTED",
  "SKIPPED",
  "FAILED",
]);

interface MatchableCustomer {
  id: string;
  name: string | null;
  normalizedPhone: string | null;
}

interface MatchableService {
  id: string;
  name: string;
  durationMinutes: number | null;
  priceType: string;
  /** `Decimal` do banco ou numero: sempre comparado como `Number`, como o DTO do cadastro. */
  price: { toString(): string } | number | null;
}

/**
 * Grade proposta pela origem para o grupo de disponibilidade (`company` e
 * `employee:<id>` formam uma grade so). `rules` so existe quando a grade
 * passou na regra de sobreposicao; `overlap` marca a que nao passou.
 */
interface AvailabilityProposal {
  rules: AvailabilityGridRule[] | null;
  overlap: boolean;
}

interface Classification {
  label: string;
  status: ImportItemStatus;
  reasonCode: string | null;
  reasonDetail: string | null;
  matchClass: ImportMatchClass;
  candidateInternalIds: string[];
}

/**
 * Analise de importacao versionada, sem escrita operacional (Goal010,
 * WU-03). `analyze` le a origem por categoria, calcula conflitos item a item
 * contra a base ja preenchida e persiste apenas o preview
 * (`ImportSessionCategory`/`ImportItem`/contadores de `ImportSession`) — em
 * nenhum caminho toca `Customer`, `Service`, `Appointment`,
 * `AvailabilityRule` ou `TimeBlock`. Cada reanalise incrementa
 * `previewVersion` e reconcilia por `(category, externalId)`: a linha do
 * item nunca e apagada nem recriada, e um item ja resolvido por uma execucao
 * anterior (`IMPORTED`/`SKIPPED`/`FAILED`) nunca e revertido por uma nova
 * analise.
 */
export class ImportPreviewService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Analise inteira numa chamada so: inicio e trabalho em sequencia. E o
   * caminho de quem precisa do resultado na mao (servico, teste); a rota
   * chama {@link startAnalysis} e dispara {@link runAnalysis} sem esperar.
   */
  async analyze(
    context: { tenantId: string; sessionId: string },
    reader: ImportSourceInput,
    snapshotInput: GetImportSnapshotInput,
    options: ImportWorkLeaseOptions = {},
  ): Promise<ImportPreviewResult> {
    const start = await this.startAnalysis(context, options);
    const result = await this.runAnalysis(start, reader, snapshotInput, options);
    if (!result) {
      throw new AppError(
        IMPORT_SESSION_LEASE_LOST,
        "The import analysis lost its lease before it could be recorded.",
        409,
      );
    }
    return result;
  }

  /**
   * Leitura do preview gravado pela última análise, sem tocar a origem
   * (Goal061 §7.4, WU-02): só `ImportSession` e `ImportSessionCategory` da
   * versão vigente. Sessão que nunca analisou (`previewVersion` 0) não tem
   * o que ler e é recusada com código próprio, em vez de devolver um
   * preview vazio que pareceria uma análise que não aconteceu.
   */
  async getPreview(
    context: { tenantId: string; sessionId: string },
  ): Promise<ImportPreviewSnapshot> {
    const session = await this.prisma.importSession.findUnique({
      where: {
        tenantId_id: { tenantId: context.tenantId, id: context.sessionId },
      },
    });
    if (!session) {
      throw new AppError(
        "IMPORT_SESSION_NOT_FOUND",
        "Import session was not found.",
        404,
      );
    }
    if (session.previewVersion === 0) {
      throw new AppError(
        IMPORT_SESSION_PREVIEW_NOT_AVAILABLE,
        "This import session has not been analyzed yet; there is no preview to read.",
        409,
        { status: session.status },
      );
    }
    const rows = await this.prisma.importSessionCategory.findMany({
      where: { tenantId: context.tenantId, sessionId: context.sessionId },
    });
    const byCategory = new Map(rows.map((row) => [row.category, row]));
    const categories: ImportPreviewCategoryResult[] = [];
    for (const category of PREVIEW_CATEGORY_ORDER) {
      const row = byCategory.get(category);
      if (!row) continue;
      categories.push({
        category,
        sourceSupported: row.sourceSupported,
        limitationCode: row.limitationCode,
        limitationDetail: row.limitationDetail,
        sourceReportedCount: row.sourceReportedCount,
        readCount: row.readCount,
        discoveredCount: row.discoveredCount,
        pendingCount: row.pendingCount,
        needsReviewCount: row.needsReviewCount,
        importedCount: row.importedCount,
        skippedCount: row.skippedCount,
        failedCount: row.failedCount,
      });
    }
    return {
      sessionId: session.id,
      previewVersion: session.previewVersion,
      generatedAt: session.previewGeneratedAt?.toISOString() ?? null,
      categories,
    };
  }

  /**
   * Inicio da analise (Goal061 §1): confere a sessao e a reivindica gravando
   * `ANALYZING` no mesmo `UPDATE` do lease. Nunca le a origem.
   *
   * A reivindicacao exige que a sessao ainda esteja **no estado lido**: e
   * isso que torna exato o estado de partida guardado em
   * `restoreStatus`/`finalStatus`, porque `ANALYZING` apaga o anterior. Se
   * outro ator mudou a sessao entre a leitura e o `UPDATE`, a reivindicacao
   * perde e nada e gravado.
   *
   * Sessao em `EXECUTING` ou em `ANALYZING` com lease vivo e recusada com
   * `IMPORT_SESSION_LEASE_HELD`: analise e execucao se excluem pela linha.
   */
  async startAnalysis(
    context: { tenantId: string; sessionId: string },
    options: ImportWorkLeaseOptions = {},
  ): Promise<ImportAnalysisStart> {
    const session = await this.prisma.importSession.findUnique({
      where: {
        tenantId_id: { tenantId: context.tenantId, id: context.sessionId },
      },
    });
    if (!session) {
      throw new AppError(
        "IMPORT_SESSION_NOT_FOUND",
        "Import session was not found.",
        404,
      );
    }
    const notAnalyzable = (status: string) =>
      new AppError(
        "IMPORT_SESSION_NOT_ANALYZABLE",
        `Import session cannot be analyzed while in status ${status}.`,
        409,
        { status },
      );
    if (!ANALYZABLE_STATUSES.has(session.status) && session.status !== "EXECUTING") {
      throw notAnalyzable(session.status);
    }

    // Antes da reivindicacao, que muda a linha: o estado de partida e o que
    // foi lido, e o `WHERE` abaixo so aceita a linha se ela ainda estiver nele.
    const origin = analysisOrigin(session);
    const owner = options.leaseOwner ?? newImportLeaseOwner();
    const claim = await acquireImportLease(this.prisma, {
      tenantId: context.tenantId,
      sessionId: context.sessionId,
      owner,
      ttlSeconds: options.leaseTtlSeconds,
      // `EXECUTING` nunca e reivindicavel pela analise: a lista cheia so
      // existe para que a recusa diga, pelo relogio do banco, se o lease da
      // execucao esta vivo (`LEASE_HELD`) ou nao (`NOT_ANALYZABLE`).
      statuses:
        session.status === "EXECUTING"
          ? ANALYZABLE_STATUS_LIST
          : [session.status],
      onClaim: { status: "ANALYZING", errorCode: null, errorMessage: null },
    });
    if (!claim.acquired) {
      throw importLeaseHeldError(
        claim,
        notAnalyzable(claim.status ?? session.status),
      );
    }

    return {
      tenantId: context.tenantId,
      sessionId: context.sessionId,
      status: "ANALYZING",
      previewVersion: session.previewVersion,
      provider: session.provider,
      restoreStatus: origin.restoreStatus,
      finalStatus: origin.finalStatus,
      lease: claim.lease,
    };
  }

  /**
   * Trabalho da analise (Goal061 §2 e §3), ja sob lease: le a origem
   * renovando o lease, classifica e grava o preview numa transacao que so
   * vale se a sessao ainda e desta passada (`leaseOwner` e `ANALYZING`).
   *
   * Devolve `null` quando o lease foi perdido — `replace`, outra instancia
   * ou lease vencido e tomado: nada da sessao e escrito. Falha que nao e de
   * item grava `errorCode` do conjunto fechado, devolve a sessao ao estado
   * de partida e libera o lease, tudo no mesmo `UPDATE` condicionado ao dono.
   */
  async runAnalysis(
    start: ImportAnalysisStart,
    source: ImportSourceInput,
    snapshotInput: GetImportSnapshotInput,
    options: ImportWorkLeaseOptions = {},
  ): Promise<ImportPreviewResult | null> {
    const lease = new ImportLeaseHolder(
      this.prisma,
      start.lease,
      options.leaseTtlSeconds ?? env.IMPORT_LEASE_TTL_SECONDS,
      options.leaseRenewIntervalMs,
    );
    try {
      const reader = await resolveImportSource(source);
      const snapshot = await lease.keepAliveWhile(
        reader.getImportSnapshot(snapshotInput),
      );
      // Perdido durante a leitura: nem vale classificar o que ja nao sera
      // gravado.
      if (!(await lease.heartbeat({ force: true }))) return null;
      return await this.recordAnalysis(start, snapshot);
    } catch (error) {
      if (error instanceof AnalysisLeaseLost) return null;
      await lease.release({
        status: start.restoreStatus,
        ...importWorkFailure(error),
      });
      throw error;
    }
  }

  /** Classifica a origem lida e grava o preview sob fencing. */
  private async recordAnalysis(
    start: ImportAnalysisStart,
    snapshot: MinhaAgendaImportSnapshot,
  ): Promise<ImportPreviewResult> {
    const context = { tenantId: start.tenantId, sessionId: start.sessionId };
    const session = { provider: start.provider };
    const nextVersion = start.previewVersion + 1;

    const [
      existingCustomers,
      existingServices,
      externalMaps,
      existingItems,
      activeAvailabilityRules,
    ] = await Promise.all([
        this.prisma.customer.findMany({
          where: { tenantId: context.tenantId },
        }),
        this.prisma.service.findMany({ where: { tenantId: context.tenantId } }),
        this.prisma.externalEntityMap.findMany({
          where: { tenantId: context.tenantId, provider: session.provider },
        }),
        this.prisma.importItem.findMany({
          where: { tenantId: context.tenantId, sessionId: context.sessionId },
        }),
        this.prisma.availabilityRule.count({
          where: { tenantId: context.tenantId, active: true },
        }),
      ]);

    const externalMapIndex = new Map(
      externalMaps.map((entry) => [
        `${entry.entityType}:${entry.externalId}`,
        entry.internalId,
      ]),
    );
    const existingItemIndex = new Map(
      existingItems.map((item) => [`${item.category}:${item.externalId}`, item]),
    );

    const categorySnapshots = collectCategorySnapshots(snapshot);
    const availabilityProposal = proposeAvailability(
      snapshot.availability.records,
    );
    const seenKeys = new Set<string>();
    const itemResults: ImportPreviewItemResult[] = [];
    const categoryResults: ImportPreviewCategoryResult[] = [];

    const itemCreates: Parameters<PrismaClient["importItem"]["create"]>[0]["data"][] =
      [];
    const itemUpdates: Array<{
      id: string;
      data: Parameters<PrismaClient["importItem"]["update"]>[0]["data"];
    }> = [];
    const categoryUpserts: Array<
      Parameters<PrismaClient["importSessionCategory"]["upsert"]>[0]
    > = [];

    let newCount = 0;
    let changedCount = 0;

    for (const categorySnapshot of categorySnapshots) {
      const category = categorySnapshot.category;
      const entityType = CATEGORY_ENTITY_TYPE[category];
      const counts = {
        pending: 0,
        needsReview: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
      };

      for (const record of categorySnapshot.records) {
        const key = `${category}:${record.externalId}`;
        seenKeys.add(key);
        const classification = classifyRecord({
          category,
          record,
          entityType,
          externalMapIndex,
          existingCustomers,
          existingServices,
          availabilityProposal,
          hasActiveAvailability: activeAvailabilityRules > 0,
        });
        const proposedAvailability =
          category === "AVAILABILITY" && availabilityProposal.rules
            ? (availabilityProposal.rules as unknown as Prisma.InputJsonArray)
            : Prisma.DbNull;
        // Goal136: a correspondencia sugerida (servico e cliente) e o que a
        // origem propoe para o servico, gravados para a decisao os mostrar.
        const matchCandidateInternalIds =
          category === "SERVICE" || category === "CUSTOMER"
            ? (classification.candidateInternalIds as unknown as Prisma.InputJsonArray)
            : Prisma.DbNull;
        const proposedService =
          category === "SERVICE"
            ? (proposedServiceFrom(
                (record.raw ?? {}),
              ) as unknown as Prisma.InputJsonObject)
            : Prisma.DbNull;
        const fingerprint = fingerprintOf(record.raw);
        const existing = existingItemIndex.get(key);
        const isNew = !existing;
        const resolved = existing
          ? RESOLVED_ITEM_STATUSES.has(existing.status)
          : false;
        const changed = Boolean(existing) && existing?.fingerprint !== fingerprint;
        if (isNew) newCount += 1;
        else if (changed && !resolved) changedCount += 1;

        const effectiveStatus = resolved
          ? (existing?.status as ImportItemStatus)
          : classification.status;
        const effectiveReasonCode = resolved
          ? (existing?.reasonCode ?? null)
          : classification.reasonCode;
        const effectiveReasonDetail = resolved
          ? (existing?.reasonDetail ?? null)
          : classification.reasonDetail;
        const effectiveLabel = resolved
          ? (existing?.label ?? classification.label)
          : classification.label;

        countStatus(counts, effectiveStatus);

        itemResults.push({
          category,
          externalId: record.externalId,
          label: effectiveLabel,
          status: effectiveStatus,
          reasonCode: effectiveReasonCode,
          reasonDetail: effectiveReasonDetail,
          matchClass: classification.matchClass,
          matchCandidateInternalIds: classification.candidateInternalIds,
          isNew,
          changed,
        });

        if (existing && resolved) {
          itemUpdates.push({
            id: existing.id,
            data: { lastSeenPreviewVersion: nextVersion, disappearedAt: null },
          });
        } else if (existing) {
          itemUpdates.push({
            id: existing.id,
            data: {
              label: classification.label,
              status: classification.status,
              reasonCode: classification.reasonCode,
              reasonDetail: classification.reasonDetail,
              fingerprint,
              proposedAvailability,
              matchCandidateInternalIds,
              proposedService,
              lastSeenPreviewVersion: nextVersion,
              disappearedAt: null,
            },
          });
        } else {
          itemCreates.push({
            tenantId: context.tenantId,
            sessionId: context.sessionId,
            category,
            externalId: record.externalId,
            label: classification.label,
            status: classification.status,
            reasonCode: classification.reasonCode,
            reasonDetail: classification.reasonDetail,
            fingerprint,
            proposedAvailability,
            matchCandidateInternalIds,
            proposedService,
            firstSeenPreviewVersion: nextVersion,
            lastSeenPreviewVersion: nextVersion,
          });
        }
      }

      categoryResults.push({
        category,
        sourceSupported: categorySnapshot.coverage.sourceSupported,
        limitationCode: categorySnapshot.coverage.limitationCode,
        limitationDetail: categorySnapshot.coverage.limitationDetail,
        sourceReportedCount: categorySnapshot.coverage.sourceReportedCount,
        readCount: categorySnapshot.coverage.readCount,
        discoveredCount: categorySnapshot.records.length,
        pendingCount: counts.pending,
        needsReviewCount: counts.needsReview,
        importedCount: counts.imported,
        skippedCount: counts.skipped,
        failedCount: counts.failed,
      });

      categoryUpserts.push({
        where: {
          tenantId_sessionId_category: {
            tenantId: context.tenantId,
            sessionId: context.sessionId,
            category,
          },
        },
        create: {
          tenantId: context.tenantId,
          sessionId: context.sessionId,
          category,
          sourceSupported: categorySnapshot.coverage.sourceSupported,
          limitationCode: categorySnapshot.coverage.limitationCode,
          limitationDetail: categorySnapshot.coverage.limitationDetail,
          sourceReportedCount: categorySnapshot.coverage.sourceReportedCount,
          readCount: categorySnapshot.coverage.readCount,
          discoveredCount: categorySnapshot.records.length,
          pendingCount: counts.pending,
          needsReviewCount: counts.needsReview,
          importedCount: counts.imported,
          skippedCount: counts.skipped,
          failedCount: counts.failed,
          previewVersion: nextVersion,
        },
        update: {
          sourceSupported: categorySnapshot.coverage.sourceSupported,
          limitationCode: categorySnapshot.coverage.limitationCode,
          limitationDetail: categorySnapshot.coverage.limitationDetail,
          sourceReportedCount: categorySnapshot.coverage.sourceReportedCount,
          readCount: categorySnapshot.coverage.readCount,
          discoveredCount: categorySnapshot.records.length,
          pendingCount: counts.pending,
          needsReviewCount: counts.needsReview,
          importedCount: counts.imported,
          skippedCount: counts.skipped,
          failedCount: counts.failed,
          previewVersion: nextVersion,
        },
      });
    }

    // Itens que desapareceram da origem nesta versao: a linha permanece, so
    // ganha `disappearedAt` — a reanalise declara o que mudou, nunca apaga.
    let disappearedCount = 0;
    const generatedAt = new Date();
    for (const item of existingItems) {
      const key = `${item.category}:${item.externalId}`;
      if (seenKeys.has(key) || item.disappearedAt) continue;
      disappearedCount += 1;
      itemUpdates.push({
        id: item.id,
        data: { disappearedAt: generatedAt },
      });
    }

    const sourceFingerprint = fingerprintOf(
      categorySnapshots.map((entry) => ({
        category: entry.category,
        ids: entry.records.map((record) => record.externalId),
      })),
    );

    const totals = categoryResults.reduce(
      (acc, entry) => ({
        pending: acc.pending + entry.pendingCount,
        needsReview: acc.needsReview + entry.needsReviewCount,
        imported: acc.imported + entry.importedCount,
        skipped: acc.skipped + entry.skippedCount,
        failed: acc.failed + entry.failedCount,
      }),
      { pending: 0, needsReview: 0, imported: 0, skipped: 0, failed: 0 },
    );

    // Sessao PARTIAL (execucao anterior incompleta) continua PARTIAL: a
    // reanalise nao apaga o andamento. Toda outra sessao analisavel vira
    // READY, pronta para "Importar tudo". O estado de partida vem do inicio,
    // porque `ANALYZING` ja o apagou da linha.
    const nextStatus = start.finalStatus;

    await this.prisma.$transaction(async (tx) => {
      // Fencing (Goal061 §2): a primeira escrita e a da sessao, condicionada
      // ao dono do lease e a `ANALYZING`. Ela trava a linha, entao `replace`
      // ou uma reivindicacao concorrente esperam por ela ou ja a mudaram — e
      // nesse caso `count = 0`, a transacao inteira desiste e nenhum item,
      // categoria ou contador e gravado. O mesmo `UPDATE` devolve o lease.
      const closed = await tx.importSession.updateMany({
        where: {
          tenantId: context.tenantId,
          id: context.sessionId,
          leaseOwner: start.lease.owner,
          status: "ANALYZING",
        },
        data: {
          status: nextStatus,
          previewVersion: nextVersion,
          previewGeneratedAt: generatedAt,
          sourceFingerprint,
          pendingCount: totals.pending,
          needsReviewCount: totals.needsReview,
          importedCount: totals.imported,
          skippedCount: totals.skipped,
          failedCount: totals.failed,
          errorCode: null,
          errorMessage: null,
          leaseOwner: null,
          leaseAcquiredAt: null,
          leaseExpiresAt: null,
        },
      });
      if (closed.count !== 1) throw new AnalysisLeaseLost();
      for (const data of itemCreates) {
        await tx.importItem.create({ data });
      }
      for (const update of itemUpdates) {
        await tx.importItem.update({
          where: {
            tenantId_id: { tenantId: context.tenantId, id: update.id },
          },
          data: update.data,
        });
      }
      for (const upsert of categoryUpserts) {
        await tx.importSessionCategory.upsert(upsert);
      }
    });

    return {
      sessionId: context.sessionId,
      previewVersion: nextVersion,
      generatedAt: generatedAt.toISOString(),
      categories: categoryResults,
      items: itemResults,
      changesSincePreviousVersion: {
        newCount,
        changedCount,
        disappearedCount,
      },
    };
  }

  /**
   * Recusa executar contra uma versao de preview que nao e mais a vigente
   * (Goal010, WU-03). Erro proprio e identificavel: `IMPORT_PREVIEW_STALE`.
   */
  async assertPreviewVersionCurrent(
    tenantId: string,
    sessionId: string,
    previewVersion: number,
  ): Promise<void> {
    const session = await this.prisma.importSession.findUnique({
      where: { tenantId_id: { tenantId, id: sessionId } },
    });
    if (!session) {
      throw new AppError(
        "IMPORT_SESSION_NOT_FOUND",
        "Import session was not found.",
        404,
      );
    }
    if (session.previewVersion !== previewVersion) {
      throw new AppError(
        "IMPORT_PREVIEW_STALE",
        "The import preview used for this request is no longer current; analyze again before executing.",
        409,
        {
          currentPreviewVersion: session.previewVersion,
          requestedPreviewVersion: previewVersion,
        },
      );
    }
  }

  /**
   * Escreve `selected` por sessao e categoria (Goal020, WU-02): o unico
   * outro escritor deste campo e o upsert do preview acima, que so cria com
   * o default do schema e nunca toca `selected` numa reanalise — a escolha
   * do negocio sobrevive a qualquer numero de reanalises. Esta escrita, por
   * simetria, nunca toca `previewVersion` nem os itens da categoria: quem
   * honra a escolha e o motor de execucao, lendo a mesma tabela no inicio de
   * cada passada.
   */
  async setCategorySelection(
    context: { tenantId: string; sessionId: string },
    category: ImportCategory,
    selected: boolean,
  ): Promise<{ sessionId: string; category: ImportCategory; selected: boolean }> {
    const session = await this.prisma.importSession.findUnique({
      where: {
        tenantId_id: { tenantId: context.tenantId, id: context.sessionId },
      },
    });
    if (!session) {
      throw new AppError(
        "IMPORT_SESSION_NOT_FOUND",
        "Import session was not found.",
        404,
      );
    }
    if (TERMINAL_SESSION_STATUSES.has(session.status)) {
      throw new AppError(
        IMPORT_SESSION_NOT_SELECTABLE,
        `Import session cannot have its categories chosen while in status ${session.status}.`,
        409,
        { status: session.status },
      );
    }
    const row = await this.prisma.importSessionCategory.findUnique({
      where: {
        tenantId_sessionId_category: {
          tenantId: context.tenantId,
          sessionId: context.sessionId,
          category,
        },
      },
    });
    if (!row) {
      throw new AppError(
        IMPORT_SESSION_CATEGORY_NOT_FOUND,
        "This session has not discovered this category yet.",
        404,
      );
    }
    const updated = await this.prisma.importSessionCategory.update({
      where: { tenantId_id: { tenantId: context.tenantId, id: row.id } },
      data: { selected },
    });
    return {
      sessionId: context.sessionId,
      category: updated.category,
      selected: updated.selected,
    };
  }
}

/**
 * Estado de partida da analise. Lido da linha antes da reivindicacao, e a
 * reivindicacao exige que a linha ainda esteja nele — por isso e exato.
 *
 * A unica excecao e retomar uma analise que caiu (`ANALYZING` com lease
 * vencido): o estado anterior ja foi apagado e nao ha campo que o guarde. A
 * regra e entao derivada do que a linha ainda prova: sessao que uma execucao
 * ja tocou (`startedAt`) e tratada como `PARTIAL`, que e o estado que
 * preserva o andamento; as demais voltam a `READY`, ou a `DRAFT` se nunca
 * houve preview.
 */
function analysisOrigin(session: {
  status: ImportSessionStatus;
  startedAt: Date | null;
  previewVersion: number;
}): { restoreStatus: ImportSessionStatus; finalStatus: "READY" | "PARTIAL" } {
  if (session.status === "ANALYZING") {
    if (session.startedAt) {
      return { restoreStatus: "PARTIAL", finalStatus: "PARTIAL" };
    }
    return {
      restoreStatus: session.previewVersion > 0 ? "READY" : "DRAFT",
      finalStatus: "READY",
    };
  }
  return {
    restoreStatus: session.status,
    finalStatus: session.status === "PARTIAL" ? "PARTIAL" : "READY",
  };
}

function collectCategorySnapshots(
  snapshot: MinhaAgendaImportSnapshot,
): MinhaAgendaImportCategorySnapshot[] {
  return [
    snapshot.services,
    snapshot.customers,
    snapshot.availability,
    snapshot.timeBlocks,
    snapshot.futureAppointments,
    snapshot.pastAppointments,
    snapshot.cancelledAppointments,
    snapshot.noShowAppointments,
  ];
}

function countStatus(
  counts: {
    pending: number;
    needsReview: number;
    imported: number;
    skipped: number;
    failed: number;
  },
  status: ImportItemStatus,
): void {
  if (status === "PENDING") counts.pending += 1;
  else if (status === "NEEDS_REVIEW") counts.needsReview += 1;
  else if (status === "IMPORTED") counts.imported += 1;
  else if (status === "SKIPPED") counts.skipped += 1;
  else if (status === "FAILED") counts.failed += 1;
}

function classifyRecord(input: {
  category: ImportCategory;
  record: MinhaAgendaImportRecord;
  entityType: ExternalEntityType;
  externalMapIndex: Map<string, string>;
  existingCustomers: MatchableCustomer[];
  existingServices: MatchableService[];
  availabilityProposal: AvailabilityProposal;
  hasActiveAvailability: boolean;
}): Classification {
  const { category, record, entityType, externalMapIndex } = input;

  // Universal, para toda categoria: se este identificador de origem ja foi
  // criado na Avenly por uma importacao anterior (idempotencia de
  // `ExternalEntityMap`), a correspondencia e claramente identica.
  const alreadyImportedId = externalMapIndex.get(
    `${entityType}:${record.externalId}`,
  );
  if (alreadyImportedId) {
    return {
      label: labelFor(category, record),
      status: "PENDING",
      reasonCode: "ALREADY_IMPORTED_MATCH",
      reasonDetail:
        "Este registro já existe na Avenly, criado por uma importação anterior.",
      matchClass: "EXACT",
      candidateInternalIds: [alreadyImportedId],
    };
  }

  if (category === "SERVICE") {
    return classifyService(record, input.existingServices);
  }
  if (category === "CUSTOMER") {
    return classifyCustomer(record, input.existingCustomers);
  }
  if (category === "AVAILABILITY") {
    return classifyAvailability(
      record,
      input.availabilityProposal,
      input.hasActiveAvailability,
    );
  }

  return {
    label: labelFor(category, record),
    status: "PENDING",
    reasonCode: null,
    reasonDetail: null,
    matchClass: "NONE",
    candidateInternalIds: [],
  };
}

function classifyService(
  record: MinhaAgendaImportRecord,
  existingServices: MatchableService[],
): Classification {
  const raw = record.raw as
    | { name?: unknown; duration?: unknown; price?: unknown }
    | null;
  const name = asString(raw?.name) ?? `Serviço ${record.externalId}`;
  const duration = asPositiveNumber(raw?.duration);
  const price = typeof raw?.price === "number" ? raw.price : null;

  const exactMatches = existingServices.filter(
    (service) => normalizeText(service.name) === normalizeText(name),
  );
  const similarMatches = exactMatches.length
    ? []
    : existingServices.filter((service) => isSimilarName(service.name, name));

  let matchClass: ImportMatchClass = "NONE";
  let status: ImportItemStatus = "PENDING";
  let reasonCode: string | null = null;
  let reasonDetail: string | null = null;
  let candidateInternalIds: string[] = [];

  if (exactMatches.length === 1) {
    candidateInternalIds = [exactMatches[0].id];
    if (serviceValuesDiverge(exactMatches[0], raw)) {
      // Pergunta 795: mesmo nome, duracao ou preco diferentes — conflito a
      // decidir, nunca mesclagem silenciosa.
      matchClass = "DIVERGENT";
      status = "NEEDS_REVIEW";
      reasonCode = "SERVICE_MATCH_DIVERGENT";
      reasonDetail =
        "Serviço com o mesmo nome de um já cadastrado, mas com duração ou preço diferentes: compare e decida.";
    } else {
      matchClass = "EXACT";
      reasonCode = "SERVICE_MATCH_EXACT";
      reasonDetail =
        "Serviço com nome idêntico a um já cadastrado: pode ser mesclado.";
    }
  } else if (exactMatches.length > 1) {
    matchClass = "DIVERGENT";
    status = "NEEDS_REVIEW";
    reasonCode = "SERVICE_MATCH_AMBIGUOUS";
    reasonDetail =
      "Mais de um serviço já cadastrado tem o mesmo nome: escolha qual corresponde.";
    candidateInternalIds = exactMatches.map((service) => service.id);
  } else if (similarMatches.length > 0) {
    matchClass = "SIMILAR";
    status = "NEEDS_REVIEW";
    reasonCode = "SERVICE_MATCH_SIMILAR";
    reasonDetail =
      "Nome parecido com um serviço já cadastrado: confirme se é o mesmo.";
    candidateInternalIds = similarMatches.map((service) => service.id);
  }

  // Duracao ausente e pendencia de revisao propria (Goal007), independente
  // da classificacao de correspondencia: nunca duracao fabricada.
  if (duration === null) {
    status = "NEEDS_REVIEW";
    reasonCode = "SERVICE_DURATION_MISSING";
    reasonDetail =
      "Serviço sem duração informada pela origem: precisa de revisão antes de aceitar novos agendamentos.";
  } else if (price === 0 && reasonCode === null) {
    // Preco zero e "nao informado", nunca preco de verdade (Goal062, WU-01):
    // so informativo, nunca bloqueia a analise nem sobrepoe um reasonCode
    // ja explicado por correspondencia.
    reasonCode = "SERVICE_PRICE_NOT_INFORMED";
    reasonDetail =
      "Serviço sem preço informado pela origem (preço 0): revise antes de usar em cobrança.";
  }

  return { label: name, status, reasonCode, reasonDetail, matchClass, candidateInternalIds };
}

/**
 * Duracao ou preco da origem conhecidos e diferentes dos do cadastro (Goal136).
 * Valor desconhecido da origem (duracao ausente, preco ausente ou zero) nunca
 * fabrica divergencia; cadastro sem duracao ou sem preco `FIXED` conta como
 * diferente de um valor conhecido. Os valores da origem saem das mesmas
 * funcoes da execucao.
 */
function serviceValuesDiverge(
  existing: MatchableService,
  raw: { duration?: unknown; price?: unknown } | null,
): boolean {
  const duration = knownPositiveDuration(raw?.duration);
  if (duration !== null && existing.durationMinutes !== duration) return true;
  const { priceType, price } = resolvePrice(raw?.price);
  if (priceType === "FIXED") {
    if (existing.priceType !== "FIXED" || existing.price === null) return true;
    if (Number(existing.price) !== price) return true;
  }
  return false;
}

function classifyCustomer(
  record: MinhaAgendaImportRecord,
  existingCustomers: MatchableCustomer[],
): Classification {
  const raw = record.raw as
    | { name?: unknown; phone1?: unknown; phone2?: unknown }
    | null;
  const rawName = asString(raw?.name);
  const rawPhone = asString(raw?.phone1) ?? asString(raw?.phone2);
  const normalizedPhone = safeNormalizePhone(rawPhone);

  const label =
    rawName ?? `Cliente sem nome (origem #${record.externalId})`;

  let matchClass: ImportMatchClass = "NONE";
  let reasonCode: string | null = rawName ? null : "CUSTOMER_NAME_MISSING";
  let reasonDetail: string | null = rawName
    ? null
    : "Cliente sem nome na origem: identificado temporariamente pelo id de origem.";
  let candidateInternalIds: string[] = [];

  if (normalizedPhone) {
    const phoneCandidates = new Set(phoneEquivalenceCandidates(normalizedPhone));
    const phoneMatches = existingCustomers.filter(
      (customer) =>
        customer.normalizedPhone !== null &&
        phoneCandidates.has(customer.normalizedPhone),
    );
    if (phoneMatches.length > 0) {
      const sameName = rawName
        ? phoneMatches.filter(
            (customer) =>
              normalizeText(customer.name ?? "") === normalizeText(rawName),
          )
        : [];
      if (sameName.length === 1) {
        matchClass = "EXACT";
        reasonCode = "CUSTOMER_MATCH_EXACT";
        reasonDetail =
          "Cliente com telefone e nome idênticos a um já cadastrado: pode ser mesclado.";
        candidateInternalIds = [sameName[0].id];
      } else if (sameName.length > 1) {
        matchClass = "DIVERGENT";
        reasonCode = "CUSTOMER_MATCH_AMBIGUOUS";
        reasonDetail =
          "Mais de um cliente já cadastrado tem o mesmo telefone e nome: escolha qual corresponde.";
        candidateInternalIds = sameName.map((customer) => customer.id);
      } else {
        // Mesmo telefone, nome diferente (ou ausente): situacao normal da
        // importacao — nunca conflito impeditivo nem fusao automatica.
        reasonCode = rawName ? "CUSTOMER_PHONE_SHARED" : reasonCode;
        reasonDetail = rawName
          ? "Telefone já usado por outra pessoa cadastrada; isso é normal e não impede o cadastro."
          : reasonDetail;
      }
    }
  } else if (rawName) {
    const similar = existingCustomers.filter(
      (customer) => customer.name && isSimilarName(customer.name, rawName),
    );
    if (similar.length > 0) {
      matchClass = "SIMILAR";
      reasonCode = "CUSTOMER_MATCH_SIMILAR";
      reasonDetail =
        "Nome parecido com um cliente já cadastrado: confirme se é a mesma pessoa.";
      candidateInternalIds = similar.map((customer) => customer.id);
    }
  }

  const status: ImportItemStatus =
    matchClass === "SIMILAR" || matchClass === "DIVERGENT"
      ? "NEEDS_REVIEW"
      : "PENDING";

  return { label, status, reasonCode, reasonDetail, matchClass, candidateInternalIds };
}

/**
 * Disponibilidade (Goal062 §2): a grade da origem nunca e somada a vigente.
 * Grade que se sobrepoe a si mesma pesa mais que a troca — ela nunca e
 * gravada, com ou sem decisao. Com horario ativo no negocio, o item espera a
 * escolha explicita (`INCLUDE` troca, `EXCLUDE` mantem); sem horario ativo,
 * segue pendente como sempre.
 */
function classifyAvailability(
  record: MinhaAgendaImportRecord,
  proposal: AvailabilityProposal,
  hasActiveAvailability: boolean,
): Classification {
  const label = labelFor("AVAILABILITY", record);
  if (proposal.overlap) {
    return {
      label,
      status: "NEEDS_REVIEW",
      reasonCode: AVAILABILITY_SOURCE_OVERLAP,
      reasonDetail:
        "Os horários da origem se sobrepõem no mesmo dia: eles não serão importados.",
      matchClass: "NONE",
      candidateInternalIds: [],
    };
  }
  if (hasActiveAvailability) {
    return {
      label,
      status: "NEEDS_REVIEW",
      reasonCode: AVAILABILITY_REPLACES_CURRENT,
      reasonDetail:
        "O negócio já tem horários de atendimento: escolha entre usar os horários da origem no lugar dos atuais ou manter os atuais.",
      matchClass: "NONE",
      candidateInternalIds: [],
    };
  }
  return {
    label,
    status: "PENDING",
    reasonCode: null,
    reasonDetail: null,
    matchClass: "NONE",
    candidateInternalIds: [],
  };
}

/**
 * Grade proposta pelo grupo de disponibilidade, derivada como a execucao a
 * deriva (`migrationAvailabilityRules`) e validada pela regra unica de
 * sobreposicao. Registro fora do contrato ou sem a jornada da empresa nao tem
 * grade proposta: a execucao falha o item com o proprio motivo.
 */
function proposeAvailability(
  records: MinhaAgendaImportRecord[],
): AvailabilityProposal {
  let company: WorkSchedule | null = null;
  let employee: WorkSchedule | null = null;
  for (const record of records) {
    const parsed = workScheduleSchema.safeParse(record.raw);
    if (!parsed.success) return { rules: null, overlap: false };
    if (record.externalId === "company") company = parsed.data;
    else employee = parsed.data;
  }
  if (!company) return { rules: null, overlap: false };
  let rules: AvailabilityGridRule[];
  try {
    rules = migrationAvailabilityRules(company, employee);
  } catch {
    return { rules: null, overlap: false };
  }
  if (!isValidAvailabilityGrid(rules)) return { rules: null, overlap: true };
  // Sanitizada: so dia e horario, nada mais da origem.
  return {
    rules: rules.map((rule) => ({
      dayOfWeek: rule.dayOfWeek,
      startTime: rule.startTime,
      endTime: rule.endTime,
    })),
    overlap: false,
  };
}

function safeNormalizePhone(value: string | null): string | null {
  if (!value) return null;
  try {
    return normalizePhone(value);
  } catch {
    return null;
  }
}

function labelFor(
  category: ImportCategory,
  record: MinhaAgendaImportRecord,
): string {
  const raw = record.raw as Record<string, unknown> | null;
  if (category === "SERVICE") {
    return asString(raw?.name) ?? `Serviço ${record.externalId}`;
  }
  if (category === "CUSTOMER") {
    return asString(raw?.name) ?? `Cliente sem nome (origem #${record.externalId})`;
  }
  if (category === "AVAILABILITY") {
    return record.externalId === "company"
      ? "Horário da empresa"
      : `Horário do profissional (${record.externalId})`;
  }
  const date = asString(raw?.date);
  const startTime = asString(raw?.startTime);
  return date && startTime
    ? `${date} ${startTime}`
    : `Registro ${record.externalId}`;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isSimilarName(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb || na === nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  return levenshteinRatio(na, nb) >= 0.8;
}

function levenshteinRatio(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLength;
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = [];
  for (let i = 0; i < rows; i += 1) {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    matrix.push(row);
  }
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

function fingerprintOf(value: unknown): string {
  return hashString(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
