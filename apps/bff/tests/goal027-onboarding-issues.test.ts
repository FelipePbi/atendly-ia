import { describe, expect, it } from "vitest";

import {
  onboardingIssues,
  type OnboardingState,
} from "../src/lib/onboarding-state.js";

/**
 * Goal027/WU-03 — `calendar.source` perde `EXTERNAL` no vocabulário público.
 *
 * `onboardingIssues` é a única definição de configuração essencial (também
 * usada pela central de notificações). Prova, sem HTTP e sem PostgreSQL, que
 * `CALENDAR_INTEGRATION_NOT_CONNECTED` não é mais alcançável e que
 * `AVAILABILITY_REQUIRED` vale para toda fonte escolhida — hoje só `ATENDLY`.
 */
function state(overrides: Partial<OnboardingState>): OnboardingState {
  return {
    business: {
      name: "Studio",
      category: "Beleza",
      timezone: "America/Sao_Paulo",
      modalities: ["ONLINE"],
      address: null,
      contextVersion: 1,
      contextProjectedVersion: 1,
      contextProjectionStatus: "PROJECTED",
    },
    calendar: { source: null, timezone: null, integration: null },
    ai: { tone: "BALANCED" },
    service: null,
    availability: null,
    whatsapp: null,
    completed: false,
    completedAt: null,
    ...overrides,
  } as OnboardingState;
}

describe("Goal027/WU-03: onboardingIssues sem CALENDAR_INTEGRATION_NOT_CONNECTED", () => {
  it("sem fonte escolhida, só CALENDAR_NOT_SELECTED entra na área de agenda", () => {
    const issues = onboardingIssues(state({}));
    expect(issues).toContain("CALENDAR_NOT_SELECTED");
    expect(issues).not.toContain("ACTIVE_SERVICE_REQUIRED");
    expect(issues).not.toContain("AVAILABILITY_REQUIRED");
    expect(issues).not.toContain("CALENDAR_INTEGRATION_NOT_CONNECTED");
  });

  it("fonte ATENDLY sem regra ativa gera AVAILABILITY_REQUIRED, nunca CALENDAR_INTEGRATION_NOT_CONNECTED", () => {
    const issues = onboardingIssues(
      state({
        calendar: {
          source: "ATENDLY",
          timezone: "America/Sao_Paulo",
          integration: null,
        },
        service: {
          id: "s1",
          name: "Corte",
          durationMinutes: 60,
          priceType: "FIXED",
          price: 100,
          active: true,
        } as OnboardingState["service"],
        availability: {
          timezone: "America/Sao_Paulo",
          rules: [],
          minLeadMinutes: 0,
          maxLeadDays: 90,
          granularityMinutes: 30,
        },
      }),
    );
    expect(issues).toContain("AVAILABILITY_REQUIRED");
    expect(issues).not.toContain("CALENDAR_INTEGRATION_NOT_CONNECTED");
    expect(issues).not.toContain("ACTIVE_SERVICE_REQUIRED");
  });

  it("fonte escolhida com serviço ativo e regra ativa não gera pendência de agenda", () => {
    const issues = onboardingIssues(
      state({
        calendar: {
          source: "ATENDLY",
          timezone: "America/Sao_Paulo",
          integration: null,
        },
        service: {
          id: "s1",
          name: "Corte",
          durationMinutes: 60,
          priceType: "FIXED",
          price: 100,
          active: true,
        } as OnboardingState["service"],
        availability: {
          timezone: "America/Sao_Paulo",
          rules: [
            {
              id: "rule-1",
              dayOfWeek: 1,
              startTime: "09:00",
              endTime: "18:00",
              active: true,
            },
          ],
          minLeadMinutes: 0,
          maxLeadDays: 90,
          granularityMinutes: 30,
        },
      }),
    );
    expect(issues).not.toContain("ACTIVE_SERVICE_REQUIRED");
    expect(issues).not.toContain("AVAILABILITY_REQUIRED");
    expect(issues).not.toContain("CALENDAR_NOT_SELECTED");
    expect(issues).not.toContain("CALENDAR_INTEGRATION_NOT_CONNECTED");
  });
});
