import { env } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ImportSessionStatus } from "../../generated/prisma/enums.js";
import { AppError } from "../../shared/errors/app-error.js";
import { databaseNow } from "../calendar/write-policy.js";

/**
 * Lease da execução da importação pelo relógio do **banco** (Goal010, WU-05).
 *
 * Substitui o `schedule()` em memória do protocolo antigo, que só coordenava
 * o processo que estava rodando: um `Set` de ids não impede um segundo start,
 * uma segunda instância nem um reinício de reprocessar o mesmo lote. A
 * coordenação passa a ser a própria linha de `ImportSession`.
 *
 * A reivindicação é **um único UPDATE condicional**: quem faz `count = 1`
 * executa; quem faz `count = 0` desiste sem tocar em nada. A condição é
 * `leaseOwner IS NULL OR leaseExpiresAt <= now() OR leaseOwner = :owner`, e
 * ela vive no `WHERE` — não existe leitura-antes-de-escrever decidindo o
 * direito, então dois starts simultâneos disputam a mesma linha e o perdedor
 * perde de forma limpa.
 *
 * O instante é sempre `now()` do **banco**, lido dentro da mesma transação do
 * UPDATE — nunca `Date.now()` do processo. É a mesma lição do hold do
 * Goal008 (`databaseNow`, em `calendar/write-policy.ts`): `now()` do
 * PostgreSQL é o instante de início da transação e não muda enquanto ela
 * vive, então ler e comparar em seguida, dentro da transação, é equivalente a
 * comparar dentro do `WHERE`. Relógio de instância adiantado ou atrasado não
 * pode decidir de quem é o lote — duas instâncias em fusos diferentes
 * roubariam o lease uma da outra, ou nunca o expirariam.
 *
 * O único uso do relógio do processo neste módulo é decidir **quando vale a
 * pena perguntar a hora ao banco** ({@link ImportLeaseHolder.heartbeat}), o
 * que evita uma ida ao banco por item sem nunca decidir vigência.
 */

/** Erro de reivindicação: outra instância segura o lease e está viva. */
export const IMPORT_SESSION_LEASE_HELD = "IMPORT_SESSION_LEASE_HELD";

/**
 * Estados em que a sessão é reivindicável para executar: preview pronto,
 * execução anterior parcial, ou execução que ficou em `EXECUTING` porque a
 * instância anterior caiu — esta última só quando o lease já venceu.
 */
export const LEASABLE_IMPORT_STATUSES: ImportSessionStatus[] = [
  "READY",
  "PARTIAL",
  "EXECUTING",
];

/** Estados de uma retomada: a sessão ficou pendurada, não está apenas pronta. */
const RESUMABLE_IMPORT_STATUSES: ImportSessionStatus[] = [
  "EXECUTING",
  "PARTIAL",
];

