import { describe, expect, it } from "vitest";

import { buildSchedulingPrompt } from "../../src/modules/prompts/scheduling.js";
import { spreadSlotsAcrossDays } from "../../src/modules/scheduling-service/client.js";

/**
 * Validação de 2026-10-11: "quais os horários disponíveis pra essa semana?"
 * recebeu só hoje às 8h, 8h30 e 9h. A busca devolvia os 3 primeiros horários
 * do motor, todos do mesmo dia, e a IA falava em "bloco" e "duração total"
 * para um serviço só.
 */
function day(date: string, times: string[]) {
  return times.map((startTime) => ({ date, startTime, endTime: startTime }));
}

const MONDAY = day("2026-10-12", ["08:00", "08:30", "09:00", "10:00", "14:00", "17:00"]);
const TUESDAY = day("2026-10-13", ["09:00", "15:00"]);
const WEDNESDAY = day("2026-10-14", ["08:00", "12:00", "18:00", "19:00"]);

describe("spreadSlotsAcrossDays", () => {
  it("espalha a oferta por dias diferentes, do comeco ao fim de cada dia", () => {
    const offer = spreadSlotsAcrossDays([...MONDAY, ...TUESDAY, ...WEDNESDAY], {
      maxDays: 5,
      perDay: 3,
    });
    expect(offer.map((slot) => `${slot.date} ${slot.startTime}`)).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 10:00",
      "2026-10-12 17:00",
      "2026-10-13 09:00",
      "2026-10-13 15:00",
      "2026-10-14 08:00",
      "2026-10-14 18:00",
      "2026-10-14 19:00",
    ]);
  });

  it("para no limite de dias", () => {
    const offer = spreadSlotsAcrossDays([...MONDAY, ...TUESDAY, ...WEDNESDAY], {
      maxDays: 2,
      perDay: 3,
    });
    expect(new Set(offer.map((slot) => slot.date))).toEqual(
      new Set(["2026-10-12", "2026-10-13"]),
    );
  });
});

describe("prompt de agenda", () => {
  const prompt = buildSchedulingPrompt().join("\n");

  it("manda consultar o periodo pedido e oferecer dias diferentes", () => {
    expect(prompt).toContain(
      "chame get_availability com startDate e days cobrindo exatamente esse periodo",
    );
  });

  it("pergunta o dia antes de listar a agenda e, com o dia cheio, oferece o proximo", () => {
    // Pedido do produto em 2026-10-11: a IA despejava varios dias de agenda
    // sem a cliente ter dito quando prefere.
    expect(prompt).toContain(
      "pergunte primeiro se ela tem preferencia de dia da semana ou turno",
    );
    expect(prompt).toContain(
      "Se o dia estiver cheio, diga isso em uma frase e ofereca o proximo dia com horario livre",
    );
  });

  it("proibe bloco e duracao total para um servico so", () => {
    expect(prompt).toContain(
      "Nunca use com a cliente as palavras bloco, bloco continuo, duracao total ou valor total quando for um servico so",
    );
  });
});

