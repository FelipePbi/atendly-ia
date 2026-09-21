/**
 * Eval do vocabulário de espera (Goal034, A-09), no nível da conversa.
 *
 * AGENTS.md promete que a assistente nunca anuncia que está consultando ou
 * processando, nem pede para a cliente aguardar (regra 16 de `MAIN_RULES`,
 * `system.ts`). Este eval observa a metade que o runtime controla: quando a
 * cliente pergunta algo que exige tool, o turno de tool não emite mensagem
 * por conta própria — só a decisão final do roteiro vira mensagem de saída.
 *
 * **O que este eval prova**: com o roteiro fixo abaixo, nenhuma mensagem sai
 * para a cliente entre a chamada da tool e a decisão final; a única mensagem
 * de saída do turno é a resposta com o dado real, não um aviso de espera. É
 * o runtime, não o modelo, que garante isso — o loop de tools não tem um
 * caminho que produza mensagem de saída própria.
 *
 * **O que este eval NÃO prova**: que o modelo real, em produção, segue a
 * regra 16 e nunca escreve "só um instante" dentro do texto da própria
 * decisão. O modelo aqui é um dublê roteirizado pelo próprio eval — ele não
 * escolhe dizer "aguarde" porque o roteiro não pediu, não porque entendeu a
 * regra. Aderência do modelo real ao prompt não é verificável por eval
 * determinístico; só por avaliação com o modelo de verdade.
 */
import { describe, expect, it } from "vitest";

import { VOCABULARIO_DE_ESPERA } from "../support/vocabulario-de-espera.js";
import { createEvalWorld, evalDoubleUsage, proibirRede } from "./harness.js";

proibirRede();

describe("A-09: turno de tool não emite mensagem por conta própria", () => {
  it("cliente pergunta algo que exige consulta; só a resposta real sai, nunca um aviso de espera", async () => {
    const world = createEvalWorld();

    const reply = await world.send({
      cliente: "Quanto custa a Aplicacao 5D?",
      modelo: [
        {
          nota: "chama a tool em silencio, sem anunciar nada a cliente",
          toolCalls: [
            {
              id: "call-list-services-preco",
              name: "list_services",
              args: { includePrices: true },
            },
          ],
        },
        {
          nota: "com o resultado da tool na mao, responde com o preco real",
          decision: {
            action: "send_message",
            messages: ["A Aplicacao 5D custa R$190."],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "potential_customer",
            confidence: 0.9,
          },
        },
      ],
    });

    // O que voltou a cliente e a resposta real, nao um aviso de espera.
    expect(reply.text).toContain("190");
    expect(reply.text).not.toMatch(VOCABULARIO_DE_ESPERA);

    // O turno de tool (primeiro passo do roteiro) nao emitiu mensagem por
    // conta propria: a unica mensagem de saida do turno inteiro e a decisao
    // final, e o texto dela e identico ao que chegou a cliente.
    const outbound = world.store.messages.filter(
      (message) => message.direction === "OUTBOUND",
    );
    expect(outbound).toHaveLength(1);
    expect(outbound[0]?.body).toBe(reply.text);
    for (const message of outbound) {
      expect(message.body).not.toMatch(VOCABULARIO_DE_ESPERA);
    }
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
