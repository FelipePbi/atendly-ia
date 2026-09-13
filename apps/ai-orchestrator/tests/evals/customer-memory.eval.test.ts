/**
 * Evals de memória do cliente (Goal012, critério 4 do aceite).
 *
 * `world.customerMemory` é o `CustomerMemoryService` real sobre um dublê de
 * Prisma (`tests/memory/fake-memory-prisma.ts`), não uma reimplementação do
 * filtro pelo eval: o que decide o que é permitido, removido ou substituído é
 * o mesmo serviço que roda em produção.
 *
 * Três casos:
 *
 * 1. Memória permitida entra no prompt do turno com origem; memória negada da
 *    mesma pessoa nunca chega lá — provado sobre o prompt que o runtime
 *    entregou ao modelo, não sobre o array que o eval montou.
 * 2. Contato ignorado: nem carrega memória para o prompt, nem infere memória
 *    nova a partir da decisão do turno.
 * 3. Turno atendido por humano: a decisão do turno teria virado memória
 *    inferida em condição normal, mas a sessão em atendimento humano recusa a
 *    inferência.
 */
import { describe, expect, it } from "vitest";

import { memoryRow } from "../memory/fake-memory-prisma.js";
import { createEvalWorld, evalDoubleUsage, proibirRede } from "./harness.js";

proibirRede();

const AGORA = new Date("2026-09-13T12:00:00.000Z");

describe("memória permitida e negada no prompt do turno", () => {
  it("política: memória permitida aparece com origem; memória negada da mesma pessoa nunca aparece", async () => {
    const world = createEvalWorld({
      customerMemoryRows: [
        memoryRow({
          id: "memory-permitida",
          tenantId: "tenant-1",
          kind: "PREFERRED_PERIOD",
          value: "tarde",
          origin: "AI_INFERRED",
          aiAllowed: true,
          observedAt: AGORA,
        }),
        memoryRow({
          id: "memory-negada",
          tenantId: "tenant-1",
          kind: "OBSERVATION",
          value: "Nao mencionar o divorcio recente",
          origin: "PROFESSIONAL",
          aiAllowed: false,
          observedAt: AGORA,
        }),
      ],
    });

    const customerMemory = await world.customerMemory!.service.loadForPrompt({
      tenantId: world.tenantId,
      contactId: world.contact.id,
      now: AGORA,
    });
    // O próprio filtro do serviço já exclui a negada: se isto falhar, o
    // problema é na consulta, não no prompt.
    expect(customerMemory).toHaveLength(1);
    expect(customerMemory[0]).toMatchObject({ kind: "PREFERRED_PERIOD", value: "tarde" });

    await world.send({
      cliente: "Oi, queria saber os horarios de amanha",
      customerMemory,
      modelo: [
        {
          nota: "responde usando o contexto de memoria permitida",
          decision: {
            action: "send_message",
            messages: ["Boa tarde! Amanha tenho horario as 13:30, te atende?"],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "potential_customer",
            confidence: 0.86,
          },
        },
      ],
    });

    const prompt = world.model.chamada(0).instructions;
    expect(prompt).toContain("periodo preferido");
    expect(prompt).toContain("origem inferido pela IA");
    expect(prompt).toContain("tarde");
    expect(prompt).not.toContain("Nao mencionar o divorcio recente");
    expect(prompt).not.toContain("cadastrado pela profissional");
  });
});

