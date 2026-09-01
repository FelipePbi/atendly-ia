import { z } from "zod";

export const aiSettingsSchema = z.object({
  aiEnabled: z.boolean().default(true),
  tone: z
    .enum(["PROFESSIONAL_OBJECTIVE", "LIGHT_CLOSE"])
    .default("LIGHT_CLOSE"),
});

export type AiTenantSettings = z.infer<typeof aiSettingsSchema>;

export const DEFAULT_AI_SETTINGS: AiTenantSettings = {
  aiEnabled: true,
  tone: "LIGHT_CLOSE",
};

export function normalizeAiSettings(value: unknown): AiTenantSettings {
  const parsed = aiSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_AI_SETTINGS;
}

export function buildAiTonePromptSection(settings: AiTenantSettings): string {
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
    "CONFIGURACAO DA IA:",
    ...toneInstructions,
    "- Responda como extensao direta da profissional ou equipe do negocio.",
    "- Nao invente identidade, nome ou sexo para a IA.",
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
