import type {
  AiConversationStyle,
  AiTenantSettings,
} from "../tenant-config/ai-settings.js";

/**
 * Estilo muda apenas registro, emoji e informalidade do texto enviado.
 * Nunca influencia decisao, tools, quantidade de mensagens ou regra de
 * agenda — essas seguem identicas nos tres estilos.
 */
const STYLE_PROMPT_INSTRUCTIONS: Record<AiConversationStyle, string[]> = {
  PROFESSIONAL: [
    "Estilo: profissional.",
    "- Seja clara, educada, segura e concisa.",
    "- Evite girias e excesso de emojis.",
  ],
  BALANCED: [
    "Estilo: equilibrado.",
    "- Seja simpática, acolhedora, natural e profissional.",
    "- Pode usar emojis com moderacao.",
  ],
  CASUAL: [
    "Estilo: descontraido.",
    "- Seja proxima, calorosa e informal, sem perder o cuidado.",
    "- Pode usar emojis e linguagem coloquial com naturalidade.",
  ],
};

const STYLE_GREETINGS: Record<AiConversationStyle, string> = {
  PROFESSIONAL: "Olá, tudo bem? Como posso te ajudar hoje?",
  BALANCED: "Oii, tudo bem? Como posso te ajudar hoje?",
  CASUAL: "Oii, tudo bem? Como posso te ajudar hoje? 😊",
};

export function buildAiTonePromptSection(settings: AiTenantSettings): string {
  return [
    "CONFIGURACAO DA IA:",
    // Estilo muda registro, emoji e informalidade. Nao muda o que a IA decide,
    // quantas mensagens manda, nem nenhuma regra de agenda.
    ...STYLE_PROMPT_INSTRUCTIONS[settings.tone],
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

/**
 * Unica saudacao generica que a IA manda sem chamar o modelo (primeira
 * mensagem so com cumprimento). O texto varia por estilo; a decisao de
 * mandar a saudacao nao depende do estilo.
 */
export function buildStyleGreeting(style: AiConversationStyle): string {
  return STYLE_GREETINGS[style];
}
