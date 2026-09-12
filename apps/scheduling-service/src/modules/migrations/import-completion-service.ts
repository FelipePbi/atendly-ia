import { z } from "zod";

import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  ImportCategory,
  ImportSessionStatus,
  IntegrationProvider,
} from "../../generated/prisma/enums.js";
import { AppError } from "../../shared/errors/app-error.js";
import { CalendarMutationIdempotency } from "../calendar/idempotency.js";
import { databaseNow } from "../calendar/write-policy.js";

/**
 * Conclusão única e irreversível da importação (Goal010, WU-06).
 *
 * A invariante desta unidade é de **banco**, não de código. Quem recusa a
 * segunda conclusão de um negócio é o índice único parcial
 * `ImportSession_one_completed_per_tenant` (`("tenantId") WHERE "completedAt"
 * IS NOT NULL`), criado na migration `20260910100000_goal010_import_session`:
 * duas conexões que leiam a sessão ao mesmo tempo, não encontrem conclusão
 * nenhuma e sigam para escrever produzem **uma** linha concluída, porque a
 * segunda não entra no índice. A checagem de código que existe aqui é
 * cortesia — ela dá o erro certo antes de gastar uma transação, e é
 * atropelável por definição; o `catch` da violação de unicidade é que
 * responde pelo caso concorrente.
 *
 * A conclusão da mesma sessão duas vezes é decidida no `WHERE` do UPDATE
 * (`completedAt: null`), no padrão do lease de WU-05: quem faz `count = 1`
 * concluiu, quem faz `count = 0` relê e devolve **o mesmo resultado**, em vez
 * de concluir de novo. Sob chave de idempotência, o resultado vem gravado da
 * primeira vez e a sessão não é tocada uma segunda.
 *
 * O direito de importação é do **negócio**, não da sessão: falha técnica
 * antes da conclusão não o consome. `FAILED` e `SUPERSEDED` ficam fora do
 * índice parcial de sessão viva, então uma sessão que caiu pode ser retomada
 * ({@link ImportCompletionService.startSession} devolve a sessão viva) ou
 * substituída (`replace: true`, que a move para `SUPERSEDED` antes de abrir a
 * nova). Só `completedAt` consome o direito, e a partir daí não há caminho de
 * nova importação nem de reprocessar a origem: `startSession` recusa,
 * `ImportPreviewService.analyze` recusa por estado (`COMPLETED` não é
 * analisável) e `ImportExecutionService.execute` recusa por estado
 * (`COMPLETED` não é executável).
 *
 * Não existe aqui — nem em nenhum outro ponto do módulo — sincronização
 * contínua ou troca de fonte. A importação é migração assistida e única: o
 * que existe é analisar, executar, concluir e ler o histórico.
 */

/** Este negócio já concluiu a importação; não existe uma segunda. */
export const IMPORT_ALREADY_COMPLETED = "IMPORT_ALREADY_COMPLETED";
/** Restou item por resolver e o aceite explícito do usuário não veio. */
export const IMPORT_PENDING_ACCEPTANCE_REQUIRED =
  "IMPORT_PENDING_ACCEPTANCE_REQUIRED";
/** A sessão não está em estado de receber a decisão de conclusão. */
export const IMPORT_SESSION_NOT_COMPLETABLE = "IMPORT_SESSION_NOT_COMPLETABLE";

/**
 * Estados de onde a conclusão parte. `EXECUTING` fica de fora de propósito:
 * concluir no meio de um lote vivo decidiria sobre contagens que ainda estão
 * mudando. A passada corrente termina — ou o lease vence e a sessão é
 * retomada — e só então o usuário conclui.
 */
const COMPLETABLE_STATUSES: ImportSessionStatus[] = ["READY", "PARTIAL"];

/**
 * Estados vivos, os mesmos do índice parcial `ImportSession_one_live_per_tenant`.
 * `FAILED` e `SUPERSEDED` não estão aqui: é assim que falhar não consome o
 * direito nem impede abrir a sessão seguinte.
 */
const LIVE_STATUSES: ImportSessionStatus[] = [
  "DRAFT",
  "ANALYZING",
  "READY",
  "EXECUTING",
  "PARTIAL",
];

export interface ImportCompletionContext {
  tenantId: string;
  sessionId: string;
  /** Autor da decisão: vira `completedBy` e o autor do aceite de pendentes. */
  userId: string;
}

