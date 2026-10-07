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
 * Goal136 (WU-03) contra PostgreSQL real: a rota de itens devolve, em
 * SERVICE e CUSTOMER, os candidatos de correspondência lidos no momento e só
 * do negócio, e em SERVICE os valores propostos pela origem.
 *
 * A origem é um leitor de teste: nenhum teste chama a Minha Agenda real.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal136-wu03-tenant-a";
const tenantB = "goal136-wu03-tenant-b";
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

function buildSnapshot(services: Records, customers: Records) {
  return {
    generatedAt: "2026-10-07T12:00:00.000Z",
    services: category("SERVICE", services),
    customers: category("CUSTOMER", customers),
    availability: category("AVAILABILITY"),
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
    "x-request-id": "req-goal136-wu03",
    "content-type": "application/json",
    ...(key ? { "idempotency-key": key } : {}),
  };
}

async function seedTenant(tenantId: string): Promise<void> {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
}

function seedService(
  tenantId: string,
  data: { name: string; durationMinutes?: number; price?: number },
) {
  return prisma.service.create({
    data: {
      tenantId,
      name: data.name,
      durationMinutes: data.durationMinutes ?? 30,
      priceType: data.price === undefined ? "NOT_INFORMED" : "FIXED",
      price: data.price ?? null,
    },
  });
}

async function analyzedSession(
  tenantId: string,
  services: Records,
  customers: Records = [],
) {
  const session = await new ImportCompletionService(prisma).startSession({
    tenantId,
    userId: "owner-1",
    sourceAccountId: "account-1",
    sourceAccountLabel: "Salao da Ana",
  });
  await new ImportPreviewService(prisma).analyze(
    { tenantId, sessionId: session.sessionId },
    new FixtureReader(buildSnapshot(services, customers)),
    snapshotInput,
  );
  return session.sessionId;
}

interface ServiceCandidate {
  internalId: string;
  name: string;
  durationMinutes: number | null;
  priceType: string;
  price: number | null;
  active: boolean;
}

interface ItemBody {
  id: string;
  externalId: string;
  status: string;
  reasonCode: string | null;
  candidates?: Array<Record<string, unknown>>;
  proposedService?: Record<string, unknown> | null;
  currentAvailability?: unknown;
  proposedAvailability?: unknown;
}

async function listItems(
  tenantId: string,
  sessionId: string,
  itemCategory: string,
): Promise<ItemBody[]> {
  const response = await app.inject({
    method: "GET",
    url: `/internal/calendar/imports/${sessionId}/categories/${itemCategory}/items`,
    headers: headers(tenantId),
  });
  expect(response.statusCode).toBe(200);
  return (response.json() as { data: { items: ItemBody[] } }).data.items;
}

const corteRecord = {
  externalId: "svc-1",
  raw: { name: "Corte", duration: 45, price: 80 },
};

