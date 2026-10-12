import { describe, expect, it } from "vitest";

import {
  businessAddressPartsSchema,
  formatBusinessAddress,
  resolveBusinessProfileFields,
} from "../src/lib/business-profile.js";

/**
 * Endereço em partes: o corpo traz CEP, UF, cidade, bairro, rua, número e
 * complemento; o BFF normaliza, grava as partes e monta o texto único
 * `address` que a IA lê. Sem HTTP e sem PostgreSQL.
 */
const parts = businessAddressPartsSchema.parse({
  postalCode: "01310-100",
  state: "sp",
  city: " São Paulo ",
  district: "Bela Vista",
  street: "Avenida Paulista",
  number: "1000",
  complement: "",
});

describe("businessAddressPartsSchema", () => {
  it("normaliza CEP, UF e complemento vazio", () => {
    expect(parts).toEqual({
      postalCode: "01310100",
      state: "SP",
      city: "São Paulo",
      district: "Bela Vista",
      street: "Avenida Paulista",
      number: "1000",
      complement: null,
    });
  });

  it("recusa CEP incompleto, UF inválida e obrigatório em branco", () => {
    const base = {
      postalCode: "01310100",
      state: "SP",
      city: "São Paulo",
      district: "Bela Vista",
      street: "Avenida Paulista",
      number: null,
      complement: null,
    };
    expect(
      businessAddressPartsSchema.safeParse({ ...base, postalCode: "0131" })
        .success,
    ).toBe(false);
    expect(
      businessAddressPartsSchema.safeParse({ ...base, state: "São" }).success,
    ).toBe(false);
    expect(
      businessAddressPartsSchema.safeParse({ ...base, street: "  " }).success,
    ).toBe(false);
    expect(businessAddressPartsSchema.safeParse(base).success).toBe(true);
  });
});

describe("formatBusinessAddress", () => {
  it("monta o texto único com número e CEP com hífen", () => {
    expect(formatBusinessAddress(parts)).toBe(
      "Avenida Paulista, 1000 - Bela Vista, São Paulo - SP, CEP 01310-100",
    );
  });

  it("sem número vira s/n e o complemento entra depois", () => {
    expect(
      formatBusinessAddress({ ...parts, number: null, complement: "Sala 12" }),
    ).toBe(
      "Avenida Paulista, s/n, Sala 12 - Bela Vista, São Paulo - SP, CEP 01310-100",
    );
  });
});

describe("resolveBusinessProfileFields com partes", () => {
  it("partes explícitas montam address e satisfazem ON_SITE", () => {
    expect(
      resolveBusinessProfileFields(null, {
        modalities: ["ON_SITE"],
        addressParts: parts,
      }),
    ).toEqual({
      modalities: ["ON_SITE"],
      address: formatBusinessAddress(parts),
      addressParts: parts,
    });
  });

  it("chave ausente preserva partes e texto gravados", () => {
    const stored = {
      modalities: ["ON_SITE"] as const,
      address: formatBusinessAddress(parts),
      addressParts: parts,
    };
    expect(resolveBusinessProfileFields(stored, {})).toEqual({
      modalities: ["ON_SITE"],
      address: stored.address,
      addressParts: parts,
    });
  });

  it("address solto limpa as partes, que deixariam de descrevê-lo", () => {
    const stored = {
      modalities: ["ON_SITE"] as const,
      address: formatBusinessAddress(parts),
      addressParts: parts,
    };
    expect(
      resolveBusinessProfileFields(stored, { address: "Rua Nova, 10" }),
    ).toMatchObject({ address: "Rua Nova, 10", addressParts: null });
  });

  it("partes nulas com ON_SITE recusam com BUSINESS_ADDRESS_REQUIRED", () => {
    expect(() =>
      resolveBusinessProfileFields(null, {
        modalities: ["ON_SITE"],
        addressParts: null,
      }),
    ).toThrow(expect.objectContaining({ code: "BUSINESS_ADDRESS_REQUIRED" }));
  });
});
