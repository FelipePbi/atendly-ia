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
import { AvenlyCustomerService } from "../../src/modules/customers/avenly-customer-service.js";
import type { MinhaAgendaSourceClient } from "../../src/modules/integrations/minha-agenda/client.js";
import type { MinhaAgendaConnectionConfig } from "../../src/modules/integrations/minha-agenda/config.js";
import { MinhaAgendaImportSourceReader } from "../../src/modules/integrations/minha-agenda/import-source-reader.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import { ImportCompletionService } from "../../src/modules/migrations/import-completion-service.js";
import { ImportExecutionService } from "../../src/modules/migrations/import-execution-service.js";
import { ImportPreviewService } from "../../src/modules/migrations/import-preview-service.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();

// Sem banco declarado, a suíte não inventa um destino: ela é declarada como
// pulada e o gate de integração é quem a executa de verdade.
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "tenant-a";
const tenantB = "tenant-b";

let prisma: PrismaClient;

describeWithDatabase(
  "candidatos por telefone por equivalência (Goal062, WU-02)",
  () => {
    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
      });
      const [database] = await prisma.$queryRaw<
        Array<{ current_database: string }>
      >`SELECT current_database()`;
      // Confirma o destino efetivo antes de escrever qualquer linha.
      expect(database.current_database).toMatch(/test/iu);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    beforeEach(async () => {
      for (const tenantId of [tenantA, tenantB]) {
        await resetTenant(prisma, tenantId);
      }
    });

    it("acha o cliente gravado com o 9º dígito consultando sem ele, e vice-versa", async () => {
      const customers = new AvenlyCustomerService(prisma, tenantA);
      const maria = await customers.create({
        name: "Maria",
        // Celular já com o 9º dígito: forma canônica 5511966665555.
        phone: "5511966665555",
      });

      const foundWithoutNinth = await customers.findCandidatesByPhone(
        "551166665555",
      );
      expect(foundWithoutNinth.map((c) => c.id)).toEqual([maria.id]);

      const foundWithNinth = await customers.findCandidatesByPhone(
        "5511966665555",
      );
      expect(foundWithNinth.map((c) => c.id)).toEqual([maria.id]);
    });

    it("acha uma linha gravada antes do Goal, em dígitos nacionais sem 55", async () => {
      // Simula uma linha antiga: normalizedPhone em forma nacional, sem
      // prefixo de país, como o código gravava antes deste Goal.
      const legacy = await prisma.customer.create({
        data: {
          tenantId: tenantA,
          name: "Cliente Antigo",
          phone: "11966665555",
          normalizedPhone: "11966665555",
        },
      });

      const customers = new AvenlyCustomerService(prisma, tenantA);
      const found = await customers.findCandidatesByPhone("5511966665555");
      expect(found.map((c) => c.id)).toEqual([legacy.id]);
    });

    it("records phone as + followed by the canonical form when the number is recognised", async () => {
      const customers = new AvenlyCustomerService(prisma, tenantA);
      const maria = await customers.create({
        name: "Maria",
        phone: "11966665555",
      });
      const stored = await prisma.customer.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: maria.id } },
      });
      expect(stored.phone).toBe("+5511966665555");
      expect(stored.normalizedPhone).toBe("5511966665555");
    });

    it("does not leak phone-equivalence matches across tenants", async () => {
      const a = new AvenlyCustomerService(prisma, tenantA);
      const b = new AvenlyCustomerService(prisma, tenantB);
      await a.create({ name: "Maria", phone: "5511966665555" });
      await b.create({ name: "Outra Maria", phone: "5511966665555" });

      const foundInA = await a.findCandidatesByPhone("551166665555");
      const foundInB = await b.findCandidatesByPhone("551166665555");
      expect(foundInA).toHaveLength(1);
      expect(foundInB).toHaveLength(1);
      expect(foundInA[0]?.id).not.toBe(foundInB[0]?.id);
    });
  },
);

// ---------------------------------------------------------------------------
// Pela rota que a IA usa: GET /internal/customers?phone= (Goal062 §7.1).
// ---------------------------------------------------------------------------

const routeTenantA = "goal062-phone-route-a";
const routeTenantB = "goal062-phone-route-b";
const timeZone = "America/Sao_Paulo";
const snapshotInput = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  referenceDate: "2026-09-10",
};

// A IA chama esta rota com a credencial dela e o número vindo do JID.
const aiToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "ai-orchestrator",
  SERVICE_AUDIENCE,
  "command",
);

let app: FastifyInstance;

/** Dublê da origem: só a listagem de clientes tem registros. */
class DirectoryOnlySourceClient implements MinhaAgendaSourceClient {
  constructor(private readonly customers: Array<Record<string, unknown>>) {}
  async listServices() {
    return [];
  }
  async listCustomers() {
    return this.customers as never;
  }
  async findAppointmentsByDateRange() {
    return [];
  }
  async getCompanyWorkSchedule() {
    return {};
  }
  async getEmployeeWorkScheduleByEmployeeId() {
    return {};
  }
}

