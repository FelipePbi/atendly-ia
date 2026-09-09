import { describe, expect, it } from "vitest";

import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import { MinhaAgendaCalendarProvider } from "../../src/modules/integrations/minha-agenda/provider.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";

/**
 * Hold de confirmação (Goal008) sem banco: o que se prova aqui é a **regra** —
 * ocupação temporária sob o mesmo lock, exclusão apenas da confirmação que
 * consome, vigência decidida pelo relógio do banco e liberação na remarcação.
 * Concorrência real e `now()` do PostgreSQL são da suíte de integração; o
 * dublê tem relógio próprio justamente para que nenhum teste daqui dependa de
 * `sleep`.
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
  };
}

function holdInput(
  overrides: {
    date?: string;
    startTime?: string;
    idempotencyKey?: string;
    source?: "AI" | "USER";
  } = {},
) {
  return {
    serviceIds: [serviceId],
    date: futureDate(7),
    startTime: "09:00",
    stepMinutes: 30,
    customerId,
    idempotencyKey: "key-hold",
    ...overrides,
  };
}

function createInput(
  overrides: {
    date?: string;
    startTime?: string;
    idempotencyKey?: string;
    holdId?: string;
  } = {},
) {
  return {
    serviceIds: [serviceId],
    date: futureDate(7),
    startTime: "09:00",
    customerId,
    stepMinutes: 30,
    idempotencyKey: "key-create",
    ...overrides,
  };
}

async function offersSlot(
  calendar: CalendarService,
  date: string,
  startTime: string,
): Promise<boolean> {
  const slots = await calendar.getAvailability(context, {
    serviceIds: [serviceId],
    startDate: date,
    days: 1,
    stepMinutes: 30,
    maxSlots: 100,
  });
  return slots.some((slot) => slot.startTime === startTime);
}

/** Vence o hold pela linha, como a suíte de integração faz pelo relógio do banco. */
function expireHold(
  database: ReturnType<typeof createDatabaseDouble>,
  holdId: string,
): void {
  const hold = database.tables.appointmentHold.rows.find(
    (row) => row.id === holdId,
  );
  if (!hold) throw new Error("hold fixture not found");
  hold.expiresAt = new Date(Date.now() - 60_000);
}

async function expectAppError(
  promise: Promise<unknown>,
  code: string,
): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

