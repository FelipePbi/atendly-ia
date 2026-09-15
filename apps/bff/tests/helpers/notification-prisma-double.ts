import type { NotificationPrisma } from "../../src/modules/notifications/store.js";

/**
 * Dublê em memória do recorte que a central escreve.
 *
 * Ele **não** reimplementa regra de produto: guarda linhas e aplica as duas
 * coisas que o PostgreSQL aplicaria — a chave única `(tenantId, dedupeKey)`
 * com `ON CONFLICT DO NOTHING` e os filtros de `findMany`/`updateMany` (é
 * deles que sai a reabertura de condição resolvida). Uma regra que só
 * existisse aqui seria um teste que se prova sozinho; persistência de verdade,
 * concorrência e relógio do banco continuam sendo provados na suíte de
 * integração, contra PostgreSQL.
 */
export interface NotificationRow {
  id: string;
  tenantId: string;
  kind: string;
  level: string;
  shape: string;
  dedupeKey: string;
  subjectId: string | null;
  occurredAt: Date;
  readAt: Date | null;
  resolvedAt: Date | null;
  payload: unknown;
}

interface SyncStateRow {
  tenantId: string;
  seededAt: Date;
  lastReconciledAt: Date | null;
  reminderFailedCursor: string | null;
  aiAppointmentEventCursor: string | null;
}

/**
 * O recorte de `where` que a central usa sobre `TenantNotification`. Nenhum
 * operador a mais: o que nao esta aqui e porque o codigo de producao nao pede.
 */
interface NotificationWhere {
  tenantId: string;
  kind?: string | { in: string[] };
  shape?: string;
  dedupeKey?: string | { in: string[] };
  resolvedAt?: null | { not: null };
  subjectId?: { notIn: string[] };
}

function matches(row: NotificationRow, where: NotificationWhere): boolean {
  if (row.tenantId !== where.tenantId) return false;
  if (where.kind) {
    const kinds = typeof where.kind === "string" ? [where.kind] : where.kind.in;
    if (!kinds.includes(row.kind)) return false;
  }
  if (where.shape && row.shape !== where.shape) return false;
  if (where.dedupeKey) {
    const keys =
      typeof where.dedupeKey === "string"
        ? [where.dedupeKey]
        : where.dedupeKey.in;
    if (!keys.includes(row.dedupeKey)) return false;
  }
  // `null` filtra aberta; `{ not: null }` filtra resolvida.
  if (where.resolvedAt === null && row.resolvedAt !== null) return false;
  if (where.resolvedAt && row.resolvedAt === null) return false;
  if (where.subjectId && row.subjectId !== null) {
    if (where.subjectId.notIn.includes(row.subjectId)) return false;
  }
  return true;
}

export class NotificationPrismaDouble {
  readonly notifications: NotificationRow[] = [];
  readonly syncStates = new Map<string, SyncStateRow>();
  readonly preferences = new Map<string, { aiAppointmentCreated: boolean }>();
  private sequence = 0;

  /** O recorte tipado que o motor recebe. */
  get client(): NotificationPrisma {
    return {
      tenantNotification: {
        createMany: async ({
          data,
        }: {
          data: Omit<NotificationRow, "id" | "readAt" | "resolvedAt">[];
          skipDuplicates?: boolean;
        }) => {
          let count = 0;
          for (const row of data) {
            const clash = this.notifications.some(
              (existing) =>
                existing.tenantId === row.tenantId &&
                existing.dedupeKey === row.dedupeKey,
            );
            // ON CONFLICT DO NOTHING: a linha que já existe não é tocada.
            if (clash) continue;
            this.notifications.push({
              ...row,
              id: `notificacao-${(this.sequence += 1)}`,
              readAt: null,
              resolvedAt: null,
            });
            count += 1;
          }
          return { count };
        },
        findMany: async ({
          where,
        }: {
          where: NotificationWhere;
          select?: Record<string, boolean>;
        }) => this.notifications.filter((row) => matches(row, where)),
        updateMany: async ({
          where,
          data,
        }: {
          where: NotificationWhere;
          data: Partial<
            Pick<
              NotificationRow,
              "resolvedAt" | "readAt" | "occurredAt" | "payload"
            >
          >;
        }) => {
          let count = 0;
          for (const row of this.notifications) {
            if (!matches(row, where)) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      },
      notificationSyncState: {
        upsert: async ({
          where,
          create,
        }: {
          where: { tenantId: string };
          create: { tenantId: string; seededAt: Date };
        }) => {
          const existing = this.syncStates.get(where.tenantId);
          if (existing) return existing;
          const row: SyncStateRow = {
            tenantId: create.tenantId,
            seededAt: create.seededAt,
            lastReconciledAt: null,
            reminderFailedCursor: null,
            aiAppointmentEventCursor: null,
          };
          this.syncStates.set(row.tenantId, row);
          return row;
        },
        update: async ({
          where,
          data,
        }: {
          where: { tenantId: string };
          data: Partial<SyncStateRow>;
        }) => {
          const row = this.syncStates.get(where.tenantId);
          if (!row) throw new Error("sync state not found");
          Object.assign(row, data);
          return row;
        },
      },
      notificationPreference: {
        findUnique: async ({ where }: { where: { tenantId: string } }) =>
          this.preferences.get(where.tenantId) ?? null,
      },
    } as unknown as NotificationPrisma;
  }

  open(tenantId: string, kind: string): NotificationRow[] {
    return this.notifications.filter(
      (row) =>
        row.tenantId === tenantId &&
        row.kind === kind &&
        row.resolvedAt === null,
    );
  }

  of(tenantId: string, kind: string): NotificationRow[] {
    return this.notifications.filter(
      (row) => row.tenantId === tenantId && row.kind === kind,
    );
  }
}
