import { describe, expect, it } from "vitest";

import {
  patchSchema,
  serviceSchema,
} from "../src/modules/services/routes.js";

/**
 * Decisão de 2026-10-12: a criação manual de serviço pela API pública
 * (`POST /v1/services`) exige `colorToken`; na edição a cor pode ser trocada,
 * nunca removida. Onboarding e importação não passam por este corpo — o
 * Scheduling sorteia a cor da paleta.
 */
const base = {
  name: "Corte",
  durationMinutes: 30,
  priceType: "FIXED",
  price: 50,
};

describe("POST /v1/services: cor obrigatória", () => {
  it("recusa a criação sem cor", () => {
    const result = serviceSchema.safeParse(base);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(
      "colorToken",
    );
  });

  it("recusa a criação com cor nula ou fora da paleta", () => {
    expect(serviceSchema.safeParse({ ...base, colorToken: null }).success).toBe(
      false,
    );
    expect(
      serviceSchema.safeParse({ ...base, colorToken: "#FF0000" }).success,
    ).toBe(false);
  });

  it("aceita a criação com uma cor da paleta", () => {
    const result = serviceSchema.safeParse({ ...base, colorToken: "SKY" });
    expect(result.success).toBe(true);
    expect(result.data?.colorToken).toBe("SKY");
  });
});

describe("cor personalizada (2026-10-18)", () => {
  it("aceita a criação com uma cor hex, em minúsculas", () => {
    const result = serviceSchema.safeParse({ ...base, colorHex: "#7A9E7E" });
    expect(result.success).toBe(true);
    expect(result.data?.colorHex).toBe("#7a9e7e");
  });

  it("recusa hex malformado e as duas cores ao mesmo tempo", () => {
    expect(serviceSchema.safeParse({ ...base, colorHex: "7a9e7e" }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...base, colorHex: "#7a9e7" }).success).toBe(false);
    expect(
      serviceSchema.safeParse({ ...base, colorToken: "SKY", colorHex: "#7a9e7e" }).success,
    ).toBe(false);
    expect(
      patchSchema.safeParse({ colorToken: "SKY", colorHex: "#7a9e7e" }).success,
    ).toBe(false);
  });

  it("na edição troca entre sugerida e personalizada, sem remover", () => {
    expect(patchSchema.safeParse({ colorHex: "#7a9e7e" }).success).toBe(true);
    expect(patchSchema.safeParse({ colorToken: "SKY" }).success).toBe(true);
    expect(patchSchema.safeParse({ colorHex: null }).success).toBe(false);
  });
});

describe("PATCH /v1/services/:id: cor editável, nunca removida", () => {
  it("aceita trocar a cor e aceita corpo sem cor", () => {
    expect(patchSchema.safeParse({ colorToken: "ROSE" }).success).toBe(true);
    expect(patchSchema.safeParse({ name: "Corte curto" }).success).toBe(true);
  });

  it("recusa remover a cor", () => {
    expect(patchSchema.safeParse({ colorToken: null }).success).toBe(false);
  });
});
