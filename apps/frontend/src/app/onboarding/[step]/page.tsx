import { notFound, redirect } from "next/navigation";

import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import {
  isOnboardingScenario,
  onboardingOrder,
} from "@/features/onboarding/scenarios";

// Rotas que o Goal065/WU-03 substituiu por "servico-nome" (etapa única de
// nome, duração e preço): quem chegar pelo link antigo é levado à etapa que
// a substitui, em vez de 404.
const legacyStepRedirects: Record<string, string> = {
  "servico-duracao": "servico-nome",
  "servico-preco": "servico-nome",
};

export function generateStaticParams() {
  return onboardingOrder.map((step) => ({ step }));
}
export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  const legacyTarget = legacyStepRedirects[step];
  if (legacyTarget) {
    redirect(`/onboarding/${legacyTarget}`);
    return null;
  }
  if (!isOnboardingScenario(step)) notFound();
  return <OnboardingScreen scenario={step} />;
}
