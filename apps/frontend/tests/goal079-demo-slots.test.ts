/**
 * Goal079/WU-02 (§6.4) — o cálculo puro da demonstração: dia, horários e
 * respostas de preço, com relógio recebido por argumento.
 */

import { describe, expect, test } from "vitest";

import {
  buildDemoConversation,
  type DemoDraft,
  demoPriceReply,
  formatDemoHour,
  formatDemoList,
  nextServiceDate,
} from "@/features/onboarding/demo";

// Quarta-feira, 2026-09-30, meio-dia em America/Sao_Paulo.
const WEDNESDAY = new Date("2026-09-30T15:00:00.000Z");

function draftFixture(overrides: Partial<DemoDraft> = {}): DemoDraft {
  return {
    dayHours: {},
    days: [5],
    endTime: "18:00",
    serviceDuration: 45,
    serviceName: "Corte feminino",
    servicePrice: "90",
    servicePriceType: "FIXED",
    startTime: "14:00",
    timezone: "America/Sao_Paulo",
    ...overrides,
  };
}

function eventTexts(draft: DemoDraft, now = WEDNESDAY): string[] {
  const conversation = buildDemoConversation(draft, now);
  return (conversation?.items ?? [])
    .filter((item) => item.kind === "event")
    .map((item) => item.text);
}

describe("buildDemoConversation: o exemplo do Goal", () => {
  test("Corte feminino, 45 min, sexta 14:00–18:00, quarta 2026-09-30: três horários e a data completa", () => {
    const conversation = buildDemoConversation(draftFixture(), WEDNESDAY);
    expect(conversation?.dateLabel).toBe("sexta-feira, 2 de outubro");
    expect(conversation?.slots).toEqual(["14h", "15h30", "17h"]);
    const texts = (conversation?.items ?? []).map((item) => item.text);
    expect(texts).toContain("Serviço identificado · Corte feminino");
    expect(texts).toContain("Agenda consultada · 3 horários livres na sexta");
    expect(texts).toContain("Tenho 14h, 15h30 ou 17h. Qual prefere?");
    expect(texts).toContain(
      "Corte feminino, sexta-feira, 2 de outubro, às 15h30. Posso confirmar?",
    );
    expect(texts).toContain("Agendamento simulado · nada foi marcado");
  });

  test("a conversa tem onze itens: seis mensagens da conversa, três eventos e as respostas", () => {
    const conversation = buildDemoConversation(draftFixture(), WEDNESDAY);
    expect(conversation?.items).toHaveLength(11);
    expect(
      conversation?.items.filter((item) => item.kind === "event"),
    ).toHaveLength(3);
  });
});