export interface ImportCompletionOptions {
  /**
   * Aceite explícito de concluir com itens por resolver, como previsto no
   * vault ("Esta é sua única importação... Deseja concluir mesmo assim?").
   * Sem ele, a conclusão com pendentes é recusada.
   */
  acceptPending?: boolean;
  /**
   * Chave de idempotência da requisição. Sob a mesma chave, a retentativa
   * devolve o resultado gravado da primeira conclusão.
   */
  idempotencyKey?: string;
}

export interface ImportCompletionCounts {
  pending: number;
  imported: number;
  skipped: number;
  failed: number;
  needsReview: number;
}

export interface ImportCompletionCategoryResult extends ImportCompletionCounts {
  category: ImportCategory;
  /** Quantos itens a categoria descobriu na origem, pelo preview vigente. */
  discovered: number;
  /** Categoria que a origem não fornece, com o código da limitação declarada. */
  sourceSupported: boolean;
  limitationCode: string | null;
}

/** Autor, data e contagem de pendentes no momento em que a decisão foi tomada. */
export interface ImportPendingAcceptance {
  acceptedBy: string;
  acceptedAt: Date;
  pendingCount: number;
}

export interface ImportCompletionResult {
  sessionId: string;
  /** Origem: provedor e a conta de origem de onde os dados vieram. */
  provider: IntegrationProvider;
  sourceAccountId: string;
  sourceAccountLabel: string | null;
  status: "COMPLETED";
  completedAt: Date;
  completedBy: string;
  counts: ImportCompletionCounts;
  categories: ImportCompletionCategoryResult[];
  pendingAcceptance: ImportPendingAcceptance | null;
}

/** Histórico permanente da importação concluída (Configurações → Importação). */
export interface ImportHistoryEntry extends ImportCompletionResult {
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface ImportRight {
  /** Falso quando este negócio já concluiu a importação. */
  available: boolean;
  /** Sessão que consumiu o direito, quando houver. */
  sessionId: string | null;
  completedAt: Date | null;
}

export interface StartImportSessionInput {
  tenantId: string;
  userId: string;
  sourceAccountId: string;
  sourceAccountLabel?: string | null;
  provider?: IntegrationProvider;
  /** Conexão que guarda a credencial da origem; o segredo nunca vem aqui. */
  connectionId?: string | null;
  /**
   * Descarta a sessão viva (`SUPERSEDED`) e abre uma nova. Substituir é
   * permitido enquanto não houver conclusão — e só enquanto não houver.
   */
  replace?: boolean;
}

export interface StartImportSessionResult {
  sessionId: string;
  status: ImportSessionStatus;
  /** Falso quando a sessão viva foi retomada em vez de uma nova ser aberta. */
  created: boolean;
  replacedSessionId: string | null;
}

/** Recorte do Prisma que a conclusão usa; casa com o cliente e com a transação. */
type CompletionPrisma = PrismaClient;

/** Forma JSON do resultado, que é o que a chave idempotente guarda e devolve. */
const completionSnapshotSchema = z.object({
  sessionId: z.string(),
  provider: z.string(),
  sourceAccountId: z.string(),
  sourceAccountLabel: z.string().nullable(),
  status: z.literal("COMPLETED"),
  completedAt: z.string(),
  completedBy: z.string(),
  counts: z.object({
    pending: z.number(),
    imported: z.number(),
    skipped: z.number(),
    failed: z.number(),
    needsReview: z.number(),
  }),
  categories: z.array(
    z.object({
      category: z.string(),
      discovered: z.number(),
      pending: z.number(),
      imported: z.number(),
      skipped: z.number(),
      failed: z.number(),
      needsReview: z.number(),
      sourceSupported: z.boolean(),
      limitationCode: z.string().nullable(),
    }),
  ),
  pendingAcceptance: z
    .object({
      acceptedBy: z.string(),
      acceptedAt: z.string(),
      pendingCount: z.number(),
    })
    .nullable(),
});

type ImportCompletionSnapshot = z.infer<typeof completionSnapshotSchema>;

export class ImportCompletionService {
  constructor(private readonly prisma: CompletionPrisma) {}

  /**
   * Conclui a importação do negócio. Com `idempotencyKey`, a retentativa
   * devolve o resultado gravado sem tocar a sessão; sem ela, a própria linha
   * concluída é a resposta idempotente — o `WHERE completedAt IS NULL` do
   * UPDATE garante que a segunda passagem só leia.
   */
  async complete(
    context: ImportCompletionContext,
    options: ImportCompletionOptions = {},
  ): Promise<ImportCompletionResult> {
    if (!options.idempotencyKey) {
      return this.completeOnce(context, options);
    }
    const stored = await new CalendarMutationIdempotency(
      this.prisma,
    ).execute<ImportCompletionSnapshot>({
      tenantId: context.tenantId,
      key: options.idempotencyKey,
      operation: "import.complete",
      request: {
        sessionId: context.sessionId,
        acceptPending: options.acceptPending === true,
      },
      execute: async () =>
        toSnapshot(await this.completeOnce(context, options)),
      parseResponse: (value) => completionSnapshotSchema.parse(value),
    });
    return fromSnapshot(stored);
  }

