/**
 * Evals de conhecimento (Goal012, critérios 2 e 3 do aceite).
 *
 * Quatro casos, cada um com o roteiro do dublê e a asserção sobre o que o
 * runtime **entregou ao modelo** e **executou** — nunca sobre o texto que o
 * dublê escolheu:
 *
 * 1. Pergunta secundária sem trecho cadastrado: a instrução de "sem handoff
 *    obrigatório" chega ao modelo, e o turno segue sem handoff quando o
 *    roteiro responde direto.
 * 2. Pergunta material para decisão/segurança sem trecho cadastrado: o mesmo
 *    prompt sustenta o caminho de handoff quando o roteiro escolhe escalar.
 * 3. Conflito entre FAQ e campo livre "Outras informações importantes": o
 *    trecho apresentado ao modelo segue a precedência do produto (FAQ antes
 *    de campo livre), mesmo quando a recuperação devolve na ordem contrária.
 * 4. FAQ de outro serviço nunca chega ao prompt: usa o mesmo contrato de
 *    `KnowledgeVectorStore.search` (`world.knowledge`) que filtra por tenant e
 *    serviço em foco antes do turno.
 */
import { describe, expect, it } from "vitest";

import { OTHER_INFO_SOURCE } from "../../src/modules/knowledge/knowledge-document-service.js";
import type { KnowledgeSearchResult } from "../../src/modules/knowledge/knowledge-vector-store.js";
import { createEvalWorld, evalDoubleUsage, proibirRede } from "./harness.js";

proibirRede();

describe("pergunta desconhecida sem trecho cadastrado", () => {
  it("política: dúvida secundária sem informação cadastrada não força handoff", async () => {
    const world = createEvalWorld();

    const reply = await world.send({
      cliente: "Voces tem estacionamento no local?",
      knowledgeRequested: true,
      retrievedKnowledge: [],
      modelo: [
        {
          nota: "sem trecho cadastrado, mas a duvida e secundaria: responde sem escalar",
          decision: {
            action: "send_message",
            messages: [
              "Nao tenho essa informacao aqui comigo, mas posso te ajudar com o resto do agendamento.",
            ],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "potential_customer",
            confidence: 0.85,
          },
        },
      ],
    });

    const prompt = world.model.chamada(0).instructions;
    expect(prompt).toContain(
      "Se a duvida for secundaria e essa informacao nao estiver disponivel, diga isso de forma simples; a falta desse dado sozinha nao exige handoff.",
    );
    expect(prompt).toContain("Nenhum trecho configurado foi encontrado para esta pergunta.");

    expect(world.handoffs()).toEqual([]);
    expect(world.conversa()).toMatchObject({
      humanHandoff: false,
      status: "ACTIVE",
    });
    expect(reply.text).not.toContain("profissional");
  });

  it("política: dúvida material para decisão ou segurança sem informação cadastrada vai para handoff", async () => {
    const world = createEvalWorld();

    await world.send({
      cliente: "Sou alergica a algum produto usado nesse procedimento?",
      knowledgeRequested: true,
      retrievedKnowledge: [],
      modelo: [
        {
          nota: "sem trecho cadastrado sobre alergia/contraindicacao: e seguranca, escala",
          toolCalls: [
            {
              id: "call-handoff-alergia",
              name: "request_human_handoff",
              args: {
                reason: "duvida de seguranca sem informacao cadastrada",
                summary: "Cliente perguntou sobre alergia a produto do procedimento.",
              },
            },
          ],
        },
        {
          nota: "avisa sem inventar orientacao de seguranca",
          decision: {
            action: "handoff_human",
            messages: [
              "Isso e importante e prefiro confirmar com a profissional antes de te responder. Ja chamei ela aqui.",
            ],
            pauseReason: "duvida de seguranca sem informacao cadastrada",
            conversationStage: "HUMAN_HANDOFF",
            classification: "potential_customer",
            confidence: 0.9,
          },
        },
      ],
    });

    const prompt = world.model.chamada(0).instructions;
    expect(prompt).toContain(
      "Encaminhe para a profissional com request_human_handoff somente quando a lacuna for material para a decisao da cliente ou para a seguranca dela.",
    );

    expect(world.execucoes()).toMatchObject([
      { name: "request_human_handoff", status: "SUCCEEDED", ok: true },
    ]);
    expect(world.handoffs()).toMatchObject([
      { reason: "duvida de seguranca sem informacao cadastrada", status: "OPEN" },
    ]);
    expect(world.conversa()).toMatchObject({
      humanHandoff: true,
      status: "HUMAN_HANDOFF",
    });
  });
});

