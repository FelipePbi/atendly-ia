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
import type { RescheduleCalendarAppointmentInput } from "../../src/modules/calendar/calendar-provider.js";
import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import { databaseNow } from "../../src/modules/calendar/write-policy.js";
import { AtendlyCalendarProvider } from "../../src/modules/integrations/atendly/provider.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";
import { upcomingDate } from "./support/test-date.js";

/**
 * Goal073, WU-01 contra PostgreSQL real: antecedência mínima para o cliente
 * (via IA) alterar o próprio atendimento.
 *
 * A regra compara `startAt` do atendimento contra o relógio do **banco**
 * (`databaseNow`), nunca o do processo de teste — daí toda referência de
 * tempo aqui vir de uma leitura de `now()` feita no início de cada cenário.
 * Longe da fronteira (23h, 1h, 25h do replay), a passagem real de tempo não
 * muda o resultado. Na fronteira exata de 24h, o relógio fica congelado
 * (`freezeDatabaseNow`), sem folga nenhuma.
 */

/**
 * Relógio do banco congelado só nos testes de fronteira. A regra lê
 * `databaseNow` dentro da transação da mutação, e entre a fixture e essa
 * leitura passa tempo real: sem congelar, "exatamente 24h" viraria "24h
 * menos alguns milissegundos" (recusado) ou exigiria folga, e a folga
 * deixaria `<=` passar no lugar de `<`. Com `frozenNow.value` definido, a
 * transação vê o MESMO instante que a fixture usou para `startAt`; com ele
 * `null`, `databaseNow` é o original.
 */
const frozenNow = vi.hoisted(() => ({ value: null as Date | null }));

vi.mock("../../src/modules/calendar/write-policy.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/modules/calendar/write-policy.js")
    >();
  return {
    ...actual,
    databaseNow: async (
      client: Parameters<typeof actual.databaseNow>[0],
    ): Promise<Date> =>
      frozenNow.value
        ? new Date(frozenNow.value.getTime())
        : actual.databaseNow(client),
  };
});

/** Lê o `now()` real do banco e congela a regra nesse instante. */
async function freezeDatabaseNow(): Promise<Date> {
  frozenNow.value = null;
  const now = await databaseNow(prisma);
  frozenNow.value = now;
  return now;
}

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal073-tenant-a";
const timeZone = "America/Sao_Paulo";
const targetDate = upcomingDate(10);

let prisma: PrismaClient;

function provider(tenantId: string, userId = "user-1"): AtendlyCalendarProvider {
  return new AtendlyCalendarProvider(prisma, tenantId, userId, timeZone);
}

function calendarContext(tenantId: string, requestId = "request-1") {
  return { tenantId, userId: "user-1", requestId };
}

/** Minutos exatos em milissegundos, para deixar a aritmética do teste legível. */
const MINUTES = 60_000;

async function seedTenant(
  tenantId: string,
  customerChangeMinNoticeMinutes = 0,
): Promise<string> {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: {
      tenantId,
      source: "AVENLY",
      timezone: timeZone,
      customerChangeMinNoticeMinutes,
    },
    update: { source: "AVENLY", timezone: timeZone, customerChangeMinNoticeMinutes },
  });
  await prisma.availabilityRule.deleteMany({ where: { tenantId } });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await prisma.availabilityRule.create({
      data: {
        tenantId,
        dayOfWeek,
        startTime: new Date("1970-01-01T00:00:00.000Z"),
        endTime: new Date("1970-01-01T23:00:00.000Z"),
        active: true,
      },
    });
  }
  const customer = await prisma.customer.create({
    data: { tenantId, name: "Bia", phone: "5511900000002" },
  });
  return customer.id;
}

/**
 * Atendimento `CONFIRMED` gravado diretamente (sem passar pela oferta): o
 * que estes cenários provam é a regra de antecedência, não o motor de
 * disponibilidade — o horário de início é o único fato que importa aqui, e
 * ele precisa ser exato em relação ao relógio do banco.
 */
async function createConfirmedAppointment(
  tenantId: string,
  customerId: string,
  startAt: Date,
): Promise<string> {
  const appointment = await prisma.appointment.create({
    data: {
      tenantId,
      customerId,
      source: "USER",
      startAt,
      endAt: new Date(startAt.getTime() + 60 * MINUTES),
      status: "CONFIRMED",
      statusRaw: "CONFIRMED",
      title: "Corte",
      createdBy: "user-1",
    },
  });
  return appointment.id;
}

