import { describe, expect, it } from "vitest";

import {
  appointmentSchema,
  availabilityExceptionSchema,
  availabilitySettingsSchema,
  blockSeriesSchema,
  seriesOccurrencePreviewSchema,
  timeBlockSchema,
} from "../src/data/mappers/publicApiSchemas";

/**
 * Goal009: buffers, série e regras de oferta são aditivos aos contratos do
 * BFF. Uma resposta anterior a este Goal — sem nenhum desses campos —
 * continua decodável, com o mesmo default que o motor já praticava.
 */

const baseAppointment = {
  id: "apt-1",
  source: "USER" as const,
  date: "2026-09-10",
  startTime: "10:00",
  endTime: "11:00",
  durationMinutes: 60,
  customerId: "customer-1",
  customer: { id: "customer-1", name: "Ana", phone: "+5511999990000" },
  services: [],
  totalPrice: null,
  comments: null,
  status: "CONFIRMED",
};

describe("appointmentSchema (Goal009)", () => {
  it("decodes a response from before this Goal with zero buffer and no series", () => {
    const parsed = appointmentSchema.parse(baseAppointment);
    expect(parsed.bufferBeforeMinutes).toBe(0);
    expect(parsed.bufferAfterMinutes).toBe(0);
    expect(parsed.seriesId).toBeNull();
  });

  it("keeps the buffer and series fields when the response carries them", () => {
    const parsed = appointmentSchema.parse({
      ...baseAppointment,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 20,
      seriesId: "series-1",
    });
    expect(parsed.bufferBeforeMinutes).toBe(10);
    expect(parsed.bufferAfterMinutes).toBe(20);
    expect(parsed.seriesId).toBe("series-1");
  });
});

describe("timeBlockSchema (Goal009)", () => {
  it("decodes a legacy block as BLOCK, without title or series", () => {
    const parsed = timeBlockSchema.parse({
      id: "block-1",
      startAt: "2026-09-10T12:00:00.000Z",
      endAt: "2026-09-10T13:00:00.000Z",
      reason: "Almoço",
    });
    expect(parsed.kind).toBe("BLOCK");
    expect(parsed.title).toBeNull();
    expect(parsed.seriesId).toBeNull();
  });

  it("accepts a personal commitment with title and series", () => {
    const parsed = timeBlockSchema.parse({
      id: "block-2",
      startAt: "2026-09-10T12:00:00.000Z",
      endAt: "2026-09-10T13:00:00.000Z",
      reason: null,
      kind: "PERSONAL",
      title: "Dentista",
      seriesId: "series-1",
    });
    expect(parsed.kind).toBe("PERSONAL");
    expect(parsed.title).toBe("Dentista");
    expect(parsed.seriesId).toBe("series-1");
  });
});

describe("availabilitySettingsSchema (Goal009)", () => {
  it("decodes a legacy response with the engine's safe defaults", () => {
    const parsed = availabilitySettingsSchema.parse({
      timezone: "America/Sao_Paulo",
      rules: [],
    });
    expect(parsed.minLeadMinutes).toBe(0);
    expect(parsed.maxLeadDays).toBe(90);
    expect(parsed.granularityMinutes).toBe(30);
  });

  it("keeps explicit offer rules", () => {
    const parsed = availabilitySettingsSchema.parse({
      timezone: "America/Sao_Paulo",
      rules: [],
      minLeadMinutes: 120,
      maxLeadDays: 30,
      granularityMinutes: 15,
    });
    expect(parsed).toMatchObject({
      minLeadMinutes: 120,
      maxLeadDays: 30,
      granularityMinutes: 15,
    });
  });
});

describe("availabilityExceptionSchema and blockSeriesSchema (Goal009)", () => {
  it("decodes an unavailability exception with a human decision", () => {
    const parsed = availabilityExceptionSchema.parse({
      id: "exc-1",
      date: "2026-09-10",
      startTime: "09:00",
      endTime: "10:00",
      available: false,
      reason: "Manutenção",
      decidedBy: "owner-1",
      decidedReason: "Fechamento excepcional",
    });
    expect(parsed.decidedBy).toBe("owner-1");
  });

  it("decodes a finite block series by occurrence count", () => {
    const parsed = blockSeriesSchema.parse({
      id: "series-1",
      kind: "PERSONAL",
      title: "Almoço",
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: "12:00",
      endTime: "13:00",
      seriesStartDate: "2026-09-10",
      seriesEndDate: null,
      occurrenceCount: 20,
      status: "ACTIVE",
      supersededById: null,
    });
    expect(parsed.occurrenceCount).toBe(20);
  });
});

describe("seriesOccurrencePreviewSchema (Goal009)", () => {
  it("decodes an unavailable occurrence", () => {
    const parsed = seriesOccurrencePreviewSchema.parse({
      index: 0,
      requestedDate: "2026-09-10",
      date: null,
      startTime: null,
      endTime: null,
      adjusted: false,
      holdId: null,
      unavailable: true,
    });
    expect(parsed.unavailable).toBe(true);
    expect(parsed.holdId).toBeNull();
  });
});
