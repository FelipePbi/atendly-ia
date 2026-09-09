import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { listAppointmentEvents } from "../../src/modules/appointments/appointment-event-service.js";
import { AtendlyAppointmentLifecycleService } from "../../src/modules/appointments/appointment-lifecycle-service.js";
import { runAutoCompleteSweep } from "../../src/modules/appointments/auto-complete-loop.js";
import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import { createTimeBlock } from "../../src/modules/calendar/time-blocks.js";
import { AtendlyCalendarProvider } from "../../src/modules/integrations/atendly/provider.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Goal008 contra PostgreSQL real: política única de escrita, hold pelo
 * relógio do banco, atomicidade de efeito/resultado/evento e conclusão
 * automática com lease.
 *
 * Tudo aqui precisa de um banco de verdade e não caberia em `tests/unit`:
 * `Serializable`, `pg_advisory_xact_lock`, `now()` do banco e a corrida entre
 * duas conexões são exatamente o que um dublê não consegue simular. Onde o
 * cenário depende do tempo, o relógio é movido por **fixture** (`expiresAt`,
 * `endAt`), nunca por `sleep`: um teste que espera é um teste que às vezes
 * mente.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "goal008-tenant-a";
const tenantB = "goal008-tenant-b";
const timeZone = "America/Sao_Paulo";
const date = "2026-09-10";
const stepMinutes = 30;

let prisma: PrismaClient;
/** Segunda conexão: concorrência real precisa de duas sessões, não de duas promessas. */
let other: PrismaClient;
let serviceIdA = "";
let customerIdA = "";
let serviceIdB = "";

function provider(tenantId: string, userId = "user-1") {
  return new AtendlyCalendarProvider(prisma, tenantId, userId, timeZone);
}

function providerOn(client: PrismaClient, tenantId: string, userId: string) {
  return new AtendlyCalendarProvider(client, tenantId, userId, timeZone);
}

function calendarContext(tenantId: string, requestId = "request-1") {
  return { tenantId, userId: "user-1", requestId };
}

async function seedTenant(tenantId: string) {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "ATENDLY", timezone: timeZone },
    update: { source: "ATENDLY", timezone: timeZone },
  });
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
  const service = await prisma.service.create({
    data: {
      tenantId,
      name: "Aplicacao",
      durationMinutes: 60,
      priceType: "FIXED",
      price: 100,
      active: true,
    },
  });
  const customer = await prisma.customer.create({
    data: { tenantId, name: "Thais", phone: "5511900000001" },
  });
  return { serviceId: service.id, customerId: customer.id };
}

function scheduleInput(startTime: string, idempotencyKey: string, extra = {}) {
  return {
    source: "USER" as const,
    serviceIds: [serviceIdA],
    date,
    startTime,
    customerId: customerIdA,
    stepMinutes,
    idempotencyKey,
    ...extra,
  };
}

/** Instante local do tenant, para mover `startAt`/`endAt` por fixture. */
function instant(day: string, time: string): Date {
  // O tenant está em America/Sao_Paulo (UTC-3, sem horário de verão desde 2019).
  return new Date(`${day}T${time}:00.000-03:00`);
}

function errorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

