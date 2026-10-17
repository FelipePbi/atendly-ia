import { describe, expect, it } from "vitest";

import type {
  InternalActivityQuery,
  InternalActivityRecord,
} from "../src/clients/activity-source.js";
import { ACTIVITY_ACTIONS_BY_KIND } from "../src/modules/activity/catalog.js";
import {
  type ActivitySource,
  type ActivitySourceName,
  decodeActivityCursor,
  readActivityPage,
} from "../src/modules/activity/service.js";

/**
 * Intercalação do registro de atividade (D-176): três fontes, uma ordem
 * total, e um cursor que nunca repete nem pula linha — inclusive com o mesmo
 * instante em fontes diferentes.
 */

type Row = InternalActivityRecord;

function row(
  sequence: number,
  occurredAt: string,
  overrides: Partial<Row> = {},
): Row {
  return {
    id: `row-${sequence}`,
    sequence: String(sequence),
    occurredAt,
    actorType: "USER",
    actorId: "user-1",
    area: "AGENDA",
    action: "appointment.created",
    entityType: "appointment",
    entityId: `appointment-${sequence}`,
    entityLabel: `Cliente ${sequence}`,
    changes: [],
    details: null,
    ...overrides,
  };
}

/**
 * Fonte em memória que aplica o mesmo corte das fontes reais
 * (`listActivity`): ordem decrescente por instante e sequência.
 */
function memorySource(
  name: ActivitySourceName,
  rows: Row[],
  calls: InternalActivityQuery[] = [],
): ActivitySource {
  return {
    name,
    areas: ["AGENDA", "CUSTOMERS", "SERVICES", "SETTINGS", "IMPORT", "CONVERSATIONS"],
    read: async (query) => {
      calls.push(query);
      const ordered = [...rows].sort(
        (a, b) =>
          Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
          Number(b.sequence) - Number(a.sequence),
      );
      const filtered = ordered.filter((item) => {
        if (query.action && !query.action.split(",").includes(item.action)) {
          return false;
        }
        if (!query.beforeAt) return true;
        const at = Date.parse(item.occurredAt);
        const cut = Date.parse(query.beforeAt);
        if (query.beforeSequence !== undefined) {
          return (
            at < cut ||
            (at === cut && Number(item.sequence) < Number(query.beforeSequence))
          );
        }
        return query.inclusive ? at <= cut : at < cut;
      });
      return {
        items: filtered.slice(0, query.limit),
        hasMore: filtered.length > query.limit,
      };
    },
  };
}

const T1 = "2026-10-16T12:00:00.000Z";
const T2 = "2026-10-16T12:00:01.000Z";
const T3 = "2026-10-16T12:00:02.000Z";

describe("readActivityPage", () => {
  it("intercala as fontes e percorre tudo sem repetir nem pular, com empates", async () => {
    const sources = [
      memorySource("scheduling", [row(1, T1), row(2, T2), row(3, T2), row(4, T3)]),
      memorySource("ai", [row(10, T2), row(11, T2), row(12, T3)]),
      memorySource("bff", [row(20, T1), row(21, T2)]),
    ];

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await readActivityPage(sources, {}, cursor, 2);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 20);

    expect(seen).toEqual([
      // T3: scheduling > ai pelo nome da fonte, decrescente
      "scheduling:row-4",
      "ai:row-12",
      // T2: scheduling, bff, ai; dentro da fonte, sequência decrescente
      "scheduling:row-3",
      "scheduling:row-2",
      "bff:row-21",
      "ai:row-11",
      "ai:row-10",
      // T1
      "scheduling:row-1",
      "bff:row-20",
    ]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("converte para o contrato público, sem o id do autor", async () => {
    const page = await readActivityPage(
      [
        memorySource("scheduling", [
          row(1, T1, {
            actorType: "AI",
            actorId: null,
            changes: [{ field: "startsAt", before: "2026-10-20T14:00", after: "2026-10-20T15:30" }],
            details: { customerName: "Ana" },
          }),
        ]),
      ],
      {},
      undefined,
      10,
    );
    expect(page).toEqual({
      items: [
        {
          id: "scheduling:row-1",
          occurredAt: T1,
          actor: "AI",
          area: "AGENDA",
          action: "appointment.created",
          entity: { type: "appointment", id: "appointment-1", label: "Cliente 1" },
          changes: [{ field: "startsAt", before: "2026-10-20T14:00", after: "2026-10-20T15:30" }],
          details: { customerName: "Ana" },
        },
      ],
      nextCursor: null,
    });
  });

  it("traduz o tipo de ação em lista de ações e não chama fonte sem a área pedida", async () => {
    const schedulingCalls: InternalActivityQuery[] = [];
    const aiCalls: InternalActivityQuery[] = [];
    const scheduling = memorySource(
      "scheduling",
      [row(1, T1), row(2, T2, { action: "appointment.cancelled" })],
      schedulingCalls,
    );
    const ai = {
      ...memorySource("ai", [], aiCalls),
      areas: ["CONVERSATIONS"] as const,
    };

    const page = await readActivityPage(
      [scheduling, ai],
      { kinds: ["REMOVED"], areas: ["AGENDA"] },
      undefined,
      10,
    );

    expect(page.items.map((item) => item.action)).toEqual([
      "appointment.cancelled",
    ]);
    expect(aiCalls).toHaveLength(0);
    expect(schedulingCalls[0]?.action?.split(",")).toEqual([
      ...ACTIVITY_ACTIONS_BY_KIND.REMOVED,
    ]);
    expect(schedulingCalls[0]?.area).toBe("AGENDA");
  });

  it("recusa cursor adulterado", () => {
    expect(() => decodeActivityCursor("nao-e-cursor")).toThrow(/cursor/u);
    const forged = Buffer.from(
      JSON.stringify({ t: T1, s: "outro-servico", q: "1" }),
    ).toString("base64url");
    expect(() => decodeActivityCursor(forged)).toThrow(/cursor/u);
  });

  it("classifica cada ação em um tipo só", () => {
    const all = Object.values(ACTIVITY_ACTIONS_BY_KIND).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});