describe("precedência do produto entre fontes de conhecimento", () => {
  it("política: FAQ vence o campo livre 'Outras informações importantes' no prompt, mesmo recuperado depois dela", async () => {
    const world = createEvalWorld();
    const campoLivre: KnowledgeSearchResult = {
      documentId: "doc-outras-informacoes",
      chunkId: "chunk-outras-informacoes",
      type: "BUSINESS_INFO",
      serviceId: null,
      title: "Outras informacoes importantes",
      source: OTHER_INFO_SOURCE,
      version: "3",
      content: "Atendemos das 8h as 18h, sem excecao.",
      metadata: null,
      score: 0.99,
    };
    const faq: KnowledgeSearchResult = {
      documentId: "doc-faq-horario",
      chunkId: "chunk-faq-horario",
      type: "FAQ",
      serviceId: null,
      title: "Horario de atendimento",
      source: "faq/horario",
      version: "2",
      content: "Em dias de evento especial atendemos ate as 20h.",
      metadata: null,
      score: 0.7,
    };

    await world.send({
      cliente: "Voces atendem depois das 18h em algum dia?",
      knowledgeRequested: true,
      // Recuperado na ordem contrária à precedência: o campo livre tem o
      // score mais alto, mas isso não pode virar a ordem apresentada.
      retrievedKnowledge: [campoLivre, faq],
      modelo: [
        {
          nota: "segue a fonte de maior precedencia (FAQ) em caso de conflito",
          decision: {
            action: "send_message",
            messages: [
              "Em dias de evento especial atendemos ate as 20h. Nos demais dias, ate as 18h.",
            ],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "potential_customer",
            confidence: 0.88,
          },
        },
      ],
    });

    const prompt = world.model.chamada(0).instructions;
    expect(prompt).toContain(
      "Ordem de precedencia do negocio quando houver conflito entre trechos: regra do servico em foco > FAQ > dados estruturados do negocio > campo livre. Em conflito, siga apenas a fonte de maior precedencia, sem reescrever o conteudo original dela.",
    );
    const indiceFaq = prompt.indexOf("Em dias de evento especial atendemos ate as 20h.");
    const indiceCampoLivre = prompt.indexOf("Atendemos das 8h as 18h, sem excecao.");
    expect(indiceFaq).toBeGreaterThan(-1);
    expect(indiceCampoLivre).toBeGreaterThan(-1);
    expect(indiceFaq).toBeLessThan(indiceCampoLivre);
  });

  it("política: FAQ de outro serviço nunca chega ao prompt deste turno", async () => {
    const world = createEvalWorld({
      knowledgeCatalog: [
        {
          tenantId: "tenant-1",
          documentId: "doc-geral",
          chunkId: "chunk-geral",
          type: "FAQ",
          serviceId: null,
          title: "FAQ geral",
          source: "faq/geral",
          version: "1",
          content: "Aceitamos pagamento por pix e cartao.",
          metadata: null,
          score: 0.6,
        },
        {
          tenantId: "tenant-1",
          documentId: "doc-servico-em-foco",
          chunkId: "chunk-servico-em-foco",
          type: "PROCEDURE",
          serviceId: "service-1",
          title: "Cuidados apos a Aplicacao 5D",
          source: "procedure/service-1",
          version: "1",
          content: "Evite molhar o local nas primeiras 24 horas.",
          metadata: null,
          score: 0.8,
        },
        {
          tenantId: "tenant-1",
          documentId: "doc-outro-servico",
          chunkId: "chunk-outro-servico",
          type: "PROCEDURE",
          serviceId: "service-2",
          title: "Cuidados apos o Design de sobrancelha",
          source: "procedure/service-2",
          version: "1",
          content: "Nao deve aparecer: e de outro servico.",
          metadata: null,
          score: 0.95,
        },
      ],
    });
    const retrievedKnowledge = await world.knowledge!.search({
      tenantId: world.tenantId,
      query: "posso molhar depois do procedimento",
      limit: 4,
      focusServiceIds: ["service-1"],
    });

    await world.send({
      cliente: "Posso molhar o local depois do procedimento?",
      knowledgeRequested: true,
      retrievedKnowledge,
      modelo: [
        {
          nota: "responde so com o trecho do servico em foco e o geral",
          decision: {
            action: "send_message",
            messages: [
              "Evite molhar o local nas primeiras 24 horas. Aceitamos pix e cartao tambem, se precisar.",
            ],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "potential_customer",
            confidence: 0.87,
          },
        },
      ],
    });

    const prompt = world.model.chamada(0).instructions;
    expect(prompt).toContain("Evite molhar o local nas primeiras 24 horas.");
    expect(prompt).toContain("Aceitamos pagamento por pix e cartao.");
    expect(prompt).not.toContain("Nao deve aparecer: e de outro servico.");
    expect(prompt).not.toContain("Cuidados apos o Design de sobrancelha");
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
