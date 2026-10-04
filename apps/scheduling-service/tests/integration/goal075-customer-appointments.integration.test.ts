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
import { upcomingLocalSlot } from "./support/test-date.js";

/**
 * Goal075, WU-01 contra PostgreSQL real: `nextAppointment`/`lastAppointment`
 * na lista e no detalhe, e `appointmentStats` no detalhe, calculados só para o negócio da
 * requisição e no fuso do calendário — nunca no do processo (§6.1 a §6.3 do
 * Goal).
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal075-tenant-a";
const tenantB = "goal075-tenant-b";
const timeZone = "America/Sao_Paulo";
const DAY_MS = 24 * 60 * 60_000;

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
    "x-request-id": "req-goal075",
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

async function createCustomer(tenantId: string, name: string): Promise<string> {
  const customer = await prisma.customer.create({
    data: { tenantId, name },
  });
  return customer.id;
}

async function createAppointment(
  tenantId: string,
  customerId: string,
  startAt: Date,
  status: string,
): Promise<void> {
  await prisma.appointment.create({
    data: {
      tenantId,
      customerId,
      source: "USER",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status,
      statusRaw: status,
      title: "Corte",
      createdBy: "user-1",
    },
  });
}

describeWithDatabase(
  "goal075 customer appointments against PostgreSQL",
  () => {
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
      await seedTenant(tenantA);
      await seedTenant(tenantB);
      app = await buildApp();
    });

    afterEach(async () => {
      await app.close();
      vi.useRealTimers();
    });

    it("§6.1 a lista devolve nextAppointment de amanhã e lastAppointment concluído; sem o de amanhã, nextAppointment é null; agendamento de outro negócio não entra", async () => {
      const now = new Date();
      const customerId = await createCustomer(tenantA, "Ana");
      await createAppointment(
        tenantA,
        customerId,
        new Date(now.getTime() - 21 * DAY_MS),
        "COMPLETED",
      );
      await createAppointment(
        tenantA,
        customerId,
        new Date(now.getTime() - DAY_MS),
        "CANCELLED",
      );
      const tomorrow = new Date(now.getTime() + DAY_MS);
      await createAppointment(tenantA, customerId, tomorrow, "CONFIRMED");

      // Outro negócio, mesmo horário: nunca deve influenciar tenantA.
      const otherCustomerId = await createCustomer(tenantB, "Zeca");
      await createAppointment(tenantB, otherCustomerId, tomorrow, "CONFIRMED");

      const response = await app.inject({
        method: "GET",
        url: "/internal/customers",
        headers: headers(tenantA),
      });
      expect(response.statusCode).toBe(200);
      const items = response.json().data.items as Array<{
        id: string;
        nextAppointment: { status: string } | null;
        lastAppointment: { status: string } | null;
      }>;
      expect(items.some((item) => item.id === otherCustomerId)).toBe(false);
      const item = items.find((candidate) => candidate.id === customerId);
      expect(item?.nextAppointment).toMatchObject({ status: "CONFIRMED" });
      expect(item?.lastAppointment).toMatchObject({ status: "COMPLETED" });

      // Sem o agendamento de amanhã, nextAppointment vira null; o concluído
      // continua sendo o último (o cancelado nunca conta).
      await prisma.appointment.updateMany({
        where: { tenantId: tenantA, customerId, startAt: tomorrow },
        data: { status: "CANCELLED" },
      });
      const secondResponse = await app.inject({
        method: "GET",
        url: "/internal/customers",
        headers: headers(tenantA),
      });
      const secondItems = secondResponse.json().data.items as Array<{
        id: string;
        nextAppointment: unknown;
        lastAppointment: { status: string } | null;
      }>;
      const secondItem = secondItems.find(
        (candidate) => candidate.id === customerId,
      );
      expect(secondItem?.nextAppointment).toBeNull();
      expect(secondItem?.lastAppointment).toMatchObject({ status: "COMPLETED" });

      // Tenant B só vê o próprio cliente.
      const otherResponse = await app.inject({
        method: "GET",
        url: "/internal/customers",
        headers: headers(tenantB),
      });
      const otherItems = otherResponse.json().data.items as Array<{
        id: string;
      }>;
      expect(otherItems.map((candidate) => candidate.id)).toEqual([
        otherCustomerId,
      ]);
    });

    it("§6.2 o detalhe devolve appointmentStats com as contagens e a média de intervalo certas, e averageIntervalDays null com um atendimento só", async () => {
      const soloCustomerId = await createCustomer(tenantA, "Bia");
      await createAppointment(
        tenantA,
        soloCustomerId,
        new Date(Date.now() - 10 * DAY_MS),
        "COMPLETED",
      );
      const soloResponse = await app.inject({
        method: "GET",
        url: `/internal/customers/${soloCustomerId}`,
        headers: headers(tenantA),
      });
      expect(soloResponse.statusCode).toBe(200);
      expect(soloResponse.json().data.appointmentStats).toMatchObject({
        completed: 1,
        noShows: 0,
        cancelled: 0,
        averageIntervalDays: null,
      });
      // Blocker 1 da rodada 1: o detalhe traz o próximo e o último pelas
      // mesmas consultas da lista. Sem futuro, o próximo é null.
      expect(soloResponse.json().data.nextAppointment).toBeNull();
      expect(soloResponse.json().data.lastAppointment).toMatchObject({
        status: "COMPLETED",
      });

      const customerId = await createCustomer(tenantA, "Caio");
      const base = new Date("2026-01-01T12:00:00.000Z");
      await createAppointment(tenantA, customerId, base, "COMPLETED");
      await createAppointment(
        tenantA,
        customerId,
        new Date(base.getTime() + 10 * DAY_MS),
        "COMPLETED",
      );
      await createAppointment(
        tenantA,
        customerId,
        new Date(base.getTime() + 25 * DAY_MS),
        "COMPLETED",
      );
      await createAppointment(
        tenantA,
        customerId,
        new Date(base.getTime() + 30 * DAY_MS),
        "NO_SHOW",
      );
      await createAppointment(
        tenantA,
        customerId,
        new Date(base.getTime() + 40 * DAY_MS),
        "CANCELLED",
      );
      // Confirmado muito à frente: é o próximo, e não entra nas contagens.
      // 15:30 em America/Sao_Paulo, 400 dias à frente de hoje: sempre futuro.
      const farSlot = upcomingLocalSlot(400, "15:30");
      await createAppointment(
        tenantA,
        customerId,
        farSlot.startAt,
        "CONFIRMED",
      );

      const response = await app.inject({
        method: "GET",
        url: `/internal/customers/${customerId}`,
        headers: headers(tenantA),
      });
      expect(response.statusCode).toBe(200);
      const stats = response.json().data.appointmentStats;
      expect(stats.completed).toBe(3);
      expect(stats.noShows).toBe(1);
      expect(stats.cancelled).toBe(1);
      expect(stats.averageIntervalDays).toBeCloseTo((10 + 15) / 2, 5);
      expect(stats.firstAppointmentDate).toBe("2026-01-01");
      // O próximo é o confirmado no fuso do negócio; o último é a falta
      // (2026-01-31T12:00Z, 09:00 local), e o cancelado posterior não conta.
      expect(response.json().data.nextAppointment).toEqual({
        date: farSlot.date,
        startTime: "15:30",
        status: "CONFIRMED",
      });
      expect(response.json().data.lastAppointment).toEqual({
        date: "2026-01-31",
        startTime: "09:00",
        status: "NO_SHOW",
      });
    });

    it("§6.3 com o relógio perto da meia-noite no fuso do negócio e o servidor em UTC, agora é o do fuso do negócio", async () => {
      const previousTz = process.env.TZ;
      process.env.TZ = "UTC";
      vi.useFakeTimers();
      try {
        // 2026-06-14 23:00 em America/Sao_Paulo (UTC-3) == 2026-06-15T02:00Z.
        vi.setSystemTime(new Date("2026-06-15T02:00:00.000Z"));
        const customerId = await createCustomer(tenantA, "Duda");
        // Futuro, 45 min depois de "agora": 2026-06-14 23:45 local.
        await createAppointment(
          tenantA,
          customerId,
          new Date("2026-06-15T02:45:00.000Z"),
          "CONFIRMED",
        );
        // Passado, 30 min antes de "agora": 2026-06-14 22:30 local.
        await createAppointment(
          tenantA,
          customerId,
          new Date("2026-06-15T01:30:00.000Z"),
          "COMPLETED",
        );

        const response = await app.inject({
          method: "GET",
          url: "/internal/customers",
          headers: headers(tenantA),
        });
        expect(response.statusCode).toBe(200);
        const item = (
          response.json().data.items as Array<{
            id: string;
            nextAppointment: { date: string; startTime: string; status: string } | null;
            lastAppointment: { date: string; startTime: string; status: string } | null;
          }>
        ).find((candidate) => candidate.id === customerId);
        // No fuso do negócio, os dois caem em 14/06, não em 15/06 (o dia em
        // UTC). Um cálculo que usasse o fuso do servidor devolveria
        // "2026-06-15" e "02:45"/"01:30".
        expect(item?.nextAppointment).toEqual({
          date: "2026-06-14",
          startTime: "23:45",
          status: "CONFIRMED",
        });
        expect(item?.lastAppointment).toEqual({
          date: "2026-06-14",
          startTime: "22:30",
          status: "COMPLETED",
        });
      } finally {
        vi.useRealTimers();
        process.env.TZ = previousTz;
      }
    });
  },
);
