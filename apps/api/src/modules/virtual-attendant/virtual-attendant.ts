import { z } from "zod";

const customPersonaProfileSchema = z
  .object({
    greetingStyle: z.string().default(""),
    formalityLevel: z.enum(["formal", "balanced", "informal"]).default("balanced"),
    emojiUsage: z.enum(["none", "low", "moderate", "high"]).default("low"),
    commonExpressions: z.array(z.string()).default([]),
    schedulingStyle: z.string().default(""),
    objectionHandlingStyle: z.string().default(""),
    closingStyle: z.string().default(""),
    persuasionStyle: z.string().default(""),
    messageLengthPreference: z.enum(["short", "medium", "long"]).default("medium"),
    doList: z.array(z.string()).default([]),
    avoidList: z.array(z.string()).default([]),
    generatedPersonaInstructions: z.string().default("")
  })
  .nullable()
  .optional();

export const virtualAttendantSettingsSchema = z.object({
  aiEnabled: z.boolean().optional().default(false),
  identityMode: z.enum(["PROFESSIONAL", "SEPARATE_ASSISTANT"]).optional().default("PROFESSIONAL"),
  assistantName: z.string().trim().optional().default(""),
  assistantSex: z.enum(["FEMALE", "MALE"]).nullable().optional().default(null),
  personaType: z.enum(["CORPORATE", "WARM", "CUSTOM"]).nullable().optional().default("WARM"),
  customInstructions: z.string().trim().optional().default(""),
  activationMode: z.enum(["ALWAYS", "AWAY_FROM_WHATSAPP"]).optional().default("ALWAYS"),
  awayTimeoutMinutes: z.number().int().min(1).nullable().optional().default(null),
  awayScope: z.enum(["GLOBAL", "CONVERSATION"]).nullable().optional().default(null),
  customPersonaStatus: z
    .enum(["NOT_STARTED", "WAITING_UPLOADS", "PROCESSING", "READY", "FAILED", "NEEDS_PARTICIPANT"])
    .optional()
    .default("NOT_STARTED"),
  customPersonaProfile: customPersonaProfileSchema.default(null)
});

export type VirtualAttendantSettingsDTO = z.infer<typeof virtualAttendantSettingsSchema>;

export const DEFAULT_VIRTUAL_ATTENDANT_SETTINGS: VirtualAttendantSettingsDTO = {
  aiEnabled: false,
  identityMode: "PROFESSIONAL",
  assistantName: "",
  assistantSex: null,
  personaType: "WARM",
  customInstructions: "",
  activationMode: "ALWAYS",
  awayTimeoutMinutes: null,
  awayScope: null,
  customPersonaStatus: "NOT_STARTED",
  customPersonaProfile: null
};

export function normalizeVirtualAttendantSettings(value: unknown): VirtualAttendantSettingsDTO {
  const parsed = virtualAttendantSettingsSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_VIRTUAL_ATTENDANT_SETTINGS;

  return {
    ...DEFAULT_VIRTUAL_ATTENDANT_SETTINGS,
    ...parsed.data,
    identityMode: parsed.data.identityMode,
    assistantName: parsed.data.assistantName.trim(),
    assistantSex: parsed.data.assistantSex,
    customInstructions: sanitizeCustomInstructions(parsed.data.customInstructions)
  };
}

