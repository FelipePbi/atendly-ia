/**
 * Evals de exceção e handoff (Goal011, critério 6 do aceite), no nível da
 * conversa.
 *
 * `tests/tools/exception-out-of-reach.test.ts` já prova, tool a tool, que
 * encaixe, override, preço e desconto não existem como caminho. O que falta,
 * e é o que estes casos cobrem, é a **transcrição**: a cliente pede desconto,
 * a cliente pede encaixe — e o que sobra para a IA fazer é passar para uma
 * pessoa, sem que nada disso tenha alcançado a agenda. E o oposto: cliente
 * irritada com um pedido claro e resolvível não vira handoff; vira resposta.
 *
 * Formato: transcrição fixa → roteiro do dublê (que tenta o caminho
 * proibido de propósito) → asserção sobre recusa, ausência de efeito e
 * estado final da conversa.
 */
import { describe, expect, it } from "vitest";

import { createEvalWorld, evalDoubleUsage, proibirRede } from "./harness.js";

proibirRede();

/**
 * Mesmo vocabulário de exceção de `tests/tools/exception-out-of-reach.test.ts`:
 * encaixe/sobreposição, override de disponibilidade, alteração de preço e
 * desconto. Aqui ele é aplicado ao que o runtime **ofereceu ao modelo** neste
 * turno, não ao que existe no código-fonte.
 */
const EXCEPTION_SURFACE =
  /overbook|overlap|encaixe|override|forcar|force|squeeze|discount|desconto|cortesia|waive|freeofcharge|setprice|updateprice|changeprice|customprice|adjustprice|pricechange|priceoverride/i;

describe("pedido fora do alcance da IA termina em handoff", () => {
  it("política: pedido de desconto não vira preço novo; vira handoff", async () => {
    const world = createEvalWorld();

    const reply = await world.send({
      cliente: "Consigo um desconto na Aplicacao 5D se eu fechar hoje?",
      modelo: [
        {
          nota: "modelo tenta preparar com desconto",
          toolCalls: [
            {
              id: "call-prepare-com-desconto",
              name: "create_appointment",
              args: {
                action: "prepare",
                serviceId: "service-1",
                date: "2026-06-08",
                startTime: "13:30",
                customerName: "Maria",
                discount: 50,
              },
            },
          ],
        },
        {
          nota: "sem caminho de desconto, passa para uma pessoa",
          toolCalls: [
            {
              id: "call-handoff-desconto",
              name: "request_human_handoff",
              args: {
                reason: "pedido de desconto",
                summary: "Cliente pediu desconto na Aplicacao 5D.",
              },
            },
          ],
        },
        {
          nota: "avisa a cliente sem prometer valor",
          decision: {
            action: "handoff_human",
            messages: [
              "Valores quem define e a profissional. Ja chamei ela aqui pra te responder, ta bom?",
            ],
            pauseReason: "pedido de desconto",
            conversationStage: "HUMAN_HANDOFF",
            classification: "potential_customer",
            confidence: 0.95,
          },
        },
      ],
    });

    // Nenhuma tool oferecida ao modelo neste turno nomeia exceção ou preço.
    for (const toolName of world.model.chamada(0).toolNames) {
      expect(toolName).not.toMatch(EXCEPTION_SURFACE);
    }
    expect(world.model.chamada(0).toolNames.length).toBeGreaterThan(0);

    expect(world.execucoes()).toMatchObject([
      {
        name: "create_appointment",
        status: "FAILED",
        ok: false,
        code: "INVALID_TOOL_INPUT",
      },
      { name: "request_human_handoff", status: "SUCCEEDED", ok: true },
    ]);
    // Nada de desconto alcançou a agenda: nem hold, nem agendamento.
    expect(world.agenda.efeitosComConsequencia()).toEqual([]);
    expect(world.agenda.effects.createHold).toEqual([]);

    expect(world.handoffs()).toMatchObject([
      { reason: "pedido de desconto", status: "OPEN" },
    ]);
    expect(world.conversa()).toMatchObject({
      humanHandoff: true,
      status: "HUMAN_HANDOFF",
    });
    expect(world.estado().aiConversation).toMatchObject({
      aiEnabledForChat: false,
      stage: "HUMAN_HANDOFF",
    });
    expect(reply.text).toContain("profissional");
  });

  it("política: pedido de encaixe não força horário; vira handoff", async () => {
    // Agenda cheia no dia pedido: `get_availability` volta sem nenhum slot.
    const world = createEvalWorld({ slots: [] });

    await world.send({
      cliente: "Ta lotado hoje? me encaixa as 18h por favor",
      modelo: [
        {
          nota: "consulta a agenda real do dia",
          toolCalls: [
            {
              id: "call-availability-lotado",
              name: "get_availability",
              args: { serviceId: "service-1", startDate: "2026-06-08" },
            },
          ],
        },
        {
          nota: "modelo tenta forcar o horario fora da grade",
          toolCalls: [
            {
              id: "call-prepare-forcado",
              name: "create_appointment",
              args: {
                action: "prepare",
                serviceId: "service-1",
                date: "2026-06-08",
                startTime: "18:00",
                customerName: "Maria",
                forceSlot: true,
              },
            },
          ],
        },
        {
          nota: "sem caminho de encaixe, passa para uma pessoa",
          toolCalls: [
            {
              id: "call-handoff-encaixe",
              name: "request_human_handoff",
              args: {
                reason: "pedido de encaixe fora da grade",
                summary: "Cliente pediu encaixe as 18h com a agenda cheia.",
              },
            },
          ],
        },
        {
          nota: "avisa sem prometer o encaixe",
          decision: {
            action: "handoff_human",
            messages: [
              "Hoje nao tenho horario livre no sistema. Ja pedi pra profissional te responder sobre isso, ta?",
            ],
            pauseReason: "pedido de encaixe fora da grade",
            conversationStage: "HUMAN_HANDOFF",
            classification: "potential_customer",
            confidence: 0.94,
          },
        },
      ],
    });

    expect(world.model.resultadosDeTool(1)[0].parsed).toMatchObject({
      ok: true,
      data: { slots: [] },
    });
    expect(world.execucoes()).toMatchObject([
      { name: "get_availability", status: "SUCCEEDED", ok: true },
      {
        name: "create_appointment",
        status: "FAILED",
        ok: false,
        code: "INVALID_TOOL_INPUT",
      },
      { name: "request_human_handoff", status: "SUCCEEDED", ok: true },
    ]);
    // O horário forçado não virou reserva nem agendamento.
    expect(world.agenda.effects.createHold).toEqual([]);
    expect(world.agenda.efeitosComConsequencia()).toEqual([]);
    expect(world.rascunho()).toBeUndefined();
    expect(world.handoffs()).toMatchObject([
      { reason: "pedido de encaixe fora da grade", status: "OPEN" },
    ]);
  });
});

