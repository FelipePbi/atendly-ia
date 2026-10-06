import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  composeReminderPreviewText,
  reminderPreviewDate,
  type ReminderPreviewFacts,
  type ReminderPreviewService,
  reminderPreviewText,
} from "../src/features/reminders/reminderPreview";

function facts(
  overrides: Partial<ReminderPreviewFacts> = {},
): ReminderPreviewFacts {
  return {
    customerName: "Ana",
    subject: "Corte",
    date: "2026-09-16",
    time: "15:30",
    price: null,
    confirmationRequested: false,
    ...overrides,
  };
}

const CORTE: ReminderPreviewService = {
  name: "Corte",
  active: true,
  priceType: "FIXED",
  price: 120,
};

// 2026-09-15 12:00 UTC: o dia seguinte é 2026-09-16 (quarta-feira) em São Paulo.
const NOW = new Date("2026-09-15T12:00:00.000Z");

/**
 * Os mesmos pares de texto estão escritos, literalmente, em
 * apps/ai-orchestrator/tests/reminders/notification-message.test.ts
 * ("keeps the full reminder text identical to the frontend preview").
 * Mude os dois lados juntos.
 */
const PAIRS: Array<{
  name: string;
  style: "PROFESSIONAL" | "BALANCED" | "CASUAL";
  facts: Partial<ReminderPreviewFacts>;
  text: string;
}> = [
  {
    name: "PROFESSIONAL com serviço, sem preço, sem confirmação",
    style: "PROFESSIONAL",
    facts: {},
    text: "Olá, Ana.\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 15h30.\n\nFico à disposição.",
  },
  {
    name: "BALANCED com serviço, preço e confirmação",
    style: "BALANCED",
    facts: { price: 120, confirmationRequested: true },
    text: "Oi, Ana! Tudo bem?\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 15h30.\n\nValor: R$ 120,00.\n\nVocê confirma sua presença? É só responder sim ou não.",
  },
  {
    name: "BALANCED sem serviço, sem preço, sem confirmação",
    style: "BALANCED",
    facts: { subject: null },
    text: "Oi, Ana! Tudo bem?\n\nPassando para lembrar do seu atendimento na quarta-feira, 16/09, às 15h30.\n\nQualquer coisa, é só me chamar!",
  },
  {
    name: "CASUAL sem serviço, sem preço, com confirmação",
    style: "CASUAL",
    facts: { subject: null, confirmationRequested: true },
    text: "Oii, Ana! Tudo bem? 😊\n\nPassando para lembrar do seu atendimento na quarta-feira, 16/09, às 15h30.\n\nConfirma pra mim? Pode responder sim ou não 💛",
  },
  {
    name: "CASUAL com serviço, preço, sem confirmação",
    style: "CASUAL",
    facts: { price: 89.9 },
    text: "Oii, Ana! Tudo bem? 😊\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 15h30.\n\nValor: R$ 89,90.\n\nQualquer coisa me chama por aqui 💛",
  },
  {
    name: "PROFESSIONAL com serviço, preço e confirmação",
    style: "PROFESSIONAL",
    facts: { price: 120, confirmationRequested: true },
    text: "Olá, Ana.\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 15h30.\n\nValor: R$ 120,00.\n\nPode confirmar sua presença respondendo sim ou não?",
  },
];