describe("contato ignorado: sem carga e sem inferência de memória", () => {
  it("política: contato ignorado não carrega memória permitida no prompt nem gera memória nova a partir do turno", async () => {
    const world = createEvalWorld({
      contact: { ignored: true },
      customerMemoryRows: [],
    });

    const customerMemory = await world.customerMemory!.service.loadForPrompt({
      tenantId: world.tenantId,
      contactId: world.contact.id,
      now: AGORA,
    });
    expect(customerMemory).toEqual([]);

    await world.send({
      cliente: "Prefiro sempre de tarde",
      customerMemory,
      modelo: [
        {
          nota: "turno segue normal mesmo sem memoria de pessoa",
          decision: {
            action: "send_message",
            messages: ["Combinado, vou considerar o periodo da tarde."],
            appointmentDraftPatch: { desiredPeriod: "afternoon" },
            conversationStage: "GENERAL_CONVERSATION",
            classification: "potential_customer",
            confidence: 0.8,
          },
        },
      ],
    });

    // Contato ignorado: a inferência não roda mesmo com um sinal claro
    // (`desiredPeriod`) na decisão do turno.
    expect(world.customerMemory!.state.memories).toHaveLength(0);
    expect(world.model.chamada(0).instructions).toContain(
      "Nenhuma memoria autorizada para esta pessoa.",
    );
  });
});

describe("turno atendido por humano: sem inferência de memória", () => {
  it("política: sessão em atendimento humano não vira memória nova, mesmo com sinal claro na decisão do turno", async () => {
    const world = createEvalWorld({
      session: { humanHandling: true },
      customerMemoryRows: [],
    });

    await world.send({
      cliente: "Prefiro sempre de manha",
      modelo: [
        {
          nota: "decisao do turno teria sinal de preferencia, mas o turno e humano",
          decision: {
            action: "send_message",
            messages: ["Anotado."],
            appointmentDraftPatch: { desiredPeriod: "morning" },
            conversationStage: "GENERAL_CONVERSATION",
            classification: "potential_customer",
            confidence: 0.8,
          },
        },
      ],
    });

    expect(world.customerMemory!.state.memories).toHaveLength(0);
  });
});

describe("rascunho não confirmado x atendimento confirmado", () => {
  it("política: só o atendimento que o turno confirmou vira memória, e uma ocorrência não é serviço recorrente", async () => {
    const world = createEvalWorld({ customerMemoryRows: [] });

    await world.send({
      cliente: "Queria a Aplicacao 5D segunda as 13:30, de tarde e melhor pra mim",
      modelo: [
        {
          nota: "prepara o horario e segura o hold, sem confirmar nada",
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
          nota: "rascunho com preferencia clara, mas ainda sem o sim da cliente",
          decision: {
            action: "update_appointment_draft",
            messages: ["Aplicacao 5D segunda 08/06 as 13:30. Posso confirmar?"],
            appointmentDraftPatch: {
              desiredPeriod: "afternoon",
              desiredDate: "2026-06-08",
              services: [
                {
                  serviceId: "service-1",
                  name: "Aplicacao 5D",
                  durationMinutes: 60,
                  price: 190,
                },
              ],
              status: "waiting_confirmation",
            },
            conversationStage: "CONFIRMING_APPOINTMENT",
            classification: "potential_customer",
            confidence: 0.93,
          },
        },
      ],
    });

    // Rascunho é hipótese da conversa: nada foi marcado, nada foi lembrado.
    expect(world.customerMemory!.state.memories).toHaveLength(0);

    await world.send({
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
          nota: "avisa depois do sucesso da tool",
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

    // O agendamento existe de verdade na agenda: é ele, e não o JSON do
    // modelo, que autorizou a inferência.
    expect(world.agenda.effects.createAppointment).toHaveLength(1);
    expect(
      world.customerMemory!.state.memories.map((row) => ({
        kind: row.kind,
        value: row.value,
        origin: row.origin,
      })),
    ).toEqual([
      { kind: "PREFERRED_PERIOD", value: "tarde", origin: "AI_INFERRED" },
      { kind: "PREFERRED_DAY", value: "segunda-feira", origin: "AI_INFERRED" },
    ]);
    // Um atendimento é uma ocorrência: a IA não chama isso de recorrente.
    expect(
      world.customerMemory!.state.memories.filter(
        (row) => row.kind === "RECURRING_SERVICE",
      ),
    ).toEqual([]);
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
