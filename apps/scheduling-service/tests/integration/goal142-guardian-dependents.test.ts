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
import { registerCalendarRoutes } from "../../src/modules/calendar/routes.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal142, WU-01 contra PostgreSQL real: `GET /internal/customers/dependents`
 * e `includeDependents` em `GET /internal/appointments`.
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

const tenantA = "goal142-tenant-a";
const tenantB = "goal142-tenant-b";
const timeZone = "America/Sao_Paulo";
const GUARDIAN_PHONE = "5511987654321";

let prisma: PrismaClient;
let app: FastifyInstance;

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
    "x-request-id": "req-goal142",
    "content-type": "application/json",
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  await registerManagementRoutes(instance, prisma);
  await registerCalendarRoutes(instance);
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
  name: string,
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

async function book(
  tenantId: string,
  customerId: string,
  startAt: Date,
): Promise<void> {
  await prisma.appointment.create({
    data: {
      tenantId,
      customerId,
      source: "USER",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "CONFIRMED",
      statusRaw: "CONFIRMED",
      title: "Corte",
      createdBy: "user-1",
    },
  });
}

async function dependents(tenantId: string, phone: string) {
  const response = await app.inject({
    method: "GET",
    url: `/internal/customers/dependents?phone=${encodeURIComponent(phone)}`,
    headers: headers(tenantId),
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.items as Array<{
    id: string;
    name: string | null;
    phone: string | null;
    guardian: { id: string; name: string | null };
  }>;
}

async function listAppointments(
  tenantId: string,
  query: string,
): Promise<string[]> {
  const response = await app.inject({
    method: "GET",
    url: `/internal/appointments?startDate=2026-10-20&endDate=2026-10-20&${query}`,
    headers: headers(tenantId),
  });
  expect(response.statusCode).toBe(200);
  return (
    response.json().data as Array<{ customer?: { id: string } | null }>
  ).map((item) => (item.customer as { id: string }).id);
}

describeWithDatabase("goal142 guardian dependents against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
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
  });

  afterEach(async () => {
    await app.close();
  });

  it("devolve o dependente confirmado sem telefone, com o responsável", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const pedro = await createCustomer(tenantA, "Pedro");
    await relate(tenantA, pedro, maria, "CONFIRMED");

    // Forma do número diferente da gravada: mesma normalização dos candidatos.
    expect(await dependents(tenantA, "(11) 98765-4321")).toEqual([
      {
        id: pedro,
        name: "Pedro",
        phone: null,
        guardian: { id: maria, name: "Maria" },
      },
    ]);
  });

  it("exclui relação PROPOSED, relação removida, outro telefone e outro tenant; telefone sem candidato devolve lista vazia", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const ana = await createCustomer(tenantA, "Ana", "5511955550000");
    const confirmado = await createCustomer(tenantA, "Confirmado");
    const proposto = await createCustomer(tenantA, "Proposto");
    const removido = await createCustomer(tenantA, "Removido");
    const filhoDaAna = await createCustomer(tenantA, "Filho da Ana");
    await relate(tenantA, confirmado, maria, "CONFIRMED");
    await relate(tenantA, proposto, maria, "PROPOSED");
    await relate(tenantA, removido, maria, "CONFIRMED");
    await relate(tenantA, filhoDaAna, ana, "CONFIRMED");
    await prisma.customerRelation.deleteMany({
      where: { tenantId: tenantA, customerId: removido },
    });
    const mariaB = await createCustomer(tenantB, "Maria B", GUARDIAN_PHONE);
    const filhoB = await createCustomer(tenantB, "Filho B");
    await relate(tenantB, filhoB, mariaB, "CONFIRMED");

    expect((await dependents(tenantA, GUARDIAN_PHONE)).map((i) => i.id)).toEqual(
      [confirmado],
    );
    expect((await dependents(tenantB, GUARDIAN_PHONE)).map((i) => i.id)).toEqual(
      [filhoB],
    );
    expect(await dependents(tenantA, "5511900000000")).toEqual([]);
  });

  it("dependente que também é candidato do número aparece uma vez", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const filha = await createCustomer(tenantA, "Filha", GUARDIAN_PHONE);
    await relate(tenantA, filha, maria, "CONFIRMED");

    const items = await dependents(tenantA, GUARDIAN_PHONE);
    expect(items.map((item) => item.id)).toEqual([filha]);
  });

  it("dois responsáveis no mesmo número: cada dependente com o seu responsável", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const marta = await createCustomer(tenantA, "Marta", GUARDIAN_PHONE);
    const pedro = await createCustomer(tenantA, "Pedro");
    const lia = await createCustomer(tenantA, "Lia");
    await relate(tenantA, pedro, maria, "CONFIRMED");
    await relate(tenantA, lia, marta, "CONFIRMED");

    const items = await dependents(tenantA, GUARDIAN_PHONE);
    expect(items.map((item) => [item.id, item.guardian.id])).toEqual([
      [lia, marta],
      [pedro, maria],
    ]);
  });

  it("GET /internal/customers/:id continua igual e dependents nunca vira id", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const response = await app.inject({
      method: "GET",
      url: `/internal/customers/${maria}`,
      headers: headers(tenantA),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      id: maria,
      name: "Maria",
      primaryGuardian: null,
    });
    // Sem `phone`, a rota estática recusa o pedido; um `:id` igual a
    // "dependents" responderia 404 `CUSTOMER_NOT_FOUND`.
    const bare = await app.inject({
      method: "GET",
      url: "/internal/customers/dependents",
      headers: headers(tenantA),
    });
    expect(bare.statusCode).not.toBe(404);
    expect(bare.json().error?.code).not.toBe("CUSTOMER_NOT_FOUND");
  });

  it("includeDependents: sem a flag a lista é a de hoje; com a flag traz o confirmado e não o PROPOSED; outro tenant fica de fora", async () => {
    const maria = await createCustomer(tenantA, "Maria", GUARDIAN_PHONE);
    const pedro = await createCustomer(tenantA, "Pedro");
    const proposto = await createCustomer(tenantA, "Proposto");
    await relate(tenantA, pedro, maria, "CONFIRMED");
    await relate(tenantA, proposto, maria, "PROPOSED");
    const mariaB = await createCustomer(tenantB, "Maria B", GUARDIAN_PHONE);
    const filhoB = await createCustomer(tenantB, "Filho B");
    await relate(tenantB, filhoB, mariaB, "CONFIRMED");
    const start = new Date("2026-10-20T13:00:00.000Z");
    await book(tenantA, maria, start);
    await book(tenantA, pedro, new Date(start.getTime() + 60 * 60_000));
    await book(tenantA, proposto, new Date(start.getTime() + 120 * 60_000));
    await book(tenantB, filhoB, new Date(start.getTime() + 180 * 60_000));

    const phone = `customerPhone=${GUARDIAN_PHONE}`;
    expect(await listAppointments(tenantA, phone)).toEqual([maria]);
    expect(
      await listAppointments(tenantA, `${phone}&includeDependents=false`),
    ).toEqual([maria]);
    expect(
      await listAppointments(tenantA, `${phone}&includeDependents=true`),
    ).toEqual([maria, pedro]);
  });
});