describe("buildDemoConversation: casos-limite", () => {
  test("um candidato só (240 min em 14:00–18:00) dá '14h' e o singular", () => {
    const draft = draftFixture({ serviceDuration: 240 });
    const conversation = buildDemoConversation(draft, WEDNESDAY);
    expect(conversation?.slots).toEqual(["14h"]);
    expect(eventTexts(draft)).toContain(
      "Agenda consultada · 1 horário livre na sexta",
    );
  });

  test("dois candidatos dão os dois, e a cliente escolhe o primeiro", () => {
    const draft = draftFixture({ serviceDuration: 120 });
    const conversation = buildDemoConversation(draft, WEDNESDAY);
    expect(conversation?.slots).toEqual(["14h", "16h"]);
    expect(eventTexts(draft)).toContain(
      "Agenda consultada · 2 horários livres na sexta",
    );
    expect(
      conversation?.items.some((item) => item.text.includes("14h ou 16h")),
    ).toBe(true);
    expect(
      conversation?.items.some((item) =>
        item.text.includes("sexta-feira, 2 de outubro, às 14h."),
      ),
    ).toBe(true);
  });

  test("com mais de três candidatos mostra o primeiro, o do meio e o último", () => {
    const draft = draftFixture({
      endTime: "18:00",
      serviceDuration: 30,
      startTime: "09:00",
    });
    // 09:00 … 17:30 → 18 candidatos: primeiro 9h, do meio (índice 8) 13h, último 17h30.
    expect(buildDemoConversation(draft, WEDNESDAY)?.slots).toEqual([
      "9h",
      "13h",
      "17h30",
    ]);
  });

  test("o dia personalizado em dayHours vence o intervalo-base", () => {
    const draft = draftFixture({
      dayHours: { 5: { endTime: "12:00", startTime: "10:00" } },
    });
    expect(buildDemoConversation(draft, WEDNESDAY)?.slots).toEqual([
      "10h",
      "10h45",
    ]);
  });

  test("personalizar só o início do dia mantém o fim do intervalo-base", () => {
    const draft = draftFixture({
      dayHours: { 5: { startTime: "16:00" } },
      serviceDuration: 60,
    });
    expect(buildDemoConversation(draft, WEDNESDAY)?.slots).toEqual([
      "16h",
      "17h",
    ]);
  });

  test("hoje sendo dia de atendimento, a data é a próxima ocorrência depois de hoje", () => {
    const friday = new Date("2026-10-02T15:00:00.000Z");
    const conversation = buildDemoConversation(draftFixture(), friday);
    expect(conversation?.dateLabel).toBe("sexta-feira, 9 de outubro");
  });

  test("o dia de hoje é o do fuso do negócio, não o da máquina", () => {
    // 02:00 UTC de quinta 2026-10-01 ainda é quarta 23:00 em São Paulo.
    const lateWednesday = new Date("2026-10-01T02:00:00.000Z");
    const conversation = buildDemoConversation(
      draftFixture({ days: [3, 4] }),
      lateWednesday,
    );
    expect(conversation?.dateLabel).toBe("quinta-feira, 1 de outubro");
  });

  test("a data cruza o fim do mês", () => {
    const monday = new Date("2026-10-26T15:00:00.000Z");
    expect(
      buildDemoConversation(draftFixture({ days: [6] }), monday)?.dateLabel,
    ).toBe("sábado, 31 de outubro");
    expect(
      eventTexts(draftFixture({ days: [6] }), monday)[1],
    ).toBe("Agenda consultada · 3 horários livres no sábado");
  });

  test("sem dia de atendimento ou sem horário em que o serviço caiba, não há conversa", () => {
    expect(buildDemoConversation(draftFixture({ days: [] }), WEDNESDAY)).toBeNull();
    expect(
      buildDemoConversation(draftFixture({ serviceDuration: 300 }), WEDNESDAY),
    ).toBeNull();
    expect(
      buildDemoConversation(draftFixture({ serviceDuration: 0 }), WEDNESDAY),
    ).toBeNull();
  });
});

describe("respostas de preço da demonstração", () => {
  test("ON_REQUEST responde 'sob consulta' e nunca um valor", () => {
    const draft = draftFixture({ servicePrice: "", servicePriceType: "ON_REQUEST" });
    expect(demoPriceReply(draft)).toBe("O valor de Corte feminino é sob consulta.");
    const priceMessage = buildDemoConversation(draft, WEDNESDAY)?.items[2];
    expect(priceMessage?.text).toContain("sob consulta");
    expect(priceMessage?.text).not.toMatch(/R\$/u);
  });

  test("STARTING_AT responde 'a partir de'", () => {
    const draft = draftFixture({ servicePriceType: "STARTING_AT" });
    expect(demoPriceReply(draft)).toMatch(/^Corte feminino custa a partir de R\$\s90,00\.$/u);
    expect(buildDemoConversation(draft, WEDNESDAY)?.items[2].text).toContain(
      "a partir de",
    );
  });

  test("FIXED responde o preço e a duração", () => {
    const message = buildDemoConversation(draftFixture(), WEDNESDAY)?.items[2];
    expect(message?.text).toMatch(/R\$\s90,00/u);
    expect(message?.text).toContain("45 min");
  });

  test("NOT_INFORMED não vira preço", () => {
    expect(
      demoPriceReply(
        draftFixture({ servicePrice: "", servicePriceType: "NOT_INFORMED" }),
      ),
    ).toBe("O valor de Corte feminino ainda não foi informado.");
  });
});

describe("formatação", () => {
  test("hora cheia sem minutos e a lista com 'ou'", () => {
    expect(formatDemoHour(14 * 60)).toBe("14h");
    expect(formatDemoHour(15 * 60 + 30)).toBe("15h30");
    expect(formatDemoHour(9 * 60 + 5)).toBe("9h05");
    expect(formatDemoList(["14h"])).toBe("14h");
    expect(formatDemoList(["14h", "15h30"])).toBe("14h ou 15h30");
    expect(formatDemoList(["14h", "15h30", "17h"])).toBe("14h, 15h30 ou 17h");
  });

  test("nextServiceDate sem dias não devolve data", () => {
    expect(nextServiceDate(WEDNESDAY, "America/Sao_Paulo", [])).toBeNull();
  });
});
