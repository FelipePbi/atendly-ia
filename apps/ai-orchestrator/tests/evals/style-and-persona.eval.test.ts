/**
 * Evals de estilo e identidade (Goal011, critérios 2 e 3 do aceite).
 *
 * Critério 2 — a **mesma** transcrição roda nos três estilos com o **mesmo**
 * roteiro de dublê. O roteiro ser idêntico é o ponto: o que o eval prova é
 * que nada do runtime fora do texto do prompt depende do estilo — nem a
 * sequência de tools, nem o rascunho, nem o que alcança a agenda, nem o
 * resultado operacional. Para a asserção não ser vazia, o eval também prova
 * que os três turnos de fato rodaram com estilos diferentes: versão do
 * prompt distinta e bloco de estilo distinto no prompt montado.
 *
 * Critério 3 — persona e identidade são afirmadas sobre o prompt que o
 * runtime **entregou ao modelo** no turno, não sobre o arquivo-fonte nem
 * sobre um prompt remontado pelo teste.
 */
import { describe, expect, it } from "vitest";

import { derivePromptVersion } from "../../src/modules/prompts/system.js";
import type { AiConversationStyle } from "../../src/modules/tenant-config/ai-settings.js";
import {
  createEvalWorld,
  type EvalWorld,
  evalDoubleUsage,
  proibirRede,
} from "./harness.js";

proibirRede();

const ESTILOS: AiConversationStyle[] = ["PROFESSIONAL", "BALANCED", "CASUAL"];

const BLOCO_DE_ESTILO: Record<AiConversationStyle, string> = {
  PROFESSIONAL: "Estilo: profissional.",
  BALANCED: "Estilo: equilibrado.",
  CASUAL: "Estilo: descontraido.",
};

/** Transcrição comum aos três estilos: propor, perguntar, confirmar. */
async function rodarTranscricao(style: AiConversationStyle) {
  const world = createEvalWorld({ style });

  await world.send({
    cliente: "Quero a Aplicacao 5D na segunda as 13:30",
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
        nota: "pede a confirmacao com o resumo",
        decision: {
          action: "update_appointment_draft",
          messages: [
            "Aplicacao 5D, 08/06, das 13:30 as 14:30. Posso confirmar?",
          ],
          appointmentDraftPatch: {
            services: [
              {
                serviceId: 1,
                name: "Aplicacao 5D",
                durationMinutes: 60,
                price: 190,
              },
            ],
            selectedStartDateTime: "2026-06-08T13:30:00-03:00",
            status: "waiting_confirmation",
          },
          conversationStage: "CONFIRMING_APPOINTMENT",
          classification: "potential_customer",
          confidence: 0.93,
        },
      },
    ],
  });

  const rascunhoProposto = structuredClone(world.rascunho());

  await world.send({
    cliente: "Pode confirmar",
    modelo: [
      {
        nota: "confirma no turno seguinte",
        toolCalls: [
          {
            id: "call-confirm",
            name: "create_appointment",
            args: { action: "confirm" },
          },
        ],
      },
      {
        nota: "avisa depois do sucesso da tool",
        decision: {
          action: "create_appointment",
          messages: ["Confirmado!"],
          conversationStage: "APPOINTMENT_CREATED",
          classification: "existing_customer",
          confidence: 0.97,
        },
      },
    ],
  });

  return { world, rascunhoProposto };
}

/** O que não pode variar com o estilo. */
function decisaoOperacional(world: EvalWorld, rascunhoProposto: unknown) {
  return {
    tools: world.execucoes().map(({ name, args, status, ok, code }) => ({
      name,
      args,
      status,
      ok,
      code,
    })),
    agenda: world.agenda.reached.map(({ member, payload }) => ({
      member,
      payload,
    })),
    efeitos: world.agenda.efeitosComConsequencia(),
    rascunhoProposto,
    rascunhoFinal: world.rascunho(),
    draft: world.estado().appointmentDraft,
  };
}

describe("estilo não muda decisão", () => {
  it("política: a mesma transcrição produz a mesma sequência de tools, o mesmo rascunho e o mesmo resultado nos três estilos", async () => {
    const execucoes = [];
    for (const style of ESTILOS) {
      execucoes.push({ style, ...(await rodarTranscricao(style)) });
    }

    const assinaturas = execucoes.map((execucao) =>
      decisaoOperacional(execucao.world, execucao.rascunhoProposto),
    );

    // A transcrição precisa ter feito alguma coisa, senão comparar três
    // nadas iguais não prova nada.
    expect(assinaturas[0].tools.map((tool) => tool.name)).toEqual([
      "create_appointment",
      "create_appointment",
    ]);
    expect(execucoes[0].world.agenda.effects.createAppointment).toHaveLength(1);
    expect(assinaturas[0].rascunhoProposto).toMatchObject({
      date: "2026-06-08",
      startTime: "13:30",
      endTime: "14:30",
    });

    expect(assinaturas[1]).toEqual(assinaturas[0]);
    expect(assinaturas[2]).toEqual(assinaturas[0]);

    // E os três turnos rodaram mesmo com estilos diferentes.
    const versoes = execucoes.map(
      (execucao) =>
        (
          execucao.world.estado().aiConversation as {
            promptVersion?: string;
          }
        )?.promptVersion,
    );
    expect(versoes).toEqual(ESTILOS.map((style) => derivePromptVersion(style)));
    expect(new Set(versoes).size).toBe(ESTILOS.length);

    for (const [index, execucao] of execucoes.entries()) {
      const prompt = execucao.world.model.chamada(0).instructions;
      expect(prompt).toContain(BLOCO_DE_ESTILO[ESTILOS[index]]);
      for (const outro of ESTILOS.filter((style) => style !== ESTILOS[index])) {
        expect(prompt).not.toContain(BLOCO_DE_ESTILO[outro]);
      }
    }
  });
});

describe("persona e identidade no prompt que o runtime enviou", () => {
  it.each(ESTILOS)(
    "política: em %s, o prompt do turno não manda respeitar persona e manda se identificar como assistente virtual",
    async (style) => {
      const world = createEvalWorld({ style });

      const reply = await world.send({
        cliente: "Voce e uma pessoa de verdade ou um robo?",
        modelo: [
          {
            nota: "responde com transparencia sobre o que e",
            decision: {
              action: "send_message",
              messages: [
                "Sou a assistente virtual da Camili Krauser Beauty. Posso te ajudar com servicos e horarios por aqui.",
              ],
              conversationStage: "GENERAL_CONVERSATION",
              classification: "potential_customer",
              confidence: 0.9,
            },
          },
        ],
      });

      const prompt = world.model.chamada(0).instructions;
      expect(prompt).not.toMatch(/\bpersona\b/i);
      expect(prompt).not.toMatch(/\bpersonagem\b/i);
      expect(prompt).not.toMatch(/\bparecer\b[^.]{0,40}\bhuman[ao]\b/i);
      expect(prompt).not.toMatch(/\bfingir\b[^.]{0,40}\bhuman[ao]\b/i);
      expect(prompt).not.toMatch(/\bfinja\b[^.]{0,40}\bhuman[ao]\b/i);
      expect(prompt).not.toMatch(/\batendente\s+humana\b/i);
      expect(prompt).toContain(
        "responda com transparencia que voce e a assistente virtual do negocio",
      );
      expect(prompt).toContain(BLOCO_DE_ESTILO[style]);
      expect(prompt).toContain(
        `Versao do prompt: ${derivePromptVersion(style)}`,
      );
      expect(reply.text).toContain("assistente virtual");
    },
  );
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