  /** Histórico permanente da importação concluída; `null` enquanto não houver. */
  async getHistory(tenantId: string): Promise<ImportHistoryEntry | null> {
    const session = await this.prisma.importSession.findFirst({
      where: { tenantId, completedAt: { not: null } },
    });
    if (!session) return null;
    const completion = await this.describe(session);
    return {
      ...completion,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
    };
  }

  /** O direito de importação do negócio: uma só, e só a conclusão o consome. */
  async getImportRight(tenantId: string): Promise<ImportRight> {
    const completed = await this.prisma.importSession.findFirst({
      where: { tenantId, completedAt: { not: null } },
    });
    if (!completed) {
      return { available: true, sessionId: null, completedAt: null };
    }
    return {
      available: false,
      sessionId: completed.id,
      completedAt: completed.completedAt,
    };
  }

  /** Recusa quando o negócio já concluiu a importação. */
  async assertImportAvailable(tenantId: string): Promise<void> {
    const right = await this.getImportRight(tenantId);
    if (right.available) return;
    throw alreadyCompletedError(right);
  }

  /**
   * Abre a sessão de importação do negócio, ou devolve a que está viva.
   *
   * É o único caminho de entrada da importação, e portanto onde o direito é
   * verificado: depois da conclusão, não abre nem substitui. Enquanto não
   * houver conclusão, a sessão viva é **retomada** por padrão — "uma sessão
   * por negócio" é do índice parcial `ImportSession_one_live_per_tenant`, e
   * substituí-la exige movê-la para `SUPERSEDED` antes, o que é o que
   * `replace: true` faz, na mesma transação da abertura da nova.
   */
  async startSession(
    input: StartImportSessionInput,
  ): Promise<StartImportSessionResult> {
    await this.assertImportAvailable(input.tenantId);

    const live = await this.prisma.importSession.findFirst({
      where: { tenantId: input.tenantId, status: { in: LIVE_STATUSES } },
      orderBy: { createdAt: "asc" },
    });
    if (live && !input.replace) {
      return {
        sessionId: live.id,
        status: live.status,
        created: false,
        replacedSessionId: null,
      };
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (live) {
          // Descartar antes de abrir: o índice parcial de sessão viva não
          // admite duas, e é ele que impede dois starts simultâneos.
          const superseded = await transaction.importSession.updateMany({
            where: {
              tenantId: input.tenantId,
              id: live.id,
              status: { in: LIVE_STATUSES },
            },
            data: {
              status: "SUPERSEDED",
              leaseOwner: null,
              leaseAcquiredAt: null,
              leaseExpiresAt: null,
              finishedAt: new Date(),
            },
          });
          if (superseded.count !== 1) {
            throw new AppError(
              IMPORT_SESSION_NOT_COMPLETABLE,
              "The live import session changed state before it could be replaced.",
              409,
              { sessionId: live.id },
            );
          }
        }
        const created = await transaction.importSession.create({
          data: {
            tenantId: input.tenantId,
            provider: input.provider ?? "MINHA_AGENDA",
            sourceAccountId: input.sourceAccountId,
            sourceAccountLabel: input.sourceAccountLabel ?? null,
            connectionId: input.connectionId ?? null,
            status: "DRAFT",
            createdBy: input.userId,
          },
        });
        return {
          sessionId: created.id,
          status: created.status,
          created: true,
          replacedSessionId: live?.id ?? null,
        };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Perdeu a corrida de abertura: outra conexão abriu a sessão viva, ou
      // concluiu a importação, entre a checagem e a escrita.
      const right = await this.getImportRight(input.tenantId);
      if (!right.available) throw alreadyCompletedError(right);
      const current = await this.prisma.importSession.findFirst({
        where: { tenantId: input.tenantId, status: { in: LIVE_STATUSES } },
        orderBy: { createdAt: "asc" },
      });
      if (!current) throw error;
      return {
        sessionId: current.id,
        status: current.status,
        created: false,
        replacedSessionId: null,
      };
    }
  }

