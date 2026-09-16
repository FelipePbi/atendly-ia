import { randomUUID } from "node:crypto";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import type { InternalRequestContext } from "../../clients/internal-http-client.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { toErrorMessage } from "../../lib/errors.js";
import type { TenantContext } from "../../lib/tenant-context.js";
import {
  disconnectWhatsApp,
  type WhatsAppDisconnectOutcome,
} from "../whatsapp/disconnect.js";

/**
 * A purga efetiva da conta, no vencimento do prazo (Goal025/WU-07).
 *
 * O pedido e o cancelamento moram em `service.ts`; aqui não há decisão de
 * produto nenhuma — só o que acontece quando o relógio passou do vencimento e
 * a exclusão ainda está `SCHEDULED`. O laço está em `worker.ts`, no mesmo
 * formato do `RetentionSweepWorker` (Goal023/WU-05) e pelo mesmo motivo
 * (D-008): o trabalho durável já está no PostgreSQL.
 *
 * QUATRO GARANTIAS QUE VALEM MAIS QUE A VELOCIDADE DA PASSADA:
 *
 * 1. **A ordem entre as lojas não é estilo, é correção.** IA e Scheduling
 *    primeiro, cada um pela sua rota interna, porque nenhum dos dois cascateia
 *    a partir de nada que o BFF apague; o BFF por último, porque `Tenant` e
 *    `User` cascateiam e são a única forma de alcançar o negócio. Apagar o
 *    `User` antes deixaria nas outras duas bases linhas de um negócio que já
 *    não pode ser nomeado — órfãs e, na prática, inalcançáveis.
 * 2. **`PURGED` é a última coisa que acontece.** Enquanto houver loja que não
 *    confirmou — falha, ou teto atingido com resto declarado —, a linha
 *    continua `SCHEDULED` e a passada seguinte a reencontra. Nenhuma passada
 *    marca `PURGED` por ter começado.
 * 3. **Purgar duas vezes não é erro.** As rotas internas são idempotentes por
 *    contrato (WU-05/WU-06), os `deleteMany` locais não encontram linha, e a
 *    conta já `PURGED` nem chega a ser reivindicada.
 * 4. **Nada aqui lança.** {@link runAccountPurge} é a função que o laço chama
 *    e a mesma que as suítes chamam; falha de loja vira log e resumo, nunca
 *    exceção subindo para um timer sem dono.
 *
 * A linha de `AccountDeletion` **sobrevive** à purga: é a prova de que a
 * exclusão aconteceu, não tem chave estrangeira para `Tenant` nem para `User`
 * (WU-01) e não guarda dado pessoal nenhum — só IDs, instantes e o rastro do
 * lease.
 */

/** Identidade do laço nas chamadas internas. Não é pessoa, e não finge ser. */
export const ACCOUNT_PURGE_ACTOR = "bff-account-purge";

/** As três lojas da conta, na ordem em que são purgadas. Vocabulário fechado. */
export type AccountPurgeStore = "ai" | "scheduling" | "bff";

export const ACCOUNT_PURGE_STORE_ORDER: readonly AccountPurgeStore[] = [
  "ai",
  "scheduling",
  "bff",
];

/**
 * O que uma rota interna de purga por negócio devolve (WU-05 e WU-06 têm o
 * mesmo contrato). `deleted` é linhas por tabela — o BFF registra o que voltou
 * e não replica a lista de tabelas de outro serviço, que é do dono dela.
 */
export interface RemoteTenantPurgeResult {
  deleted: Record<string, number>;
  totalDeleted: number;
  hasMore: boolean;
}

export interface LocalAccountPurgeResult {
  /** `0` quando a passada anterior já tinha apagado o negócio. */
  tenantDeleted: number;
  /** Donos apagados por último, depois do `Tenant`. */
  usersDeleted: number;
}

/**
 * As portas da purga, uma por loja mais a da Evolution.
 *
 * Existem separadas para que o teste veja **quais** foram chamadas e em que
 * ordem, e possa derrubar uma sozinha — "o `User` não foi apagado porque o
 * Scheduling não confirmou" só é afirmável se houver como observar a chamada
 * que não aconteceu.
 */
