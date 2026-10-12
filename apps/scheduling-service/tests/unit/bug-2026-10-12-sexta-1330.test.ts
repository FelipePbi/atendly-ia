/**
 * Bug de 2026-10-12 (Novo agendamento, sexta 16/10/2026, "Manutenção
 * Brasileiro", 75 min, sem buffer). Com os dados do banco local do usuário o
 * motor oferece 13:30: a recusa vista na tela vinha da reserva (hold) de
 * 13:00 da própria tela, ainda viva quando o pedido de 13:30 chegou, porque
 * o frontend não esperava a liberação antes de reservar o novo horário
 * (corrigido em `apps/frontend/src/features/agenda/holdSession.ts`). Este
 * arquivo trava o lado do motor: a grade de 30 min ancorada no início de
 * cada período oferece 13:30, e só uma reserva viva sobreposta o recusa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AvenlyAvailability } from "../../src/modules/availability/avenly-availability.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-bug-1330";
const timeZone = "America/Sao_Paulo";
const serviceId = "svc-manutencao-brasileiro";
const FRIDAY = "2026-10-16";

function databaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

/** Horário local de São Paulo (UTC-3, sem horário de verão) como instante. */
function local(time: string): Date {
  return new Date(`${FRIDAY}T${time}:00.000-03:00`);
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
    granularityMinutes: 30,
  });
  for (const dayOfWeek of [1, 2, 3, 4, 5]) {
    for (const [startTime, endTime] of [
      ["08:00", "12:00"],
      ["13:00", "19:00"],
    ]) {
      tables.availabilityRule.rows.push({
        id: `rule-${dayOfWeek}-${startTime}`,
        tenantId,
        dayOfWeek,
        startTime: databaseTime(startTime),
        endTime: databaseTime(endTime),
        active: true,
      });
    }
  }
  tables.service.rows.push({
    id: serviceId,
    tenantId,
    name: "Manutenção Brasileiro",
    durationMinutes: 75,
    priceType: "FIXED",
    price: 100,
    active: true,
    needsReview: false,
    colorToken: null,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    recurrenceIntervalDays: 7,
  });
  for (const [id, start, end] of [
    ["apt-0830", "08:30", "09:45"],
    ["apt-1500", "15:00", "16:15"],
  ]) {
    tables.appointment.rows.push({
      id,
      tenantId,
      status: "CONFIRMED",
      startAt: local(start),
      endAt: local(end),
      bufferBeforeMinutesSnapshot: 0,
      bufferAfterMinutesSnapshot: 0,
    });
  }
  tables.timeBlock.rows.push({
    id: "block-almoco",
    tenantId,
    startAt: local("12:00"),
    endAt: local("13:00"),
  });
  return {
    database,
    availability: new AvenlyAvailability(
      database.client as never,
      tenantId,
      timeZone,
    ),
  };
}

describe("bug de 2026-10-12: sexta 13:30 com 75 min", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-12T07:31:00.000Z"), toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("oferece 13:30 e só esconde 14:00, que terminaria 15:15", async () => {
    const { availability } = setup();
    const slots = await availability.getAvailableSlots({
      serviceIds: [serviceId],
      startDate: FRIDAY,
      days: 1,
      maxSlots: 100,
    } as never);
    expect(slots.map((slot) => slot.startTime)).toEqual([
      "10:00",
      "10:30",
      "13:00",
      "13:30",
      "16:30",
      "17:00",
      "17:30",
    ]);
    await expect(
      availability.assertAvailable({
        date: FRIDAY,
        startTime: "13:30",
        durationMinutes: 75,
      }),
    ).resolves.toMatchObject({ startAt: local("13:30") });
  });

  it("uma reserva viva em 13:00 (13:00–14:15) recusa 13:30; liberada, 13:30 volta", async () => {
    const { availability, database } = setup();
    const hold = {
      id: "hold-1300",
      tenantId,
      startAt: local("13:00"),
      endAt: local("14:15"),
      expiresAt: new Date("2026-10-12T07:36:00.000Z"),
      consumedAt: null,
      releasedAt: null as Date | null,
      proposedBufferBeforeMinutes: 0,
      proposedBufferAfterMinutes: 0,
    };
    database.tables.appointmentHold.rows.push(hold);
    await expect(
      availability.assertAvailable({
        date: FRIDAY,
        startTime: "13:30",
        durationMinutes: 75,
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    hold.releasedAt = new Date("2026-10-12T07:31:30.000Z");
    await expect(
      availability.assertAvailable({
        date: FRIDAY,
        startTime: "13:30",
        durationMinutes: 75,
      }),
    ).resolves.toMatchObject({ startAt: local("13:30") });
  });

  it("19:30 continua fora do expediente", async () => {
    const { availability } = setup();
    await expect(
      availability.assertAvailable({
        date: FRIDAY,
        startTime: "19:30",
        durationMinutes: 75,
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});
