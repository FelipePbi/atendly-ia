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
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { localDateTimeToInstant } from "../../src/shared/date-time/calendar-date-time.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Faturamento (D-177) contra PostgreSQL real: `GET /internal/revenue` soma só
 * o negócio do cabeçalho, pelo preço gravado no atendimento — mudar o preço
 * do serviço depois não reescreve o mês que passou.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "revenue-tenant-a";
const tenantB = "revenue-tenant-b";
const timeZone = "America/Sao_Paulo";

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
    "x-request-id": "req-revenue",
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

async function seed(tenantId: string, price: string) {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
  const customer = await prisma.customer.create({
    data: { tenantId, name: `Cliente ${tenantId}` },
  });
  const service = await prisma.service.create({
    data: {
      tenantId,
      name: "Cílios 5D",
      durationMinutes: 90,
      priceType: "FIXED",
      price,
      colorToken: "ROSE",
    },
  });
  return { customerId: customer.id, serviceId: service.id };
}

async function appointment(
  tenantId: string,
  ids: { customerId: string; serviceId: string },
  date: string,
  status: string,
  price: string,
) {
  const startAt = localDateTimeToInstant(date, "10:00", timeZone);
  const created = await prisma.appointment.create({
    data: {
      tenantId,
      customerId: ids.customerId,
      source: "USER",
      startAt,
      endAt: new Date(startAt.getTime() + 90 * 60_000),
      status,
      statusRaw: status,
      // A trigger exige título enquanto o item não existe; o relatório usa
      // o item, não o título.
      title: "Cílios 5D",
      createdBy: "owner-1",
    },
  });
  await prisma.appointmentItem.create({
    data: {
      tenantId,
      appointmentId: created.id,
      serviceId: ids.serviceId,
      serviceNameSnapshot: "Cílios 5D",
      durationMinutesSnapshot: 90,
      priceTypeSnapshot: "FIXED",
      priceSnapshot: price,
    },
  });
}

async function revenue(tenantId: string, query: string) {
  const response = await app.inject({
    method: "GET",
    url: `/internal/revenue?${query}`,
    headers: headers(tenantId),
  });
  return response;
}

describeWithDatabase("revenue report against PostgreSQL", () => {
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
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("soma só o negócio do cabeçalho", async () => {
    const a = await seed(tenantA, "150.00");
    const b = await seed(tenantB, "999.00");
    await appointment(tenantA, a, "2025-03-10", "COMPLETED", "150.00");
    await appointment(tenantB, b, "2025-03-10", "COMPLETED", "999.00");
    await appointment(tenantB, b, "2025-03-11", "COMPLETED", "999.00");

    const responseA = await revenue(tenantA, "period=month&date=2025-03-15");
    expect(responseA.statusCode).toBe(200);
    const dataA = responseA.json().data;
    expect(dataA.billed).toMatchObject({ amount: 150, count: 1 });
    expect(dataA.customers).toHaveLength(1);
    expect(dataA.services.map((s: { serviceId: string }) => s.serviceId)).toEqual([
      a.serviceId,
    ]);

    const dataB = (await revenue(tenantB, "period=month&date=2025-03-15")).json()
      .data;
    expect(dataB.billed).toMatchObject({ amount: 1998, count: 2 });
  });

  it("mudar o preço do serviço não reescreve o mês que passou", async () => {
    const a = await seed(tenantA, "120.00");
    await appointment(tenantA, a, "2025-03-10", "COMPLETED", "120.00");
    await prisma.service.update({
      where: { id: a.serviceId },
      data: { price: "200.00", name: "Cílios 5D Volume" },
    });
    await appointment(tenantA, a, "2025-04-10", "COMPLETED", "200.00");

    const year = (await revenue(tenantA, "period=year&date=2025-06-01")).json()
      .data;
    expect(year.series[2]).toMatchObject({ start: "2025-03-01", amount: 120 });
    expect(year.series[3]).toMatchObject({ start: "2025-04-01", amount: 200 });
    // O serviço é agrupado pelo nome de hoje; o valor é o de cada dia.
    expect(year.services).toEqual([
      expect.objectContaining({ name: "Cílios 5D Volume", amount: 320, count: 2 }),
    ]);
  });

  it("recusa período ou data inválidos", async () => {
    await seed(tenantA, "150.00");
    expect((await revenue(tenantA, "period=quarter")).statusCode).toBe(400);
    expect(
      (await revenue(tenantA, "period=month&date=2025-02-30")).statusCode,
    ).toBe(400);
  });
});