export interface ImportLease {
  tenantId: string;
  sessionId: string;
  owner: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export type ImportLeaseClaim =
  | { acquired: true; lease: ImportLease }
  | {
      acquired: false;
      /** Dono vigente, quando a recusa foi por lease vivo de outra instância. */
      heldBy: string | null;
      heldUntil: Date | null;
      /** Estado da sessão, quando a recusa foi por estado não reivindicável. */
      status: ImportSessionStatus | null;
    };

/** Recorte do Prisma que o lease usa; casa com o cliente e com a transação. */
type LeasePrisma = Pick<PrismaClient, "$transaction" | "importSession">;

export interface AcquireImportLeaseInput {
  tenantId: string;
  sessionId: string;
  owner: string;
  ttlSeconds?: number;
  /** Estados a partir dos quais a sessão pode ser reivindicada. */
  statuses?: ImportSessionStatus[];
  /**
   * Campos gravados **no mesmo UPDATE** da reivindicação — o `status`
   * `EXECUTING` e o `startedAt` da execução, por exemplo. Estão aqui, e não
   * em um segundo UPDATE, porque tomar o lease e declarar-se executando
   * precisam ser o mesmo ato: entre dois UPDATEs caberia uma instância que
   * viu a sessão livre.
   *
   * A forma de função recebe o `now()` **do banco** da própria reivindicação,
   * para que um instante gravado junto com o lease venha do mesmo relógio que
   * o lease — e não do processo.
   */
  onClaim?: Record<string, unknown> | ((now: Date) => Record<string, unknown>);
}

/** Identidade da instância que reivindica. Nunca reusada entre processos. */
export function newImportLeaseOwner(prefix = "scheduling"): string {
  return `${prefix}:${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Reivindica o lease da sessão. Devolve `acquired: false` — nunca lança —
 * quando outra instância viva o segura ou quando a sessão não está em estado
 * reivindicável: recusar é o caminho normal de quem perdeu a disputa, não um
 * erro excepcional.
 */
export async function acquireImportLease(
  prisma: LeasePrisma,
  input: AcquireImportLeaseInput,
): Promise<ImportLeaseClaim> {
  const ttlSeconds = input.ttlSeconds ?? env.IMPORT_LEASE_TTL_SECONDS;
  const statuses = input.statuses ?? LEASABLE_IMPORT_STATUSES;

  return prisma.$transaction(async (transaction) => {
    const now = await databaseNow(transaction);
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1_000);
    const claimed = await transaction.importSession.updateMany({
      where: {
        tenantId: input.tenantId,
        id: input.sessionId,
        status: { in: statuses },
        // Livre, vencido pelo relógio do banco, ou já meu: reentrante para a
        // mesma instância, que assim retoma a própria passada sem precisar
        // esperar o lease vencer.
        OR: [
          { leaseOwner: null },
          { leaseExpiresAt: { lte: now } },
          { leaseOwner: input.owner },
        ],
      },
      data: {
        ...(typeof input.onClaim === "function"
          ? input.onClaim(now)
          : (input.onClaim ?? {})),
        leaseOwner: input.owner,
        leaseAcquiredAt: now,
        leaseExpiresAt: expiresAt,
        leaseHeartbeatAt: now,
      },
    });
    if (claimed.count === 1) {
      return {
        acquired: true,
        lease: {
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          owner: input.owner,
          acquiredAt: now,
          expiresAt,
        },
      };
    }

    // Recusado: relê para dizer **por que**, e não apenas que não deu. Esta
    // leitura é diagnóstico, não decisão — o direito já foi decidido pelo
    // `WHERE` acima.
    const current = await transaction.importSession.findUnique({
      where: {
        tenantId_id: { tenantId: input.tenantId, id: input.sessionId },
      },
    });
    return {
      acquired: false,
      heldBy: current?.leaseOwner ?? null,
      heldUntil: current?.leaseExpiresAt ?? null,
      status: current?.status ?? null,
    };
  });
}

/** Erro pronto para a recusa de reivindicação, com o motivo já classificado. */
export function importLeaseHeldError(
  claim: Extract<ImportLeaseClaim, { acquired: false }>,
): AppError {
  if (claim.heldBy) {
    return new AppError(
      IMPORT_SESSION_LEASE_HELD,
      "Another instance is already running this import.",
      409,
      { heldBy: claim.heldBy, heldUntil: claim.heldUntil, status: claim.status },
    );
  }
  return new AppError(
    "IMPORT_SESSION_NOT_EXECUTABLE",
    "Import session left an executable state before this run started.",
    409,
    { status: claim.status },
  );
}

/**
 * Renova o lease. Exige `leaseExpiresAt > now()` **e** o mesmo dono: um lease
 * já vencido não é renovado nem mesmo pelo dono anterior, porque entre o
 * vencimento e a renovação outra instância pode tê-lo reivindicado
 * legitimamente. Devolver `null` é a perda de lease, e quem perdeu para de
 * escrever em vez de sobrescrever o trabalho de quem assumiu.
 */
export async function renewImportLease(
  prisma: LeasePrisma,
  lease: ImportLease,
  ttlSeconds = env.IMPORT_LEASE_TTL_SECONDS,
): Promise<ImportLease | null> {
  return prisma.$transaction(async (transaction) => {
    const now = await databaseNow(transaction);
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1_000);
    const renewed = await transaction.importSession.updateMany({
      where: {
        tenantId: lease.tenantId,
        id: lease.sessionId,
        leaseOwner: lease.owner,
        leaseExpiresAt: { gt: now },
      },
      data: { leaseExpiresAt: expiresAt, leaseHeartbeatAt: now },
    });
    if (renewed.count !== 1) return null;
    return { ...lease, expiresAt };
  });
}

/**
 * Devolve o lease, e só se ainda for meu. Liberar explicitamente é o que
 * permite a passada seguinte começar na hora, em vez de esperar o TTL vencer;
 * uma instância que morre sem liberar apenas atrasa a retomada até o
 * vencimento, nunca a impede.
 */
export async function releaseImportLease(
  prisma: LeasePrisma,
  lease: ImportLease,
  onRelease: Record<string, unknown> = {},
): Promise<boolean> {
  const released = await prisma.importSession.updateMany({
    where: {
      tenantId: lease.tenantId,
      id: lease.sessionId,
      leaseOwner: lease.owner,
    },
    data: {
      ...onRelease,
      leaseOwner: null,
      leaseAcquiredAt: null,
      leaseExpiresAt: null,
    },
  });
  return released.count === 1;
}

/**
 * Lease vivo nas mãos de quem está executando.
 *
 * `heartbeat()` é chamado no meio do lote; ele só vai ao banco quando já
 * passou um terço do TTL desde a última ida (relógio do processo, usado
 * apenas como economia de round-trip). A **vigência** continua sendo decidida
 * pelo banco, dentro de {@link renewImportLease}. Perdido o lease, o holder
 * fica permanentemente perdido: não há recuperação silenciosa no meio de um
 * lote cujo dono já mudou.
 */
export class ImportLeaseHolder {
  private lost = false;
  private lastBeatAt = Date.now();
  private readonly renewIntervalMs: number;

  constructor(
    private readonly prisma: LeasePrisma,
    private lease: ImportLease,
    private readonly ttlSeconds: number = env.IMPORT_LEASE_TTL_SECONDS,
    renewIntervalMs?: number,
  ) {
    this.renewIntervalMs =
      renewIntervalMs ?? Math.max(0, Math.floor((ttlSeconds * 1_000) / 3));
  }

  get owner(): string {
    return this.lease.owner;
  }

  get expiresAt(): Date {
    return this.lease.expiresAt;
  }

  isLost(): boolean {
    return this.lost;
  }

  /** `false` quando o lease foi perdido — o chamador deve parar a passada. */
  async heartbeat(options: { force?: boolean } = {}): Promise<boolean> {
    if (this.lost) return false;
    if (!options.force && Date.now() - this.lastBeatAt < this.renewIntervalMs) {
      return true;
    }
    const renewed = await renewImportLease(
      this.prisma,
      this.lease,
      this.ttlSeconds,
    );
    this.lastBeatAt = Date.now();
    if (!renewed) {
      this.lost = true;
      return false;
    }
    this.lease = renewed;
    return true;
  }

  /**
   * Libera o lease e, no mesmo UPDATE, grava o fechamento da passada. Se o
   * lease já não for meu, nada é gravado e o retorno é `false`: é assim que a
   * perda de lease deixa de sobrescrever o que o novo dono está escrevendo.
   */
  async release(onRelease: Record<string, unknown> = {}): Promise<boolean> {
    if (this.lost) return false;
    const released = await releaseImportLease(
      this.prisma,
      this.lease,
      onRelease,
    );
    this.lost = true;
    return released;
  }
}

export interface ResumableImportSession {
  sessionId: string;
  status: ImportSessionStatus;
  lease: ImportLease;
}

/**
 * Retomada **por tenant e sob lease** (Goal010, WU-05), no lugar da varredura
 * global de boot do protocolo antigo.
 *
 * O `resumeIncomplete` que existia varria `MigrationJob` de **todos** os
 * negócios, sem lease, e devolvia cada job para `PENDING` reagendando-o em
 * memória: subir uma segunda instância bastava para dois processos
 * reprocessarem o mesmo job, e um job vivo era reiniciado por quem acabara de
 * subir. Aqui a retomada é sempre de um tenant nomeado, e cada sessão só é
 * retomada se o lease puder ser reivindicado — sessão com lease vivo de outra
 * instância é deixada em paz, porque ela **não** está parada.
 */
export async function resumeImportSessions(
  prisma: LeasePrisma,
  input: {
    tenantId: string;
    owner: string;
    ttlSeconds?: number;
    statuses?: ImportSessionStatus[];
  },
): Promise<ResumableImportSession[]> {
  const statuses = input.statuses ?? RESUMABLE_IMPORT_STATUSES;
  const candidates = await prisma.importSession.findMany({
    where: { tenantId: input.tenantId, status: { in: statuses } },
    orderBy: { createdAt: "asc" },
  });

  const resumed: ResumableImportSession[] = [];
  for (const candidate of candidates) {
    const claim = await acquireImportLease(prisma, {
      tenantId: input.tenantId,
      sessionId: candidate.id,
      owner: input.owner,
      ttlSeconds: input.ttlSeconds,
      statuses,
    });
    if (!claim.acquired) continue;
    resumed.push({
      sessionId: candidate.id,
      status: candidate.status,
      lease: claim.lease,
    });
  }
  return resumed;
}
