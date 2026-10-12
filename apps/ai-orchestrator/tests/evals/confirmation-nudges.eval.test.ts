/**
 * Eval dos avisos internos de `AssistantService.invokeGraphAgent` (validação
 * de 2026-10-11/12), no nível da conversa completa.
 *
 * Quando a resposta final do modelo (sem tool call) cai num padrão conhecido
 * de erro, o runtime devolve a resposta ao modelo **uma vez** com um aviso
 * interno no input, em vez de mandar o erro à cliente:
 *
 * - pergunta de confirmação de agendamento sem `pendingAction` preparado
 *   (`asksConfirmationWithoutDraft` / `confirmationWithoutDraftNudge`);
 * - decisão `call_tool` descrita no JSON, sem tool call real
 *   (`describesToolCallInsteadOfCalling` / `describedToolCallNudge`).
 *
 * O dublê aqui erra de propósito no primeiro passo e acerta depois do aviso;
 * o eval prova que o aviso chega ao input da chamada seguinte, que o efeito
 * real acontece e que o aviso não se repete no mesmo turno. Não prova que o
 * modelo real obedece ao aviso (D-050, item 2).
 */
import { describe, expect, it } from "vitest";

import { createEvalWorld, evalDoubleUsage, proibirRede } from "./harness.js";

proibirRede();

const AVISO_INTERNO = "[Aviso interno";

const SLOT_SEXTA_18H = { date: "2026-06-12", startTime: "18:00", endTime: "18:30" };

function ultimaMensagem(world: ReturnType<typeof createEvalWorld>, index: number) {
  const messages = world.model.chamada(index).messages;
  const last = messages.at(-1);
  return typeof last?.content === "string" ? last.content : JSON.stringify(last?.content);
}

function avisosNoInput(world: ReturnType<typeof createEvalWorld>, index: number) {
  return world.model
    .chamada(index)
    .messages.filter(
      (message) =>
        typeof message.content === "string" && message.content.startsWith(AVISO_INTERNO),
    );
}

function warnsCom(world: ReturnType<typeof createEvalWorld>, trecho: string) {
  return world.logger.warn.mock.calls.filter(
    (call) => typeof call[1] === "string" && call[1].includes(trecho),
  );
}

const PERGUNTA_SEM_RASCUNHO = {
  action: "send_message",
  messages: ["Posso confirmar design de sobrancelha na sexta às 18h?"],
  conversationStage: "CONFIRMING_APPOINTMENT",
  classification: "potential_customer",
  confidence: 0.9,
};

describe("pergunta de confirmação sem rascunho: aviso para preparar antes (2026-10-11)", () => {
  // Evita: a IA perguntou "Posso confirmar design de sobrancelha na sexta às
  // 18h?" sem chamar create_appointment action=prepare, e o "sim" da cliente
  // caiu em NO_PENDING_CONFIRMATION.
  it("o dublê pergunta sem prepare, recebe o aviso, prepara e só então pergunta", async () => {
    const world = createEvalWorld({ slots: [SLOT_SEXTA_18H] });

    const reply = await world.send({
      cliente: "Quero design de sobrancelha na sexta as 18h",
      modelo: [
        {
          nota: "pergunta se pode confirmar sem ter preparado nada (erro de 2026-10-11)",
          decision: PERGUNTA_SEM_RASCUNHO,
        },
        {
          nota: "depois do aviso, prepara de verdade",
          toolCalls: [
            {
              id: "call-prepare-sobrancelha",
              name: "create_appointment",
              args: {
                action: "prepare",
                serviceId: "service-2",
                date: "2026-06-12",
                startTime: "18:00",
                customerName: "Maria",
              },
            },
          ],
        },
        {
          nota: "com o rascunho gravado, a mesma pergunta passa sem novo aviso",
          decision: PERGUNTA_SEM_RASCUNHO,
        },
      ],
    });

    expect(avisosNoInput(world, 0)).toEqual([]);
    expect(ultimaMensagem(world, 1)).toContain(AVISO_INTERNO);
    expect(ultimaMensagem(world, 1)).toContain("action=prepare");
    expect(world.sequenciaDeTools()).toEqual(["create_appointment"]);
    expect(world.rascunho()).toMatchObject({ type: "schedule" });
    expect(reply.text).toBe("Posso confirmar design de sobrancelha na sexta às 18h?");
    expect(warnsCom(world, "without a prepared draft")).toHaveLength(1);
  });

  it("o aviso sai no máximo uma vez por turno: se o dublê insiste, não há terceira chamada", async () => {
    const world = createEvalWorld({ slots: [SLOT_SEXTA_18H] });

    await world.send({
      cliente: "Quero design de sobrancelha na sexta as 18h",
      modelo: [
        { nota: "pergunta sem prepare", decision: PERGUNTA_SEM_RASCUNHO },
        {
          nota: "ignora o aviso e pergunta de novo sem prepare; o turno termina aqui",
          decision: PERGUNTA_SEM_RASCUNHO,
        },
      ],
    });

    expect(world.model.calls).toHaveLength(2);
    expect(avisosNoInput(world, 1)).toHaveLength(1);
    expect(warnsCom(world, "without a prepared draft")).toHaveLength(1);
    expect(world.rascunho()).toBeUndefined();

    // O limite é por turno: no turno seguinte, o mesmo erro volta a receber
    // o aviso (uma vez), sem herdar o aviso do turno anterior no input.
    await world.send({
      cliente: "Oi?",
      modelo: [
        { nota: "pergunta sem prepare de novo, no turno seguinte", decision: PERGUNTA_SEM_RASCUNHO },
        { nota: "insiste de novo depois do aviso", decision: PERGUNTA_SEM_RASCUNHO },
      ],
    });

    expect(world.model.calls).toHaveLength(4);
    expect(avisosNoInput(world, 2)).toEqual([]);
    expect(avisosNoInput(world, 3)).toHaveLength(1);
    expect(warnsCom(world, "without a prepared draft")).toHaveLength(2);
  });
});

