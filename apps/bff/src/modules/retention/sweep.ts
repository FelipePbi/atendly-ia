import { randomUUID } from "node:crypto";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import type { InternalRequestContext } from "../../clients/internal-http-client.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import { env } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { toErrorMessage } from "../../lib/errors.js";
import { purgeExpiredNotifications } from "../notifications/retention.js";
import type { NotificationPrisma } from "../notifications/store.js";
import { loadRetentionDays } from "./settings.js";

/**
 * Varredura de purga de conteúdo (Goal023/WU-05, G-29).
 *
 * O laço mora no processo do BFF, como o entregador do Goal021 mora no da IA
 * e pelo mesmo motivo (D-008): o estado durável já está no PostgreSQL, então
 * aqui só há reivindicar um negócio, calcular os cutoffs do prazo dele e
 * chamar as portas de purga de cada store. Não existe broker novo, fila
 * externa, cron do sistema operacional nem serviço novo.
 *
 * TRÊS GARANTIAS QUE VALEM MAIS QUE O DESEMPENHO:
 *
 * 1. **Nada vaza para fora.** Nenhuma função daqui lança. Uma store fora do ar
 *    degrada só ela: o nome da fonte fica em `lastError`, as outras seguem na
 *    mesma passada, e o ciclo termina normalmente. Purga é trabalho de fundo —
 *    falhar nela nunca pode virar 500 de rota pública, e nenhuma rota pública
 *    a chama.
 * 2. **Ninguém varre o mesmo negócio duas vezes ao mesmo tempo.** O lease é
 *    pelo relógio do banco, com fencing por `leaseToken` na liquidação.
 * 3. **Toda passada termina.** Cada store tem teto de linhas; o que passou
 *    dele volta como `hasMore` e espera a próxima passada, que reencontra o
 *    negócio no topo da fila porque `lastRunAt` ordena por mais antigo.
 *
 * O log diz **quantas linhas, de qual tabela, de qual negócio**. Nunca o que
 * havia nelas: purga que registra o conteúdo purgado não purgou nada.
 */

/** Identidade do laço nas chamadas internas. Não é pessoa, e não finge ser. */
export const RETENTION_SWEEP_ACTOR = "bff-retention-sweep";

export type RetentionSweepPrisma = NotificationPrisma &
  Pick<PrismaClient, "$queryRaw" | "$executeRaw" | "retentionSettings">;

/** As três fontes de conteúdo com prazo. Vocabulário fechado. */
export type RetentionSourceName = "ai" | "scheduling" | "notifications";

/**
 * Os cutoffs de **conteúdo de conversa**, e só eles. O prazo é do negócio e
 * vem de `RetentionSettings`; conteúdo que não carrega a categoria da sessão
 * que o originou não pertence a este objeto e não deriva prazo dele
 * (Goal023/§6).
 */