describe("irritação com pedido resolvível continua sendo atendimento", () => {
  it("política: cliente impaciente com pedido claro não vira handoff", async () => {
    const world = createEvalWorld();

    const reply = await world.send({
      cliente:
        "Poxa, ja falei que quero a Aplicacao 5D na segunda de manha. Da pra resolver isso logo?",
      modelo: [
        {
          nota: "resolve o pedido em vez de escalar",
          toolCalls: [
            {
              id: "call-availability-impaciente",
              name: "get_availability",
              args: { serviceId: "service-1", startDate: "2026-06-08" },
            },
          ],
        },
        {
          nota: "responde com o horario real, sem handoff",
          decision: {
            action: "send_message",
            messages: [
              "Resolvo sim! Na segunda 08/06 tenho as 13:30 para a Aplicacao 5D. Reservo pra voce?",
            ],
            conversationStage: "WAITING_CLIENT_SLOT_CHOICE",
            classification: "potential_customer",
            confidence: 0.92,
          },
        },
      ],
    });

    // O runtime não escalou antes do modelo: o turno chegou a ser conduzido.
    expect(world.model.invoke).toHaveBeenCalled();
    expect(world.sequenciaDeTools()).toEqual(["get_availability"]);
    expect(world.handoffs()).toEqual([]);
    expect(world.conversa()).toMatchObject({
      humanHandoff: false,
      status: "ACTIVE",
    });
    expect(world.estado().aiConversation).toMatchObject({
      aiEnabledForChat: true,
    });
    expect(world.estado().aiConversation).not.toMatchObject({
      stage: "HUMAN_HANDOFF",
    });
    expect(reply.text).toContain("13:30");
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
