import { historyWindowSince } from "./routes.js";
import {
  deleteNotifications,
  findExpiredNotifications,
  type NotificationPrisma,
} from "./store.js";

/**
 * Purga da central de notificações (Goal023/WU-04, G-29).
 *
 * A janela é a mesma que `GET /v1/notifications` e o `unreadCount` de
 * `/v1/notifications/summary` já aplicam — {@link historyWindowSince} — para
 * que lista e contador nunca voltem a divergir depois da purga (a divergência
 * declarada no review022). Nenhuma segunda janela é definida aqui.
 *
 * O que expira: `EVENT` em qualquer estado e `CONDITION` já resolvida, ambos
 * com `occurredAt` fora da janela. `CONDITION` aberta nunca é candidata, por
 * mais antiga que seja — o fato que ela representa ainda está acontecendo.
 * `NotificationPreference` e `NotificationSyncState` não são tocados aqui.
 */

export const NOTIFICATION_RETENTION_MAX_ROWS_LIMIT = 5_000;

export interface PurgeExpiredNotificationsInput {
  tenantId: string;
  /** Teto de linhas desta passada, aplicado por cima do teto máximo. */
  maxRows: number;
  /** Injetável para o teste fixar a janela. */
  now?: Date;
}

export interface PurgeExpiredNotificationsResult {
  purged: number;
  /** `true` quando ainda há linha expirada além do teto desta passada. */
  hasMore: boolean;
}

/**
 * Só entra na candidatura quem está fora da janela: uma segunda passada
 * imediata reencontra a mesma janela já livre de expiradas e não apaga nada.
 */
export async function purgeExpiredNotifications(
  prisma: NotificationPrisma,
  input: PurgeExpiredNotificationsInput,
): Promise<PurgeExpiredNotificationsResult> {
  const limit = Math.max(
    0,
    Math.min(input.maxRows, NOTIFICATION_RETENTION_MAX_ROWS_LIMIT),
  );
  if (limit === 0) return { purged: 0, hasMore: false };

  const since = historyWindowSince(input.now);

  // Uma linha a mais que o teto: "restou trabalho" vira fato observado, não
  // inferência de que o lote veio cheio.
  const candidates = await findExpiredNotifications(
    prisma,
    input.tenantId,
    since,
    limit + 1,
  );
  const targets = candidates.slice(0, limit);
  if (targets.length === 0) return { purged: 0, hasMore: false };

  const purged = await deleteNotifications(
    prisma,
    input.tenantId,
    targets.map((row) => row.id),
  );
  return { purged, hasMore: candidates.length > limit };
}
