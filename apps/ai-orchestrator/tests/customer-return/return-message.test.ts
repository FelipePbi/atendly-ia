import { describe, expect, it } from "vitest";

import {
  absencePhrase,
  composeReturnParts,
  composeReturnText,
  defaultReturnTemplate,
  relativeDay,
  returnFactualLines,
  slotsPhrase,
} from "../../src/modules/customer-return/return-message.js";
import type { ReturnFacts } from "../../src/modules/customer-return/return-types.js";

/**
 * Texto da mensagem de retorno (D-206): por modelo, sem modelo de linguagem,
 * com os fatos iguais nos três estilos. Datas de referência: 2026-10-19 é
 * segunda-feira.
 */

function renewal(overrides: Partial<ReturnFacts> = {}): ReturnFacts {
  return {
    kind: "RENEWAL",
    followUp: false,
    customerId: "customer-a",
    customerName: "Adriana Souza",
    customerPhone: "5511999999999",
    serviceName: "Manutenção 5D",
    timezone: "America/Sao_Paulo",
    today: "2026-10-19",
    expectedDate: "2026-10-22",
    intervalDays: 15,
    intervalSource: "SERVICE",
    lastVisitDate: "2026-10-07",
    daysSinceLastVisit: 12,
    offeredSlots: [
      { date: "2026-10-23", time: "17:30" },
      { date: "2026-10-24", time: "18:00" },
    ],
    habit: { weekdays: [5, 6], bandStart: "16:00", bandEnd: "19:00" },
    incentive: null,
    messageTemplate: null,
    ...overrides,
  };
}

function winback(overrides: Partial<ReturnFacts> = {}): ReturnFacts {
  return renewal({
    kind: "WINBACK",
    customerName: "Joice",
    expectedDate: null,
    intervalDays: null,
    intervalSource: null,
    daysSinceLastVisit: 95,
    offeredSlots: [],
    incentive: "10% de desconto em qualquer serviço até o fim do mês.",
    ...overrides,
  });
}

describe("datas em palavras", () => {
  it("dia relativo a hoje", () => {
    expect(relativeDay("2026-10-19", "2026-10-19")).toBe("hoje");
    expect(relativeDay("2026-10-19", "2026-10-20")).toBe("amanhã");
    expect(relativeDay("2026-10-19", "2026-10-22")).toBe("na quinta-feira");
    expect(relativeDay("2026-10-19", "2026-10-17")).toBe("no sábado");
    expect(relativeDay("2026-10-19", "2026-11-03")).toBe("em 03/11");
  });

  it("horários oferecidos: amanhã, dia da semana ou dia com data", () => {
    expect(
      slotsPhrase("2026-10-19", [
        { date: "2026-10-20", time: "09:00" },
        { date: "2026-10-23", time: "17:30" },
        { date: "2026-10-31", time: "10:00" },
      ]),
    ).toBe("amanhã às 9h, sexta às 17h30 ou sábado, 31/10, às 10h");
    expect(slotsPhrase("2026-10-19", [])).toBeNull();
  });

  it("ausência em dias ou meses", () => {
    expect(absencePhrase(45)).toBe("há 45 dias");
    expect(absencePhrase(95)).toBe("há 3 meses");
    expect(absencePhrase(400)).toBe("há mais de um ano");
  });
});

describe("Renovação", () => {
  it("prazo do serviço, dois horários reais e o primeiro nome", () => {
    expect(
      composeReturnText({
        style: "BALANCED",
        facts: renewal(),
        delivery: "SINGLE",
      }),
    ).toBe(
      [
        "Oi, Adriana! Tudo bem?",
        "Seu atendimento de Manutenção 5D completa 15 dias na quinta-feira. Quer que eu já reserve um horário? Tenho sexta às 17h30 ou sábado às 18h.",
      ].join("\n\n"),
    );
  });

  it("data que já passou fala no passado", () => {
    expect(returnFactualLines(renewal({ expectedDate: "2026-10-17" }))).toEqual(
      ["Seu atendimento de Manutenção 5D completou 15 dias no sábado."],
    );
  });

  it("sem horário livre, pergunta em vez de inventar", () => {
    const text = composeReturnText({
      style: "PROFESSIONAL",
      facts: renewal({ offeredSlots: [] }),
    });
    expect(text).toContain("Posso verificar um horário para você?");
    expect(text).not.toContain("Tenho");
  });

  it("os fatos são os mesmos nos três estilos; muda só a voz", () => {
    const texts = (["PROFESSIONAL", "BALANCED", "CASUAL"] as const).map(
      (style) => composeReturnText({ style, facts: renewal() }),
    );
    for (const text of texts) {
      expect(text).toContain(returnFactualLines(renewal())[0]);
      expect(text).toContain("sexta às 17h30 ou sábado às 18h");
    }
    expect(texts[0]).toMatch(/^Olá, Adriana\./u);
    expect(texts[2]).toContain("😊");
  });
});