describe("Goal125 — prévia do lembrete", () => {
  it.each(PAIRS)("texto idêntico ao do orquestrador: $name", (pair) => {
    expect(
      composeReminderPreviewText({
        style: pair.style,
        facts: facts(pair.facts),
      }),
    ).toBe(pair.text);
  });

  it("escreve a data e a hora em português, sem o formato cru", () => {
    const text = reminderPreviewText({
      confirmationEnabled: false,
      now: NOW,
      pricePolicy: "NEVER",
      services: [CORTE],
      timeZone: "America/Sao_Paulo",
      tone: "BALANCED",
    });
    expect(text).toContain("na quarta-feira, 16/09, às 15h30");
    expect(text).not.toContain("2026-09-16");
    expect(text).not.toContain("15:30");
  });

  it("tone null usa BALANCED", () => {
    const base = {
      confirmationEnabled: true,
      now: NOW,
      pricePolicy: "NEVER" as const,
      services: [CORTE],
      timeZone: "America/Sao_Paulo",
    };
    const nullTone = reminderPreviewText({ ...base, tone: null });
    expect(nullTone).toBe(reminderPreviewText({ ...base, tone: "BALANCED" }));
    expect(nullTone).toBe(
      "Oi, Ana! Tudo bem?\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 15h30.\n\nVocê confirma sua presença? É só responder sim ou não.",
    );
  });

  it("usa a voz de cada estilo", () => {
    const base = {
      confirmationEnabled: false,
      now: NOW,
      pricePolicy: "NEVER" as const,
      services: [CORTE],
      timeZone: "America/Sao_Paulo",
    };
    const texts = (["PROFESSIONAL", "BALANCED", "CASUAL"] as const).map(
      (tone) => reminderPreviewText({ ...base, tone }),
    );
    expect(new Set(texts).size).toBe(3);
    expect(texts[0]).toMatch(/^Olá, Ana\./);
    expect(texts[1]).toMatch(/^Oi, Ana! Tudo bem\?/);
    expect(texts[2]).toMatch(/^Oii, Ana! Tudo bem\? 😊/);
  });

  it("usa o primeiro serviço ativo, na ordem recebida", () => {
    const text = reminderPreviewText({
      confirmationEnabled: false,
      now: NOW,
      pricePolicy: "NEVER",
      services: [
        { ...CORTE, name: "Antigo", active: false },
        { ...CORTE, name: "Escova" },
        CORTE,
      ],
      timeZone: "America/Sao_Paulo",
      tone: "BALANCED",
    });
    expect(text).toContain("atendimento de Escova na quarta-feira");
  });

  it("sem serviço ativo ou sem lista, fica 'seu atendimento'", () => {
    for (const services of [[], [{ ...CORTE, active: false }]]) {
      const text = reminderPreviewText({
        confirmationEnabled: false,
        now: NOW,
        pricePolicy: "WHEN_FIXED",
        services,
        timeZone: "America/Sao_Paulo",
        tone: "BALANCED",
      });
      expect(text).toContain("do seu atendimento na quarta-feira, 16/09");
      expect(text).not.toContain("atendimento de ");
      expect(text).not.toContain("Valor");
    }
  });

  it("mostra o preço só com WHEN_FIXED e serviço FIXED com preço", () => {
    const render = (
      pricePolicy: "NEVER" | "WHEN_FIXED",
      service: ReminderPreviewService,
    ) =>
      reminderPreviewText({
        confirmationEnabled: false,
        now: NOW,
        pricePolicy,
        services: [service],
        timeZone: "America/Sao_Paulo",
        tone: "BALANCED",
      });

    expect(render("WHEN_FIXED", CORTE)).toContain("Valor: R$ 120,00.");
    expect(render("NEVER", CORTE)).not.toContain("Valor");
    for (const priceType of [
      "STARTING_AT",
      "ON_REQUEST",
      "NOT_INFORMED",
    ] as const) {
      expect(render("WHEN_FIXED", { ...CORTE, priceType })).not.toContain(
        "Valor",
      );
    }
    expect(render("WHEN_FIXED", { ...CORTE, price: null })).not.toContain(
      "Valor",
    );
  });

  it("pede confirmação só quando a caixa está marcada", () => {
    const render = (confirmationEnabled: boolean) =>
      reminderPreviewText({
        confirmationEnabled,
        now: NOW,
        pricePolicy: "NEVER",
        services: [CORTE],
        timeZone: "America/Sao_Paulo",
        tone: "BALANCED",
      });
    expect(render(true)).toContain("Você confirma sua presença?");
    expect(render(true)).not.toContain("Qualquer coisa, é só me chamar!");
    expect(render(false)).not.toContain("confirma sua presença");
    expect(render(false)).toContain("Qualquer coisa, é só me chamar!");
  });

  describe("dia seguinte no fuso do negócio", () => {
    it("quando o fuso e o UTC caem em dias diferentes (fuso atrás do UTC)", () => {
      // 01:30 UTC de 16/09 ainda é 22:30 de 15/09 em São Paulo.
      const now = new Date("2026-09-16T01:30:00.000Z");
      expect(reminderPreviewDate(now, "America/Sao_Paulo")).toBe("2026-09-16");
      expect(reminderPreviewDate(now, "UTC")).toBe("2026-09-17");
    });

    it("quando o fuso e o UTC caem em dias diferentes (fuso à frente do UTC)", () => {
      // 20:00 UTC de 15/09 já é 05:00 de 16/09 em Tóquio.
      const now = new Date("2026-09-15T20:00:00.000Z");
      expect(reminderPreviewDate(now, "Asia/Tokyo")).toBe("2026-09-17");
      expect(reminderPreviewDate(now, "UTC")).toBe("2026-09-16");
    });

    it("vira mês e ano, e passa por 29 de fevereiro", () => {
      expect(
        reminderPreviewDate(
          new Date("2026-12-31T12:00:00.000Z"),
          "America/Sao_Paulo",
        ),
      ).toBe("2027-01-01");
      expect(
        reminderPreviewDate(
          new Date("2026-09-30T12:00:00.000Z"),
          "America/Sao_Paulo",
        ),
      ).toBe("2026-10-01");
      expect(
        reminderPreviewDate(
          new Date("2028-02-28T12:00:00.000Z"),
          "America/Sao_Paulo",
        ),
      ).toBe("2028-02-29");
    });

    it("o texto usa o dia da semana do dia seguinte no fuso do negócio", () => {
      const text = reminderPreviewText({
        confirmationEnabled: false,
        now: new Date("2026-09-16T01:30:00.000Z"),
        pricePolicy: "NEVER",
        services: [CORTE],
        timeZone: "America/Sao_Paulo",
        tone: "BALANCED",
      });
      expect(text).toContain("na quarta-feira, 16/09, às 15h30");
    });
  });

  it("não importa nada de apps/ai-orchestrator", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../src/features/reminders/reminderPreview.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const imports = source
      .split("\n")
      .filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line));
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) {
      expect(line).not.toMatch(/ai-orchestrator|\/apps\//);
    }
  });
});