describe("agenda: hold de confirmação", () => {
  it("cria o hold sob o mesmo lock do dia e recusa um segundo no mesmo slot", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);

    const hold = await calendar.createHold(context, holdInput({ date }));

    expect(hold.status).toBe("ACTIVE");
    expect(hold.date).toBe(date);
    expect(hold.startTime).toBe("09:00");
    expect(database.journal.locks).toEqual([`${tenantId}:${date}`]);
    const created = database.journal
      .writesFor("appointmentHold")
      .find((write) => write.operation === "create");
    expect(created?.transaction).not.toBeNull();

    // O segundo pedido revalida a disponibilidade dentro da transação e já
    // enxerga o primeiro hold como ocupação: um só fica vigente.
    await expectAppError(
      calendar.createHold(
        context,
        holdInput({ date, idempotencyKey: "key-hold-2" }),
      ),
      "SLOT_UNAVAILABLE",
    );
    expect(await calendar.listHolds(context)).toHaveLength(1);
  });

  it("ocupa para terceiros, não para a confirmação que o consome, e para de ocupar depois", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);

    const hold = await calendar.createHold(context, holdInput({ date }));
    expect(await offersSlot(calendar, date, "09:00")).toBe(false);

    const appointment = await calendar.createAppointment(
      context,
      createInput({ date, holdId: hold.id }),
    );
    expect(appointment.status).toBe("CONFIRMED");
    expect(appointment.startTime).toBe("09:00");

    const consumed = database.tables.appointmentHold.rows[0];
    expect(consumed?.consumedAt).toBeInstanceOf(Date);
    expect(await calendar.listHolds(context)).toHaveLength(0);

    // Consumido não ocupa mais: com o atendimento cancelado, o horário volta.
    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      idempotencyKey: "key-cancel",
    });
    expect(await offersSlot(calendar, date, "09:00")).toBe(true);
  });

  it("ignora hold vencido sem worker: o horário volta a ser oferecido", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);

    const hold = await calendar.createHold(context, holdInput({ date }));
    expect(await offersSlot(calendar, date, "09:00")).toBe(false);

    expireHold(database, hold.id);

    expect(await offersSlot(calendar, date, "09:00")).toBe(true);
    expect(await calendar.listHolds(context)).toHaveLength(0);
  });

  it("informa a expiração e revalida quando a confirmação chega com hold vencido", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);
    const hold = await calendar.createHold(context, holdInput({ date }));
    expireHold(database, hold.id);

    const error = await expectAppError(
      calendar.createAppointment(
        context,
        createInput({ date, holdId: hold.id }),
      ),
      "APPOINTMENT_HOLD_EXPIRED",
    );

    expect(error.details).toMatchObject({
      holdId: hold.id,
      reason: "EXPIRED",
      // Revalidação: o horário continua livre, então a conversa pode reoferecê-lo.
      slotStillAvailable: true,
    });
    expect(database.tables.appointment.rows).toHaveLength(0);
  });

  it("recusa o hold de outro slot em vez de confirmar por ele", async () => {
    const { calendar } = setup();
    const date = futureDate(7);
    const hold = await calendar.createHold(context, holdInput({ date }));

    const error = await expectAppError(
      calendar.createAppointment(
        context,
        createInput({ date, startTime: "11:00", holdId: hold.id }),
      ),
      "APPOINTMENT_HOLD_EXPIRED",
    );

    expect(error.details).toMatchObject({ reason: "SLOT_MISMATCH" });
    // O hold do outro horário continua vigente: recusar não o consome.
    expect(await calendar.listHolds(context)).toHaveLength(1);
  });

  it("nunca confirma silenciosamente em slot ocupado com hold vencido", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);
    const hold = await calendar.createHold(context, holdInput({ date }));
    expireHold(database, hold.id);
    // Outra pessoa ficou com o horário enquanto o hold vencia.
    await calendar.createAppointment(
      context,
      createInput({ date, idempotencyKey: "key-other" }),
    );

    const error = await expectAppError(
      calendar.createAppointment(
        context,
        createInput({ date, holdId: hold.id, idempotencyKey: "key-late" }),
      ),
      "APPOINTMENT_HOLD_EXPIRED",
    );

    expect(error.details).toMatchObject({ slotStillAvailable: false });
    expect(database.tables.appointment.rows).toHaveLength(1);
  });

  it("remarca com hold sem soltar o horário original antes da confirmação", async () => {
    const { calendar, database } = setup();
    const original = futureDate(9);
    const target = futureDate(5);
    const appointment = await calendar.createAppointment(
      context,
      createInput({ date: original }),
    );

    const hold = await calendar.createHold(
      context,
      holdInput({ date: target, startTime: "14:00" }),
    );

    // Antes da confirmação: o original continua ocupado e o novo está preso
    // pelo hold — nenhum dos dois horários é oferecido a terceiros.
    expect(await offersSlot(calendar, original, "09:00")).toBe(false);
    expect(await offersSlot(calendar, target, "14:00")).toBe(false);

    const moved = await calendar.rescheduleAppointment(context, {
      appointmentId: appointment.id,
      date: target,
      startTime: "14:00",
      stepMinutes: 30,
      holdId: hold.id,
      idempotencyKey: "key-reschedule",
    });

    expect(moved.date).toBe(target);
    expect(moved.startTime).toBe("14:00");
    expect(await calendar.listHolds(context)).toHaveLength(0);
    expect(database.tables.appointmentHold.rows[0]?.releasedAt).toBeInstanceOf(
      Date,
    );
    // Só agora o horário original é liberado.
    expect(await offersSlot(calendar, original, "09:00")).toBe(true);

    const event = database.tables.appointmentEvent.rows.at(-1);
    expect(event).toMatchObject({
      appointmentId: appointment.id,
      type: "RESCHEDULED",
      actor: "user-1",
      before: { date: original, startTime: "09:00" },
      after: { date: target, startTime: "14:00", holdId: hold.id },
    });
  });

  it("decide a vigência pelo relógio do banco, não pelo do processo", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);
    await calendar.createHold(context, holdInput({ date }));
    const reads = database.journal.databaseNowReads;
    expect(reads).toBeGreaterThan(0);

    // Só o relógio do banco anda; `expiresAt` e o relógio do processo ficam
    // onde estavam. O hold precisa vencer mesmo assim.
    database.advanceDatabaseClock(6 * 60_000);

    expect(await calendar.listHolds(context)).toHaveLength(0);
    expect(await offersSlot(calendar, date, "09:00")).toBe(true);
    expect(database.journal.databaseNowReads).toBeGreaterThan(reads);
  });

  it("libera o hold explicitamente e devolve o mesmo resultado ao repetir", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);
    const hold = await calendar.createHold(context, holdInput({ date }));
    const locksBefore = database.journal.locks.length;

    const released = await calendar.releaseHold(context, hold.id);
    expect(released.status).toBe("RELEASED");
    expect(database.journal.locks.slice(locksBefore)).toEqual([
      `${tenantId}:${date}`,
    ]);
    expect(await offersSlot(calendar, date, "09:00")).toBe(true);

    const again = await calendar.releaseHold(context, hold.id);
    expect(again.status).toBe("RELEASED");
    expect(
      database.journal
        .writesFor("appointmentHold")
        .filter((write) => write.operation === "updateMany"),
    ).toHaveLength(1);
  });

  it("recusa hold na fonte externa com erro próprio", async () => {
    const provider = new MinhaAgendaCalendarProvider({
      tenantId,
      baseUrl: "https://example.invalid",
      basicAuth: "basic",
      username: "user",
      password: "secret",
      employeeId: 1,
      paymentMethod: "dinheiro",
      modelVersion: 2,
      timeoutMs: 1_000,
      refreshSkewSeconds: 300,
      enableWrites: true,
      bufferBetweenServicesMinutes: 0,
    });

    await expectAppError(
      provider.createHold({
        serviceIds: [serviceId],
        date: futureDate(7),
        startTime: "09:00",
        stepMinutes: 30,
        idempotencyKey: "key-external-hold",
      }),
      "EXTERNAL_CALENDAR_HOLD_UNSUPPORTED",
    );
    await expectAppError(
      provider.listHolds(),
      "EXTERNAL_CALENDAR_HOLD_UNSUPPORTED",
    );
    // Confirmar apresentando hold também é recusado: a fonte externa não tem
    // como honrar a reserva que o hold promete.
    await expectAppError(
      provider.createAppointment({
        serviceIds: [serviceId],
        date: futureDate(7),
        startTime: "09:00",
        customerName: "Ana",
        customerPhone: "+5511999990000",
        stepMinutes: 30,
        holdId: "hold-1",
        idempotencyKey: "key-external-create",
      }),
      "EXTERNAL_CALENDAR_HOLD_UNSUPPORTED",
    );
  });
});
