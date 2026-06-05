import { describe, expect, it } from "vitest";
import { getVirtualAttendantReadinessIssues, type ApiVirtualAttendantSettings } from "@/lib/virtual-attendant";

function settings(overrides: Partial<ApiVirtualAttendantSettings> = {}): ApiVirtualAttendantSettings {
  return {
    aiEnabled: false,
    identityMode: "PROFESSIONAL",
    assistantName: "",
    assistantSex: null,
    professionalSex: "FEMALE",
    personaType: "WARM",
    customInstructions: "",
    activationMode: "ALWAYS",
    awayTimeoutMinutes: null,
    awayScope: null,
    customPersonaStatus: "NOT_STARTED",
    customPersonaProfile: null,
    customPersonaGeneratedAt: null,
    virtualAttendantOnboardingCompleted: false,
    configured: false,
    canEnable: false,
    readinessIssues: [],
    updatedAt: null,
    ...overrides,
  };
}

describe("virtual attendant readiness", () => {
  it("does not require assistant name in professional identity mode", () => {
    expect(getVirtualAttendantReadinessIssues(settings())).toEqual([]);
  });

  it("requires assistant name and sex in separate assistant mode", () => {
    expect(
      getVirtualAttendantReadinessIssues(
        settings({
          identityMode: "SEPARATE_ASSISTANT",
          assistantName: "",
          assistantSex: null,
        })
      )
    ).toEqual(["Defina o nome da atendente virtual.", "Defina o sexo da atendente virtual."]);
  });

  it("accepts separate assistant mode when name and sex are defined", () => {
    expect(
      getVirtualAttendantReadinessIssues(
        settings({
          identityMode: "SEPARATE_ASSISTANT",
          assistantName: "Bea",
          assistantSex: "FEMALE",
        })
      )
    ).toEqual([]);
  });
});
