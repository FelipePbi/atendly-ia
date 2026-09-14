import { describe, expect, it } from "vitest";

import { AUDIO_TURN_MARKER } from "../../src/modules/media/audio-turn.js";
import { buildAudioPrompt } from "../../src/modules/prompts/audio.js";
import {
  buildSystemPrompt,
  derivePromptVersion,
} from "../../src/modules/prompts/system.js";
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
      "prompt-v3-professional-8a08266b6e",
    );
    expect(derivePromptVersion("BALANCED")).toBe(
      "prompt-v3-balanced-04995d48b1",
    );
    expect(derivePromptVersion("CASUAL")).toBe("prompt-v3-casual-64e9afb011");
  });

  it("o prompt montado embute exatamente a versao retornada para o estilo usado", () => {
    for (const style of STYLES) {
      const { text, version } = assemblePrompt(style);

      expect(version).toBe(derivePromptVersion(style));
      expect(text).toContain(`Versao do prompt: ${version}`);
    }
  });
});

describe("prompt montado: modo sugestao (Goal012/WU-04)", () => {
  it("sem mode (ou mode assistant), o prompt normal nao ganha a secao de sugestao nem o formato de saida dela", () => {
    const { text } = assemblePrompt("BALANCED");

    expect(text).not.toContain("MODO SUGESTAO");
    expect(text).not.toContain('"suggestions"');
    expect(text).toContain("FORMATO DE SAIDA OBRIGATORIO:");
  });

  it("mode suggestion troca o formato de saida e desativa as instrucoes de efeito, sem tocar na versao do prompt", () => {
    for (const style of STYLES) {
      const assistantPrompt = assemblePrompt(style);
      const { text, version } = buildSystemPrompt({
        state: {},
        groupedMessages: "Oi",
        currentDateTime: "2026-01-01T00:00:00.000Z",
        businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
        aiSettings: { aiEnabled: true, tone: style },
        knowledgeRequested: false,
        retrievedKnowledge: [],
        mode: "suggestion",
      });

      expect(version).toBe(assistantPrompt.version);
      expect(text).toContain("MODO SUGESTAO");
      expect(text).toContain('"suggestions"');
      expect(text).not.toContain('"action":');
    }
  });

  it("a secao do modo sugestao entra no hash estavel: mudar o template de sugestao muda a versao do prompt normal tambem", () => {
    expect(derivePromptVersion("BALANCED")).toBe(
      "prompt-v3-balanced-04995d48b1",
    );
  });

  it("estilo muda so o registro da sugestao, nao o conteudo operacional: regras e formato de saida sao identicos nos tres estilos", () => {
    const withoutToneSection = STYLES.map((style) => {
      const { text } = buildSystemPrompt({
        state: {},
        groupedMessages: "Oi",
        currentDateTime: "2026-01-01T00:00:00.000Z",
        businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
        aiSettings: { aiEnabled: true, tone: style },
        knowledgeRequested: false,
        retrievedKnowledge: [],
        mode: "suggestion",
      });
      return text
        .replace(/Versao do prompt: .*/, "Versao do prompt: <version>")
        .split("CONFIGURACAO DA IA:")[0];
    });

    expect(new Set(withoutToneSection).size).toBe(1);
  });
});

describe("prompt montado: audio transcrito (Goal013/WU-03)", () => {
  it.each(STYLES)(
    "prompt montado para %s explica o marcador do audio transcrito, o risco de erro e a confirmacao por audio",
    (style) => {
      const { text } = assemblePrompt(style);

      expect(text).toContain("AUDIO TRANSCRITO:");
      expect(text).toContain(AUDIO_TURN_MARKER);
      expect(text).toContain("transcricao automatica da voz da cliente");
      expect(text).toContain(
        "vale como confirmacao da cliente, exatamente como valeria por texto",
      );
      expect(text).toContain(
        "Nunca invente conteudo de audio que nao esteja transcrito aqui",
      );
    },
  );

  it("a secao de audio entra inteira no prompt montado", () => {
    const { text } = assemblePrompt("BALANCED");

    for (const line of buildAudioPrompt()) {
      expect(text).toContain(line);
    }
  });

  it("a secao de audio entra no hash estavel: o bump para v3 e o hash novo sao a versao conscientemente atualizada por causa dela", () => {
    // O identificador semantico subiu de v2 para v3 porque o turno passou a
    // poder chegar como voz virada em texto; o hash abaixo muda sozinho se
    // alguem mexer na secao sem decidir isso de novo.
    expect(derivePromptVersion("BALANCED")).toBe(
      "prompt-v3-balanced-04995d48b1",
    );
  });
});

