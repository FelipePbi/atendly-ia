import { describe, expect, it } from "vitest";

import { AvenlyAppointmentSeriesService } from "../../src/modules/appointments/appointment-series-service.js";
import { AvenlyAvailability } from "../../src/modules/availability/avenly-availability.js";
import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import { localDateTimeToInstant } from "../../src/shared/date-time/calendar-date-time.js";
import { createDatabaseDouble } from "./support/database-double.js";

/**
 * D-207 — duração do serviço por atendimento: na criação (com o hold e a
 * série) e depois de marcado, sempre com o padrão do catálogo ao lado.
 */

const tenantId = "tenant-a";
const timeZone = "America/Sao_Paulo";
const context = { tenantId, userId: "user-1", requestId: "request-1" };
const serviceId = "service-corte";
const otherServiceId = "service-escova";
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
    minLeadMinutes: 0,
    maxLeadDays: 90,
    granularityMinutes: 15,
    customerChangeMinNoticeMinutes: 0,
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
  for (const [id, name, durationMinutes] of [
    [serviceId, "Corte", 40],
    [otherServiceId, "Escova", 30],
  ] as const) {
    tables.service.rows.push({
      id,
      tenantId,
      name,
      durationMinutes,
      priceType: "FIXED",
      price: 50,
      active: true,
      needsReview: false,
      colorToken: null,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      recurrenceIntervalDays: 7,
    });
  }
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

const date = futureDate(7);

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    serviceIds: [serviceId],
    date,
    startTime: "09:00",
    customerId,
    stepMinutes: 15,
    idempotencyKey: `key-${Math.random()}`,
    source: "USER" as const,
    ...overrides,
  };
}

function changeInput(
  appointmentId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    appointmentId,
    services: [{ serviceId, durationMinutes: 60 }],
    source: "USER" as const,
    idempotencyKey: `key-duration-${Math.random()}`,
    ...overrides,
  };
}

/** Atendimento de outra pessoa ocupando `[start, end)` no mesmo dia. */
function occupy(
  database: ReturnType<typeof setup>["database"],
  start: string,
  end: string,
) {
  database.tables.appointment.rows.push({
    id: `neighbor-${start}`,
    tenantId,
    customerId,
    source: "USER",
    status: "CONFIRMED",
    startAt: localDateTimeToInstant(date, start, timeZone),
    endAt: localDateTimeToInstant(date, end, timeZone),
    bufferBeforeMinutesSnapshot: 0,
    bufferAfterMinutesSnapshot: 0,
  });
}

