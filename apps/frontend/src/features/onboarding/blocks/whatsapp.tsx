import { WhatsAppConnectionPanel } from "@/features/whatsapp/WhatsAppConnectionPanel";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";
import type { OnboardingStepContext } from "./shared";

/** Os quatro pontos do vault (docs/product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md
 * §"Orientação sobre número pessoal"), explicados antes de oferecer a conexão. */
const PERSONAL_NUMBER_POINTS = [
  "Você pode usar um número de WhatsApp pessoal ou comercial.",
  "A Atendly organiza todas as suas conversas automaticamente.",
  "Você pode desativar a IA para pessoas específicas, como família e amigos.",
  "Quando você responde uma conversa manualmente, a IA sai de cena.",
];

export function whatsappStepBody(
  scenario: OnboardingScenario,
  _draft: OnboardingDraft,
  _setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
) {
  if (scenario === "whatsapp-conectar") return <WhatsAppConnectionPanel />;
  if (scenario === "whatsapp-concluido") return null;
  return (
    <ul className="onboarding-points">
      {PERSONAL_NUMBER_POINTS.map((point) => (
        <li key={point}>
          <Icon name="check" />
          <span>{point}</span>
        </li>
      ))}
    </ul>
  );
}

export async function persistWhatsappStep(
  scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
): Promise<void> {
  if (scenario === "whatsapp") {
    ctx.go("whatsapp-conectar");
    return;
  }
  if (scenario === "whatsapp-conectar") {
    const connection = await getProductServices().whatsapp.get();
    if (connection?.status !== "CONNECTED") {
      ctx.setError("Conclua a vinculação no WhatsApp antes de continuar.");
      return;
    }
    await getProductServices().onboarding.complete();
    await ctx.refreshSession();
    ctx.router.replace("/inicio");
  }
}

/** Ação "Fazer isso depois": conclui o onboarding sem exigir o WhatsApp
 * conectado (docs/product-vault/02-Fluxos/01-Onboarding.md §9-10). A IA
 * permanece inativa até uma conexão real acontecer. */
export async function skipWhatsappStep(
  ctx: OnboardingStepContext,
): Promise<void> {
  await getProductServices().onboarding.complete();
  await ctx.refreshSession();
  ctx.go("whatsapp-concluido");
}
