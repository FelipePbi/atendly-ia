/**
 * Evals das políticas de condução da conversa (Goal011, critérios 3 e 10 do
 * aceite; escopo obrigatório 3 e 7).
 *
 * Formato de um caso: **transcrição fixa → roteiro do dublê → asserção sobre
 * o runtime**. O roteiro descreve o que o modelo tentou; a asserção olha o
 * que o runtime executou, recusou, calculou e persistiu — nunca o texto que
 * o dublê escolheu escrever, a não ser quando esse texto é checado contra
 * valores que o próprio runtime calculou.
 *
 * Nenhum caso fabrica resposta que contorne guard: quando o roteiro tenta o
 * caminho proibido (data relativa, disponibilidade sem serviço, confirmar no
 * mesmo turno), o que o eval prova é a recusa e a ausência de efeito.
 */
import { describe, expect, it } from "vitest";

import {
  CATALOGO_PADRAO,
  createEvalWorld,
  evalDoubleUsage,
  proibirRede,
} from "./harness.js";

proibirRede();

const DATA_ABSOLUTA = /^\d{4}-\d{2}-\d{2}$/;
const HORA_ABSOLUTA = /^\d{2}:\d{2}$/;

describe("condução da conversa: saudação, serviço e ambiguidade", () => {
  it("política: saudação genérica é acolhida sem oferecer serviço nem agenda", async () => {
    const world = createEvalWorld();

    const reply = await world.send({ cliente: "Oi", modelo: [] });

    // A saudação é decidida pelo runtime, sem modelo e sem tool: o eval prova
    // que nem o dublê nem a agenda foram tocados.
    expect(world.model.invoke).not.toHaveBeenCalled();
    expect(world.sequenciaDeTools()).toEqual([]);
    expect(world.agenda.reached).toEqual([]);
    expect(reply.text).toBe("Oii, tudo bem? Como posso te ajudar hoje?");
    expect(reply.text).not.toMatch(
      /servi[çc]o|agenda|hor[áa]rio|dispon[íi]vel|R\$/i,
    );
    expect(world.estado().appointmentDraft).toBeUndefined();
  });

  it("política: serviço não identificado não vira consulta genérica de agenda", async () => {
    const world = createEvalWorld();

    const reply = await world.send({
      cliente: "Queria marcar um horario ai",
      modelo: [
        {
          nota: "modelo tenta disponibilidade sem dizer de qual servico",
          toolCalls: [
            {
              id: "call-availability-sem-servico",
              name: "get_availability",
              args: { startDate: "2026-06-08" },
            },
          ],
        },
        {
          nota: "modelo volta para o catalogo real",
          toolCalls: [
            { id: "call-list-services", name: "list_services", args: {} },
          ],
        },
        {
          nota: "pergunta qual servico antes de qualquer agenda",
          decision: {
            action: "send_message",
            messages: [
              "Claro! Qual servico voce quer marcar: Aplicacao 5D ou Design de sobrancelha?",
            ],
            conversationStage: "SERVICE_DISCOVERY",
            classification: "potential_customer",
            confidence: 0.9,
          },
        },
      ],
    });

    expect(world.execucoes()).toMatchObject([
      {
        name: "get_availability",
        status: "FAILED",
        ok: false,
        code: "INVALID_TOOL_INPUT",
      },
      { name: "list_services", status: "SUCCEEDED", ok: true },
    ]);
    // A recusa não pode ter sido "bonita e inofensiva": a agenda não foi
    // consultada por disponibilidade nenhuma.
    expect(world.agenda.membros()).toEqual(["listActiveServices"]);
    expect(reply.text).toContain("?");
  });

  it("política: mais de um serviço possível vira pergunta, não escolha da IA", async () => {
    const world = createEvalWorld({
      services: [
        {
          id: "service-1",
          name: "Manicure simples",
          duration: 45,
          priceType: "FIXED",
          price: 60,
          colorId: 1,
          recurrenceIntervalDays: null,
        },
        {
          id: "service-2",
          name: "Manicure em gel",
          duration: 90,
          priceType: "FIXED",
          price: 140,
          colorId: 2,
          recurrenceIntervalDays: null,
        },
      ],
    });

    const reply = await world.send({
      cliente: "Queria fazer as unhas",
      modelo: [
        {
          nota: "catalogo real antes de supor qual servico",
          toolCalls: [
            { id: "call-list-services", name: "list_services", args: {} },
          ],
        },
        {
          nota: "dois servicos possiveis: pergunta, nao escolhe",
          decision: {
            action: "send_message",
            messages: [
              "Voce prefere Manicure simples ou Manicure em gel? Assim eu vejo o horario certinho.",
            ],
            conversationStage: "SERVICE_DISCOVERY",
            classification: "potential_customer",
            confidence: 0.88,
          },
        },
      ],
    });

    // O que o modelo viu: dois candidatos, nenhum desempate possível sozinho.
    const catalogo = world.model.resultadosDeTool(1)[0].parsed as {
      data: { services: Array<{ name: string }> };
    };
    expect(catalogo.data.services.map((service) => service.name)).toEqual([
      "Manicure simples",
      "Manicure em gel",
    ]);

    expect(world.sequenciaDeTools()).toEqual(["list_services"]);
    expect(world.agenda.efeitosComConsequencia()).toEqual([]);
    expect(world.rascunho()).toBeUndefined();
    expect(reply.text).toContain("Manicure simples");
    expect(reply.text).toContain("Manicure em gel");
    expect(reply.text).toContain("?");
  });
});