describe("Resgate", () => {
  it("leve, de saudade, com o incentivo da profissional e sem horários", () => {
    expect(
      composeReturnText({ style: "CASUAL", facts: winback(), delivery: "SINGLE" }),
    ).toBe(
      [
        "Oii, Joice! Tudo bem? 😊",
        "Faz um tempinho que você não aparece por aqui 💕 Pra sua volta, tenho uma condição especial: 10% de desconto em qualquer serviço até o fim do mês 💛",
        "Quer que eu veja um horário pra você? 💛",
      ].join("\n\n"),
    );
  });

  it("sem texto de incentivo, sem incentivo", () => {
    const text = composeReturnText({
      style: "BALANCED",
      facts: winback({ incentive: null }),
    });
    expect(text).not.toMatch(/condição|desconto|brinde/u);
    expect(text).toContain("Faz um tempinho que você não aparece por aqui.");
  });
});

describe("texto-base da profissional", () => {
  it("troca os campos pelos fatos e nunca deixa os horários de fora", () => {
    const text = composeReturnText({
      style: "BALANCED",
      facts: renewal({
        messageTemplate:
          "Oiee, {nome}! Tá chegando a hora da {servico} ({quando}) 💅",
      }),
    });
    expect(text).toBe(
      [
        "Oiee, Adriana! Tá chegando a hora da Manutenção 5D (na quinta-feira) 💅",
        "Tenho sexta às 17h30 ou sábado às 18h.",
      ].join("\n\n"),
    );
  });

  it("incentivo que o texto não cita entra no fim; linha do incentivo some sem incentivo", () => {
    const withIncentive = composeReturnText({
      style: "BALANCED",
      facts: winback({ messageTemplate: "Oi, {nome}! Saudade de você." }),
    });
    expect(withIncentive).toContain(
      "Pra sua volta, tenho uma condição especial: 10% de desconto em qualquer serviço até o fim do mês.",
    );
    const without = composeReturnText({
      style: "BALANCED",
      facts: winback({
        incentive: null,
        messageTemplate: "Oi, {nome}!\nTenho {incentivo} pra você.",
      }),
    });
    expect(without).toBe("Oi, Joice!");
  });

  it("campo desconhecido ou horário que não existe volta ao padrão", () => {
    const unknown = composeReturnText({
      style: "BALANCED",
      facts: renewal({ messageTemplate: "Oi {apelido}" }),
    });
    expect(unknown.startsWith("Oi, Adriana!\n\nTudo bem?")).toBe(true);
    const noSlots = composeReturnText({
      style: "BALANCED",
      facts: renewal({ offeredSlots: [], messageTemplate: "Tenho {horarios}" }),
    });
    expect(noSlots).toContain("Quer que eu veja um horário pra você?");
  });
});

describe("lembrete único", () => {
  it("curto, sem horário novo e sem texto-base", () => {
    expect(
      composeReturnText({
        style: "BALANCED",
        facts: renewal({ followUp: true, messageTemplate: "ignorado {nome}" }),
      }),
    ).toBe(
      [
        "Oi, Adriana!",
        "Passando só pra saber se você quer marcar o seu atendimento de Manutenção 5D.",
        "Quer que eu veja um horário pra você?",
      ].join("\n\n"),
    );
    const winbackFollowUp = composeReturnText({
      style: "PROFESSIONAL",
      facts: winback({ followUp: true }),
    });
    expect(winbackFollowUp).toContain(
      "Para o seu retorno, há uma condição especial: 10% de desconto",
    );
  });
});

describe("texto-base inicial do editor", () => {
  it("é o padrão escrito com os campos, e gera a mesma frase da prévia da tela", () => {
    const template = defaultReturnTemplate("RENEWAL", "BALANCED");
    expect(template).toBe(
      [
        "Oi, {nome}! Tudo bem?",
        "Está chegando a hora do seu atendimento de {servico}, {quando}. Quer que eu já reserve um horário? Tenho {horarios}.",
      ].join("\n\n"),
    );
    expect(
      composeReturnText({
        style: "BALANCED",
        facts: renewal({ messageTemplate: template }),
      }),
    ).toBe(
      [
        "Oi, Adriana! Tudo bem?",
        "Está chegando a hora do seu atendimento de Manutenção 5D, na quinta-feira. Quer que eu já reserve um horário? Tenho sexta às 17h30 ou sábado às 18h.",
      ].join("\n\n"),
    );
  });
});

