import type { ActivationTestRun } from "@/data";
import {
  type ActivationTestPanel,
  ActivationTestPanelBody,
  activationTestPanelFor,
  activationTestStartAction,
  readFinishedActivationTest,
  startActivationTest,
} from "@/features/activation-test/ActivationTestPanels";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { type OnboardingScenario, onboardingScenarios } from "../scenarios";
import type { OnboardingStepContext } from "./shared";

/**
 * Etapa do onboarding de cada tela do teste. As telas, os textos e a regra
 * de estado são do módulo compartilhado (`features/activation-test`, Goal063
 * §3); este bloco só dá a cada uma o seu endereço no fluxo.
 */
const scenarioByPanel: Record<ActivationTestPanel, OnboardingScenario> = {
  intro: "teste-real",
  progress: "teste-real-progresso",
  paused: "teste-real-interferencia",
  failed: "teste-real-falha",
  succeeded: "teste-real-sucesso",
};

function panelForScenario(scenario: OnboardingScenario): ActivationTestPanel {
  if (scenario === "teste-real-progresso") return "progress";
  if (scenario === "teste-real-interferencia") return "paused";
  if (scenario === "teste-real-falha") return "failed";
  if (scenario === "teste-real-sucesso") return "succeeded";
  return "intro";
}

/** Tela para a qual cada estado da execução leva. Um estado, uma tela. */
export function activationTestScenarioFor(
  run: ActivationTestRun,
): OnboardingScenario {
  return scenarioByPanel[activationTestPanelFor(run)];
}

export function activationTestStepBody(scenario: OnboardingScenario) {
  return (
    <ActivationTestPanelBody
      onboarding
      panel={panelForScenario(scenario)}
      title={onboardingScenarios[scenario][1]}
    />
  );
}

/**
 * Avançar em cada tela do teste.
 *
 * `teste-real` inicia a execução; as outras leem o estado corrente e vão
 * para a tela dele. Nenhuma delas decide o estado por conta própria. Só
 * `teste-real-sucesso` conclui o onboarding: é o único caminho em que o
 * vault manda a IA ligar (Goal063).
 */
export async function persistActivationTestStep(
  scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
): Promise<void> {
  const panel = panelForScenario(scenario);
  if (panel === "intro" || panel === "paused" || panel === "failed") {
    const refusal = await startActivationTest(
      activationTestStartAction[panel].mode,
    );
    if (refusal) {
      ctx.setError(refusal);
      return;
    }
    ctx.go("teste-real-progresso");
    return;
  }

  if (scenario === "teste-real-sucesso") {
    await getProductServices().onboarding.complete();
    await ctx.refreshSession();
    ctx.router.replace("/inicio");
    return;
  }

  // `teste-real-progresso`: avançar é ler o estado real e ir para a tela dele.
  const outcome = await readFinishedActivationTest();
  if ("error" in outcome) {
    ctx.setError(outcome.error);
    return;
  }
  ctx.go(scenarioByPanel[outcome.panel]);
}

/**
 * Pular o teste: o vault permite concluir o onboarding sem WhatsApp, e por
 * consequência sem teste. A IA **não** é ativada — quem ativa é o teste que
 * termina bem, e nenhuma tela afirma o contrário.
 */
export async function skipActivationTestStep(
  ctx: OnboardingStepContext,
): Promise<void> {
  await getProductServices().onboarding.complete();
  await ctx.refreshSession();
  ctx.router.replace("/inicio");
}
