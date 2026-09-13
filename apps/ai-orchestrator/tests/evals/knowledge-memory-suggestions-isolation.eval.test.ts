/**
 * Evals de isolamento entre negócios (Goal012, critério 7 do aceite):
 * conhecimento, memória do cliente e sugestão de um negócio não podem
 * alcançar outro.
 *
 * `tests/evals/business-isolation.eval.test.ts` já prova isolamento de
 * catálogo, tenant e estilo (Goal011); este arquivo cobre o que o Goal012
 * acrescentou. Cada caso semeia os dois negócios na **mesma** fonte
 * (catálogo de conhecimento e linhas de `CustomerMemory`, como se fosse a
 * mesma tabela multi-tenant), para que a prova seja do filtro por tenant do
 * serviço real, não da ausência do dado no fixture — e prova nos dois
 * sentidos: negócio A não vê o B, e B não vê o A.
 */
import { describe, expect, it } from "vitest";

import type { KnowledgeSearchResult } from "../../src/modules/knowledge/knowledge-vector-store.js";
import { memoryRow, type MemoryRow } from "../memory/fake-memory-prisma.js";
import { createEvalWorld, evalDoubleUsage, proibirRede } from "./harness.js";

proibirRede();

const AGORA = new Date("2026-09-13T12:00:00.000Z");

/** Catálogo com documentos dos dois negócios, como se fosse a mesma tabela. */
function catalogoCompartilhado(): Array<KnowledgeSearchResult & { tenantId: string }> {
  return [
    {
      tenantId: "tenant-a",
      documentId: "doc-a",
      chunkId: "chunk-a",
      type: "FAQ",
      serviceId: null,
      title: "FAQ do negocio A",
      source: "faq/a",
      version: "1",
      content: "Politica exclusiva do negocio A: nao atendemos aos domingos.",
      metadata: null,
      score: 0.9,
    },
    {
      tenantId: "tenant-b",
      documentId: "doc-b",
      chunkId: "chunk-b",
      type: "FAQ",
      serviceId: null,
      title: "FAQ do negocio B",
      source: "faq/b",
      version: "1",
      content: "Politica exclusiva do negocio B: aceitamos animais de estimacao no local.",
      metadata: null,
      score: 0.9,
    },
  ];
}

/** Linhas de `CustomerMemory` dos dois negócios, para a mesma pessoa por id. */
function memoriaCompartilhada(): MemoryRow[] {
  return [
    memoryRow({
      id: "memory-a",
      tenantId: "tenant-a",
      customerId: "customer-1",
      kind: "OBSERVATION",
      value: "observacao exclusiva do negocio A",
      origin: "AI_INFERRED",
      aiAllowed: true,
      observedAt: AGORA,
    }),
    memoryRow({
      id: "memory-b",
      tenantId: "tenant-b",
      customerId: "customer-1",
      kind: "OBSERVATION",
      value: "observacao exclusiva do negocio B",
      origin: "AI_INFERRED",
      aiAllowed: true,
      observedAt: AGORA,
    }),
  ];
}