function sourceConfig(tenantId: string): MinhaAgendaConnectionConfig {
  return {
    tenantId,
    baseUrl: "https://minha-agenda.example.invalid",
    basicAuth: "Basic abc",
    username: "user",
    password: "secret",
    employeeId: 7,
    timeoutMs: 1_000,
    refreshSkewSeconds: 300,
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  await registerManagementRoutes(instance, prisma, {
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

async function seedCalendar(tenantId: string) {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
}

/** Importa a listagem de clientes pela análise e pela execução reais. */
async function importCustomers(
  tenantId: string,
  customers: Array<Record<string, unknown>>,
) {
  const reader = new MinhaAgendaImportSourceReader(
    sourceConfig(tenantId),
    new DirectoryOnlySourceClient(customers),
  );
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
  await new ImportExecutionService(prisma).execute(
    { tenantId, sessionId: session.sessionId, userId: "owner-1" },
    reader,
    snapshotInput,
    { previewVersion: preview.previewVersion },
  );
}

async function searchByPhone(tenantId: string, phone: string) {
  const response = await app.inject({
    method: "GET",
    url: `/internal/customers?phone=${encodeURIComponent(phone)}`,
    headers: {
      authorization: `Bearer ${aiToken}`,
      "x-tenant-id": tenantId,
      "x-user-id": "ai-orchestrator",
      "x-request-id": "req-goal062-phone-route",
    },
  });
  expect(response.statusCode).toBe(200);
  const body = response.json() as {
    data: { items: Array<{ id: string; name: string; phone: string | null }> };
  };
  return body.data.items;
}

describeWithDatabase(
  "GET /internal/customers?phone= acha cliente importado com DDD 55 (Goal062 §7.1)",
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
      await resetTenant(prisma, routeTenantA);
      await resetTenant(prisma, routeTenantB);
      await prisma?.$disconnect();
    });

    beforeEach(async () => {
      await resetTenant(prisma, routeTenantA);
      await resetTenant(prisma, routeTenantB);
      await seedCalendar(routeTenantA);
      await seedCalendar(routeTenantB);
      app = await buildApp();
    });

    afterEach(async () => {
      await app.close();
    });

    it("cliente importado com 55 + DDD 55 + 9 dígitos é achado com 5555<8 dígitos> e com 55559<8 dígitos>", async () => {
      await importCustomers(routeTenantA, [
        // 55 do país + DDD 55 + celular de 9 dígitos.
        { id: 1, name: "Dona Rosa", phone1: "5555999990001" },
        // A forma que a origem entrega na QA IM-10: DDD 55 sem o 55 do país.
        { id: 2, name: "Seu Pedro", phone1: "55999990002" },
      ]);

      const rosa = await prisma.customer.findFirstOrThrow({
        where: { tenantId: routeTenantA, name: "Dona Rosa" },
      });
      expect(rosa.phone).toBe("+5555999990001");
      expect(rosa.normalizedPhone).toBe("5555999990001");
      const pedro = await prisma.customer.findFirstOrThrow({
        where: { tenantId: routeTenantA, name: "Seu Pedro" },
      });
      expect(pedro.phone).toBe("+5555999990002");
      expect(pedro.normalizedPhone).toBe("5555999990002");

      // Sem o 9º dígito, como o JID de celular antigo chega.
      expect(
        (await searchByPhone(routeTenantA, "555599990001")).map((c) => c.id),
      ).toEqual([rosa.id]);
      // Com o 9º dígito.
      expect(
        (await searchByPhone(routeTenantA, "5555999990001")).map((c) => c.id),
      ).toEqual([rosa.id]);
      expect(
        (await searchByPhone(routeTenantA, "555599990002")).map((c) => c.id),
      ).toEqual([pedro.id]);
      expect(
        (await searchByPhone(routeTenantA, "5555999990002")).map((c) => c.id),
      ).toEqual([pedro.id]);
    });

    it("cliente gravado antes deste Goal, com dígitos nacionais, também é achado pela rota", async () => {
      const legacy = await prisma.customer.create({
        data: {
          tenantId: routeTenantA,
          name: "Cliente Antiga",
          phone: "55999990003",
          normalizedPhone: "55999990003",
        },
      });

      expect(
        (await searchByPhone(routeTenantA, "555599990003")).map((c) => c.id),
      ).toEqual([legacy.id]);
      expect(
        (await searchByPhone(routeTenantA, "5555999990003")).map((c) => c.id),
      ).toEqual([legacy.id]);

      // Linha antiga com o 55 do país e sem o 9º dígito, como o JID de um
      // celular antigo: a busca com o 9º dígito também a acha.
      const legacyWithoutNinth = await prisma.customer.create({
        data: {
          tenantId: routeTenantA,
          name: "Cliente Antiga Sem Nono",
          phone: "555599990004",
          normalizedPhone: "555599990004",
        },
      });
      expect(
        (await searchByPhone(routeTenantA, "5555999990004")).map((c) => c.id),
      ).toEqual([legacyWithoutNinth.id]);
      expect(
        (await searchByPhone(routeTenantA, "555599990004")).map((c) => c.id),
      ).toEqual([legacyWithoutNinth.id]);
    });

    it("outro negócio não enxerga o cliente importado como candidato", async () => {
      await importCustomers(routeTenantA, [
        { id: 1, name: "Dona Rosa", phone1: "5555999990001" },
      ]);

      expect(await searchByPhone(routeTenantB, "555599990001")).toEqual([]);
      expect(await searchByPhone(routeTenantB, "5555999990001")).toEqual([]);
      expect(await searchByPhone(routeTenantA, "555599990001")).toHaveLength(1);
    });
  },
);
