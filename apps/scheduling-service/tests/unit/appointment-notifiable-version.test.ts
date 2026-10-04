import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AtendlyAppointmentLifecycleService } from "../../src/modules/appointments/appointment-lifecycle-service.js";
import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import {
  appointmentVersionWrite,
  notifiableAppointmentFields,
} from "../../src/modules/calendar/write-policy.js";
import { createDatabaseDouble } from "./support/database-double.js";

/**
 * Versão notificável do compromisso (Goal021): ela sobe **na mesma transação
 * da mutação**, pela política única de escrita, exatamente quando muda o que
 * o cliente precisaria saber — data, horário, serviços do acordo e estado —
 * e nunca em alteração somente interna.
 *
 * Aqui se prova a regra sem banco: qual campo move a versão, qual não move, e
 * que o incremento viaja no mesmo comando do efeito. Concorrência real e o
 * `increment` do próprio PostgreSQL são da suíte de integração.
 */

const tenantId = "tenant-a";
const timeZone = "America/Sao_Paulo";
const context = { tenantId, userId: "user-1", requestId: "request-1" };
const serviceId = "service-corte";
const otherServiceId = "service-barba";
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

function versionOf(
  database: ReturnType<typeof createDatabaseDouble>,
  appointmentId: string,
): number {
  const row = database.tables.appointment.rows.find(
    (candidate) => candidate.id === appointmentId,
  );
  if (!row) throw new Error("appointment not found in the double");
  return row.notifiableVersion as number;
}

describe("versão notificável: nasce em um", () => {
  it("atendimento novo nasce na versão 1, sem UPDATE", async () => {
    const { calendar, database } = setup();

    const appointment = await createConfirmedAppointment(calendar);

    expect(versionOf(database, appointment.id)).toBe(1);
    expect(
      database.journal
        .writesFor("appointment")
        .filter((write) => write.operation !== "create"),
    ).toHaveLength(0);
  });
});

describe("versão notificável: o que incrementa", () => {
  it("incrementa ao remarcar data e horário, no mesmo comando do efeito", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await calendar.rescheduleAppointment(context, {
      appointmentId: appointment.id,
      date: futureDate(9),
      startTime: "10:00",
      stepMinutes: 30,
      idempotencyKey: "key-reschedule",
    });

    expect(versionOf(database, appointment.id)).toBe(2);
    // Um único `update` na linha: o incremento é parte da mutação, não um
    // segundo comando depois dela.
    expect(
      database.journal
        .writesFor("appointment")
        .filter((write) => write.operation === "update"),
    ).toHaveLength(1);
  });

  it("incrementa ao cancelar, e a observação anexada não é um segundo motivo", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      comments: "cliente pediu",
      idempotencyKey: "key-cancel",
    });

    expect(versionOf(database, appointment.id)).toBe(2);
  });

  it("cancelar de novo não incrementa: não houve segunda mutação", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      idempotencyKey: "key-cancel-1",
    });
    await calendar.cancelAppointment(context, {
      appointmentId: appointment.id,
      idempotencyKey: "key-cancel-2",
    });

    expect(versionOf(database, appointment.id)).toBe(2);
  });

  it("incrementa ao concluir, na mesma transação do efeito e do evento", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await lifecycle.complete(appointment.id, { origin: "MANUAL" });

    expect(versionOf(database, appointment.id)).toBe(2);
    const effect = database.journal
      .writesFor("appointment")
      .filter((write) => write.operation === "updateMany")
      .at(-1);
    const event = database.journal
      .writesFor("appointmentEvent")
      .find((write) => write.transaction === effect?.transaction);
    expect(event).toBeDefined();
  });

  it("concluir de novo não incrementa: a repetição não é um segundo efeito", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await lifecycle.complete(appointment.id, { origin: "MANUAL" });
    await lifecycle.complete(appointment.id, { origin: "MANUAL" });

    expect(versionOf(database, appointment.id)).toBe(2);
  });

  it("incrementa ao marcar falta", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await lifecycle.markNoShow(appointment.id, { note: "não veio" });

    expect(versionOf(database, appointment.id)).toBe(2);
  });

  it("incrementa quando o conjunto de serviços do acordo muda", () => {
    const before = notifiableAppointmentFields({
      startAt: new Date("2026-10-01T12:00:00.000Z"),
      endAt: new Date("2026-10-01T13:00:00.000Z"),
      status: "CONFIRMED",
      items: [{ serviceId }],
    });

    expect(
      appointmentVersionWrite(before, {
        serviceIds: [serviceId, otherServiceId],
      }),
    ).toEqual({ notifiableVersion: { increment: 1 } });
  });
});

