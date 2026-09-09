import { describe, expect, it } from "vitest";

import { listAppointmentEvents } from "../../src/modules/appointments/appointment-event-service.js";
import { AtendlyAppointmentLifecycleService } from "../../src/modules/appointments/appointment-lifecycle-service.js";
import { runAutoCompleteSweep } from "../../src/modules/appointments/auto-complete-loop.js";
import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

/**
 * Ciclo de vida do atendimento (Goal008): concluir, falta, valor final,
 * presença e histórico, sem banco. Concorrência real entre duas instâncias do
 * loop de conclusão automática e o relógio real do PostgreSQL são da suíte de
 * integração; aqui se prova a regra — transições válidas/inválidas,
 * idempotência, evento por mutação na mesma transação e respeito ao lease.
 */

const tenantId = "tenant-a";
const timeZone = "America/Sao_Paulo";
const context = { tenantId, userId: "user-1", requestId: "request-1" };
const serviceId = "service-corte";
const customerId = "customer-ana";

function futureDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function databaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function setup() {
  const database = createDatabaseDouble();
  const { tables } = database;
  tables.calendarSettings.rows.push({
    id: tenantId,
    tenantId,
    source: "ATENDLY",
    timezone: timeZone,
  });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    tables.availabilityRule.rows.push({
      id: `rule-${dayOfWeek}`,
      tenantId,
      dayOfWeek,
      startTime: databaseTime("08:00"),
      endTime: databaseTime("18:00"),
      active: true,
    });
  }
  tables.service.rows.push({
    id: serviceId,
    tenantId,
    name: "Corte",
    durationMinutes: 60,
    priceType: "FIXED",
    price: 50,
    active: true,
    needsReview: false,
    colorToken: null,
  });
  tables.customer.rows.push({
    id: customerId,
    tenantId,
    name: "Ana",
    phone: "+5511999990000",
    normalizedPhone: "5511999990000",
  });
  return {
    database,
    calendar: new CalendarService(database.client as never),
    lifecycle: new AtendlyAppointmentLifecycleService(
      database.client as never,
      tenantId,
      context.userId,
    ),
  };
}

async function createConfirmedAppointment(
  calendar: CalendarService,
  overrides: { idempotencyKey?: string } = {},
) {
  return calendar.createAppointment(context, {
    serviceIds: [serviceId],
    date: futureDate(7),
    startTime: "09:00",
    customerId,
    stepMinutes: 30,
    idempotencyKey: overrides.idempotencyKey ?? "key-create",
  });
}

describe("ciclo de vida: concluir", () => {
  it("conclui manualmente um atendimento confirmado e grava um evento na mesma transação", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    const snapshot = await lifecycle.complete(appointment.id, {
      origin: "MANUAL",
    });

    expect(snapshot.status).toBe("COMPLETED");
    expect(snapshot.completedBy).toBe("user-1");
    expect(snapshot.completionOrigin).toBe("MANUAL");
    const effectWrite = database.journal
      .writesFor("appointment")
      .filter((write) => write.operation === "updateMany")
      .at(-1);
    const eventWrite = database.journal
      .writesFor("appointmentEvent")
      .find((write) => write.transaction === effectWrite?.transaction);
    expect(eventWrite).toBeDefined();
    const event = database.tables.appointmentEvent.rows.at(-1);
    expect(event).toMatchObject({ type: "COMPLETED", actor: "user-1" });
  });

  it("é idempotente: concluir de novo não duplica efeito nem evento", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    await lifecycle.complete(appointment.id, { origin: "MANUAL" });
    const eventsBefore = database.tables.appointmentEvent.rows.length;

    const second = await lifecycle.complete(appointment.id, {
      origin: "MANUAL",
    });

    expect(second.status).toBe("COMPLETED");
    expect(database.tables.appointmentEvent.rows).toHaveLength(eventsBefore);
  });

  it("recusa concluir um atendimento cancelado", async () => {
    const { calendar, lifecycle } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      idempotencyKey: "key-cancel",
    });

    await expect(
      lifecycle.complete(appointment.id, { origin: "MANUAL" }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_COMPLETION_INVALID" });
  });

  it("recusa concluir atendimento inexistente", async () => {
    const { lifecycle } = setup();
    await expect(
      lifecycle.complete("appointment-desconhecido", { origin: "MANUAL" }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND" });
  });
});

