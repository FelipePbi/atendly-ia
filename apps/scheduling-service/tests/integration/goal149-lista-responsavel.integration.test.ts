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
  vi,
} from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal149, WU-01 contra PostgreSQL real: `GET /internal/customers` traz o
 * responsável confirmado de cada cliente e os dependentes confirmados de cada
 * responsável, numa só consulta de relações, sem vazar entre negócios.
 */

const holder = vi.hoisted(() => ({ prisma: null as unknown }));

vi.mock("../../src/infrastructure/database/prisma.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/infrastructure/database/prisma.js")
    >();
  return { ...actual, getPrisma: () => holder.prisma };
});

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal149-tenant-a";
const tenantB = "goal149-tenant-b";
const timeZone = "America/Sao_Paulo";
const GUARDIAN_PHONE = "5511987654321";

let prisma: PrismaClient;
let app: FastifyInstance;
let relationQueries: string[] = [];

const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

function headers(tenantId: string) {
  return {
    authorization: `Bearer ${bffToken}`,
    "x-tenant-id": tenantId,
    "x-user-id": "owner-1",
    "x-request-id": "req-goal149",
    "content-type": "application/json",
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  await registerManagementRoutes(instance, prisma);
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

async function seedTenant(tenantId: string): Promise<void> {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
}

async function createCustomer(
  tenantId: string,
  name: string | null,
  phone?: string,
): Promise<string> {
  const customer = await prisma.customer.create({
    data: {
      tenantId,
      name,
      phone: phone ? `+${phone}` : null,
      normalizedPhone: phone ?? null,
    },
  });
  return customer.id;
}

async function relate(
  tenantId: string,
  customerId: string,
  guardianId: string,
  status: "PROPOSED" | "CONFIRMED",
): Promise<void> {
  await prisma.customerRelation.create({
    data: {
      tenantId,
      customerId,
      relatedCustomerId: guardianId,
      type: "PRIMARY_GUARDIAN",
      status,
      proposedBy: "PROFESSIONAL",
      confirmedBy: status === "CONFIRMED" ? "PROFESSIONAL" : null,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
    },
  });
}

interface ListedCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  guardian?: { id: string; name: string | null } | null;
  dependents?: Array<{ id: string; name: string | null }>;
}

async function listCustomers(
  tenantId: string,
  query = "",
): Promise<ListedCustomer[]> {
  const response = await app.inject({
    method: "GET",
    url: `/internal/customers${query}`,
    headers: headers(tenantId),
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.items as ListedCustomer[];
}

describeWithDatabase("goal149 lista com responsável against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      log: [{ emit: "event", level: "query" }],
    });
    prisma.$on("query", (event) => {
      if (/FROM\s+"public"\."CustomerRelation"/iu.test(event.query)) {
        relationQueries.push(event.query);
      }
    });
    holder.prisma = prisma;
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
    app = await buildApp();
    await app.ready();
    relationQueries = [];
  });

  afterEach(async () => {
    await app.close();
  });

  it("traz guardian no dependente e dependents no responsável, só com a relação CONFIRMED", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const pedro = await createCustomer(tenantA, "Pedro");
    const proposto = await createCustomer(tenantA, "Proposto");
    const solo = await createCustomer(tenantA, "Solo", "5511900000000");
    await relate(tenantA, pedro, maria, "CONFIRMED");
    await relate(tenantA, proposto, maria, "PROPOSED");

    const items = await listCustomers(tenantA);
    const byId = new Map(items.map((item) => [item.id, item]));
    expect(byId.get(pedro)?.guardian).toEqual({ id: maria, name: "Maria" });
    expect(byId.get(pedro)?.dependents).toEqual([]);
    expect(byId.get(maria)?.guardian).toBeNull();
    expect(byId.get(maria)?.dependents).toEqual([{ id: pedro, name: "Pedro" }]);
    expect(byId.get(proposto)?.guardian).toBeNull();
    expect(byId.get(solo)?.guardian).toBeNull();
    expect(byId.get(solo)?.dependents).toEqual([]);
  });

  it("depois de remover a relação, nenhum dos dois campos traz a pessoa", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const pedro = await createCustomer(tenantA, "Pedro");
    await relate(tenantA, pedro, maria, "CONFIRMED");
    expect(
      (await listCustomers(tenantA)).find((item) => item.id === pedro)?.guardian,
    ).toEqual({ id: maria, name: "Maria" });

    const removed = await app.inject({
      method: "DELETE",
      url: `/internal/customers/${pedro}/primary-guardian`,
      payload: {},
      headers: headers(tenantA),
    });
    expect(removed.statusCode, removed.body).toBe(200);

    for (const item of await listCustomers(tenantA)) {
      expect(item.guardian).toBeNull();
      expect(item.dependents).toEqual([]);
    }
  });

  it("responsável com dois dependentes: em ordem de nome, o sem nome por último", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const zeca = await createCustomer(tenantA, "Zeca");
    const ana = await createCustomer(tenantA, "Ana");
    const semNome = await createCustomer(tenantA, null);
    for (const dependent of [zeca, semNome, ana]) {
      await relate(tenantA, dependent, maria, "CONFIRMED");
    }

    const guardian = (await listCustomers(tenantA)).find(
      (item) => item.id === maria,
    );
    expect(guardian?.dependents).toEqual([
      { id: ana, name: "Ana" },
      { id: zeca, name: "Zeca" },
      { id: semNome, name: null },
    ]);
  });

  it("faz uma única consulta de relações por lista, de qualquer tamanho", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    for (let index = 0; index < 12; index += 1) {
      const dependent = await createCustomer(tenantA, `Cliente ${index}`);
      await relate(tenantA, dependent, maria, "CONFIRMED");
    }
    relationQueries = [];

    const items = await listCustomers(tenantA);

    expect(items).toHaveLength(13);
    expect(relationQueries).toHaveLength(1);
  });

  it("relação de outro negócio nunca aparece, nem pelo mesmo telefone", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const solo = await createCustomer(tenantA, "Solo");
    const mariaB = await createCustomer(tenantB, "Maria B", GUARDIAN_PHONE);
    const pedroB = await createCustomer(tenantB, "Pedro B");
    await relate(tenantB, pedroB, mariaB, "CONFIRMED");

    const doTenantA = await listCustomers(tenantA);
    expect(doTenantA.map((item) => item.id).sort()).toEqual([maria, solo].sort());
    for (const item of doTenantA) {
      expect(item.guardian).toBeNull();
      expect(item.dependents).toEqual([]);
    }
    const porTelefone = await listCustomers(
      tenantA,
      `?phone=${encodeURIComponent(GUARDIAN_PHONE)}`,
    );
    expect(porTelefone.map((item) => item.id)).toEqual([maria]);
    expect(porTelefone[0]?.dependents).toEqual([]);

    const doTenantB = await listCustomers(tenantB);
    expect(doTenantB.find((item) => item.id === pedroB)?.guardian).toEqual({
      id: mariaB,
      name: "Maria B",
    });
    expect(doTenantB.find((item) => item.id === mariaB)?.dependents).toEqual([
      { id: pedroB, name: "Pedro B" },
    ]);
  });

  it("GET /internal/customers?phone= traz os campos nos candidatos", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const pedro = await createCustomer(tenantA, "Pedro");
    await relate(tenantA, pedro, maria, "CONFIRMED");

    const candidates = await listCustomers(
      tenantA,
      `?phone=${encodeURIComponent(GUARDIAN_PHONE)}`,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe(maria);
    expect(candidates[0]?.guardian).toBeNull();
    expect(candidates[0]?.dependents).toEqual([{ id: pedro, name: "Pedro" }]);
  });
});
