export const onboardingScenarios = {
  "dados-do-negocio": [
    "Vamos começar",
    "Conte um pouco sobre seu negócio",
    "Isso ajuda a Atendly a usar nomes e exemplos mais próximos da sua rotina.",
    "business",
  ],
  "fonte-da-agenda": [
    "Fonte oficial",
    "Onde seus agendamentos serão controlados?",
    "Você terá uma única fonte oficial. Essa escolha evita horários duplicados.",
    "source",
  ],
  "agenda-atendly-metodo": [
    "Escolha um caminho",
    "Como deseja preparar sua agenda?",
    "Você pode cadastrar tudo agora ou copiar dados existentes uma única vez.",
    "method",
  ],
  "agenda-atendly-confirmar": [
    "Sua fonte oficial",
    "A Agenda Atendly cuidará dos seus horários",
    "Serviços, disponibilidade e agendamentos serão gerenciados aqui.",
    "confirm",
  ],
  "servico-nome": [
    "Primeiro serviço",
    "Qual serviço seus clientes mais agendam?",
    "Comece com um. Outros serviços poderão ser adicionados depois.",
    "service-name",
  ],
  "servico-duracao": [
    "Duração",
    "Quanto tempo esse serviço costuma levar?",
    "Esse tempo será usado para reservar o horário correto.",
    "service-duration",
  ],
  "servico-preco": [
    "Preço",
    "Qual é o preço desse serviço?",
    "A Atendly só informará o valor cadastrado. Se variar, use “Sob consulta”.",
    "service-price",
  ],
  "dias-de-atendimento": [
    "Disponibilidade",
    "Em quais dias você atende?",
    "Escolha seus dias habituais. Ajustes específicos poderão ser feitos depois.",
    "days",
  ],
  horarios: [
    "Horário habitual",
    "Qual é seu horário de atendimento?",
    "Use o intervalo mais comum. Pausas e exceções poderão ser ajustadas depois.",
    "hours",
  ],
  "agenda-atendly-pronta": [
    "Agenda configurada",
    "Sua Agenda Atendly está pronta",
    "Serviço e disponibilidade foram salvos. O restante da ativação continua em uma próxima etapa do produto.",
    "ready",
  ],
  "minha-agenda-conectar": [
    "Conectar fonte oficial",
    "Autorize a consulta da sua agenda",
    "A forma exata de autenticação depende da integração disponível.",
    "external-connect",
  ],
  "tom-da-ia": [
    "Atendente virtual",
    "Como a Atendly deve conversar?",
    "Escolha um dos três estilos disponíveis.",
    "tone",
  ],
  whatsapp: [
    "Antes de conectar",
    "Agora vamos colocar sua IA para atender de verdade",
    "Antes de conectar seu número, veja o que muda no seu dia a dia.",
    "whatsapp",
  ],
  "whatsapp-conectar": [
    "Conectar WhatsApp",
    "Ative o atendimento no seu número",
    "No celular, use o código de vinculação. No computador, escaneie o QR Code.",
    "whatsapp-connect",
  ],
  "whatsapp-concluido": [
    "Onboarding concluído",
    "Sua Atendly está configurada.",
    "Conecte seu WhatsApp quando quiser colocar a IA para atender seus clientes.",
    "whatsapp-done",
  ],
} as const;

export type OnboardingScenario = keyof typeof onboardingScenarios;
export function isOnboardingScenario(
  value: string,
): value is OnboardingScenario {
  return value in onboardingScenarios;
}

export const onboardingOrder = Object.keys(
  onboardingScenarios,
) as OnboardingScenario[];