async function prepararSegunda1330(world: ReturnType<typeof createEvalWorld>) {
  await world.send({
    cliente: "Quero a Aplicacao 5D segunda as 13:30",
    modelo: [
      {
        nota: "prepara o agendamento",
        toolCalls: [
          {
            id: "call-prepare",
            name: "create_appointment",
            args: {
              action: "prepare",
              serviceId: "service-1",
              date: "2026-06-08",
              startTime: "13:30",
              customerName: "Maria",
            },
          },
        ],
      },
      {
        nota: "pede a confirmacao",
        decision: {
          action: "update_appointment_draft",
          messages: ["Aplicacao 5D, segunda 08/06, das 13:30 as 14:30. Posso confirmar?"],
          conversationStage: "CONFIRMING_APPOINTMENT",
          classification: "potential_customer",
          confidence: 0.93,
        },
      },
    ],
  });
}

const CALL_TOOL_DESCRITO = {
  action: "call_tool",
  messages: [""],
  conversationStage: "CONFIRMING_APPOINTMENT",
  classification: "potential_customer",
  confidence: 0.9,
  notes: "falta chamar create_appointment action=confirm",
};

describe("call_tool descrito no JSON sem tool call: aviso para chamar de verdade (2026-10-11)", () => {
  // Evita: no "sim" a IA devolveu {"action":"call_tool","messages":[""]} sem
  // tool call; a cliente recebeu "Certo, vou te ajudar por aqui." e nada foi
  // confirmado.
  it("o dublê descreve a tool, recebe o aviso, chama create_appointment confirm e o horário é marcado", async () => {
    const world = createEvalWorld();
    await prepararSegunda1330(world);
    const antes = world.model.calls.length;

    const reply = await world.send({
      cliente: "sim",
      modelo: [
        {
          nota: "descreve a acao no JSON em vez de chamar a tool (erro de 2026-10-11)",
          decision: CALL_TOOL_DESCRITO,
        },
        {
          nota: "depois do aviso, confirma de verdade",
          toolCalls: [
            { id: "call-confirm", name: "create_appointment", args: { action: "confirm" } },
          ],
        },
        {
          nota: "responde com o resultado da tool",
          decision: {
            action: "create_appointment",
            messages: ["Prontinho, ficou agendado para segunda as 13:30."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.96,
          },
        },
      ],
    });

    expect(avisosNoInput(world, antes)).toEqual([]);
    expect(ultimaMensagem(world, antes + 1)).toContain(AVISO_INTERNO);
    expect(ultimaMensagem(world, antes + 1)).toContain("action=confirm");
    expect(world.agenda.effects.createAppointment).toMatchObject([
      { date: "2026-06-08", startTime: "13:30", serviceIds: ["service-1"] },
    ]);
    expect(reply.text).toBe("Prontinho, ficou agendado para segunda as 13:30.");
    expect(reply.text).not.toBe("Certo, vou te ajudar por aqui.");
    expect(warnsCom(world, "described a tool call")).toHaveLength(1);
  });

  it("o aviso sai no máximo uma vez por turno: se o dublê descreve de novo, não há terceira chamada", async () => {
    const world = createEvalWorld();
    await prepararSegunda1330(world);
    const antes = world.model.calls.length;

    await world.send({
      cliente: "sim",
      modelo: [
        { nota: "descreve a acao no JSON", decision: CALL_TOOL_DESCRITO },
        {
          nota: "ignora o aviso e descreve de novo; o turno termina aqui",
          decision: CALL_TOOL_DESCRITO,
        },
      ],
    });

    expect(world.model.calls).toHaveLength(antes + 2);
    expect(avisosNoInput(world, antes + 1)).toHaveLength(1);
    expect(warnsCom(world, "described a tool call")).toHaveLength(1);
    expect(world.agenda.effects.createAppointment).toEqual([]);
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
