import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Retenção técnica do inbox durável da IA (Goal023/§6, G-29).
 *
 * `ProcessedEvent` **não é conteúdo de conversa**: é o rastro de execução do
 * transporte — o evento como chegou, em `rawPayload`, mais o `result` do que
 * a IA fez com ele. Por isso o prazo daqui não é escolha da profissional, não
 * aparece na interface e não sai de `RetentionSettings`: ele vem de variável
 * de ambiente, com o default declarado abaixo, e o dono do dado é quem o
 * calcula. O BFF manda o teto de linhas; a janela é desta casa.
 *
 * ## A consequência sobre o dedupe de entrada, escrita junto da constante
 *
 * `(tenantId, provider, eventKey)` é o único que impede o mesmo evento de ser
 * processado duas vezes. Apagar evento concluído muito antigo significa,
 * literalmente, que uma reentrega do mesmo `eventKey` **depois do prazo**
 * voltaria a ser trabalho novo: a linha que diria "isto já foi processado"
 * não existe mais, e a IA responderia de novo a uma mensagem de meio ano
 * atrás.
 *
 * É por isso que o default é folgado, e não econômico: **180 dias**. Nenhum
 * provider de WhatsApp reentrega evento nessa escala — a reentrega real é de
 * minutos a horas, no máximo do reprocessamento de uma fila parada —, então o
 * caso deixa de ser real muito antes do prazo. Encurtar esta variável abaixo
 * da janela de reentrega do transporte reabre o risco, e é a única coisa que
 * ela pode quebrar.
 */
export const DEFAULT_INBOX_RETENTION_DAYS = 180;

/**
 * Só estado **terminal e concluído** expira aqui. `RECEIVED` e `PROCESSING`
 * são trabalho vivo, e `FAILED` é evidência de falha que ainda pode ser
 * retomada — apagar qualquer um dos três seria perder trabalho, não expirar
 * rastro.
 */
export const INBOX_RETENTION_PURGEABLE_STATUSES = [
  "DONE",
  "IGNORED",
  "LEGACY",
] as const;

const DAY_MS = 24 * 60 * 60 * 1_000;

export function inboxRetentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export interface InboxRetentionInput {
  tenantId: string;
  /** Evento concluído recebido antes deste instante expira. */
  receivedBefore: Date;
  maxRows: number;
}

export interface InboxRetentionResult {
  processedEvents: number;
  /** `true` quando ainda há evento expirado além do teto desta passada. */
  hasMore: boolean;
}

/**
 * Apaga em lote, sempre com teto e sempre por id: selecionar primeiro e
 * deletar por id mantém a passada previsível e retomável — parar no meio não
 * corrompe nada e a passada seguinte reencontra o resto.
 */
export async function purgeExpiredInboxEvents(
  prisma: PrismaClient,
  input: InboxRetentionInput,
): Promise<InboxRetentionResult> {
  const budget = Math.max(0, input.maxRows);
  if (budget === 0) return { processedEvents: 0, hasMore: false };

  const candidates = await prisma.processedEvent.findMany({
    where: {
      tenantId: input.tenantId,
      status: { in: [...INBOX_RETENTION_PURGEABLE_STATUSES] },
      receivedAt: { lt: input.receivedBefore },
    },
    select: { id: true },
    orderBy: { receivedAt: "asc" },
    // Uma linha a mais que o teto: "restou trabalho" vira fato observado, não
    // inferência de que o lote veio cheio.
    take: budget + 1,
  });

  const ids = candidates.slice(0, budget).map((row) => row.id);
  if (ids.length === 0) return { processedEvents: 0, hasMore: false };

  const deleted = await prisma.processedEvent.deleteMany({
    where: { tenantId: input.tenantId, id: { in: ids } },
  });

  return {
    processedEvents: deleted.count,
    hasMore: candidates.length > budget,
  };
}
