// Primeiro import de propósito: fixa as variáveis da autenticação interna
// antes de `config/env.ts` ser avaliado (ver o próprio arquivo).
import "../unit/support/test-env.js";

import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { type FastifyInstance } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import { ImportCompletionService } from "../../src/modules/migrations/import-completion-service.js";
import { ImportExecutionService } from "../../src/modules/migrations/import-execution-service.js";
import { ImportBackgroundWork } from "../../src/modules/migrations/import-lease.js";
import { ImportPreviewService } from "../../src/modules/migrations/import-preview-service.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal062 §2 (WU-03) contra PostgreSQL real: a disponibilidade da origem é
 * trocada pela vigente, nunca somada a ela.
 *
 * O negócio tem 09–18 de segunda a sexta; a origem declara 08–12 e 13–19 nos
 * mesmos dias. Sem `INCLUDE` de item, nenhuma `AvailabilityRule` muda; com
 * `INCLUDE`, a grade final é exatamente a da origem; com `EXCLUDE`, é a
 * vigente. A origem é um leitor de teste: nenhum teste chama a Minha Agenda
 * real.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal062-wu03-tenant-a";
const tenantB = "goal062-wu03-tenant-b";
const timeZone = "America/Sao_Paulo";
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-09-10",
};
const WEEKDAYS = [1, 2, 3, 4, 5];
const PREFIXES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

let prisma: PrismaClient;
let app: FastifyInstance;
let work: ImportBackgroundWork;

interface GridRule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

// ---------------------------------------------------------------------------
// Origem de teste.
// ---------------------------------------------------------------------------

function category(name: string, records: unknown[] = []) {
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

/** Jornada da empresa com os mesmos intervalos em cada dia marcado. */
function companySchedule(intervals: Array<[string, string]>) {
  const schedule: Record<string, unknown> = {};
  PREFIXES.forEach((prefix, dayOfWeek) => {
    const enabled = WEEKDAYS.includes(dayOfWeek);
    schedule[`${prefix}Enabled`] = enabled;
    if (!enabled) return;
    intervals.forEach(([start, end], index) => {
      schedule[`${prefix}StartTime${index + 1}`] = start;
      schedule[`${prefix}EndTime${index + 1}`] = end;
    });
  });
  return schedule;
}

function buildSnapshot(intervals: Array<[string, string]>) {
  return {
    generatedAt: "2026-09-27T12:00:00.000Z",
    services: category("SERVICE"),
    customers: category("CUSTOMER"),
    availability: category("AVAILABILITY", [
      { externalId: "company", raw: companySchedule(intervals) },
      // Profissional sem intervalo próprio: vale a jornada da empresa.
      { externalId: "employee:77", raw: {} },
    ]),
    timeBlocks: category("TIME_BLOCK"),
    futureAppointments: category("FUTURE_APPOINTMENT"),
    pastAppointments: category("PAST_APPOINTMENT"),
    cancelledAppointments: category("CANCELLED_APPOINTMENT"),
    noShowAppointments: category("NO_SHOW_APPOINTMENT"),
  };
}

class FixtureReader {
  constructor(private readonly snapshot: ReturnType<typeof buildSnapshot>) {}
  async getImportSnapshot() {
    return this.snapshot as never;
  }
}

const SOURCE_GRID: Array<[string, string]> = [
  ["08:00", "12:00"],
  ["13:00", "19:00"],
];

function weekdayGrid(intervals: Array<[string, string]>): GridRule[] {
  return WEEKDAYS.flatMap((dayOfWeek) =>
    intervals.map(([startTime, endTime]) => ({ dayOfWeek, startTime, endTime })),
  );
}

// ---------------------------------------------------------------------------
// Aplicação e fixture.
// ---------------------------------------------------------------------------

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  await registerManagementRoutes(instance, prisma, {
    importWork: work,
    importSourceReader: async () => {
      throw new Error("The route source reader is not used by this suite.");
    },
  });
  instance.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
        requestId: request.id,
      });
    }
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: (error as Error).message },
      requestId: request.id,
    });
  });
  return instance;
}