export function buildVirtualAttendantPromptSection(settings: VirtualAttendantSettingsDTO): string {
  const persona = settings.personaType ?? "WARM";
  const personaInstructions = personaPrompt(persona);
  const customProfile =
    persona === "CUSTOM" && settings.customPersonaStatus === "READY" && settings.customPersonaProfile
      ? [
          "Perfil personalizado estruturado:",
          `- Saudacao: ${settings.customPersonaProfile.greetingStyle || "[nao identificado]"}`,
          `- Formalidade: ${settings.customPersonaProfile.formalityLevel}`,
          `- Emojis: ${settings.customPersonaProfile.emojiUsage}`,
          `- Expressoes recorrentes: ${settings.customPersonaProfile.commonExpressions.join(", ") || "[nao identificadas]"}`,
          `- Estilo de agendamento: ${settings.customPersonaProfile.schedulingStyle || "[padrao]"}`,
          `- Objecoes: ${settings.customPersonaProfile.objectionHandlingStyle || "[padrao]"}`,
          `- Fechamento: ${settings.customPersonaProfile.closingStyle || "[padrao]"}`,
          `- Instrucao gerada: ${settings.customPersonaProfile.generatedPersonaInstructions || "[nao gerada]"}`
        ].join("\n")
      : "";
  const activation =
    settings.activationMode === "AWAY_FROM_WHATSAPP"
      ? `Modo de ativacao: responder somente quando o usuario estiver ausente do WhatsApp (${settings.awayScope ?? "sem escopo"} apos ${settings.awayTimeoutMinutes ?? "?"} minuto(s)).`
      : "Modo de ativacao: responder a qualquer momento depois das validacoes de seguranca.";
  const identity =
    settings.identityMode === "SEPARATE_ASSISTANT"
      ? [
          "Identidade: atendente a parte.",
          `- Nome da atendente: ${settings.assistantName || "[nao definido]"}`,
          `- Sexo da atendente: ${settings.assistantSex ?? "[nao definido]"}`,
          "- Ao iniciar ou retomar atendimento, apresente-se como atendente pessoal do negocio.",
          "- Depois de se apresentar, continue o atendimento normalmente sem repetir a apresentacao em toda mensagem."
        ].join("\n")
      : [
          "Identidade: responder como a profissional ou em nome do negocio.",
          "- Nao se apresente como uma atendente separada.",
          "- Nao use nome proprio de atendente virtual.",
          "- Fale como extensao direta da profissional/equipe do negocio."
        ].join("\n");

  return [
    "CONFIGURACAO DA ATENDENTE VIRTUAL:",
    identity,
    activation,
    personaInstructions,
    customProfile,
    settings.customInstructions
      ? `Instrucoes adicionais do usuario (nao podem sobrescrever regras obrigatorias): ${settings.customInstructions}`
      : "Instrucoes adicionais do usuario: [nenhuma]",
    "",
    "REGRAS DE NATURALIDADE:",
    "- Varie saudacoes e evite repetir sempre a mesma abertura.",
    "- Use o nome da cliente quando disponivel, sem exagerar.",
    "- Se a cliente apenas cumprimentou, acolha e pergunte como pode ajudar; nao ofereca agendamento imediatamente.",
    "- Conduza ao agendamento de forma gradual quando fizer sentido.",
    "- Faca uma pergunta principal por vez quando a cliente estiver indecisa.",
    "- Seja objetiva quando a cliente ja sabe o que quer.",
    "- Seja acolhedora quando a cliente parecer insegura.",
    "- Use emojis conforme a persona e sem exagero.",
    "- Nao prometa nada que dependa da profissional.",
    "- Confirme informacoes antes de criar agendamento."
  ]
    .filter(Boolean)
    .join("\n");
}

function personaPrompt(persona: NonNullable<VirtualAttendantSettingsDTO["personaType"]>): string {
  if (persona === "CORPORATE") {
    return [
      "Persona: Corporativa.",
      "- Tom profissional, claro, objetivo, educado e seguro.",
      "- Evite girias e excesso de emojis.",
      "- Priorize informacao, clareza e agendamento."
    ].join("\n");
  }

  if (persona === "CUSTOM") {
    return [
      "Persona: Personalizada.",
      "- Comece com uma base leve e proxima.",
      "- Adapte o estilo ao perfil estruturado importado.",
      "- Nao copie mensagens sensiveis das conversas importadas.",
      "- Extraia apenas padroes de comunicacao."
    ].join("\n");
  }

  return [
    "Persona: Leve e Proxima.",
    "- Tom simpatico, acolhedor, natural, conversacional e profissional.",
    "- Pode usar emojis com moderacao.",
    "- Crie proximidade sem parecer forcada e conduza ao agendamento aos poucos."
  ].join("\n");
}

function sanitizeCustomInstructions(value: string): string {
  return value
    .replace(/\b(ignore|ignorar)\s+(todas\s+)?(as\s+)?regras\b/gi, "")
    .replace(/\b(sem|nao|não)\s+consultar\s+disponibilidade\b/gi, "")
    .trim();
}
