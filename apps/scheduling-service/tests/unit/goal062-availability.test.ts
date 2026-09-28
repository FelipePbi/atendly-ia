/**
 * Goal062 §2 (WU-03): a disponibilidade da origem é trocada, nunca somada.
 *
 * Unitário, sobre o dublê de banco: a regra única de sobreposição (a mesma da
 * tela de configuração) e a classificação da análise — grade da origem que se
 * sobrepõe ganha código próprio e nunca é gravada; negócio com horário ativo
 * faz os itens nascerem `NEEDS_REVIEW` com o motivo de troca. A prova da
 * execução e da troca contra PostgreSQL real está em
 * `tests/integration/goal062-import-availability.test.ts`.
 *
 * Nenhum teste chama a Minha Agenda real: a origem é sempre um leitor local.
 */
import { describe, expect, it } from "vitest";

import {
  assertNonOverlappingRules,
  isValidAvailabilityGrid,
} from "../../src/modules/availability/availability-grid.js";
import {
  AVAILABILITY_REPLACES_CURRENT,
  AVAILABILITY_SOURCE_OVERLAP,
  ImportPreviewService,
  type ImportPreviewSourceReader,
} from "../../src/modules/migrations/import-preview-service.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-01-01",
};

function category(
  name: string,
  records: Array<{ externalId: string; raw: unknown }> = [],
) {
  return {
    category: name,
    coverage: {
      sourceSupported: true,
      sourceReportedCount: null,
      readCount: records.length,
      limitationCode: null,
      limitationDetail: null,
    },
    records,
  };
}

/** Segunda-feira com os intervalos dados; os demais dias fechados. */
function mondaySchedule(intervals: Array<[string, string]>) {
  const schedule: Record<string, unknown> = {
    sunEnabled: false,
    monEnabled: true,
    tueEnabled: false,
    wedEnabled: false,
    thuEnabled: false,
    friEnabled: false,
    satEnabled: false,
  };
  intervals.forEach(([start, end], index) => {
    schedule[`monStartTime${index + 1}`] = start;
    schedule[`monEndTime${index + 1}`] = end;
  });
  return schedule;
}

function snapshot(intervals: Array<[string, string]>) {
  return {
    generatedAt: "2026-09-27T12:00:00.000Z",
    services: category("SERVICE"),
    customers: category("CUSTOMER"),
    availability: category("AVAILABILITY", [
      { externalId: "company", raw: mondaySchedule(intervals) },
      { externalId: "employee:7", raw: {} },
    ]),
    timeBlocks: category("TIME_BLOCK"),
    futureAppointments: category("FUTURE_APPOINTMENT"),
    pastAppointments: category("PAST_APPOINTMENT"),
    cancelledAppointments: category("CANCELLED_APPOINTMENT"),
    noShowAppointments: category("NO_SHOW_APPOINTMENT"),
  };
}

class FakeReader implements ImportPreviewSourceReader {
  constructor(private readonly value: ReturnType<typeof snapshot>) {}
  async getImportSnapshot() {
    return this.value as never;
  }
}

async function analyze(
  intervals: Array<[string, string]>,
  options: { activeRule?: boolean } = {},
) {
  const database = createDatabaseDouble();
  if (options.activeRule) {
    await database.client.availabilityRule.create({
      data: {
        tenantId,
        dayOfWeek: 1,
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T18:00:00.000Z"),
        active: true,
      },
    });
  }
  const session = await database.client.importSession.create({
    data: { tenantId, sourceAccountId: "account-1", createdBy: "user-1" },
  });
  const rulesBefore = database.tables.availabilityRule.rows.length;
  const result = await new ImportPreviewService(database.client as never).analyze(
    { tenantId, sessionId: session.id as string },
    new FakeReader(snapshot(intervals)),
    snapshotInput,
  );
  const items = database.tables.importItem.rows.filter(
    (row) => row.category === "AVAILABILITY",
  );
  return { database, result, items, rulesBefore };
}

function codeOf(run: () => void): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : "NOT_APP_ERROR";
  }
}

describe("regra única de sobreposição da grade", () => {
  it("aceita intervalos que só se encostam e recusa os que se cruzam no mesmo dia", () => {
    const touching = [
      { dayOfWeek: 1, startTime: "08:00", endTime: "12:00" },
      { dayOfWeek: 1, startTime: "12:00", endTime: "18:00" },
    ];
    expect(codeOf(() => assertNonOverlappingRules(touching))).toBeNull();
    expect(isValidAvailabilityGrid(touching)).toBe(true);

    const crossing = [
      { dayOfWeek: 1, startTime: "08:00", endTime: "12:00" },
      { dayOfWeek: 1, startTime: "11:00", endTime: "14:00" },
    ];
    expect(codeOf(() => assertNonOverlappingRules(crossing))).toBe(
      "AVAILABILITY_OVERLAP",
    );
    expect(isValidAvailabilityGrid(crossing)).toBe(false);
  });

  it("dias diferentes nunca se sobrepõem; início depois do fim é INVALID_AVAILABILITY_RANGE", () => {
    expect(
      codeOf(() =>
        assertNonOverlappingRules([
          { dayOfWeek: 1, startTime: "08:00", endTime: "12:00" },
          { dayOfWeek: 2, startTime: "08:00", endTime: "12:00" },
        ]),
      ),
    ).toBeNull();
    expect(
      codeOf(() =>
        assertNonOverlappingRules([
          { dayOfWeek: 1, startTime: "12:00", endTime: "08:00" },
        ]),
      ),
    ).toBe("INVALID_AVAILABILITY_RANGE");
  });
});

describe("análise da disponibilidade da origem", () => {
  it("grade da origem com sobreposição é classificada com código próprio, sem grade proposta e sem gravar regra", async () => {
    const { database, items, rulesBefore } = await analyze([
      ["08:00", "12:00"],
      ["11:00", "14:00"],
    ]);

    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.status).toBe("NEEDS_REVIEW");
      expect(item.reasonCode).toBe(AVAILABILITY_SOURCE_OVERLAP);
      // O dublê guarda o marcador `DbNull` como veio; no banco é `NULL`.
      expect(Array.isArray(item.proposedAvailability)).toBe(false);
    }
    expect(database.tables.availabilityRule.rows.length).toBe(rulesBefore);
  });

  it("negócio com horário ativo: itens NEEDS_REVIEW com o motivo de troca e a grade proposta já derivada", async () => {
    const { database, items, rulesBefore } = await analyze(
      [
        ["08:00", "12:00"],
        ["13:00", "19:00"],
      ],
      { activeRule: true },
    );

    const expected = [
      { dayOfWeek: 1, startTime: "08:00", endTime: "12:00" },
      { dayOfWeek: 1, startTime: "13:00", endTime: "19:00" },
    ];
    for (const item of items) {
      expect(item.status).toBe("NEEDS_REVIEW");
      expect(item.reasonCode).toBe(AVAILABILITY_REPLACES_CURRENT);
      expect(item.proposedAvailability).toEqual(expected);
    }
    expect(database.tables.availabilityRule.rows.length).toBe(rulesBefore);
  });

  it("negócio sem horário ativo: itens pendentes como sempre", async () => {
    const { items } = await analyze([["08:00", "12:00"]]);
    for (const item of items) {
      expect(item.status).toBe("PENDING");
      expect(item.reasonCode).toBeNull();
    }
  });
});