function headers(tenantId: string, key?: string) {
  return {
    authorization: `Bearer ${bffToken}`,
    "x-tenant-id": tenantId,
    "x-user-id": "owner-1",
    "x-request-id": "req-goal062-wu03",
    "content-type": "application/json",
    ...(key ? { "idempotency-key": key } : {}),
  };
}

function databaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

async function seedTenant(tenantId: string, grid: GridRule[]): Promise<void> {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
  if (grid.length > 0) {
    await prisma.availabilityRule.createMany({
      data: grid.map((rule) => ({
        tenantId,
        dayOfWeek: rule.dayOfWeek,
        startTime: databaseTime(rule.startTime),
        endTime: databaseTime(rule.endTime),
        active: true,
      })),
    });
  }
}

async function gridOf(tenantId: string): Promise<GridRule[]> {
  const rows = await prisma.availabilityRule.findMany({
    where: { tenantId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime.toISOString().slice(11, 16),
    endTime: row.endTime.toISOString().slice(11, 16),
  }));
}

async function ruleIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.availabilityRule.findMany({
    where: { tenantId },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => row.id);
}

async function analyzedSession(
  tenantId: string,
  intervals: Array<[string, string]> = SOURCE_GRID,
) {
  const reader = new FixtureReader(buildSnapshot(intervals));
  const session = await new ImportCompletionService(prisma).startSession({
    tenantId,
    userId: "owner-1",
    sourceAccountId: "account-1",
    sourceAccountLabel: "Salao da Ana",
  });
  const preview = await new ImportPreviewService(prisma).analyze(
    { tenantId, sessionId: session.sessionId },
    reader,
    snapshotInput,
  );
  return { sessionId: session.sessionId, preview, reader };
}

function execute(
  tenantId: string,
  sessionId: string,
  reader: FixtureReader,
  previewVersion: number,
) {
  return new ImportExecutionService(prisma).execute(
    { tenantId, sessionId, userId: "owner-1" },
    reader,
    snapshotInput,
    { previewVersion },
  );
}

async function availabilityItems(tenantId: string, sessionId: string) {
  return prisma.importItem.findMany({
    where: { tenantId, sessionId, category: "AVAILABILITY" },
    orderBy: { externalId: "asc" },
  });
}

function decide(
  tenantId: string,
  sessionId: string,
  itemId: string,
  decision: "INCLUDE" | "EXCLUDE",
  key: string,
) {
  return app.inject({
    method: "POST",
    url: `/internal/calendar/imports/${sessionId}/items/${itemId}/decision`,
    headers: headers(tenantId, key),
    payload: { decision },
  });
}

