import { describe, expect, it } from "vitest";

import {
  onboardingStateSchema,
  settingsStateSchema,
} from "../src/data/mappers/publicApiSchemas";

/**
 * Goal018/WU-01+WU-03: modalidades, endereço e versionamento do contexto de
 * negócio são aditivos em `business` nas duas leituras (`GET /v1/onboarding`
 * e `GET /v1/settings`). Opcionais: a resposta anterior a este Goal, sem
 * nenhum dos cinco campos, continua decodificando.
 */

const legacyOnboardingBusiness = {
  name: "Salão da Ana",
  category: "Beleza",
  timezone: "America/Sao_Paulo",
};

const legacySettingsBusiness = {
  ...legacyOnboardingBusiness,
  language: "pt-BR",
  currency: "BRL",
};

const legacyOnboardingState = {
  business: null,
  calendar: { source: null, timezone: null, integration: null },
  ai: { tone: null },
  service: null,
  availability: null,
  whatsapp: null,
  completed: false,
  completedAt: null,
};

const legacySettingsState = {
  business: null,
  ai: { enabled: false, tone: null },
  calendar: {
    source: null,
    timezone: null,
    integration: null,
    capabilities: {
      manageAvailability: false,
      manageServices: false,
      manageCustomers: false,
      createAppointments: false,
      migrate: false,
    },
  },
  availability: null,
};

const newBusinessFields = {
  modalities: ["ON_SITE", "ONLINE"] as const,
  address: "Rua das Flores, 100",
  contextVersion: 3,
  contextProjectedVersion: 2,
  contextProjectionStatus: "PENDING" as const,
};

describe("onboardingStateSchema business (Goal018)", () => {
  it("decodifica a resposta antiga: sem modalities, address ou versionamento", () => {
    const parsed = onboardingStateSchema.parse({
      ...legacyOnboardingState,
      business: legacyOnboardingBusiness,
    });

    expect(parsed.business?.modalities).toBeUndefined();
    expect(parsed.business?.address).toBeUndefined();
    expect(parsed.business?.contextVersion).toBeUndefined();
    expect(parsed.business?.contextProjectedVersion).toBeUndefined();
    expect(parsed.business?.contextProjectionStatus).toBeUndefined();
  });

  it("decodifica os campos novos com o tipo correto", () => {
    const parsed = onboardingStateSchema.parse({
      ...legacyOnboardingState,
      business: { ...legacyOnboardingBusiness, ...newBusinessFields },
    });

    expect(parsed.business?.modalities).toEqual(["ON_SITE", "ONLINE"]);
    expect(parsed.business?.address).toBe("Rua das Flores, 100");
    expect(parsed.business?.contextVersion).toBe(3);
    expect(parsed.business?.contextProjectedVersion).toBe(2);
    expect(parsed.business?.contextProjectionStatus).toBe("PENDING");
  });

  it("decodifica address nulo (negócio sem ON_SITE)", () => {
    const parsed = onboardingStateSchema.parse({
      ...legacyOnboardingState,
      business: {
        ...legacyOnboardingBusiness,
        ...newBusinessFields,
        modalities: ["ONLINE"],
        address: null,
      },
    });

    expect(parsed.business?.address).toBeNull();
  });

  it("recusa modalidade fora do vocabulário aceito", () => {
    expect(() =>
      onboardingStateSchema.parse({
        ...legacyOnboardingState,
        business: {
          ...legacyOnboardingBusiness,
          ...newBusinessFields,
          modalities: ["REMOTE"],
        },
      }),
    ).toThrow();
  });

  it("recusa contextProjectionStatus fora do vocabulário aceito", () => {
    expect(() =>
      onboardingStateSchema.parse({
        ...legacyOnboardingState,
        business: {
          ...legacyOnboardingBusiness,
          ...newBusinessFields,
          contextProjectionStatus: "UNKNOWN",
        },
      }),
    ).toThrow();
  });

  it("recusa contextVersion de tipo errado (string em vez de número)", () => {
    expect(() =>
      onboardingStateSchema.parse({
        ...legacyOnboardingState,
        business: {
          ...legacyOnboardingBusiness,
          ...newBusinessFields,
          contextVersion: "3",
        },
      }),
    ).toThrow();
  });
});

describe("settingsStateSchema business (Goal018)", () => {
  it("decodifica a resposta antiga: sem modalities, address ou versionamento", () => {
    const parsed = settingsStateSchema.parse({
      ...legacySettingsState,
      business: legacySettingsBusiness,
    });

    expect(parsed.business?.modalities).toBeUndefined();
    expect(parsed.business?.address).toBeUndefined();
    expect(parsed.business?.contextProjectionStatus).toBeUndefined();
  });

  it("decodifica os campos novos com o tipo correto", () => {
    const parsed = settingsStateSchema.parse({
      ...legacySettingsState,
      business: { ...legacySettingsBusiness, ...newBusinessFields },
    });

    expect(parsed.business?.modalities).toEqual(["ON_SITE", "ONLINE"]);
    expect(parsed.business?.address).toBe("Rua das Flores, 100");
    expect(parsed.business?.contextVersion).toBe(3);
    expect(parsed.business?.contextProjectedVersion).toBe(2);
    expect(parsed.business?.contextProjectionStatus).toBe("PENDING");
  });

  it("recusa modalidade de tipo errado (número em vez de string)", () => {
    expect(() =>
      settingsStateSchema.parse({
        ...legacySettingsState,
        business: {
          ...legacySettingsBusiness,
          ...newBusinessFields,
          modalities: [1],
        },
      }),
    ).toThrow();
  });
});
