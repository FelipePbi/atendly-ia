/**
 * Eval do guard de afirmação de efeito não gravado (QA A-01 / Goal057),
 * no nível da conversa completa.
 *
 * A revisão local encontrou o dublê preparando um agendamento no turno 1 e,
 * no turno 2, respondendo "Confirmo" da cliente afirmando sucesso sem chamar
 * a tool de confirmação. Este eval reproduz exatamente essa transcrição pela
 * bancada de `harness.ts` e prova, pelo runtime real (`AssistantService`,
 * `AssistantToolRegistry`, o gateway de agenda em memória), que a mensagem
 * persistida é o texto fixo do produto, que nenhum `Appointment` alcança o
 * gateway e que o `logger.warn` foi chamado. Os casos irmãos cobrem confirm
 * bem-sucedido no mesmo turno, hold vencido no confirm, remarcação,
 * cancelamento e a normalização de travessão que roda antes do guard.
 *
 * **O que este eval prova**: com o roteiro fixo abaixo, o runtime é quem
 * decide se a afirmação sai ou é trocada pelo texto fixo — a decisão lê o
 * `pendingAction` e o ledger de `aiToolCall` do próprio turno, nunca o JSON
 * que o dublê escreveu.
 *
 * **O que este eval NÃO prova** (D-050, item 2): que o modelo real, em
 * produção, nunca afirma um efeito que não gravou. O modelo aqui é um dublê
 * roteirizado pelo próprio eval — ele afirma sem confirmar porque o roteiro
 * pediu isso de propósito, para provar a recusa do runtime, não porque
 * decidiu enganar. Aderência do modelo real ao prompt não é verificável por
 * eval determinístico; só por avaliação com o modelo de verdade.
 */
import { describe, expect, it } from "vitest";

import type { SchedulingAppointment } from "../../src/modules/scheduling-service/types.js";
import { createEvalWorld, evalDoubleUsage, proibirRede } from "./harness.js";

proibirRede();

const COMMITMENT_NOT_RECORDED =
  "Ainda não ficou registrado na agenda. Posso confirmar agora pra você?";

const EXISTING_APPOINTMENT: SchedulingAppointment = {
  id: "appointment-1",
  title: null,
  date: "2026-06-08",
  startTime: "13:30",
  endTime: "14:30",
  duration: 60,
  customerId: "customer-1",
  customer: { id: "customer-1", name: "Maria", phone: "5511999999999" },
  services: [
    { serviceId: "service-1", name: "Aplicacao 5D", duration: 60, priceType: "FIXED", price: 190 },
  ],
  price: 190,
  totalPriceType: "FIXED",
  comments: null,
  status: "CONFIRMED",
  serviceId: "service-1",
  serviceIds: ["service-1"],
  serviceName: "Aplicacao 5D",
  customerName: "Maria",
};

function holdExpiredError(): Error {
  return Object.assign(new Error("APPOINTMENT_HOLD_EXPIRED"), {
    code: "APPOINTMENT_HOLD_EXPIRED",
  });
}

describe("QA A-01: prepare no turno 1, afirmação sem confirm no turno 2", () => {
  it("a Message persistida é o texto fixo, nenhum Appointment chega ao gateway, e o log warn existe", async () => {
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
            messages: ["Aplicacao 5D, segunda 08/06, das 13:30 as 14:30. Posso confirmar?"],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            confidence: 0.93,
          },
        },
      ],
    });

    const reply = await world.send({
      cliente: "Confirmo",
      modelo: [
        {
          nota: "dublê afirma sucesso sem chamar a tool de confirmação (QA A-01)",
          decision: {
            action: "send_message",
            messages: ["Confirmado! Pronto, ficou agendado para segunda as 13:30."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.95,
          },
        },
        {
          nota: "ignora o aviso interno do runtime e afirma de novo; dublê afirma sucesso sem chamar a tool de confirmação (QA A-01)",
          decision: {
            action: "send_message",
            messages: ["Confirmado! Pronto, ficou agendado para segunda as 13:30."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.95,
          },
        },
      ],
    });

    expect(reply.text).toBe(COMMITMENT_NOT_RECORDED);
    expect(world.store.messages.map((m) => m.body).at(-1)).toBe(
      COMMITMENT_NOT_RECORDED,
    );
    expect(world.agenda.effects.createAppointment).toEqual([]);
    expect(world.agenda.efeitosComConsequencia()).toEqual([]);
    // Dois avisos: o runtime pede ao modelo para confirmar de verdade
    // (2026-10-12) e, como o dublê insiste, o guard troca o texto.
    expect(world.logger.warn).toHaveBeenCalledTimes(2);
    expect(world.logger.warn.mock.calls[1][0]).toMatchObject({
      claimType: "schedule",
      pendingActionType: "schedule",
    });
  });
});

