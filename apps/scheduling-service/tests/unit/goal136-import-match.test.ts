/**
 * A analise grava a correspondencia sugerida e os valores do servico da
 * origem, e o servico de mesmo nome com valores diferentes vira conflito
 * (Goal136, WU-01; pergunta 795 do vault).
 */
import { describe, expect, it } from "vitest";

import { Prisma } from "../../src/generated/prisma/client.js";
import { ImportPreviewService } from "../../src/modules/migrations/import-preview-service.js";
import {
  knownServiceDuration,
  proposedServiceFrom,
  resolvePrice,
} from "../../src/modules/migrations/import-source-values.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const input = {
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  referenceDate: "2026-01-01",
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
  overrides: { services?: Records; customers?: Records; availability?: Records } = {},
) {
  return {
    generatedAt: new Date().toISOString(),
    services: category("SERVICE", overrides.services),
    customers: category("CUSTOMER", overrides.customers),
    availability: category("AVAILABILITY", overrides.availability),
    timeBlocks: category("TIME_BLOCK"),
    futureAppointments: category("FUTURE_APPOINTMENT"),
    pastAppointments: category("PAST_APPOINTMENT"),
    cancelledAppointments: category("CANCELLED_APPOINTMENT"),
    noShowAppointments: category("NO_SHOW_APPOINTMENT"),
  } as never;
}

function reader(value: ReturnType<typeof snapshot>) {
  return { getImportSnapshot: async () => value as never };
}

async function setup(
  existingServices: Array<Record<string, unknown>> = [],
  sessionOverrides: Record<string, unknown> = {},
) {
  const database = createDatabaseDouble();
  const preview = new ImportPreviewService(database.client as never);
  const session = await database.client.importSession.create({
    data: {
      tenantId,
      sourceAccountId: "account-1",
      createdBy: "user-1",
      ...sessionOverrides,
    },
  });
  const services = [];
  for (const data of existingServices) {
    services.push(await database.client.service.create({ data: { tenantId, ...data } }));
  }
  const analyze = (value: ReturnType<typeof snapshot>) =>
    preview.analyze({ tenantId, sessionId: session.id as string }, reader(value), input);
  const rows = () =>
    database.tables.importItem.rows.filter((row) => row.sessionId === session.id);
  return { database, session, services, analyze, rows };
}

/** O dublê guarda o marcador `Prisma.DbNull` no create: para o banco real, é NULL. */
function isNullColumn(value: unknown): boolean {
  return value === null || value === undefined || value === Prisma.DbNull;
}

const corte = {
  name: "Corte",
  durationMinutes: 30,
  priceType: "FIXED",
  price: 50,
};

async function classifyService(
  existing: Array<Record<string, unknown>>,
  raw: unknown,
) {
  const { services, analyze } = await setup(existing);
  const result = await analyze(snapshot({ services: [{ externalId: "1", raw }] }));
  return { item: result.items[0], services };
}

