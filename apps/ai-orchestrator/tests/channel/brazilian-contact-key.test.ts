import { describe, expect, it } from "vitest";

import {
  brazilianMobileVariants,
  whatsAppBrazilianKey,
} from "../../src/modules/channel/conversation-resolution.js";

describe("chave de contato de celular brasileiro (2026-10-18)", () => {
  it("celular tem as duas formas; fixo e numero de fora, so uma", () => {
    expect(brazilianMobileVariants("5555999837958")).toEqual([
      "5555999837958",
      "555599837958",
    ]);
    expect(brazilianMobileVariants("555599837958")).toEqual([
      "555599837958",
      "5555999837958",
    ]);
    expect(brazilianMobileVariants("555532221234")).toEqual(["555532221234"]);
    expect(brazilianMobileVariants("14155550123")).toEqual(["14155550123"]);
  });

  it("DDD 11 a 28 leva o 9o digito; DDD 31 em diante, nao", () => {
    expect(whatsAppBrazilianKey("551199999999")).toBe("5511999999999");
    expect(whatsAppBrazilianKey("5528999999999")).toBe("5528999999999");
    expect(whatsAppBrazilianKey("5531999999999")).toBe("553199999999");
    expect(whatsAppBrazilianKey("5555999837958")).toBe("555599837958");
    expect(whatsAppBrazilianKey("555532221234")).toBe("555532221234");
  });
});
