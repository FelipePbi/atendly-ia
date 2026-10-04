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
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";
import { localDateAhead, upcomingLocalSlot } from "./support/test-date.js";

/**
 * Goal103, WU-01 contra PostgreSQL real: `/internal/appointments` (por pessoa
 * e por intervalo) e `/internal/appointments/:id` devolvem os seis campos de
 * ciclo de vida com o valor gravado, iguais aos que a rota de ciclo de vida
 * devolve para o mesmo agendamento.
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

const tenantA = "goal103-tenant-a";
const timeZone = "America/Sao_Paulo";

const LIFECYCLE_FIELDS = [
  "completedAt",
  "completionOrigin",
  "noShowAt",
  "noShowNote",
  "presenceConfirmedAt",
  "finalValue",
] as const;

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
    "x-request-id": "req-goal103",
    "content-type": "application/json",
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify();
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

async function createConfirmed(
  customerId: string,
  daysAhead: number,
): Promise<string> {
  const { startAt } = upcomingLocalSlot(daysAhead);
  const created = await prisma.appointment.create({
    data: {
      tenantId: tenantA,
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
  return created.id;
}

async function post(path: string, payload?: unknown) {
  const response = await app.inject({
    method: "POST",
    url: path,
    headers: headers(tenantA),
    payload: JSON.stringify(payload ?? {}),
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().data as Record<string, unknown>;
}

async function get(path: string) {
  const response = await app.inject({
    method: "GET",
    url: path,
    headers: headers(tenantA),
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().data;
}

function lifecycleOf(source: Record<string, unknown>) {
  return Object.fromEntries(
    LIFECYCLE_FIELDS.map((field) => [field, source[field]]),
  );
}

describeWithDatabase(
  "goal103 appointment listing carries the lifecycle fields (PostgreSQL)",
  () => {
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
      await prisma?.$disconnect();
    });

    beforeEach(async () => {
      await resetTenant(prisma, tenantA);
      await prisma.calendarSettings.upsert({
        where: { tenantId: tenantA },
        create: { tenantId: tenantA, source: "AVENLY", timezone: timeZone },
        update: { source: "AVENLY", timezone: timeZone },
      });
      app = await buildApp();
    });

    afterEach(async () => {
      await app.close();
    });

    it("lista por pessoa, por intervalo e lê por id com o valor gravado, igual à rota de ciclo de vida", async () => {
      const customer = await prisma.customer.create({
        data: { tenantId: tenantA, name: "Ana" },
      });
      const completedId = await createConfirmed(customer.id, 2);
      const presenceId = await createConfirmed(customer.id, 3);
      const noShowId = await createConfirmed(customer.id, 4);
      const plainId = await createConfirmed(customer.id, 5);

      await post(`/internal/appointments/${completedId}/presence`);
      await post(`/internal/appointments/${completedId}/complete`);
      const completedLifecycle = await post(
        `/internal/appointments/${completedId}/final-value`,
        { amount: 149.9 },
      );
      const presenceLifecycle = await post(
        `/internal/appointments/${presenceId}/presence`,
      );
      const noShowLifecycle = await post(
        `/internal/appointments/${noShowId}/no-show`,
        { note: "Avisou tarde" },
      );

      const expected: Record<string, Record<string, unknown>> = {
        [completedId]: lifecycleOf(completedLifecycle),
        [presenceId]: lifecycleOf(presenceLifecycle),
        [noShowId]: lifecycleOf(noShowLifecycle),
        [plainId]: Object.fromEntries(
          LIFECYCLE_FIELDS.map((field) => [field, null]),
        ),
      };

      expect(expected[completedId]).toMatchObject({
        completionOrigin: "MANUAL",
        finalValue: 149.9,
      });
      expect(expected[completedId].completedAt).toEqual(expect.any(String));
      expect(expected[completedId].presenceConfirmedAt).toEqual(
        expect.any(String),
      );
      expect(expected[presenceId].presenceConfirmedAt).toEqual(
        expect.any(String),
      );
      expect(expected[presenceId].completedAt).toBeNull();
      expect(expected[noShowId]).toMatchObject({ noShowNote: "Avisou tarde" });
      expect(expected[noShowId].noShowAt).toEqual(expect.any(String));

      const byCustomer = (await get(
        `/internal/appointments?customerId=${customer.id}&startDate=${localDateAhead(0)}&endDate=${localDateAhead(10)}`,
      )) as Array<Record<string, unknown>>;
      const byRange = (await get(
        `/internal/appointments?startDate=${localDateAhead(0)}&endDate=${localDateAhead(10)}`,
      )) as Array<Record<string, unknown>>;

      for (const listing of [byCustomer, byRange]) {
        expect(listing).toHaveLength(4);
        for (const [id, lifecycle] of Object.entries(expected)) {
          const item = listing.find((entry) => entry.id === id);
          expect(item, id).toBeDefined();
          expect(lifecycleOf(item as Record<string, unknown>)).toEqual(
            lifecycle,
          );
        }
      }

      for (const [id, lifecycle] of Object.entries(expected)) {
        const single = (await get(`/internal/appointments/${id}`)) as Record<
          string,
          unknown
        >;
        expect(lifecycleOf(single)).toEqual(lifecycle);
      }
    });

    it("finalValue com centavos volta como 149.9 e o agendamento sem ciclo devolve os seis como null", async () => {
      const customer = await prisma.customer.create({
        data: { tenantId: tenantA, name: "Bia" },
      });
      const valuedId = await createConfirmed(customer.id, 2);
      const plainId = await createConfirmed(customer.id, 3);
      await post(`/internal/appointments/${valuedId}/final-value`, {
        amount: 149.9,
      });

      const valued = (await get(`/internal/appointments/${valuedId}`)) as Record<
        string,
        unknown
      >;
      expect(valued.finalValue).toBe(149.9);

      const plain = (await get(`/internal/appointments/${plainId}`)) as Record<
        string,
        unknown
      >;
      for (const field of LIFECYCLE_FIELDS) {
        expect(plain[field], field).toBeNull();
      }
      expect(plain).not.toHaveProperty("finalValueSetAt");
      expect(plain).not.toHaveProperty("finalValueSetBy");
    });
  },
);
