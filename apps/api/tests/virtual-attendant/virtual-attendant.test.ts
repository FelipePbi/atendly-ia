import { describe, expect, it } from "vitest";
import { normalizeVirtualAttendantSettings } from "../../src/modules/virtual-attendant/virtual-attendant.js";

describe("virtual attendant settings", () => {
  it("defaults legacy payloads to professional identity mode", () => {
    const settings = normalizeVirtualAttendantSettings({
      assistantName: "Bea",
      personaType: "WARM"
    });

    expect(settings.identityMode).toBe("PROFESSIONAL");
    expect(settings.assistantName).toBe("Bea");
    expect(settings.assistantSex).toBeNull();
  });
});