export interface AccountPurgePorts {
  ai(input: {
    tenantId: string;
    maxRows: number;
    requestId: string;
  }): Promise<RemoteTenantPurgeResult>;
  scheduling(input: {
    tenantId: string;
    maxRows: number;
    requestId: string;
  }): Promise<RemoteTenantPurgeResult>;
  /**
   * Confere se ainda há instância na Evolution e a remove.
   *
   * É o caminho de `DELETE /v1/whatsapp`, pelo `disconnectWhatsApp` do WU-02 —
   * nenhum transporte novo é inventado aqui. Roda **antes** do apagamento
   * local de propósito: a credencial selada da instância vive na linha
   * `WhatsAppInstance`, que o `DELETE` do `Tenant` cascatearia embora, e sem
   * ela não sobraria como identificar a instância remota.
   */
  whatsapp(input: {
    tenant: TenantContext;
    requestId: string;
  }): Promise<WhatsAppDisconnectOutcome>;
  bff(input: {
    tenantId: string;
    requestedByUserId: string;
  }): Promise<LocalAccountPurgeResult>;
}

/** Compatível com o logger do Fastify; o default não escreve nada. */
export interface AccountPurgeLogger {
  info(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
}

export const silentAccountPurgeLogger: AccountPurgeLogger = {
  info: () => undefined,
  error: () => undefined,
};

export interface AccountPurgeOptions {
  /** Identidade desta instância no lease. Diagnóstico, nunca controle. */
  owner: string;
  leaseTtlSeconds: number;
  /** Quantas contas esta passada tenta purgar. */
  accountBatchLimit: number;
  /** Teto de linhas por loja remota, por conta, por passada. */
  maxRowsPerStore: number;
  logger?: AccountPurgeLogger;
}

export interface AccountPurgeResult {
  tenantId: string;
  /** `false` quando a conta não estava vencida, não estava `SCHEDULED` ou já tinha dono. */
  claimed: boolean;
  /** `true` só quando **esta** passada marcou `PURGED`. */
  purged: boolean;
  /** Lojas que confirmaram nesta passada, na ordem em que confirmaram. */
  confirmed: AccountPurgeStore[];
  /** Lojas que falharam nesta passada, em ordem fixa. */
  failed: AccountPurgeStore[];
  /** `true` quando alguma loja remota parou no teto e declarou resto. */
  hasMore: boolean;
  rows: Record<AccountPurgeStore, number>;
  /** O que havia na Evolution. `"FAILED"` não bloqueia a purga; ver abaixo. */
  whatsapp: WhatsAppDisconnectOutcome | "FAILED" | "SKIPPED";
  usersDeleted: number;
}

export interface AccountPurgeSummary {
  accountsClaimed: number;
  accountsSkipped: number;
  accountsPurged: number;
  /** Soma de lojas que falharam no lote. */
  failed: number;
  /** `true` quando a próxima passada deve vir imediatamente. */
  hasMore: boolean;
}

export type AccountPurgePrisma = Pick<
  PrismaClient,
  "$queryRaw" | "tenant" | "tenantMember" | "user"
>;

interface AccountLease {
  leaseToken: string;
  requestedByUserId: string;
}

const emptyResult = (tenantId: string): AccountPurgeResult => ({
  tenantId,
  claimed: false,
  purged: false,
  confirmed: [],
  failed: [],
  hasMore: false,
  rows: { ai: 0, scheduling: 0, bff: 0 },
  whatsapp: "SKIPPED",
  usersDeleted: 0,
});

function purgeContext(
  tenantId: string,
  requestId: string,
): InternalRequestContext {
  return { tenantId, userId: ACCOUNT_PURGE_ACTOR, requestId };
}

/**
 * Reivindica a conta numa única instrução atômica.
 *
 * O `WHERE` é a regra inteira: só linha `SCHEDULED`, só vencida **pelo relógio
 * do banco**, e só com o lease anterior ausente ou vencido. Conta cancelada,
 * conta já `PURGED` e conta dentro do prazo não voltam linha nenhuma — e é por
 * isso que purgar duas vezes não chega sequer a tocar em loja alguma.
 *
 * Duas instâncias na mesma linha: uma bloqueia a outra até o commit, e a
 * perdedora reencontra um lease vivo, não satisfaz o `WHERE` e sai sem conta.
 */
async function claimAccount(
  prisma: AccountPurgePrisma,
  tenantId: string,
  options: { owner: string; leaseTtlSeconds: number },
): Promise<AccountLease | null> {
  const leaseToken = randomUUID();
  const rows = await prisma.$queryRaw<
    Array<{ leaseToken: string; requestedByUserId: string }>
  >`
    UPDATE "AccountDeletion" SET
      "leaseOwner"      = ${options.owner},
      "leaseToken"      = ${leaseToken},
      "leaseAcquiredAt" = now(),
      "leaseExpiresAt"  =
        now() + make_interval(secs => ${options.leaseTtlSeconds}::double precision),
      "updatedAt"       = now()
    WHERE "tenantId" = ${tenantId}
      AND "status" = 'SCHEDULED'::"AccountDeletionStatus"
      AND "dueAt" <= now()
      AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= now())
    RETURNING "leaseToken", "requestedByUserId"
  `;
  return rows[0] ?? null;
}

/**
 * Devolve o lease e, só quando todas as lojas confirmaram, marca `PURGED`.
 *
 * **Com fencing**: o `WHERE` exige o mesmo `leaseToken` que reivindicou. Uma
 * instância que perdeu o lease por vencimento e acorda depois não sobrescreve
 * o resultado de quem assumiu — a escrita simplesmente não encontra linha.
 *
 * `purgedAt` e `status` andam juntos, na mesma instrução, porque são a mesma
 * afirmação: uma conta `PURGED` sem instante seria uma prova sem data.
 */
async function releaseAccount(
  prisma: AccountPurgePrisma,
  tenantId: string,
  lease: AccountLease,
  purged: boolean,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ tenantId: string }>>`
    UPDATE "AccountDeletion" SET
      "leaseOwner"      = NULL,
      "leaseToken"      = NULL,
      "leaseAcquiredAt" = NULL,
      "leaseExpiresAt"  = NULL,
      "status"          = CASE
                            WHEN ${purged}
                            THEN 'PURGED'::"AccountDeletionStatus"
                            ELSE "AccountDeletion"."status"
                          END,
      "purgedAt"        = CASE
                            WHEN ${purged} THEN now()
                            ELSE "AccountDeletion"."purgedAt"
                          END,
      "updatedAt"       = now()
    WHERE "tenantId" = ${tenantId}
      AND "leaseToken" = ${lease.leaseToken}
    RETURNING "tenantId"
  `;
  return rows.length === 1;
}

