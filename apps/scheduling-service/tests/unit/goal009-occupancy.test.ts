import { describe, expect, it } from "vitest";

import { AtendlyAppointmentSeriesService } from "../../src/modules/appointments/appointment-series-service.js";
import { AtendlyAvailability } from "../../src/modules/availability/atendly-availability.js";
import {
  createExtraAvailability,
  createUnavailability,
  removeAvailabilityException,
} from "../../src/modules/calendar/availability-exceptions.js";
import {
  createBlockSeries,
  editBlockSeriesFromDate,
  moveBlockOccurrence,
  removeBlockOccurrence,
  removeBlockSeriesFuture,
} from "../../src/modules/calendar/block-series.js";
import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import { callerSource } from "../../src/shared/auth/internal-auth.js";
import { localDateTimeToInstant } from "../../src/shared/date-time/calendar-date-time.js";
import { createDatabaseDouble } from "./support/database-double.js";

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

function setup(offerRules: Partial<{
  minLeadMinutes: number;
  maxLeadDays: number;
  granularityMinutes: number;
}> = {}) {
  const database = createDatabaseDouble();
  const { tables } = database;
  tables.calendarSettings.rows.push({
    id: tenantId,
    tenantId,
    source: "ATENDLY",
    timezone: timeZone,
    minLeadMinutes: offerRules.minLeadMinutes ?? 0,
    maxLeadDays: offerRules.maxLeadDays ?? 90,
    granularityMinutes: offerRules.granularityMinutes ?? 30,
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
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    recurrenceIntervalDays: 7,
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

function createInput(overrides: Record<string, unknown> = {}) {
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

describe("Goal009: regras de oferta", () => {
  it("nao oferece slot antes da antecedencia minima", async () => {
    const { database } = setup({ minLeadMinutes: 24 * 60 });
    const date = futureDate(0);
    const slots = await new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceId],
      startDate: date,
      days: 1,
      maxSlots: 100,
    } as never);
    // Toda a janela de hoje cai dentro das 24h de antecedencia minima.
    expect(slots).toHaveLength(0);
  });

  it("nao oferece slot depois da antecedencia maxima", async () => {
    const { database } = setup({ maxLeadDays: 1 });
    const farDate = futureDate(10);
    const slots = await new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceId],
      startDate: farDate,
      days: 1,
      maxSlots: 100,
    } as never);
    expect(slots).toHaveLength(0);
  });

  it("usa o passo da granularidade do negocio, ignorando stepMinutes do chamador", async () => {
    const { database } = setup({ granularityMinutes: 45 });
    const date = futureDate(7);
    const slots = await new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceId],
      startDate: date,
      days: 1,
      maxSlots: 3,
      stepMinutes: 5,
    } as never);
    expect(slots.map((slot) => slot.startTime)).toEqual([
      "08:00",
      "08:45",
      "09:30",
    ]);
  });

  it("confirmacao fora da grade do negocio e recusada", async () => {
    const { calendar } = setup({ granularityMinutes: 45 });
    await expect(
      calendar.createAppointment(
        context,
        createInput({ startTime: "08:20", stepMinutes: 5 }),
      ),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});

describe("Goal009: buffers como ocupacao externa", () => {
  it("ocupa o intervalo estendido para terceiros e nao soma buffers intermediarios", async () => {
    const { calendar, database } = setup();
    database.tables.service.rows[0].bufferBeforeMinutes = 10;
    database.tables.service.rows[0].bufferAfterMinutes = 20;
    const date = futureDate(7);

    const appointment = await calendar.createAppointment(
      context,
      createInput({ date, startTime: "10:00" }),
    );
    expect(appointment.bufferBeforeMinutes).toBe(10);
    expect(appointment.bufferAfterMinutes).toBe(20);
    // Horario exibido nao muda por causa do buffer.
    expect(appointment.startTime).toBe("10:00");
    expect(appointment.endTime).toBe("11:00");

    // Vizinho imediatamente apos o fim (11:00) cai dentro do buffer de 20
    // minutos depois: recusado para quem nao tem override.
    await expect(
      calendar.createAppointment(
        context,
        createInput({
          date,
          startTime: "11:00",
          idempotencyKey: "key-neighbor-after",
        }),
      ),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    // O proximo passo da grade (11:30) ja esta fora do buffer de 20 minutos.
    const after = await calendar.createAppointment(
      context,
      createInput({
        date,
        startTime: "11:30",
        idempotencyKey: "key-after-buffer",
      }),
    );
    expect(after.startTime).toBe("11:30");
  });

  it("editar o catalogo depois nao move a ocupacao do atendimento ja confirmado", async () => {
    const { calendar, database } = setup();
    database.tables.service.rows[0].bufferAfterMinutes = 30;
    const date = futureDate(7);
    const appointment = await calendar.createAppointment(
      context,
      createInput({ date, startTime: "10:00" }),
    );
    expect(appointment.bufferAfterMinutes).toBe(30);

    // Catalogo muda depois da confirmacao.
    database.tables.service.rows[0].bufferAfterMinutes = 0;

    const slots = await new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceId],
      startDate: date,
      days: 1,
      maxSlots: 100,
    } as never);
    // 11:00-11:30 continua ocupado pelo snapshot antigo, mesmo com o
    // catalogo zerado.
    expect(slots.some((slot) => slot.startTime === "11:00")).toBe(false);
  });

  it("atendimento legado (sem snapshot) ocupa sem buffer", async () => {
    const { database } = setup();
    const date = futureDate(7);
    database.tables.appointment.rows.push({
      id: "legacy-1",
      tenantId,
      customerId,
      source: "USER",
      startAt: new Date(`${date}T13:00:00.000-03:00`),
      endAt: new Date(`${date}T14:00:00.000-03:00`),
      status: "CONFIRMED",
      createdBy: "user-1",
      comments: null,
      // bufferBeforeMinutesSnapshot/After ausentes de proposito: e o que a
      // migration aditiva deixa para linha legada.
    });
    const slots = await new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceId],
      startDate: date,
      days: 1,
      maxSlots: 100,
    } as never);
    // Sem buffer: 12:00-13:00 livre e 14:00-15:00 livre, so o proprio
    // intervalo do legado (13:00-14:00) ocupado.
    expect(slots.some((slot) => slot.startTime === "12:00")).toBe(true);
    expect(slots.some((slot) => slot.startTime === "14:00")).toBe(true);
    expect(slots.some((slot) => slot.startTime === "13:00")).toBe(false);
  });

  /**
   * Fronteira da janela consultada (Goal009, criterio 3).
   *
   * `assertAvailable` consulta `days: 1`, entao o vizinho do dia anterior — ou
   * do dia seguinte — tem o intervalo **cru** fora do range, e so a ocupacao
   * estendida pelo buffer alcanca o slot pedido. Se a busca nao alargar a
   * janela pelo maior buffer gravado, esse vizinho some do calculo e o slot e
   * oferecido como livre.
   */
  it("vizinho fora do range cru bloqueia o slot pelo buffer (fronteira da meia-noite)", async () => {
    const { database } = setup();
    // Agenda 24h para que a meia-noite seja um slot ofertavel.
    for (const rule of database.tables.availabilityRule.rows) {
      rule.startTime = databaseTime("00:00");
      rule.endTime = databaseTime("23:00");
    }
    const day = futureDate(7);
    const nextDay = futureDate(8);

    // Vizinho do dia anterior: termina exatamente as 00:00 do dia seguinte e
    // ocupa mais 30 minutos por buffer depois.
    database.tables.appointment.rows.push({
      id: "neighbor-before-midnight",
      tenantId,
      customerId,
      source: "USER",
      startAt: new Date(`${day}T23:00:00.000-03:00`),
      endAt: new Date(`${nextDay}T00:00:00.000-03:00`),
      status: "CONFIRMED",
      createdBy: "user-1",
      comments: null,
      bufferBeforeMinutesSnapshot: 0,
      bufferAfterMinutesSnapshot: 30,
    });

    const availability = new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    );
    await expect(
      availability.assertAvailable({
        date: nextDay,
        startTime: "00:00",
        durationMinutes: 60,
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    // 00:30 e o primeiro instante fora do buffer: o bloqueio para exatamente
    // onde a ocupacao estendida acaba, sem comer a grade alem dela.
    await expect(
      availability.assertAvailable({
        date: nextDay,
        startTime: "00:30",
        durationMinutes: 60,
      }),
    ).resolves.toBeTruthy();
  });

  it("vizinho que comeca depois do fim do range bloqueia pelo proprio bufferBefore", async () => {
    const { database } = setup();
    for (const rule of database.tables.availabilityRule.rows) {
      rule.startTime = databaseTime("00:00");
      rule.endTime = databaseTime("23:59");
    }
    const day = futureDate(7);
    const nextDay = futureDate(8);

    // Vizinho comeca as 00:00 do dia seguinte — fora do range cru de `day` —
    // e reserva 30 minutos antes de si.
    database.tables.appointment.rows.push({
      id: "neighbor-after-range",
      tenantId,
      customerId,
      source: "USER",
      startAt: new Date(`${nextDay}T00:00:00.000-03:00`),
      endAt: new Date(`${nextDay}T01:00:00.000-03:00`),
      status: "CONFIRMED",
      createdBy: "user-1",
      comments: null,
      bufferBeforeMinutesSnapshot: 60,
      bufferAfterMinutesSnapshot: 0,
    });

    const availability = new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    );
    // 22:30-23:30 cai dentro da ocupacao estendida [23:00, 01:00) do vizinho.
    await expect(
      availability.assertAvailable({
        date: day,
        startTime: "22:30",
        durationMinutes: 60,
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    // 22:00-22:30 termina antes de o buffer do vizinho comecar.
    await expect(
      availability.assertAvailable({
        date: day,
        startTime: "22:00",
        durationMinutes: 30,
      }),
    ).resolves.toBeTruthy();
  });
});

describe("Goal009: excecoes de disponibilidade", () => {
  it("disponibilidade extra abre slots em dia normalmente fechado", async () => {
    const { database } = setup();
    const date = futureDate(7);
    // Fecha o dia inteiro removendo a regra ativa; simula dia sem grade.
    database.tables.availabilityRule.rows.length = 0;

    const before = await new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceId],
      startDate: date,
      days: 1,
      maxSlots: 10,
    } as never);
    expect(before).toHaveLength(0);

    await createExtraAvailability(database.client as never, {
      tenantId,
      timeZone,
      date,
      startTime: "09:00",
      endTime: "10:00",
    });

    const after = await new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceId],
      startDate: date,
      days: 1,
      maxSlots: 10,
    } as never);
    expect(after.some((slot) => slot.startTime === "09:00")).toBe(true);
  });

  it("indisponibilidade sobre atendimento confirmado e recusada sem decisao humana [RED] e aceita com ela [GREEN]", async () => {
    const { calendar, database } = setup();
    const date = futureDate(7);
    await calendar.createAppointment(
      context,
      createInput({ date, startTime: "10:00" }),
    );

    await expect(
      createUnavailability(database.client as never, {
        tenantId,
        timeZone,
        date,
        startTime: "09:30",
        endTime: "11:00",
        reason: "Manutencao",
      }),
    ).rejects.toMatchObject({ code: "EXCEPTION_APPOINTMENT_CONFLICT" });

    const exception = await createUnavailability(database.client as never, {
      tenantId,
      timeZone,
      date,
      startTime: "09:30",
      endTime: "11:00",
      reason: "Manutencao",
      decision: { decidedBy: "owner-1", decidedReason: "Fechamento excepcional" },
    });
    expect(exception.decidedBy).toBe("owner-1");
    expect(exception.decidedReason).toBe("Fechamento excepcional");

    // A excecao nunca altera o atendimento existente.
    const appointments = await database.client.appointment.findMany({
      where: { tenantId },
    });
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe("CONFIRMED");
    expect(appointments[0].startAt.getTime()).toBe(
      localDateTimeToInstant(date, "10:00", timeZone).getTime(),
    );
  });

  it("remove excecao sob a politica unica", async () => {
    const { database } = setup();
    const date = futureDate(7);
    const exception = await createExtraAvailability(database.client as never, {
      tenantId,
      timeZone,
      date,
      startTime: "09:00",
      endTime: "10:00",
    });
    await removeAvailabilityException(database.client as never, {
      tenantId,
      timeZone,
      id: exception.id,
    });
    expect(database.tables.availabilityException.rows).toHaveLength(0);
  });
});