describe("ciclo de vida: falta", () => {
  it("marca falta diretamente a partir de confirmado, com observação", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    const snapshot = await lifecycle.markNoShow(appointment.id, {
      note: "cliente não avisou",
    });

    expect(snapshot.status).toBe("NO_SHOW");
    expect(snapshot.noShowNote).toBe("cliente não avisou");
    const event = database.tables.appointmentEvent.rows.at(-1);
    expect(event).toMatchObject({ type: "NO_SHOW", actor: "user-1" });
  });

  it("corrige um concluído para falta, limpando os dados de conclusão", async () => {
    const { calendar, lifecycle } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    await lifecycle.complete(appointment.id, { origin: "MANUAL" });

    const corrected = await lifecycle.markNoShow(appointment.id, {
      note: "na verdade não compareceu",
    });

    expect(corrected.status).toBe("NO_SHOW");
    expect(corrected.completedAt).toBeNull();
    expect(corrected.completedBy).toBeNull();
    expect(corrected.completionOrigin).toBeNull();
  });

  it("é idempotente ao repetir sobre uma falta já marcada", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    await lifecycle.markNoShow(appointment.id, { note: "primeira" });
    const eventsBefore = database.tables.appointmentEvent.rows.length;

    const second = await lifecycle.markNoShow(appointment.id, {
      note: "segunda tentativa",
    });

    expect(second.status).toBe("NO_SHOW");
    expect(second.noShowNote).toBe("primeira");
    expect(database.tables.appointmentEvent.rows).toHaveLength(eventsBefore);
  });

  it("recusa marcar falta em um atendimento cancelado", async () => {
    const { calendar, lifecycle } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      idempotencyKey: "key-cancel",
    });

    await expect(
      lifecycle.markNoShow(appointment.id, {}),
    ).rejects.toMatchObject({ code: "APPOINTMENT_NO_SHOW_INVALID" });
  });
});

describe("ciclo de vida: transições inválidas fora do ciclo de vida", () => {
  it("recusa remarcar um atendimento concluído", async () => {
    const { calendar, lifecycle } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    await lifecycle.complete(appointment.id, { origin: "MANUAL" });

    await expect(
      calendar.rescheduleAppointment(context, {
        appointmentId: appointment.id,
        date: futureDate(9),
        startTime: "10:00",
        stepMinutes: 30,
        idempotencyKey: "key-reschedule",
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_RESCHEDULE_INVALID" });
  });
});

describe("ciclo de vida: valor final", () => {
  it("registra o valor final sem alterar itens nem o total do acordo", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    const itemsBefore = database.tables.appointmentItem.rows.map((row) => ({
      ...row,
    }));

    const snapshot = await lifecycle.setFinalValue(appointment.id, 75.5);

    expect(snapshot.finalValue).toBe(75.5);
    expect(snapshot.finalValueSetBy).toBe("user-1");
    expect(database.tables.appointmentItem.rows).toEqual(itemsBefore);
    const refreshed = await calendar.getAppointment(context, appointment.id);
    expect(refreshed.totalPrice).toBe(50);
    expect(refreshed.totalPriceType).toBe("FIXED");
    const event = database.tables.appointmentEvent.rows.at(-1);
    expect(event).toMatchObject({
      type: "FINAL_VALUE_SET",
      before: { finalValue: null },
      after: { finalValue: 75.5 },
    });
  });

  it("recusa valor final negativo", async () => {
    const { calendar, lifecycle } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await expect(
      lifecycle.setFinalValue(appointment.id, -10),
    ).rejects.toMatchObject({ code: "APPOINTMENT_FINAL_VALUE_INVALID" });
  });
});

describe("ciclo de vida: presença", () => {
  it("confirma presença em campo separado da conclusão", async () => {
    const { calendar, lifecycle } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    const snapshot = await lifecycle.confirmPresence(appointment.id);

    expect(snapshot.presenceConfirmedAt).not.toBeNull();
    expect(snapshot.status).toBe("CONFIRMED");
    expect(snapshot.completedAt).toBeNull();
  });

  it("é idempotente: confirmar de novo não duplica o evento", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    const first = await lifecycle.confirmPresence(appointment.id);
    const eventsBefore = database.tables.appointmentEvent.rows.length;

    const second = await lifecycle.confirmPresence(appointment.id);

    expect(second.presenceConfirmedAt).toBe(first.presenceConfirmedAt);
    expect(database.tables.appointmentEvent.rows).toHaveLength(eventsBefore);
  });
});

describe("ciclo de vida: histórico por evento", () => {
  it("criar, remarcar e cancelar gravam um evento cada, em ordem cronológica", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    await calendar.rescheduleAppointment(context, {
      appointmentId: appointment.id,
      date: futureDate(9),
      startTime: "10:00",
      stepMinutes: 30,
      idempotencyKey: "key-reschedule",
    });
    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      comments: "cliente desmarcou",
      idempotencyKey: "key-cancel",
    });

    const events = database.tables.appointmentEvent.rows
      .filter((row) => row.appointmentId === appointment.id)
      .sort(
        (a, b) =>
          (a.occurredAt as Date).getTime() - (b.occurredAt as Date).getTime(),
      );

    expect(events.map((event) => event.type)).toEqual([
      "CREATED",
      "RESCHEDULED",
      "CANCELLED",
    ]);

    const chronological = await listAppointmentEvents(
      database.client as never,
      tenantId,
      appointment.id,
    );
    expect(chronological.map((event) => event.type)).toEqual([
      "CREATED",
      "RESCHEDULED",
      "CANCELLED",
    ]);
  });

  it("não deixa efeito sem evento: falha entre os dois propaga em vez de suceder", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    database.tables.appointmentEvent.failNext(new Error("queda simulada"));

    await expect(
      lifecycle.complete(appointment.id, { origin: "MANUAL" }),
    ).rejects.toThrow("queda simulada");

    const events = database.tables.appointmentEvent.rows.filter(
      (row) => row.appointmentId === appointment.id && row.type === "COMPLETED",
    );
    expect(events).toHaveLength(0);
  });
});