/**
 * Purga a conta de um negócio vencido. Exportada porque é ela que as suítes
 * chamam — o laço não sobe em teste.
 *
 * **Nunca lança.** Cada loja é isolada, e a conta que falhar no meio continua
 * `SCHEDULED`, com a passada seguinte retomando do zero sobre lojas que já não
 * têm o que apagar.
 */
export async function purgeAccount(
  prisma: AccountPurgePrisma,
  ports: AccountPurgePorts,
  tenantId: string,
  options: AccountPurgeOptions,
): Promise<AccountPurgeResult> {
  const logger = options.logger ?? silentAccountPurgeLogger;
  const lease = await claimAccount(prisma, tenantId, options);
  if (!lease) return emptyResult(tenantId);

  const requestId = `account-purge-${randomUUID()}`;
  const result: AccountPurgeResult = {
    ...emptyResult(tenantId),
    claimed: true,
  };

  // 1 e 2. As duas lojas remotas, cada uma pela sua rota interna. Nenhuma
  // depende da outra, mas ambas precisam terminar antes do BFF: elas são
  // alcançáveis só por `tenantId`, e o `tenantId` deixa de existir aqui.
  const remotes: Array<
    [Exclude<AccountPurgeStore, "bff">, () => Promise<RemoteTenantPurgeResult>]
  > = [
    [
      "ai",
      () => ports.ai({ tenantId, maxRows: options.maxRowsPerStore, requestId }),
    ],
    [
      "scheduling",
      () =>
        ports.scheduling({
          tenantId,
          maxRows: options.maxRowsPerStore,
          requestId,
        }),
    ],
  ];

  for (const [store, run] of remotes) {
    try {
      const purged = await run();
      result.rows[store] = purged.totalDeleted;
      if (purged.hasMore) {
        result.hasMore = true;
      } else {
        result.confirmed.push(store);
      }
      logger.info(
        // Linhas por tabela, nunca o que havia nelas: purga que registra o
        // conteúdo purgado não purgou nada.
        { tenantId, store, rows: purged.totalDeleted, tables: purged.deleted },
        "Account purge pass purged rows",
      );
    } catch (error) {
      result.failed.push(store);
      logger.error(
        { tenantId, store, err: toErrorMessage(error) },
        "Account purge store failed and the account stays scheduled",
      );
    }
  }

  // O BFF só entra quando as duas remotas confirmaram **completo**. Loja que
  // falhou ou que parou no teto ainda tem linha do negócio, e apagar o dono
  // agora tornaria o resto inalcançável — é a regra 1 do cabeçalho.
  if (result.failed.length > 0 || result.hasMore) {
    await settle(prisma, tenantId, lease, result, logger);
    return result;
  }

  // 3. A Evolution, pelo caminho que já existe. Tolerada como no início da
  // exclusão (WU-02): instância remota órfã é lixo operacional, mas segurar a
  // purga do banco por causa de um transporte fora do ar seria manter dado
  // pessoal vivo por um motivo que não é dele. Fica no log e no resultado.
  try {
    result.whatsapp = await ports.whatsapp({
      tenant: {
        tenantId,
        userId: lease.requestedByUserId,
        role: "OWNER",
      },
      requestId,
    });
  } catch (error) {
    result.whatsapp = "FAILED";
    logger.error(
      { tenantId, err: toErrorMessage(error) },
      "Evolution instance removal is pending for this purged account",
    );
  }

  // 4. O BFF, com o `User` por último — dentro da porta, porque só ela sabe
  // que a lista de donos precisa ser lida antes de o `Tenant` cascatear os
  // vínculos embora.
  try {
    const local = await ports.bff({
      tenantId,
      requestedByUserId: lease.requestedByUserId,
    });
    result.rows.bff = local.tenantDeleted;
    result.usersDeleted = local.usersDeleted;
    result.confirmed.push("bff");
    result.purged = true;
  } catch (error) {
    result.failed.push("bff");
    logger.error(
      { tenantId, store: "bff", err: toErrorMessage(error) },
      "Account purge store failed and the account stays scheduled",
    );
  }

  await settle(prisma, tenantId, lease, result, logger);
  return result;
}

