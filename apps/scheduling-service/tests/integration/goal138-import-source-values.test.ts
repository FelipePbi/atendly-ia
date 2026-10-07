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
 * Goal138 (WU-01) contra PostgreSQL real: valor malformado da origem não
 * derruba a rota de itens nem a execução. A rota relê o `proposedService`
 * gravado por uma análise anterior ao Goal com a regra do contrato, e a
 * execução importa serviço e atendimento com duração fracionária e preço
 * negativo.
 *
 * A origem é um leitor de teste: nenhum teste chama a Minha Agenda real.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal138-wu01-tenant-a";
const timeZone = "America/Sao_Paulo";
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-09-10",
};

const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

let prisma: PrismaClient;
let app: FastifyInstance;
let work: ImportBackgroundWork;

// ---------------------------------------------------------------------------
// Origem de teste.
// ---------------------------------------------------------------------------

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

function buildSnapshot(
  services: Records,
  customers: Records = [],
  futureAppointments: Records = [],
) {
  return {
    generatedAt: "2026-10-07T12:00:00.000Z",
    services: category("SERVICE", services),
    customers: category("CUSTOMER", customers),
    availability: category("AVAILABILITY"),
    timeBlocks: category("TIME_BLOCK"),
    futureAppointments: category("FUTURE_APPOINTMENT", futureAppointments),
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

function headers(tenantId: string) {
  return {
    authorization: `Bearer ${bffToken}`,
    "x-tenant-id": tenantId,
    "x-user-id": "owner-1",
    "x-request-id": "req-goal138-wu01",
    "content-type": "application/json",
  };
}

async function seedTenant(tenantId: string): Promise<void> {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
}

async function analyzedSession(snapshot: ReturnType<typeof buildSnapshot>) {
  const session = await new ImportCompletionService(prisma).startSession({
    tenantId: tenantA,
    userId: "owner-1",
    sourceAccountId: "account-1",
    sourceAccountLabel: "Salao da Ana",
  });
  const reader = new FixtureReader(snapshot);
  await new ImportPreviewService(prisma).analyze(
    { tenantId: tenantA, sessionId: session.sessionId },
    reader,
    snapshotInput,
  );
  return { sessionId: session.sessionId, reader };
}

interface ItemBody {
  id: string;
  externalId: string;
  status: string;
  reasonCode: string | null;
  proposedService?: {
    durationMinutes: unknown;
    priceType: unknown;
    price: unknown;
  } | null;
}

async function listItems(
  sessionId: string,
  itemCategory: string,
): Promise<ItemBody[]> {
  const response = await app.inject({
    method: "GET",
    url: `/internal/calendar/imports/${sessionId}/categories/${itemCategory}/items`,
    headers: headers(tenantA),
  });
  expect(response.statusCode).toBe(200);
  return (response.json() as { data: { items: ItemBody[] } }).data.items;
}

/**
 * A regra de `importProposedServiceSchema` (contrato), campo a campo: o
 * Scheduling não importa o pacote do contrato.
 */
function expectContractShape(
  proposed: NonNullable<ItemBody["proposedService"]>,
) {
  const { durationMinutes, priceType, price } = proposed;
  if (durationMinutes !== null) {
    expect(typeof durationMinutes).toBe("number");
    expect(Number.isInteger(durationMinutes)).toBe(true);
    expect(durationMinutes as number).toBeGreaterThan(0);
  }
  expect(["FIXED", "STARTING_AT", "ON_REQUEST", "NOT_INFORMED"]).toContain(
    priceType,
  );
  if (price !== null) {
    expect(typeof price).toBe("number");
    expect(Number.isFinite(price)).toBe(true);
    expect(price as number).toBeGreaterThanOrEqual(0);
    expect(priceType).toBe("FIXED");
  }
}

describeWithDatabase(
  "goal138 import source values against PostgreSQL",
  () => {
    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
      });
      const [database] = await prisma.$queryRaw<
        Array<{ current_database: string }>
      >`SELECT current_database()`;
      expect(database.current_database).toMatch(/test/iu);
    });

    afterAll(async () => {
      await resetTenant(prisma, tenantA);
      await prisma?.$disconnect();
    });

    beforeEach(async () => {
      await resetTenant(prisma, tenantA);
      await seedTenant(tenantA);
      work = new ImportBackgroundWork();
      app = await buildApp();
    });

    afterEach(async () => {
      await app.close();
    });

    it("a rota devolve null/NOT_INFORMED/null para um proposedService gravado à força como {47.5, FIXED, -10}", async () => {
      const { sessionId } = await analyzedSession(
        buildSnapshot([
          {
            externalId: "svc-1",
            raw: { name: "Corte", duration: 45, price: 80 },
          },
          {
            externalId: "svc-2",
            raw: { name: "Barba", duration: 20, price: 30 },
          },
        ]),
      );
      // A forma que uma análise anterior ao Goal138 gravava, sem migration
      // nem backfill: o JSON é escrito direto no item.
      const forced = await prisma.importItem.findFirstOrThrow({
        where: { tenantId: tenantA, sessionId, externalId: "svc-1" },
      });
      await prisma.importItem.update({
        where: { tenantId_id: { tenantId: tenantA, id: forced.id } },
        data: {
          proposedService: {
            durationMinutes: 47.5,
            priceType: "FIXED",
            price: -10,
          },
        },
      });

      const items = await listItems(sessionId, "SERVICE");
      const corte = items.find((item) => item.externalId === "svc-1")!;
      const barba = items.find((item) => item.externalId === "svc-2")!;
      expect(corte.proposedService).toEqual({
        durationMinutes: null,
        priceType: "NOT_INFORMED",
        price: null,
      });
      // Os outros itens da mesma página não mudam.
      expect(barba.proposedService).toEqual({
        durationMinutes: 20,
        priceType: "FIXED",
        price: 30,
      });
      for (const item of items) expectContractShape(item.proposedService!);
    });

    it("cada campo é lido por si: duração inteira com preço negativo, e preço bom com duração fracionária", async () => {
      const { sessionId } = await analyzedSession(
        buildSnapshot([
          { externalId: "a", raw: { name: "A", duration: 30, price: 10 } },
          { externalId: "b", raw: { name: "B", duration: 30, price: 10 } },
          { externalId: "c", raw: { name: "C", duration: 30, price: 10 } },
        ]),
      );
      const forced: Record<string, unknown> = {
        a: { durationMinutes: 30, priceType: "FIXED", price: -0.01 },
        b: { durationMinutes: 47.5, priceType: "FIXED", price: 25 },
        c: { durationMinutes: 0, priceType: "NOT_INFORMED", price: 15 },
      };
      for (const [externalId, proposedService] of Object.entries(forced)) {
        await prisma.importItem.updateMany({
          where: { tenantId: tenantA, sessionId, externalId },
          data: { proposedService: proposedService as never },
        });
      }

      const items = await listItems(sessionId, "SERVICE");
      const byId = (externalId: string) =>
        items.find((item) => item.externalId === externalId)!.proposedService;
      expect(byId("a")).toEqual({
        durationMinutes: 30,
        priceType: "NOT_INFORMED",
        price: null,
      });
      expect(byId("b")).toEqual({
        durationMinutes: null,
        priceType: "FIXED",
        price: 25,
      });
      expect(byId("c")).toEqual({
        durationMinutes: null,
        priceType: "NOT_INFORMED",
        price: null,
      });
      for (const item of items) expectContractShape(item.proposedService!);
    });

    it("a análise grava proposedService aceito pelo contrato e a execução importa os dois serviços", async () => {
      const { sessionId, reader } = await analyzedSession(
        buildSnapshot([
          {
            externalId: "900",
            raw: {
              id: 900,
              name: "Corte",
              duration: 47.5,
              price: 50,
              colorId: null,
              deleted: false,
            },
          },
          {
            externalId: "901",
            raw: {
              id: 901,
              name: "Barba",
              duration: 30,
              price: -10,
              colorId: null,
              deleted: false,
            },
          },
        ]),
      );

      const analyzed = await listItems(sessionId, "SERVICE");
      expect(analyzed).toHaveLength(2);
      for (const item of analyzed) expectContractShape(item.proposedService!);
      const corteItem = analyzed.find((item) => item.externalId === "900")!;
      expect(corteItem.reasonCode).toBe("SERVICE_DURATION_MISSING");
      expect(corteItem.status).toBe("NEEDS_REVIEW");

      // Incluir decidido pela pessoa: o item em revisão volta a PENDING.
      await prisma.importItem.updateMany({
        where: { tenantId: tenantA, sessionId, status: "NEEDS_REVIEW" },
        data: { status: "PENDING" },
      });
      await new ImportExecutionService(prisma).execute(
        { tenantId: tenantA, sessionId, userId: "owner-1" },
        reader,
        snapshotInput,
        { previewVersion: 1 },
      );

      const statuses = await prisma.importItem.findMany({
        where: { tenantId: tenantA, sessionId, category: "SERVICE" },
        select: { externalId: true, status: true },
        orderBy: { externalId: "asc" },
      });
      expect(statuses).toEqual([
        { externalId: "900", status: "IMPORTED" },
        { externalId: "901", status: "IMPORTED" },
      ]);
      const corte = await prisma.service.findFirstOrThrow({
        where: { tenantId: tenantA, name: "Corte" },
      });
      expect(corte.durationMinutes).toBeNull();
      expect(corte.reviewOrigin).toBe("IMPORT");
      expect(corte.priceType).toBe("FIXED");
      expect(Number(corte.price)).toBe(50);
      const barba = await prisma.service.findFirstOrThrow({
        where: { tenantId: tenantA, name: "Barba" },
      });
      expect(barba.durationMinutes).toBe(30);
      expect(barba.priceType).toBe("NOT_INFORMED");
      expect(barba.price).toBeNull();
    });

    it("o atendimento com serviço de duração fracionária e preço negativo é importado com retrato nulo e NOT_INFORMED", async () => {
      const service = {
        id: 900,
        name: "Corte",
        duration: 47.5,
        price: -10,
        colorId: null,
        deleted: false,
      };
      const customer = {
        id: 500,
        name: "Ana Souza",
        phone1: "5511999990000",
        phone2: null,
      };
      const { sessionId, reader } = await analyzedSession(
        buildSnapshot(
          [{ externalId: "900", raw: service }],
          [{ externalId: "500", raw: customer }],
          [
            {
              externalId: "100",
              raw: {
                id: 100,
                userId: 7,
                date: "2026-10-20",
                startTime: "09:00",
                endTime: "10:00",
                duration: 47.5,
                customerId: 500,
                customer,
                serviceId: 900,
                service,
                price: -10,
                comments: null,
                deleted: false,
              },
            },
          ],
        ),
      );
      await prisma.importItem.updateMany({
        where: { tenantId: tenantA, sessionId, status: "NEEDS_REVIEW" },
        data: { status: "PENDING" },
      });
      await new ImportExecutionService(prisma).execute(
        { tenantId: tenantA, sessionId, userId: "owner-1" },
        reader,
        snapshotInput,
        { previewVersion: 1 },
      );

      const items = await prisma.importItem.findMany({
        where: { tenantId: tenantA, sessionId },
        select: { category: true, status: true },
      });
      expect(items.map((item) => item.status)).not.toContain("FAILED");
      expect(items.filter((item) => item.status === "IMPORTED")).toHaveLength(3);

      const appointment = await prisma.appointment.findFirstOrThrow({
        where: { tenantId: tenantA },
      });
      // O intervalo usa a duração fracionária do atendimento, não o endTime.
      expect(appointment.endAt.getTime() - appointment.startAt.getTime()).toBe(
        47.5 * 60_000,
      );
      const appointmentItem = await prisma.appointmentItem.findFirstOrThrow({
        where: { tenantId: tenantA, appointmentId: appointment.id },
      });
      expect(appointmentItem.durationMinutesSnapshot).toBeNull();
      expect(appointmentItem.priceTypeSnapshot).toBe("NOT_INFORMED");
      expect(appointmentItem.priceSnapshot).toBeNull();
    });
  },
);