/**
 * Move o relógio do banco para `minutesAfterEnd` minutos depois do término do
 * atendimento indicado — a partir do `endAt` realmente persistido, nunca de
 * uma conta de dias corridos: `futureDate` só garante um dia futuro, não a
 * distância exata até `now()` no instante em que o teste roda.
 */
function advanceClockPastAppointmentEnd(
  database: ReturnType<typeof createDatabaseDouble>,
  appointmentId: string,
  minutesAfterEnd: number,
): void {
  const row = database.tables.appointment.rows.find(
    (candidate) => candidate.id === appointmentId,
  );
  const endAt = row?.endAt as Date;
  const target = endAt.getTime() + minutesAfterEnd * 60_000;
  database.advanceDatabaseClock(target - Date.now());
}

describe("conclusão automática", () => {
  it("conclui confirmados vencidos há mais que o intervalo configurado, pelo relógio do banco", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    advanceClockPastAppointmentEnd(database, appointment.id, 45);

    const result = await runAutoCompleteSweep(database.client as never, {
      graceMinutes: 30,
    });

    expect(result).toEqual({ locked: true, completed: 1 });
    const row = database.tables.appointment.rows.find(
      (candidate) => candidate.id === appointment.id,
    );
    expect(row?.status).toBe("COMPLETED");
    expect(row?.completionOrigin).toBe("AUTO");
    expect(row?.completedBy).toBeNull();
  });

  it("nunca toca cancelados nem faltas", async () => {
    const { calendar, database } = setup();
    const cancelled = await createConfirmedAppointment(calendar, {
      idempotencyKey: "key-cancelled",
    });
    await calendar.cancelAppointment(context, {
      appointmentId: cancelled.id,
      idempotencyKey: "key-cancel",
    });
    advanceClockPastAppointmentEnd(database, cancelled.id, 45);

    const result = await runAutoCompleteSweep(database.client as never, {
      graceMinutes: 30,
    });

    expect(result.completed).toBe(0);
    const row = database.tables.appointment.rows.find(
      (candidate) => candidate.id === cancelled.id,
    );
    expect(row?.status).toBe("CANCELLED");
  });

  it("é idempotente: rodar de novo não conclui outra vez nem duplica evento", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    advanceClockPastAppointmentEnd(database, appointment.id, 45);
    await runAutoCompleteSweep(database.client as never, { graceMinutes: 30 });
    const eventsAfterFirst = database.tables.appointmentEvent.rows.filter(
      (row) => row.appointmentId === appointment.id && row.type === "COMPLETED",
    ).length;

    const second = await runAutoCompleteSweep(database.client as never, {
      graceMinutes: 30,
    });

    expect(second.completed).toBe(0);
    const eventsAfterSecond = database.tables.appointmentEvent.rows.filter(
      (row) => row.appointmentId === appointment.id && row.type === "COMPLETED",
    ).length;
    expect(eventsAfterSecond).toBe(eventsAfterFirst);
  });

  it("não conclui antes do término mais o intervalo configurado", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    // Dez minutos depois do término: ainda dentro da carência de 30 minutos.
    advanceClockPastAppointmentEnd(database, appointment.id, 10);

    const result = await runAutoCompleteSweep(database.client as never, {
      graceMinutes: 30,
    });

    expect(result.completed).toBe(0);
    const row = database.tables.appointment.rows.find(
      (candidate) => candidate.id === appointment.id,
    );
    expect(row?.status).toBe("CONFIRMED");
  });

  it("não faz nada quando outra instância já segura o lease", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);
    advanceClockPastAppointmentEnd(database, appointment.id, 45);
    database.setAdvisoryLockAvailable(false);

    const result = await runAutoCompleteSweep(database.client as never, {
      graceMinutes: 30,
    });

    expect(result).toEqual({ locked: false, completed: 0 });
    expect(
      database.tables.appointment.rows.every(
        (row) => row.status === "CONFIRMED",
      ),
    ).toBe(true);
  });
});
