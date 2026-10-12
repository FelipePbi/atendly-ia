import { describe, expect, it } from "vitest";

import { buildSchedulingPrompt } from "../../src/modules/prompts/scheduling.js";
import { slotChoiceIsAmbiguous } from "../../src/modules/tools/assistant-tools.js";

/**
 * Regressão da validação de 2026-10-11: a IA ofereceu três horários, a
 * cliente respondeu "pode ser" sem dizer qual, e a IA seguiu com um deles.
 * Com mais de um horário oferecido, a IA precisa perguntar qual a cliente
 * quer. `prepare` de create_appointment recusa com SLOT_CHOICE_REQUIRED
 * enquanto a escolha não for dita, e o prompt de agenda manda perguntar.
 */
const OFFER = "Tenho segunda às 13h, 14h40 ou 16h20. Qual fica melhor?";

describe("slotChoiceIsAmbiguous", () => {
  it.each(["Pode ser", "pode ser sim", "Sim", "ok", "Fechado!", "Perfeito, pode reservar esse horario."])(
    "três horários oferecidos e a resposta %j não escolhe nenhum",
    (reply) => {
      expect(slotChoiceIsAmbiguous(OFFER, reply, "14:40")).toBe(true);
    },
  );

  it.each([
    "14h40",
    "Pode ser às 14h40",
    "pode ser 16:20",
    "o primeiro",
    "O último, por favor",
    "o ultimo",
    "o mais cedo",
    "prefiro mais tarde",
    "a segunda opção",
    // Validacao de 2026-10-12: "as 14" foi recusado com SLOT_CHOICE_REQUIRED.
    "as 13",
    "às 14",
    "16",
  ])("a resposta %j diz qual horário", (reply) => {
    expect(slotChoiceIsAmbiguous(OFFER, reply, "14:40")).toBe(false);
  });

  it("com um horário só oferecido, 'pode ser' é escolha", () => {
    expect(
      slotChoiceIsAmbiguous("Tenho segunda às 14h40. Posso reservar?", "Pode ser", "14:40"),
    ).toBe(false);
  });

  it("horário preparado fora da oferta não é esta dúvida", () => {
    expect(slotChoiceIsAmbiguous(OFFER, "Pode ser", "18:00")).toBe(false);
  });

  it("o prompt de agenda manda perguntar qual horário quando a resposta não escolhe", () => {
    expect(buildSchedulingPrompt().join("\n")).toContain(
      "Se voce ofereceu mais de um horario e a cliente respondeu sem dizer qual",
    );
  });
});

/**
 * Validação de 2026-10-11: depois de `prepare` a IA disse "ficou reservado
 * para 08:00" e só então perguntou "Posso confirmar?". O horário só estava
 * segurado; a cliente podia achar que já estava marcado.
 */
describe("pergunta de confirmacao antes de confirmar", () => {
  it("o prompt de agenda proibe reservado/agendado antes de action=confirm e da o formato da pergunta", () => {
    const prompt = buildSchedulingPrompt().join(" ");
    expect(prompt).toContain(
      "Depois de action=prepare o horario so esta segurado, nao marcado.",
    );
    expect(prompt).toContain("nunca diga reservado, agendado, marcado ou confirmado");
    expect(prompt).toContain("Posso marcar Aplicacao 5D hoje as 8h (ate 9h40)?");
  });
});

/**
 * Validação de 2026-10-11: a cliente pediu "design de sombrancelha com rena"
 * e a IA listou "Design de sobrancelha, ou Design de sobrancelha + Henna" em
 * vez de seguir com o serviço que ela já tinha escolhido.
 */
describe("servico ja escolhido com outras palavras", () => {
  it("o prompt manda usar o servico correspondente e seguir, sem listar de novo", async () => {
    const { buildSystemPrompt } = await import("../../src/modules/prompts/system.js");
    const { DEFAULT_BUSINESS_CONTEXT } = await import(
      "../../src/modules/tenant-config/business-context.js"
    );
    const { text } = buildSystemPrompt({
      state: {},
      groupedMessages: "Quero fazer design de sombrancelha com rena",
      currentDateTime: "2026-01-01T00:00:00.000Z",
      businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
      aiSettings: { aiEnabled: true, tone: "BALANCED" },
      knowledgeRequested: false,
      retrievedKnowledge: [],
    });
    expect(text).toContain("Quando a cliente ja disse qual servico quer");
    expect(text).toContain("Nao liste de novo opcoes que ela nao pediu.");
    // Validacao de 2026-10-11: "Quais servicos voces tem?" virou a lista
    // inteira do catalogo, com cada nome por extenso.
    expect(text).toContain(
      "Quando a cliente perguntar quais servicos o negocio tem, responda por categoria",
    );
    expect(text).toContain("Va afunilando a intencao da cliente");
    // Validacao de 2026-10-11: a resposta emendou buco, brow lamination,
    // remocao, teste alergico e pacote henna depois das categorias, e abriu
    // com Oi! Tudo bem? logo depois da saudacao ja enviada.
    expect(text).toContain("Cite so as 2 ou 3 categorias principais");
    expect(text).toContain("se o historico recente ja tem uma mensagem sua");
    // Validacao de 2026-10-11: a IA buscou o preco na base de conhecimento
    // (recusada) e respondeu "nao consigo ver esse valor"; inventou manutencao
    // "a cada 15 a 20 dias"; e copiou "pra voce" sem acento do exemplo.
    expect(text).toContain("chame list_services com includePrices true");
    expect(text).toContain("Nunca use media de mercado nem opiniao propria.");
    expect(text).toContain("Escreva sempre em portugues com acentuacao correta");
    // Validacao de 2026-10-11, rodada seguinte: ainda listou avulsos copiando
    // o historico e voltou ao "Como posso te ajudar hoje?".
    expect(text).toContain("Vale mesmo que voce ja tenha respondido de outro jeito antes nesta conversa.");
    expect(text).toContain("nunca Como posso te ajudar hoje?");
    // "Tive um probleminha na confirmacao. Vou refazer direitinho, ta?"
    expect(text).toContain("nunca conte para a cliente que houve problema");
  });
});
