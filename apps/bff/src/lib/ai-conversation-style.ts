import { z } from "zod";

import { AppError } from "./errors.js";

/**
 * Estilo de conversa da IA, vocabulario canonico do produto (Goal011, mesmos
 * nomes fixados no WU-01 da IA). Estilo influencia registro, emoji e
 * informalidade — nunca decisao operacional.
 */
export const AI_CONVERSATION_STYLES = [
  "PROFESSIONAL",
  "BALANCED",
  "CASUAL",
] as const;

export type AiConversationStyle = (typeof AI_CONVERSATION_STYLES)[number];

/** Projecao padrao enviada a IA quando o negocio ainda nao escolheu estilo. */
export const DEFAULT_AI_CONVERSATION_STYLE: AiConversationStyle = "BALANCED";

/**
 * Os dois valores antigos continuam aceitos na entrada como alias declarado.
 * Mesmo mapa do backfill da migration
 * `20260913140100_goal011_bff_ai_style_backfill`. Sai no Goal024.
 */
export const LEGACY_AI_CONVERSATION_STYLE_ALIASES: Readonly<
  Record<string, AiConversationStyle>
> = {
  PROFESSIONAL_OBJECTIVE: "PROFESSIONAL",
  LIGHT_CLOSE: "BALANCED",
};

/** Erro proprio do estilo desconhecido: nao se confunde com validacao generica. */
export const UNKNOWN_AI_CONVERSATION_STYLE_CODE =
  "AI_CONVERSATION_STYLE_UNKNOWN" as const;

function matchAiConversationStyle(value: unknown): AiConversationStyle | null {
  if (typeof value !== "string") return null;
  if ((AI_CONVERSATION_STYLES as readonly string[]).includes(value)) {
    return value as AiConversationStyle;
  }
  return LEGACY_AI_CONVERSATION_STYLE_ALIASES[value] ?? null;
}

/**
 * Leitura tolerante do que ja esta gravado: `null`/`undefined` (negocio ainda
 * nao escolheu) e qualquer valor que ninguem reconhece caem no equilibrado.
 * Usada para a projecao enviada a IA, nunca para decidir o que persistir.
 */
export function resolveAiConversationStyle(
  value: unknown,
): AiConversationStyle {
  return matchAiConversationStyle(value) ?? DEFAULT_AI_CONVERSATION_STYLE;
}

/**
 * Normaliza um valor ja gravado no banco para o vocabulario novo, preservando
 * `null` como "ainda nao escolhido" — distinto de "escolheu o equilibrado".
 * Usada para nunca responder o vocabulario legado em nenhum contrato publico.
 */
export function normalizeStoredAiConversationStyle(
  value: unknown,
): AiConversationStyle | null {
  if (value === null || value === undefined) return null;
  return matchAiConversationStyle(value);
}

/**
 * Entrada: os tres valores e os dois legados passam normalizados, qualquer
 * outro e recusado com erro proprio. Quem escreve configuracao precisa saber
 * que escreveu errado.
 */
export function parseAiConversationStyle(value: unknown): AiConversationStyle {
  const style = matchAiConversationStyle(value);
  if (style) return style;
  throw new AppError(
    "AI_CONVERSATION_STYLE_UNKNOWN",
    "Unknown AI conversation style.",
    400,
    {
      accepted: [...AI_CONVERSATION_STYLES],
      legacyAliases: Object.keys(LEGACY_AI_CONVERSATION_STYLE_ALIASES),
    },
  );
}

/** Mesma regra de entrada, para quem valida corpo de requisicao com zod. */
export const aiConversationStyleSchema = z
  .string()
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

/**
 * `parseBody`/`z.safeParse` genericos nao distinguem "estilo desconhecido" de
 * qualquer outro corpo invalido. Quem usa `aiConversationStyleSchema` num body
 * schema mais amplo chama isto para devolver o erro proprio quando for o caso.
 */
export function throwIfUnknownAiConversationStyle(
  error: z.ZodError,
): void {
  const unknownStyle = error.issues.some(
    (issue) => issue.message === UNKNOWN_AI_CONVERSATION_STYLE_CODE,
  );
  if (unknownStyle) {
    throw new AppError(
      "AI_CONVERSATION_STYLE_UNKNOWN",
      "Unknown AI conversation style.",
      400,
      {
        accepted: [...AI_CONVERSATION_STYLES],
        legacyAliases: Object.keys(LEGACY_AI_CONVERSATION_STYLE_ALIASES),
      },
    );
  }
}

/** Corpo com estilo: valida e devolve o erro proprio antes do generico. */
export function parseBodyWithAiConversationStyle<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throwIfUnknownAiConversationStyle(parsed.error);
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid request body.",
      400,
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}
