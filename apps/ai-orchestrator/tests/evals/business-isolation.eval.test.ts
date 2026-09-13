/**
 * Evals de isolamento entre negócios (Goal011, critério 11 do aceite, parte
 * de conversa).
 *
 * Dois negócios com catálogo, estilo, telefone e contexto diferentes rodam a
 * mesma bancada. O eval prova três coisas que o runtime tem de garantir
 * sozinho:
 *
 * 1. Todo alcance ao Scheduling carrega o tenant do turno — nunca o do outro
 *    negócio.
 * 2. O prompt do turno descreve o negócio do turno: nome e estilo de um não
 *    aparecem no outro.
 * 3. Um `serviceId` do outro negócio não resolve: falha de domínio com código
 *    próprio, sem hold e sem agendamento.
 */
import { describe, expect, it } from "vitest";

import { createEvalWorld, evalDoubleUsage, proibirRede } from "./harness.js";

proibirRede();

function negocioA() {
  return createEvalWorld({
    tenantId: "tenant-a",
    channelId: "channel-a",
    conversationId: "conversation-a",
    phone: "5511900000001",
    customerName: "Maria",
    businessName: "Camili Krauser Beauty",
    style: "CASUAL",
    services: [
      {
        id: "service-a",
        name: "Aplicacao 5D",
        duration: 60,
        priceType: "FIXED",
        price: 190,
        colorId: 1,
        recurrenceIntervalDays: null,
      },
    ],
  });
}

function negocioB() {
  return createEvalWorld({
    tenantId: "tenant-b",
    channelId: "channel-b",
    conversationId: "conversation-b",
    phone: "5511900000002",
    customerName: "Helena",
    businessName: "Studio Helena",
    style: "PROFESSIONAL",
    services: [
      {
        id: "service-b",
        name: "Massagem relaxante",
        duration: 50,
        priceType: "FIXED",
        price: 150,
        colorId: 3,
        recurrenceIntervalDays: 21,
      },
    ],
  });
}

describe("um negócio não enxerga nem afeta o outro", () => {
  it("política: catálogo, tenant e estilo de um negócio não vazam para o outro", async () => {
    const a = negocioA();
    const b = negocioB();

    await a.send({
      cliente: "Quero a Aplicacao 5D na segunda as 13:30",
      modelo: [
        {
          nota: "catalogo do negocio A",
          toolCalls: [{ id: "call-list-a", name: "list_services", args: {} }],
        },
        {
          nota: "prepara com o servico do negocio A",
          toolCalls: [
            {
              id: "call-prepare-a",
              name: "create_appointment",
              args: {
                action: "prepare",
                serviceId: "service-a",
                date: "2026-06-08",
                startTime: "13:30",
                customerName: "Maria",
              },
            },
          ],
        },
        {
          nota: "pede confirmacao",
          decision: {
            action: "update_appointment_draft",
            messages: ["Aplicacao 5D, 08/06 as 13:30. Posso confirmar? 😊"],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            confidence: 0.93,
          },
        },
      ],
    });

    await b.send({
      cliente: "Queria a Massagem relaxante na segunda as 10:00",
      modelo: [
        {
          nota: "catalogo do negocio B",
          toolCalls: [{ id: "call-list-b", name: "list_services", args: {} }],
        },
        {
          nota: "prepara com o servico do negocio B",
          toolCalls: [
            {
              id: "call-prepare-b",
              name: "create_appointment",
              args: {
                action: "prepare",
                serviceId: "service-b",
                date: "2026-06-08",
                startTime: "10:00",
                customerName: "Helena",
              },
            },
          ],
        },
        {
          nota: "pede confirmacao",
          decision: {
            action: "update_appointment_draft",
            messages: ["Massagem relaxante, 08/06, as 10:00. Posso confirmar?"],
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            confidence: 0.93,
          },
        },
      ],
    });

    // 1. Tenant do turno em todo alcance ao Scheduling.
    expect(a.agenda.reached.length).toBeGreaterThan(0);
    expect(b.agenda.reached.length).toBeGreaterThan(0);
    for (const reach of a.agenda.reached) {
      expect(reach.context?.tenantId, reach.member).toBe("tenant-a");
    }
    for (const reach of b.agenda.reached) {
      expect(reach.context?.tenantId, reach.member).toBe("tenant-b");
    }

    // 2. Prompt do turno descreve o negócio do turno.
    const promptA = a.model.chamada(0).instructions;
    const promptB = b.model.chamada(0).instructions;
    expect(promptA).toContain("Camili Krauser Beauty");
    expect(promptA).not.toContain("Studio Helena");
    expect(promptA).toContain("Estilo: descontraido.");
    expect(promptB).toContain("Studio Helena");
    expect(promptB).not.toContain("Camili Krauser Beauty");
    expect(promptB).toContain("Estilo: profissional.");
    expect(promptB).not.toContain("Estilo: descontraido.");

    // 3. Estado e rascunho de cada conversa só falam do próprio negócio.
    expect(a.rascunho()).toMatchObject({ serviceId: "service-a" });
    expect(b.rascunho()).toMatchObject({ serviceId: "service-b" });
    const estadoA = JSON.stringify(a.estado());
    expect(estadoA).not.toContain("service-b");
    expect(estadoA).not.toContain("Massagem relaxante");
    expect(estadoA).not.toContain(b.phone);
    const estadoB = JSON.stringify(b.estado());
    expect(estadoB).not.toContain("service-a");
    expect(estadoB).not.toContain("Aplicacao 5D");
    expect(estadoB).not.toContain(a.phone);
  });

  it("política: serviço de outro negócio não resolve e não vira agendamento", async () => {
    const a = negocioA();

    await a.send({
      cliente: "Quero marcar a massagem de 50 minutos segunda as 10:00",
      modelo: [
        {
          nota: "modelo tenta usar o serviceId do outro negocio",
          toolCalls: [
            {
              id: "call-prepare-servico-de-outro-negocio",
              name: "create_appointment",
              args: {
                action: "prepare",
                serviceId: "service-b",
                date: "2026-06-08",
                startTime: "10:00",
                customerName: "Maria",
              },
            },
          ],
        },
        {
          nota: "volta para o catalogo real deste negocio",
          toolCalls: [{ id: "call-list-a", name: "list_services", args: {} }],
        },
        {
          nota: "oferece so o que este negocio faz",
          decision: {
            action: "send_message",
            messages: [
              "Por aqui eu tenho a Aplicacao 5D. Quer que eu veja um horario pra ela?",
            ],
            conversationStage: "SERVICE_DISCOVERY",
            classification: "potential_customer",
            confidence: 0.9,
          },
        },
      ],
    });

    expect(a.execucoes()).toMatchObject([
      {
        name: "create_appointment",
        status: "FAILED",
        ok: false,
        code: "SERVICE_NOT_FOUND",
      },
      { name: "list_services", status: "SUCCEEDED", ok: true },
    ]);
    expect(a.agenda.effects.createHold).toEqual([]);
    expect(a.agenda.efeitosComConsequencia()).toEqual([]);
    expect(a.rascunho()).toBeUndefined();
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
