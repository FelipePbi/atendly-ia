import { describe, expect, it } from "vitest";

import {
  serviceListSchema,
  serviceSchema,
} from "../src/data/mappers/publicApiSchemas";

/**
 * Quatro semânticas de preço (Goal007): preço ausente nunca pode virar zero
 * ao passar pelo schema que o BFF devolve ao frontend.
 */
const base = {
  id: "service-1",
  name: "Design de sobrancelha",
  durationMinutes: 30,
  active: true,
};

describe("serviceSchema", () => {
  it("keeps price fixed", () => {
    const parsed = serviceSchema.parse({
      ...base,
      priceType: "FIXED",
      price: 40,
    });
    expect(parsed.price).toBe(40);
  });

  it("keeps price null for starting-at, on-request and not-informed", () => {
    for (const priceType of ["STARTING_AT", "ON_REQUEST", "NOT_INFORMED"] as const) {
      const parsed = serviceSchema.parse({ ...base, priceType, price: null });
      expect(parsed.price).toBeNull();
      expect(parsed.price).not.toBe(0);
    }
  });

  it("accepts an absent duration as a review pendency, without a default", () => {
    const parsed = serviceSchema.parse({
      ...base,
      durationMinutes: null,
      priceType: "NOT_INFORMED",
      price: null,
      needsReview: true,
    });
    expect(parsed.durationMinutes).toBeNull();
    expect(parsed.needsReview).toBe(true);
  });

  it("stays valid for the response shape before Goal007", () => {
    const parsed = serviceSchema.parse({
      ...base,
      priceType: "ON_REQUEST",
      price: null,
    });
    expect(parsed.needsReview).toBe(false);
    expect(parsed.bufferBeforeMinutes).toBe(0);
    expect(parsed.bufferAfterMinutes).toBe(0);
  });
});

describe("serviceListSchema", () => {
  it("never turns an absent price into zero across a mixed catalog", () => {
    const parsed = serviceListSchema.parse({
      source: "ATENDLY",
      editable: true,
      items: [
        { ...base, id: "s1", priceType: "FIXED", price: 40 },
        { ...base, id: "s2", priceType: "STARTING_AT", price: 80 },
        { ...base, id: "s3", priceType: "ON_REQUEST", price: null },
        { ...base, id: "s4", priceType: "NOT_INFORMED", price: null },
      ],
    });

    expect(parsed.items.map((item) => item.price)).toEqual([40, 80, null, null]);
  });
});