describe("versão notificável: o que não incrementa", () => {
  it("não incrementa ao registrar valor final", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await lifecycle.setFinalValue(appointment.id, 120);

    expect(versionOf(database, appointment.id)).toBe(1);
  });

  it("não incrementa ao confirmar presença", async () => {
    const { calendar, lifecycle, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await lifecycle.confirmPresence(appointment.id, "USER");

    expect(versionOf(database, appointment.id)).toBe(1);
  });

  it("não incrementa em observação, valor final, presença nem snapshot de buffer", () => {
    const before = notifiableAppointmentFields({
      startAt: new Date("2026-10-01T12:00:00.000Z"),
      endAt: new Date("2026-10-01T13:00:00.000Z"),
      status: "CONFIRMED",
      items: [{ serviceId }],
    });

    // Nenhum campo somente interno pertence ao vocabulário notificável: uma
    // mutação que só os escreve não descreve mudança nenhuma aqui.
    expect(appointmentVersionWrite(before, {})).toEqual({});
  });

  it("não incrementa quando a mutação grava o mesmo valor", () => {
    const startAt = new Date("2026-10-01T12:00:00.000Z");
    const endAt = new Date("2026-10-01T13:00:00.000Z");
    const before = notifiableAppointmentFields({
      startAt,
      endAt,
      status: "CONFIRMED",
      items: [{ serviceId }, { serviceId: otherServiceId }],
    });

    expect(
      appointmentVersionWrite(before, {
        startAt: new Date(startAt.getTime()),
        endAt: new Date(endAt.getTime()),
        status: "CONFIRMED",
        // Mesmo conjunto em outra ordem: o cliente contratou a mesma coisa.
        serviceIds: [otherServiceId, serviceId],
      }),
    ).toEqual({});
  });

  it("não incrementa ao remarcar para o horário em que o atendimento já está", async () => {
    const { calendar, database } = setup();
    const appointment = await createConfirmedAppointment(calendar);

    await calendar.rescheduleAppointment(context, {
      appointmentId: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      stepMinutes: 30,
      idempotencyKey: "key-reschedule-same",
    });

    expect(versionOf(database, appointment.id)).toBe(1);
  });
});

describe("versão notificável: caminho único de escrita", () => {
  it("nenhum arquivo de produção escreve a versão fora da política de escrita", () => {
    const root = join(process.cwd(), "src");
    const offenders = sourceFiles(root)
      .filter((file) => !file.includes(join("src", "generated")))
      .filter((file) => !file.endsWith(join("calendar", "write-policy.ts")))
      .filter((file) => writesNotifiableVersion(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
    // O detector não passa vazio: a própria política é reconhecida por ele.
    expect(
      writesNotifiableVersion(
        readFileSync(
          join(root, "modules", "calendar", "write-policy.ts"),
          "utf8",
        ),
      ),
    ).toBe(true);
  });

  it("nenhuma migration incrementa a versão por trigger", () => {
    const root = join(process.cwd(), "prisma", "migrations");
    const sql = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readFileSync(join(root, entry.name, "migration.sql"), "utf8"),
      )
      .join("\n");

    // Trigger seria exatamente o segundo caminho que D-006 proíbe: a versão
    // subiria fora da transação que decidiu a mutação.
    expect(sql).not.toMatch(/CREATE\s+TRIGGER/i);
    // Nenhum `SET "notifiableVersion" = ...`: a coluna nasce com default
    // constante e nunca é escrita em SQL de migration.
    expect(sql).not.toMatch(/"notifiableVersion"\s*=/i);
  });
});

/**
 * Escrita da coluna, não leitura: `{ increment }`, `{ set }` ou um número
 * literal em `data`. Ler a versão — para agendar, invalidar ou revalidar uma
 * intenção — é o uso esperado dela e não é um segundo caminho de escrita.
 */
function writesNotifiableVersion(source: string): boolean {
  return /notifiableVersion\s*:\s*(\{\s*(increment|decrement|set)\b|-?\d)/.test(
    source,
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}
