import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";

/**
 * Purga do negocio inteiro no Scheduling (Goal025/WU-06).
 *
 * Nao existe tabela raiz de tenant: `tenantId` esta espalhado por ~120
 * ocorrencias em 27 modelos do schema, entao a purga e enumeracao, nao uma
 * unica exclusao em cascata a partir de uma linha "Tenant". A lista abaixo e
 * o contrato com {@link ../../../tests/unit/tenant-purge-schema-coverage.test.ts}:
 * toda tabela com `tenantId` no schema precisa aparecer aqui, na ordem segura
 * de chave estrangeira (quem referencia primeiro, quem e referenciado
 * depois). A mesma ordem ja provada em produção de teste por
 * {@link ../../../tests/integration/support/reset-tenant.ts}, estendida com
 * as tabelas que aquele helper nao precisava tocar.
 *
 * Nenhum modelo do schema atual carrega dado de tenant so por relacao, sem
 * coluna `tenantId` propria — {@link TENANT_PURGE_CASCADE_ONLY} existe para
 * documentar essa excecao no dia em que ela aparecer, e o teste falha se um
 * modelo sem `tenantId` nao estiver declarado nem aqui nem na lista de
 * tabelas.
 */
export const TENANT_PURGE_TABLES = [
  // Filhos de Appointment (RESTRICT): o historico e os itens nunca somem por
  // efeito colateral, entao precisam sair antes do atendimento.
  "AppointmentEvent",
  "AppointmentItem",
  "AppointmentNotificationIntent",
  "Appointment",
  // Serie so referenciada por SET NULL (Appointment.seriesId), pode sair
  // depois de quem a referencia sem violar FK.
  "AppointmentSeries",
  // So referencia Customer por SET NULL.
  "AppointmentHold",
  // Sem relacao com nenhuma outra tabela desta lista.
  "CalendarMutationIdempotency",
  // Filhos de Customer (CASCADE).
  "CustomerNote",
  "CustomerTag",
  "CustomerRelation",
  "Customer",
  // So referenciado por AppointmentItem (RESTRICT), ja apagado acima.
  "Service",
  // Sem relacao com nenhuma outra tabela desta lista.
  "AvailabilityException",
  "AvailabilityRule",
  // Filho de BlockSeries (SET NULL).
  "TimeBlock",
  "BlockSeries",
  // Filhos de ImportSession (CASCADE); ImportDecision tambem referencia
  // ImportItem (CASCADE), entao sai primeiro dos dois.
  "ImportDecision",
  "ImportItem",
  "ImportSessionCategory",
  "ImportSession",
  // So referenciada por ImportSession (RESTRICT), ja apagada acima.
  "IntegrationConnection",
  // Sem relacao com nenhuma outra tabela desta lista.
  "ExternalEntityMap",
  // Filho de MigrationJob (RESTRICT), protocolo legado (Goal010).
  "MigrationConflict",
  "MigrationJob",
  // Filho de ReminderSettings (CASCADE).
  "ReminderRule",
  "ReminderSettings",
  // Sem relacao com nenhuma outra tabela desta lista.
  "CalendarSettings",
] as const;

export type TenantPurgeTable = (typeof TENANT_PURGE_TABLES)[number];

/**
 * Modelos do schema sem `tenantId` proprio, cobertos so pela cascata de um
 * pai desta lista (ver doc da constante acima). Vazio hoje: nenhum modelo do
 * Scheduling guarda dado de negocio sem a propria coluna `tenantId`.
 */
export const TENANT_PURGE_CASCADE_ONLY: Readonly<
  Record<string, TenantPurgeTable>
> = {};

export const TENANT_PURGE_MAX_ROWS_LIMIT = 5_000;

export interface TenantPurgeInput {
  tenantId: string;
  /** Teto de linhas apagadas nesta passada, somado entre todas as tabelas. */
  maxRows: number;
}

export type TenantPurgeCounts = Record<TenantPurgeTable, number>;

export interface TenantPurgeResult {
  /** Linhas apagadas nesta passada, por tabela. */
  deleted: TenantPurgeCounts;
  totalDeleted: number;
  /** `true` quando ainda ha linha do negocio alem do teto desta passada. */
  hasMore: boolean;
}

interface TableMeta {
  sql: Prisma.Sql;
  /**
   * `CalendarSettings` e `ReminderSettings` nao tem coluna `id`: a chave
   * primaria e o proprio tenantId. `ReminderRule` nao tem `id` nem
   * `tenantId` sozinho como chave: a chave primaria composta e
   * `(tenantId, slot)`, entao `slot` e o que identifica a linha dentro do
   * tenant.
   */
  idColumn: "id" | "tenantId" | "slot";
}