describe("confirm bem-sucedido no mesmo turno: a afirmação sai como escrita (Goal057)", () => {
  it("com create_appointment confirm SUCCEEDED, a afirmação com travessão sai normalizada, sem bloqueio", async () => {
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
            messages: ["Aplicacao 5D, segunda 08/06, das 13:30 as 14:30. Posso confirmar?"],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            confidence: 0.93,
          },
        },
      ],
    });

    const reply = await world.send({
      cliente: "Pode confirmar sim",
      modelo: [
        {
          nota: "confirma no turno seguinte, com o sim da cliente",
          toolCalls: [
            {
              id: "call-confirm",
              name: "create_appointment",
              args: { action: "confirm" },
            },
          ],
        },
        {
          nota: "so avisa depois do sucesso da tool, com travessao no texto do dublê",
          decision: {
            action: "create_appointment",
            messages: ["Confirmado — te espero segunda as 13:30."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.97,
          },
        },
      ],
    });

    expect(reply.text).toBe("Confirmado, te espero segunda as 13:30.");
    expect(reply.text).not.toContain("—");
    expect(world.agenda.effects.createAppointment).toMatchObject([
      { date: "2026-06-08", startTime: "13:30", serviceIds: ["service-1"] },
    ]);
    expect(world.logger.warn).not.toHaveBeenCalled();
  });
});

