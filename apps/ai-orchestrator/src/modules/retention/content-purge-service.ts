import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";

/**
 * Purga de conteúdo de conversa na IA (Goal023/WU-02, G-29).
 *
 * Quem decide o prazo é o negócio, no BFF; quem decide *o que é conteúdo* é o
 * dono do dado, que é este serviço. A entrada são os dois cutoffs já
 * calculados e um teto de linhas; a saída são as contagens por tabela e se
 * restou trabalho. Nenhuma rota pública chega aqui: só a varredura chama.
 *
 * O que expira: `Message` (com `MessageAttachment`, `transcript` incluído, por
 * cascade) e `AiRun` (com `AiToolCall` por cascade). O que sobrevive sempre:
 * `Conversation`, `ConversationSession`, `Contact`, `Handoff`,
 * `CustomerMemory` e conhecimento — cadastro, memória autorizada e
 * conhecimento não são conteúdo de conversa e não têm prazo aqui.
 */

/**
 * Teto máximo aceito numa passada, para que um chamador distraído não peça a
 * tabela inteira dentro de uma transação.
 */
export const CONTENT_PURGE_MAX_ROWS_LIMIT = 5_000;

export interface ContentPurgeInput {
  tenantId: string;
  /** Linha governada por sessão `COMMERCIAL` anterior a este instante expira. */
  commercialCutoff: Date;
  /** Linha governada por sessão `PERSONAL` anterior a este instante expira. */
  personalCutoff: Date;
  /**
   * Teto de linhas **governadas** (`Message` + `AiRun`) desta passada. Os
   * filhos que caem por cascade não consomem o teto: eles não são decisão, são
   * consequência da linha que já foi contada.
   */
  maxRows: number;
  /** Injetável para o teste fixar a janela da sessão ainda aberta. */
  now?: Date;
}

export interface ContentPurgeResult {
  messages: number;
  messageAttachments: number;
  aiRuns: number;
  aiToolCalls: number;
  /** Conversas cuja marca de expiração avançou nesta passada. */
  conversationsMarked: number;
  /** `true` quando ainda há linha expirada além do teto desta passada. */
  hasMore: boolean;
}

interface GovernedRow {
  id: string;
  conversationId: string;
  occurredAt: Date;
}

/**
 * A categoria que governa uma linha é a da sessão cuja janela
 * `[startedAt, endedAt ?? agora)` contém o instante dela: `COMMERCIAL` usa o
 * cutoff comercial, `PERSONAL` usa o pessoal.
 *
 * **U-01**: `UNCLASSIFIED` não recebe prazo e nunca é purgada, e linha que não
 * cai em nenhuma janela de sessão é tratada do mesmo jeito. Decidir prazo para
 * conteúdo possivelmente pessoal é de uma pessoa, não deste código — por isso o
 * predicado exige que exista sessão governante **e** que *nenhuma* sessão
 * governante recuse a purga, em vez de bastar uma que a permita: onde a janela
 * for ambígua, o conteúdo sobrevive.
 *
 * Esta é a única vez que a regra é escrita; as duas tabelas só trocam a coluna
 * de instante. Os índices `(tenantId, conversationId, createdAt)` e
 * `(tenantId, conversationId, startedAt)` são os que sustentam os dois lados.
 */
function governedRows(
  table: Prisma.Sql,
  occurredAt: Prisma.Sql,
  input: ContentPurgeInput,
  now: Date,
  limit: number,
): Prisma.Sql {
  return Prisma.sql`
    SELECT r."id", r."conversationId", ${occurredAt} AS "occurredAt"
    FROM ${table} r
    WHERE r."tenantId" = ${input.tenantId}
      AND EXISTS (
        SELECT 1 FROM "ConversationSession" s
        WHERE s."tenantId" = r."tenantId"
          AND s."conversationId" = r."conversationId"
          AND s."startedAt" <= ${occurredAt}
          AND COALESCE(s."endedAt", ${now}) > ${occurredAt}
      )
      AND NOT EXISTS (
        SELECT 1 FROM "ConversationSession" s
        WHERE s."tenantId" = r."tenantId"
          AND s."conversationId" = r."conversationId"
          AND s."startedAt" <= ${occurredAt}
          AND COALESCE(s."endedAt", ${now}) > ${occurredAt}
          AND NOT (
            (s."category" = 'COMMERCIAL' AND ${occurredAt} < ${input.commercialCutoff})
            OR (s."category" = 'PERSONAL' AND ${occurredAt} < ${input.personalCutoff})
          )
      )
    ORDER BY ${occurredAt} ASC
    LIMIT ${limit}`;
}

const MESSAGE_ROWS = {
  table: Prisma.sql`"Message"`,
  occurredAt: Prisma.sql`r."createdAt"`,
} as const;

