import type {
  ActivityArea,
  ActivityEntry,
  ActivityKind,
  ActivityPage,
} from "@avenly-ia/public-api-contract";

import type {
  InternalActivityPage,
  InternalActivityQuery,
  InternalActivityRecord,
} from "../../clients/activity-source.js";
import { AppError } from "../../lib/errors.js";
import { actionsForKinds } from "./catalog.js";

/**
 * Leitura agregada do registro de atividade (D-176).
 *
 * Cada serviço guarda o próprio registro, gravado na mesma transação da
 * mudança; o BFF intercala as três fontes numa ordem total — instante,
 * depois nome da fonte, depois a sequência da fonte, tudo decrescente — e o
 * cursor é a posição do último item entregue nessa ordem. Assim a página
 * seguinte nunca repete nem pula linha, mesmo com instantes iguais entre
 * fontes.
 */

export type ActivitySourceName = "ai" | "bff" | "scheduling";

export interface ActivitySource {
  name: ActivitySourceName;
  /** Áreas que a fonte grava: filtro sem nenhuma delas nem chama a fonte. */
  areas: readonly ActivityArea[];
  read: (query: InternalActivityQuery) => Promise<InternalActivityPage>;
}

export interface ActivityFilters {
  from?: string;
  to?: string;
  actor?: "AI" | "USER";
  areas?: ActivityArea[];
  kinds?: ActivityKind[];
  q?: string;
}

interface ActivityCursor {
  t: string;
  s: ActivitySourceName;
  q: string;
}

const SOURCE_NAMES: readonly ActivitySourceName[] = ["ai", "bff", "scheduling"];

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeActivityCursor(value: string): ActivityCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ActivityCursor>;
    if (
      typeof parsed.t === "string" &&
      !Number.isNaN(Date.parse(parsed.t)) &&
      typeof parsed.s === "string" &&
      SOURCE_NAMES.includes(parsed.s) &&
      typeof parsed.q === "string" &&
      /^\d{1,19}$/u.test(parsed.q)
    ) {
      return { t: parsed.t, s: parsed.s, q: parsed.q };
    }
  } catch {
    // cai na recusa abaixo
  }
  throw new AppError("VALIDATION_ERROR", "Invalid activity cursor.", 400);
}

/**
 * Corte de uma fonte a partir do cursor global: o que vem depois de
 * `(t, s, q)` na ordem decrescente. Para a fonte `s`, mesmo instante com
 * sequência menor; para fontes de nome menor, o mesmo instante inteiro; para
 * as de nome maior, só instantes anteriores.
 */
function cutFor(
  source: ActivitySourceName,
  cursor: ActivityCursor | null,
): Pick<InternalActivityQuery, "beforeAt" | "beforeSequence" | "inclusive"> {
  if (!cursor) return {};
  if (source === cursor.s) {
    return { beforeAt: cursor.t, beforeSequence: cursor.q };
  }
  return { beforeAt: cursor.t, inclusive: source < cursor.s };
}

type Tagged = { source: ActivitySourceName; record: InternalActivityRecord };

function compareDescending(left: Tagged, right: Tagged): number {
  const time =
    Date.parse(right.record.occurredAt) - Date.parse(left.record.occurredAt);
  if (time !== 0) return time;
  if (left.source !== right.source) return left.source < right.source ? 1 : -1;
  const a = BigInt(left.record.sequence);
  const b = BigInt(right.record.sequence);
  return a === b ? 0 : a < b ? 1 : -1;
}

function toEntry({ source, record }: Tagged): ActivityEntry {
  return {
    id: `${source}:${record.id}`,
    occurredAt: record.occurredAt,
    actor: record.actorType,
    area: record.area,
    action: record.action,
    entity: {
      type: record.entityType,
      id: record.entityId,
      label: record.entityLabel,
    },
    changes: record.changes,
    details:
      record.details && typeof record.details === "object"
        ? (record.details as Record<string, unknown>)
        : null,
  };
}

export async function readActivityPage(
  sources: readonly ActivitySource[],
  filters: ActivityFilters,
  cursorValue: string | undefined,
  limit: number,
): Promise<ActivityPage> {
  const cursor = cursorValue ? decodeActivityCursor(cursorValue) : null;
  const actions = filters.kinds?.length
    ? actionsForKinds(filters.kinds)
    : undefined;
  const wanted = filters.areas?.length ? new Set(filters.areas) : null;
  const active = sources.filter(
    (source) => !wanted || source.areas.some((area) => wanted.has(area)),
  );

  const pages = await Promise.all(
    active.map(async (source) => {
      const page = await source.read({
        from: filters.from,
        to: filters.to,
        actor: filters.actor,
        area: filters.areas?.join(","),
        action: actions?.join(","),
        q: filters.q,
        ...cutFor(source.name, cursor),
        limit,
      });
      return { source: source.name, page };
    }),
  );

  const merged = pages
    .flatMap(({ source, page }) =>
      page.items.map((record): Tagged => ({ source, record })),
    )
    .sort(compareDescending);
  const taken = merged.slice(0, limit);
  const hasMore =
    merged.length > limit || pages.some(({ page }) => page.hasMore);
  const last = taken.at(-1);

  return {
    items: taken.map(toEntry),
    nextCursor:
      hasMore && last
        ? encodeActivityCursor({
            t: last.record.occurredAt,
            s: last.source,
            q: last.record.sequence,
          })
        : null,
  };
}