async function settle(
  prisma: AccountPurgePrisma,
  tenantId: string,
  lease: AccountLease,
  result: AccountPurgeResult,
  logger: AccountPurgeLogger,
): Promise<void> {
  let settled = false;
  try {
    settled = await releaseAccount(prisma, tenantId, lease, result.purged);
  } catch (error) {
    logger.error(
      { tenantId, err: toErrorMessage(error) },
      "Account purge could not settle its lease",
    );
  }
  if (!settled) {
    // Perdeu o lease antes de liquidar: o fencing recusou a escrita. A conta
    // continua como quem assumiu a deixou, e nunca como esta passada acharia.
    result.purged = false;
    logger.error(
      { tenantId },
      "Account purge lost its lease before settling and wrote nothing",
    );
    return;
  }
  logger.info(
    {
      tenantId,
      purged: result.purged,
      confirmed: result.confirmed,
      failed: result.failed,
      hasMore: result.hasMore,
      usersDeleted: result.usersDeleted,
      whatsapp: result.whatsapp,
    },
    result.purged
      ? "Account purged; the deletion row survives as the proof."
      : "Account purge pass ended without purging; it stays scheduled.",
  );
}

/**
 * Fila de contas vencidas: só `SCHEDULED`, só vencidas pelo relógio do banco,
 * só sem lease vivo, mais antiga primeiro. Conta com lease vivo nem entra — o
 * claim a recusaria de qualquer forma, e gastar uma tentativa nela deslocaria
 * uma conta elegível do lote.
 */
