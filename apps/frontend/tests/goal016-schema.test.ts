import { describe, expect, it } from "vitest";

import {
  appointmentSchema,
  timeBlockSchema,
} from "../src/data/mappers/publicApiSchemas";

/**
 * Goal016: os schemas de agenda já eram aditivos antes deste Goal (Goal009);
 * este teste fecha o resíduo do review008 provando, num único lugar, que a
 * resposta nova e a resposta anterior a cada campo opcional continuam
 * decodáveis, incluindo o status legado `SCHEDULED` e um bloco sem `kind`,
 * `title` nem `seriesId`.
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
};

describe("appointmentSchema (Goal016)", () => {
  it("decodes a full new response", () => {
    const parsed = appointmentSchema.parse({
      ...baseAppointment,
      title: "Corte e barba",
      status: "CONFIRMED",
      totalPriceType: "FIXED",
      completedAt: null,
      completionOrigin: null,
      noShowAt: null,
      noShowNote: null,
      presenceConfirmedAt: null,
      finalValue: null,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 5,
      seriesId: "series-1",
    });
    expect(parsed.status).toBe("CONFIRMED");
    expect(parsed.bufferBeforeMinutes).toBe(10);
    expect(parsed.seriesId).toBe("series-1");
  });

  it("decodes a legacy response without the optional fields, keeping the legacy SCHEDULED status", () => {
    const parsed = appointmentSchema.parse({
      ...baseAppointment,
      status: "SCHEDULED",
    });
    expect(parsed.status).toBe("SCHEDULED");
    expect(parsed.title).toBeNull();
    expect(parsed.totalPriceType).toBe("NONE");
    expect(parsed.completedAt).toBeNull();
    expect(parsed.bufferBeforeMinutes).toBe(0);
    expect(parsed.bufferAfterMinutes).toBe(0);
    expect(parsed.seriesId).toBeNull();
  });
});

describe("timeBlockSchema (Goal016)", () => {
  it("decodes a full new block", () => {
    const parsed = timeBlockSchema.parse({
      id: "block-1",
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

  it("decodes a block without kind, title or seriesId", () => {
    const parsed = timeBlockSchema.parse({
      id: "block-2",
      startAt: "2026-09-10T12:00:00.000Z",
      endAt: "2026-09-10T13:00:00.000Z",
      reason: "Almoço",
    });
    expect(parsed.kind).toBe("BLOCK");
    expect(parsed.title).toBeNull();
    expect(parsed.seriesId).toBeNull();
  });
});
