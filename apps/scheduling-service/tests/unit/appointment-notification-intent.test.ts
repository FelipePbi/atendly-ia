import { describe, expect, it } from "vitest";

import { AvenlyAppointmentLifecycleService } from "../../src/modules/appointments/appointment-lifecycle-service.js";
import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import { recomputeAppointmentIntentsWithin } from "../../src/modules/reminders/notification-intent-service.js";
import {
  DEFAULT_REMINDER_LEAD_MINUTES,
  MAX_REMINDER_LEAD_MINUTES,
  ReminderService,
} from "../../src/modules/reminders/reminder-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

/**
 * Recomputação das intenções de envio (Goal021, WU-004).
 *
 * Criar, remarcar e cancelar recomputam as intenções **na mesma transação da
 * mutação**: as pendentes da versão antiga são canceladas, as da versão nova
 * são criadas, a antecedência já vencida nasce dispensada com motivo em vez de
 * virar envio imediato, e só compromisso futuro e confirmado gera lembrete.
 *
 * Aqui se prova a regra sem banco. O dedupe por índice único sob concorrência,
 * o `now()` do servidor e o lease são da suíte de integração.
 */

const tenantId = "tenant-a";
const timeZone = "America/Sao_Paulo";
const context = { tenantId, userId: "user-1", requestId: "request-1" };
const serviceId = "service-corte";
const customerId = "customer-ana";
const MINUTE_MS = 60_000;

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
    source: "AVENLY",
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
    lifecycle: new AvenlyAppointmentLifecycleService(
      database.client as never,
      tenantId,
      context.userId,
    ),
    reminders: new ReminderService(database.client as never, tenantId),
  };
}

type Double = ReturnType<typeof createDatabaseDouble>;

interface IntentRow {
  appointmentId: string;
  kind: string;
  slot: string;
  appointmentVersion: number;
  state: string;
  reason: string | null;
  dueAt: Date;
  settledAt: Date | null;
}

function intentsOf(database: Double, appointmentId: string): IntentRow[] {
  return database.tables.appointmentNotificationIntent.rows
    .filter((row) => row.appointmentId === appointmentId)
    .map((row) => row as unknown as IntentRow);
}

function startAtOf(database: Double, appointmentId: string): Date {
  const row = database.tables.appointment.rows.find(
    (candidate) => candidate.id === appointmentId,
  );
  if (!row) throw new Error("appointment not found in the double");
  return row.startAt as Date;
}

async function createConfirmedAppointment(
  calendar: CalendarService,
  overrides: { date?: string; idempotencyKey?: string } = {},
) {
  return calendar.createAppointment(context, {
    serviceIds: [serviceId],
    date: overrides.date ?? futureDate(7),
    startTime: "09:00",
    customerId,
    stepMinutes: 30,
    idempotencyKey: overrides.idempotencyKey ?? "key-create",
  });
}

