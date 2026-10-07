/**
 * Valor malformado da origem e tratado como ausente, na analise e na execucao
 * (Goal138, WU-01): duracao de servico que nao e inteiro positivo vira
 * duracao desconhecida e preco negativo vira preco nao informado — nunca
 * arredondados, nunca um item que falha por isso.
 */
import { describe, expect, it } from "vitest";

import { ImportExecutionService } from "../../src/modules/migrations/import-execution-service.js";
import {
  ImportPreviewService,
  type ImportPreviewSourceReader,
} from "../../src/modules/migrations/import-preview-service.js";
import {
  knownPositiveDuration,
  knownServiceDuration,
  proposedServiceFrom,
  resolvePrice,
} from "../../src/modules/migrations/import-source-values.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const timeZone = "America/Sao_Paulo";
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-09-10",
};

type Records = Array<{ externalId: string; raw: unknown }>;

function category(name: string, records: Records = []) {
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

function snapshot(
  overrides: {
    services?: Records;
    customers?: Records;
    futureAppointments?: Records;
  } = {},
) {
  return {
    generatedAt: "2026-09-10T12:00:00.000Z",
    services: category("SERVICE", overrides.services),
    customers: category("CUSTOMER", overrides.customers),
    availability: category("AVAILABILITY"),
    timeBlocks: category("TIME_BLOCK"),
    futureAppointments: category(
      "FUTURE_APPOINTMENT",
      overrides.futureAppointments,
    ),
    pastAppointments: category("PAST_APPOINTMENT"),
    cancelledAppointments: category("CANCELLED_APPOINTMENT"),
    noShowAppointments: category("NO_SHOW_APPOINTMENT"),
  } as never;
}

class FakeReader implements ImportPreviewSourceReader {
  constructor(private readonly value: ReturnType<typeof snapshot>) {}
  async getImportSnapshot() {
    return this.value as never;
  }
}

function setup(existingServices: Array<Record<string, unknown>> = []) {
  const database = createDatabaseDouble();
  database.tables.calendarSettings.rows.push({
    id: tenantId,
    tenantId,
    source: "MINHA_AGENDA",
    timezone: timeZone,
  } as never);
  const preview = new ImportPreviewService(database.client as never);
  const execution = new ImportExecutionService(database.client as never);
  const seeded = Promise.all(
    existingServices.map((data) =>
      database.client.service.create({ data: { tenantId, ...data } }),
    ),
  );
  return { database, preview, execution, seeded };
}

async function analyzed(
  database: ReturnType<typeof createDatabaseDouble>,
  preview: ImportPreviewService,
  value: ReturnType<typeof snapshot>,
) {
  const session = await database.client.importSession.create({
    data: { tenantId, sourceAccountId: "account-1", createdBy: "user-1" },
  });
  const reader = new FakeReader(value);
  const result = await preview.analyze(
    { tenantId, sessionId: session.id as string },
    reader,
    snapshotInput,
  );
  return { sessionId: session.id as string, reader, result };
}

/**
 * "Incluir" decidido pela pessoa: o item em revisão volta a `PENDING`, como a
 * rota de decisão o grava, e só então a execução o importa.
 */
function includeReviewed(database: ReturnType<typeof createDatabaseDouble>) {
  for (const row of database.tables.importItem.rows) {
    if (row.status === "NEEDS_REVIEW") row.status = "PENDING";
  }
}

/** A regra de `importProposedServiceSchema` (contrato), campo a campo. */
function acceptedByContract(value: {
  durationMinutes: unknown;
  priceType: unknown;
  price: unknown;
}): boolean {
  const durationOk =
    value.durationMinutes === null ||
    (typeof value.durationMinutes === "number" &&
      Number.isInteger(value.durationMinutes) &&
      value.durationMinutes > 0);
  const priceOk =
    value.price === null ||
    (typeof value.price === "number" &&
      Number.isFinite(value.price) &&
      value.price >= 0);
  return durationOk && priceOk && value.priceType !== undefined;
}

const sourceCustomer = {
  id: 500,
  name: "Ana Souza",
  phone1: "5511999990000",
  phone2: null,
};

function sourceService(
  duration: unknown,
  price: unknown,
  id = 900,
  name = "Corte",
) {
  return { id, name, duration, price, colorId: null, deleted: false };
}

describe("knownServiceDuration", () => {
  it("devolve o valor só para número finito, inteiro e maior que zero", () => {
    expect(knownServiceDuration(30)).toBe(30);
    expect(knownServiceDuration(1)).toBe(1);
    expect(knownServiceDuration(180)).toBe(180);
  });

  it("fração, zero, negativo, não finito, texto e ausente dão null, sem arredondar", () => {
    for (const value of [
      47.5,
      0.5,
      0,
      -30,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "30",
      null,
      undefined,
      {},
    ]) {
      expect(knownServiceDuration(value)).toBeNull();
    }
  });

  it("knownPositiveDuration continua aceitando fração, para o intervalo do atendimento", () => {
    expect(knownPositiveDuration(47.5)).toBe(47.5);
  });
});

describe("resolvePrice", () => {
  it("preço negativo é NOT_INFORMED/null, como ausente e zero", () => {
    for (const value of [-10, -0.01, 0, null, undefined, "50", Number.NaN]) {
      expect(resolvePrice(value)).toEqual({
        priceType: "NOT_INFORMED",
        price: null,
      });
    }
  });

  it("preço positivo continua FIXED", () => {
    expect(resolvePrice(90)).toEqual({ priceType: "FIXED", price: 90 });
    expect(resolvePrice(89.9)).toEqual({ priceType: "FIXED", price: 89.9 });
  });
});

describe("proposedServiceFrom", () => {
  it("duração fracionária e preço negativo saem no que o contrato aceita", () => {
    const proposed = proposedServiceFrom({ duration: 47.5, price: -10 });
    expect(proposed).toEqual({
      durationMinutes: null,
      priceType: "NOT_INFORMED",
      price: null,
    });
    expect(acceptedByContract(proposed)).toBe(true);
  });

  it("valor bem formado grava o mesmo de antes", () => {
    expect(proposedServiceFrom({ duration: 45, price: 80 })).toEqual({
      durationMinutes: 45,
      priceType: "FIXED",
      price: 80,
    });
  });
});

describe("a análise com valor malformado da origem", () => {
  const corte = {
    name: "Corte",
    durationMinutes: 47,
    priceType: "FIXED",
    price: 50,
  };

  it("duração fracionária sai SERVICE_DURATION_MISSING NEEDS_REVIEW com os candidatos preservados", async () => {
    const { database, preview, seeded } = setup([corte]);
    const [existing] = await seeded;
    const { result } = await analyzed(
      database,
      preview,
      snapshot({
        services: [{ externalId: "900", raw: sourceService(47.5, 50) }],
      }),
    );
    const item = result.items[0];
    expect(item.reasonCode).toBe("SERVICE_DURATION_MISSING");
    expect(item.status).toBe("NEEDS_REVIEW");
    expect(item.matchCandidateInternalIds).toEqual([existing.id]);
  });

  it("duração zero, negativa e não finita também saem SERVICE_DURATION_MISSING", async () => {
    for (const duration of [0, -30, Number.POSITIVE_INFINITY]) {
      const { database, preview } = setup();
      const { result } = await analyzed(
        database,
        preview,
        snapshot({
          services: [{ externalId: "900", raw: sourceService(duration, 50) }],
        }),
      );
      expect(result.items[0].reasonCode).toBe("SERVICE_DURATION_MISSING");
      expect(result.items[0].status).toBe("NEEDS_REVIEW");
    }
  });

  it("preço negativo com cadastro de mesmo nome e mesma duração não vira SERVICE_MATCH_DIVERGENT", async () => {
    const { database, preview, seeded } = setup([corte]);
    await seeded;
    const { result } = await analyzed(
      database,
      preview,
      snapshot({
        services: [{ externalId: "900", raw: sourceService(47, -10) }],
      }),
    );
    expect(result.items[0].reasonCode).not.toBe("SERVICE_MATCH_DIVERGENT");
    expect(result.items[0].reasonCode).toBe("SERVICE_MATCH_EXACT");
    expect(result.items[0].status).toBe("PENDING");
  });

  it("o proposedService gravado pela análise é aceito pelo contrato", async () => {
    const { database, preview } = setup();
    await analyzed(
      database,
      preview,
      snapshot({
        services: [
          { externalId: "900", raw: sourceService(47.5, 50, 900) },
          { externalId: "901", raw: sourceService(60, -10, 901, "Barba") },
        ],
      }),
    );
    const stored = database.tables.importItem.rows.map(
      (row) => row.proposedService as never,
    );
    expect(stored).toHaveLength(2);
    expect(stored).toContainEqual({
      durationMinutes: null,
      priceType: "FIXED",
      price: 50,
    });
    expect(stored).toContainEqual({
      durationMinutes: 60,
      priceType: "NOT_INFORMED",
      price: null,
    });
    for (const proposed of stored) {
      expect(acceptedByContract(proposed)).toBe(true);
    }
  });
});

describe("a execução com valor malformado da origem", () => {
  it("serviço de duração fracionária e serviço de preço negativo entram IMPORTED, não FAILED", async () => {
    const { database, preview, execution } = setup();
    const { sessionId, reader } = await analyzed(
      database,
      preview,
      snapshot({
        services: [
          { externalId: "900", raw: sourceService(47.5, 50, 900) },
          { externalId: "901", raw: sourceService(60, -10, 901, "Barba") },
        ],
      }),
    );
    includeReviewed(database);

    await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );

    const items = database.tables.importItem.rows.filter(
      (row) => row.category === "SERVICE",
    );
    expect(items.map((row) => row.status)).toEqual(["IMPORTED", "IMPORTED"]);
    const corte = database.tables.service.rows.find(
      (row) => row.name === "Corte",
    );
    expect(corte?.durationMinutes).toBeNull();
    expect(corte?.reviewOrigin).toBe("IMPORT");
    expect(corte?.priceType).toBe("FIXED");
    expect(corte?.price).toBe(50);
    const barba = database.tables.service.rows.find(
      (row) => row.name === "Barba",
    );
    expect(barba?.durationMinutes).toBe(60);
    expect(barba?.priceType).toBe("NOT_INFORMED");
    expect(barba?.price).toBeNull();
  });

  it("serviço bem formado grava o mesmo de antes", async () => {
    const { database, preview, execution } = setup();
    const { sessionId, reader } = await analyzed(
      database,
      preview,
      snapshot({
        services: [{ externalId: "900", raw: sourceService(45, 80) }],
      }),
    );
    await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );
    const service = database.tables.service.rows[0];
    expect(service.durationMinutes).toBe(45);
    expect(service.priceType).toBe("FIXED");
    expect(service.price).toBe(80);
  });

  function appointment(
    service: ReturnType<typeof sourceService>,
    duration: number,
  ) {
    return {
      id: 100,
      userId: 7,
      date: "2026-10-01",
      startTime: "09:00",
      endTime: "10:00",
      duration,
      customerId: sourceCustomer.id,
      customer: sourceCustomer,
      serviceId: service.id,
      service,
      price: service.price,
      comments: null,
      deleted: false,
    };
  }

  async function runAppointment(
    service: ReturnType<typeof sourceService>,
    duration = 60,
  ) {
    const { database, preview, execution } = setup();
    const { sessionId, reader } = await analyzed(
      database,
      preview,
      snapshot({
        services: [{ externalId: String(service.id), raw: service }],
        customers: [{ externalId: "500", raw: sourceCustomer }],
        futureAppointments: [
          { externalId: "100", raw: appointment(service, duration) },
        ],
      }),
    );
    includeReviewed(database);
    await execution.execute(
      { tenantId, sessionId, userId: "user-1" },
      reader,
      snapshotInput,
      { previewVersion: 1 },
    );
    return database;
  }

  it("o retrato do atendimento com duração fracionária ou preço negativo grava nulo e NOT_INFORMED", async () => {
    const database = await runAppointment(sourceService(47.5, -10));
    const statuses = database.tables.importItem.rows.map((row) => row.status);
    expect(statuses).toEqual(["IMPORTED", "IMPORTED", "IMPORTED"]);
    expect(database.tables.appointment.rows).toHaveLength(1);
    const item = database.tables.appointmentItem.rows[0];
    expect(item.durationMinutesSnapshot).toBeNull();
    expect(item.priceTypeSnapshot).toBe("NOT_INFORMED");
    expect(item.priceSnapshot).toBeNull();
  });

  it("o retrato bem formado grava o mesmo de antes", async () => {
    const database = await runAppointment(sourceService(60, 80));
    const item = database.tables.appointmentItem.rows[0];
    expect(item.durationMinutesSnapshot).toBe(60);
    expect(item.priceTypeSnapshot).toBe("FIXED");
    expect(item.priceSnapshot).toBe(80);
  });

  it("resolveInterval com appointment.duration fracionária continua usando a duração", async () => {
    // 09:00 + 47,5 min em São Paulo (UTC-3); o endTime (10:00) não é usado.
    const database = await runAppointment(sourceService(60, 80), 47.5);
    const row = database.tables.appointment.rows[0];
    expect((row.startAt as Date).toISOString()).toBe(
      "2026-10-01T12:00:00.000Z",
    );
    expect((row.endAt as Date).toISOString()).toBe("2026-10-01T12:47:30.000Z");
  });
});