describe("SERVICE_MATCH_DIVERGENT: mesmo nome, valores diferentes", () => {
  it("duração diferente vira conflito DIVERGENT NEEDS_REVIEW com o candidato", async () => {
    const { item, services } = await classifyService(
      [corte],
      { name: "Corte", duration: 45, price: 50 },
    );
    expect(item.reasonCode).toBe("SERVICE_MATCH_DIVERGENT");
    expect(item.status).toBe("NEEDS_REVIEW");
    expect(item.matchClass).toBe("DIVERGENT");
    expect(item.matchCandidateInternalIds).toEqual([services[0].id]);
  });

  it("preço diferente vira conflito", async () => {
    const { item, services } = await classifyService(
      [corte],
      { name: "Corte", duration: 30, price: 60 },
    );
    expect(item.reasonCode).toBe("SERVICE_MATCH_DIVERGENT");
    expect(item.status).toBe("NEEDS_REVIEW");
    expect(item.matchCandidateInternalIds).toEqual([services[0].id]);
  });

  it("cadastro sem duração com duração da origem conhecida conta como diferente", async () => {
    const { item } = await classifyService(
      [{ ...corte, durationMinutes: null }],
      { name: "Corte", duration: 30, price: 50 },
    );
    expect(item.reasonCode).toBe("SERVICE_MATCH_DIVERGENT");
  });

  it("cadastro sem preço FIXED com preço da origem informado conta como diferente", async () => {
    const { item } = await classifyService(
      [{ ...corte, priceType: "NOT_INFORMED", price: null }],
      { name: "Corte", duration: 30, price: 50 },
    );
    expect(item.reasonCode).toBe("SERVICE_MATCH_DIVERGENT");
  });

  it("compara o preço numericamente sobre o Decimal do cadastro", async () => {
    const equal = await classifyService(
      [{ ...corte, price: new Prisma.Decimal("50.00") }],
      { name: "Corte", duration: 30, price: 50 },
    );
    expect(equal.item.reasonCode).toBe("SERVICE_MATCH_EXACT");
    const different = await classifyService(
      [{ ...corte, price: new Prisma.Decimal("50.00") }],
      { name: "Corte", duration: 30, price: 50.5 },
    );
    expect(different.item.reasonCode).toBe("SERVICE_MATCH_DIVERGENT");
  });

  it("o reasonDetail não carrega dado da origem", async () => {
    const { item } = await classifyService(
      [corte],
      { name: "Corte", duration: 4567, price: 8910 },
    );
    expect(item.reasonDetail).not.toMatch(/4567|8910/);
  });
});

describe("SERVICE_MATCH_DIVERGENT: o que continua como era", () => {
  it("valores iguais continuam SERVICE_MATCH_EXACT PENDING", async () => {
    const { item } = await classifyService(
      [corte],
      { name: "Corte", duration: 30, price: 50 },
    );
    expect(item.reasonCode).toBe("SERVICE_MATCH_EXACT");
    expect(item.status).toBe("PENDING");
    expect(item.matchClass).toBe("EXACT");
  });

  it("duração ausente na origem continua SERVICE_DURATION_MISSING, sem fabricar divergência", async () => {
    for (const duration of [null, undefined, 0, "30"]) {
      const { item } = await classifyService(
        [corte],
        { name: "Corte", duration, price: 50 },
      );
      expect(item.reasonCode).toBe("SERVICE_DURATION_MISSING");
      expect(item.status).toBe("NEEDS_REVIEW");
      // A duração ausente não fabrica divergência: a correspondência segue EXACT.
      expect(item.matchClass).toBe("EXACT");
    }
  });

  it("SERVICE_DURATION_MISSING prevalece mesmo com preço diferente", async () => {
    const { item } = await classifyService(
      [corte],
      { name: "Corte", duration: null, price: 99 },
    );
    expect(item.reasonCode).toBe("SERVICE_DURATION_MISSING");
  });

  it("preço ausente ou zero na origem, com a mesma duração, continua SERVICE_MATCH_EXACT", async () => {
    for (const price of [null, undefined, 0]) {
      const { item } = await classifyService(
        [corte],
        { name: "Corte", duration: 30, price },
      );
      expect(item.reasonCode).toBe("SERVICE_MATCH_EXACT");
      expect(item.status).toBe("PENDING");
    }
  });

  it("preço zero na origem não diverge nem de cadastro sem preço", async () => {
    const { item } = await classifyService(
      [{ ...corte, priceType: "NOT_INFORMED", price: null }],
      { name: "Corte", duration: 30, price: 0 },
    );
    expect(item.reasonCode).toBe("SERVICE_MATCH_EXACT");
  });

  it("nome ambíguo continua SERVICE_MATCH_AMBIGUOUS, mesmo com valores diferentes", async () => {
    const { item, services } = await classifyService(
      [corte, { ...corte, durationMinutes: 45, price: 60 }],
      { name: "Corte", duration: 90, price: 5 },
    );
    expect(item.reasonCode).toBe("SERVICE_MATCH_AMBIGUOUS");
    expect(item.matchClass).toBe("DIVERGENT");
    expect([...item.matchCandidateInternalIds].sort()).toEqual(
      services.map((service) => service.id as string).sort(),
    );
  });

  it("nome parecido continua SERVICE_MATCH_SIMILAR", async () => {
    const { item } = await classifyService(
      [{ ...corte, name: "Corte de Cabelo" }],
      { name: "Corte Cabelo", duration: 90, price: 5 },
    );
    expect(item.reasonCode).toBe("SERVICE_MATCH_SIMILAR");
    expect(item.matchClass).toBe("SIMILAR");
  });

  it("serviço novo sem correspondência fica PENDING sem motivo", async () => {
    const { item } = await classifyService(
      [corte],
      { name: "Barba", duration: 20, price: 30 },
    );
    expect(item.reasonCode).toBeNull();
    expect(item.status).toBe("PENDING");
  });

  it("os motivos de cliente não mudam", async () => {
    const database = createDatabaseDouble();
    const preview = new ImportPreviewService(database.client as never);
    const session = await database.client.importSession.create({
      data: { tenantId, sourceAccountId: "account-1", createdBy: "user-1" },
    });
    await database.client.customer.create({
      data: { tenantId, name: "Ana", phone: "5511900000001", normalizedPhone: "5511900000001" },
    });
    await database.client.customer.create({
      data: { tenantId, name: "Beatriz Souza", phone: "5511900000002", normalizedPhone: "5511900000002" },
    });
    const result = await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader(
        snapshot({
          customers: [
            { externalId: "1", raw: { name: "Ana", phone1: "5511900000001" } },
            { externalId: "2", raw: { name: "Outra", phone1: "5511900000001" } },
            { externalId: "3", raw: { name: "Beatriz Sousa" } },
            { externalId: "4", raw: { phone1: "5511977770000" } },
          ],
        }),
      ),
      input,
    );
    const byId = Object.fromEntries(
      result.items.map((item) => [item.externalId, item]),
    );
    expect(byId["1"]).toMatchObject({ reasonCode: "CUSTOMER_MATCH_EXACT", status: "PENDING" });
    expect(byId["2"]).toMatchObject({ reasonCode: "CUSTOMER_PHONE_SHARED", status: "PENDING" });
    expect(byId["3"]).toMatchObject({ reasonCode: "CUSTOMER_MATCH_SIMILAR", status: "NEEDS_REVIEW" });
    expect(byId["4"]).toMatchObject({ reasonCode: "CUSTOMER_NAME_MISSING", status: "PENDING" });
  });
});

