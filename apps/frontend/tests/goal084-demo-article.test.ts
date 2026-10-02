/**
 * Goal084/WU-03 (prova 7) — a demonstração e a amostra de tom não põem artigo
 * nem contração antes do nome do serviço.
 */

import { describe, expect, test } from "vitest";

import {
  buildDemoConversation,
  type DemoDraft,
  demoPriceReply,
  type DemoTone,
  demoToneSample,
} from "@/features/onboarding/demo";

const WEDNESDAY = new Date("2026-09-30T15:00:00.000Z");

type PriceType = DemoDraft["servicePriceType"];

const PRICE_TYPES: PriceType[] = [
  "FIXED",
  "STARTING_AT",
  "ON_REQUEST",
  "NOT_INFORMED",
];
const TONES: DemoTone[] = ["BALANCED", "CASUAL", "PROFESSIONAL"];

function draftFixture(overrides: Partial<DemoDraft> = {}): DemoDraft {
  return {
    dayHours: {},
    days: [5],
    endTime: "18:00",
    serviceDuration: 45,
    serviceName: "Escova",
    servicePrice: "90",
    servicePriceType: "FIXED",
    startTime: "14:00",
    timezone: "America/Sao_Paulo",
    ...overrides,
  };
}

function priceFor(type: PriceType): string {
  return type === "FIXED" || type === "STARTING_AT" ? "90" : "";
}

const FORBIDDEN = /\b(?:o|O|do|da|a) Escova/u;

describe("demonstração sem artigo fixo antes do nome do serviço", () => {
  test.each(PRICE_TYPES)(
    "%s: nenhum texto da conversa nem da amostra de tom tem artigo antes de Escova",
    (type) => {
      const draft = draftFixture({
        servicePrice: priceFor(type),
        servicePriceType: type,
      });
      const texts = [
        demoPriceReply(draft),
        ...(buildDemoConversation(draft, WEDNESDAY)?.items ?? []).map(
          (item) => item.text,
        ),
        ...TONES.map((tone) => demoToneSample(draft, tone)),
      ];
      expect(texts.length).toBeGreaterThan(10);
      for (const text of texts) {
        expect(text).not.toMatch(FORBIDDEN);
      }
    },
  );

  test("os textos de preço são exatamente os fixados", () => {
    const base = draftFixture();
    expect(
      demoPriceReply({ ...base, servicePrice: "", servicePriceType: "ON_REQUEST" }),
    ).toBe("O valor de Escova é sob consulta.");
    expect(
      demoPriceReply({
        ...base,
        servicePrice: "",
        servicePriceType: "NOT_INFORMED",
      }),
    ).toBe("O valor de Escova ainda não foi informado.");
    expect(
      demoPriceReply({ ...base, servicePriceType: "STARTING_AT" }),
    ).toMatch(/^Escova custa a partir de R\$\s90,00\.$/u);
    expect(demoPriceReply(base)).toMatch(/^Escova custa R\$\s90,00\.$/u);
  });

  test("a primeira mensagem da conversa é 'Oi! Quanto custa <nome>?'", () => {
    const items = buildDemoConversation(draftFixture(), WEDNESDAY)?.items ?? [];
    expect(items[0]).toEqual({ kind: "client", text: "Oi! Quanto custa Escova?" });
  });

  test("com o nome 'escova', a frase que abre pelo nome começa com 'Escova'", () => {
    const draft = draftFixture({ serviceName: "escova" });
    expect(demoPriceReply(draft)).toMatch(/^Escova custa /u);
    expect(
      demoPriceReply({ ...draft, servicePriceType: "STARTING_AT" }),
    ).toMatch(/^Escova custa a partir de /u);
    const items = buildDemoConversation(draft, WEDNESDAY)?.items ?? [];
    expect(items[0].text).toBe("Oi! Quanto custa escova?");
    expect(items[2].text).toMatch(/^Oi! Escova custa /u);
  });

  test("só a primeira letra sobe: o resto do nome fica como foi digitado", () => {
    const draft = draftFixture({ serviceName: "corte DE cabelo" });
    expect(demoPriceReply(draft)).toMatch(/^Corte DE cabelo custa /u);
  });

  test("com o nome vazio, a amostra de tom começa com 'Serviço' nos três tons", () => {
    const draft = draftFixture({ serviceName: "  " });
    expect(demoToneSample(draft, "BALANCED")).toMatch(/^Serviço custa /u);
    expect(demoToneSample(draft, "PROFESSIONAL")).toMatch(/^Serviço custa /u);
    expect(demoToneSample(draft, "CASUAL")).toMatch(/^Oi! Serviço custa /u);
  });

  test("a ordem, a quantidade de itens e os eventos da conversa não mudam", () => {
    const conversation = buildDemoConversation(draftFixture(), WEDNESDAY);
    expect(conversation?.items.map((item) => item.kind)).toEqual([
      "client",
      "event",
      "ai",
      "client",
      "event",
      "ai",
      "client",
      "ai",
      "client",
      "event",
      "ai",
    ]);
    expect(conversation?.slots).toEqual(["14h", "15h30", "17h"]);
  });
});
