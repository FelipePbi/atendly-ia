/**
 * Exemplos de conversa por segmento do negócio (validação de 2026-10-11).
 * Toda tela que mostra uma conversa de exemplo — boas-vindas, demonstração da
 * IA, estilos da IA, teste de ativação — fala do jeito do segmento escolhido.
 * O serviço citado é sempre o serviço real do negócio quando existe; o
 * `sampleService` daqui só entra quando ainda não há nenhum.
 *
 * "Cabelo" e o genérico mantêm as frases de antes, que o protótipo usa.
 */
export type SegmentExamples = {
  /** Cliente do exemplo, na agenda das boas-vindas. */
  clientName: string;
  /** Serviço típico do segmento, quando o negócio ainda não tem um. */
  sampleService: string;
  /** Saudação do cliente ("Oi!", "Fala!"…). */
  greeting: string;
  /** Primeira mensagem das boas-vindas, antes de qualquer serviço. */
  welcomeAsk: string;
  /** Pergunta de preço: recebe o nome do serviço. */
  askPrice: (service: string) => string;
  /** Aceite da oferta, com o pedido de dia: "Tem segunda à tarde?" etc. */
  accept: (dayAsk: string) => string;
  /** Confirmação final do cliente. */
  confirm: string;
  /** Emoji do segmento no fim das mensagens descontraídas. */
  emoji: string;
};

export const GENERIC_EXAMPLES: SegmentExamples = {
  accept: (dayAsk) => `Quero sim! ${dayAsk}`,
  askPrice: (service) => `Oi! Quanto custa ${service}?`,
  clientName: "Ana Paula",
  confirm: "Pode!",
  emoji: "😊",
  greeting: "Oi!",
  sampleService: "Corte",
  welcomeAsk: "Oi! Tem horário na sexta?",
};

const BY_SEGMENT: Record<string, SegmentExamples> = {
  Barbearia: {
    accept: (dayAsk) => `Fechou! ${dayAsk}`,
    askPrice: (service) => `Fala! Quanto tá ${lowerFirst(service)}?`,
    clientName: "Rafael",
    confirm: "Pode marcar!",
    emoji: "💈",
    greeting: "Fala!",
    sampleService: "Corte + barba",
    welcomeAsk: "Fala! Tem horário pra cortar na sexta?",
  },
  Cabelo: GENERIC_EXAMPLES,
  Estética: {
    accept: (dayAsk) => `Quero sim! ${dayAsk}`,
    askPrice: (service) => `Oi! Qual o valor de ${lowerFirst(service)}?`,
    clientName: "Mariana",
    confirm: "Pode confirmar!",
    emoji: "✨",
    greeting: "Oi!",
    sampleService: "Limpeza de pele",
    welcomeAsk: "Oi! Tem horário pra limpeza de pele na sexta?",
  },
  "Massagem e terapias": {
    accept: (dayAsk) => `Quero sim, por favor. ${dayAsk}`,
    askPrice: (service) => `Olá! Quanto é ${lowerFirst(service)}?`,
    clientName: "Beatriz",
    confirm: "Pode sim, obrigada!",
    emoji: "🌿",
    greeting: "Olá!",
    sampleService: "Massagem relaxante",
    welcomeAsk: "Olá! Tem horário pra massagem na sexta?",
  },
  "Personal trainer": {
    accept: (dayAsk) => `Bora! ${dayAsk}`,
    askPrice: (service) => `Opa! Quanto é ${lowerFirst(service)}?`,
    clientName: "Lucas",
    confirm: "Fechado!",
    emoji: "💪",
    greeting: "Opa!",
    sampleService: "Treino personalizado",
    welcomeAsk: "Opa! Tem horário pra treinar na sexta?",
  },
  "Sobrancelhas e cílios": {
    accept: (dayAsk) => `Quero sim! ${dayAsk}`,
    askPrice: (service) => `Oi! Qual o valor de ${lowerFirst(service)}?`,
    clientName: "Carla",
    confirm: "Pode!",
    emoji: "✨",
    greeting: "Oi!",
    sampleService: "Design de sobrancelha",
    welcomeAsk: "Oi! Tem horário pra sobrancelha na sexta?",
  },
  Unhas: {
    accept: (dayAsk) => `Quero! ${dayAsk}`,
    askPrice: (service) => `Oi! Quanto fica ${lowerFirst(service)}?`,
    clientName: "Juliana",
    confirm: "Pode sim!",
    emoji: "💅",
    greeting: "Oi!",
    sampleService: "Manicure e pedicure",
    welcomeAsk: "Oi! Tem horário pra fazer as unhas na sexta?",
  },
};

// Texto livre ("Outro") cai no segmento cujas palavras ele contém.
const KEYWORDS: Array<[RegExp, string]> = [
  [/barb/u, "Barbearia"],
  [/unha|manicure|pedicure|nail/u, "Unhas"],
  [/sobrancelha|cilio|lash|micropig/u, "Sobrancelhas e cílios"],
  [/estetic|pele|depila/u, "Estética"],
  [/massag|terap|quiropra|reiki/u, "Massagem e terapias"],
  [/personal|treino|academia|pilates|funcional/u, "Personal trainer"],
  [/cabel|salao|cabeleire|escova|corte/u, "Cabelo"],
];

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function segmentExamples(
  category: string | null | undefined,
): SegmentExamples {
  const text = category?.trim() ?? "";
  if (!text) return GENERIC_EXAMPLES;
  const exact = Object.keys(BY_SEGMENT).find(
    (segment) => normalized(segment) === normalized(text),
  );
  if (exact) return BY_SEGMENT[exact];
  const plain = normalized(text);
  const match = KEYWORDS.find(([pattern]) => pattern.test(plain));
  return match ? BY_SEGMENT[match[1]] : GENERIC_EXAMPLES;
}

/**
 * Pedido de horário das boas-vindas: com um serviço real, ele é citado; sem
 * nenhum, vale a frase típica do segmento.
 */
export function welcomeAskFor(
  examples: SegmentExamples,
  serviceName: string | null | undefined,
): string {
  const service = serviceName?.trim();
  if (!service) return examples.welcomeAsk;
  return `${examples.greeting} Tem horário pra ${lowerFirst(service)} na sexta?`;
}

/** "Corte feminino" → "corte feminino"; siglas e o resto do nome ficam. */
export function lowerFirst(text: string): string {
  if (text.length > 1 && text[1] === text[1].toLocaleUpperCase("pt-BR")) {
    return text;
  }
  return text.charAt(0).toLocaleLowerCase("pt-BR") + text.slice(1);
}

/**
 * Frase de exemplo de cada estilo da IA (Configurações › IA). Sem serviço e
 * no genérico, as frases de sempre.
 */
export function toneExamples(
  examples: SegmentExamples,
  serviceName: string | null | undefined,
): Record<"BALANCED" | "CASUAL" | "PROFESSIONAL", string> {
  const service = serviceName?.trim();
  if (!service && examples === GENERIC_EXAMPLES) {
    return {
      BALANCED: "“Oi! Quer marcar um horário? 😊”",
      CASUAL: "“Oiii! Bora marcar? 😄”",
      PROFESSIONAL: "“Olá! Gostaria de agendar um horário?”",
    };
  }
  const what = lowerFirst(service || examples.sampleService);
  return {
    BALANCED: `“Oi! Quer marcar ${what}? 😊”`,
    CASUAL: `“Oiii! Bora marcar ${what}? ${examples.emoji}”`,
    PROFESSIONAL: `“Olá! Gostaria de agendar ${what}?”`,
  };
}
