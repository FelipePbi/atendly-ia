import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";

/**
 * Registro de atividade do negócio (D-176): o que a profissional ou a IA
 * fizeram, com o antes e o depois de cada campo. Gravado na **mesma
 * transação** da mudança e nunca editado (a trigger do banco recusa UPDATE).
 *
 * Só campos de uma lista permitida entram em `changes` — o diff nunca
 * percorre o objeto inteiro —, e {@link sanitizeActivityJson} ainda descarta
 * qualquer chave com cara de segredo, senha ou token.
 */

export type ActivityActorType = "AI" | "USER";

export interface ActivityActor {
  type: ActivityActorType;
  /** Usuário quando `USER`; nulo para a IA. */
  id: string | null;
}

export const ACTIVITY_AREAS = [
  "AGENDA",
  "CUSTOMERS",
  "SERVICES",
  "SETTINGS",
  "IMPORT",
  "CONVERSATIONS",
] as const;

export type ActivityArea = (typeof ACTIVITY_AREAS)[number];

export type ActivityValue = string | number | boolean | null;

export interface ActivityChange {
  field: string;
  before: ActivityValue;
  after: ActivityValue;
}

export interface ActivityEntryInput {
  actor: ActivityActor;
  area: ActivityArea;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  changes?: ActivityChange[];
  details?: Record<string, unknown> | null;
}

type ActivityWriter = Pick<Prisma.TransactionClient, "activityLog">;

/**
 * As rotas internas desta IA que mudam algo são chamadas pelo BFF em nome
 * da profissional; o que a própria IA faz é gravado com {@link AI_ACTOR}.
 */
export function userActor(userId: string): ActivityActor {
  return { type: "USER", id: userId };
}

export const AI_ACTOR: ActivityActor = { type: "AI", id: null };

export async function recordActivity(
  writer: ActivityWriter,
  tenantId: string,
  entry: ActivityEntryInput,
): Promise<void> {
  await writer.activityLog.create({
    data: {
      tenantId,
      occurredAt: new Date(),
      actorType: entry.actor.type,
      actorId: entry.actor.type === "USER" ? entry.actor.id : null,
      area: entry.area,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      entityLabel: entry.entityLabel ?? null,
      changes: (entry.changes ?? []) as unknown as Prisma.InputJsonValue,
      details: entry.details
        ? (sanitizeActivityJson(entry.details) as Prisma.InputJsonValue)
        : undefined,
    },
  });
}

const SECRET_KEY = /pass|secret|token|credential|api.?key|authorization|cookie/i;

/** Remove recursivamente qualquer chave com cara de segredo. */
export function sanitizeActivityJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeActivityJson);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEY.test(key))
        .map(([key, item]) => [key, sanitizeActivityJson(item)]),
    );
  }
  return normalizeValue(value);
}

function normalizeValue(value: unknown): ActivityValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  // Prisma.Decimal: o texto é o valor exato.
  if (typeof value === "object" && "toFixed" in value) {
    const text = (value as { toString: () => string }).toString();
    const asNumber = Number(text);
    return Number.isFinite(asNumber) ? asNumber : text;
  }
  return JSON.stringify(value) ?? null;
}

/**
 * Antes/depois só dos campos pedidos e só dos que mudaram. Sem `before`
 * (criação) todo campo preenchido entra com antes nulo; sem `after`
 * (exclusão), o contrário.
 */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fields: readonly string[],
): ActivityChange[] {
  const changes: ActivityChange[] = [];
  for (const field of fields) {
    if (SECRET_KEY.test(field)) continue;
    const previous = normalizeValue(before?.[field]);
    const next = normalizeValue(after?.[field]);
    if (previous === next) continue;
    changes.push({ field, before: previous, after: next });
  }
  return changes;
}

// --- Leitura ---------------------------------------------------------------

export const ACTIVITY_PAGE_DEFAULT_LIMIT = 30;
export const ACTIVITY_PAGE_MAX_LIMIT = 100;

export interface ListActivityQuery {
  from?: Date;
  to?: Date;
  actor?: ActivityActorType;
  areas?: ActivityArea[];
  actions?: string[];
  q?: string;
  /**
   * Posição de corte, decidida pelo BFF ao intercalar as fontes: só linhas
   * estritamente depois (mais antigas) do que ela.
   */
  before?: {
    occurredAt: Date;
    /** Com sequência: mesmo instante e sequência menor também passam. */
    sequence?: bigint;
    /** Sem sequência: o mesmo instante passa inteiro (`<=`) ou não (`<`). */
    inclusive?: boolean;
  };
  limit?: number;
}

export interface ActivityRecord {
  id: string;
  sequence: string;
  occurredAt: string;
  actorType: ActivityActorType;
  actorId: string | null;
  area: ActivityArea;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  changes: ActivityChange[];
  details: unknown;
}

export async function listActivity(
  prisma: Pick<PrismaClient, "activityLog">,
  tenantId: string,
  query: ListActivityQuery,
): Promise<{ items: ActivityRecord[]; hasMore: boolean }> {
  const limit = Math.min(
    Math.max(1, query.limit ?? ACTIVITY_PAGE_DEFAULT_LIMIT),
    ACTIVITY_PAGE_MAX_LIMIT,
  );
  const and: Prisma.ActivityLogWhereInput[] = [{ tenantId }];
  if (query.from || query.to) {
    and.push({ occurredAt: { gte: query.from, lt: query.to } });
  }
  if (query.actor) and.push({ actorType: query.actor });
  if (query.areas?.length) and.push({ area: { in: query.areas } });
  if (query.actions?.length) and.push({ action: { in: query.actions } });
  const search = query.q?.trim();
  if (search) {
    and.push({ entityLabel: { contains: search, mode: "insensitive" } });
  }
  const cut = query.before;
  if (cut) {
    if (cut.sequence !== undefined) {
      and.push({
        OR: [
          { occurredAt: { lt: cut.occurredAt } },
          { occurredAt: cut.occurredAt, sequence: { lt: cut.sequence } },
        ],
      });
    } else {
      and.push({
        occurredAt: cut.inclusive
          ? { lte: cut.occurredAt }
          : { lt: cut.occurredAt },
      });
    }
  }
  const rows = await prisma.activityLog.findMany({
    where: { AND: and },
    orderBy: [{ occurredAt: "desc" }, { sequence: "desc" }],
    take: limit + 1,
  });
  return {
    items: rows.slice(0, limit).map((row) => ({
      id: row.id,
      sequence: row.sequence.toString(),
      occurredAt: row.occurredAt.toISOString(),
      actorType: row.actorType as ActivityActorType,
      actorId: row.actorId,
      area: row.area as ActivityArea,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      changes: row.changes as unknown as ActivityChange[],
      details: row.details,
    })),
    hasMore: rows.length > limit,
  };
}

export function parseActivitySequence(value: string): bigint {
  try {
    const sequence = BigInt(value);
    if (sequence < 0n) throw new Error("negative");
    return sequence;
  } catch {
    throw new AppError(
      "The cursor is not a valid page token for this listing.",
      { statusCode: 400, code: "INVALID_CURSOR" },
    );
  }
}