describeWithDatabase(
  "goal136 import items route: candidates and source values against PostgreSQL",
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
      await resetTenant(prisma, tenantB);
      await prisma?.$disconnect();
    });

    beforeEach(async () => {
      await resetTenant(prisma, tenantA);
      await resetTenant(prisma, tenantB);
      await seedTenant(tenantA);
      await seedTenant(tenantB);
      work = new ImportBackgroundWork();
      app = await buildApp();
    });

    afterEach(async () => {
      await app.close();
    });

    it("a migration é aditiva: duas colunas JSON anuláveis em ImportItem", async () => {
      const columns = await prisma.$queryRaw<
        Array<{ column_name: string; data_type: string; is_nullable: string }>
      >`
        SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
         WHERE table_name = 'ImportItem'
           AND column_name IN ('matchCandidateInternalIds', 'proposedService')
         ORDER BY column_name
      `;
      expect(columns).toEqual([
        {
          column_name: "matchCandidateInternalIds",
          data_type: "jsonb",
          is_nullable: "YES",
        },
        {
          column_name: "proposedService",
          data_type: "jsonb",
          is_nullable: "YES",
        },
      ]);
    });

    it("serviço: candidates traz os valores ATUAIS do cadastro e proposedService traz os da origem", async () => {
      const existing = await seedService(tenantA, {
        name: "Corte",
        durationMinutes: 30,
        price: 50,
      });
      const sessionId = await analyzedSession(tenantA, [corteRecord]);

      // Editado depois da análise: a rota mostra o valor novo, não o da análise.
      await prisma.service.update({
        where: { id: existing.id },
        data: { durationMinutes: 40, price: 65, active: false },
      });

      const [item] = await listItems(tenantA, sessionId, "SERVICE");
      expect(item.status).toBe("NEEDS_REVIEW");
      expect(item.reasonCode).toBe("SERVICE_MATCH_DIVERGENT");
      expect(item.candidates).toEqual([
        {
          internalId: existing.id,
          name: "Corte",
          durationMinutes: 40,
          priceType: "FIXED",
          price: 65,
          active: false,
        } satisfies ServiceCandidate,
      ]);
      expect(item.proposedService).toEqual({
        durationMinutes: 45,
        priceType: "FIXED",
        price: 80,
      });
    });

    it("candidato apagado depois da análise é omitido; sem candidato gravado a lista vem vazia", async () => {
      const existing = await seedService(tenantA, { name: "Corte" });
      const sessionId = await analyzedSession(tenantA, [
        corteRecord,
        { externalId: "svc-2", raw: { name: "Barba", duration: 20, price: 0 } },
      ]);
      await prisma.service.delete({ where: { id: existing.id } });

      const items = await listItems(tenantA, sessionId, "SERVICE");
      const corte = items.find((item) => item.externalId === "svc-1")!;
      const barba = items.find((item) => item.externalId === "svc-2")!;
      expect(corte.candidates).toEqual([]);
      expect(barba.candidates).toEqual([]);
      expect(barba.proposedService).toEqual({
        durationMinutes: 20,
        priceType: "NOT_INFORMED",
        price: null,
      });

      // Linha anterior à coluna (NULL): o mesmo que "sem candidato gravado".
      await prisma.$executeRaw`
        UPDATE "ImportItem"
           SET "matchCandidateInternalIds" = NULL, "proposedService" = NULL
         WHERE "tenantId" = ${tenantA} AND "sessionId" = ${sessionId}
      `;
      const legacy = await listItems(tenantA, sessionId, "SERVICE");
      expect(legacy.map((item) => item.candidates)).toEqual([[], []]);
      expect(legacy.map((item) => item.proposedService)).toEqual([null, null]);
    });

    it("isolamento: um ID de outro negócio gravado à força nunca aparece, em SERVICE nem em CUSTOMER", async () => {
      const own = await seedService(tenantA, { name: "Corte" });
      const foreignService = await seedService(tenantB, {
        name: "Corte do outro negócio",
      });
      const foreignCustomer = await prisma.customer.create({
        data: {
          tenantId: tenantB,
          name: "Cliente do outro negócio",
          phone: "+5511999990000",
          normalizedPhone: "5511999990000",
        },
      });
      const sessionId = await analyzedSession(
        tenantA,
        [corteRecord],
        [{ externalId: "cus-1", raw: { name: "Carla" } }],
      );
      await prisma.$executeRaw`
        UPDATE "ImportItem"
           SET "matchCandidateInternalIds" = ${JSON.stringify([
             foreignService.id,
             own.id,
             foreignCustomer.id,
           ])}::jsonb
         WHERE "tenantId" = ${tenantA} AND "sessionId" = ${sessionId}
      `;

      const [service] = await listItems(tenantA, sessionId, "SERVICE");
      expect(service.candidates?.map((c) => c.internalId)).toEqual([own.id]);
      const serialized = JSON.stringify(service);
      expect(serialized).not.toContain(foreignService.id);
      expect(serialized).not.toContain("Corte do outro negócio");

      const [customer] = await listItems(tenantA, sessionId, "CUSTOMER");
      expect(customer.candidates).toEqual([]);
      expect(JSON.stringify(customer)).not.toContain(foreignCustomer.id);
      expect(JSON.stringify(customer)).not.toContain("Cliente do outro negócio");
    });

    it("cliente: o candidato vem só com internalId e name, na ordem gravada, sem proposedService", async () => {
      const first = await prisma.customer.create({
        data: {
          tenantId: tenantA,
          name: "Carla Souza",
          phone: "+5511988887777",
          normalizedPhone: "5511988887777",
        },
      });
      const second = await prisma.customer.create({
        data: {
          tenantId: tenantA,
          name: "Carla Sousa",
          phone: "+5511977776666",
          normalizedPhone: "5511977776666",
        },
      });
      await prisma.customerNote.create({
        data: {
          tenantId: tenantA,
          customerId: first.id,
          body: "alergia a amônia",
          createdBy: "owner-1",
        },
      });
      const sessionId = await analyzedSession(
        tenantA,
        [],
        [{ externalId: "cus-1", raw: { name: "Carla Souza" } }],
      );
      // Ordem gravada: a inversa da criação.
      await prisma.$executeRaw`
        UPDATE "ImportItem"
           SET "matchCandidateInternalIds" = ${JSON.stringify([
             second.id,
             first.id,
           ])}::jsonb
         WHERE "tenantId" = ${tenantA} AND "sessionId" = ${sessionId}
      `;

      const [item] = await listItems(tenantA, sessionId, "CUSTOMER");
      expect(item.candidates).toEqual([
        { internalId: second.id, name: "Carla Sousa" },
        { internalId: first.id, name: "Carla Souza" },
      ]);
      expect(item).not.toHaveProperty("proposedService");
      const serialized = JSON.stringify(item);
      expect(serialized).not.toContain("5511988887777");
      expect(serialized).not.toContain("5511977776666");
      expect(serialized).not.toContain("alergia");
    });

    it("AVAILABILITY e as outras categorias não têm os campos novos", async () => {
      await seedService(tenantA, { name: "Corte" });
      const sessionId = await analyzedSession(tenantA, [corteRecord]);

      for (const other of [
        "AVAILABILITY",
        "TIME_BLOCK",
        "FUTURE_APPOINTMENT",
        "PAST_APPOINTMENT",
      ]) {
        const response = await app.inject({
          method: "GET",
          url: `/internal/calendar/imports/${sessionId}/categories/${other}/items`,
          headers: headers(tenantA),
        });
        expect(response.statusCode).toBe(200);
        const serialized = JSON.stringify(response.json());
        expect(serialized).not.toContain("candidates");
        expect(serialized).not.toContain("proposedService");
      }
    });

    it("AVAILABILITY segue devolvendo a grade vigente e a proposta, como hoje", async () => {
      await prisma.availabilityRule.create({
        data: {
          tenantId: tenantA,
          dayOfWeek: 1,
          startTime: new Date("1970-01-01T09:00:00.000Z"),
          endTime: new Date("1970-01-01T18:00:00.000Z"),
          active: true,
        },
      });
      const sessionId = await analyzedSession(tenantA, []);
      const response = await app.inject({
        method: "GET",
        url: `/internal/calendar/imports/${sessionId}/categories/AVAILABILITY/items`,
        headers: headers(tenantA),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { data: { items: ItemBody[] } };
      for (const item of body.data.items) {
        expect(item.currentAvailability).toEqual([
          { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
        ]);
        expect(item).toHaveProperty("proposedAvailability");
        expect(item).not.toHaveProperty("candidates");
      }
    });

    it("uma consulta de cadastro por página, nunca uma por item", async () => {
      await seedService(tenantA, { name: "Corte" });
      await seedService(tenantA, { name: "Barba" });
      await seedService(tenantA, { name: "Sobrancelha" });
      const sessionId = await analyzedSession(tenantA, [
        corteRecord,
        { externalId: "svc-2", raw: { name: "Barba", duration: 25, price: 30 } },
        {
          externalId: "svc-3",
          raw: { name: "Sobrancelha", duration: 15, price: 20 },
        },
      ]);

      const calls: string[] = [];
      const original = prisma.service.findMany.bind(prisma.service);
      (prisma.service as { findMany: unknown }).findMany = (
        args: Parameters<typeof original>[0],
      ) => {
        calls.push(JSON.stringify(args?.where));
        return original(args);
      };
      try {
        const items = await listItems(tenantA, sessionId, "SERVICE");
        expect(items).toHaveLength(3);
        expect(items.every((item) => item.candidates?.length === 1)).toBe(true);
      } finally {
        (prisma.service as { findMany: unknown }).findMany = original;
      }
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain(tenantA);
    });

    it("KEEP_EXISTING com o internalId de um candidato devolvido funciona como hoje", async () => {
      const existing = await seedService(tenantA, {
        name: "Corte",
        durationMinutes: 30,
        price: 50,
      });
      const sessionId = await analyzedSession(tenantA, [corteRecord]);
      const [item] = await listItems(tenantA, sessionId, "SERVICE");
      const target = item.candidates![0].internalId as string;
      expect(target).toBe(existing.id);

      const decided = await app.inject({
        method: "POST",
        url: `/internal/calendar/imports/${sessionId}/items/${item.id}/decision`,
        headers: headers(tenantA, "goal136-keep-existing"),
        payload: { decision: "KEEP_EXISTING", targetInternalId: target },
      });
      expect(decided.statusCode).toBe(200);

      const stored = await prisma.importItem.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: item.id } },
      });
      expect(stored.status).toBe("IMPORTED");
      expect(stored.internalId).toBe(existing.id);
      expect(stored.entityType).toBe("SERVICE");
      expect(await prisma.service.count({ where: { tenantId: tenantA } })).toBe(
        1,
      );
    });
  },
);