async function readAppointment(tenantId: string, id: string) {
  return prisma.appointment.findUniqueOrThrow({
    where: { tenantId_id: { tenantId, id } },
  });
}

let requestSequence = 0;
function idempotencyKey(): string {
  requestSequence += 1;
  return `goal073-key-${requestSequence}`;
}

describeWithDatabase("goal073 customer change policy against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
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
    frozenNow.value = null;
    await resetTenant(prisma, tenantA);
  });

  afterEach(() => {
    frozenNow.value = null;
  });

  it("a migration é aditiva: a coluna nasce com 0 e sem exigir a coluna em toda linha antiga", async () => {
    const columns = await prisma.$queryRaw<
      Array<{ column_default: string; is_nullable: string }>
    >`
      SELECT column_default, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'CalendarSettings'
         AND column_name = 'customerChangeMinNoticeMinutes'
    `;
    expect(columns).toEqual([
      { column_default: "0", is_nullable: "NO" },
    ]);
    const customerId = await seedTenant(tenantA);
    const settings = await prisma.calendarSettings.findUniqueOrThrow({
      where: { tenantId: tenantA },
    });
    expect(settings.customerChangeMinNoticeMinutes).toBe(0);
    // Sem restrição nenhuma com o default: cancelar como IA um segundo antes
    // do início não é recusado.
    const appointmentId = await createConfirmedAppointment(
      tenantA,
      customerId,
      new Date(Date.now() + 1_000),
    );
    const cancelled = await provider(tenantA).cancelAppointment({
      appointmentId,
      source: "AI",
      idempotencyKey: idempotencyKey(),
    });
    expect(cancelled.status).toBe("CANCELLED");
  });

  describe("cancelamento", () => {
    it("recusa o chamador IA fora do prazo, com CUSTOMER_CHANGE_OUTSIDE_POLICY e sem gravar nada", async () => {
      const customerId = await seedTenant(tenantA, 1_440);
      const now = await databaseNow(prisma);
      const appointmentId = await createConfirmedAppointment(
        tenantA,
        customerId,
        new Date(now.getTime() + 23 * 60 * MINUTES),
      );
      await expect(
        provider(tenantA).cancelAppointment({
          appointmentId,
          source: "AI",
          idempotencyKey: idempotencyKey(),
        }),
      ).rejects.toMatchObject({
        code: "CUSTOMER_CHANGE_OUTSIDE_POLICY",
        statusCode: 409,
      });
      const untouched = await readAppointment(tenantA, appointmentId);
      expect(untouched.status).toBe("CONFIRMED");
    });

    it("deixa passar o chamador IA a exatamente 24h e a 25h de antecedência", async () => {
      const customerId = await seedTenant(tenantA, 1_440);
      for (const hoursAhead of [24, 25]) {
        // Relógio congelado: o atendimento fica a exatamente 1440 (e 1500)
        // minutos do `now()` que a regra lê, sem folga nenhuma.
        const now = await freezeDatabaseNow();
        const appointmentId = await createConfirmedAppointment(
          tenantA,
          customerId,
          new Date(now.getTime() + hoursAhead * 60 * MINUTES),
        );
        const cancelled = await provider(tenantA).cancelAppointment({
          appointmentId,
          source: "AI",
          idempotencyKey: idempotencyKey(),
        });
        expect(cancelled.status).toBe("CANCELLED");
      }
    });

    it("chamador USER nunca é limitado pela política, mesmo a 1h do início", async () => {
      const customerId = await seedTenant(tenantA, 1_440);
      const now = await databaseNow(prisma);
      const appointmentId = await createConfirmedAppointment(
        tenantA,
        customerId,
        new Date(now.getTime() + 60 * MINUTES),
      );
      const cancelled = await provider(tenantA).cancelAppointment({
        appointmentId,
        source: "USER",
        idempotencyKey: idempotencyKey(),
      });
      expect(cancelled.status).toBe("CANCELLED");
    });

    it("a isenção ACTIVATION_TEST_CLEANUP deixa a IA cancelar a 1h do início", async () => {
      const customerId = await seedTenant(tenantA, 1_440);
      const now = await databaseNow(prisma);
      const appointmentId = await createConfirmedAppointment(
        tenantA,
        customerId,
        new Date(now.getTime() + 60 * MINUTES),
      );
      const cancelled = await provider(tenantA).cancelAppointment({
        appointmentId,
        source: "AI",
        policyExemption: "ACTIVATION_TEST_CLEANUP",
        idempotencyKey: idempotencyKey(),
      });
      expect(cancelled.status).toBe("CANCELLED");
    });

    it("cancelar um atendimento já cancelado continua devolvendo o estado atual, sem esbarrar na política", async () => {
      const customerId = await seedTenant(tenantA, 1_440);
      const now = await databaseNow(prisma);
      // Fora do prazo de propósito: só a via de já-cancelado escapa da
      // política, não um horário que por acaso passaria.
      const appointmentId = await createConfirmedAppointment(
        tenantA,
        customerId,
        new Date(now.getTime() + 5 * MINUTES),
      );
      await provider(tenantA).cancelAppointment({
        appointmentId,
        source: "USER",
        idempotencyKey: idempotencyKey(),
      });
      const replay = await provider(tenantA).cancelAppointment({
        appointmentId,
        source: "AI",
        idempotencyKey: idempotencyKey(),
      });
      expect(replay.status).toBe("CANCELLED");
    });

    it("replay pela chave de idempotência de um cancelamento já gravado devolve o mesmo efeito, sem reexecutar", async () => {
      const customerId = await seedTenant(tenantA, 1_440);
      const now = await databaseNow(prisma);
      const appointmentId = await createConfirmedAppointment(
        tenantA,
        customerId,
        new Date(now.getTime() + 25 * 60 * MINUTES + 5_000),
      );
      const key = idempotencyKey();
      const service = new CalendarService(prisma);
      const first = await service.cancelAppointment(calendarContext(tenantA), {
        appointmentId,
        source: "AI",
        idempotencyKey: key,
      });
      const replayed = await service.cancelAppointment(calendarContext(tenantA), {
        appointmentId,
        source: "AI",
        idempotencyKey: key,
      });
      expect(replayed).toEqual(first);
      const record = await prisma.calendarMutationIdempotency.findUniqueOrThrow({
        where: { tenantId_key: { tenantId: tenantA, key } },
      });
      expect(record.status).toBe("COMPLETED");
      expect(record.effectEntityId).toBe(appointmentId);
    });
  });

  describe("remarcação", () => {
    function rescheduleInput(
      appointmentId: string,
      extra: Partial<RescheduleCalendarAppointmentInput> = {},
    ): RescheduleCalendarAppointmentInput {
      return {
        appointmentId,
        date: targetDate,
        startTime: "10:00",
        stepMinutes: 30,
        idempotencyKey: idempotencyKey(),
        ...extra,
      };
    }

    it("recusa o chamador IA fora do prazo, medindo contra o início ATUAL, com nada gravado", async () => {
      const customerId = await seedTenant(tenantA, 1_440);
      const now = await databaseNow(prisma);
      const originalStart = new Date(now.getTime() + 23 * 60 * MINUTES);
      const appointmentId = await createConfirmedAppointment(
        tenantA,
        customerId,
        originalStart,
      );
      await expect(
        provider(tenantA).rescheduleAppointment(
          rescheduleInput(appointmentId, { source: "AI" }),
        ),
      ).rejects.toMatchObject({
        code: "CUSTOMER_CHANGE_OUTSIDE_POLICY",
        statusCode: 409,
      });
      const untouched = await readAppointment(tenantA, appointmentId);
      expect(untouched.startAt.getTime()).toBe(originalStart.getTime());
      expect(untouched.status).toBe("CONFIRMED");
    });

    it("deixa passar o chamador IA a exatamente 24h e a 25h de antecedência do início atual", async () => {
      const customerId = await seedTenant(tenantA, 1_440);
      // Horários alvo distintos por iteração: a primeira remarcação já ocupa
      // o slot anterior, e o que este teste prova é a política, não a
      // disponibilidade do horário de destino.
      for (const [hoursAhead, targetStartTime] of [
        [24, "10:00"],
        [25, "11:00"],
      ] as const) {
        // Relógio congelado: exatamente 1440 (e 1500) minutos do início
        // atual, sem folga nenhuma.
        const now = await freezeDatabaseNow();
        const appointmentId = await createConfirmedAppointment(
          tenantA,
          customerId,
          new Date(now.getTime() + hoursAhead * 60 * MINUTES),
        );
        const moved = await provider(tenantA).rescheduleAppointment(
          rescheduleInput(appointmentId, {
            source: "AI",
            startTime: targetStartTime,
          }),
        );
        expect(moved.date).toBe(targetDate);
        expect(moved.startTime).toBe(targetStartTime);
      }
    });

    it("chamador USER nunca é limitado pela política, mesmo a 1h do início", async () => {
      const customerId = await seedTenant(tenantA, 1_440);
      const now = await databaseNow(prisma);
      const appointmentId = await createConfirmedAppointment(
        tenantA,
        customerId,
        new Date(now.getTime() + 60 * MINUTES),
      );
      const moved = await provider(tenantA).rescheduleAppointment(
        rescheduleInput(appointmentId, { source: "USER" }),
      );
      expect(moved.date).toBe(targetDate);
    });

    it("não aceita isenção: a IA continua recusada a 1h mesmo com policyExemption no corpo", async () => {
      const customerId = await seedTenant(tenantA, 1_440);
      const now = await databaseNow(prisma);
      const appointmentId = await createConfirmedAppointment(
        tenantA,
        customerId,
        new Date(now.getTime() + 60 * MINUTES),
      );
      const input = rescheduleInput(appointmentId, {
        source: "AI",
      }) as RescheduleCalendarAppointmentInput & {
        policyExemption?: string;
      };
      // `RescheduleCalendarAppointmentInput` não declara `policyExemption`
      // (Goal073): mesmo que um corpo malicioso o inclua, não há parâmetro
      // que o provider leia para isentar a remarcação.
      input.policyExemption = "ACTIVATION_TEST_CLEANUP";
      await expect(
        provider(tenantA).rescheduleAppointment(input),
      ).rejects.toMatchObject({ code: "CUSTOMER_CHANGE_OUTSIDE_POLICY" });
    });
  });

  describe("/internal/availability-settings", () => {
    const bffToken = deriveInternalToken(
      TEST_INTERNAL_SERVICE_TOKEN,
      "bff",
      SERVICE_AUDIENCE,
      "command",
    );
    const aiToken = deriveInternalToken(
      TEST_INTERNAL_SERVICE_TOKEN,
      "ai-orchestrator",
      SERVICE_AUDIENCE,
      "command",
    );

    let app: FastifyInstance;

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

    function headers(token: string) {
      return {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantA,
        "x-user-id": "owner-1",
        "x-request-id": "req-goal073",
        "content-type": "application/json",
      };
    }

    beforeEach(async () => {
      app = await buildApp();
    });

    afterEach(async () => {
      await app.close();
    });

    it("GET expõe customerChangeMinNoticeMinutes", async () => {
      await seedTenant(tenantA, 180);
      const response = await app.inject({
        method: "GET",
        url: "/internal/availability-settings",
        headers: headers(bffToken),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.customerChangeMinNoticeMinutes).toBe(180);
    });

    it("PATCH sem o campo preserva o valor gravado", async () => {
      await seedTenant(tenantA, 180);
      const response = await app.inject({
        method: "PATCH",
        url: "/internal/availability-settings",
        headers: headers(bffToken),
        payload: { timezone: timeZone, rules: [] },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.customerChangeMinNoticeMinutes).toBe(180);
      const settings = await prisma.calendarSettings.findUniqueOrThrow({
        where: { tenantId: tenantA },
      });
      expect(settings.customerChangeMinNoticeMinutes).toBe(180);
    });

    it("PATCH com o campo grava o novo valor", async () => {
      await seedTenant(tenantA, 0);
      const response = await app.inject({
        method: "PATCH",
        url: "/internal/availability-settings",
        headers: headers(bffToken),
        payload: {
          timezone: timeZone,
          rules: [],
          customerChangeMinNoticeMinutes: 2_880,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.customerChangeMinNoticeMinutes).toBe(2_880);
    });

    it("PATCH continua exigindo chamador humano, mesmo só para este campo", async () => {
      await seedTenant(tenantA, 0);
      const response = await app.inject({
        method: "PATCH",
        url: "/internal/availability-settings",
        headers: headers(aiToken),
        payload: {
          timezone: timeZone,
          rules: [],
          customerChangeMinNoticeMinutes: 60,
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("AI_CALLER_NOT_ALLOWED");
    });

    it("recusa valor fora de 0..10080", async () => {
      await seedTenant(tenantA, 0);
      const response = await app.inject({
        method: "PATCH",
        url: "/internal/availability-settings",
        headers: headers(bffToken),
        payload: {
          timezone: timeZone,
          rules: [],
          customerChangeMinNoticeMinutes: 10_081,
        },
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