describe("D-207: duração ajustada na criação", () => {
  it("sem ajuste, o item nasce com o padrão do catálogo dos dois lados", async () => {
    const { calendar } = setup();
    const appointment = await calendar.createAppointment(
      context,
      createInput(),
    );
    expect(appointment.endTime).toBe("09:40");
    expect(appointment.durationMinutes).toBe(40);
    expect(appointment.services[0]).toMatchObject({
      durationMinutes: 40,
      defaultDurationMinutes: 40,
    });
  });

  it("com ajuste, o fim e o item usam a duração deste atendimento e o padrão fica ao lado", async () => {
    const { calendar, database } = setup();
    const appointment = await calendar.createAppointment(
      context,
      createInput({
        serviceIds: [serviceId, otherServiceId],
        serviceDurations: [{ serviceId, durationMinutes: 60 }],
      }),
    );
    expect(appointment.durationMinutes).toBe(90);
    expect(appointment.endTime).toBe("10:30");
    expect(appointment.services).toEqual([
      expect.objectContaining({
        serviceId,
        durationMinutes: 60,
        defaultDurationMinutes: 40,
      }),
      expect.objectContaining({
        serviceId: otherServiceId,
        durationMinutes: 30,
        defaultDurationMinutes: 30,
      }),
    ]);
    // O catálogo não muda.
    expect(
      database.tables.service.rows.find((row) => row.id === serviceId)
        ?.durationMinutes,
    ).toBe(40);
  });

  it("a disponibilidade procura o intervalo do tamanho ajustado", async () => {
    const { database } = setup();
    occupy(database, "09:45", "10:30");
    const availability = new AvenlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    );
    const standard = await availability.getAvailableSlots({
      serviceIds: [serviceId],
      startDate: date,
      days: 1,
      maxSlots: 100,
    });
    const adjusted = await availability.getAvailableSlots({
      serviceIds: [serviceId],
      serviceDurations: [{ serviceId, durationMinutes: 60 }],
      startDate: date,
      days: 1,
      maxSlots: 100,
    });
    expect(standard.map((slot) => slot.startTime)).toContain("09:00");
    expect(adjusted.map((slot) => slot.startTime)).not.toContain("09:00");
    expect(adjusted.find((slot) => slot.startTime === "08:45")?.endTime).toBe(
      "09:45",
    );
  });

  it("o hold segura o intervalo ajustado e a confirmação com o mesmo ajuste o consome", async () => {
    const { calendar, database } = setup();
    const hold = await calendar.createHold(context, {
      source: "USER",
      serviceIds: [serviceId],
      serviceDurations: [{ serviceId, durationMinutes: 60 }],
      date,
      startTime: "09:00",
      idempotencyKey: "key-hold",
    });
    expect(hold.durationMinutes).toBe(60);
    expect(hold.endTime).toBe("10:00");
    expect(database.tables.appointmentHold.rows[0].proposedServiceDurations).toEqual(
      [{ serviceId, durationMinutes: 60 }],
    );

    const appointment = await calendar.createAppointment(
      context,
      createInput({
        holdId: hold.id,
        serviceDurations: [{ serviceId, durationMinutes: 60 }],
      }),
    );
    expect(appointment.endTime).toBe("10:00");
    expect(database.tables.appointmentHold.rows[0].consumedAt).toBeTruthy();
  });

  it("a confirmação maior do que o hold não o consome", async () => {
    const { calendar } = setup();
    const hold = await calendar.createHold(context, {
      source: "USER",
      serviceIds: [serviceId],
      date,
      startTime: "09:00",
      idempotencyKey: "key-hold-default",
    });
    await expect(
      calendar.createAppointment(
        context,
        createInput({
          holdId: hold.id,
          serviceDurations: [{ serviceId, durationMinutes: 60 }],
        }),
      ),
    ).rejects.toMatchObject({
      code: "APPOINTMENT_HOLD_EXPIRED",
      details: expect.objectContaining({ reason: "SLOT_MISMATCH" }),
    });
  });

  it("a IA nunca ajusta: o pedido com duração é recusado, não ignorado", async () => {
    const { calendar } = setup();
    await expect(
      calendar.createAppointment(
        context,
        createInput({
          source: "AI",
          serviceDurations: [{ serviceId, durationMinutes: 60 }],
        }),
      ),
    ).rejects.toMatchObject({ code: "SERVICE_DURATION_OVERRIDE_NOT_ALLOWED" });
    await expect(
      calendar.createHold(context, {
        source: "AI",
        serviceIds: [serviceId],
        serviceDurations: [{ serviceId, durationMinutes: 60 }],
        date,
        startTime: "09:00",
        idempotencyKey: "key-hold-ai",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_DURATION_OVERRIDE_NOT_ALLOWED" });
  });

  it("recusa duração de serviço fora do atendimento e duração inválida", async () => {
    const { calendar } = setup();
    await expect(
      calendar.createAppointment(
        context,
        createInput({
          serviceDurations: [
            { serviceId: otherServiceId, durationMinutes: 60 },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "SERVICE_DURATION_SERVICE_MISMATCH" });
    await expect(
      calendar.createAppointment(
        context,
        createInput({
          serviceDurations: [{ serviceId, durationMinutes: 0 }],
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_DURATION" });
  });

  it("a série usa o ajuste em toda ocorrência, do hold até o item", async () => {
    const { database } = setup();
    const service = new AvenlyAppointmentSeriesService(
      database.client as never,
      tenantId,
      timeZone,
    );
    const preview = await service.preview({
      serviceIds: [serviceId],
      serviceDurations: [{ serviceId, durationMinutes: 60 }],
      occurrenceCount: 2,
      intervalDays: 7,
      firstDate: date,
      firstStartTime: "09:00",
      customerId,
      source: "USER",
    });
    expect(preview.map((occurrence) => occurrence.endTime)).toEqual([
      "10:00",
      "10:00",
    ]);
    const confirmed = await service.confirm({
      occurrences: preview.map((occurrence) => ({
        holdId: occurrence.holdId as string,
      })),
      serviceIds: [serviceId],
      intervalDays: 7,
      customerId,
      source: "USER",
      createdBy: "user-1",
      idempotencyKey: "key-series",
    });
    for (const appointment of confirmed) {
      expect(appointment.endTime).toBe("10:00");
      expect(appointment.services[0]).toMatchObject({
        durationMinutes: 60,
        defaultDurationMinutes: 40,
      });
    }
  });
});

describe("D-207: duração ajustada depois de marcado", () => {
  it("aumentar com horário livre muda o fim, registra o evento e a atividade", async () => {
    const { calendar, database } = setup();
    const created = await calendar.createAppointment(context, createInput());
    const versionBefore = database.tables.appointment.rows[0].notifiableVersion;
    const intentsBefore =
      database.tables.appointmentNotificationIntent.rows.length;

    const updated = await calendar.changeAppointmentDuration(
      context,
      changeInput(created.id),
    );
    expect(updated.startTime).toBe("09:00");
    expect(updated.endTime).toBe("10:00");
    expect(updated.services[0]).toMatchObject({
      durationMinutes: 60,
      defaultDurationMinutes: 40,
    });

    const event = database.tables.appointmentEvent.rows.find(
      (row) => row.type === "DURATION_CHANGED",
    );
    expect(event).toMatchObject({
      source: "USER",
      before: expect.objectContaining({ durationMinutes: 40, endTime: "09:40" }),
      after: expect.objectContaining({ durationMinutes: 60, endTime: "10:00" }),
    });
    const activity = database.tables.activityLog.rows.find(
      (row) => row.action === "appointment.duration_changed",
    );
    expect(activity).toMatchObject({
      actorType: "USER",
      entityType: "appointment",
      entityId: created.id,
      changes: [{ field: "durationMinutes", before: 40, after: 60 }],
    });
    // Alteração que o cliente não precisa saber: nada de versão nova nem de
    // intenção de envio nova (lembretes ficam como estavam).
    expect(database.tables.appointment.rows[0].notifiableVersion).toBe(
      versionBefore,
    );
    expect(database.tables.appointmentNotificationIntent.rows).toHaveLength(
      intentsBefore,
    );
  });

  it("aumentar sobre outro atendimento é recusado como a remarcação, e o encaixe com motivo passa", async () => {
    const { calendar, database } = setup();
    const created = await calendar.createAppointment(context, createInput());
    occupy(database, "09:45", "10:30");

    await expect(
      calendar.changeAppointmentDuration(context, changeInput(created.id)),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    expect(database.tables.appointment.rows[0].endAt).toEqual(
      localDateTimeToInstant(date, "09:40", timeZone),
    );

    const forced = await calendar.changeAppointmentDuration(
      context,
      changeInput(created.id, {
        overlapOverride: true,
        overlapOverrideReason: "Caso especial combinado com a cliente",
      }),
    );
    expect(forced.endTime).toBe("10:00");
    const types = database.tables.appointmentEvent.rows
      .filter((row) => row.appointmentId === created.id)
      .map((row) => row.type);
    expect(types).toEqual(["CREATED", "DURATION_CHANGED", "OVERLAP_OVERRIDE"]);
  });

  it("aumentar para depois do expediente é recusado", async () => {
    const { calendar } = setup();
    const created = await calendar.createAppointment(
      context,
      createInput({ startTime: "17:00" }),
    );
    await expect(
      calendar.changeAppointmentDuration(context, changeInput(created.id, {
        services: [{ serviceId, durationMinutes: 90 }],
      })),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("diminuir não ocupa tempo novo e não é revalidado", async () => {
    const { calendar, database } = setup();
    const created = await calendar.createAppointment(
      context,
      createInput({ serviceDurations: [{ serviceId, durationMinutes: 60 }] }),
    );
    // Um vizinho encaixado por cima depois: diminuir continua possível.
    occupy(database, "09:30", "10:00");
    const updated = await calendar.changeAppointmentDuration(
      context,
      changeInput(created.id, {
        services: [{ serviceId, durationMinutes: 40 }],
      }),
    );
    expect(updated.endTime).toBe("09:40");
    expect(updated.services[0]).toMatchObject({
      durationMinutes: 40,
      defaultDurationMinutes: 40,
    });
  });

  it("pedir a mesma duração não grava evento", async () => {
    const { calendar, database } = setup();
    const created = await calendar.createAppointment(context, createInput());
    await calendar.changeAppointmentDuration(
      context,
      changeInput(created.id, {
        services: [{ serviceId, durationMinutes: 40 }],
      }),
    );
    expect(
      database.tables.appointmentEvent.rows.map((row) => row.type),
    ).toEqual(["CREATED"]);
  });

  it("a lista descreve o atendimento inteiro: serviço a menos ou a mais é recusado", async () => {
    const { calendar } = setup();
    const created = await calendar.createAppointment(
      context,
      createInput({ serviceIds: [serviceId, otherServiceId] }),
    );
    await expect(
      calendar.changeAppointmentDuration(context, changeInput(created.id)),
    ).rejects.toMatchObject({ code: "SERVICE_DURATION_SERVICE_MISMATCH" });
    await expect(
      calendar.changeAppointmentDuration(
        context,
        changeInput(created.id, {
          services: [
            { serviceId, durationMinutes: 60 },
            { serviceId: otherServiceId, durationMinutes: 30 },
            { serviceId: "service-outro", durationMinutes: 30 },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "SERVICE_DURATION_SERVICE_MISMATCH" });
  });

  it("cancelado, concluído e pedido da IA são recusados", async () => {
    const { calendar, database } = setup();
    const created = await calendar.createAppointment(context, createInput());
    await expect(
      calendar.changeAppointmentDuration(
        context,
        changeInput(created.id, { source: "AI" }),
      ),
    ).rejects.toMatchObject({ code: "SERVICE_DURATION_OVERRIDE_NOT_ALLOWED" });

    database.tables.appointment.rows[0].status = "COMPLETED";
    await expect(
      calendar.changeAppointmentDuration(context, changeInput(created.id)),
    ).rejects.toMatchObject({ code: "APPOINTMENT_DURATION_CHANGE_INVALID" });

    database.tables.appointment.rows[0].status = "CANCELLED";
    await expect(
      calendar.changeAppointmentDuration(context, changeInput(created.id)),
    ).rejects.toMatchObject({ code: "APPOINTMENT_CANCELLED" });
  });

  it("repetir a mesma chave devolve o resultado sem segundo efeito", async () => {
    const { calendar, database } = setup();
    const created = await calendar.createAppointment(context, createInput());
    const input = changeInput(created.id, { idempotencyKey: "key-same" });
    const first = await calendar.changeAppointmentDuration(context, input);
    const second = await calendar.changeAppointmentDuration(context, input);
    expect(second).toEqual(first);
    expect(
      database.tables.appointmentEvent.rows.filter(
        (row) => row.type === "DURATION_CHANGED",
      ),
    ).toHaveLength(1);
  });
});
