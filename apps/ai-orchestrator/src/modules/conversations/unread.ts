import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Conversas não lidas (D-195).
 *
 * Uma mensagem do cliente (`INBOUND`) é não lida quando chegou depois da marca
 * de leitura da conversa (`Conversation.ownerReadAt`, gravada quando a
 * profissional abre a conversa no app) e a profissional não respondeu depois
 * dela — resposta pelo app ou pelo próprio WhatsApp (`OUTBOUND`/`OWNER`) prova
 * que ela viu. Resposta da IA não conta: a IA ter atendido não quer dizer que
 * a profissional viu.
 *
 * Tudo em SQL cru: o critério compara colunas de duas linhas (mensagem e
 * conversa), o que o filtro do Prisma não expressa, e a marca de leitura é
 * gravada sem passar pelo `@updatedAt`, que ordena a lista de conversas.
 */

/** Quantas mensagens da prévia do resumo, uma por conversa. */
export const UNREAD_RECENT_LIMIT = 5;

/** Teto da prévia de texto: o aviso mostra uma linha. */
const PREVIEW_MAX_CHARS = 140;

/** Não lidas por conversa; conversa sem nenhuma fica fora do mapa. */
export async function countUnreadMessages(
  prisma: PrismaClient,
  tenantId: string,
  conversationIds: readonly string[],
): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<
    Array<{ conversationId: string; unread: number }>
  >`
    SELECT m."conversationId" AS "conversationId", COUNT(*)::int AS "unread"
    FROM "Message" AS m
    JOIN "Conversation" AS c
      ON c."tenantId" = m."tenantId" AND c."id" = m."conversationId"
    WHERE m."tenantId" = ${tenantId}
      AND m."conversationId" = ANY(${[...conversationIds]}::text[])
      AND m."direction" = 'INBOUND'
      AND (c."ownerReadAt" IS NULL OR m."createdAt" > c."ownerReadAt")
      AND NOT EXISTS (
        SELECT 1 FROM "Message" AS reply
        WHERE reply."tenantId" = m."tenantId"
          AND reply."conversationId" = m."conversationId"
          AND reply."direction" = 'OUTBOUND'
          AND reply."source" = 'OWNER'
          AND reply."createdAt" >= m."createdAt"
      )
    GROUP BY m."conversationId"
  `;
  return new Map(rows.map((row) => [row.conversationId, Number(row.unread)]));
}

export interface UnreadMessagePreview {
  conversationId: string;
  messageId: string;
  customerName: string | null;
  externalContactId: string;
  customerId: string | null;
  kind: string;
  preview: string;
  createdAt: string;
}

export interface UnreadSummary {
  unreadConversations: number;
  recent: UnreadMessagePreview[];
}

interface UnreadSummaryRow {
  conversationId: string;
  messageId: string;
  customerName: string | null;
  externalContactId: string;
  customerId: string | null;
  kind: string;
  body: string;
  createdAt: Date;
  total: number;
}

/**
 * O resumo que a navegação lê: quantas conversas têm mensagem não lida e a
 * última mensagem não lida de cada uma das mais recentes.
 *
 * Fica de fora o que não é atendimento do negócio: contato em `Ignorar IA` e
 * conversa cuja sessão vigente é `Pessoal`. A linha da conversa continua com o
 * próprio `unreadCount` — o filtro vale só para o contador e o aviso.
 */
export async function unreadSummary(
  prisma: PrismaClient,
  tenantId: string,
  limit: number = UNREAD_RECENT_LIMIT,
): Promise<UnreadSummary> {
  const rows = await prisma.$queryRaw<UnreadSummaryRow[]>`
    WITH unread AS (
      SELECT m."id", m."conversationId", m."body", m."kind"::text AS "kind",
             m."createdAt", c."customerName", c."externalContactId",
             contact."customerId"
      FROM "Message" AS m
      JOIN "Conversation" AS c
        ON c."tenantId" = m."tenantId" AND c."id" = m."conversationId"
      LEFT JOIN "Contact" AS contact
        ON contact."tenantId" = c."tenantId" AND contact."id" = c."contactId"
      WHERE m."tenantId" = ${tenantId}
        AND m."direction" = 'INBOUND'
        AND (c."ownerReadAt" IS NULL OR m."createdAt" > c."ownerReadAt")
        AND COALESCE(contact."ignored", false) = false
        AND NOT EXISTS (
          SELECT 1 FROM "ConversationSession" AS s
          WHERE s."tenantId" = c."tenantId"
            AND s."conversationId" = c."id"
            AND s."endedAt" IS NULL
            AND s."category" = 'PERSONAL'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "Message" AS reply
          WHERE reply."tenantId" = m."tenantId"
            AND reply."conversationId" = m."conversationId"
            AND reply."direction" = 'OUTBOUND'
            AND reply."source" = 'OWNER'
            AND reply."createdAt" >= m."createdAt"
        )
    ),
    latest AS (
      SELECT DISTINCT ON ("conversationId") *
      FROM unread
      ORDER BY "conversationId", "createdAt" DESC, "id" DESC
    )
    SELECT latest."conversationId", latest."id" AS "messageId",
           latest."customerName", latest."externalContactId",
           latest."customerId", latest."kind", latest."body",
           latest."createdAt",
           (SELECT COUNT(*)::int FROM latest) AS "total"
    FROM latest
    ORDER BY latest."createdAt" DESC, latest."id" DESC
    LIMIT ${limit}
  `;
  return {
    unreadConversations: Number(rows[0]?.total ?? 0),
    recent: rows.map((row) => ({
      conversationId: row.conversationId,
      messageId: row.messageId,
      customerName: row.customerName,
      externalContactId: row.externalContactId,
      customerId: row.customerId,
      kind: row.kind,
      preview: previewOf(row.body),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/** Primeira linha com texto, sem quebras, no teto do aviso. */
export function previewOf(body: string): string {
  const line =
    body
      .split(/\r?\n/u)
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? "";
  return line.length > PREVIEW_MAX_CHARS
    ? `${line.slice(0, PREVIEW_MAX_CHARS - 1).trimEnd()}…`
    : line;
}

/**
 * Marca a conversa como vista até `readThrough` (o instante da mensagem mais
 * nova que a tela mostrou), nunca além de agora. A marca só avança: abrir de
 * novo uma conversa antiga não "desvê" o que já foi visto. SQL cru para não
 * tocar em `updatedAt` — ler não é atividade e não reordena a lista.
 */
export async function markConversationRead(
  prisma: PrismaClient,
  tenantId: string,
  conversationId: string,
  readThrough?: Date,
  now: Date = new Date(),
): Promise<void> {
  const at = readThrough && readThrough < now ? readThrough : now;
  await prisma.$executeRaw`
    UPDATE "Conversation"
    SET "ownerReadAt" = ${at}
    WHERE "tenantId" = ${tenantId}
      AND "id" = ${conversationId}
      AND ("ownerReadAt" IS NULL OR "ownerReadAt" < ${at})
  `;
}
