import { z } from "zod";

import { AppError } from "../../lib/errors.js";

/**
 * Estilo de conversa do negocio, vocabulario canonico do produto. Estilo
 * influencia registro, emoji e informalidade — nunca quantidade de mensagens,
 * conteudo factual ou qualquer regra de agenda.
 */
export const AI_CONVERSATION_STYLES = [
  "PROFESSIONAL",
  "BALANCED",
  "CASUAL",
] as const;

export type AiConversationStyle = (typeof AI_CONVERSATION_STYLES)[number];

/** Negocio sem configuracao fica no equilibrado. */
export const DEFAULT_AI_CONVERSATION_STYLE: AiConversationStyle = "BALANCED";

/**
 * Os dois valores antigos continuam aceitos na entrada como alias declarado e
 * legiveis na saida do banco. Mesmo mapa do backfill da migration
 * `20260913120100_goal011_ai_style_backfill`. Sai no Goal024.
 */
export const LEGACY_AI_CONVERSATION_STYLE_ALIASES: Readonly<
  Record<string, AiConversationStyle>
> = {
  PROFESSIONAL_OBJECTIVE: "PROFESSIONAL",
  LIGHT_CLOSE: "BALANCED",
};

/** Erro proprio do estilo desconhecido: nao se confunde com validacao generica. */
export const UNKNOWN_AI_CONVERSATION_STYLE_CODE =
  "AI_CONVERSATION_STYLE_UNKNOWN";

function matchAiConversationStyle(value: unknown): AiConversationStyle | null {
  if (value === undefined || value === null) {
    return DEFAULT_AI_CONVERSATION_STYLE;
  }
  if (typeof value !== "string") return null;
  if ((AI_CONVERSATION_STYLES as readonly string[]).includes(value)) {
    return value as AiConversationStyle;
  }
  return LEGACY_AI_CONVERSATION_STYLE_ALIASES[value] ?? null;
}

/**
 * Leitura: ausencia e valor que ninguem reconhece caem no equilibrado. Vale
 * para o que vem do banco ou de um payload de outro binario — uma projecao de
 * leitura nao derruba atendimento por vocabulario.
 */
export function resolveAiConversationStyle(
  value: unknown,
): AiConversationStyle {
  return matchAiConversationStyle(value) ?? DEFAULT_AI_CONVERSATION_STYLE;
}

/**
 * Entrada: os tres valores e os dois legados passam normalizados, qualquer
 * outro e recusado com erro proprio. Quem escreve configuracao precisa saber
 * que escreveu errado.
 */
export function parseAiConversationStyle(value: unknown): AiConversationStyle {
  const style = matchAiConversationStyle(value);
  if (style) return style;
  throw new AppError("Unknown AI conversation style.", {
    statusCode: 400,
    code: UNKNOWN_AI_CONVERSATION_STYLE_CODE,
    details: {
      accepted: [...AI_CONVERSATION_STYLES],
      legacyAliases: Object.keys(LEGACY_AI_CONVERSATION_STYLE_ALIASES),
    },
  });
}

/** Mesma regra de entrada, para quem valida corpo de requisicao com zod. */
export const aiConversationStyleSchema = z
  .unknown()
  // Opcional de proposito: corpo sem estilo nao e corpo invalido, e cai no
  // equilibrado como qualquer outra ausencia de configuracao.
  .optional()
  .transform((value, ctx): AiConversationStyle => {
    const style = matchAiConversationStyle(value);
    if (!style) {
      ctx.addIssue({
        code: "custom",
        message: UNKNOWN_AI_CONVERSATION_STYLE_CODE,
      });
      return z.NEVER;
    }
    return style;
  });

export const aiSettingsSchema = z.object({
  aiEnabled: z.boolean().default(true),
  tone: aiConversationStyleSchema,
});

export type AiTenantSettings = z.infer<typeof aiSettingsSchema>;

export const DEFAULT_AI_SETTINGS: AiTenantSettings = {
  aiEnabled: true,
  tone: DEFAULT_AI_CONVERSATION_STYLE,
};

export function normalizeAiSettings(value: unknown): AiTenantSettings {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    aiEnabled:
      typeof source.aiEnabled === "boolean"
        ? source.aiEnabled
        : DEFAULT_AI_SETTINGS.aiEnabled,
    // Leitura tolerante de proposito: estilo ilegivel nao pode desligar a IA
    // nem derrubar o turno. A recusa acontece na entrada.
    tone: resolveAiConversationStyle(source.tone),
  };
}