describeWithDatabase("goal008 agenda against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    other = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    // Confirma o destino efetivo antes de escrever qualquer linha.
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await other?.$disconnect();
  });

  beforeEach(async () => {
    for (const tenantId of [tenantA, tenantB]) {
      await resetTenant(prisma, tenantId);
    }
    const seeded = await seedTenant(tenantA);
    serviceIdA = seeded.serviceId;
    customerIdA = seeded.customerId;
    serviceIdB = (await seedTenant(tenantB)).serviceId;
  });

  describe("concurrency under the single write policy", () => {
    it("lets exactly one of two confirmations of the same slot win", async () => {
      const [first, second] = await Promise.allSettled([
        providerOn(prisma, tenantA, "user-1").createAppointment(
          scheduleInput("10:00", "idem-race-1"),
        ),
        providerOn(other, tenantA, "user-2").createAppointment(
          scheduleInput("10:00", "idem-race-2"),
        ),
      ]);

      const fulfilled = [first, second].filter(
        (outcome) => outcome.status === "fulfilled",
      );
      expect(fulfilled).toHaveLength(1);
      const rejected = [first, second].find(
        (outcome) => outcome.status === "rejected",
      ) as PromiseRejectedResult;
      // Erro próprio, nunca o erro cru do banco: quem perde precisa saber que
      // o horário foi tomado, não que "algo deu errado".
      expect([
        "SLOT_UNAVAILABLE",
        "CALENDAR_WRITE_RETRY_EXCEEDED",
      ]).toContain(errorCode(rejected.reason));

      const stored = await prisma.appointment.findMany({
        where: { tenantId: tenantA, status: "CONFIRMED" },
      });
      expect(stored).toHaveLength(1);
    });

    it("lets a time block and a confirmation of the same interval produce a single effect", async () => {
      const startAt = instant(date, "14:00");
      const endAt = instant(date, "15:00");

      const [block, appointment] = await Promise.allSettled([
        createTimeBlock(other, {
          tenantId: tenantA,
          timeZone,
          startAt,
          endAt,
          reason: "Almoco",
        }),
        providerOn(prisma, tenantA, "user-1").createAppointment(
          scheduleInput("14:00", "idem-block-race"),
        ),
      ]);

      const blocks = await prisma.timeBlock.count({
        where: { tenantId: tenantA },
      });
      const appointments = await prisma.appointment.count({
        where: { tenantId: tenantA, status: "CONFIRMED" },
      });
      // Um dos dois ocupa o intervalo; nunca os dois. A checagem de conflito
      // acontece dentro da transação, então o perdedor enxerga o vencedor.
      expect(blocks + appointments).toBe(1);
      expect([block.status, appointment.status].sort()).toEqual([
        "fulfilled",
        "rejected",
      ]);
    });

    it("keeps a consistent state when cancelling and rescheduling the same appointment at once", async () => {
      const created = await provider(tenantA).createAppointment(
        scheduleInput("09:00", "idem-cancel-vs-reschedule"),
      );

      const [cancel, reschedule] = await Promise.allSettled([
        providerOn(prisma, tenantA, "user-1").cancelAppointment({
          source: "USER",
          appointmentId: created.id,
          comments: "Cliente desistiu",
          idempotencyKey: "idem-cancel",
        }),
        providerOn(other, tenantA, "user-2").rescheduleAppointment({
          source: "USER",
          appointmentId: created.id,
          date,
          startTime: "11:00",
          stepMinutes,
          idempotencyKey: "idem-reschedule",
        }),
      ]);

      const stored = await prisma.appointment.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: created.id } },
      });
      const events = await listAppointmentEvents(prisma, tenantA, created.id);
      const applied = [cancel, reschedule].filter(
        (outcome) => outcome.status === "fulfilled",
      ).length;

      // Um evento por efeito aplicado, mais o CREATED da confirmação: o
      // histórico nunca registra uma mutação que não aconteceu, e nunca
      // registra duas vezes a que aconteceu uma só.
      expect(events.filter((event) => event.type !== "CREATED")).toHaveLength(
        applied,
      );

      // As duas ordens são legítimas — remarcar e depois cancelar é tão
      // válido quanto cancelar e recusar a remarcação. O que não pode
      // acontecer é o estado final discordar do que cada operação relatou.
      expect(stored.status).toBe(
        cancel.status === "fulfilled" ? "CANCELLED" : "CONFIRMED",
      );
      expect(stored.startAt.getTime()).toBe(
        instant(date, reschedule.status === "fulfilled" ? "11:00" : "09:00")
          .getTime(),
      );
      if (reschedule.status === "rejected") {
        // Quem perde recebe erro próprio: remarcar um cancelado é um pedido
        // inválido, não um acidente de transação.
        expect([
          "APPOINTMENT_CANCELLED",
          "CALENDAR_WRITE_RETRY_EXCEEDED",
        ]).toContain(errorCode(reschedule.reason));
      }
    });

    it("keeps a single active hold when two are requested for the same slot", async () => {
      const [first, second] = await Promise.allSettled([
        providerOn(prisma, tenantA, "user-1").createHold({
          source: "AI",
          serviceIds: [serviceIdA],
          date,
          startTime: "16:00",
          stepMinutes,
          idempotencyKey: "idem-hold-1",
        }),
        providerOn(other, tenantA, "user-2").createHold({
          source: "AI",
          serviceIds: [serviceIdA],
          date,
          startTime: "16:00",
          stepMinutes,
          idempotencyKey: "idem-hold-2",
        }),
      ]);

      expect(
        [first, second].filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(1);
      const active = await provider(tenantA).listHolds();
      expect(active).toHaveLength(1);
    });
  });

  describe("hold on the database clock", () => {
    it("occupies the slot for everyone except the confirmation that consumes it", async () => {
      const hold = await provider(tenantA).createHold({
        source: "AI",
        serviceIds: [serviceIdA],
        date,
        startTime: "13:00",
        stepMinutes,
        idempotencyKey: "idem-hold-occupies",
      });

      // Para terceiros o horário está tomado.
      await expect(
        provider(tenantA).createAppointment(
          scheduleInput("13:00", "idem-hold-third-party"),
        ),
      ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

      // Para a confirmação que apresenta o hold, não.
      const appointment = await provider(tenantA).createAppointment(
        scheduleInput("13:00", "idem-hold-consumer", { holdId: hold.id }),
      );
      expect(appointment.startTime).toBe("13:00");

      const consumed = await prisma.appointmentHold.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: hold.id } },
      });
      expect(consumed.consumedAt).not.toBeNull();
      // Consumido deixa de ocupar; quem ocupa agora é o atendimento.
      expect(await provider(tenantA).listHolds()).toHaveLength(0);

      const events = await listAppointmentEvents(prisma, tenantA, appointment.id);
      expect(events.map((event) => event.type)).toEqual([
        "CREATED",
        "HOLD_CONSUMED",
      ]);
    });

    it("reports the expiration and revalidates instead of confirming an expired hold", async () => {
      const hold = await provider(tenantA).createHold({
        source: "AI",
        serviceIds: [serviceIdA],
        date,
        startTime: "17:00",
        stepMinutes,
        idempotencyKey: "idem-hold-expiring",
      });

      // O relógio anda por fixture, não por `sleep`: a linha passa a ser um
      // hold criado dez minutos atrás com TTL de cinco. `createdAt` volta
      // junto porque `AppointmentHold_expiresAt_check` exige que o hold
      // expire depois de nascer — envelhecer a linha é o único jeito
      // honesto de vencê-la.
      await prisma.$executeRaw`
        UPDATE "AppointmentHold"
        SET "createdAt" = (now() - interval '10 minutes') AT TIME ZONE 'UTC',
            "expiresAt" = now() - interval '5 minutes'
        WHERE "tenantId" = ${tenantA} AND "id" = ${hold.id}
      `;

      await expect(
        provider(tenantA).createAppointment(
          scheduleInput("17:00", "idem-hold-expired-confirm", {
            holdId: hold.id,
          }),
        ),
      ).rejects.toMatchObject({
        code: "APPOINTMENT_HOLD_EXPIRED",
        details: { reason: "EXPIRED", slotStillAvailable: true },
      });

      // Nada foi confirmado, e o hold vencido parou de ocupar sem worker
      // nenhum: a própria consulta de disponibilidade é quem o expira.
      expect(
        await prisma.appointment.count({ where: { tenantId: tenantA } }),
      ).toBe(0);
      expect(await provider(tenantA).listHolds()).toHaveLength(0);
    });

    it("keeps the original slot busy while a reschedule holds the new one", async () => {
      const appointment = await provider(tenantA).createAppointment(
        scheduleInput("08:00", "idem-reschedule-origin"),
      );
      const hold = await provider(tenantA).createHold({
        source: "AI",
        serviceIds: [serviceIdA],
        date,
        startTime: "12:00",
        stepMinutes,
        idempotencyKey: "idem-reschedule-hold",
      });

      // Enquanto a remarcação não acontece, o horário original continua
      // ocupado pelo próprio atendimento — nada o solta antes.
      await expect(
        provider(tenantA).createAppointment(
          scheduleInput("08:00", "idem-reschedule-origin-intruder"),
        ),
      ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

      const moved = await provider(tenantA).rescheduleAppointment({
        source: "USER",
        appointmentId: appointment.id,
        date,
        startTime: "12:00",
        stepMinutes,
        holdId: hold.id,
        idempotencyKey: "idem-reschedule-confirm",
      });

      expect(moved.startTime).toBe("12:00");
      const releasedHold = await prisma.appointmentHold.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: hold.id } },
      });
      // Liberado, não consumido: o hold não virou atendimento, o atendimento
      // já existia e passou a ocupar o horário que ele segurava.
      expect(releasedHold.releasedAt).not.toBeNull();
      expect(releasedHold.consumedAt).toBeNull();

      const events = await listAppointmentEvents(
        prisma,
        tenantA,
        appointment.id,
      );
      expect(events.map((event) => event.type)).toEqual([
        "CREATED",
        "RESCHEDULED",
      ]);
      expect(events.at(-1)?.before).toMatchObject({ startTime: "08:00" });
      expect(events.at(-1)?.after).toMatchObject({ startTime: "12:00" });
    });
  });

  describe("idempotent result written with the effect", () => {
    it("recovers a key whose effect already exists instead of running the mutation again", async () => {
      const service = new CalendarService(prisma);
      const input = scheduleInput("15:00", "idem-crash-after-commit");
      const first = await service.createAppointment(
        calendarContext(tenantA),
        input,
      );

      // Queda depois do commit do efeito e antes de o resultado ser
      // observado: a linha volta a `PENDING` sem resposta, mas guardando a
      // referência do efeito. É o estado que a versão anterior a este Goal
      // deixava para trás.
      const reclaimable = new Date(Date.now() - 10 * 60 * 1000);
      await prisma.calendarMutationIdempotency.updateMany({
        where: { tenantId: tenantA, key: input.idempotencyKey },
        data: { status: "PENDING", response: null, lockedAt: reclaimable },
      });

      const recovered = await service.createAppointment(
        calendarContext(tenantA),
        input,
      );

      expect(recovered.id).toBe(first.id);
      // Recuperado pela referência, não reexecutado: um segundo atendimento
      // seria um segundo efeito para a mesma chave.
      expect(
        await prisma.appointment.count({ where: { tenantId: tenantA } }),
      ).toBe(1);
      const record = await prisma.calendarMutationIdempotency.findUniqueOrThrow(
        { where: { tenantId_key: { tenantId: tenantA, key: input.idempotencyKey } } },
      );
      expect(record.status).toBe("COMPLETED");
      expect(record.effectEntityType).toBe("APPOINTMENT");
      expect(record.effectEntityId).toBe(first.id);
    });

    it("leaves no effect behind when the mutation fails before the commit", async () => {
      const service = new CalendarService(prisma);
      const input = scheduleInput("15:00", "idem-failed");
      // Horário tomado por um bloqueio: a transação aborta dentro da
      // revalidação, antes de gravar qualquer linha. O pedido é o **mesmo**
      // nas duas tentativas — é isso que faz do segundo caso um retry da
      // mesma chave, e não uma chave reusada com outro request.
      const block = await createTimeBlock(prisma, {
        tenantId: tenantA,
        timeZone,
        startAt: instant(date, "15:00"),
        endAt: instant(date, "16:00"),
        reason: "Bloqueio",
      });

      await expect(
        service.createAppointment(calendarContext(tenantA), input),
      ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

      const record = await prisma.calendarMutationIdempotency.findUniqueOrThrow(
        { where: { tenantId_key: { tenantId: tenantA, key: input.idempotencyKey } } },
      );
      expect(record.status).toBe("FAILED");
      expect(record.lastErrorCode).toBe("SLOT_UNAVAILABLE");
      expect(record.effectEntityId).toBeNull();
      expect(
        await prisma.appointment.count({ where: { tenantId: tenantA } }),
      ).toBe(0);

      // Retry com a mesma chave reexecuta sob a mesma política.
      await prisma.timeBlock.delete({ where: { id: block.id } });
      const retried = await service.createAppointment(
        calendarContext(tenantA),
        input,
      );
      expect(retried.startTime).toBe("15:00");
      expect(
        await prisma.appointment.count({ where: { tenantId: tenantA } }),
      ).toBe(1);
    });
  });

  describe("automatic completion on the database clock", () => {
    async function pastConfirmedAppointment(minutesAgo: number) {
      const appointment = await provider(tenantA).createAppointment(
        scheduleInput("18:00", `idem-auto-${minutesAgo}`),
      );
      // O término é movido por fixture para o passado do **banco**: o
      // processo de teste não decide o que "já venceu".
      await prisma.$executeRaw`
        UPDATE "Appointment"
        SET "startAt" = now() - make_interval(mins => ${minutesAgo + 60}),
            "endAt"   = now() - make_interval(mins => ${minutesAgo})
        WHERE "tenantId" = ${tenantA} AND "id" = ${appointment.id}
      `;
      return appointment.id;
    }

    it("completes what expired past the grace period and never touches cancelled or no-show", async () => {
      const due = await pastConfirmedAppointment(45);
      const stillFresh = await pastConfirmedAppointment(5);

      const cancelledId = await pastConfirmedAppointment(90);
      await provider(tenantA).cancelAppointment({
        source: "USER",
        appointmentId: cancelledId,
        idempotencyKey: "idem-auto-cancelled",
      });

      const noShowId = await pastConfirmedAppointment(120);
      await new AtendlyAppointmentLifecycleService(
        prisma,
        tenantA,
        "user-1",
      ).markNoShow(noShowId, { note: "Nao veio" });

      const sweep = await runAutoCompleteSweep(prisma, { graceMinutes: 30 });
      expect(sweep).toMatchObject({ locked: true, completed: 1 });

      const completed = await prisma.appointment.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: due } },
      });
      expect(completed.status).toBe("COMPLETED");
      expect(completed.completionOrigin).toBe("AUTO");
      // Origem automática não tem ator: ninguém apertou nada.
      expect(completed.completedBy).toBeNull();

      for (const [id, status] of [
        [stillFresh, "CONFIRMED"],
        [cancelledId, "CANCELLED"],
        [noShowId, "NO_SHOW"],
      ] as const) {
        const row = await prisma.appointment.findUniqueOrThrow({
          where: { tenantId_id: { tenantId: tenantA, id } },
        });
        expect(row.status).toBe(status);
      }

      // Repetir a varredura não duplica efeito nem evento.
      const again = await runAutoCompleteSweep(prisma, { graceMinutes: 30 });
      expect(again).toMatchObject({ locked: true, completed: 0 });
      const events = await listAppointmentEvents(prisma, tenantA, due);
      expect(
        events.filter((event) => event.type === "COMPLETED"),
      ).toHaveLength(1);
      expect(events.at(-1)?.source).toBe("SYSTEM");
    });

    it("gives the sweep to a single instance while another holds the lease", async () => {
      const due = await pastConfirmedAppointment(45);

      let releaseLease = () => undefined as void;
      const leaseReleased = new Promise<void>((resolve) => {
        releaseLease = () => resolve();
      });
      let leaseHeld = () => undefined as void;
      const leaseAcquired = new Promise<void>((resolve) => {
        leaseHeld = () => resolve();
      });

      // Outra instância segurando o lease: transação aberta com o mesmo
      // advisory lock que a varredura tenta adquirir.
      const holder = other.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtext('scheduling:auto-complete'))
          `;
          leaseHeld();
          await leaseReleased;
        },
        { timeout: 20_000 },
      );
      await leaseAcquired;

      const blocked = await runAutoCompleteSweep(prisma, { graceMinutes: 30 });
      // `pg_try_advisory_xact_lock` não bloqueia: quem não pega o lease
      // devolve sem tocar em nada, em vez de esperar e duplicar trabalho.
      expect(blocked).toEqual({ locked: false, completed: 0 });
      expect(
        (
          await prisma.appointment.findUniqueOrThrow({
            where: { tenantId_id: { tenantId: tenantA, id: due } },
          })
        ).status,
      ).toBe("CONFIRMED");

      releaseLease();
      await holder;

      const afterRelease = await runAutoCompleteSweep(prisma, {
        graceMinutes: 30,
      });
      expect(afterRelease).toMatchObject({ locked: true, completed: 1 });
    });
  });

  describe("history, overrides and tenant isolation", () => {
    it("orders events written in the same transaction by the recorded sequence", async () => {
      const hold = await provider(tenantA).createHold({
        source: "USER",
        serviceIds: [serviceIdA],
        date,
        startTime: "19:00",
        stepMinutes,
        idempotencyKey: "idem-history-hold",
      });
      const appointment = await provider(tenantA).createAppointment(
        scheduleInput("19:00", "idem-history-create", { holdId: hold.id }),
      );

      const events = await listAppointmentEvents(
        prisma,
        tenantA,
        appointment.id,
      );
      expect(events.map((event) => event.type)).toEqual([
        "CREATED",
        "HOLD_CONSUMED",
      ]);
      expect(BigInt(events[0].sequence)).toBeLessThan(
        BigInt(events[1].sequence),
      );

      // O empate de `occurredAt` é forçado por fixture em vez de esperado do
      // acaso: é exatamente o caso que a coluna de sequência existe para
      // resolver, e depender de duas gravações caírem no mesmo milissegundo
      // seria um teste que só às vezes prova alguma coisa.
      await prisma.$executeRaw`
        UPDATE "AppointmentEvent" SET "occurredAt" = timestamp '2026-09-10 12:00:00'
        WHERE "tenantId" = ${tenantA} AND "appointmentId" = ${appointment.id}
      `;
      const tied = await listAppointmentEvents(prisma, tenantA, appointment.id);
      expect(tied.map((event) => event.type)).toEqual([
        "CREATED",
        "HOLD_CONSUMED",
      ]);
      expect(tied[0].occurredAt).toBe(tied[1].occurredAt);
    });

    it("accepts an overlap only from a human with a reason and refuses it from the AI", async () => {
      await provider(tenantA).createAppointment(
        scheduleInput("20:00", "idem-overlap-first"),
      );

      await expect(
        provider(tenantA).createAppointment(
          scheduleInput("20:00", "idem-overlap-ai", {
            source: "AI",
            overlapOverride: true,
            overlapOverrideReason: "encaixe",
          }),
        ),
      ).rejects.toMatchObject({ code: "OVERLAP_OVERRIDE_NOT_ALLOWED" });

      await expect(
        provider(tenantA).createAppointment(
          scheduleInput("20:00", "idem-overlap-no-reason", {
            overlapOverride: true,
          }),
        ),
      ).rejects.toMatchObject({ code: "OVERLAP_OVERRIDE_REASON_REQUIRED" });

      const forced = await provider(tenantA).createAppointment(
        scheduleInput("20:00", "idem-overlap-human", {
          overlapOverride: true,
          overlapOverrideReason: "Cliente antiga, encaixe combinado",
        }),
      );

      const events = await listAppointmentEvents(prisma, tenantA, forced.id);
      const override = events.find((event) => event.type === "OVERLAP_OVERRIDE");
      // A decisão humana fica registrada com o motivo: um encaixe sem dono no
      // histórico é indistinguível de um bug.
      expect(override?.reason).toBe("Cliente antiga, encaixe combinado");
      expect(override?.source).toBe("USER");
    });

    it("refuses invalid transitions and keeps the raw status untouched", async () => {
      const appointment = await provider(tenantA).createAppointment(
        scheduleInput("07:00", "idem-transitions"),
      );
      const lifecycle = new AtendlyAppointmentLifecycleService(
        prisma,
        tenantA,
        "user-1",
      );
      await provider(tenantA).cancelAppointment({
        source: "USER",
        appointmentId: appointment.id,
        idempotencyKey: "idem-transitions-cancel",
      });

      await expect(lifecycle.complete(appointment.id)).rejects.toMatchObject({
        code: "APPOINTMENT_COMPLETION_INVALID",
      });
      await expect(lifecycle.markNoShow(appointment.id)).rejects.toMatchObject({
        code: "APPOINTMENT_NO_SHOW_INVALID",
      });

      const stored = await prisma.appointment.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: tenantA, id: appointment.id } },
      });
      // `statusRaw` é gravado uma vez, na criação; nenhuma transição o
      // reescreve — é ele que preserva o bruto anterior à normalização.
      expect(stored.status).toBe("CANCELLED");
      expect(stored.statusRaw).toBe("CONFIRMED");
    });

    it("never lets holds, events or appointments of one tenant reach the other", async () => {
      const hold = await provider(tenantA).createHold({
        source: "AI",
        serviceIds: [serviceIdA],
        date,
        startTime: "21:00",
        stepMinutes,
        idempotencyKey: "idem-isolation-hold",
      });
      const appointment = await provider(tenantA).createAppointment(
        scheduleInput("06:00", "idem-isolation-appointment"),
      );

      expect(await provider(tenantB).listHolds()).toHaveLength(0);
      await expect(provider(tenantB).getHold(hold.id)).rejects.toMatchObject({
        code: "APPOINTMENT_HOLD_NOT_FOUND",
      });
      await expect(
        provider(tenantB).getAppointment(appointment.id),
      ).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND" });
      expect(
        await listAppointmentEvents(prisma, tenantB, appointment.id),
      ).toHaveLength(0);

      // E o horário de A não ocupa nada em B.
      const slots = await provider(tenantB).getAvailability({
        serviceIds: [serviceIdB],
        startDate: date,
        days: 1,
        stepMinutes,
        maxSlots: 100,
      });
      expect(
        slots.some((slot) => slot.startTime === "21:00"),
      ).toBe(true);
    });
  });
});
