import { describe, expect, it } from "vitest";

import { buildSystemPrompt, derivePromptVersion } from "../../src/modules/prompts/system.js";
import type { AiConversationStyle } from "../../src/modules/tenant-config/ai-settings.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";

const STYLES: AiConversationStyle[] = ["PROFESSIONAL", "BALANCED", "CASUAL"];

function assemblePrompt(style: AiConversationStyle) {
  return buildSystemPrompt({
    state: {},
    groupedMessages: "Oi",
    currentDateTime: "2026-01-01T00:00:00.000Z",
    businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
    aiSettings: { aiEnabled: true, tone: style },
    knowledgeRequested: false,
    retrievedKnowledge: [],
  });
}

describe("prompt montado: sem persona, identidade transparente e versao por estilo", () => {
  it.each(STYLES)(
    "prompt montado para %s nao instrui a IA a respeitar persona, nome ou personagem",
    (style) => {
      const { text } = assemblePrompt(style);

      expect(text).not.toMatch(/\bpersona\b/i);
      expect(text).not.toMatch(/\bpersonagem\b/i);
    },
  );

  it.each(STYLES)(
    "prompt montado para %s diz, com transparencia, que a IA e a assistente virtual do negocio",
    (style) => {
      const { text } = assemblePrompt(style);

      expect(text).toContain(
        "responda com transparencia que voce e a assistente virtual do negocio",
      );
    },
  );

  it.each(STYLES)(
    "prompt montado para %s nao instrui a IA a parecer ou fingir ser humana (regressao da frase removida de IDENTITY_INTRODUCTION)",
    (style) => {
      const { text } = assemblePrompt(style);

      expect(text).not.toMatch(/\bparecer\b[^.]{0,40}\bhuman[ao]\b/i);
      expect(text).not.toMatch(/\bfingir\b[^.]{0,40}\bhuman[ao]\b/i);
      expect(text).not.toMatch(/\bfinja\b[^.]{0,40}\bhuman[ao]\b/i);
      expect(text).not.toMatch(/\batendente\s+humana\b/i);
    },
  );

  it("a decisao e as tools nao dependem do estilo: regras principais sao identicas nos tres estilos", () => {
    const withoutToneSection = STYLES.map((style) => {
      const { text } = assemblePrompt(style);
      return text
        .replace(/Versao do prompt: .*/, "Versao do prompt: <version>")
        .split("CONFIGURACAO DA IA:")[0];
    });

    expect(new Set(withoutToneSection).size).toBe(1);
  });

  it("a versao muda por estilo e e estavel para o mesmo estilo", () => {
    const versions = STYLES.map((style) => derivePromptVersion(style));

    expect(new Set(versions).size).toBe(STYLES.length);
    for (const style of STYLES) {
      expect(derivePromptVersion(style)).toBe(derivePromptVersion(style));
    }
  });

  it("a versao e um hash estavel do conteudo montado: um teste que muda sozinho aqui sinaliza que o prompt mudou sem bump consciente da versao semantica", () => {
    expect(derivePromptVersion("PROFESSIONAL")).toBe(
      "prompt-v1-professional-f912506c56",
    );
    expect(derivePromptVersion("BALANCED")).toBe(
      "prompt-v1-balanced-81e2a08f6c",
    );
    expect(derivePromptVersion("CASUAL")).toBe("prompt-v1-casual-f3a967bc80");
  });

  it("o prompt montado embute exatamente a versao retornada para o estilo usado", () => {
    for (const style of STYLES) {
      const { text, version } = assemblePrompt(style);

      expect(version).toBe(derivePromptVersion(style));
      expect(text).toContain(`Versao do prompt: ${version}`);
    }
  });
});
