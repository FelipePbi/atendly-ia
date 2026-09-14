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
    ai: ["tom-da-ia"],
    business: ["dados-do-negocio"],
    schedule: [
      "fonte-da-agenda",
      "agenda-atendly-confirmar",
      "agenda-atendly-metodo",
      "servico-nome",
      "servico-duracao",
      "servico-preco",
      "dias-de-atendimento",
      "horarios",
      "agenda-atendly-pronta",
      "minha-agenda-conectar",
    ],
    whatsapp: ["whatsapp", "whatsapp-conectar", "whatsapp-concluido"],
  };

/** Ordem real de navegação do produto. `minha-agenda-conectar` é um desvio a
 * partir de `fonte-da-agenda`, e `whatsapp-concluido` é um desvio a partir de
 * `whatsapp` (destino de "Fazer isso depois") — nenhum dos dois é um passo
 * sequencial, por isso ficam fora. */
export const onboardingFlow: OnboardingScenario[] = [
  "dados-do-negocio",
  "fonte-da-agenda",
  "agenda-atendly-confirmar",
  "agenda-atendly-metodo",
  "servico-nome",
  "servico-duracao",
  "servico-preco",
  "dias-de-atendimento",
  "horarios",
  "agenda-atendly-pronta",
  "tom-da-ia",
  "whatsapp",
  "whatsapp-conectar",
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
  const index = onboardingFlow.indexOf(scenario);
  const position =
    index >= 0 ? index : onboardingFlow.indexOf("fonte-da-agenda");
  return Math.round(((position + 1) / onboardingFlow.length) * 100);
}
