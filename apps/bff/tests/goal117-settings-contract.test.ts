import { settingsStateSchema } from "@avenly-ia/public-api-contract";
import { describe, expect, it } from "vitest";

/**
 * Goal117/WU-01: `ai.pausedAt` é opcional e anulável em `GET/PATCH
 * /v1/settings`. Resposta anterior ao Goal, sem o campo, continua válida.
 */
const base = {
  business: null,
  ai: { enabled: false, tone: "BALANCED" },
  calendar: {
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
    integration: null,
    capabilities: {
      manageAvailability: true,
      manageServices: true,
      manageCustomers: true,
      createAppointments: true,
      migrate: true,
      aiActivationReady: true,
    },
  },
  availability: null,
};

describe("Goal117/WU-01: settingsStateSchema ai.pausedAt", () => {
  it("aceita resposta sem o campo", () => {
    const parsed = settingsStateSchema.parse(base);
    expect(parsed.ai.pausedAt).toBeUndefined();
  });

  it("aceita null", () => {
    const parsed = settingsStateSchema.parse({
      ...base,
      ai: { ...base.ai, pausedAt: null },
    });
    expect(parsed.ai.pausedAt).toBeNull();
  });

  it("aceita instante ISO e preserva o valor", () => {
    const parsed = settingsStateSchema.parse({
      ...base,
      ai: { ...base.ai, pausedAt: "2026-10-05T12:00:00.000Z" },
    });
    expect(parsed.ai.pausedAt).toBe("2026-10-05T12:00:00.000Z");
  });

  it("recusa valor que não é instante", () => {
    expect(() =>
      settingsStateSchema.parse({
        ...base,
        ai: { ...base.ai, pausedAt: "ontem" },
      }),
    ).toThrow();
  });
});
