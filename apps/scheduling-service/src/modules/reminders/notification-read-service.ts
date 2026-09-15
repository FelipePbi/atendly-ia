import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  AppointmentNotificationKind,
  AppointmentNotificationReason,
  AppointmentNotificationSlot,
  AppointmentNotificationState,
} from "../../generated/prisma/enums.js";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Leitura das intencoes de envio **de um compromisso** (Goal021, item 8).
 *
 * A configuracao do negocio (`ReminderSettings`) diz com quanta antecedencia
 * o lembrete sairia; ela nao diz nada sobre esta ocorrencia. O que o detalhe
 * do agendamento precisa mostrar — enviado, nao enviado com motivo, ainda
 * agendado — so existe aqui, na linha que a propria mutacao criou.
 *
 * Esta leitura nunca devolve `facts` nem `leaseToken`: o primeiro carrega o
 * telefone do cliente e os fatos ja formatados para a composicao da IA, o
 * segundo e credencial de reivindicacao. A tela nao precisa de nenhum dos
 * dois, e o que nao sai daqui nao vaza pelo BFF.
 */
export interface AppointmentNotificationRecord {
  id: string;
  kind: AppointmentNotificationKind;
  slot: AppointmentNotificationSlot;
  /** Versao do compromisso para a qual a intencao nasceu. */
  appointmentVersion: number;
  state: AppointmentNotificationState;
  /** Vocabulario fechado; presente exatamente nos estados terminais que o exigem. */
  reason: AppointmentNotificationReason | null;
  dueAt: string;
  sentAt: string | null;
  settledAt: string | null;
}

/**
 * Ordem de leitura: `dueAt` e depois `id`. O desempate existe porque duas
 * intencoes podem vencer no mesmo instante — o aviso de alteracao vence na
 * hora da mutacao, e uma antecedencia ja vencida nasce com o mesmo `dueAt`
 * calculado — e "qual veio antes" nao pode depender da ordem fisica das
 * linhas, que o PostgreSQL nao promete.
 */
export async function listAppointmentNotifications(
  prisma: Pick<PrismaClient, "appointmentNotificationIntent">,
  tenantId: string,
  appointmentId: string,
): Promise<AppointmentNotificationRecord[]> {
  const rows = await prisma.appointmentNotificationIntent.findMany({
    where: { tenantId, appointmentId },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    slot: row.slot,
    appointmentVersion: row.appointmentVersion,
    state: row.state,
    reason: row.reason,
    dueAt: row.dueAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
  }));
}

/** Teto padrão e máximo do lote da central de notificações (Goal022, WU-01). */
export const FAILED_NOTIFICATION_INTENTS_DEFAULT_LIMIT = 50;
export const FAILED_NOTIFICATION_INTENTS_MAX_LIMIT = 200;

/**
 * Falha entregável à central: o mesmo recorte de {@link
 * AppointmentNotificationRecord}, mais `appointmentId` porque esta leitura
 * atravessa todos os atendimentos do negócio. Nunca `facts` nem `leaseToken`
 * — o primeiro carrega telefone e conteúdo formatado do cliente, o segundo é
 * credencial de reivindicação; nenhum dos dois é assunto da central.
 */
export interface FailedNotificationIntentRecord {
  id: string;
  appointmentId: string;
  kind: AppointmentNotificationKind;
  slot: AppointmentNotificationSlot;
  appointmentVersion: number;
  reason: AppointmentNotificationReason | null;
  detail: string | null;
  attemptCount: number;
  dueAt: string;
  settledAt: string | null;
}

export interface ListFailedNotificationIntentsInput {
  /** Cursor opaco devolvido por uma página anterior; ausente lê do início. */
  cursor?: string | null;
  /** Aplicado ao teto máximo antes de ir ao banco. */
  limit?: number;
}

export interface ListFailedNotificationIntentsResult {
  items: FailedNotificationIntentRecord[];
  /** Presente somente quando a página veio cheia — pode haver mais. */
  nextCursor: string | null;
}

interface FailedNotificationCursor {
  dueAt: Date;
  id: string;
}

/** Cursor opaco em `(dueAt, id)`: o par que a ordenação usa para desempate. */
function encodeFailedNotificationCursor(row: FailedNotificationCursor): string {
  return Buffer.from(
    JSON.stringify({ dueAt: row.dueAt.toISOString(), id: row.id }),
  ).toString("base64url");
}

function decodeFailedNotificationCursor(
  cursor: string,
): FailedNotificationCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).dueAt !== "string" ||
      typeof (parsed as Record<string, unknown>).id !== "string"
    ) {
      throw new Error("malformed cursor");
    }
    const { dueAt: dueAtRaw, id } = parsed as { dueAt: string; id: string };
    const dueAt = new Date(dueAtRaw);
    if (id.length === 0 || Number.isNaN(dueAt.getTime())) {
      throw new Error("malformed cursor");
    }
    return { dueAt, id };
  } catch {
    throw new AppError(
      "INVALID_CURSOR",
      "The cursor is not a valid page token for this listing.",
      400,
    );
  }
}

/**
 * Falhas de entrega do negócio, para a central de notificações (Goal022,
 * WU-01): só `state = FAILED`, nunca `PENDING`, `CLAIMED`, `SENT`,
 * `DISMISSED` ou `CANCELLED` — a central mostra o que precisa de atenção
 * humana, não o funil inteiro.
 *
 * Cursor **estável** em `(dueAt, id)`, não `offset`: uma falha nova que
 * chega entre duas páginas não desloca o que a central já mostrou. O
 * desempate por `id` existe pelo mesmo motivo de {@link
 * listAppointmentNotifications} — duas intenções podem vencer no mesmo
 * instante.
 */
export async function listFailedNotificationIntents(
  prisma: Pick<PrismaClient, "appointmentNotificationIntent">,
  tenantId: string,
  input: ListFailedNotificationIntentsInput = {},
): Promise<ListFailedNotificationIntentsResult> {
  const limit = Math.min(
    Math.max(1, input.limit ?? FAILED_NOTIFICATION_INTENTS_DEFAULT_LIMIT),
    FAILED_NOTIFICATION_INTENTS_MAX_LIMIT,
  );
  const after = input.cursor
    ? decodeFailedNotificationCursor(input.cursor)
    : null;

  const rows = await prisma.appointmentNotificationIntent.findMany({
    where: {
      tenantId,
      state: "FAILED",
      ...(after
        ? {
            OR: [
              { dueAt: { gt: after.dueAt } },
              { dueAt: after.dueAt, id: { gt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  const items = rows.map((row) => ({
    id: row.id,
    appointmentId: row.appointmentId,
    kind: row.kind,
    slot: row.slot,
    appointmentVersion: row.appointmentVersion,
    reason: row.reason,
    detail: row.detail,
    attemptCount: row.attemptCount,
    dueAt: row.dueAt.toISOString(),
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
  }));

  const last = rows.at(-1);
  const nextCursor =
    rows.length === limit && last
      ? encodeFailedNotificationCursor(last)
      : null;

  return { items, nextCursor };
}
