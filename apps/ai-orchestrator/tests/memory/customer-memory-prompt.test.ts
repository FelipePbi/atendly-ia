import { describe, expect, it } from "vitest";

import type { CustomerMemoryPromptItem } from "../../src/modules/memory/customer-memory.js";
import { buildCustomerMemoryPrompt } from "../../src/modules/prompts/customer-memory.js";
import { buildSystemPrompt } from "../../src/modules/prompts/system.js";

function item(
  overrides: Partial<CustomerMemoryPromptItem> = {},
): CustomerMemoryPromptItem {
  return {
    kind: "PREFERRED_PERIOD",
    value: "tarde",
    origin: "AI_INFERRED",
    ageDays: 2,
    stale: false,
    ...overrides,
  };
}

describe("seção de memória da pessoa no prompt", () => {
  it("apresenta cada item com origem e idade", () => {
    const lines = buildCustomerMemoryPrompt([
      item(),
      item({
        kind: "OBSERVATION",
        value: "Prefere sala silenciosa",
        origin: "PROFESSIONAL",
        ageDays: 30,
      }),
    ]).join("\n");

    expect(lines).toContain("periodo preferido");
    expect(lines).toContain("origem inferido pela IA");
    expect(lines).toContain("origem cadastrado pela profissional");
    expect(lines).toContain("observado ha 2 dia(s)");
    expect(lines).toContain("Prefere sala silenciosa");
  });

  it("marca como antigo o item que passou do limite de relevância", () => {
    const recent = buildCustomerMemoryPrompt([item()]).join("\n");
    const old = buildCustomerMemoryPrompt([
      item({ ageDays: 400, stale: true }),
    ]).join("\n");

    expect(recent).not.toContain("ANTIGO");
    expect(old).toContain("ANTIGO, menor peso");
  });

  it("sem memória autorizada, diz que não há — e proíbe presumir", () => {
    const lines = buildCustomerMemoryPrompt([]).join("\n");

    expect(lines).toContain("Nenhuma memoria autorizada para esta pessoa.");
    expect(lines).toContain("Nao presuma preferencia");
  });

  it("a seção entra no prompt montado, separada do estado da conversa", () => {
    const { text } = buildSystemPrompt({
      state: { conversationMemory: { summary: "estado da sessao" } },
      groupedMessages: "oi",
      customerMemory: [item({ value: "gosta de tarde" })],
    });

    expect(text).toContain("Memoria da pessoa atendida");
    expect(text).toContain("gosta de tarde");
    // `ConversationMemory` continua sendo outra coisa, no mesmo prompt.
    expect(text).toContain("Estado interno atual da conversa:");
    expect(text).toContain("estado da sessao");
    expect(text.indexOf("Memoria da pessoa atendida")).toBeLessThan(
      text.indexOf("Estado interno atual da conversa:"),
    );
  });

  it("memória não carregada não aparece no prompt de jeito nenhum", () => {
    const { text } = buildSystemPrompt({
      state: {},
      groupedMessages: "oi",
      customerMemory: [],
    });

    expect(text).not.toContain("gosta de tarde");
    expect(text).toContain("Nenhuma memoria autorizada para esta pessoa.");
  });
});