  /**
   * A decisão propriamente dita. Fora da idempotência de chave para que a
   * retentativa **sem** chave também devolva o mesmo resultado: a resposta
   * idempotente de última instância é a própria linha concluída.
   */
  private async completeOnce(
    context: ImportCompletionContext,
    options: ImportCompletionOptions,
  ): Promise<ImportCompletionResult> {
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
    // Já concluída: a retentativa lê, não decide de novo.
    if (session.completedAt) return this.describe(session);

    const right = await this.getImportRight(context.tenantId);
    if (!right.available) throw alreadyCompletedError(right);

    if (!COMPLETABLE_STATUSES.includes(session.status)) {
      throw new AppError(
        IMPORT_SESSION_NOT_COMPLETABLE,
        `Import session cannot be completed while in status ${session.status}.`,
        409,
        { status: session.status },
      );
    }

    try {
      const completed = await this.prisma.$transaction(async (transaction) => {
        const items = await transaction.importItem.findMany({
          where: { tenantId: context.tenantId, sessionId: context.sessionId },
        });
        const counts = tally(items);
        // "Restaram itens não importados": o que ainda espera resolução.
        // `SKIPPED` não entra — deixar de fora já foi uma decisão explícita
        // do usuário, registrada em `ImportDecision` no momento em que ele a
        // tomou, e não precisa ser aceita de novo.
        const outstanding = counts.pending + counts.failed + counts.needsReview;
        if (outstanding > 0 && options.acceptPending !== true) {
          throw new AppError(
            IMPORT_PENDING_ACCEPTANCE_REQUIRED,
            "This import still has items that were not imported; completing it requires the explicit acceptance.",
            409,
            { pendingCount: outstanding, counts },
          );
        }

        // O instante da decisão é o do **banco**, o mesmo que carimba a
        // conclusão, o aceite e a decisão registrada: três datas de um só
        // ato não podem vir de relógios diferentes.
        const now = await databaseNow(transaction);
        const acceptance =
          outstanding > 0
            ? {
                pendingAcceptedAt: now,
                pendingAcceptedBy: context.userId,
                pendingAcceptedCount: outstanding,
              }
            : {};
        const claimed = await transaction.importSession.updateMany({
          // `completedAt: null` no WHERE: a segunda conclusão da mesma sessão
          // não encontra linha e não escreve nada.
          where: {
            tenantId: context.tenantId,
            id: context.sessionId,
            completedAt: null,
            status: { in: COMPLETABLE_STATUSES },
          },
          data: {
            ...acceptance,
            status: "COMPLETED",
            completedAt: now,
            completedBy: context.userId,
            finishedAt: session.finishedAt ?? now,
            pendingCount: counts.pending,
            importedCount: counts.imported,
            skippedCount: counts.skipped,
            failedCount: counts.failed,
            needsReviewCount: counts.needsReview,
            // Concluída, a sessão não volta a executar: o lease deixa de
            // existir junto com o direito de reprocessar a origem.
            leaseOwner: null,
            leaseAcquiredAt: null,
            leaseExpiresAt: null,
            errorCode: null,
            errorMessage: null,
          },
        });
        if (claimed.count !== 1) return null;

        if (outstanding > 0) {
          // Trilha append-only da decisão, no mesmo commit da conclusão.
          await transaction.importDecision.create({
            data: {
              tenantId: context.tenantId,
              sessionId: context.sessionId,
              scope: "SESSION",
              decision: "ACCEPT_PENDING_COMPLETION",
              previewVersion: session.previewVersion,
              decidedBy: context.userId,
              decidedAt: now,
            },
          });
        }
        return true;
      });

      if (completed === null) {
        // Outra conexão concluiu esta mesma sessão primeiro: o resultado é o
        // dela, e é o mesmo.
        return this.readCompleted(context);
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // `ImportSession_one_completed_per_tenant`: outra conexão concluiu
      // **outra** sessão deste negócio enquanto esta transação corria. Quem
      // recusou foi o banco, depois de as duas passarem pela checagem.
      const right = await this.getImportRight(context.tenantId);
      throw alreadyCompletedError(right);
    }

    return this.readCompleted(context);
  }

  private async readCompleted(
    context: ImportCompletionContext,
  ): Promise<ImportCompletionResult> {
    const session = await this.prisma.importSession.findUnique({
      where: {
        tenantId_id: { tenantId: context.tenantId, id: context.sessionId },
      },
    });
    if (!session?.completedAt) {
      throw new AppError(
        IMPORT_SESSION_NOT_COMPLETABLE,
        "Import session left a completable state before the decision was written.",
        409,
        { status: session?.status ?? null },
      );
    }
    return this.describe(session);
  }

  /**
   * O resultado, e também o histórico: origem, data, quantidades por
   * categoria, ignorados, falhos e status final. As contagens vêm dos itens,
   * não dos contadores da sessão — o item é a linha que existe, o contador é
   * o resumo dela.
   */
  private async describe(
    session: CompletedSessionRow,
  ): Promise<ImportCompletionResult> {
    const [items, categories] = await Promise.all([
      this.prisma.importItem.findMany({
        where: { tenantId: session.tenantId, sessionId: session.id },
      }),
      this.prisma.importSessionCategory.findMany({
        where: { tenantId: session.tenantId, sessionId: session.id },
      }),
    ]);
    const coverage = new Map(
      categories.map((entry) => [entry.category, entry]),
    );
    const seen = new Set<ImportCategory>([
      ...categories.map((entry) => entry.category),
      ...items.map((item) => item.category),
    ]);
    const perCategory: ImportCompletionCategoryResult[] = [];
    for (const category of CATEGORY_ORDER) {
      if (!seen.has(category)) continue;
      const rows = items.filter((item) => item.category === category);
      const entry = coverage.get(category);
      perCategory.push({
        category,
        discovered: entry?.discoveredCount ?? rows.length,
        sourceSupported: entry?.sourceSupported ?? true,
        limitationCode: entry?.limitationCode ?? null,
        ...tally(rows),
      });
    }

    if (!session.completedAt || !session.completedBy) {
      throw new AppError(
        IMPORT_SESSION_NOT_COMPLETABLE,
        "Import session is not completed.",
        409,
        { status: session.status },
      );
    }
    return {
      sessionId: session.id,
      provider: session.provider,
      sourceAccountId: session.sourceAccountId,
      sourceAccountLabel: session.sourceAccountLabel,
      status: "COMPLETED",
      completedAt: session.completedAt,
      completedBy: session.completedBy,
      counts: tally(items),
      categories: perCategory,
      pendingAcceptance:
        session.pendingAcceptedAt && session.pendingAcceptedBy
          ? {
              acceptedBy: session.pendingAcceptedBy,
              acceptedAt: session.pendingAcceptedAt,
              pendingCount: session.pendingAcceptedCount ?? 0,
            }
          : null,
    };
  }
}

type CompletedSessionRow = Prisma.ImportSessionGetPayload<
  Record<string, never>
>;

/** A mesma ordem do preview e do motor: o histórico lê como a tela mostra. */
const CATEGORY_ORDER: ImportCategory[] = [
  "SERVICE",
  "CUSTOMER",
  "AVAILABILITY",
  "TIME_BLOCK",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
];

function tally(rows: Array<{ status: string }>): ImportCompletionCounts {
  const counts: ImportCompletionCounts = {
    pending: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    needsReview: 0,
  };
  for (const row of rows) {
    if (row.status === "PENDING") counts.pending += 1;
    else if (row.status === "IMPORTED") counts.imported += 1;
    else if (row.status === "SKIPPED") counts.skipped += 1;
    else if (row.status === "FAILED") counts.failed += 1;
    else if (row.status === "NEEDS_REVIEW") counts.needsReview += 1;
  }
  return counts;
}

function alreadyCompletedError(right: ImportRight): AppError {
  return new AppError(
    IMPORT_ALREADY_COMPLETED,
    "This business has already completed its single import; there is no second one.",
    409,
    { sessionId: right.sessionId, completedAt: right.completedAt },
  );
}

/**
 * Violação de unicidade do PostgreSQL (`23505`), como o Prisma a reporta
 * (`P2002`). É por ela que a conclusão única chega até aqui, então ela é
 * reconhecida pelo código do erro e não pela mensagem.
 */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2002" || code === "23505";
}

function toSnapshot(result: ImportCompletionResult): ImportCompletionSnapshot {
  return {
    ...result,
    completedAt: result.completedAt.toISOString(),
    pendingAcceptance: result.pendingAcceptance
      ? {
          ...result.pendingAcceptance,
          acceptedAt: result.pendingAcceptance.acceptedAt.toISOString(),
        }
      : null,
  };
}

function fromSnapshot(
  snapshot: ImportCompletionSnapshot,
): ImportCompletionResult {
  return {
    ...snapshot,
    provider: snapshot.provider as IntegrationProvider,
    categories: snapshot.categories.map((entry) => ({
      ...entry,
      category: entry.category as ImportCategory,
    })),
    completedAt: new Date(snapshot.completedAt),
    pendingAcceptance: snapshot.pendingAcceptance
      ? {
          ...snapshot.pendingAcceptance,
          acceptedAt: new Date(snapshot.pendingAcceptance.acceptedAt),
        }
      : null,
  };
}
