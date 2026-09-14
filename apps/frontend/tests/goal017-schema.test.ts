import { describe, expect, it } from "vitest";

import { conversationSchema } from "../src/data/mappers/publicApiSchemas";

/**
 * Goal017: `customerId` no DTO de conversa é aditivo — vínculo com a pessoa
 * do Scheduling, `null` quando o contato ainda não está vinculado, ausente
 * no estoque anterior a este campo. A tela que consome isto de verdade é do
 * Goal017 (WU-05+); aqui é só o contrato que a camada de dados precisa
 * entender, provado contra a resposta nova e a resposta anterior a cada
 * campo opcional (customerId, deliveryState do Goal004, attachment do
 * Goal013 e os campos de sessão do Goal005).
 */

const legacyMessage = {
  id: "message-1",
  direction: "OUTBOUND" as const,
  source: "AI" as const,
  body: "Olá!",
  createdAt: "2026-09-07T10:00:00.000Z",
};

const legacyConversation = {
  id: "conversation-1",
  externalContactId: "5511999999999",
  customerName: "Maria",
  status: "ACTIVE" as const,
  humanHandoff: false,
  handoffReason: null,
  lastMessage: null,
  unreadCount: 0,
  updatedAt: "2026-09-07T10:00:00.000Z",
};

describe("conversationSchema customerId (Goal017)", () => {
  it("decodifica a resposta antiga: sem customerId, sem deliveryState, sem attachment, sem os campos de sessão do Goal005", () => {
    const parsed = conversationSchema.parse({
      ...legacyConversation,
      lastMessage: legacyMessage,
    });

    expect(parsed.customerId).toBeUndefined();
    expect(parsed.category).toBeUndefined();
    expect(parsed.handling).toBeUndefined();
    expect(parsed.session).toBeUndefined();
    expect(parsed.lastMessage?.deliveryState).toBeUndefined();
    expect(parsed.lastMessage?.attachment).toBeUndefined();
  });

  it("decodifica customerId nulo: contato ainda não vinculado a uma pessoa do Scheduling", () => {
    const parsed = conversationSchema.parse({
      ...legacyConversation,
      customerId: null,
    });

    expect(parsed.customerId).toBeNull();
  });

  it("decodifica customerId preenchido junto do restante da resposta nova", () => {
    const parsed = conversationSchema.parse({
      ...legacyConversation,
      customerId: "customer-1",
      category: "COMMERCIAL",
      categorySource: "AUTOMATIC",
      handling: "AI",
      ignored: false,
      aiPaused: false,
      session: {
        id: "session-1",
        startedAt: "2026-09-07T09:00:00.000Z",
        expiresAt: "2026-09-08T09:00:00.000Z",
      },
      lastMessage: {
        ...legacyMessage,
        deliveryState: "SENT",
        attachment: null,
      },
    });

    expect(parsed.customerId).toBe("customer-1");
    expect(parsed.lastMessage?.deliveryState).toBe("SENT");
  });

  it("recusa customerId de um tipo fora do contrato (número em vez de string)", () => {
    expect(() =>
      conversationSchema.parse({ ...legacyConversation, customerId: 123 }),
    ).toThrow();
  });
});
