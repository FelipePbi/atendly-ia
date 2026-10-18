import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  composeNotificationText,
  notificationFactualLines,
} from "../../src/modules/reminders/notification-message.js";
import type { NotificationFacts } from "../../src/modules/scheduling-service/types.js";
import { AI_CONVERSATION_STYLES } from "../../src/modules/tenant-config/ai-settings.js";

function facts(overrides: Partial<NotificationFacts> = {}): NotificationFacts {
  return {
    kind: "REMINDER",
    appointmentStatus: "CONFIRMED",
    customerId: "customer-a",
    customerName: "Ana",
    customerPhone: "5511999999999",
    services: ["Corte"],
    title: null,
    timezone: "America/Sao_Paulo",
    // Ja formatadas pelo dono, no fuso do negocio. A IA nunca as recalcula.
    date: "2026-09-16",
    time: "14:30",
    startAt: "2026-09-16T17:30:00.000Z",
    price: null,
    confirmationRequested: false,
    ...overrides,
  };
}

describe("notification message templates", () => {
  it("composes the text by template in the three styles", () => {
    const texts = AI_CONVERSATION_STYLES.map((style) =>
      composeNotificationText({ style, facts: facts() }),
    );

    // Os tres existem, nenhum vazio, e os tres soam diferente: estilo muda
    // registro e informalidade.
    expect(texts).toHaveLength(3);
    for (const text of texts) expect(text.trim().length).toBeGreaterThan(0);
    expect(new Set(texts).size).toBe(3);
  });

  it("keeps the factual content identical across the three styles", () => {
    const sample = facts({
      services: ["Corte", "Escova"],
      price: 120,
      confirmationRequested: true,
    });
    const lines = notificationFactualLines(sample);
    expect(lines.length).toBeGreaterThan(0);

    for (const style of AI_CONVERSATION_STYLES) {
      const text = composeNotificationText({ style, facts: sample });
      // Cada frase factual entra palavra por palavra, nos tres.
      for (const line of lines) expect(text).toContain(line);
      // E o fato so aparece na forma que o dono compos.
      expect(text).toContain("Corte e Escova");
      expect(text).toContain("R$ 120,00");
    }
  });

  it("writes the date and time in Portuguese, with the weekday, in the three styles", () => {
    for (const style of AI_CONVERSATION_STYLES) {
      const text = composeNotificationText({ style, facts: facts() });
      expect(text).toContain("na quarta-feira, 16/09, às 14h30");
      expect(text).not.toContain("2026-09-16");
      expect(text).not.toContain("14:30");
    }
  });

  it("uses the right article and weekday for the seven days", () => {
    // 2026-09-14 e segunda-feira.
    const expected = [
      ["2026-09-14", "na segunda-feira, 14/09"],
      ["2026-09-15", "na terça-feira, 15/09"],
      ["2026-09-16", "na quarta-feira, 16/09"],
      ["2026-09-17", "na quinta-feira, 17/09"],
      ["2026-09-18", "na sexta-feira, 18/09"],
      ["2026-09-19", "no sábado, 19/09"],
      ["2026-09-20", "no domingo, 20/09"],
    ] as const;
    for (const [date, phrase] of expected) {
      const text = notificationFactualLines(facts({ date })).join(" ");
      expect(text).toContain(`${phrase}, às 14h30`);
    }
  });

  it("gets the weekday right across a year turn and on 29 February", () => {
    const cases = [
      ["2025-12-31", "na quarta-feira, 31/12"],
      ["2026-01-01", "na quinta-feira, 01/01"],
      ["2024-02-29", "na quinta-feira, 29/02"],
      ["2024-03-01", "na sexta-feira, 01/03"],
      ["2000-02-29", "na terça-feira, 29/02"],
      ["2028-02-29", "na terça-feira, 29/02"],
    ] as const;
    for (const [date, phrase] of cases) {
      const text = notificationFactualLines(facts({ date })).join(" ");
      expect(text).toContain(phrase);
    }
  });

  it("formats the hour without a leading zero and omits a zero minute", () => {
    const hour = (time: string) =>
      notificationFactualLines(facts({ time })).join(" ");
    expect(hour("09:00")).toContain("às 9h.");
    expect(hour("09:05")).toContain("às 9h05.");
    expect(hour("14:00")).toContain("às 14h.");
    expect(hour("14:30")).toContain("às 14h30.");
    expect(hour("00:00")).toContain("às 0h.");
  });

  it("keeps the literal text when the date or the time is invalid", () => {
    const invalid: Array<Partial<NotificationFacts>> = [
      { date: "16/09/2026" },
      { date: "2026-13-01" },
      { date: "2026-00-10" },
      { date: "2026-02-29" },
      { date: "2100-02-29" },
      { date: "2026-04-31" },
      { date: "2026-09-00" },
      { date: "" },
      { time: "25:00" },
      { time: "14:60" },
      { time: "2pm" },
      { time: "" },
    ];
    for (const override of invalid) {
      const sample = facts(override);
      const text = notificationFactualLines(sample).join(" ");
      expect(text).toContain(`no dia ${sample.date} às ${sample.time}`);
    }
  });

  it("does not say 'de seu atendimento' when there is no service and no title", () => {
    for (const kind of ["REMINDER", "CHANGE_NOTICE"] as const) {
      for (const appointmentStatus of ["CONFIRMED", "CANCELLED"] as const) {
        const text = notificationFactualLines(
          facts({ kind, appointmentStatus, services: [], title: null }),
        ).join(" ");
        expect(text.toLowerCase()).toContain("seu atendimento");
        expect(text).not.toContain("de seu atendimento");
        expect(text).not.toContain("de Seu atendimento");
        expect(text).not.toContain("atendimento de ");
      }
    }
  });

  it("builds the exact sentences with and without a subject", () => {
    expect(
      notificationFactualLines(facts({ services: [], title: null })),
    ).toEqual([
      "Passando para lembrar do seu atendimento na quarta-feira, 16/09, às 14h30.",
    ]);
    expect(notificationFactualLines(facts())).toEqual([
      "Passando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 14h30.",
    ]);
    expect(
      notificationFactualLines(
        facts({
          kind: "CHANGE_NOTICE",
          appointmentStatus: "CANCELLED",
          services: [],
        }),
      ),
    ).toEqual(["Seu atendimento na quarta-feira, 16/09, às 14h30 foi cancelado."]);
    expect(
      notificationFactualLines(
        facts({ kind: "CHANGE_NOTICE", services: [], title: null }),
      ),
    ).toEqual([
      "Seu atendimento foi alterado e agora está marcado na quarta-feira, 16/09, às 14h30.",
    ]);
  });

  // Os mesmos textos, escritos literalmente, estao em
  // apps/frontend/tests/goal125-previa-do-lembrete.test.ts (PAIRS). Mude os
  // dois lados juntos.
  it("keeps the full reminder text identical to the frontend preview", () => {
    const pairs: Array<{
      style: "PROFESSIONAL" | "BALANCED" | "CASUAL";
      overrides: Partial<NotificationFacts>;
      text: string;
    }> = [
      {
        style: "PROFESSIONAL",
        overrides: {},
        text: "Olá, Ana.\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 15h30.\n\nFico à disposição.",
      },
      {
        style: "BALANCED",
        overrides: { price: 120, confirmationRequested: true },
        text: "Oi, Ana! Tudo bem?\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 15h30.\n\nValor: R$ 120,00.\n\nVocê confirma sua presença? É só responder sim ou não.",
      },
      {
        style: "BALANCED",
        overrides: { services: [] },
        text: "Oi, Ana! Tudo bem?\n\nPassando para lembrar do seu atendimento na quarta-feira, 16/09, às 15h30.\n\nQualquer coisa, é só me chamar!",
      },
      {
        style: "CASUAL",
        overrides: { services: [], confirmationRequested: true },
        text: "Oii, Ana! Tudo bem? 😊\n\nPassando para lembrar do seu atendimento na quarta-feira, 16/09, às 15h30.\n\nConfirma pra mim? Pode responder sim ou não 💛",
      },
      {
        style: "CASUAL",
        overrides: { price: 89.9 },
        text: "Oii, Ana! Tudo bem? 😊\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 15h30.\n\nValor: R$ 89,90.\n\nQualquer coisa me chama por aqui 💛",
      },
      {
        style: "PROFESSIONAL",
        overrides: { price: 120, confirmationRequested: true },
        text: "Olá, Ana.\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 15h30.\n\nValor: R$ 120,00.\n\nPode confirmar sua presença respondendo sim ou não?",
      },
    ];
    for (const pair of pairs) {
      expect(
        composeNotificationText({
          style: pair.style,
          facts: facts({ time: "15:30", ...pair.overrides }),
        }),
      ).toBe(pair.text);
    }
  });

  it("asks for presence only when the reminder requests confirmation", () => {
    const silent = composeNotificationText({
      style: "BALANCED",
      facts: facts({ confirmationRequested: false }),
    });
    const asking = composeNotificationText({
      style: "BALANCED",
      facts: facts({ confirmationRequested: true }),
    });

    expect(silent).not.toContain("confirma");
    expect(asking).toContain("confirma sua presença");
  });

  it("never asks for presence on a change notice", () => {
    const text = composeNotificationText({
      style: "CASUAL",
      // Mesmo com o fato marcado: confirmar presenca e do lembrete.
      facts: facts({ kind: "CHANGE_NOTICE", confirmationRequested: true }),
    });
    expect(text).not.toContain("Confirma pra mim");
  });

  it("says a cancelled appointment was cancelled, and a moved one was moved", () => {
    const cancelled = notificationFactualLines(
      facts({ kind: "CHANGE_NOTICE", appointmentStatus: "CANCELLED" }),
    ).join(" ");
    const moved = notificationFactualLines(
      facts({ kind: "CHANGE_NOTICE", appointmentStatus: "CONFIRMED" }),
    ).join(" ");

    expect(cancelled).toContain("foi cancelado");
    expect(moved).toContain("foi alterado");
  });

  it("falls back to the manual appointment title, then to a generic subject", () => {
    expect(
      notificationFactualLines(
        facts({ services: [], title: "Avaliação" }),
      ).join(" "),
    ).toContain("Avaliação");
    expect(
      notificationFactualLines(facts({ services: [], title: null })).join(" "),
    ).toContain("seu atendimento");
  });

  it("keeps the generic subject out of the sentence when a service exists", () => {
    const text = notificationFactualLines(facts()).join(" ");
    expect(text).toContain("seu atendimento de Corte");
  });

  it("omits the price when the owner did not send one", () => {
    const text = composeNotificationText({
      style: "PROFESSIONAL",
      facts: facts({ price: null }),
    });
    expect(text).not.toContain("Valor");
  });

  it("never repeats an address, because the facts do not carry one", () => {
    const keys = Object.keys(facts());
    expect(keys).not.toContain("address");
  });

  /**
   * As duas provas estruturais do item 5 do Goal: o texto e composto por
   * modelo, sem modelo de linguagem, e nenhum instante e formatado aqui.
   */
  it("composes without any language model call and without formatting instants", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/modules/reminders/notification-message.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    for (const forbidden of [
      "langchain",
      "openai",
      "OpenAI",
      "ChatOpenAI",
      "invokeModel",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    for (const forbidden of [
      "new Date(",
      "Intl.",
      "toLocale",
      "toISOString",
      "getHours",
      "timeZone",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

// Mensagem de exemplo da profissional (D-197): referencia de tom, nunca fonte
// de fato. Os mesmos textos estao em
// apps/frontend/tests/lembrete-mensagem-de-exemplo.test.ts. Mude os dois
// lados juntos.
describe("reminder message example", () => {
  const casual = (overrides: Partial<NotificationFacts>) =>
    composeNotificationText({ style: "CASUAL", facts: facts(overrides) });

  it("follows the example and fills the real facts", () => {
    const text = casual({
      messageExample:
        "Oii, {nome}! Tudo bem? 😊\n\nPassando pra lembrar do seu {servico} {data}, às {hora}.\nLembre de vir sem rímel 😉",
    });
    expect(text).toBe(
      "Oii, Ana! Tudo bem? 😊\n\nPassando pra lembrar do seu Corte na quarta-feira, 16/09, às 14h30.\n\nLembre de vir sem rímel 😉",
    );
  });

  it("asks for confirmation at the end when the business asks for it", () => {
    const text = casual({
      confirmationRequested: true,
      messageExample: "Oii, {nome}!\nSeu {servico} é {data}, às {hora}.",
    });
    expect(text).toBe(
      "Oii, Ana!\n\nSeu Corte é na quarta-feira, 16/09, às 14h30.\n\nConfirma pra mim? Pode responder sim ou não 💛",
    );
    // Sem confirmação pedida, nenhuma pergunta e nenhum fechamento do estilo:
    // o fechamento é o do exemplo.
    expect(
      casual({
        messageExample: "Oii, {nome}!\nSeu {servico} é {data}, às {hora}.",
      }),
    ).toBe("Oii, Ana!\n\nSeu Corte é na quarta-feira, 16/09, às 14h30.");
  });

  it("puts the price right after the sentence about the appointment, only by the policy", () => {
    const example =
      "Oi, {nome}!\nTe espero {data}, às {hora}, para {servico}.\nBeijos 💛";
    expect(casual({ price: 150, messageExample: example })).toBe(
      "Oi, Ana!\n\nTe espero na quarta-feira, 16/09, às 14h30, para Corte.\n\nValor: R$ 150,00.\n\nBeijos 💛",
    );
    expect(casual({ price: null, messageExample: example })).not.toContain(
      "R$",
    );
  });

  it("adds the standard sentence when the example lacks service, date or time", () => {
    const text = casual({
      price: 80,
      messageExample: "Oii, {nome}! 😊\nLembre de vir sem rímel 😉",
    });
    expect(text).toBe(
      "Oii, Ana! 😊\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 14h30.\n\nValor: R$ 80,00.\n\nLembre de vir sem rímel 😉",
    );
    // Um exemplo sem nenhum campo também nunca sai sem data e horário.
    expect(casual({ messageExample: "Até lá! 💛" })).toBe(
      "Até lá! 💛\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 14h30.",
    );
  });

  it("drops the name and its comma when the customer has no name", () => {
    expect(
      casual({
        customerName: "  ",
        messageExample:
          "Oii, {nome}! Tudo bem?\n{nome}\nSeu {servico} é {data}, às {hora}.",
      }),
    ).toBe("Oii! Tudo bem?\n\nSeu Corte é na quarta-feira, 16/09, às 14h30.");
  });

  it("replaces the fields in one pass, so a fact never becomes a field", () => {
    expect(
      casual({
        customerName: "{data} $& Bia",
        messageExample: "Oi, {nome}!\nSeu {servico} é {data}, às {hora}.",
      }),
    ).toBe(
      "Oi, {data} $& Bia!\n\nSeu Corte é na quarta-feira, 16/09, às 14h30.",
    );
  });

  it("keeps the literal date and time when they are invalid", () => {
    expect(
      casual({
        date: "16/09/2026",
        time: "2pm",
        messageExample: "Oi!\nSeu {servico} é {data}, às {hora}.",
      }),
    ).toBe("Oi!\n\nSeu Corte é no dia 16/09/2026, às 2pm.");
  });

  it("falls back to the standard message when the example cannot be used", () => {
    const standard = casual({});
    // Campo desconhecido: nunca sai "{valor}" ou "{endereco}" para a cliente.
    expect(casual({ messageExample: "Oi, {nome}! {endereco}" })).toBe(standard);
    // Vazio ou só espaços é o padrão.
    expect(casual({ messageExample: "   " })).toBe(standard);
    expect(casual({ messageExample: null })).toBe(standard);
    // `{servico}` sem serviço nem título: nada a pôr ali sem inventar.
    const noSubject = { services: [], title: null };
    expect(
      casual({
        ...noSubject,
        messageExample: "Oi!\nSeu {servico} é {data}, às {hora}.",
      }),
    ).toBe(casual(noSubject));
  });

  it("never applies the example to a change notice", () => {
    const notice = { kind: "CHANGE_NOTICE" as const };
    expect(
      casual({
        ...notice,
        messageExample: "Oi, {nome}!\nSeu {servico} é {data}, às {hora}.",
      }),
    ).toBe(casual(notice));
  });

  it("uses the example the same way in the three styles", () => {
    const example = "Oi, {nome}!\nSeu {servico} é {data}, às {hora}.";
    for (const style of AI_CONVERSATION_STYLES) {
      const text = composeNotificationText({
        style,
        facts: facts({ messageExample: example }),
      });
      expect(text).toBe(
        "Oi, Ana!\n\nSeu Corte é na quarta-feira, 16/09, às 14h30.",
      );
    }
  });
});
