import { describe, expect, it } from "vitest";

import { AppError } from "../../src/lib/errors.js";
import { PrismaGraphRuntime } from "../../src/modules/graph/graph-runtime.js";
import { buildAiTonePromptSection } from "../../src/modules/prompts/style.js";
import {
  AI_CONVERSATION_STYLES,
  aiConversationStyleSchema,
  DEFAULT_AI_CONVERSATION_STYLE,
  LEGACY_AI_CONVERSATION_STYLE_ALIASES,
  normalizeAiSettings,
  parseAiConversationStyle,
  UNKNOWN_AI_CONVERSATION_STYLE_CODE,
} from "../../src/modules/tenant-config/ai-settings.js";

/**
 * Vocabulario do estilo de conversa (Goal011). Os tres valores do produto sao
 * `PROFESSIONAL`, `BALANCED` (default) e `CASUAL`; os dois valores antigos
 * continuam legiveis e aceitos na entrada como alias normalizado.
 */
describe("estilo de conversa: vocabulario e alias legado", () => {
  it("tem exatamente os tres valores do produto, com o equilibrado como default", () => {
    expect([...AI_CONVERSATION_STYLES]).toEqual([
      "PROFESSIONAL",
      "BALANCED",
      "CASUAL",
    ]);
    expect(DEFAULT_AI_CONVERSATION_STYLE).toBe("BALANCED");
  });

  it("aceita os tres valores na entrada sem mudar nenhum deles", () => {
    for (const style of AI_CONVERSATION_STYLES) {
      expect(parseAiConversationStyle(style)).toBe(style);
    }
  });

  it("normaliza os dois valores legados pelo mesmo mapa do backfill", () => {
    expect(LEGACY_AI_CONVERSATION_STYLE_ALIASES).toEqual({
      PROFESSIONAL_OBJECTIVE: "PROFESSIONAL",
      LIGHT_CLOSE: "BALANCED",
    });
    expect(parseAiConversationStyle("PROFESSIONAL_OBJECTIVE")).toBe(
      "PROFESSIONAL",
    );
    expect(parseAiConversationStyle("LIGHT_CLOSE")).toBe("BALANCED");
  });

  it("fica no equilibrado quando nao ha configuracao de estilo", () => {
    expect(parseAiConversationStyle(undefined)).toBe("BALANCED");
    expect(parseAiConversationStyle(null)).toBe("BALANCED");
    expect(normalizeAiSettings({ aiEnabled: true }).tone).toBe("BALANCED");
    expect(normalizeAiSettings(undefined)).toEqual({
      aiEnabled: true,
      tone: "BALANCED",
    });
  });

  it("recusa valor desconhecido com erro proprio, e nao com validacao generica", () => {
    let caught: unknown;
    try {
      parseAiConversationStyle("FRIENDLY");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({
      code: UNKNOWN_AI_CONVERSATION_STYLE_CODE,
      statusCode: 400,
    });

    const parsed = aiConversationStyleSchema.safeParse("FRIENDLY");
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      UNKNOWN_AI_CONVERSATION_STYLE_CODE,
    );
  });

  it("mantem o estilo como registro, sem tocar em decisao operacional", () => {
    const sections = AI_CONVERSATION_STYLES.map((tone) =>
      buildAiTonePromptSection({ aiEnabled: true, tone }),
    );

    // O bloco de estilo muda; as regras de naturalidade e de confirmacao sao as
    // mesmas nos tres, porque estilo nao decide nada.
    expect(new Set(sections).size).toBe(3);
    for (const section of sections) {
      expect(section).toContain(
        "Confirme informacoes antes de criar agendamento.",
      );
      expect(section).toContain(
        "Nao invente identidade, nome ou sexo para a IA.",
      );
    }
  });
});

/**
 * Leitura de tenant legado: uma linha gravada antes do Goal011 continua sendo
 * lida sem erro e chega ao grafo ja no vocabulario novo.
 */
describe("projecao de tenant legado no runtime do grafo", () => {
  function runtimeWith(tone: string | undefined) {
    const prisma = {
      channelConnection: {
        findUnique: async () => ({ tenantId: "tenant-a", status: "ACTIVE" }),
      },
      aiTenantConfig: {
        findUnique: async () =>
          tone === undefined
            ? null
            : { enabled: true, tone, promptVersion: "scheduling_v1.0.0" },
      },
    } as never;
    return new PrismaGraphRuntime(prisma);
  }

  const message = {
    tenantId: "tenant-a",
    channelId: "channel-a",
  } as never;

  it.each([
    ["PROFESSIONAL_OBJECTIVE", "PROFESSIONAL"],
    ["LIGHT_CLOSE", "BALANCED"],
    ["PROFESSIONAL", "PROFESSIONAL"],
    ["BALANCED", "BALANCED"],
    ["CASUAL", "CASUAL"],
  ])("le %s e projeta %s", async (stored, expected) => {
    const loaded = await runtimeWith(stored).loadTenantConfig(message);
    expect(loaded.tenantConfig.tone).toBe(expected);
  });

  it("projeta o equilibrado quando o tenant nao tem configuracao", async () => {
    const loaded = await runtimeWith(undefined).loadTenantConfig(message);
    expect(loaded.tenantConfig.tone).toBe("BALANCED");
  });
});
