import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  ExternalEntityType,
  ImportCategory,
  ImportItemStatus,
} from "../../generated/prisma/enums.js";
import { AppError } from "../../shared/errors/app-error.js";
import { normalizePhone } from "../../shared/phone/phone.js";
import type {
  GetImportSnapshotInput,
  MinhaAgendaImportCategorySnapshot,
  MinhaAgendaImportRecord,
  MinhaAgendaImportSnapshot,
} from "../integrations/minha-agenda/provider.js";

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

/** Sessao ainda analisavel: nao comecou execucao nem chegou a um terminal. */
const ANALYZABLE_STATUSES = new Set(["DRAFT", "ANALYZING", "READY", "PARTIAL"]);

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

  async analyze(
    context: { tenantId: string; sessionId: string },
    reader: ImportPreviewSourceReader,
    snapshotInput: GetImportSnapshotInput,
  ): Promise<ImportPreviewResult> {
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
    if (!ANALYZABLE_STATUSES.has(session.status)) {
      throw new AppError(
        "IMPORT_SESSION_NOT_ANALYZABLE",
        `Import session cannot be analyzed while in status ${session.status}.`,
        409,
        { status: session.status },
      );
    }

    const snapshot = await reader.getImportSnapshot(snapshotInput);
    const nextVersion = session.previewVersion + 1;

    const [existingCustomers, existingServices, externalMaps, existingItems] =
      await Promise.all([
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
        });
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
    // READY, pronta para "Importar tudo".
    const nextStatus = session.status === "PARTIAL" ? "PARTIAL" : "READY";

    await this.prisma.$transaction(async (tx) => {
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
      await tx.importSession.update({
        where: {
          tenantId_id: { tenantId: context.tenantId, id: context.sessionId },
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
        },
      });
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
}): Classification {
  const { category, record, entityType, externalMapIndex } = input;

  // Universal, para toda categoria: se este identificador de origem ja foi
  // criado na Atendly por uma importacao anterior (idempotencia de
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
        "Este registro já existe na Atendly, criado por uma importação anterior.",
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
  const raw = record.raw as { name?: unknown; duration?: unknown } | null;
  const name = asString(raw?.name) ?? `Serviço ${record.externalId}`;
  const duration = asPositiveNumber(raw?.duration);

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
    matchClass = "EXACT";
    reasonCode = "SERVICE_MATCH_EXACT";
    reasonDetail =
      "Serviço com nome idêntico a um já cadastrado: pode ser mesclado.";
    candidateInternalIds = [exactMatches[0].id];
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
  }

  return { label: name, status, reasonCode, reasonDetail, matchClass, candidateInternalIds };
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
    const phoneMatches = existingCustomers.filter(
      (customer) => customer.normalizedPhone === normalizedPhone,
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