describe("intenções: criar compromisso futuro e confirmado", () => {
  it("cria o lembrete da configuração vigente, na mesma transação da criação", async () => {
    const { calendar, database } = setup();

    const appointment = await createConfirmedAppointment(calendar);

    const intents = intentsOf(database, appointment.id);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      kind: "REMINDER",
      slot: "FIRST",
      appointmentVersion: 1,
      state: "PENDING",
      reason: null,
      settledAt: null,
    });
    // Negócio que nunca configurou vale como um lembrete a 24 horas, pela
    // constante nomeada — nunca por linha fabricada.
    expect(intents[0].dueAt.getTime()).toBe(
      startAtOf(database, appointment.id).getTime() -
        DEFAULT_REMINDER_LEAD_MINUTES * MINUTE_MS,
    );
    // Mesmo commit do atendimento: a intenção não é escrita por um segundo
    // caminho depois da mutação.
    const creation = database.journal
      .writesFor("appointment")
      .find((write) => write.operation === "create");
    const intentWrite = database.journal
      .writesFor("appointmentNotificationIntent")
      .at(0);
    expect(intentWrite?.transaction).toBe(creation?.transaction);
  });

  it("cria uma intenção por posição configurada", async () => {
    const { calendar, database, reminders } = setup();
    await reminders.set({
      rules: [
        { slot: "FIRST", leadMinutes: 1_440 },
        { slot: "SECOND", leadMinutes: 60 },
      ],
    });

    const appointment = await createConfirmedAppointment(calendar);

    const intents = intentsOf(database, appointment.id);
    expect(intents.map((intent) => intent.slot)).toEqual(["FIRST", "SECOND"]);
    expect(intents.every((intent) => intent.state === "PENDING")).toBe(true);
  });

  it("negócio que desligou os lembretes não gera nenhuma intenção", async () => {
    const { calendar, database, reminders } = setup();
    await reminders.set({ rules: [] });

    const appointment = await createConfirmedAppointment(calendar);

    expect(intentsOf(database, appointment.id)).toHaveLength(0);
  });

  it("antecedência já vencida nasce dispensada com motivo, sem envio imediato", async () => {
    const { calendar, database, reminders } = setup();
    // Trinta dias de antecedência para um atendimento daqui a sete: a
    // antecedência já tinha passado quando o compromisso foi agendado.
    await reminders.set({
      rules: [{ slot: "FIRST", leadMinutes: MAX_REMINDER_LEAD_MINUTES }],
    });

    const appointment = await createConfirmedAppointment(calendar);

    const intents = intentsOf(database, appointment.id);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      state: "DISMISSED",
      reason: "LEAD_ALREADY_PASSED",
    });
    // Estado terminal tem instante de liquidação, e nada ficou pendente para
    // sair agora.
    expect(intents[0].settledAt).toBeInstanceOf(Date);
    expect(intents[0].dueAt.getTime()).toBeLessThan(Date.now());
    expect(intents.filter((intent) => intent.state === "PENDING")).toHaveLength(
      0,
    );
  });
});

describe("intenções: remarcar", () => {
  it("cancela as pendentes da versão anterior e cria as da nova, no mesmo commit", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await calendar.rescheduleAppointment(context, {
      appointmentId: appointment.id,
      date: futureDate(9),
      startTime: "10:00",
      stepMinutes: 30,
      idempotencyKey: "key-reschedule",
    });

    const intents = intentsOf(database, appointment.id);
    expect(intents).toHaveLength(2);
    const previous = intents.find((intent) => intent.appointmentVersion === 1);
    const current = intents.find((intent) => intent.appointmentVersion === 2);
    expect(previous).toMatchObject({
      state: "CANCELLED",
      reason: "APPOINTMENT_VERSION_SUPERSEDED",
    });
    expect(previous?.settledAt).toBeInstanceOf(Date);
    // O lembrete do horário velho não fica para trás: o da versão nova vence
    // pelo horário novo.
    expect(current).toMatchObject({ state: "PENDING", reason: null });
    expect(current?.dueAt.getTime()).toBe(
      startAtOf(database, appointment.id).getTime() -
        DEFAULT_REMINDER_LEAD_MINUTES * MINUTE_MS,
    );
    const update = database.journal
      .writesFor("appointment")
      .find((write) => write.operation === "update");
    const intentWrites = database.journal.writesFor(
      "appointmentNotificationIntent",
    );
    expect(intentWrites.at(-1)?.transaction).toBe(update?.transaction);
  });

  it("com notificação pedida, gera o aviso de alteração da versão nova", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await calendar.rescheduleAppointment(context, {
      appointmentId: appointment.id,
      date: futureDate(9),
      startTime: "10:00",
      stepMinutes: 30,
      notifyCustomer: true,
      idempotencyKey: "key-reschedule",
    });

    const notice = intentsOf(database, appointment.id).find(
      (intent) => intent.kind === "CHANGE_NOTICE",
    );
    expect(notice).toMatchObject({
      slot: "CHANGE_NOTICE",
      appointmentVersion: 2,
      state: "PENDING",
      reason: null,
    });
    // O aviso fala de algo que acabou de acontecer: vence no instante da
    // mutação, não espera antecedência.
    expect(notice?.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("remarcar para o mesmo horário não avisa ninguém nem duplica o lembrete", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await calendar.rescheduleAppointment(context, {
      appointmentId: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      stepMinutes: 30,
      notifyCustomer: true,
      idempotencyKey: "key-reschedule",
    });

    const intents = intentsOf(database, appointment.id);
    // Nada mudou para o cliente: a versão não subiu, então não há aviso, e a
    // recomputação repetida devolve a mesma intenção pela identidade.
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      kind: "REMINDER",
      appointmentVersion: 1,
      state: "PENDING",
    });
  });
});