const TABLE_META: Record<TenantPurgeTable, TableMeta> = {
  AppointmentEvent: { sql: Prisma.sql`"AppointmentEvent"`, idColumn: "id" },
  AppointmentItem: { sql: Prisma.sql`"AppointmentItem"`, idColumn: "id" },
  AppointmentNotificationIntent: {
    sql: Prisma.sql`"AppointmentNotificationIntent"`,
    idColumn: "id",
  },
  Appointment: { sql: Prisma.sql`"Appointment"`, idColumn: "id" },
  AppointmentSeries: {
    sql: Prisma.sql`"AppointmentSeries"`,
    idColumn: "id",
  },
  AppointmentHold: { sql: Prisma.sql`"AppointmentHold"`, idColumn: "id" },
  CalendarMutationIdempotency: {
    sql: Prisma.sql`"CalendarMutationIdempotency"`,
    idColumn: "id",
  },
  CustomerNote: { sql: Prisma.sql`"CustomerNote"`, idColumn: "id" },
  CustomerTag: { sql: Prisma.sql`"CustomerTag"`, idColumn: "id" },
  CustomerRelation: { sql: Prisma.sql`"CustomerRelation"`, idColumn: "id" },
  Customer: { sql: Prisma.sql`"Customer"`, idColumn: "id" },
  Service: { sql: Prisma.sql`"Service"`, idColumn: "id" },
  AvailabilityException: {
    sql: Prisma.sql`"AvailabilityException"`,
    idColumn: "id",
  },
  AvailabilityRule: { sql: Prisma.sql`"AvailabilityRule"`, idColumn: "id" },
  TimeBlock: { sql: Prisma.sql`"TimeBlock"`, idColumn: "id" },
  BlockSeries: { sql: Prisma.sql`"BlockSeries"`, idColumn: "id" },
  ImportDecision: { sql: Prisma.sql`"ImportDecision"`, idColumn: "id" },
  ImportItem: { sql: Prisma.sql`"ImportItem"`, idColumn: "id" },
  ImportSessionCategory: {
    sql: Prisma.sql`"ImportSessionCategory"`,
    idColumn: "id",
  },
  ImportSession: { sql: Prisma.sql`"ImportSession"`, idColumn: "id" },
  IntegrationConnection: {
    sql: Prisma.sql`"IntegrationConnection"`,
    idColumn: "id",
  },
  ExternalEntityMap: { sql: Prisma.sql`"ExternalEntityMap"`, idColumn: "id" },
  MigrationConflict: { sql: Prisma.sql`"MigrationConflict"`, idColumn: "id" },
  MigrationJob: { sql: Prisma.sql`"MigrationJob"`, idColumn: "id" },
  ReminderRule: { sql: Prisma.sql`"ReminderRule"`, idColumn: "slot" },
  ReminderSettings: {
    sql: Prisma.sql`"ReminderSettings"`,
    idColumn: "tenantId",
  },
  CalendarSettings: {
    sql: Prisma.sql`"CalendarSettings"`,
    idColumn: "tenantId",
  },
};

/**
 * Purga por negocio, sob teto e idempotente.
 *
 * Cada tabela e apagada em lote proprio, na ordem declarada em
 * {@link TENANT_PURGE_TABLES}: nunca ha `DELETE` sem `WHERE "tenantId" = ...`,
 * e a segunda execucao sobre o mesmo negocio nao encontra linha para apagar —
 * e por isso nao e erro, so nao tem efeito.
 */
export class TenantPurgeService {
  constructor(private readonly prisma: PrismaClient) {}

  async purge(input: TenantPurgeInput): Promise<TenantPurgeResult> {
    let remaining = Math.max(
      0,
      Math.min(input.maxRows, TENANT_PURGE_MAX_ROWS_LIMIT),
    );
    const deleted = {} as TenantPurgeCounts;
    let hasMore = false;

    for (const table of TENANT_PURGE_TABLES) {
      if (remaining <= 0) {
        deleted[table] = 0;
        hasMore = hasMore || (await this.hasRows(table, input.tenantId));
        continue;
      }
      const batch = await this.deleteBatch(table, input.tenantId, remaining);
      deleted[table] = batch.count;
      remaining -= batch.count;
      hasMore = hasMore || batch.hasMore;
    }

    const totalDeleted = Object.values(deleted).reduce(
      (sum, count) => sum + count,
      0,
    );
    return { deleted, totalDeleted, hasMore };
  }

  /**
   * Le um a mais que o teto para saber se sobrou linha, sem gastar o teto com
   * a checagem: o mesmo truque de
   * {@link ../reminders/notification-retention-service.js}.
   */
  private async deleteBatch(
    table: TenantPurgeTable,
    tenantId: string,
    limit: number,
  ): Promise<{ count: number; hasMore: boolean }> {
    const meta = TABLE_META[table];
    // `::text`: `ReminderRule.slot` e um enum nativo do Postgres, nao uma
    // coluna de texto como as demais chaves desta tabela — comparar como
    // texto evita depender de inferencia de tipo do driver para o parametro
    // do `IN`, e e um no-op inofensivo para as colunas que ja sao texto.
    const idColumn = Prisma.raw(`"${meta.idColumn}"::text`);
    const rows = await this.prisma.$queryRaw<Array<{ purgeId: string }>>(
      Prisma.sql`
        SELECT ${idColumn} AS "purgeId" FROM ${meta.sql}
        WHERE "tenantId" = ${tenantId}
        LIMIT ${limit + 1}`,
    );
    if (rows.length === 0) return { count: 0, hasMore: false };
    const capped = rows.slice(0, limit).map((row) => row.purgeId);
    const count = await this.prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM ${meta.sql}
        WHERE "tenantId" = ${tenantId} AND ${idColumn} IN (${Prisma.join(capped)})`,
    );
    return { count, hasMore: rows.length > limit };
  }

  private async hasRows(
    table: TenantPurgeTable,
    tenantId: string,
  ): Promise<boolean> {
    const meta = TABLE_META[table];
    const rows = await this.prisma.$queryRaw<Array<{ present: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM ${meta.sql} WHERE "tenantId" = ${tenantId}
        ) AS "present"`,
    );
    return rows[0]?.present ?? false;
  }
}
