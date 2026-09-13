import { describe, expect, it } from "vitest";

import {
  conversationSuggestionsSchema,
  customerMemorySchema,
  customerSummarySchema,
  knowledgeDocumentSchema,
} from "../src/data/mappers/publicApiSchemas";

/**
 * Goal012: conhecimento do negócio versionado, memória do cliente com
 * origem/permissão/idade/substituição, resumo sob demanda e sugestões de
 * resposta no atendimento humano. Sem tela: a experiência é dos Goals 015,
 * 017 e 023 — aqui é só o contrato que a camada de dados precisa entender.
 */

const knowledgeDocument = {
  id: "doc-1",
  type: "FAQ" as const,
  serviceId: null,
  title: "Perguntas frequentes",
  source: "MANUAL",
  version: "1",
  checksum: "abc123",
  status: "ACTIVE" as const,
  createdAt: "2026-09-12T12:00:00.000Z",
  updatedAt: "2026-09-12T12:00:00.000Z",
};

const customerMemory = {
  id: "memory-1",
  customerId: "customer-1",
  kind: "PREFERRED_PERIOD" as const,
  value: "Prefere atendimento pela manhã",
  origin: "PROFESSIONAL" as const,
  aiAllowed: false,
  confidence: null,
  sourceConversationId: null,
  sourceMessageIds: [],
  observedAt: "2026-09-12T12:00:00.000Z",
  lastReinforcedAt: null,
  supersededById: null,
  removedAt: null,
  removedBy: null,
};

describe("contrato de conhecimento, memória, resumo e sugestões (Goal012)", () => {
  it("decodifica um documento de conhecimento com serviceId, versão e status", () => {
    expect(knowledgeDocumentSchema.parse(knowledgeDocument)).toMatchObject({
      type: "FAQ",
      status: "ACTIVE",
      version: "1",
    });

    expect(
      knowledgeDocumentSchema.parse({
        ...knowledgeDocument,
        id: "doc-2",
        type: "BUSINESS_INFO",
        serviceId: null,
        status: "INACTIVE",
      }).status,
    ).toBe("INACTIVE");
  });

  it("liga o documento a um serviço do catálogo quando presente", () => {
    expect(
      knowledgeDocumentSchema.parse({
        ...knowledgeDocument,
        serviceId: "service-1",
      }).serviceId,
    ).toBe("service-1");
  });

  it("recusa tipo e status de documento fora do vocabulário", () => {
    expect(() =>
      knowledgeDocumentSchema.parse({ ...knowledgeDocument, type: "OTHER" }),
    ).toThrow();

    expect(() =>
      knowledgeDocumentSchema.parse({
        ...knowledgeDocument,
        status: "ARCHIVED",
      }),
    ).toThrow();
  });

  it("decodifica memória do cliente com origem, permissão e idade", () => {
    expect(customerMemorySchema.parse(customerMemory)).toMatchObject({
      origin: "PROFESSIONAL",
      aiAllowed: false,
    });
  });

  it("decodifica memória inferida com confiança, superseded e remoção", () => {
    const inferred = customerMemorySchema.parse({
      ...customerMemory,
      id: "memory-2",
      kind: "RECURRING_SERVICE",
      origin: "AI_INFERRED",
      aiAllowed: true,
      confidence: 0.82,
      sourceConversationId: "conversation-1",
      sourceMessageIds: ["message-1", "message-2"],
      lastReinforcedAt: "2026-09-12T13:00:00.000Z",
      supersededById: "memory-1",
    });
    expect(inferred.origin).toBe("AI_INFERRED");
    expect(inferred.supersededById).toBe("memory-1");

    const removed = customerMemorySchema.parse({
      ...customerMemory,
      id: "memory-3",
      removedAt: "2026-09-12T14:00:00.000Z",
      removedBy: "user-1",
    });
    expect(removed.removedBy).toBe("user-1");
  });

  it("recusa origem e kind de memória fora do vocabulário", () => {
    expect(() =>
      customerMemorySchema.parse({ ...customerMemory, origin: "IMPORTED" }),
    ).toThrow();

    expect(() =>
      customerMemorySchema.parse({ ...customerMemory, kind: "UNKNOWN_KIND" }),
    ).toThrow();
  });

  it("decodifica o resumo do cliente com contagem de fontes usadas", () => {
    const summary = customerSummarySchema.parse({
      customerId: "customer-1",
      summary: "Cliente prefere atendimento pela manhã.",
      promptVersion: "v1",
      aiRunId: "ai-run-1",
      sources: { memory: 2, notes: 1, tags: 0, upcomingAppointments: 1 },
    });
    expect(summary.sources.memory).toBe(2);

    // Resumo sem auditoria não existe: a IA recusa antes de chamar o modelo,
    // então `aiRunId` nulo é resposta fora do contrato.
    expect(() =>
      customerSummarySchema.parse({
        customerId: "customer-2",
        summary: "Sem material suficiente para resumo.",
        promptVersion: "v1",
        aiRunId: null,
        sources: { memory: 0, notes: 0, tags: 0, upcomingAppointments: 0 },
      }),
    ).toThrow();
  });

  it("decodifica até três sugestões de resposta, sem envio automático", () => {
    const suggestions = conversationSuggestionsSchema.parse({
      conversationId: "conversation-1",
      suggestions: ["Opção 1", "Opção 2", "Opção 3"],
      aiRunId: "ai-run-2",
      promptVersion: "prompt-v2-balanced-abc1234567",
    });
    expect(suggestions.suggestions).toHaveLength(3);
    expect(suggestions.promptVersion).toBe("prompt-v2-balanced-abc1234567");
  });

  it("recusa sugestão sem auditoria ou sem versão de prompt", () => {
    // O caminho público decodifica o DTO da IA como ele é: faltar `aiRunId` ou
    // `promptVersion` é divergência de contrato, e ela precisa falhar alto.
    expect(() =>
      conversationSuggestionsSchema.parse({
        conversationId: "conversation-1",
        suggestions: ["Opção 1"],
        aiRunId: "ai-run-2",
      }),
    ).toThrow();

    expect(() =>
      conversationSuggestionsSchema.parse({
        conversationId: "conversation-1",
        suggestions: ["Opção 1"],
        aiRunId: null,
        promptVersion: "v1",
      }),
    ).toThrow();
  });

  it("recusa resposta fora do contrato em vez de decodificar pela metade", () => {
    expect(() =>
      knowledgeDocumentSchema.parse({ ...knowledgeDocument, version: 1 }),
    ).toThrow();

    expect(() =>
      customerSummarySchema.parse({
        customerId: "customer-1",
        summary: "Resumo",
        promptVersion: "v1",
        aiRunId: "ai-run-1",
        sources: { memory: 0, notes: 0, tags: 0 },
      }),
    ).toThrow();
  });
});