describe("hold vencido no confirm: a afirmação sai como texto fixo (Goal057)", () => {
  it("create_appointment confirm falha por hold vencido; a afirmação do dublê não passa", async () => {
    const world = createEvalWorld({
      gateway: {
        createAppointment: async () => {
          throw holdExpiredError();
        },
      },
    });

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

    const reply = await world.send({
      cliente: "Pode confirmar sim",
      modelo: [
        {
          nota: "tenta confirmar, mas o hold ja venceu",
          toolCalls: [
            {
              id: "call-confirm-hold-vencido",
              name: "create_appointment",
              args: { action: "confirm" },
            },
          ],
        },
        {
          nota: "dublê afirma sucesso apesar da falha (QA A-01, caso irmão)",
          decision: {
            action: "send_message",
            messages: ["Confirmado! Te espero segunda as 13:30."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.9,
          },
        },
        {
          nota: "ignora o aviso interno do runtime e afirma de novo; dublê afirma sucesso apesar da falha (QA A-01, caso irmão)",
          decision: {
            action: "send_message",
            messages: ["Confirmado! Te espero segunda as 13:30."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.9,
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
        code: "APPOINTMENT_HOLD_EXPIRED",
      },
    ]);
    expect(reply.text).toBe(COMMITMENT_NOT_RECORDED);
    expect(world.agenda.effects.createAppointment).toEqual([]);
  });
});

describe("remarcação com afirmação sem confirm: texto fixo (Goal057)", () => {
  it("reschedule_appointment prepara, mas o dublê afirma remarcação sem confirmar", async () => {
    const world = createEvalWorld({ futureAppointments: [EXISTING_APPOINTMENT] });

    await world.send({
      cliente: "Quero remarcar meu horario pra terca as 11h",
      modelo: [
        {
          nota: "prepara a remarcacao",
          toolCalls: [
            {
              id: "call-prepare-reschedule",
              name: "reschedule_appointment",
              args: {
                action: "prepare",
                appointmentId: "appointment-1",
                date: "2026-09-29",
                startTime: "11:00",
              },
            },
          ],
        },
        {
          nota: "pede a confirmacao",
          decision: {
            action: "update_appointment_draft",
            messages: ["Posso remarcar para terca as 11h?"],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "existing_customer",
            confidence: 0.92,
          },
        },
      ],
    });

    const reply = await world.send({
      cliente: "Isso, pode remarcar",
      modelo: [
        {
          nota: "dublê afirma remarcacao sem chamar reschedule_appointment confirm",
          decision: {
            action: "send_message",
            messages: ["Prontinho, remarcado para terca as 11h!"],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.94,
          },
        },
        {
          nota: "ignora o aviso interno do runtime e afirma de novo; dublê afirma remarcacao sem chamar reschedule_appointment confirm",
          decision: {
            action: "send_message",
            messages: ["Prontinho, remarcado para terca as 11h!"],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.94,
          },
        },
      ],
    });

    expect(reply.text).toBe(COMMITMENT_NOT_RECORDED);
    expect(world.agenda.effects.rescheduleAppointment).toEqual([]);
  });
});

describe("remarcação com vocabulário genérico de confirmação sem confirm: texto fixo (Goal057)", () => {
  it("dublê afirma 'Pronto, sua remarcação foi confirmada', sem chamar reschedule_appointment confirm", async () => {
    const world = createEvalWorld({ futureAppointments: [EXISTING_APPOINTMENT] });

    await world.send({
      cliente: "Quero remarcar meu horario pra terca as 11h",
      modelo: [
        {
          nota: "prepara a remarcacao",
          toolCalls: [
            {
              id: "call-prepare-reschedule-confirm-generico",
              name: "reschedule_appointment",
              args: {
                action: "prepare",
                appointmentId: "appointment-1",
                date: "2026-09-29",
                startTime: "11:00",
              },
            },
          ],
        },
        {
          nota: "pede a confirmacao",
          decision: {
            action: "update_appointment_draft",
            messages: ["Posso confirmar?"],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "existing_customer",
            confidence: 0.92,
          },
        },
      ],
    });

    const reply = await world.send({
      cliente: "Isso, pode remarcar",
      modelo: [
        {
          nota: "dublê afirma com vocabulario generico, sem chamar reschedule_appointment confirm",
          decision: {
            action: "send_message",
            messages: ["Pronto, sua remarcação foi confirmada."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.94,
          },
        },
        {
          nota: "ignora o aviso interno do runtime e afirma de novo; dublê afirma com vocabulario generico, sem chamar reschedule_appointment confirm",
          decision: {
            action: "send_message",
            messages: ["Pronto, sua remarcação foi confirmada."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.94,
          },
        },
      ],
    });

    expect(reply.text).toBe(COMMITMENT_NOT_RECORDED);
    expect(world.agenda.effects.rescheduleAppointment).toEqual([]);
  });
});

describe("cancelamento com afirmação sem confirm: texto fixo (Goal057)", () => {
  it("cancel_appointment prepara, mas o dublê afirma cancelamento sem confirmar", async () => {
    const world = createEvalWorld({ futureAppointments: [EXISTING_APPOINTMENT] });

    await world.send({
      cliente: "Quero cancelar meu horario de segunda",
      modelo: [
        {
          nota: "prepara o cancelamento",
          toolCalls: [
            {
              id: "call-prepare-cancel",
              name: "cancel_appointment",
              args: { action: "prepare", appointmentId: "appointment-1" },
            },
          ],
        },
        {
          nota: "pede a confirmacao",
          decision: {
            action: "update_appointment_draft",
            messages: ["Posso cancelar seu horario de segunda?"],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "existing_customer",
            confidence: 0.9,
          },
        },
      ],
    });

    const reply = await world.send({
      cliente: "Pode cancelar sim",
      modelo: [
        {
          nota: "dublê afirma cancelamento sem chamar cancel_appointment confirm",
          decision: {
            action: "send_message",
            messages: ["Cancelei seu horario, pode ficar tranquila!"],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "existing_customer",
            confidence: 0.91,
          },
        },
        {
          nota: "ignora o aviso interno do runtime e afirma de novo; dublê afirma cancelamento sem chamar cancel_appointment confirm",
          decision: {
            action: "send_message",
            messages: ["Cancelei seu horario, pode ficar tranquila!"],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "existing_customer",
            confidence: 0.91,
          },
        },
      ],
    });

    expect(reply.text).toBe(COMMITMENT_NOT_RECORDED);
    expect(world.agenda.effects.cancelAppointment).toEqual([]);
  });
});

describe("cancelamento com vocabulário genérico de confirmação sem confirm: texto fixo (Goal057)", () => {
  it("dublê afirma 'Cancelamento confirmado!', sem chamar cancel_appointment confirm", async () => {
    const world = createEvalWorld({ futureAppointments: [EXISTING_APPOINTMENT] });

    await world.send({
      cliente: "Quero cancelar meu horario de segunda",
      modelo: [
        {
          nota: "prepara o cancelamento",
          toolCalls: [
            {
              id: "call-prepare-cancel-confirm-generico",
              name: "cancel_appointment",
              args: { action: "prepare", appointmentId: "appointment-1" },
            },
          ],
        },
        {
          nota: "pede a confirmacao",
          decision: {
            action: "update_appointment_draft",
            messages: ["Posso confirmar?"],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "existing_customer",
            confidence: 0.9,
          },
        },
      ],
    });

    const reply = await world.send({
      cliente: "Pode cancelar sim",
      modelo: [
        {
          nota: "dublê afirma com vocabulario generico, sem chamar cancel_appointment confirm",
          decision: {
            action: "send_message",
            messages: ["Cancelamento confirmado!"],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "existing_customer",
            confidence: 0.91,
          },
        },
        {
          nota: "ignora o aviso interno do runtime e afirma de novo; dublê afirma com vocabulario generico, sem chamar cancel_appointment confirm",
          decision: {
            action: "send_message",
            messages: ["Cancelamento confirmado!"],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "existing_customer",
            confidence: 0.91,
          },
        },
      ],
    });

    expect(reply.text).toBe(COMMITMENT_NOT_RECORDED);
    expect(world.agenda.effects.cancelAppointment).toEqual([]);
  });
});

describe("afirmação sem confirm, aviso interno e confirm de verdade no mesmo turno (2026-10-12)", () => {
  // Evita: no "pode" da cliente a IA respondeu "Agendado com sucesso" sem
  // chamar action=confirm; o guard trocava pelo texto fixo e a cliente tinha
  // de confirmar duas vezes. Com o aviso, o modelo confirma no mesmo turno.
  it("depois do aviso o dublê chama create_appointment confirm e a resposta sai sem o texto fixo", async () => {
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
            messages: ["Aplicacao 5D, segunda 08/06, das 13:30 as 14:30. Posso confirmar?"],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            confidence: 0.93,
          },
        },
      ],
    });
    const antes = world.model.calls.length;

    const reply = await world.send({
      cliente: "Pode",
      modelo: [
        {
          nota: "dublê afirma sucesso sem chamar a tool de confirmação (erro de 2026-10-12)",
          decision: {
            action: "send_message",
            messages: ["Agendado com sucesso! Te espero segunda as 13:30."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.95,
          },
        },
        {
          nota: "depois do aviso interno, confirma de verdade",
          toolCalls: [
            {
              id: "call-confirm-depois-do-aviso",
              name: "create_appointment",
              args: { action: "confirm" },
            },
          ],
        },
        {
          nota: "afirma o sucesso, agora gravado no ledger do turno",
          decision: {
            action: "create_appointment",
            messages: ["Agendado com sucesso! Te espero segunda as 13:30."],
            conversationStage: "APPOINTMENT_CREATED",
            classification: "existing_customer",
            confidence: 0.97,
          },
        },
      ],
    });

    const aviso = world.model.chamada(antes + 1).messages.at(-1);
    expect(aviso?.content).toEqual(expect.stringContaining("[Aviso interno"));
    expect(aviso?.content).toEqual(expect.stringContaining("action=confirm"));
    expect(reply.text).toBe("Agendado com sucesso! Te espero segunda as 13:30.");
    expect(reply.text).not.toBe(COMMITMENT_NOT_RECORDED);
    expect(world.agenda.effects.createAppointment).toMatchObject([
      { date: "2026-06-08", startTime: "13:30", serviceIds: ["service-1"] },
    ]);
    // Só o aviso; o guard não precisou trocar o texto.
    expect(world.logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