describeWithDatabase("goal062 AVAILABILITY replaced, never summed, against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    work = new ImportBackgroundWork();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("a migration é aditiva: uma coluna JSON anulável em ImportItem", async () => {
    const columns = await prisma.$queryRaw<
      Array<{ data_type: string; is_nullable: string }>
    >`
      SELECT data_type, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'ImportItem'
         AND column_name = 'proposedAvailability'
    `;
    expect(columns).toEqual([{ data_type: "jsonb", is_nullable: "YES" }]);
  });

  it("negócio com horário ativo: os itens nascem NEEDS_REVIEW e Importar tudo sem decisão não altera nenhuma AvailabilityRule", async () => {
    await seedTenant(tenantA, weekdayGrid([["09:00", "18:00"]]));
    const before = await ruleIds(tenantA);
    const { sessionId, preview, reader } = await analyzedSession(tenantA);

    const items = await availabilityItems(tenantA, sessionId);
    expect(items.map((item) => [item.status, item.reasonCode])).toEqual([
      ["NEEDS_REVIEW", "AVAILABILITY_REPLACES_CURRENT"],
      ["NEEDS_REVIEW", "AVAILABILITY_REPLACES_CURRENT"],
    ]);
    // A grade proposta já derivada, só dia e horário.
    expect(items[0].proposedAvailability).toEqual(weekdayGrid(SOURCE_GRID));

    await execute(tenantA, sessionId, reader, preview.previewVersion);

    expect(await ruleIds(tenantA)).toEqual(before);
    expect(await gridOf(tenantA)).toEqual(weekdayGrid([["09:00", "18:00"]]));
    const after = await availabilityItems(tenantA, sessionId);
    expect(after.every((item) => item.status === "NEEDS_REVIEW")).toBe(true);
  });

  it("INCLUDE de item troca a grade do grupo inteiro: a final é exatamente 08–12 e 13–19, sem sobreposição", async () => {
    await seedTenant(tenantA, weekdayGrid([["09:00", "18:00"]]));
    await seedTenant(tenantB, weekdayGrid([["10:00", "16:00"]]));
    const tenantBBefore = await ruleIds(tenantB);
    const { sessionId, preview, reader } = await analyzedSession(tenantA);
    const [company] = await availabilityItems(tenantA, sessionId);

    const decided = await decide(
      tenantA,
      sessionId,
      company.id,
      "INCLUDE",
      "wu03-include",
    );
    expect(decided.statusCode).toBe(200);
    // A escolha vale para o grupo: os dois itens seguem para a execução.
    const grouped = await availabilityItems(tenantA, sessionId);
    expect(grouped.map((item) => item.status)).toEqual(["PENDING", "PENDING"]);

    const result = await execute(
      tenantA,
      sessionId,
      reader,
      preview.previewVersion,
    );

    expect(await gridOf(tenantA)).toEqual(weekdayGrid(SOURCE_GRID));
    const final = await availabilityItems(tenantA, sessionId);
    expect(final.map((item) => item.status)).toEqual(["IMPORTED", "IMPORTED"]);
    expect(
      result.categories.find((entry) => entry.category === "AVAILABILITY"),
    ).toMatchObject({ imported: 2, failed: 0, needsReview: 0 });
    // O outro negócio não enxerga nem sofre a troca.
    expect(await ruleIds(tenantB)).toEqual(tenantBBefore);
    expect(await gridOf(tenantB)).toEqual(weekdayGrid([["10:00", "16:00"]]));
  });

  it("EXCLUDE de item mantém a grade vigente: a final é 09–18", async () => {
    await seedTenant(tenantA, weekdayGrid([["09:00", "18:00"]]));
    const before = await ruleIds(tenantA);
    const { sessionId, preview, reader } = await analyzedSession(tenantA);
    const items = await availabilityItems(tenantA, sessionId);
    const employee = items.find((item) => item.externalId !== "company")!;

    const decided = await decide(
      tenantA,
      sessionId,
      employee.id,
      "EXCLUDE",
      "wu03-exclude",
    );
    expect(decided.statusCode).toBe(200);

    await execute(tenantA, sessionId, reader, preview.previewVersion);

    expect(await ruleIds(tenantA)).toEqual(before);
    expect(await gridOf(tenantA)).toEqual(weekdayGrid([["09:00", "18:00"]]));
    const final = await availabilityItems(tenantA, sessionId);
    expect(final.map((item) => item.status)).toEqual(["SKIPPED", "SKIPPED"]);
  });

  it("IMPORT_ALL e decisão de categoria não trocam a grade", async () => {
    await seedTenant(tenantA, weekdayGrid([["09:00", "18:00"]]));
    const before = await ruleIds(tenantA);
    const { sessionId, preview, reader } = await analyzedSession(tenantA);

    // Decisão de sessão e de categoria gravadas como a trilha as gravaria,
    // mais a seleção da categoria: nenhuma delas confirma a troca.
    await prisma.importDecision.createMany({
      data: [
        {
          tenantId: tenantA,
          sessionId,
          scope: "SESSION",
          decision: "IMPORT_ALL",
          previewVersion: preview.previewVersion,
          decidedBy: "owner-1",
        },
        {
          tenantId: tenantA,
          sessionId,
          scope: "CATEGORY",
          decision: "INCLUDE",
          category: "AVAILABILITY",
          previewVersion: preview.previewVersion,
          decidedBy: "owner-1",
        },
      ],
    });
    await new ImportPreviewService(prisma).setCategorySelection(
      { tenantId: tenantA, sessionId },
      "AVAILABILITY",
      true,
    );

    await execute(tenantA, sessionId, reader, preview.previewVersion);

    expect(await ruleIds(tenantA)).toEqual(before);
    expect(await gridOf(tenantA)).toEqual(weekdayGrid([["09:00", "18:00"]]));
    const final = await availabilityItems(tenantA, sessionId);
    expect(final.every((item) => item.status === "NEEDS_REVIEW")).toBe(true);
  });

  it("IMPORT_ALL e decisão de categoria não confirmam a troca nem quando os itens chegam à execução", async () => {
    // Sem horário na análise, os itens nascem PENDING e seguem para a
    // execução. O horário criado depois da análise só pode ser trocado por
    // INCLUDE de item: "Importar tudo" nunca apaga a grade vigente.
    await seedTenant(tenantA, []);
    const { sessionId, preview, reader } = await analyzedSession(tenantA);
    expect(
      (await availabilityItems(tenantA, sessionId)).map((item) => item.status),
    ).toEqual(["PENDING", "PENDING"]);
    await prisma.importDecision.createMany({
      data: [
        {
          tenantId: tenantA,
          sessionId,
          scope: "SESSION",
          decision: "IMPORT_ALL",
          previewVersion: preview.previewVersion,
          decidedBy: "owner-1",
        },
        {
          tenantId: tenantA,
          sessionId,
          scope: "CATEGORY",
          decision: "INCLUDE",
          category: "AVAILABILITY",
          previewVersion: preview.previewVersion,
          decidedBy: "owner-1",
        },
      ],
    });
    await prisma.availabilityRule.createMany({
      data: WEEKDAYS.map((dayOfWeek) => ({
        tenantId: tenantA,
        dayOfWeek,
        startTime: databaseTime("09:00"),
        endTime: databaseTime("18:00"),
        active: true,
      })),
    });
    const before = await ruleIds(tenantA);

    await execute(tenantA, sessionId, reader, preview.previewVersion);

    expect(await ruleIds(tenantA)).toEqual(before);
    expect(await gridOf(tenantA)).toEqual(weekdayGrid([["09:00", "18:00"]]));
    const final = await availabilityItems(tenantA, sessionId);
    expect(final.map((item) => [item.status, item.reasonCode])).toEqual([
      ["FAILED", "AVAILABILITY_CHANGED_SINCE_ANALYSIS"],
      ["FAILED", "AVAILABILITY_CHANGED_SINCE_ANALYSIS"],
    ]);
  });

  it("regra criada depois da análise faz o item terminar FAILED com AVAILABILITY_CHANGED_SINCE_ANALYSIS, sem gravar", async () => {
    await seedTenant(tenantA, []);
    const { sessionId, preview, reader } = await analyzedSession(tenantA);
    const analyzed = await availabilityItems(tenantA, sessionId);
    // Sem horário ativo na análise: pendentes como sempre.
    expect(analyzed.map((item) => [item.status, item.reasonCode])).toEqual([
      ["PENDING", null],
      ["PENDING", null],
    ]);

    await prisma.availabilityRule.create({
      data: {
        tenantId: tenantA,
        dayOfWeek: 1,
        startTime: databaseTime("10:00"),
        endTime: databaseTime("11:00"),
        active: true,
      },
    });
    const before = await ruleIds(tenantA);

    await execute(tenantA, sessionId, reader, preview.previewVersion);

    expect(await ruleIds(tenantA)).toEqual(before);
    expect(await gridOf(tenantA)).toEqual([
      { dayOfWeek: 1, startTime: "10:00", endTime: "11:00" },
    ]);
    const final = await availabilityItems(tenantA, sessionId);
    expect(final.map((item) => [item.status, item.reasonCode])).toEqual([
      ["FAILED", "AVAILABILITY_CHANGED_SINCE_ANALYSIS"],
      ["FAILED", "AVAILABILITY_CHANGED_SINCE_ANALYSIS"],
    ]);
    const maps = await prisma.externalEntityMap.count({
      where: { tenantId: tenantA, entityType: "AVAILABILITY" },
    });
    expect(maps).toBe(0);
  });

  it("negócio sem horário ativo continua importando a grade da origem", async () => {
    await seedTenant(tenantA, []);
    const { sessionId, preview, reader } = await analyzedSession(tenantA);

    await execute(tenantA, sessionId, reader, preview.previewVersion);

    expect(await gridOf(tenantA)).toEqual(weekdayGrid(SOURCE_GRID));
  });

  it("grade da origem que se sobrepõe é classificada com código próprio e nunca é gravada, nem com INCLUDE", async () => {
    await seedTenant(tenantA, weekdayGrid([["09:00", "18:00"]]));
    const before = await ruleIds(tenantA);
    const { sessionId, preview, reader } = await analyzedSession(tenantA, [
      ["08:00", "12:00"],
      ["11:00", "14:00"],
    ]);
    const items = await availabilityItems(tenantA, sessionId);
    expect(items.map((item) => [item.status, item.reasonCode])).toEqual([
      ["NEEDS_REVIEW", "AVAILABILITY_SOURCE_OVERLAP"],
      ["NEEDS_REVIEW", "AVAILABILITY_SOURCE_OVERLAP"],
    ]);
    expect(items.every((item) => item.proposedAvailability === null)).toBe(
      true,
    );

    const decided = await decide(
      tenantA,
      sessionId,
      items[0].id,
      "INCLUDE",
      "wu03-overlap-include",
    );
    expect(decided.statusCode).toBe(200);
    await execute(tenantA, sessionId, reader, preview.previewVersion);

    expect(await ruleIds(tenantA)).toEqual(before);
    const final = await availabilityItems(tenantA, sessionId);
    expect(final.map((item) => [item.status, item.reasonCode])).toEqual([
      ["FAILED", "AVAILABILITY_SOURCE_OVERLAP"],
      ["FAILED", "AVAILABILITY_SOURCE_OVERLAP"],
    ]);
  });

  it("a leitura dos itens de conflito devolve a grade vigente e a proposta, por dia, só em AVAILABILITY", async () => {
    await seedTenant(tenantA, weekdayGrid([["09:00", "18:00"]]));
    await seedTenant(tenantB, weekdayGrid([["10:00", "16:00"]]));
    const { sessionId } = await analyzedSession(tenantA);

    const response = await app.inject({
      method: "GET",
      url: `/internal/calendar/imports/${sessionId}/categories/AVAILABILITY/items?status=NEEDS_REVIEW`,
      headers: headers(tenantA),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: {
        items: Array<{
          currentAvailability: GridRule[];
          proposedAvailability: GridRule[] | null;
        }>;
      };
    };
    expect(body.data.items).toHaveLength(2);
    for (const item of body.data.items) {
      expect(item.currentAvailability).toEqual(
        weekdayGrid([["09:00", "18:00"]]),
      );
      expect(item.proposedAvailability).toEqual(weekdayGrid(SOURCE_GRID));
    }

    const other = await app.inject({
      method: "GET",
      url: `/internal/calendar/imports/${sessionId}/categories/SERVICE/items`,
      headers: headers(tenantA),
    });
    expect(other.statusCode).toBe(200);
    expect(JSON.stringify(other.json())).not.toContain("currentAvailability");
  });

  it("PATCH /internal/availability-settings se comporta como antes", async () => {
    await seedTenant(tenantA, weekdayGrid([["09:00", "18:00"]]));
    const patch = (rules: unknown[]) =>
      app.inject({
        method: "PATCH",
        url: "/internal/availability-settings",
        headers: headers(tenantA),
        payload: { timezone: timeZone, rules },
      });

    const overlap = await patch([
      { dayOfWeek: 1, startTime: "08:00", endTime: "12:00", active: true },
      { dayOfWeek: 1, startTime: "11:00", endTime: "14:00", active: true },
    ]);
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json().error.code).toBe("AVAILABILITY_OVERLAP");

    const inverted = await patch([
      { dayOfWeek: 1, startTime: "12:00", endTime: "08:00", active: true },
    ]);
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json().error.code).toBe("INVALID_AVAILABILITY_RANGE");
    expect(await gridOf(tenantA)).toEqual(weekdayGrid([["09:00", "18:00"]]));

    const replaced = await patch([
      { dayOfWeek: 2, startTime: "08:00", endTime: "12:00", active: true },
      { dayOfWeek: 2, startTime: "12:00", endTime: "17:00", active: true },
    ]);
    expect(replaced.statusCode).toBe(200);
    expect(await gridOf(tenantA)).toEqual([
      { dayOfWeek: 2, startTime: "08:00", endTime: "12:00" },
      { dayOfWeek: 2, startTime: "12:00", endTime: "17:00" },
    ]);
  });
});
