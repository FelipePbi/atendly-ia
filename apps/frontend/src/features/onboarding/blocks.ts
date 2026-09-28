import type { OnboardingScenario } from "./scenarios";

export type OnboardingBlockId = "ai" | "business" | "schedule" | "whatsapp";

export const onboardingBlockLabels: Record<OnboardingBlockId, string> = {
  ai: "Sua IA",
  business: "Seu negócio",
  schedule: "Sua agenda",
  whatsapp: "WhatsApp",
};

const blockScenarios: Record<OnboardingBlockId, readonly OnboardingScenario[]> =
  {
    ai: ["demonstracao-da-ia", "tom-da-ia"],
    business: ["boas-vindas", "segmento-e-nome", "modalidade", "endereco"],
    schedule: [
      "fonte-da-agenda",
      "agenda-atendly-confirmar",
      "agenda-atendly-metodo",
      "servico-nome",
      "servicos-adicionais",
      "dias-de-atendimento",
      "horarios",
      "agenda-atendly-pronta",
    ],
    whatsapp: [
      "whatsapp",
      "whatsapp-conectar",
      "contatos-ignorados",
      "teste-real",
      "teste-real-progresso",
      "teste-real-interferencia",
      "teste-real-falha",
      "teste-real-sucesso",
      "whatsapp-concluido",
    ],
  };

/** Ordem real de navegação do produto. `whatsapp-concluido` é um desvio a
 * partir de `whatsapp` (destino de "Fazer isso depois") — não é um passo
 * sequencial, por isso fica fora. `demonstracao-da-ia` (antes do estilo) e
 * `contatos-ignorados` (entre conectar e testar, opcional mas sequencial)
 * são passos reais do caminho principal.
 *
 * `endereco` também fica fora: só existe quando "Local próprio" é escolhido
 * em `modalidade` (vault §"Modalidade"), então não é um passo sequencial do
 * caminho principal — `blockForScenario`, `OnboardingScreen` (Voltar) e
 * `progressPercent` tratam esse desvio explicitamente.
 *
 * Do teste real, só `teste-real` e `teste-real-progresso` são sequenciais: as
 * outras três telas são **estados da execução**, alcançadas a partir do
 * progresso quando o servidor diz que a execução pausou, falhou ou terminou
 * bem — nunca por avançar um passo. Colocá-las na sequência faria a barra de
 * progresso prometer telas que a maioria dos negócios nunca vê. */
export const onboardingFlow: OnboardingScenario[] = [
  "boas-vindas",
  "segmento-e-nome",
  "modalidade",
  "fonte-da-agenda",
  "agenda-atendly-confirmar",
  "agenda-atendly-metodo",
  "servico-nome",
  "servicos-adicionais",
  "dias-de-atendimento",
  "horarios",
  "agenda-atendly-pronta",
  "demonstracao-da-ia",
  "tom-da-ia",
  "whatsapp",
  "whatsapp-conectar",
  "contatos-ignorados",
  "teste-real",
  "teste-real-progresso",
];

export function blockForScenario(
  scenario: OnboardingScenario,
): OnboardingBlockId {
  const entry = (
    Object.entries(blockScenarios) as Array<
      [OnboardingBlockId, readonly OnboardingScenario[]]
    >
  ).find(([, scenarios]) => scenarios.includes(scenario));
  if (!entry) throw new Error(`Cenário sem bloco definido: ${scenario}`);
  return entry[0];
}

export function progressPercent(scenario: OnboardingScenario): number {
  if (scenario === "whatsapp-concluido") return 100;
  // Estados terminais do teste real: o fluxo acabou, bem ou mal, e a barra
  // não volta atrás. `teste-real-interferencia` fica no ponto do progresso,
  // porque a execução continua sendo aquela.
  if (scenario === "teste-real-sucesso") return 100;
  if (scenario === "teste-real-falha" || scenario === "teste-real-interferencia") {
    return progressPercent("teste-real-progresso");
  }
  // Desvio condicional: usa a posição do passo real que sempre o antecede.
  if (scenario === "endereco") return progressPercent("modalidade");
  const index = onboardingFlow.indexOf(scenario);
  const position =
    index >= 0 ? index : onboardingFlow.indexOf("fonte-da-agenda");
  return Math.round(((position + 1) / onboardingFlow.length) * 100);
}
