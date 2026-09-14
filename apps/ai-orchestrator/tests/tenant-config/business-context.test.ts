import { describe, expect, it } from "vitest";

import { buildTenantContextPrompt } from "../../src/modules/prompts/tenant-context.js";
import {
  businessContextConfigured,
  DEFAULT_BUSINESS_CONTEXT,
  normalizeBusinessContext,
} from "../../src/modules/tenant-config/business-context.js";

/**
 * Contexto de negocio versionado (Goal018/WU-02). O settings gravado antes
 * desta unidade so tinha businessName e timezone; os campos novos precisam
 * de default proprio para nao derrubar esse tenant no contexto vazio.
 */
describe("contexto de negocio: campos novos com default seguro", () => {
  it("aceita settings antigo com so businessName e timezone sem cair no default inteiro", () => {
    const legacy = { businessName: "Camili Krauser Beauty", timezone: "America/Sao_Paulo" };
    const normalized = normalizeBusinessContext(legacy);

    expect(normalized.businessName).toBe("Camili Krauser Beauty");
    expect(normalized.timezone).toBe("America/Sao_Paulo");
    expect(normalized).not.toEqual(DEFAULT_BUSINESS_CONTEXT);
    expect(normalized.version).toBe(1);
    expect(normalized.segment).toBe("");
    expect(normalized.modalities).toEqual([]);
    expect(normalized.address).toBe("");
  });

  it("aceita o formato novo completo e normaliza cada campo", () => {
    const full = {
      version: 3,
      businessName: "Studio Helena",
      timezone: "America/Sao_Paulo",
      segment: "Salao de beleza",
      modalities: ["ON_SITE", "ONLINE"],
      address: "Rua das Flores, 123",
    };

    expect(normalizeBusinessContext(full)).toEqual(full);
  });

  it("ainda cai no default inteiro quando o valor gravado nao e um objeto valido", () => {
    expect(normalizeBusinessContext("not-an-object")).toEqual(
      DEFAULT_BUSINESS_CONTEXT,
    );
    expect(normalizeBusinessContext({ modalities: "ON_SITE" })).toEqual(
      DEFAULT_BUSINESS_CONTEXT,
    );
  });

  it("continua considerando configurado so pelo nome, sem endurecer a regra", () => {
    expect(
      businessContextConfigured({
        ...DEFAULT_BUSINESS_CONTEXT,
        businessName: "Ok",
      }),
    ).toBe(true);
    expect(
      businessContextConfigured({
        ...DEFAULT_BUSINESS_CONTEXT,
        businessName: "O",
      }),
    ).toBe(false);
  });
});

describe("prompt de contexto de negocio: segmento, modalidades e endereco", () => {
  it("diz nao configurado para cada campo ausente, sem afirmar modalidade nao escolhida", () => {
    const prompt = buildTenantContextPrompt(DEFAULT_BUSINESS_CONTEXT).join(
      "\n",
    );

    expect(prompt).toContain("Segmento: [nao configurado]");
    expect(prompt).toContain("Modalidades de atendimento: [nao configurado]");
    expect(prompt).toContain("Endereco: [nao configurado]");
    expect(prompt).not.toMatch(/presencial|domicilio|online/i);
  });

  it("imprime so as modalidades escolhidas, com segmento e endereco preenchidos", () => {
    const prompt = buildTenantContextPrompt({
      ...DEFAULT_BUSINESS_CONTEXT,
      segment: "Salao de beleza",
      modalities: ["ON_SITE"],
      address: "Rua das Flores, 123",
    }).join("\n");

    expect(prompt).toContain("Segmento: Salao de beleza");
    expect(prompt).toContain("Endereco: Rua das Flores, 123");
    expect(prompt).toContain(
      "Modalidades de atendimento: atendimento presencial no endereco do negocio",
    );
    expect(prompt).not.toMatch(/domicilio|atendimento online/i);
  });
});
