import { describe, expect, it } from "vitest";

import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import {
  AtendlyServiceService,
  isOperationalService,
} from "../../src/modules/services/atendly-service-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";

function service(database = createDatabaseDouble()) {
  return {
    database,
    services: new AtendlyServiceService(database.client as never, tenantId),
  };
}

describe("service catalog: four price semantics", () => {
  it("creates FIXED and STARTING_AT services requiring a non-negative price", async () => {
    const { services } = service();
    const fixed = await services.create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
    });
    expect(fixed.priceType).toBe("FIXED");
    expect(Number(fixed.price)).toBe(50);

    const startingAt = await services.create({
      name: "Coloração",
      durationMinutes: 90,
      priceType: "STARTING_AT",
      price: 120,
    });
    expect(startingAt.priceType).toBe("STARTING_AT");
    expect(Number(startingAt.price)).toBe(120);
  });

  it("creates ON_REQUEST and NOT_INFORMED services with no price", async () => {
    const { services } = service();
    const onRequest = await services.create({
      name: "Consulta",
      durationMinutes: 60,
      priceType: "ON_REQUEST",
    });
    expect(onRequest.price).toBeNull();

    const notInformed = await services.create({
      name: "Serviço importado",
      durationMinutes: 45,
      priceType: "NOT_INFORMED",
    });
    expect(notInformed.price).toBeNull();
  });

  it("refuses FIXED/STARTING_AT without a price", async () => {
    const { services } = service();
    await expect(
      services.create({ name: "Corte", durationMinutes: 30, priceType: "FIXED" }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_PRICE" });
    await expect(
      services.create({
        name: "Coloração",
        durationMinutes: 30,
        priceType: "STARTING_AT",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_PRICE" });
  });

  it("refuses ON_REQUEST/NOT_INFORMED with a price", async () => {
    const { services } = service();
    await expect(
      services.create({
        name: "Consulta",
        durationMinutes: 30,
        priceType: "ON_REQUEST",
        price: 10,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_PRICE" });
  });

  it("preserves an explicit zero price for FIXED", async () => {
    const { services } = service();
    const free = await services.create({
      name: "Avaliação gratuita",
      durationMinutes: 15,
      priceType: "FIXED",
      price: 0,
    });
    expect(Number(free.price)).toBe(0);
  });

  it("RED: never fabricates zero when price is absent for ON_REQUEST/NOT_INFORMED", async () => {
    const { services } = service();
    const onRequest = await services.create({
      name: "Consulta",
      durationMinutes: 30,
      priceType: "ON_REQUEST",
    });
    // GREEN: price stays null, never 0.
    expect(onRequest.price).not.toBe(0);
    expect(onRequest.price).toBeNull();
  });
});

describe("service catalog: review state separate from active", () => {
  it("enters review when duration is absent, with manual origin by default", async () => {
    const { services } = service();
    const created = await services.create({
      name: "Serviço incompleto",
      priceType: "ON_REQUEST",
    });
    expect(created.durationMinutes).toBeNull();
    expect(created.needsReview).toBe(true);
    expect(created.reviewOrigin).toBe("MANUAL");
  });

  it("uses the import origin when the caller informs it", async () => {
    const { services } = service();
    const created = await services.create({
      name: "Serviço importado",
      priceType: "NOT_INFORMED",
      reviewOrigin: "IMPORT",
    });
    expect(created.needsReview).toBe(true);
    expect(created.reviewOrigin).toBe("IMPORT");
  });

  it("RED: an unrelated PATCH must not overwrite the import origin with MANUAL", async () => {
    const { services } = service();
    const imported = await services.create({
      name: "Serviço importado",
      priceType: "NOT_INFORMED",
      reviewOrigin: "IMPORT",
    });
    const patched = await services.update(imported.id, {
      description: "Revisar depois",
    });
    // GREEN: the origin recorded at import time survives an edit that never
    // touches duration.
    expect(patched.reviewOrigin).toBe("IMPORT");
  });

  it("clears the review pendency once duration is corrected", async () => {
    const { services } = service();
    const created = await services.create({
      name: "Serviço incompleto",
      priceType: "ON_REQUEST",
    });
    const corrected = await services.update(created.id, {
      durationMinutes: 45,
    });
    expect(corrected.needsReview).toBe(false);
    expect(corrected.reviewOrigin).toBeNull();
    expect(corrected.durationMinutes).toBe(45);
  });

  it("refuses an invalid duration when informed", async () => {
    const { services } = service();
    await expect(
      services.create({ name: "Corte", durationMinutes: 0, priceType: "ON_REQUEST" }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_DURATION" });
  });
});

describe("service catalog: operational predicate", () => {
  it("excludes services in review or inactive from the operational list", async () => {
    const { services } = service();
    const operational = await services.create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
    });
    const inReview = await services.create({
      name: "Sem duração",
      priceType: "ON_REQUEST",
    });
    const inactive = await services.create({
      name: "Descontinuado",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
      active: false,
    });

    const listed = await services.listForScheduling();
    expect(listed.map((item) => item.id)).toEqual([operational.id]);
    expect(listed.map((item) => item.id)).not.toContain(inReview.id);
    expect(listed.map((item) => item.id)).not.toContain(inactive.id);
  });

  it("computes the same predicate used by the scheduling list", () => {
    expect(
      isOperationalService({
        active: true,
        durationMinutes: 30,
        needsReview: false,
      }),
    ).toBe(true);
    expect(
      isOperationalService({ active: true, durationMinutes: null, needsReview: true }),
    ).toBe(false);
    expect(
      isOperationalService({ active: false, durationMinutes: 30, needsReview: false }),
    ).toBe(false);
  });

  it("RED: requireActive rejects a service pending review with its own error", async () => {
    const { services } = service();
    const inReview = await services.create({
      name: "Sem duração",
      priceType: "ON_REQUEST",
    });
    // GREEN: dedicated error code, not the generic inactive one.
    await expect(services.requireActive([inReview.id])).rejects.toMatchObject({
      code: "SERVICE_NEEDS_REVIEW",
    });
  });

  it("still refuses an inactive operational-looking service as before", async () => {
    const { services } = service();
    const inactive = await services.create({
      name: "Descontinuado",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
      active: false,
    });
    await expect(services.requireActive([inactive.id])).rejects.toMatchObject({
      code: "SERVICE_INACTIVE",
    });
  });

  it("accepts an operational service for a new appointment", async () => {
    const { services } = service();
    const operational = await services.create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
    });
    const [accepted] = await services.requireActive([operational.id]);
    expect(accepted.id).toBe(operational.id);
    expect(accepted.durationMinutes).toBe(30);
  });
});

describe("service catalog: MVP attributes", () => {
  it("persists description, color token, buffers and recurrence", async () => {
    const { services } = service();
    const created = await services.create({
      name: "Manicure",
      durationMinutes: 60,
      priceType: "FIXED",
      price: 80,
      description: "Inclui esmaltação",
      colorToken: "ROSE",
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
      recurrenceIntervalDays: 14,
    });
    expect(created.description).toBe("Inclui esmaltação");
    expect(created.colorToken).toBe("ROSE");
    expect(created.bufferBeforeMinutes).toBe(5);
    expect(created.bufferAfterMinutes).toBe(10);
    expect(created.recurrenceIntervalDays).toBe(14);
  });

  it("defaults buffers to zero and leaves recurrence/description/color unset", async () => {
    const { services } = service();
    const created = await services.create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
    });
    expect(created.bufferBeforeMinutes).toBe(0);
    expect(created.bufferAfterMinutes).toBe(0);
    expect(created.recurrenceIntervalDays).toBeNull();
    expect(created.description).toBeNull();
    expect(created.colorToken).toBeNull();
  });

  it("refuses a negative buffer and a non-positive recurrence interval", async () => {
    const { services } = service();
    await expect(
      services.create({
        name: "Corte",
        durationMinutes: 30,
        priceType: "FIXED",
        price: 50,
        bufferBeforeMinutes: -1,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_BUFFER" });
    await expect(
      services.create({
        name: "Corte",
        durationMinutes: 30,
        priceType: "FIXED",
        price: 50,
        recurrenceIntervalDays: 0,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_RECURRENCE" });
  });
});

describe("service catalog: recurrenceIntervalDays reaches the /internal/services DTO", () => {
  it("carries recurrenceIntervalDays through CalendarService.listOperationalServices, the method GET /internal/services calls", async () => {
    const { database, services } = service();
    database.tables.calendarSettings.rows.push({
      id: tenantId,
      tenantId,
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    });
    const withRecurrence = await services.create({
      name: "Manicure",
      durationMinutes: 60,
      priceType: "FIXED",
      price: 80,
      recurrenceIntervalDays: 14,
    });
    const withoutRecurrence = await services.create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
    });

    const calendar = new CalendarService(database.client as never);
    const dto = await calendar.listOperationalServices({
      tenantId,
      userId: "user-1",
      requestId: "request-1",
    });

    expect(dto).toContainEqual(
      expect.objectContaining({
        id: withRecurrence.id,
        recurrenceIntervalDays: 14,
      }),
    );
    expect(dto).toContainEqual(
      expect.objectContaining({
        id: withoutRecurrence.id,
        recurrenceIntervalDays: null,
      }),
    );
  });
});

describe("service catalog: does not leak across tenants", () => {
  it("keeps operational services scoped to the tenant", async () => {
    const database = createDatabaseDouble();
    const a = new AtendlyServiceService(database.client as never, "tenant-a");
    const b = new AtendlyServiceService(database.client as never, "tenant-b");
    await a.create({
      name: "Corte A",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
    });
    expect(await b.listForScheduling()).toHaveLength(0);
  });
});
