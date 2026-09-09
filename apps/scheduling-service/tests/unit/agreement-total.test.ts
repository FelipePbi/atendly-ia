import { describe, expect, it } from "vitest";

import { computeAgreementTotal } from "../../src/modules/calendar/calendar-provider.js";

describe("agreement total: single rule for the whole agreement", () => {
  it("sums the total when every item is FIXED", () => {
    expect(
      computeAgreementTotal([
        { priceType: "FIXED", price: 50 },
        { priceType: "FIXED", price: 30 },
      ]),
    ).toEqual({ type: "FIXED", amount: 80 });
  });

  it("preserves an explicit zero price in the FIXED total", () => {
    expect(
      computeAgreementTotal([{ priceType: "FIXED", price: 0 }]),
    ).toEqual({ type: "FIXED", amount: 0 });
  });

  it('is "starting at" when some item is STARTING_AT and none is unpriced', () => {
    expect(
      computeAgreementTotal([
        { priceType: "FIXED", price: 50 },
        { priceType: "STARTING_AT", price: 30 },
      ]),
    ).toEqual({ type: "STARTING_AT", amount: 80 });
  });

  it("has no total when any item is ON_REQUEST", () => {
    expect(
      computeAgreementTotal([
        { priceType: "FIXED", price: 50 },
        { priceType: "ON_REQUEST", price: null },
      ]),
    ).toEqual({ type: "NONE", amount: null });
  });

  it("has no total when any item is NOT_INFORMED", () => {
    expect(
      computeAgreementTotal([
        { priceType: "FIXED", price: 50 },
        { priceType: "NOT_INFORMED", price: null },
      ]),
    ).toEqual({ type: "NONE", amount: null });
  });

  it("has no total for an empty agreement", () => {
    expect(computeAgreementTotal([])).toEqual({ type: "NONE", amount: null });
  });
});
