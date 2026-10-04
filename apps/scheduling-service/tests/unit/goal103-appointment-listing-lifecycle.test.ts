/**
 * Goal103, WU-01: a listagem e a leitura de um agendamento trazem os seis
 * campos de ciclo de vida do contrato, e uma resposta de idempotência gravada
 * antes deste Goal continua decodificável com `null` nos seis.
 */
import { describe, expect, it } from "vitest";

import { parseCalendarAppointment } from "../../src/modules/calendar/calendar-service.js";
import {
  type AppointmentRecord,
  toAvenlyAppointment,
} from "../../src/modules/integrations/avenly/provider.js";

const LIFECYCLE_FIELDS = [
  "completedAt",
  "completionOrigin",
  "noShowAt",
  "noShowNote",
  "presenceConfirmedAt",
  "finalValue",
] as const;

function record(overrides: Record<string, unknown> = {}): AppointmentRecord {
  return {
    id: "appointment-1",
    tenantId: "tenant-a",
    source: "USER",
    title: "Corte",
    startAt: new Date("2026-10-10T12:00:00.000Z"),
    endAt: new Date("2026-10-10T12:30:00.000Z"),
    status: "CONFIRMED",
    statusRaw: "CONFIRMED",
    comments: null,
    customerId: "customer-1",
    seriesId: null,
    bufferBeforeMinutesSnapshot: 0,
    bufferAfterMinutesSnapshot: 0,
    completedAt: null,
    completedBy: null,
    completionOrigin: null,
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    finalValue: null,
    finalValueSetAt: null,
    finalValueSetBy: null,
    customer: { id: "customer-1", name: "Ana", phone: "5511900000001" },
    items: [],
    ...overrides,
  } as unknown as AppointmentRecord;
}

describe("toAvenlyAppointment (Goal103)", () => {
  it("mapeia os seis campos de ciclo de vida de um concluído com valor registrado", () => {
    const dto = toAvenlyAppointment(
      record({
        status: "COMPLETED",
        completedAt: new Date("2026-10-10T13:00:00.000Z"),
        completedBy: "owner-1",
        completionOrigin: "MANUAL",
        presenceConfirmedAt: new Date("2026-10-10T11:50:00.000Z"),
        finalValue: "149.90",
        finalValueSetAt: new Date("2026-10-10T13:05:00.000Z"),
        finalValueSetBy: "owner-1",
      }),
      "America/Sao_Paulo",
    );
    expect(dto.completedAt).toBe("2026-10-10T13:00:00.000Z");
    expect(dto.completionOrigin).toBe("MANUAL");
    expect(dto.noShowAt).toBeNull();
    expect(dto.noShowNote).toBeNull();
    expect(dto.presenceConfirmedAt).toBe("2026-10-10T11:50:00.000Z");
    expect(dto.finalValue).toBe(149.9);
  });

  it("mapeia a falta com nota", () => {
    const dto = toAvenlyAppointment(
      record({
        status: "NO_SHOW",
        noShowAt: new Date("2026-10-10T13:00:00.000Z"),
        noShowNote: "Avisou tarde",
      }),
      "America/Sao_Paulo",
    );
    expect(dto.noShowAt).toBe("2026-10-10T13:00:00.000Z");
    expect(dto.noShowNote).toBe("Avisou tarde");
    expect(dto.finalValue).toBeNull();
  });

  it("agendamento sem ciclo devolve os seis como null", () => {
    const dto = toAvenlyAppointment(record(), "America/Sao_Paulo");
    for (const field of LIFECYCLE_FIELDS) {
      expect(dto[field], field).toBeNull();
    }
  });

  it("não expõe finalValueSetAt nem finalValueSetBy", () => {
    const dto = toAvenlyAppointment(
      record({ finalValueSetAt: new Date(), finalValueSetBy: "owner-1" }),
      "America/Sao_Paulo",
    );
    expect(dto).not.toHaveProperty("finalValueSetAt");
    expect(dto).not.toHaveProperty("finalValueSetBy");
    expect(dto).not.toHaveProperty("completedBy");
  });
});

describe("parseCalendarAppointment (Goal103)", () => {
  it("replay antigo sem os campos decodifica com null pelos seis", () => {
    const legacy = {
      id: "appointment-1",
      source: "USER",
      title: null,
      date: "2026-10-10",
      startTime: "09:00",
      endTime: "09:30",
      durationMinutes: 30,
      customerId: "customer-1",
      customer: { id: "customer-1", name: "Ana", phone: null },
      services: [],
      totalPrice: null,
      totalPriceType: "NONE",
      comments: null,
      status: "CONFIRMED",
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      seriesId: null,
    };
    const parsed = parseCalendarAppointment(legacy);
    for (const field of LIFECYCLE_FIELDS) {
      expect(parsed[field], field).toBeNull();
    }
  });

  it("replay com os campos preserva os valores", () => {
    const parsed = parseCalendarAppointment({
      id: "appointment-1",
      source: "USER",
      title: null,
      date: "2026-10-10",
      startTime: "09:00",
      endTime: "09:30",
      durationMinutes: 30,
      customerId: "customer-1",
      customer: null,
      services: [],
      totalPrice: null,
      totalPriceType: "NONE",
      comments: null,
      status: "COMPLETED",
      completedAt: "2026-10-10T13:00:00.000Z",
      completionOrigin: "AUTO",
      noShowAt: null,
      noShowNote: null,
      presenceConfirmedAt: "2026-10-10T11:50:00.000Z",
      finalValue: 149.9,
    });
    expect(parsed.completedAt).toBe("2026-10-10T13:00:00.000Z");
    expect(parsed.completionOrigin).toBe("AUTO");
    expect(parsed.presenceConfirmedAt).toBe("2026-10-10T11:50:00.000Z");
    expect(parsed.finalValue).toBe(149.9);
  });
});