describe("oferta curta e agradecimento", () => {
  const prompt = buildSchedulingPrompt().join("\n");

  it("oferta em texto corrido, sem um horario por linha", () => {
    expect(prompt).toContain("nunca um horario por linha");
    expect(prompt).toContain("ofereca no maximo 2 dias com ate 3 opcoes cada");
  });

  it("consulta a agenda no turno da oferta, sem reaproveitar horario do historico", () => {
    // Validacao de 2026-10-11: a IA repetiu os horarios e a duracao de 1h40
    // de uma resposta anterior errada, sem chamar get_availability.
    expect(prompt).toContain(
      "Em todo turno em que for oferecer horarios, chame get_availability nesse mesmo turno.",
    );
  });

  it("no maximo 3 horarios por dia, sem repetir valor e duracao, e prepara antes de perguntar", () => {
    // Validacao de 2026-10-11: ofereceu 6 horarios na sexta, repetiu "40
    // minutos e R$ 35" e perguntou "Posso confirmar?" sem preparar; o "sim"
    // da cliente caiu em NO_PENDING_CONFIRMATION.
    expect(prompt).toContain("ofereca no maximo 3 por dia");
    expect(prompt).toContain("se ja disse na conversa, nao repita");
    expect(prompt).toContain("Para cliente recorrente (ja tem agendamento ou historico com o negocio) nao diga duracao nem valor");
    expect(prompt).toContain(
      "Nunca pergunte Posso marcar ou Posso confirmar sem um prepare com sucesso neste turno",
    );
  });

  it("com historico deduz o servico e confirma junto com a oferta; dia com data", () => {
    // Pedido do produto em 2026-10-12: "Seria pra design de sobrancelha,
    // certo?" junto dos horarios; so cliente nova e perguntada antes. E
    // "semana que vem" com a data do dia para nao gerar mal-entendido.
    expect(prompt).toContain("Seria pra design de sobrancelha, certo? Hoje tenho");
    expect(prompt).toContain("So para cliente nova, sem nenhum registro, pergunte qual servico");
    expect(prompt).toContain("Todo outro dia vai com o nome e a data entre parenteses");
  });

  it("agendamento confirmado encerra o assunto", () => {
    // Validacao de 2026-10-12: depois de confirmar terca as 8h, um "oi" fez a
    // IA tentar confirmar de novo e oferecer marcar o mesmo horario.
    expect(prompt).toContain("nunca chame action=confirm de novo nem ofereca marcar de novo o mesmo horario");
  });

  it("agradece com obrigada, a voz da assistente", () => {
    expect(prompt).toContain("Agradeca sempre com obrigada, nunca obrigado");
    // Validacao de 2026-10-11: "tenha um otimo dia" as 23h54.
    expect(prompt).toContain("Termine com a frase de Despedida para agora");
    expect(prompt).toContain("nunca diga Te vejo hoje: diga Te vejo mais tarde, ou Ate daqui a pouco");
  });
});

describe("data atual no prompt", () => {
  it("usa o fuso do negocio e o dia da semana, nao o ISO em UTC", async () => {
    const { formatCurrentDateTime } = await import(
      "../../src/modules/prompts/system.js"
    );
    expect(
      formatCurrentDateTime("2026-10-12T01:30:00.000Z", "America/Sao_Paulo"),
    ).toBe(
      "domingo, 11/10/2026 22:30 (hoje e 11/10; fuso America/Sao_Paulo)",
    );
  });
});

describe("despedida pela hora do negocio", () => {
  it.each([
    ["2026-10-12T03:00:00.000Z", "tenha uma ótima noite"], // 00h em Sao Paulo
    ["2026-10-12T07:30:00.000Z", "tenha uma ótima noite"], // 04h30
    ["2026-10-12T11:00:00.000Z", "tenha um ótimo dia"], // 08h
    ["2026-10-12T17:00:00.000Z", "tenha uma ótima tarde"], // 14h
    ["2026-10-12T22:00:00.000Z", "tenha uma ótima noite"], // 19h
  ])("%s vira %j", async (iso, expected) => {
    const { farewellForNow } = await import("../../src/modules/prompts/system.js");
    expect(farewellForNow(iso, "America/Sao_Paulo")).toBe(expected);
  });
});

describe("hoje e amanha pelo nome", () => {
  // Validacao de 2026-10-12: a 00h20 de segunda (12/10) a IA ofereceu
  // "segunda as 8h" e "terca as 8h" sem data, confundivel com a semana
  // seguinte (a cliente ja tinha terca (20/10) as 8h agendada).
  it("o prompt traz hoje e amanha prontos, com dia da semana e data", async () => {
    const { todayAndTomorrow } = await import("../../src/modules/prompts/system.js");
    expect(todayAndTomorrow("2026-10-12T03:20:00.000Z", "America/Sao_Paulo")).toMatch(
      /^hoje e segunda \(12\/10\); amanha e terça \(13\/10\)/,
    );
  });

  it("a regra manda dizer hoje e amanha e comecar com Seria pra..., certo?", () => {
    const prompt = buildSchedulingPrompt().join("\n");
    expect(prompt).toContain("Chame o dia de hoje de hoje e o de amanha de amanha");
    // Validacao de 2026-10-12, 00h33: "Posso marcar design de sobrancelha
    // amanha as 15h?" foi lido como segunda, mas era terca (13/10).
    expect(prompt).toContain("sempre seguidos do dia da semana e da data, por exemplo: amanha, terca (13/10), as 15h.");
    expect(prompt).toContain("Entre 0h e 5h nao use hoje nem amanha");
    expect(prompt).toContain("comece a oferta sempre com a pergunta Seria pra <servico>, certo?");
  });
});