describe("data vaga resolvida antes de qualquer tool", () => {
  it("política: referência vaga não chega às tools; só data e horário absolutos chegam", async () => {
    const world = createEvalWorld();

    await world.send({
      cliente: "Quero fazer a Aplicacao 5D amanha de manha",
      modelo: [
        {
          nota: "modelo tenta preparar com referencia vaga",
          toolCalls: [
            {
              id: "call-prepare-vago",
              name: "create_appointment",
              args: {
                action: "prepare",
                serviceId: "service-1",
                date: "amanha",
                startTime: "de manha",
                customerName: "Maria",
              },
            },
          ],
        },
        {
          nota: "resolve a data antes de propor: consulta com data absoluta",
          toolCalls: [
            {
              id: "call-availability",
              name: "get_availability",
              args: { serviceId: "service-1", startDate: "2026-06-08" },
            },
          ],
        },
        {
          nota: "propoe o horario real encontrado",
          decision: {
            action: "send_message",
            messages: [
              "Amanha e segunda, 08/06. Tenho as 13:30 livre, pode ser?",
            ],
            conversationStage: "WAITING_CLIENT_SLOT_CHOICE",
            classification: "potential_customer",
            confidence: 0.9,
          },
        },
      ],
    });

    expect(world.execucoes()).toMatchObject([
      {
        name: "create_appointment",
        status: "FAILED",
        ok: false,
        code: "INVALID_TOOL_INPUT",
      },
      { name: "get_availability", status: "SUCCEEDED", ok: true },
    ]);
    // O rascunho não nasceu da tentativa vaga.
    expect(world.rascunho()).toBeUndefined();

    await world.send({
      cliente: "Pode ser 13:30 sim",
      modelo: [
        {
          nota: "prepara com data e horario absolutos",
          toolCalls: [
            {
              id: "call-prepare-absoluto",
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
          nota: "enuncia o resumo e espera o sim",
          decision: {
            action: "update_appointment_draft",
            messages: [
              "Fechou: Aplicacao 5D, segunda 08/06, das 13:30 as 14:30. Posso confirmar?",
            ],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            confidence: 0.94,
          },
        },
      ],
    });

    expect(world.rascunho()).toMatchObject({
      date: "2026-06-08",
      startTime: "13:30",
      endTime: "14:30",
    });

    // Nada do que alcançou a agenda carrega referência relativa: toda data e
    // todo horário que atravessaram a fronteira são absolutos.
    const camposDeTempo = world.agenda.reached.flatMap((reach) =>
      Object.entries((reach.payload ?? {}) as Record<string, unknown>).map(
        ([campo, valor]) => ({ member: reach.member, campo, valor }),
      ),
    );
    for (const { member, campo, valor } of camposDeTempo) {
      if (/date/i.test(campo) && typeof valor === "string") {
        expect(valor, `${member}.${campo}`).toMatch(DATA_ABSOLUTA);
      }
      if (/time/i.test(campo) && typeof valor === "string") {
        expect(valor, `${member}.${campo}`).toMatch(HORA_ABSOLUTA);
      }
    }
    // Sem esta contagem, o laço acima passaria por vazio.
    expect(
      camposDeTempo.filter(({ campo }) => /date|time/i.test(campo)).length,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("confirmação explícita e rascunho que sobrevive à conversa", () => {
  it("política: o efeito só acontece depois de a cliente ter um turno para dizer sim", async () => {
    const world = createEvalWorld();

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
          nota: "tenta confirmar na mesma mensagem, sem a cliente ter respondido",
          toolCalls: [
            {
              id: "call-confirm-mesmo-turno",
              name: "create_appointment",
              args: { action: "confirm" },
            },
          ],
        },
        {
          nota: "pergunta e espera",
          decision: {
            action: "update_appointment_draft",
            messages: [
              "Aplicacao 5D, segunda 08/06, das 13:30 as 14:30. Posso confirmar?",
            ],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            confidence: 0.93,
          },
        },
      ],
    });

    expect(world.execucoes()).toMatchObject([
      { name: "create_appointment", status: "SUCCEEDED", ok: true },
      {
        name: "create_appointment",
        status: "FAILED",
        ok: false,
        code: "CONFIRMATION_REQUIRED_SAME_TURN",
      },
    ]);
    // Recusar e criar assim mesmo passaria numa asserção que olhasse só o
    // código de erro.
    expect(world.agenda.effects.createAppointment).toEqual([]);

    const reply = await world.send({
      cliente: "Pode confirmar sim",
      modelo: [
        {
          nota: "confirma no turno seguinte, com o sim da cliente",
          toolCalls: [
            {
              id: "call-confirm-turno-seguinte",
              name: "create_appointment",
              args: { action: "confirm" },
            },
          ],
        },
        {
          nota: "so avisa depois do sucesso da tool",
          decision: {
            action: "create_appointment",
            messages: ["Confirmado! Te espero segunda as 13:30."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.97,
          },
        },
      ],
    });

    expect(world.agenda.effects.createAppointment).toMatchObject([
      { date: "2026-06-08", startTime: "13:30", serviceIds: ["service-1"] },
    ]);
    expect(world.rascunho()).toBeUndefined();
    expect(reply.text).toContain("Confirmado");
  });

  it("política: pergunta secundária não apaga o rascunho em aberto", async () => {
    const world = createEvalWorld();

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
            messages: ["Posso confirmar Aplicacao 5D segunda as 13:30?"],
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

    // Cópia profunda: comparar a mesma referência passaria mesmo se o turno
    // seguinte tivesse mutado o rascunho.
    const rascunhoAntes = structuredClone(world.rascunho());
    expect(rascunhoAntes).toMatchObject({
      date: "2026-06-08",
      startTime: "13:30",
      holdId: "hold-1",
    });

    // Mudança de assunto no meio da confirmação.
    await world.send({
      cliente: "Ah, antes: voces ficam em qual endereco?",
      modelo: [
        {
          nota: "responde a pergunta secundaria sem mexer no rascunho",
          decision: {
            action: "send_message",
            messages: [
              "Ficamos na Rua das Acacias, 120. E ai, posso confirmar segunda as 13:30?",
            ],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            confidence: 0.9,
          },
        },
      ],
    });

    expect(world.rascunho()).toEqual(rascunhoAntes);
    expect(world.estado().appointmentDraft).toMatchObject({
      status: "waiting_confirmation",
      selectedStartDateTime: "2026-06-08T13:30:00-03:00",
    });

    // Prova de que o rascunho continuou utilizável, não só presente no JSON.
    await world.send({
      cliente: "Perfeito, pode confirmar",
      modelo: [
        {
          nota: "confirma o mesmo rascunho de antes da pergunta secundaria",
          toolCalls: [
            {
              id: "call-confirm",
              name: "create_appointment",
              args: { action: "confirm" },
            },
          ],
        },
        {
          nota: "avisa depois do sucesso",
          decision: {
            action: "create_appointment",
            messages: ["Confirmado!"],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.96,
          },
        },
      ],
    });

    expect(world.agenda.effects.createAppointment).toMatchObject([
      { date: "2026-06-08", startTime: "13:30" },
    ]);
  });

  it("política: o resumo de confirmação traz serviços, data, início, fim e total", async () => {
    const world = createEvalWorld();

    const reply = await world.send({
      cliente: "Quero cilios e sobrancelha segunda as 13:30",
      modelo: [
        {
          nota: "catalogo real",
          toolCalls: [
            {
              id: "call-list-services",
              name: "list_services",
              args: { includePrices: true },
            },
          ],
        },
        {
          nota: "prepara os dois servicos em bloco continuo",
          toolCalls: [
            {
              id: "call-prepare-dois",
              name: "create_appointment",
              args: {
                action: "prepare",
                serviceIds: ["service-1", "service-2"],
                date: "2026-06-08",
                startTime: "13:30",
                customerName: "Maria",
              },
            },
          ],
        },
        {
          nota: "enuncia o resumo completo antes do sim",
          decision: {
            action: "update_appointment_draft",
            messages: [
              "Aplicacao 5D + Design de sobrancelha em 08/06, das 13:30 as 15:00, total R$ 230,00. Posso confirmar?",
            ],
            appointmentDraftPatch: {
              services: [
                {
                  serviceId: 1,
                  name: "Aplicacao 5D",
                  durationMinutes: 60,
                  price: 190,
                },
                {
                  serviceId: 2,
                  name: "Design de sobrancelha",
                  durationMinutes: 30,
                  price: 40,
                },
              ],
              selectedStartDateTime: "2026-06-08T13:30:00-03:00",
              status: "waiting_confirmation",
            },
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            confidence: 0.95,
          },
        },
      ],
    });

    // Os cinco campos do resumo saem do rascunho que o runtime calculou a
    // partir do catálogo real — não de constantes do teste.
    const rascunho = world.rascunho() as {
      services: Array<{ name: string }>;
      date: string;
      startTime: string;
      endTime: string;
      totalPrice: number;
      totalDurationMinutes: number;
    };
    expect(rascunho.services.map((service) => service.name)).toEqual(
      CATALOGO_PADRAO.map((service) => service.name),
    );
    expect(rascunho).toMatchObject({
      date: "2026-06-08",
      startTime: "13:30",
      endTime: "15:00",
      totalDurationMinutes: 90,
      totalPrice: 230,
    });

    const [, mes, dia] = rascunho.date.split("-");
    const texto = reply.text;
    for (const service of rascunho.services) {
      expect(texto).toContain(service.name);
    }
    expect(texto).toContain(`${dia}/${mes}`);
    expect(texto).toContain(rascunho.startTime);
    expect(texto).toContain(rascunho.endTime);
    expect(texto).toContain(`R$ ${rascunho.totalPrice},00`);

    // O fim do bloco também é derivado pelo runtime no rascunho da conversa.
    expect(world.estado().appointmentDraft).toMatchObject({
      totalDurationMinutes: 90,
      totalPrice: 230,
      selectedEndDateTime: "2026-06-08T18:00:00.000Z",
    });
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
