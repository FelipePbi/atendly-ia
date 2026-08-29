import { z } from "zod";

export const virtualAttendantSettingsSchema = z.object({
  aiEnabled: z.boolean().optional().default(true),
  tone: z
    .enum(["PROFESSIONAL_OBJECTIVE", "LIGHT_CLOSE"])
    .optional()
    .default("LIGHT_CLOSE"),
});

export type VirtualAttendantSettingsDTO = z.infer<
  typeof virtualAttendantSettingsSchema
>;

export const DEFAULT_VIRTUAL_ATTENDANT_SETTINGS: VirtualAttendantSettingsDTO = {
  aiEnabled: true,
  tone: "LIGHT_CLOSE",
};

export function normalizeVirtualAttendantSettings(
  value: unknown,
): VirtualAttendantSettingsDTO {
  const parsed = virtualAttendantSettingsSchema.safeParse(value);
  if (parsed.success && hasExplicitTone(value)) return parsed.data;

  // Compatibilidade temporária com o payload legado do BFF. Apenas converte
  // os dois tons permitidos; identidade, sexo e persona customizada são ignorados.
  if (isRecord(value)) {
    return {
      aiEnabled: typeof value.aiEnabled === "boolean" ? value.aiEnabled : true,
      tone:
        value.personaType === "CORPORATE"
          ? "PROFESSIONAL_OBJECTIVE"
          : "LIGHT_CLOSE",
    };
  }

  return DEFAULT_VIRTUAL_ATTENDANT_SETTINGS;
}

export function buildVirtualAttendantPromptSection(
  settings: VirtualAttendantSettingsDTO,
): string {
  const toneInstructions =
    settings.tone === "PROFESSIONAL_OBJECTIVE"
      ? [
          "Tom: Profissional e objetiva.",
          "- Seja clara, educada, segura e concisa.",
          "- Evite girias e excesso de emojis.",
        ]
      : [
          "Tom: Leve e proxima.",
          "- Seja simpática, acolhedora, natural e profissional.",
          "- Pode usar emojis com moderacao.",
        ];

  return [
    "CONFIGURACAO DA ATENDENTE VIRTUAL:",
    ...toneInstructions,
    "- Responda como extensao direta da profissional ou equipe do negocio.",
    "- Nao invente identidade, nome ou sexo para a atendente virtual.",
    "",
    "REGRAS DE NATURALIDADE:",
    "- Varie saudacoes e evite repetir sempre a mesma abertura.",
    "- Use o nome da cliente quando disponivel, sem exagerar.",
    "- Se a cliente apenas cumprimentou, acolha e pergunte como pode ajudar; nao ofereca agendamento imediatamente.",
    "- Conduza ao agendamento de forma gradual quando fizer sentido.",
    "- Faca uma pergunta principal por vez quando a cliente estiver indecisa.",
    "- Seja objetiva quando a cliente ja sabe o que quer.",
    "- Nao prometa nada que dependa da profissional.",
    "- Confirme informacoes antes de criar agendamento.",
  ].join("\n");
}

function hasExplicitTone(value: unknown): boolean {
  return isRecord(value) && typeof value.tone === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
