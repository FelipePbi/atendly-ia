import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { AppointmentNotificationState } from "../../generated/prisma/enums.js";

/**
 * Esvaziamento de conteúdo das intenções de envio terminais (Goal023/WU-03,
 * G-29).
 *
 * O que expira é `facts` e `detail`: o telefone e os fatos já formatados que a
 * reivindicação compôs para a IA, e o detalhe sanitizado de uma falha. A
 * linha em si nunca é apagada aqui — ela é a identidade de dedupe da
 * recomputação (Goal021, `AppointmentNotificationIntent_identity_key`) e a
 * fonte da central de notificações (Goal022). Quem decide o prazo é quem
 * chama esta rota; este módulo só sabe aplicar um instante já calculado.
 *
 * `PENDING` e `CLAIMED` nunca são candidatas, nem com lease vencido: só um
 * estado terminal tem `settledAt` gravado
 * (`AppointmentNotificationIntent_lifecycle_check`), e é esse instante — não
 * o vencimento do lease — que decide a idade da intenção.
 */

export const NOTIFICATION_CONTENT_RETENTION_MAX_ROWS_LIMIT = 5_000;

const TERMINAL_STATES: AppointmentNotificationState[] = [
  "SENT",
  "FAILED",
  "DISMISSED",
  "CANCELLED",
];

export interface ClearExpiredNotificationContentInput {
  tenantId: string;
  /** Intenção liquidada antes deste instante perde `facts` e `detail`. */
  settledBefore: Date;
  /** Teto de linhas desta passada, aplicado por cima do teto máximo. */
  maxRows: number;
}

export interface ClearExpiredNotificationContentResult {
  cleared: number;
  /** `true` quando ainda há intenção expirada além do teto desta passada. */
  hasMore: boolean;
}

/**
 * Só entra na candidatura quem ainda tem algo para esvaziar
 * (`facts` ou `detail` não nulo): sem essa condição, uma segunda passada
 * imediata reencontraria as mesmas linhas já esvaziadas e as escreveria de
 * novo sem efeito nenhum, quando o contrato é ela não alterar nada.
 */
export async function clearExpiredNotificationContent(
  prisma: Pick<PrismaClient, "appointmentNotificationIntent">,
  input: ClearExpiredNotificationContentInput,
): Promise<ClearExpiredNotificationContentResult> {
  const limit = Math.max(
    0,
    Math.min(input.maxRows, NOTIFICATION_CONTENT_RETENTION_MAX_ROWS_LIMIT),
  );
  if (limit === 0) return { cleared: 0, hasMore: false };

  // Uma linha a mais que o teto: "restou trabalho" vira fato observado, não
  // inferência de que o lote veio cheio.
  const candidates = await prisma.appointmentNotificationIntent.findMany({
    where: {
      tenantId: input.tenantId,
      state: { in: TERMINAL_STATES },
      settledAt: { lt: input.settledBefore },
      OR: [{ facts: { not: Prisma.DbNull } }, { detail: { not: null } }],
    },
    orderBy: [{ settledAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });

  const targets = candidates.slice(0, limit);
  if (targets.length === 0) return { cleared: 0, hasMore: false };

  const { count } = await prisma.appointmentNotificationIntent.updateMany({
    where: {
      tenantId: input.tenantId,
      id: { in: targets.map((row) => row.id) },
    },
    data: { facts: Prisma.DbNull, detail: null },
  });

  return { cleared: count, hasMore: candidates.length > limit };
}
