import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";

/**
 * Purga do negocio inteiro na IA (Goal025/WU-05).
 *
 * Nao existe tabela raiz de tenant na IA: `tenantId` esta espalhado por
 * varios modelos do schema (ver {@link TENANT_PURGE_TABLES}), entao a purga e
 * enumeracao, nao
 * uma unica exclusao em cascata a partir de uma linha "Tenant". A lista abaixo
 * e o contrato com {@link ../../../tests/internal/tenant-purge.schema.test.ts}: toda
 * tabela com `tenantId` no schema precisa aparecer aqui, na ordem segura de
 * chave estrangeira (quem referencia primeiro, quem e referenciado depois).
 *
 * Nenhum modelo do schema atual carrega dado de tenant so por relacao, sem
 * coluna `tenantId` propria — {@link TENANT_PURGE_CASCADE_ONLY} existe para
 * documentar essa excecao no dia em que ela aparecer, e o teste falha se um
 * modelo sem `tenantId` nao estiver declarado nem aqui nem na lista de
 * tabelas.
 */
export const TENANT_PURGE_TABLES = [
  // Filhos com FK para uma linha que ainda vai ser apagada nesta passada.
  "AiToolCall",
  "MessageAttachment",
  "ActivationTestMilestone",
  "KnowledgeChunk",
  "HumanTakeover",
  // Dependem de ChannelConnection e/ou Conversation.
  "AiRun",
  "ConversationSession",
  "Message",
  "Handoff",
  // Dependem so de ChannelConnection/Contact, ja sem filho pendente.
  "Conversation",
  "ActivationTestRun",
  "KnowledgeDocument",
  "CustomerMemory",
  "Contact",
  "ProcessedEvent",
  // Raizes: nada mais no negocio ainda referencia estas duas.
  "ChannelConnection",
  "AiTenantConfig",
  // Registro de atividade (D-176): sem chave estrangeira, so cresce; sai
  // apenas aqui, com o negocio inteiro.
  "ActivityLog",
  // Convite de retorno (D-202): sem chave estrangeira.
  "ReturnInvitation",
] as const;

export type TenantPurgeTable = (typeof TENANT_PURGE_TABLES)[number];

/**
 * Modelos do schema sem `tenantId` proprio, cobertos so pela cascata de um
 * pai desta lista (ver doc da constante acima). Vazio hoje: nenhum modelo da
 * IA guarda dado de negocio sem a propria coluna `tenantId`.
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
  /** `AiTenantConfig` nao tem coluna `id`: a chave primaria e o proprio tenantId. */
  idColumn: "id" | "tenantId";
}

const TABLE_META: Record<TenantPurgeTable, TableMeta> = {
  AiToolCall: { sql: Prisma.sql`"AiToolCall"`, idColumn: "id" },
  MessageAttachment: { sql: Prisma.sql`"MessageAttachment"`, idColumn: "id" },
  ActivationTestMilestone: {
    sql: Prisma.sql`"ActivationTestMilestone"`,
    idColumn: "id",
  },
  KnowledgeChunk: { sql: Prisma.sql`"KnowledgeChunk"`, idColumn: "id" },
  HumanTakeover: { sql: Prisma.sql`"HumanTakeover"`, idColumn: "id" },
  AiRun: { sql: Prisma.sql`"AiRun"`, idColumn: "id" },
  ConversationSession: {
    sql: Prisma.sql`"ConversationSession"`,
    idColumn: "id",
  },
  Message: { sql: Prisma.sql`"Message"`, idColumn: "id" },
  Handoff: { sql: Prisma.sql`"Handoff"`, idColumn: "id" },
  Conversation: { sql: Prisma.sql`"Conversation"`, idColumn: "id" },
  ActivationTestRun: { sql: Prisma.sql`"ActivationTestRun"`, idColumn: "id" },
  KnowledgeDocument: { sql: Prisma.sql`"KnowledgeDocument"`, idColumn: "id" },
  CustomerMemory: { sql: Prisma.sql`"CustomerMemory"`, idColumn: "id" },
  Contact: { sql: Prisma.sql`"Contact"`, idColumn: "id" },
  ProcessedEvent: { sql: Prisma.sql`"ProcessedEvent"`, idColumn: "id" },
  ChannelConnection: { sql: Prisma.sql`"ChannelConnection"`, idColumn: "id" },
  AiTenantConfig: { sql: Prisma.sql`"AiTenantConfig"`, idColumn: "tenantId" },
  ActivityLog: { sql: Prisma.sql`"ActivityLog"`, idColumn: "id" },
  ReturnInvitation: { sql: Prisma.sql`"ReturnInvitation"`, idColumn: "id" },
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
   * a checagem: o mesmo truque de {@link ../retention/content-purge-service.js}.
   */
  private async deleteBatch(
    table: TenantPurgeTable,
    tenantId: string,
    limit: number,
  ): Promise<{ count: number; hasMore: boolean }> {
    const meta = TABLE_META[table];
    const idColumn = Prisma.raw(`"${meta.idColumn}"`);
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