const AI_RUN_ROWS = {
  table: Prisma.sql`"AiRun"`,
  occurredAt: Prisma.sql`r."startedAt"`,
} as const;

export class ContentPurgeService {
  constructor(private readonly prisma: PrismaClient) {}

  async purge(input: ContentPurgeInput): Promise<ContentPurgeResult> {
    const now = input.now ?? new Date();
    const budget = Math.max(
      0,
      Math.min(input.maxRows, CONTENT_PURGE_MAX_ROWS_LIMIT),
    );

    const messages = await this.candidates(MESSAGE_ROWS, input, now, budget);
    // Teto único para as duas tabelas: o que as mensagens consumiram não fica
    // disponível para os `AiRun` da mesma passada.
    const aiRunBudget = budget - messages.rows.length;
    const aiRuns = await this.candidates(AI_RUN_ROWS, input, now, aiRunBudget);

    const messageIds = messages.rows.map((row) => row.id);
    const aiRunIds = aiRuns.rows.map((row) => row.id);

    // Contados antes do delete: depois do cascade eles não existem mais, e
    // "quantas linhas, de qual tabela" é o que o log de purga precisa dizer —
    // nunca o que havia nelas.
    const messageAttachments = messageIds.length
      ? await this.prisma.messageAttachment.count({
          where: { tenantId: input.tenantId, messageId: { in: messageIds } },
        })
      : 0;
    const aiToolCalls = aiRunIds.length
      ? await this.prisma.aiToolCall.count({
          where: { tenantId: input.tenantId, aiRunId: { in: aiRunIds } },
        })
      : 0;

    const marks = highestPurgedByConversation([
      ...messages.rows,
      ...aiRuns.rows,
    ]);

    const conversationsMarked = await this.prisma.$transaction(async (tx) => {
      if (messageIds.length) {
        await tx.message.deleteMany({
          where: { tenantId: input.tenantId, id: { in: messageIds } },
        });
      }
      if (aiRunIds.length) {
        await tx.aiRun.deleteMany({
          where: { tenantId: input.tenantId, id: { in: aiRunIds } },
        });
      }
      return advanceMarks(tx, input.tenantId, marks);
    });

    return {
      messages: messageIds.length,
      messageAttachments,
      aiRuns: aiRunIds.length,
      aiToolCalls,
      conversationsMarked,
      // O teto pode ter sido zerado pelas mensagens antes de olhar os `AiRun`:
      // nesse caso o resto existe mesmo sem candidato lido.
      hasMore: messages.hasMore || aiRuns.hasMore || aiRunBudget <= 0,
    };
  }

  /**
   * Lê uma linha a mais que o teto: é assim que "restou trabalho" vira fato
   * observado em vez de inferência de que o lote veio cheio.
   */
  private async candidates(
    source: { table: Prisma.Sql; occurredAt: Prisma.Sql },
    input: ContentPurgeInput,
    now: Date,
    budget: number,
  ): Promise<{ rows: GovernedRow[]; hasMore: boolean }> {
    if (budget <= 0) return { rows: [], hasMore: false };
    const rows = await this.prisma.$queryRaw<GovernedRow[]>(
      governedRows(source.table, source.occurredAt, input, now, budget + 1),
    );
    return { rows: rows.slice(0, budget), hasMore: rows.length > budget };
  }
}

/**
 * A marca só avança, e avança até o instante da linha mais nova que esta
 * passada apagou naquela conversa — não até o cutoff. O cutoff cobriria também
 * o que sobreviveu por ser `UNCLASSIFIED`, e a marca estaria anunciando perda
 * que não houve.
 *
 * `UPDATE` cru de propósito: `Conversation.updatedAt` é `@updatedAt` e um
 * `updateMany` do Prisma o reescreveria, jogando uma conversa morta para o topo
 * da inbox por causa da purga. Apagar conteúdo antigo não é atividade na
 * conversa.
 */
async function advanceMarks(
  tx: Prisma.TransactionClient,
  tenantId: string,
  marks: Map<string, Date>,
): Promise<number> {
  let marked = 0;
  for (const [conversationId, occurredAt] of marks) {
    marked += await tx.$executeRaw`
      UPDATE "Conversation"
      SET "contentExpiredThrough" = ${occurredAt}
      WHERE "tenantId" = ${tenantId}
        AND "id" = ${conversationId}
        AND ("contentExpiredThrough" IS NULL
             OR "contentExpiredThrough" < ${occurredAt})`;
  }
  return marked;
}

function highestPurgedByConversation(rows: GovernedRow[]): Map<string, Date> {
  const marks = new Map<string, Date>();
  for (const row of rows) {
    const current = marks.get(row.conversationId);
    if (!current || current < row.occurredAt) {
      marks.set(row.conversationId, row.occurredAt);
    }
  }
  return marks;
}
