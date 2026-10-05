import { afterEach, describe, expect, it, vi } from "vitest";

import { conversationSchema } from "@avenly-ia/public-api-contract";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const { AiOrchestratorClient } = await import(
  "../src/clients/ai-orchestrator/index.js"
);

/**
 * Goal116/WU-01 — `contactCategory` atravessa o cliente da IA e o contrato
 * público. O upstream é um dobro de `fetch`; roda sem BFF_RUN_INTEGRATION_TESTS.
 */

const context = { tenantId: "tenant-1", userId: "user-1", requestId: "req-1" };

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conversation-1",
    externalContactId: "5511999999999",
    customerName: "Maria",
    status: "ACTIVE",
    humanHandoff: false,
    handoffReason: null,
    lastMessage: null,
    unreadCount: 0,
    updatedAt: "2026-10-04T10:00:00.000Z",
    category: "PERSONAL",
    categorySource: "MANUAL",
    categoryScope: "CONVERSATION",
    contactCategory: "COMMERCIAL",
    suggestedCategory: null,
    handling: "AI",
    ignored: false,
    ignoredAt: null,
    aiPaused: false,
    session: null,
    ...overrides,
  };
}

function stubFetch(data: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data, requestId: "upstream-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cliente da IA repassa contactCategory", () => {
  it("na lista", async () => {
    stubFetch([conversation()]);
    const [item] = await new AiOrchestratorClient().listConversations(
      context,
      {},
    );
    expect(item).toMatchObject({
      category: "PERSONAL",
      categoryScope: "CONVERSATION",
      contactCategory: "COMMERCIAL",
    });
  });

  it("no detalhe", async () => {
    stubFetch(conversation({ contactCategory: "UNCLASSIFIED" }));
    const item = await new AiOrchestratorClient().getConversation(
      context,
      "conversation-1",
    );
    expect(item.contactCategory).toBe("UNCLASSIFIED");
  });

  it("em PUT category", async () => {
    stubFetch(conversation());
    const item = await new AiOrchestratorClient().setCategory(
      context,
      "conversation-1",
      { category: "PERSONAL", scope: "CONVERSATION" },
    );
    expect(item.contactCategory).toBe("COMMERCIAL");
  });

  it("em PUT ignore", async () => {
    stubFetch(conversation({ ignored: true }));
    const item = await new AiOrchestratorClient().setIgnored(
      context,
      "conversation-1",
      { ignored: true },
    );
    expect(item.contactCategory).toBe("COMMERCIAL");
  });

  it("null passa como null", async () => {
    stubFetch(conversation({ contactCategory: null }));
    const item = await new AiOrchestratorClient().getConversation(
      context,
      "conversation-1",
    );
    expect(item.contactCategory).toBeNull();
  });

  it("resposta sem o campo continua valida", async () => {
    const { contactCategory: _omit, ...legacy } = conversation();
    stubFetch(legacy);
    const item = await new AiOrchestratorClient().getConversation(
      context,
      "conversation-1",
    );
    expect(item.contactCategory).toBeUndefined();
  });
});

describe("conversationSchema do contrato público", () => {
  it("aceita com contactCategory, inclusive null", () => {
    for (const value of ["COMMERCIAL", "UNCLASSIFIED", "PERSONAL", null]) {
      const parsed = conversationSchema.safeParse(
        conversation({ contactCategory: value }),
      );
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.contactCategory).toBe(value);
    }
  });

  it("aceita sem contactCategory", () => {
    const { contactCategory: _omit, ...legacy } = conversation();
    expect(conversationSchema.safeParse(legacy).success).toBe(true);
  });

  it("recusa valor fora da lista", () => {
    expect(
      conversationSchema.safeParse(conversation({ contactCategory: "OTHER" }))
        .success,
    ).toBe(false);
  });
});
