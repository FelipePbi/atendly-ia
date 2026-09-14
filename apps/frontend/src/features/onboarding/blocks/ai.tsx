import { getProductServices } from "@/shared/runtime/ProductRuntime";

import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";
import { Choice, type OnboardingStepContext } from "./shared";

export function aiStepBody(
  _scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
) {
  return (
    <div className="choice-grid">
      <Choice
        selected={draft.tone === "PROFESSIONAL"}
        title="Profissional"
        copy="Direta, clara e cordial."
        onClick={() =>
          setDraft((value) => ({ ...value, tone: "PROFESSIONAL" }))
        }
      />
      <Choice
        selected={draft.tone === "BALANCED"}
        title="Equilibrada"
        copy="Cordial com um toque natural."
        onClick={() => setDraft((value) => ({ ...value, tone: "BALANCED" }))}
      />
      <Choice
        selected={draft.tone === "CASUAL"}
        title="Descontraída"
        copy="Natural, acolhedora e simples."
        onClick={() => setDraft((value) => ({ ...value, tone: "CASUAL" }))}
      />
    </div>
  );
}

export async function persistAiStep(
  _scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
): Promise<void> {
  if (!ctx.draft.tone) {
    ctx.setError("Escolha um dos três estilos disponíveis.");
    return;
  }
  await getProductServices().onboarding.update({
    ai: { tone: ctx.draft.tone },
  });
  await ctx.refresh();
  ctx.go("whatsapp");
}
