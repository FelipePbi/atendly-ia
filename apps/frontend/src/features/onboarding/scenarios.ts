export const onboardingScenarios = {
  "boas-vindas": [
    "Vamos começar",
    "Configure sua Avenly em poucos passos.",
    "Sua IA atende seus clientes pelo WhatsApp e marca horários direto na sua agenda.",
    "welcome",
  ],
  "segmento-e-nome": [
    "Seu negócio",
    "Vamos começar pelo seu negócio",
    "Isso ajuda a IA a usar nomes e exemplos mais próximos da sua rotina.",
    "business-segment",
  ],
  modalidade: [
    "Seu negócio",
    "Onde você atende?",
    "Pode escolher mais de uma opção.",
    "business-modality",
  ],
  endereco: [
    "Seu negócio",
    "Qual é o endereço do seu espaço?",
    "Usado para localizar seu atendimento presencial.",
    "business-address",
  ],
  "sistema-atual": [
    "Sua agenda",
    "Você já usa algum sistema para organizar seus clientes e agendamentos?",
    "Isso ajuda a saber se já existem dados para trazer para a Avenly.",
    "current-system",
  ],
  "quando-importar": [
    "Sua agenda",
    "Quer importar agora?",
    "A importação acontece uma única vez e leva alguns minutos. Depois dela, a Avenly passa a ser sua agenda oficial.",
    "when-import",
  ],
  // A etapa monta as telas do módulo de importação (Goal066), com o título
  // de cada uma: este título não aparece na tela, só no progresso e no
  // bloco.
  importacao: [
    "Sua agenda",
    "Importar do Minha Agenda",
    "A mesma importação de Mais › Importação, dentro do onboarding.",
    "import",
  ],
  "servico-nome": [
    "Sua agenda",
    "Qual é o seu primeiro serviço?",
    "Comece pelo mais comum. Os outros você adiciona depois.",
    "service-name",
  ],
  "servicos-adicionais": [
    "Sua agenda",
    "Seus serviços",
    "Adicione o que seus clientes mais pedem. Você pode ajustar tudo depois.",
    "additional-services",
  ],
  "dias-de-atendimento": [
    "Sua agenda",
    "Em quais dias você atende?",
    "",
    "days",
  ],
  horarios: [
    "Sua agenda",
    "Qual é seu horário de atendimento?",
    "Pausas e bloqueios você configura depois.",
    "hours",
  ],
  "agenda-avenly-pronta": [
    "Agenda configurada",
    "Sua Agenda Avenly está pronta",
    "Serviço e disponibilidade foram salvos.",
    "ready",
  ],
  "demonstracao-da-ia": [
    "Sua IA",
    "Veja sua IA atendendo",
    "Uma conversa de exemplo com os seus serviços e horários. Nada é marcado de verdade.",
    "ai-demo",
  ],
  "tom-da-ia": [
    "Sua IA",
    "Gostou da forma como a IA conversou?",
    "Escolha o jeito de falar. Você pode mudar depois.",
    "tone",
  ],
  whatsapp: [
    "WhatsApp",
    "Agora vamos colocar sua IA para atender de verdade.",
    "",
    "whatsapp",
  ],
  "whatsapp-conectar": [
    "WhatsApp",
    "Ative o atendimento no seu número",
    "No celular, use o código de vinculação. No computador, escaneie o QR Code.",
    "whatsapp-connect",
  ],
  "contatos-ignorados": [
    "Antes de testar",
    "Quer impedir que a IA responda algumas pessoas?",
    "Escolha conversas já existentes ou informe um número manualmente. A IA nunca responde a quem está nesta lista.",
    "ignored-contacts",
  ],
  // Telas do teste real, na ordem do vault
  // (docs/product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md §"Teste
  // real" em diante). Cada estado da execucao tem tela propria: o vault
  // descreve cinco momentos distintos, e juntar dois deles obrigaria a tela a
  // interpretar o mesmo valor de duas formas.
  "teste-real": [
    "WhatsApp",
    "Vamos fazer um teste real",
    "Um número da Avenly vai enviar uma mensagem no seu WhatsApp simulando um cliente. Você só observa — a IA faz o atendimento sozinha.",
    "activation-test",
  ],
  "teste-real-progresso": [
    "WhatsApp",
    "Teste em andamento",
    "Acompanhe pelo WhatsApp se quiser. Não responda à conversa de teste.",
    "activation-test-progress",
  ],
  "teste-real-interferencia": [
    "Teste pausado",
    "O teste foi pausado porque você respondeu",
    "Nesta conversa você só precisa observar: quem responde é a IA. Reinicie para tentar de novo.",
    "activation-test-paused",
  ],
  "teste-real-falha": [
    "WhatsApp",
    "O teste não foi concluído",
    "Sua IA ainda não está ativa. Nada foi enviado aos seus clientes.",
    "activation-test-failed",
  ],
  "teste-real-sucesso": [
    "Teste concluído",
    "Tudo pronto!",
    "Sua IA conversou com o cliente de teste. Veja abaixo o estado real da ativação.",
    "activation-test-succeeded",
  ],
  "whatsapp-concluido": [
    "Onboarding concluído",
    "Sua Avenly está configurada.",
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