describe("Goal009: series de bloqueio/compromisso", () => {
  it("materializa ocorrencias finitas por contagem e respeita o teto", async () => {
    const { database } = setup();
    const series = await createBlockSeries(database.client as never, {
      tenantId,
      timeZone,
      createdBy: "user-1",
      rule: {
        kind: "PERSONAL",
        title: "Almoco",
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: "12:00",
        endTime: "13:00",
        seriesStartDate: futureDate(1),
        occurrenceCount: 5,
      },
    });
    const occurrences = database.tables.timeBlock.rows.filter(
      (row) => row.seriesId === series.id,
    );
    expect(occurrences).toHaveLength(5);
    expect(occurrences.every((row) => row.kind === "PERSONAL")).toBe(true);
  });

  it("recusa serie sem termino (nem data nem contagem)", async () => {
    const { database } = setup();
    await expect(
      createBlockSeries(database.client as never, {
        tenantId,
        timeZone,
        createdBy: "user-1",
        rule: {
          kind: "BLOCK",
          title: null,
          daysOfWeek: [1],
          startTime: "12:00",
          endTime: "13:00",
          seriesStartDate: futureDate(1),
        } as never,
      }),
    ).rejects.toMatchObject({ code: "INVALID_BLOCK_SERIES_TERMINATION" });
  });

  it("reporta conflito por ocorrencia e recusa sem decisao; aceita pulando ou forcando", async () => {
    const { calendar, database } = setup();
    const conflictDate = futureDate(2);
    const weekday = new Date(`${conflictDate}T12:00:00.000-03:00`).getUTCDay();
    await calendar.createAppointment(
      context,
      createInput({ date: conflictDate, startTime: "12:00" }),
    );

    await expect(
      createBlockSeries(database.client as never, {
        tenantId,
        timeZone,
        createdBy: "user-1",
        rule: {
          kind: "BLOCK",
          title: null,
          daysOfWeek: [weekday],
          startTime: "12:00",
          endTime: "13:00",
          seriesStartDate: conflictDate,
          occurrenceCount: 2,
        },
      }),
    ).rejects.toMatchObject({ code: "BLOCK_SERIES_APPOINTMENT_CONFLICT" });
    expect(database.tables.timeBlock.rows).toHaveLength(0);

    const skipped = await createBlockSeries(database.client as never, {
      tenantId,
      timeZone,
      createdBy: "user-1",
      rule: {
        kind: "BLOCK",
        title: null,
        daysOfWeek: [weekday],
        startTime: "12:00",
        endTime: "13:00",
        seriesStartDate: conflictDate,
        occurrenceCount: 2,
      },
      skipConflicts: true,
    });
    const skippedOccurrences = database.tables.timeBlock.rows.filter(
      (row) => row.seriesId === skipped.id,
    );
    // A ocorrencia do dia com conflito foi pulada; so a seguinte foi criada.
    expect(skippedOccurrences).toHaveLength(1);
  });

  it("remove ou move uma ocorrencia sem tocar a serie", async () => {
    const { database } = setup();
    const weekday = new Date(
      `${futureDate(1)}T12:00:00.000-03:00`,
    ).getUTCDay();
    const series = await createBlockSeries(database.client as never, {
      tenantId,
      timeZone,
      createdBy: "user-1",
      rule: {
        kind: "BLOCK",
        title: null,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: "12:00",
        endTime: "13:00",
        seriesStartDate: futureDate(1),
        occurrenceCount: 3,
      },
    });
    void weekday;
    const occurrences = database.tables.timeBlock.rows.filter(
      (row) => row.seriesId === series.id,
    );
    await removeBlockOccurrence(database.client as never, {
      tenantId,
      timeZone,
      id: occurrences[0].id,
    });
    expect(
      database.tables.timeBlock.rows.filter((row) => row.seriesId === series.id),
    ).toHaveLength(2);
    const stillActive = await database.client.blockSeries.findUnique({
      where: { tenantId_id: { tenantId, id: series.id } },
    });
    expect(stillActive?.status).toBe("ACTIVE");

    // Capturado antes da chamada: o dublê muda a mesma linha em memória, e
    // `occurrences[1]` referencia esse objeto — ler depois compararia o novo
    // valor consigo mesmo.
    const originalStart = occurrences[1].startAt.getTime();
    const originalEnd = occurrences[1].endAt.getTime();
    const moved = await moveBlockOccurrence(database.client as never, {
      tenantId,
      timeZone,
      id: occurrences[1].id,
      startAt: new Date(originalStart + 3_600_000),
      endAt: new Date(originalEnd + 3_600_000),
    });
    expect(moved.startAt.getTime()).toBe(originalStart + 3_600_000);
  });

  it("edita a serie desta data em diante preservando ocorrencias passadas e removendo so as futuras", async () => {
    const { database } = setup();
    const start = futureDate(1);
    const series = await createBlockSeries(database.client as never, {
      tenantId,
      timeZone,
      createdBy: "user-1",
      rule: {
        kind: "BLOCK",
        title: null,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: "12:00",
        endTime: "13:00",
        seriesStartDate: start,
        occurrenceCount: 4,
      },
    });
    const editFrom = futureDate(3);
    const edited = await editBlockSeriesFromDate(database.client as never, {
      tenantId,
      timeZone,
      seriesId: series.id,
      fromDate: editFrom,
      rule: { startTime: "14:00", endTime: "15:00" },
      createdBy: "user-1",
    });

    const oldSeries = await database.client.blockSeries.findUnique({
      where: { tenantId_id: { tenantId, id: series.id } },
    });
    expect(oldSeries?.status).toBe("ENDED");
    expect(oldSeries?.supersededById).toBe(edited.id);

    const oldOccurrences = database.tables.timeBlock.rows.filter(
      (row) => row.seriesId === series.id,
    );
    // So as ocorrencias antes de editFrom sobrevivem na serie antiga.
    for (const occurrence of oldOccurrences) {
      expect(
        occurrence.occurrenceDate.toISOString().slice(0, 10) < editFrom,
      ).toBe(true);
    }
    const newOccurrences = database.tables.timeBlock.rows.filter(
      (row) => row.seriesId === edited.id,
    );
    expect(newOccurrences.length).toBeGreaterThan(0);
  });

  it("remocao da serie remove so as ocorrencias futuras", async () => {
    const { database } = setup();
    const series = await createBlockSeries(database.client as never, {
      tenantId,
      timeZone,
      createdBy: "user-1",
      rule: {
        kind: "BLOCK",
        title: null,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: "12:00",
        endTime: "13:00",
        seriesStartDate: futureDate(1),
        occurrenceCount: 3,
      },
    });
    await removeBlockSeriesFuture(database.client as never, {
      tenantId,
      timeZone,
      seriesId: series.id,
    });
    expect(
      database.tables.timeBlock.rows.filter((row) => row.seriesId === series.id),
    ).toHaveLength(0);
    const ended = await database.client.blockSeries.findUnique({
      where: { tenantId_id: { tenantId, id: series.id } },
    });
    expect(ended?.status).toBe("ENDED");
  });
});