describe("isolamento de conhecimento e memória no turno normal", () => {
  it("política: o prompt de cada negócio só mostra o próprio conhecimento e a própria memória, nos dois sentidos", async () => {
    const a = createEvalWorld({
      tenantId: "tenant-a",
      channelId: "channel-a",
      conversationId: "conversation-a",
      knowledgeCatalog: catalogoCompartilhado(),
      customerMemoryRows: memoriaCompartilhada(),
    });
    const b = createEvalWorld({
      tenantId: "tenant-b",
      channelId: "channel-b",
      conversationId: "conversation-b",
      knowledgeCatalog: catalogoCompartilhado(),
      customerMemoryRows: memoriaCompartilhada(),
    });

    const conhecimentoA = await a.knowledge!.search({
      tenantId: a.tenantId,
      query: "qual a politica de atendimento",
      limit: 4,
    });
    const memoriaA = await a.customerMemory!.service.loadForPrompt({
      tenantId: a.tenantId,
      contactId: a.contact.id,
      now: AGORA,
    });
    const conhecimentoB = await b.knowledge!.search({
      tenantId: b.tenantId,
      query: "qual a politica de atendimento",
      limit: 4,
    });
    const memoriaB = await b.customerMemory!.service.loadForPrompt({
      tenantId: b.tenantId,
      contactId: b.contact.id,
      now: AGORA,
    });

    expect(conhecimentoA.map((r) => r.documentId)).toEqual(["doc-a"]);
    expect(conhecimentoB.map((r) => r.documentId)).toEqual(["doc-b"]);
    expect(memoriaA.map((m) => m.value)).toEqual(["observacao exclusiva do negocio A"]);
    expect(memoriaB.map((m) => m.value)).toEqual(["observacao exclusiva do negocio B"]);

    await a.send({
      cliente: "Qual a politica de atendimento de voces?",
      knowledgeRequested: true,
      retrievedKnowledge: conhecimentoA,
      customerMemory: memoriaA,
      modelo: [
        {
          nota: "responde so com o conhecimento e a memoria do negocio A",
          decision: {
            action: "send_message",
            messages: ["Nao atendemos aos domingos."],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "potential_customer",
            confidence: 0.85,
          },
        },
      ],
    });
    await b.send({
      cliente: "Qual a politica de atendimento de voces?",
      knowledgeRequested: true,
      retrievedKnowledge: conhecimentoB,
      customerMemory: memoriaB,
      modelo: [
        {
          nota: "responde so com o conhecimento e a memoria do negocio B",
          decision: {
            action: "send_message",
            messages: ["Aceitamos animais de estimacao no local."],
            conversationStage: "GENERAL_CONVERSATION",
            classification: "potential_customer",
            confidence: 0.85,
          },
        },
      ],
    });

    const promptA = a.model.chamada(0).instructions;
    const promptB = b.model.chamada(0).instructions;

    expect(promptA).toContain("nao atendemos aos domingos");
    expect(promptA).toContain("observacao exclusiva do negocio A");
    expect(promptA).not.toContain("negocio B");
    expect(promptA).not.toContain("animais de estimacao");

    expect(promptB).toContain("animais de estimacao");
    expect(promptB).toContain("observacao exclusiva do negocio B");
    expect(promptB).not.toContain("negocio A");
    expect(promptB).not.toContain("domingos");
  });
});

describe("isolamento no modo sugestão", () => {
  it("política: a sugestão de um negócio nunca cita conhecimento ou memória do outro, nos dois sentidos", async () => {
    const a = createEvalWorld({
      tenantId: "tenant-a",
      channelId: "channel-a",
      conversationId: "conversation-a",
      session: { category: "COMMERCIAL", humanHandling: true },
      aiTenantConfig: { enabled: true, tone: "BALANCED" },
      knowledgeCatalog: catalogoCompartilhado(),
      customerMemoryRows: memoriaCompartilhada(),
    });
    const b = createEvalWorld({
      tenantId: "tenant-b",
      channelId: "channel-b",
      conversationId: "conversation-b",
      session: { category: "COMMERCIAL", humanHandling: true },
      aiTenantConfig: { enabled: true, tone: "BALANCED" },
      knowledgeCatalog: catalogoCompartilhado(),
      customerMemoryRows: memoriaCompartilhada(),
    });

    for (const world of [a, b]) {
      world.store.messages.push({
        id: `message-seed-${world.tenantId}`,
        conversationId: world.conversationId,
        direction: "INBOUND",
        role: "user",
        body: "Qual a politica de atendimento de voces?",
        createdAt: new Date("2026-06-08T09:00:00.000Z"),
      });
      world.model.carregar([
        {
          nota: `devolve sugestao em texto para ${world.tenantId}`,
          text: JSON.stringify({ suggestions: ["Posso te ajudar com isso."] }),
        },
      ]);
    }

    const resultA = await a.generateSuggestions();
    expect(a.model.passosPendentes()).toEqual([]);
    const resultB = await b.generateSuggestions();
    expect(b.model.passosPendentes()).toEqual([]);

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    const promptA = a.model.chamada(0).instructions;
    const promptB = b.model.chamada(0).instructions;

    expect(promptA).toContain("negocio A");
    expect(promptA).toContain("observacao exclusiva do negocio A");
    expect(promptA).not.toContain("negocio B");
    expect(promptA).not.toContain("observacao exclusiva do negocio B");

    expect(promptB).toContain("negocio B");
    expect(promptB).toContain("observacao exclusiva do negocio B");
    expect(promptB).not.toContain("negocio A");
    expect(promptB).not.toContain("observacao exclusiva do negocio A");
  });
});

describe("o dublê foi exercitado", () => {
  it("a suíte consumiu roteiro do dublê e não deixou passo por usar", () => {
    expect(evalDoubleUsage().invocations).toBeGreaterThan(0);
    expect(evalDoubleUsage().unusedSteps).toEqual([]);
  });
});