describe("a análise grava matchCandidateInternalIds e proposedService", () => {
  const raw = { name: "Corte", duration: 45, price: 60 };

  it("o item novo de serviço grava os candidatos e o que a origem propõe", async () => {
    const { services, analyze, rows } = await setup([corte]);
    await analyze(snapshot({ services: [{ externalId: "1", raw }] }));
    const [row] = rows();
    expect(row.matchCandidateInternalIds).toEqual([services[0].id]);
    expect(row.proposedService).toEqual({
      durationMinutes: 45,
      priceType: "FIXED",
      price: 60,
    });
    expect(isNullColumn(row.proposedAvailability)).toBe(true);
  });

  it("serviço sem candidato grava lista vazia; duração e preço desconhecidos gravam null e NOT_INFORMED", async () => {
    const { analyze, rows } = await setup([]);
    await analyze(
      snapshot({ services: [{ externalId: "1", raw: { name: "Barba", duration: null, price: 0 } }] }),
    );
    const [row] = rows();
    expect(row.matchCandidateInternalIds).toEqual([]);
    expect(row.proposedService).toEqual({
      durationMinutes: null,
      priceType: "NOT_INFORMED",
      price: null,
    });
  });

  it("o item de cliente grava os candidatos e nenhum proposedService", async () => {
    const database = createDatabaseDouble();
    const preview = new ImportPreviewService(database.client as never);
    const session = await database.client.importSession.create({
      data: { tenantId, sourceAccountId: "account-1", createdBy: "user-1" },
    });
    const customer = await database.client.customer.create({
      data: { tenantId, name: "Ana", phone: "5511900000001", normalizedPhone: "5511900000001" },
    });
    await preview.analyze(
      { tenantId, sessionId: session.id as string },
      reader(
        snapshot({
          customers: [{ externalId: "1", raw: { name: "Ana", phone1: "5511900000001" } }],
        }),
      ),
      input,
    );
    const [row] = database.tables.importItem.rows;
    expect(row.matchCandidateInternalIds).toEqual([customer.id]);
    expect(isNullColumn(row.proposedService)).toBe(true);
  });

  it("as outras categorias ficam com as duas colunas nulas", async () => {
    const { analyze, rows } = await setup([]);
    await analyze(
      snapshot({
        availability: [{ externalId: "company", raw: { not: "a schedule" } }],
      }),
    );
    const availability = rows().find((row) => row.category === "AVAILABILITY")!;
    expect(isNullColumn(availability.matchCandidateInternalIds)).toBe(true);
    expect(isNullColumn(availability.proposedService)).toBe(true);
  });

  it("a reanálise atualiza o item não resolvido com os candidatos e os valores novos", async () => {
    const { services, analyze, rows } = await setup([corte]);
    await analyze(
      snapshot({
        services: [{ externalId: "1", raw: { name: "Corte", duration: 30, price: 50 } }],
      }),
    );
    expect(rows()[0].matchCandidateInternalIds).toEqual([services[0].id]);
    expect(rows()[0].reasonCode).toBe("SERVICE_MATCH_EXACT");

    const second = await analyze(snapshot({ services: [{ externalId: "1", raw }] }));
    const [row] = rows();
    expect(rows()).toHaveLength(1);
    expect(second.items[0].reasonCode).toBe("SERVICE_MATCH_DIVERGENT");
    expect(row.reasonCode).toBe("SERVICE_MATCH_DIVERGENT");
    expect(row.matchCandidateInternalIds).toEqual([services[0].id]);
    expect(row.proposedService).toEqual({ durationMinutes: 45, priceType: "FIXED", price: 60 });
  });

  it("a reanálise grava os candidatos num item antigo sem a coluna preenchida", async () => {
    const { services, analyze, rows } = await setup([corte]);
    await analyze(snapshot({ services: [{ externalId: "1", raw }] }));
    const [row] = rows();
    row.matchCandidateInternalIds = null;
    row.proposedService = null;
    await analyze(snapshot({ services: [{ externalId: "1", raw }] }));
    expect(rows()[0].matchCandidateInternalIds).toEqual([services[0].id]);
    expect(rows()[0].proposedService).not.toBeNull();
  });

  it("o item resolvido não muda: nem as colunas, nem o status", async () => {
    const { database, session, analyze, rows } = await setup(
      [corte],
      { status: "PARTIAL", previewVersion: 1 },
    );
    await database.client.importItem.create({
      data: {
        tenantId,
        sessionId: session.id,
        category: "SERVICE",
        externalId: "1",
        label: "Corte",
        status: "IMPORTED",
        entityType: "SERVICE",
        internalId: "created-before",
        fingerprint: "old",
        matchCandidateInternalIds: ["kept-id"],
        proposedService: { durationMinutes: 1, priceType: "NOT_INFORMED", price: null },
        firstSeenPreviewVersion: 1,
        lastSeenPreviewVersion: 1,
      },
    });
    await analyze(snapshot({ services: [{ externalId: "1", raw }] }));
    const [row] = rows();
    expect(row.status).toBe("IMPORTED");
    expect(row.matchCandidateInternalIds).toEqual(["kept-id"]);
    expect(row.proposedService).toEqual({
      durationMinutes: 1,
      priceType: "NOT_INFORMED",
      price: null,
    });
  });
});

describe("proposedService sai das mesmas funções da execução", () => {
  it.each<{ duration?: unknown; price?: unknown }>([
    { duration: 30, price: 50 },
    { duration: null, price: 0 },
    { duration: 0, price: null },
    { duration: "30", price: "50" },
    { duration: 45.5, price: 12.9 },
    {},
  ])("o proposedService de %j é duração e preço da execução", async (source) => {
    expect(proposedServiceFrom(source)).toEqual({
      durationMinutes: knownServiceDuration(source.duration),
      ...resolvePrice(source.price),
    });
    const { analyze, rows } = await setup([]);
    await analyze(
      snapshot({ services: [{ externalId: "1", raw: { name: "X", ...source } }] }),
    );
    expect(rows()[0].proposedService).toEqual(proposedServiceFrom(source));
  });
});