describe("intenções: cancelar", () => {
  it("cancela sempre as pendentes, e sem notificação pedida não gera aviso", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      comments: "cliente pediu",
      idempotencyKey: "key-cancel",
    });

    const intents = intentsOf(database, appointment.id);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      kind: "REMINDER",
      state: "CANCELLED",
      reason: "APPOINTMENT_CANCELLED",
    });
    expect(
      intents.filter((intent) => intent.kind === "CHANGE_NOTICE"),
    ).toHaveLength(0);
  });

  it("com notificação pedida, cancela as pendentes e gera o aviso", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      notifyCustomer: true,
      idempotencyKey: "key-cancel",
    });

    const intents = intentsOf(database, appointment.id);
    expect(intents.find((intent) => intent.kind === "REMINDER")).toMatchObject({
      state: "CANCELLED",
      reason: "APPOINTMENT_CANCELLED",
    });
    expect(
      intents.find((intent) => intent.kind === "CHANGE_NOTICE"),
    ).toMatchObject({
      appointmentVersion: 2,
      state: "PENDING",
      reason: null,
    });
  });

  it("cancelar de novo não cria um segundo aviso", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      notifyCustomer: true,
      idempotencyKey: "key-cancel-1",
    });
    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      notifyCustomer: true,
      idempotencyKey: "key-cancel-2",
    });

    expect(
      intentsOf(database, appointment.id).filter(
        (intent) => intent.kind === "CHANGE_NOTICE",
      ),
    ).toHaveLength(1);
  });
});

describe("intenções: o que nunca gera lembrete", () => {
  it("concluir cancela o que estava pendente e não agenda nada novo", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await lifecycle.complete(appointment.id, { origin: "MANUAL" });

    const intents = intentsOf(database, appointment.id);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      appointmentVersion: 1,
      state: "CANCELLED",
      reason: "APPOINTMENT_NOT_CONFIRMED",
    });
  });

  it("marcar falta cancela o que estava pendente e não agenda nada novo", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await lifecycle.markNoShow(appointment.id, { note: "não veio" });

    const intents = intentsOf(database, appointment.id);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      state: "CANCELLED",
      reason: "APPOINTMENT_NOT_CONFIRMED",
    });
  });

  it.each([
    ["passado e confirmado", "CONFIRMED", -3],
    ["passado e concluído", "COMPLETED", -3],
    ["passado com falta", "NO_SHOW", -3],
    ["futuro, porém cancelado", "CANCELLED", 3],
  ])(
    "atendimento %s não gera lembrete, inclusive criado por importação",
    async (_label, status, offsetDays) => {
      const { database } = setup();
      // A linha que uma importação única cria: origem INTEGRATION, estado e
      // horário vindos da origem. São milhares de uma vez, e nenhuma delas
      // pode virar mensagem para o cliente.
      const startAt = new Date(Date.now() + offsetDays * 86_400_000);
      const imported = {
        id: `appointment-imported-${status}-${offsetDays}`,
        tenantId,
        customerId,
        source: "INTEGRATION",
        status,
        startAt,
        endAt: new Date(startAt.getTime() + 3_600_000),
        notifiableVersion: 1,
      };
      database.tables.appointment.rows.push(imported);

      await database.client.$transaction(async (transaction) =>
        recomputeAppointmentIntentsWithin(transaction as never, {
          tenantId,
          appointment: imported,
          now: new Date(),
        }),
      );

      expect(intentsOf(database, imported.id)).toHaveLength(0);
      // Nem a configuração do negócio é lida: o atendimento antigo sai da
      // recomputação sem custo de leitura.
      expect(
        database.journal.writesFor("appointmentNotificationIntent"),
      ).toHaveLength(0);
    },
  );
});
