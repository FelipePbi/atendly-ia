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
      "sistema-atual",
      "quando-importar",
      "importacao",
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
 * `progressPercent` tratam esse desvio explicitamente. `quando-importar`
 * segue a mesma regra: só existe para quem responde "Sim, quero importar"
 * em `sistema-atual` (Goal066), então usa a posição de `sistema-atual`; e
 * `importacao` também, porque só existe depois de "Importar agora".
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
  "sistema-atual",
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

/** Ordem dos capítulos no trilho "Configuração inicial" (protótipo). */
export const onboardingChapterOrder: readonly OnboardingBlockId[] = [
  "business",
  "schedule",
  "ai",
  "whatsapp",
];

export type OnboardingChapterStatus = "done" | "current" | "upcoming";

/** Passos do capítulo no caminho do produto. `endereco` entra logo depois de
 * `modalidade`: é um passo que a pessoa vê, só não é sequencial para todos. */
function chapterSteps(block: OnboardingBlockId): OnboardingScenario[] {
  const steps = onboardingFlow.filter(
    (step) => step !== "boas-vindas" && blockForScenario(step) === block,
  );
  const modalidade = steps.indexOf("modalidade");
  if (modalidade >= 0) steps.splice(modalidade + 1, 0, "endereco");
  return steps;
}

/** Quanto do capítulo atual já foi percorrido: a posição do passo sobre o
 * total, com meio passo de folga para a barra nunca fechar antes do capítulo
 * acabar. Os desvios usam o passo que sempre os antecede, como
 * `progressPercent`. */
export function chapterFraction(scenario: OnboardingScenario): number {
  if (scenario === "boas-vindas") return 0;
  if (scenario === "whatsapp-concluido" || scenario === "teste-real-sucesso") {
    return 1;
  }
  if (
    scenario === "teste-real-falha" ||
    scenario === "teste-real-interferencia"
  ) {
    return chapterFraction("teste-real-progresso");
  }
  if (scenario === "quando-importar" || scenario === "importacao") {
    return chapterFraction("sistema-atual");
  }
  const steps = chapterSteps(blockForScenario(scenario));
  return (steps.indexOf(scenario) + 1) / (steps.length + 0.5);
}

export function chapterProgress(scenario: OnboardingScenario): Array<{
  fill: number;
  id: OnboardingBlockId;
  label: string;
  status: OnboardingChapterStatus;
}> {
  // Na Boas-vindas a configuração ainda não começou: nenhum capítulo é o atual.
  const currentIndex =
    scenario === "boas-vindas"
      ? -1
      : onboardingChapterOrder.indexOf(blockForScenario(scenario));
  return onboardingChapterOrder.map((id, index) => {
    const status: OnboardingChapterStatus =
      index < currentIndex
        ? "done"
        : index === currentIndex
          ? "current"
          : "upcoming";
    return {
      fill:
        status === "done" ? 1 : status === "current" ? chapterFraction(scenario) : 0,
      id,
      label: onboardingBlockLabels[id],
      status,
    };
  });
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
  if (scenario === "quando-importar" || scenario === "importacao") {
    return progressPercent("sistema-atual");
  }
  const index = onboardingFlow.indexOf(scenario);
  const position =
    index >= 0 ? index : onboardingFlow.indexOf("sistema-atual");
  return Math.round(((position + 1) / onboardingFlow.length) * 100);
}