export interface RetentionCutoffs {
  /** Conteúdo de conversa classificada como comercial. */
  commercialCutoff: Date;
  /** Conteúdo de conversa classificada como pessoal. */
  personalCutoff: Date;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

const cutoffAt = (now: Date, days: number) =>
  new Date(now.getTime() - days * DAY_MS);

export function retentionCutoffs(
  now: Date,
  days: { commercialRetentionDays: number; personalRetentionDays: number },
): RetentionCutoffs {
  return {
    commercialCutoff: cutoffAt(now, days.commercialRetentionDays),
    personalCutoff: cutoffAt(now, days.personalRetentionDays),
  };
}

/**
 * Cutoff do conteúdo das intenções de lembrete: prazo **técnico**, de
 * `RETENTION_INTENT_CONTENT_DAYS`, nunca do prazo escolhido em Configurações.
 *
 * `facts`/`detail` são rastro de execução do envio e não dizem se a conversa
 * era comercial ou pessoal — deixar a seção Conversas governá-los faria um
 * negócio em 365/365 guardar telefone de lembrete por um ano, e um em 30/30
 * apagar evidência de entrega em um mês, sem que nenhum dos dois tivesse
 * pedido qualquer uma das duas coisas. O motivo do default está declarado
 * junto da variável, em `config/env.ts`.
 */
export function intentContentCutoff(
  now: Date,
  days: number = env.RETENTION_INTENT_CONTENT_DAYS,
): Date {
  return cutoffAt(now, days);
}

/** Linhas apagadas ou esvaziadas numa passada, por tabela. */
export type RetentionRowsByTable = Record<string, number>;

export interface RetentionSourceResult {
  rows: number;
  hasMore: boolean;
  tables: RetentionRowsByTable;
}

/**
 * As portas de purga. Uma por store, cada uma exercitável sozinha — é o que
 * permite ao teste derrubar uma e provar que as outras seguiram.
 */
export interface RetentionPurgePorts {
  ai(input: {
    tenantId: string;
    cutoffs: RetentionCutoffs;
    maxRows: number;
  }): Promise<RetentionSourceResult>;
  /**
   * Sem `cutoffs` de propósito: o conteúdo das intenções expira pelo prazo
   * técnico, derivado de `now`, e não pelo prazo que o negócio escolheu.
   */
  scheduling(input: {
    tenantId: string;
    now: Date;
    maxRows: number;
  }): Promise<RetentionSourceResult>;
  notifications(input: {
    tenantId: string;
    now: Date;
    maxRows: number;
  }): Promise<RetentionSourceResult>;
}

/** Compatível com o logger do Fastify; o default não escreve nada. */
export interface RetentionSweepLogger {
  info(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
}

export const silentSweepLogger: RetentionSweepLogger = {
  info: () => undefined,
  error: () => undefined,
};

function sweepContext(tenantId: string): InternalRequestContext {
  return {
    tenantId,
    userId: RETENTION_SWEEP_ACTOR,
    requestId: `retention-sweep-${randomUUID()}`,
  };
}

/**
 * Portas reais: as duas remotas por HTTP interno, a central pelo próprio
 * banco do BFF. Os cutoffs vão sempre **calculados** daqui e nenhum dono
 * deriva janela por conta própria — mas não são todos o mesmo prazo: a IA
 * recebe os prazos do negócio (Comercial/Pessoal, de Configurações) e o
 * Scheduling recebe o prazo técnico de {@link intentContentCutoff}, pelo
 * motivo declarado lá.
 */
export function defaultRetentionPorts(
  prisma: RetentionSweepPrisma,
): RetentionPurgePorts {
  const aiClient = new AiOrchestratorClient();
  const schedulingClient = new SchedulingClient();

  return {
    async ai(input) {
      const result = await aiClient.purgeConversationContent(
        sweepContext(input.tenantId),
        {
          commercialCutoff: input.cutoffs.commercialCutoff,
          personalCutoff: input.cutoffs.personalCutoff,
          maxRows: input.maxRows,
        },
      );
      const tables: RetentionRowsByTable = {
        Message: result.messages,
        MessageAttachment: result.messageAttachments,
        AiRun: result.aiRuns,
        AiToolCall: result.aiToolCalls,
        Conversation: result.conversationsMarked,
        ProcessedEvent: result.processedEvents,
      };
      return {
        rows: Object.values(tables).reduce((total, count) => total + count, 0),
        hasMore: result.hasMore,
        tables,
      };
    },

    async scheduling(input) {
      const result = await schedulingClient.purgeNotificationIntentContent(
        sweepContext(input.tenantId),
        {
          settledBefore: intentContentCutoff(input.now),
          maxRows: input.maxRows,
        },
      );
      return {
        rows: result.cleared,
        hasMore: result.hasMore,
        tables: { AppointmentNotificationIntent: result.cleared },
      };
    },

    async notifications(input) {
      const result = await purgeExpiredNotifications(prisma, {
        tenantId: input.tenantId,
        maxRows: input.maxRows,
        now: input.now,
      });
      return {
        rows: result.purged,
        hasMore: result.hasMore,
        tables: { TenantNotification: result.purged },
      };
    },
  };
}

export interface RetentionSweepOptions {
  /** Identidade desta instância no lease. Diagnóstico, nunca controle. */
  owner: string;
  leaseTtlSeconds: number;
  /** Quantos negócios esta passada tenta varrer. */
  tenantBatchLimit: number;
  /** Teto de linhas por store, por negócio, por passada. */
  maxRowsPerStore: number;
  /**
   * Piso entre duas passadas **completas** do mesmo negócio, em segundos. O
   * negócio cuja passada anterior parou no teto (`lastHasMore`) não espera:
   * ali ainda há resto declarado, e o piso existe contra repetição inútil, não
   * contra continuação de trabalho.
   */
  minTenantIntervalSeconds: number;
  logger?: RetentionSweepLogger;
  /** Injetável só para o teste fixar a janela. */
  now?: Date;
}

export interface RetentionTenantSweepResult {
  tenantId: string;
  /** `false` quando outra instância já segurava o lease deste negócio. */
  claimed: boolean;
  rows: number;
  /** `true` quando alguma store parou no teto. */
  hasMore: boolean;
  /** Fontes que falharam nesta passada, em ordem fixa. */
  failed: RetentionSourceName[];
}

export interface RetentionSweepSummary {
  tenantsClaimed: number;
  tenantsSkipped: number;
  rows: number;
  hasMore: boolean;
  failed: number;
}

interface LeaseHandle {
  leaseToken: string;
  now: Date;
}

type RetentionRowsBySource = Record<RetentionSourceName, number>;

/**
 * Reivindica o negócio numa única instrução atômica.
 *
 * `INSERT ... ON CONFLICT DO UPDATE ... WHERE` é o claim condicional: a linha
 * nasce já reivindicada quando o negócio nunca foi varrido, e só é tomada de
 * volta quando o lease anterior venceu **pelo relógio do banco**. Duas
 * instâncias correndo na mesma linha: uma bloqueia a outra até o commit, e a
 * perdedora reencontra um lease vivo, não satisfaz o `WHERE` e não recebe
 * linha nenhuma de volta.
 */
async function claimTenant(
  prisma: RetentionSweepPrisma,
  tenantId: string,
  options: { owner: string; leaseTtlSeconds: number },
): Promise<LeaseHandle | null> {
  const leaseToken = randomUUID();
  const rows = await prisma.$queryRaw<Array<{ leaseToken: string; now: Date }>>`
    INSERT INTO "RetentionSweepState" (
      "tenantId", "leaseOwner", "leaseToken",
      "leaseAcquiredAt", "leaseExpiresAt", "createdAt", "updatedAt"
    )
    VALUES (
      ${tenantId}, ${options.owner}, ${leaseToken},
      now(),
      now() + make_interval(secs => ${options.leaseTtlSeconds}::double precision),
      now(), now()
    )
    ON CONFLICT ("tenantId") DO UPDATE SET
      "leaseOwner"      = EXCLUDED."leaseOwner",
      "leaseToken"      = EXCLUDED."leaseToken",
      "leaseAcquiredAt" = EXCLUDED."leaseAcquiredAt",
      "leaseExpiresAt"  = EXCLUDED."leaseExpiresAt",
      "updatedAt"       = now()
    WHERE "RetentionSweepState"."leaseExpiresAt" IS NULL
       OR "RetentionSweepState"."leaseExpiresAt" <= now()
    RETURNING "leaseToken", now() AS "now"
  `;
  const claimed = rows[0];
  if (!claimed) return null;
  return {
    leaseToken: claimed.leaseToken,
    now: claimed.now instanceof Date ? claimed.now : new Date(claimed.now),
  };
}

/**
 * Liquida a passada e devolve o lease, **com fencing**: o `WHERE` exige o
 * mesmo `leaseToken` que reivindicou. Uma instância que perdeu o lease por
 * vencimento e acorda depois não sobrescreve o resultado de quem assumiu — a
 * escrita simplesmente não encontra linha.
 *
 * `lastRunAt` e `lastCompletedAt` não são a mesma coisa e a diferença é o que
 * a interface lê: `lastRunAt` marca toda passada que terminou, inclusive a
 * que degradou com uma fonte fora do ar; `lastCompletedAt` só avança quando
 * **nenhuma** fonte falhou. Dizer "última varredura concluída" com o instante
 * de uma passada que não alcançou a IA seria anunciar expiração que não
 * aconteceu.
 */
async function settleTenant(
  prisma: RetentionSweepPrisma,
  tenantId: string,
  lease: LeaseHandle,
  outcome: {
    rows: RetentionRowsBySource;
    hasMore: boolean;
    lastError: string | null;
  },
): Promise<boolean> {
  const settled = await prisma.$executeRaw`
    UPDATE "RetentionSweepState" SET
      "leaseOwner"           = NULL,
      "leaseToken"           = NULL,
      "leaseAcquiredAt"      = NULL,
      "leaseExpiresAt"       = NULL,
      "lastRunAt"            = now(),
      "lastCompletedAt"      = CASE
                                 WHEN ${outcome.lastError}::text IS NULL THEN now()
                                 ELSE "RetentionSweepState"."lastCompletedAt"
                               END,
      "lastError"            = ${outcome.lastError},
      "lastAiRows"           = ${outcome.rows.ai},
      "lastSchedulingRows"   = ${outcome.rows.scheduling},
      "lastNotificationRows" = ${outcome.rows.notifications},
      "lastHasMore"          = ${outcome.hasMore},
      "updatedAt"            = now()
    WHERE "tenantId" = ${tenantId}
      AND "leaseToken" = ${lease.leaseToken}
  `;
  return settled === 1;
}

/**
 * Uma fonte nunca derruba a passada nem as outras fontes.
 *
 * O que fica em `lastError` é o **nome da fonte**, não a mensagem crua do
 * upstream: a coluna é lida por quem opera e mensagem de terceiro não é
 * contrato. A mensagem normalizada vai para o log, onde já existe redação.
 */
async function runSource(
  source: RetentionSourceName,
  tenantId: string,
  logger: RetentionSweepLogger,
  run: () => Promise<RetentionSourceResult>,
): Promise<{ result: RetentionSourceResult; failed: boolean }> {
  try {
    const result = await run();
    if (result.rows > 0) {
      logger.info(
        {
          tenantId,
          source,
          rows: result.rows,
          // Linhas por tabela. Nenhuma chave descreve o que havia nelas.
          tables: result.tables,
        },
        "Retention sweep purged rows",
      );
    }
    return { result, failed: false };
  } catch (error) {
    logger.error(
      { tenantId, source, err: toErrorMessage(error) },
      "Retention sweep source failed and was isolated",
    );
    return { result: { rows: 0, hasMore: false, tables: {} }, failed: true };
  }
}

/**
 * Varre um negócio: reivindica, calcula os cutoffs do prazo dele, chama as
 * três portas isoladas e liquida. Exportada porque é ela que as suítes
 * chamam — o laço não sobe em teste.
 */
export async function sweepTenant(
  prisma: RetentionSweepPrisma,
  ports: RetentionPurgePorts,
  tenantId: string,
  options: RetentionSweepOptions,
): Promise<RetentionTenantSweepResult> {
  const logger = options.logger ?? silentSweepLogger;
  const lease = await claimTenant(prisma, tenantId, options);
  if (!lease) {
    return { tenantId, claimed: false, rows: 0, hasMore: false, failed: [] };
  }

  const now = options.now ?? lease.now;
  // O prazo vem de `RetentionSettings`, com o default do produto resolvido lá
  // (Comercial 90 / Pessoal 30). Ausência de linha nunca é "sem prazo".
  const days = await loadRetentionDays(prisma, tenantId);
  const cutoffs = retentionCutoffs(now, days);

  const rows: RetentionRowsBySource = {
    ai: 0,
    scheduling: 0,
    notifications: 0,
  };
  const failed: RetentionSourceName[] = [];
  let hasMore = false;

  const sources: Array<
    [RetentionSourceName, () => Promise<RetentionSourceResult>]
  > = [
    [
      "ai",
      () => ports.ai({ tenantId, cutoffs, maxRows: options.maxRowsPerStore }),
    ],
    [
      "scheduling",
      () =>
        ports.scheduling({
          tenantId,
          now,
          maxRows: options.maxRowsPerStore,
        }),
    ],
    [
      "notifications",
      () =>
        ports.notifications({
          tenantId,
          now,
          maxRows: options.maxRowsPerStore,
        }),
    ],
  ];

  for (const [source, run] of sources) {
    const outcome = await runSource(source, tenantId, logger, run);
    rows[source] = outcome.result.rows;
    hasMore = hasMore || outcome.result.hasMore;
    if (outcome.failed) failed.push(source);
  }

  const settled = await settleTenant(prisma, tenantId, lease, {
    rows,
    hasMore,
    lastError: failed.length > 0 ? failed.join(",") : null,
  });
  if (!settled) {
    logger.error(
      { tenantId },
      "Retention sweep lost its lease before settling and wrote nothing",
    );
  }

  return {
    tenantId,
    claimed: true,
    rows: rows.ai + rows.scheduling + rows.notifications,
    hasMore,
    failed,
  };
}

/**
 * Fila de negócios a varrer: livres primeiro, nunca varrido antes de todos,
 * depois o mais antigo. Negócio com lease vivo nem entra na lista — o claim o
 * recusaria de qualquer forma, mas gastar uma tentativa nele deslocaria um
 * negócio elegível do lote.
 *
 * **O piso por negócio é aplicado aqui, e só aqui.** Um negócio cuja última
 * passada completou há menos de `minTenantIntervalSeconds` não volta à fila:
 * a passada é idempotente, então repeti-la não apagaria nada de novo e só
 * gastaria três chamadas internas. O negócio que parou no teto é a exceção
 * declarada — `lastHasMore` diz que sobrou trabalho, e sobra é continuação,
 * não repetição. A comparação é contra `now()` do banco, pelo mesmo motivo do
 * lease: o relógio do processo não é o relógio da linha.
 */
async function dueTenants(
  prisma: RetentionSweepPrisma,
  limit: number,
  minIntervalSeconds: number,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ tenantId: string }>>`
    SELECT t."id" AS "tenantId"
    FROM "Tenant" t
    LEFT JOIN "RetentionSweepState" s ON s."tenantId" = t."id"
    WHERE (s."leaseExpiresAt" IS NULL OR s."leaseExpiresAt" <= now())
      AND (
        s."lastRunAt" IS NULL
        OR s."lastHasMore" = true
        OR s."lastRunAt" <=
             now() - make_interval(secs => ${minIntervalSeconds}::double precision)
      )
    ORDER BY s."lastRunAt" ASC NULLS FIRST, t."id" ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => row.tenantId);
}

/**
 * Uma passada completa da varredura. **Nunca lança**: é a função que o laço
 * chama e a mesma que as suítes chamam, e qualquer falha inesperada aqui
 * termina em log, não em exceção subindo para um timer sem dono.
 */
export async function runRetentionSweep(
  prisma: RetentionSweepPrisma,
  ports: RetentionPurgePorts,
  options: RetentionSweepOptions,
): Promise<RetentionSweepSummary> {
  const logger = options.logger ?? silentSweepLogger;
  const summary: RetentionSweepSummary = {
    tenantsClaimed: 0,
    tenantsSkipped: 0,
    rows: 0,
    hasMore: false,
    failed: 0,
  };

  let tenantIds: string[];
  try {
    tenantIds = await dueTenants(
      prisma,
      options.tenantBatchLimit,
      options.minTenantIntervalSeconds,
    );
  } catch (error) {
    logger.error(
      { err: toErrorMessage(error) },
      "Retention sweep could not list businesses and skipped this pass",
    );
    return summary;
  }

  for (const tenantId of tenantIds) {
    let result: RetentionTenantSweepResult;
    try {
      result = await sweepTenant(prisma, ports, tenantId, options);
    } catch (error) {
      // O caminho de dentro já isola cada fonte; o que chega aqui é falha do
      // próprio lease ou do banco do BFF. Um negócio não derruba o lote.
      logger.error(
        { tenantId, err: toErrorMessage(error) },
        "Retention sweep failed for a business and moved on",
      );
      summary.failed += 1;
      continue;
    }

    if (!result.claimed) {
      summary.tenantsSkipped += 1;
      continue;
    }
    summary.tenantsClaimed += 1;
    summary.rows += result.rows;
    summary.hasMore = summary.hasMore || result.hasMore;
    summary.failed += result.failed.length;
  }

  return summary;
}
