import { describe, expect, it } from "vitest";
import { normalizeVirtualAttendantSettings } from "../../src/modules/virtual-attendant/virtual-attendant.js";

describe("virtual attendant settings", () => {
  it("maps a legacy warm payload to the supported light and close tone", () => {
    const settings = normalizeVirtualAttendantSettings({
      assistantName: "Bea",
      personaType: "WARM",
    });

    expect(settings).toEqual({ aiEnabled: true, tone: "LIGHT_CLOSE" });
  });
});