describe("Goal009: serie de atendimento", () => {
  it("preview cria um hold por ocorrencia e confirmacao cria tudo com seriesId, em uma transacao", async () => {
    const { database } = setup();
    const service = new AtendlyAppointmentSeriesService(
      database.client as never,
      tenantId,
      timeZone,
    );
    const firstDate = futureDate(7);
    const preview = await service.preview({
      serviceIds: [serviceId],
      occurrenceCount: 3,
      intervalDays: 7,
      firstDate,
      firstStartTime: "09:00",
      customerId,
      source: "AI",
    });
    expect(preview).toHaveLength(3);
    expect(preview.every((occurrence) => occurrence.holdId)).toBe(true);
    expect(database.tables.appointmentHold.rows).toHaveLength(3);

    const confirmed = await service.confirm({
      occurrences: preview.map((occurrence) => ({
        holdId: occurrence.holdId as string,
      })),
      serviceIds: [serviceId],
      intervalDays: 7,
      customerId,
      source: "AI",
      createdBy: "user-1",
      idempotencyKey: "key-series-confirm",
    });
    expect(confirmed).toHaveLength(3);
    const seriesId = confirmed[0].seriesId;
    expect(seriesId).toBeTruthy();
    expect(confirmed.every((appointment) => appointment.seriesId === seriesId)).toBe(
      true,
    );
    expect(database.tables.appointment.rows).toHaveLength(3);
    // Cada ocorrencia tem exatamente um evento CREATED e um HOLD_CONSUMED.
    for (const appointment of confirmed) {
      const events = database.tables.appointmentEvent.rows.filter(
        (event) => event.appointmentId === appointment.id,
      );
      expect(events.map((event) => event.type)).toEqual([
        "CREATED",
        "HOLD_CONSUMED",
      ]);
    }
  });

  it("[RED] hold vencido na confirmacao interrompe a serie com erro proprio", async () => {
    // Atomicidade real (nada criado quando uma ocorrencia POSTERIOR falha,
    // via rollback de transacao Serializable) so pode ser provada contra
    // PostgreSQL de verdade — o dublê documentadamente não desfaz escrita
    // (ver `database-double.ts`). Aqui a ocorrência vencida é a primeira, o
    // que já basta para provar, sem banco, que a checagem por ocorrência
    // interrompe a série com o erro correto em vez de confirmar por cima do
    // hold vencido; o caso de rollback completo está coberto na suíte de
    // integração do Goal008 para o mesmo mecanismo (hold único) e é o
    // padrão que a série reutiliza.
    const { database } = setup();
    const service = new AtendlyAppointmentSeriesService(
      database.client as never,
      tenantId,
      timeZone,
    );
    const firstDate = futureDate(7);
    const preview = await service.preview({
      serviceIds: [serviceId],
      occurrenceCount: 2,
      intervalDays: 7,
      firstDate,
      firstStartTime: "09:00",
      customerId,
      source: "AI",
    });
    const firstHold = database.tables.appointmentHold.rows.find(
      (row) => row.id === preview[0].holdId,
    );
    if (firstHold) firstHold.expiresAt = new Date(Date.now() - 60_000);

    await expect(
      service.confirm({
        occurrences: preview.map((occurrence) => ({
          holdId: occurrence.holdId as string,
        })),
        serviceIds: [serviceId],
        intervalDays: 7,
        customerId,
        source: "AI",
        createdBy: "user-1",
        idempotencyKey: "key-series-red",
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_HOLD_EXPIRED" });

    // Nada e criado antes da ocorrencia que falhou.
    expect(database.tables.appointment.rows).toHaveLength(0);
    expect(database.tables.appointmentSeries.rows).toHaveLength(1);
  });

  it("respeita o teto de ocorrencias configurado", async () => {
    const { database } = setup();
    const service = new AtendlyAppointmentSeriesService(
      database.client as never,
      tenantId,
      timeZone,
    );
    await expect(
      service.preview({
        serviceIds: [serviceId],
        occurrenceCount: 10_000,
        intervalDays: 7,
        firstDate: futureDate(7),
        firstStartTime: "09:00",
        customerId,
        source: "AI",
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_SERIES_TOO_LONG" });
  });
});

describe("Goal009: source derivado do chamador", () => {
  it("bff fala em nome de uma pessoa (USER) e a IA fala em nome dela mesma (AI)", () => {
    expect(callerSource("bff")).toBe("USER");
    expect(callerSource("ai-orchestrator")).toBe("AI");
  });
});

describe("Goal009: serie de atendimento — falha identificada e idempotencia", () => {
  it("identifica a ocorrencia que falhou e devolve alternativas", async () => {
    const { database } = setup();
    const service = new AtendlyAppointmentSeriesService(
      database.client as never,
      tenantId,
      timeZone,
    );
    const firstDate = futureDate(7);
    const preview = await service.preview({
      serviceIds: [serviceId],
      occurrenceCount: 2,
      intervalDays: 7,
      firstDate,
      firstStartTime: "09:00",
      customerId,
      source: "USER",
    });

    // A segunda ocorrencia e tomada entre o preview e a confirmacao por
    // alguem que ignorou a grade (override humano). O hold continua VIGENTE:
    // a falha vem do motor de disponibilidade, nao do hold — e e exatamente
    // por isso que a resposta precisa dizer QUAL ocorrencia caiu.
    const second = preview[1];
    database.tables.appointment.rows.push({
      id: "intruder-1",
      tenantId,
      customerId,
      source: "USER",
      startAt: localDateTimeToInstant(
        second.date as string,
        second.startTime as string,
        timeZone,
      ),
      endAt: localDateTimeToInstant(
        second.date as string,
        second.endTime as string,
        timeZone,
      ),
      status: "CONFIRMED",
      createdBy: "user-2",
      comments: null,
      bufferBeforeMinutesSnapshot: 0,
      bufferAfterMinutesSnapshot: 0,
    });

    const failure = await service
      .confirm({
        occurrences: preview.map((occurrence) => ({
          holdId: occurrence.holdId as string,
        })),
        serviceIds: [serviceId],
        intervalDays: 7,
        customerId,
        source: "USER",
        createdBy: "user-1",
        idempotencyKey: "key-series-taken",
      })
      .catch((error: unknown) => error as { code: string; details: unknown });

    expect(failure.code).toBe("SLOT_UNAVAILABLE");
    const details = failure.details as {
      occurrenceIndex: number;
      holdId: string;
      occurrenceDate: string;
      alternatives: Array<{ startTime: string }>;
    };
    expect(details.occurrenceIndex).toBe(1);
    expect(details.holdId).toBe(second.holdId);
    expect(details.occurrenceDate).toBe(second.date);
    expect(details.alternatives.length).toBeGreaterThan(0);
    // A alternativa oferecida nao pode ser o horario que acabou de ser tomado.
    expect(
      details.alternatives.some(
        (slot) => slot.startTime === second.startTime,
      ),
    ).toBe(false);
  });

  it("retentativa com a mesma Idempotency-Key faz replay em vez de criar de novo", async () => {
    const { database } = setup();
    const service = new AtendlyAppointmentSeriesService(
      database.client as never,
      tenantId,
      timeZone,
    );
    const preview = await service.preview({
      serviceIds: [serviceId],
      occurrenceCount: 2,
      intervalDays: 7,
      firstDate: futureDate(7),
      firstStartTime: "09:00",
      customerId,
      source: "USER",
    });
    const occurrences = preview.map((occurrence) => ({
      holdId: occurrence.holdId as string,
    }));
    const confirmInput = {
      occurrences,
      serviceIds: [serviceId],
      intervalDays: 7,
      customerId,
      source: "USER" as const,
      createdBy: "user-1",
      idempotencyKey: "key-series-replay",
    };

    const first = await service.confirm(confirmInput);
    const replay = await service.confirm(confirmInput);

    expect(first).toHaveLength(2);
    expect(replay.map((appointment) => appointment.id)).toEqual(
      first.map((appointment) => appointment.id),
    );
    // Sem replay, a segunda chamada bateria no hold ja consumido (409); com
    // replay, nada novo e criado.
    expect(database.tables.appointment.rows).toHaveLength(2);
    expect(database.tables.appointmentSeries.rows).toHaveLength(1);
  });

  it("recusa na confirmacao uma lista de ocorrencias acima do teto", async () => {
    const { database } = setup();
    const service = new AtendlyAppointmentSeriesService(
      database.client as never,
      tenantId,
      timeZone,
    );
    await expect(
      service.confirm({
        occurrences: Array.from({ length: 10_000 }, (_, index) => ({
          holdId: `hold-${index}`,
        })),
        serviceIds: [serviceId],
        intervalDays: 7,
        customerId,
        source: "USER",
        createdBy: "user-1",
        idempotencyKey: "key-series-over-cap",
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_SERIES_TOO_LONG" });
    // Recusado antes de reivindicar chave ou tocar a agenda.
    expect(database.tables.appointmentSeries.rows).toHaveLength(0);
  });
});

/**
 * Isolamento por tenant das entidades novas (Goal009, criterio 1).
 *
 * Regra de oferta, excecao, bloco, serie de bloqueio e serie de atendimento de
 * B nao aparecem, nao ocupam e nao mudam em A. O tenant vem do contexto
 * autenticado; header, body e query nao o escolhem — isso e provado no BFF, e
 * aqui a prova e que o proprio dominio nunca cruza a fronteira.
 */
describe("Goal009: isolamento por tenant das entidades novas", () => {
  const otherTenant = "tenant-b";
  const otherService = "service-b";
  const otherCustomer = "customer-b";

  function seedOtherTenant(database: ReturnType<typeof createDatabaseDouble>) {
    database.tables.calendarSettings.rows.push({
      id: otherTenant,
      tenantId: otherTenant,
      source: "ATENDLY",
      timezone: timeZone,
      minLeadMinutes: 0,
      maxLeadDays: 90,
      granularityMinutes: 30,
    });
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      database.tables.availabilityRule.rows.push({
        id: `rule-b-${dayOfWeek}`,
        tenantId: otherTenant,
        dayOfWeek,
        startTime: databaseTime("08:00"),
        endTime: databaseTime("18:00"),
        active: true,
      });
    }
    database.tables.service.rows.push({
      id: otherService,
      tenantId: otherTenant,
      name: "Corte B",
      durationMinutes: 60,
      priceType: "FIXED",
      price: 50,
      active: true,
      needsReview: false,
      colorToken: null,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      recurrenceIntervalDays: 7,
    });
    database.tables.customer.rows.push({
      id: otherCustomer,
      tenantId: otherTenant,
      name: "Bia",
      phone: "+5511988880000",
      normalizedPhone: "5511988880000",
    });
  }

  it("regra de oferta de B nao muda a grade de A", async () => {
    const { database } = setup({ granularityMinutes: 30 });
    seedOtherTenant(database);
    // B fecha o horizonte e muda o passo; A nao pode sentir nada disso.
    const settingsB = database.tables.calendarSettings.rows.find(
      (row) => row.tenantId === otherTenant,
    );
    settingsB!.granularityMinutes = 15;
    settingsB!.maxLeadDays = 1;

    const date = futureDate(7);
    const slots = await new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceId],
      startDate: date,
      days: 1,
      maxSlots: 100,
    } as never);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => slot.startTime.endsWith(":00") || slot.startTime.endsWith(":30"))).toBe(true);
  });

  it("bloco, excecao e serie de bloqueio de B nao ocupam nem aparecem em A", async () => {
    const { database } = setup();
    seedOtherTenant(database);
    const date = futureDate(7);

    await createBlockSeries(database.client as never, {
      tenantId: otherTenant,
      timeZone,
      createdBy: "user-b",
      rule: {
        kind: "BLOCK",
        title: "Almoco de B",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: "09:00",
        endTime: "10:00",
        seriesStartDate: date,
        occurrenceCount: 1,
      },
    });
    await createUnavailability(database.client as never, {
      tenantId: otherTenant,
      timeZone,
      date,
      startTime: null,
      endTime: null,
      reason: "fechado em B",
    });

    // A grade de A no dia continua inteira.
    const slots = await new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceId],
      startDate: date,
      days: 1,
      maxSlots: 100,
    } as never);
    expect(slots.some((slot) => slot.startTime === "09:00")).toBe(true);
    expect(slots.length).toBeGreaterThan(0);

    // E o inverso: B esta fechado o dia inteiro por causa da propria excecao.
    const slotsB = await new AtendlyAvailability(
      database.client as never,
      otherTenant,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [otherService],
      startDate: date,
      days: 1,
      maxSlots: 100,
    } as never);
    expect(slotsB).toHaveLength(0);
  });

  it("A nao remove ocorrencia, serie nem excecao de B", async () => {
    const { database } = setup();
    seedOtherTenant(database);
    const date = futureDate(7);

    const seriesB = await createBlockSeries(database.client as never, {
      tenantId: otherTenant,
      timeZone,
      createdBy: "user-b",
      rule: {
        kind: "PERSONAL",
        title: "Consulta de B",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: "09:00",
        endTime: "10:00",
        seriesStartDate: date,
        occurrenceCount: 2,
      },
    });
    const exceptionB = await createExtraAvailability(
      database.client as never,
      {
        tenantId: otherTenant,
        timeZone,
        date: futureDate(9),
        startTime: "19:00",
        endTime: "20:00",
      },
    );
    const occurrenceB = database.tables.timeBlock.rows.find(
      (row) => row.tenantId === otherTenant,
    );
    const blocksBefore = database.tables.timeBlock.rows.filter(
      (row) => row.tenantId === otherTenant,
    ).length;
    expect(blocksBefore).toBe(2);

    // Tudo abaixo e A pedindo, com o id de B em maos.
    await expect(
      removeBlockOccurrence(database.client as never, {
        tenantId,
        timeZone,
        id: occurrenceB!.id as string,
      }),
    ).rejects.toBeTruthy();
    await expect(
      removeBlockSeriesFuture(database.client as never, {
        tenantId,
        timeZone,
        seriesId: seriesB.id,
      }),
    ).rejects.toBeTruthy();
    await expect(
      removeAvailabilityException(database.client as never, {
        tenantId,
        timeZone,
        id: exceptionB.id as string,
      }),
    ).rejects.toBeTruthy();

    expect(
      database.tables.timeBlock.rows.filter(
        (row) => row.tenantId === otherTenant,
      ),
    ).toHaveLength(blocksBefore);
    expect(
      database.tables.blockSeries.rows.find((row) => row.id === seriesB.id)
        ?.status,
    ).toBe("ACTIVE");
    expect(
      database.tables.availabilityException.rows.some(
        (row) => row.id === exceptionB.id,
      ),
    ).toBe(true);
  });

  it("serie de atendimento de B nao ocupa a agenda de A nem e confirmavel por A", async () => {
    const { database } = setup();
    seedOtherTenant(database);
    const firstDate = futureDate(7);
    const seriesB = new AtendlyAppointmentSeriesService(
      database.client as never,
      otherTenant,
      timeZone,
    );
    const previewB = await seriesB.preview({
      serviceIds: [otherService],
      occurrenceCount: 2,
      intervalDays: 7,
      firstDate,
      firstStartTime: "09:00",
      customerId: otherCustomer,
      source: "USER",
    });
    expect(previewB.every((occurrence) => occurrence.holdId)).toBe(true);

    // Os holds de B nao ocupam nada em A.
    const slots = await new AtendlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ).getAvailableSlots({
      serviceIds: [serviceId],
      startDate: firstDate,
      days: 1,
      maxSlots: 100,
    } as never);
    expect(slots.some((slot) => slot.startTime === "09:00")).toBe(true);

    // E A nao confirma a serie de B nem tendo os ids dos holds.
    const seriesA = new AtendlyAppointmentSeriesService(
      database.client as never,
      tenantId,
      timeZone,
    );
    await expect(
      seriesA.confirm({
        occurrences: previewB.map((occurrence) => ({
          holdId: occurrence.holdId as string,
        })),
        serviceIds: [serviceId],
        intervalDays: 7,
        customerId,
        source: "USER",
        createdBy: "user-1",
        idempotencyKey: "key-cross-tenant",
      }),
    ).rejects.toBeTruthy();
    expect(database.tables.appointment.rows).toHaveLength(0);
  });
});