describe("prompt montado: precedencia do conhecimento e regra de pergunta desconhecida", () => {
  it.each(STYLES)(
    "prompt montado para %s instrui a hierarquia regra do servico > FAQ > dados estruturados > campo livre",
    (style) => {
      const { text } = buildSystemPrompt({
        state: {},
        groupedMessages: "Posso lavar o cabelo antes da progressiva?",
        currentDateTime: "2026-01-01T00:00:00.000Z",
        businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
        aiSettings: { aiEnabled: true, tone: style },
        knowledgeRequested: true,
        retrievedKnowledge: [
          {
            documentId: "doc-faq",
            chunkId: "chunk-faq",
            type: "FAQ",
            serviceId: null,
            title: "FAQ geral",
            source: "faq/geral",
            version: "1",
            content: "Resposta da FAQ geral.",
            metadata: null,
            score: 0.8,
          },
        ],
      });

      expect(text).toContain(
        "regra do servico em foco > FAQ > dados estruturados do negocio > campo livre",
      );
      expect(text).toContain(
        "a falta desse dado sozinha nao exige handoff",
      );
      expect(text).toContain(
        "request_human_handoff somente quando a lacuna for material para a decisao da cliente ou para a seguranca dela",
      );
    },
  );

  it.each(STYLES)(
    "prompt montado para %s responde de forma simples e sem handoff obrigatorio quando nao ha trecho para a pergunta",
    (style) => {
      const { text } = buildSystemPrompt({
        state: {},
        groupedMessages: "Voces atendem aos domingos de manha bem cedo?",
        currentDateTime: "2026-01-01T00:00:00.000Z",
        businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
        aiSettings: { aiEnabled: true, tone: style },
        knowledgeRequested: true,
        retrievedKnowledge: [],
      });

      expect(text).toContain(
        "a falta desse dado sozinha nao exige handoff",
      );
      expect(text).toContain(
        "request_human_handoff somente quando a lacuna for material para a decisao da cliente ou para a seguranca dela",
      );
    },
  );

  it("apresenta os trechos recuperados na ordem de precedencia do produto, com a regra do servico em foco primeiro", () => {
    const { text } = buildSystemPrompt({
      state: {},
      groupedMessages: "Posso lavar o cabelo antes da progressiva?",
      currentDateTime: "2026-01-01T00:00:00.000Z",
      businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
      aiSettings: { aiEnabled: true, tone: "BALANCED" },
      knowledgeRequested: true,
      retrievedKnowledge: [
        {
          documentId: "doc-free",
          chunkId: "chunk-free",
          type: "GUIDANCE",
          serviceId: null,
          title: "Campo livre",
          source: "other-info",
          version: "1",
          content: "Texto livre geral.",
          metadata: null,
          score: 0.7,
        },
        {
          documentId: "doc-structured",
          chunkId: "chunk-structured",
          type: "BUSINESS_INFO",
          serviceId: null,
          title: "Dados estruturados",
          source: "business-info/hours",
          version: "1",
          content: "Horario de funcionamento.",
          metadata: null,
          score: 0.75,
        },
        {
          documentId: "doc-faq",
          chunkId: "chunk-faq",
          type: "FAQ",
          serviceId: null,
          title: "FAQ geral",
          source: "faq/geral",
          version: "1",
          content: "Resposta da FAQ geral.",
          metadata: null,
          score: 0.8,
        },
        {
          documentId: "doc-service",
          chunkId: "chunk-service",
          type: "PROCEDURE",
          serviceId: "service-progressiva",
          title: "Regra da progressiva",
          source: "procedure/progressiva",
          version: "1",
          content: "Nao lave o cabelo por 72 horas.",
          metadata: null,
          score: 0.6,
        },
      ],
    });

    const serviceIndex = text.indexOf("Regra da progressiva");
    const faqIndex = text.indexOf("FAQ geral");
    const structuredIndex = text.indexOf("Dados estruturados");
    const freeIndex = text.indexOf("Campo livre");

    expect(serviceIndex).toBeGreaterThan(-1);
    expect(serviceIndex).toBeLessThan(faqIndex);
    expect(faqIndex).toBeLessThan(structuredIndex);
    expect(structuredIndex).toBeLessThan(freeIndex);
    expect(text).toContain("regra do servico em foco");
    expect(text).toContain(
      "Nunca use conhecimento geral fora destes trechos",
    );
  });
});
