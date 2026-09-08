import { describe, expect, it } from "vitest";

import { conversationSchema } from "../src/data/mappers/publicApiSchemas";

/**
 * Compatibilidade do DTO de conversa.
 *
 * Os campos do Goal005 são aditivos: a resposta anterior continua válida e o
 * adapter não passa a exigir o que o BFF pode ainda não enviar. A inbox em três
 * abas, que consome isto de verdade, é do Goal017.
 */
const legacy = {
  id: "conversation-1",
  externalContactId: "5511999999999",
  customerName: "Maria",
  status: "ACTIVE",
  humanHandoff: false,
  handoffReason: null,
  lastMessage: null,
  unreadCount: 0,
  updatedAt: "2026-09-07T10:00:00.000Z",
};

describe("conversationSchema", () => {
  it("aceita a resposta anterior ao Goal005", () => {
    const parsed = conversationSchema.parse(legacy);
    expect(parsed.category).toBeUndefined();
    expect(parsed.handling).toBeUndefined();
    expect(parsed.ignored).toBeUndefined();
  });

  it("aceita categoria, origem, atendimento, sessão e ignore", () => {
    const parsed = conversationSchema.parse({
      ...legacy,
      category: "PERSONAL",
      categorySource: "MANUAL",
      suggestedCategory: "COMMERCIAL",
      handling: "HUMAN",
      ignored: true,
      ignoredAt: "2026-09-07T09:00:00.000Z",
      aiPaused: false,
      session: {
        id: "session-1",
        startedAt: "2026-09-07T09:00:00.000Z",
        expiresAt: "2026-09-08T09:00:00.000Z",
        lastContactMessageAt: null,
        humanHandlingSince: "2026-09-07T09:30:00.000Z",
      },
    });

    expect(parsed).toMatchObject({
      category: "PERSONAL",
      categorySource: "MANUAL",
      handling: "HUMAN",
      ignored: true,
    });
    expect(parsed.session?.id).toBe("session-1");
  });

  it("aceita sessão nula: conversa sem sessão materializada ainda", () => {
    expect(
      conversationSchema.parse({ ...legacy, session: null }).session,
    ).toBeNull();
  });

  it("recusa categoria fora das três organizações da inbox", () => {
    expect(() =>
      conversationSchema.parse({ ...legacy, category: "SUPPLIER" }),
    ).toThrow();
  });
});