describe("oferta com no maximo 3 horarios por dia, mesmo para um dia so", () => {
  // Validacao de 2026-10-12: para "amanha" a busca devolvia 6 horarios e a
  // IA repassou todos ("9h, 9h30, 10h, 11h, 15h ou 15h30").
  it("o cliente da agenda devolve no maximo 3 por dia mesmo com days 1", async () => {
    const { SchedulingClient } = await import(
      "../../src/modules/scheduling-service/client.js"
    );
    const day = ["08:00", "09:00", "09:30", "10:00", "11:00", "15:00", "15:30"].map(
      (startTime) => ({ date: "2026-10-13", startTime, endTime: startTime }),
    );
    // So o metodo de rede e trocado: o resto e o cliente real.
    const client = Object.create(SchedulingClient.prototype) as InstanceType<
      typeof SchedulingClient
    >;
    (client as unknown as { request: () => Promise<unknown> }).request = async () => day;
    const offer = await client.getAvailableSlotsForServices(
      ["service-1"],
      "2026-10-13",
      { timezone: "America/Sao_Paulo" } as never,
      undefined,
      { days: 1 },
    );
    expect(offer.map((slot) => slot.startTime)).toEqual(["08:00", "10:00", "15:30"]);
  });

  it("o prompt mostra o jeito errado ao lado do certo para a pergunta do servico", () => {
    const prompt = buildSchedulingPrompt().join("\n");
    expect(prompt).toContain("errado: Para design de sobrancelha, amanha tenho as 9h.");
  });
});

describe("amanha de madrugada e dia da semana citado", () => {
  // Validacao de 2026-10-12, 00h40 de segunda: a cliente escreveu "amanha
  // segunda, tem algum horario?" e a IA respondeu com terca (13/10).
  it("de madrugada o prompt avisa que amanha quase sempre e o dia que comeca", async () => {
    const { todayAndTomorrow } = await import("../../src/modules/prompts/system.js");
    expect(todayAndTomorrow("2026-10-12T03:40:00.000Z", "America/Sao_Paulo")).toBe(
      "hoje e segunda (12/10); amanha e terça (13/10); e madrugada: se a cliente disser amanha sem dia da semana, pergunte antes de consultar a agenda: Pra hoje, segunda (12/10), ou terça (13/10)?",
    );
    // Fora da madrugada, sem a observacao.
    expect(todayAndTomorrow("2026-10-12T15:00:00.000Z", "America/Sao_Paulo")).toBe(
      "hoje e segunda (12/10); amanha e terça (13/10)",
    );
  });

  it("o dia da semana citado pela cliente vale mais que hoje ou amanha", () => {
    const prompt = buildSchedulingPrompt().join("\n");
    expect(prompt).toContain(
      "Se a cliente disser o dia da semana (segunda, terca...), ele vale mais que hoje ou amanha",
    );
    // Validacao de 2026-10-12, 00h55: "queria ver um horario pra amanha" e a
    // IA escolheu terca sozinha; de madrugada ela pergunta.
    expect(prompt).toContain("Entre 0h e 5h, se a cliente disser amanha sem dia da semana, nao escolha por ela");
    // "mas segunda amanha de tarde, tem algum horario?" e a IA insistiu em
    // terca (13/10): ela nao corrige o dia que a cliente disse.
    expect(prompt).toContain("Nunca corrija nem troque o dia que a cliente disse");
    expect(prompt).toContain("Pra hoje, segunda-feira (12/10), tenho as 14h");
  });
});