async function dueAccounts(
  prisma: AccountPurgePrisma,
  limit: number,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ tenantId: string }>>`
    SELECT "tenantId"
    FROM "AccountDeletion"
    WHERE "status" = 'SCHEDULED'::"AccountDeletionStatus"
      AND "dueAt" <= now()
      AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= now())
    ORDER BY "dueAt" ASC, "tenantId" ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => row.tenantId);
}

/**
 * Uma passada completa da purga. **Nunca lança**: é a função que o laço chama
 * e a mesma que as suítes chamam.
 *
 * `hasMore` pede reagendamento imediato, e só quando a passada **progrediu**:
 * teto atingido com resto declarado, ou lote cheio com pelo menos uma conta
 * purgada. Um lote inteiro de contas falhando não vira laço quente — falha
 * persistente espera o intervalo normal, que é onde ela é barata.
 */
export async function runAccountPurge(
  prisma: AccountPurgePrisma,
  ports: AccountPurgePorts,
  options: AccountPurgeOptions,
): Promise<AccountPurgeSummary> {
  const logger = options.logger ?? silentAccountPurgeLogger;
  const summary: AccountPurgeSummary = {
    accountsClaimed: 0,
    accountsSkipped: 0,
    accountsPurged: 0,
    failed: 0,
    hasMore: false,
  };

  let tenantIds: string[];
  try {
    tenantIds = await dueAccounts(prisma, options.accountBatchLimit);
  } catch (error) {
    logger.error(
      { err: toErrorMessage(error) },
      "Account purge could not list due accounts and skipped this pass",
    );
    return summary;
  }

  let cappedWork = false;
  for (const tenantId of tenantIds) {
    let result: AccountPurgeResult;
    try {
      result = await purgeAccount(prisma, ports, tenantId, options);
    } catch (error) {
      // O caminho de dentro já isola cada loja; o que chega aqui é falha do
      // próprio lease ou do banco do BFF. Uma conta não derruba o lote.
      logger.error(
        { tenantId, err: toErrorMessage(error) },
        "Account purge failed for an account and moved on",
      );
      summary.failed += 1;
      continue;
    }

    if (!result.claimed) {
      summary.accountsSkipped += 1;
      continue;
    }
    summary.accountsClaimed += 1;
    if (result.purged) summary.accountsPurged += 1;
    summary.failed += result.failed.length;
    cappedWork = cappedWork || result.hasMore;
  }

  summary.hasMore =
    cappedWork ||
    (tenantIds.length >= options.accountBatchLimit &&
      summary.accountsPurged > 0);
  return summary;
}

/**
 * O apagamento local, com o `User` por último.
 *
 * A lista de donos é lida **antes** do `DELETE` do `Tenant`: `TenantMember` é
 * o único vínculo entre os dois, e ele cascateia junto com o negócio. Numa
 * passada de retomada o negócio já não existe e a lista volta vazia — por isso
 * `requestedByUserId`, que vive na linha de exclusão e sobrevive a tudo, entra
 * sempre como candidato.
 *
 * Um dono que ainda pertence a outro negócio **não** é apagado: a exclusão é
 * de uma conta, não de uma pessoa que por acaso administra duas.
 */
export async function purgeLocalAccount(
  prisma: AccountPurgePrisma,
  input: { tenantId: string; requestedByUserId: string },
): Promise<LocalAccountPurgeResult> {
  const members = await prisma.tenantMember.findMany({
    where: { tenantId: input.tenantId },
    select: { userId: true },
  });
  const owners = new Set(members.map((member) => member.userId));
  owners.add(input.requestedByUserId);

  // `Tenant` cascateia tudo que é do negócio no banco do BFF. `AccountDeletion`
  // é a exceção declarada em WU-01: sem chave estrangeira, justamente para
  // sobreviver a este `DELETE`.
  const tenant = await prisma.tenant.deleteMany({
    where: { id: input.tenantId },
  });

  let usersDeleted = 0;
  for (const userId of owners) {
    const remaining = await prisma.tenantMember.count({ where: { userId } });
    if (remaining > 0) continue;
    const deleted = await prisma.user.deleteMany({ where: { id: userId } });
    usersDeleted += deleted.count;
  }

  return { tenantDeleted: tenant.count, usersDeleted };
}

/**
 * As portas de produção.
 *
 * Nenhuma delas é caminho novo de transporte: as duas remotas são as rotas
 * internas de purga por negócio do WU-05 e do WU-06, a da Evolution é o
 * `disconnectWhatsApp` que `DELETE /v1/whatsapp` já executa, e a local é o
 * Prisma do próprio BFF.
 */
export function defaultAccountPurgePorts(
  prisma: AccountPurgePrisma,
  clients: {
    ai?: Pick<AiOrchestratorClient, "purgeTenant">;
    scheduling?: Pick<SchedulingClient, "purgeTenant">;
    evolution?: Pick<EvolutionClient, "logoutInstance" | "deleteInstance">;
  } = {},
): AccountPurgePorts {
  const ai = clients.ai ?? new AiOrchestratorClient();
  const scheduling = clients.scheduling ?? new SchedulingClient();
  const evolution = clients.evolution ?? new EvolutionClient();

  return {
    ai: (input) =>
      ai.purgeTenant(purgeContext(input.tenantId, input.requestId), {
        maxRows: input.maxRows,
      }),
    scheduling: (input) =>
      scheduling.purgeTenant(purgeContext(input.tenantId, input.requestId), {
        maxRows: input.maxRows,
      }),
    whatsapp: async (input) =>
      (
        await disconnectWhatsApp(input.tenant, {
          evolution,
          requestId: input.requestId,
        })
      ).outcome,
    bff: (input) => purgeLocalAccount(prisma, input),
  };
}