// D-208: em varias mensagens curtas. As mesmas partes estao em
// apps/frontend/tests/message-parts-preview.test.ts; mude os dois lados.
describe("em várias mensagens curtas (D-208)", () => {
  it("Renovação: saudação, tudo bem, o fato, a pergunta e os horários, cada um uma mensagem", () => {
    const parts = composeReturnParts({
      style: "BALANCED",
      facts: renewal(),
      delivery: "PARTS",
    });
    expect(parts).toEqual([
      "Oi, Adriana!",
      "Tudo bem?",
      "Seu atendimento de Manutenção 5D completa 15 dias na quinta-feira.",
      "Quer que eu já reserve um horário?",
      "Tenho sexta às 17h30 ou sábado às 18h.",
    ]);
    // Mesmas frases da mensagem só: dividir não muda fato.
    const single = composeReturnText({
      style: "BALANCED",
      facts: renewal(),
      delivery: "SINGLE",
    });
    for (const part of parts) expect(single).toContain(part);
    expect(composeReturnText({ style: "BALANCED", facts: renewal() })).toBe(
      parts.join("\n\n"),
    );
  });

  it("Renovação sem horário livre: pergunta aberta como última parte", () => {
    expect(
      composeReturnParts({
        style: "CASUAL",
        facts: renewal({ offeredSlots: [] }),
        delivery: "PARTS",
      }),
    ).toEqual([
      "Oii, Adriana!",
      "Tudo bem? 😊",
      "Seu atendimento de Manutenção 5D completa 15 dias na quinta-feira.",
      "Quer que eu veja um horário pra você? 💛",
    ]);
  });

  it("Resgate com incentivo: a saudade e a condição em mensagens separadas", () => {
    expect(
      composeReturnParts({
        style: "BALANCED",
        facts: winback(),
        delivery: "PARTS",
      }),
    ).toEqual([
      "Oi, Joice!",
      "Tudo bem?",
      "Faz um tempinho que você não aparece por aqui.",
      "Pra sua volta, tenho uma condição especial: 10% de desconto em qualquer serviço até o fim do mês.",
      "Quer que eu veja um horário pra você?",
    ]);
  });

  it("Resgate sem incentivo e profissional: sem condição nenhuma", () => {
    expect(
      composeReturnParts({
        style: "PROFESSIONAL",
        facts: winback({ incentive: null }),
        delivery: "PARTS",
      }),
    ).toEqual([
      "Olá, Joice.",
      "Faz algum tempo desde o seu último atendimento por aqui.",
      "Posso verificar um horário para você?",
    ]);
  });

  it("lembrete único: as mesmas três partes nos dois modos", () => {
    const facts = renewal({ followUp: true });
    const parts = composeReturnParts({
      style: "BALANCED",
      facts,
      delivery: "PARTS",
    });
    expect(parts).toEqual([
      "Oi, Adriana!",
      "Passando só pra saber se você quer marcar o seu atendimento de Manutenção 5D.",
      "Quer que eu veja um horário pra você?",
    ]);
    expect(
      composeReturnParts({ style: "BALANCED", facts, delivery: "SINGLE" }),
    ).toEqual(parts);
  });

  it("texto-base da profissional: cada linha é uma mensagem, e o que a rodada promete vem depois", () => {
    expect(
      composeReturnParts({
        style: "CASUAL",
        delivery: "PARTS",
        facts: renewal({
          messageTemplate:
            "Oiii {nome}\nTudo bem?\nVi aqui que a {servico} completa 15 dias {quando}\nVamos marcar pra essa semana?",
        }),
      }),
    ).toEqual([
      "Oiii Adriana",
      "Tudo bem?",
      "Vi aqui que a Manutenção 5D completa 15 dias na quinta-feira",
      "Vamos marcar pra essa semana?",
      "Tenho sexta às 17h30 ou sábado às 18h.",
    ]);
  });
});

describe("texto-base inicial em várias mensagens (D-208)", () => {
  it("uma ideia por linha, e cada linha é uma mensagem", () => {
    const template = defaultReturnTemplate("RENEWAL", "BALANCED", "PARTS");
    expect(
      composeReturnParts({
        style: "BALANCED",
        delivery: "PARTS",
        facts: renewal({ messageTemplate: template }),
      }),
    ).toEqual([
      "Oi, Adriana!",
      "Tudo bem?",
      "Está chegando a hora do seu atendimento de Manutenção 5D, na quinta-feira.",
      "Quer que eu já reserve um horário?",
      "Tenho sexta às 17h30 ou sábado às 18h.",
    ]);
    expect(defaultReturnTemplate("RENEWAL", "BALANCED")).toBe(
      defaultReturnTemplate("RENEWAL", "BALANCED", "SINGLE"),
    );
  });
});
