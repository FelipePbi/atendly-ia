import type { ReactNode } from "react";

import { IgnoredContactsPanel } from "@/features/whatsapp/IgnoredContactsPanel";
import {
  WhatsAppConnectionPanel,
  type WhatsAppConsentPhase,
} from "@/features/whatsapp/WhatsAppConnectionPanel";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";
import {
  activationTestStepBody,
  persistActivationTestStep,
} from "./activation-test";
import type { OnboardingStepContext } from "./shared";

/** Cenários do teste real, todos dentro do bloco "WhatsApp". */
const ACTIVATION_TEST_SCENARIOS = new Set<OnboardingScenario>([
  "teste-real",
  "teste-real-progresso",
  "teste-real-interferencia",
  "teste-real-falha",
  "teste-real-sucesso",
]);

export function isActivationTestScenario(
  scenario: OnboardingScenario,
): boolean {
  return ACTIVATION_TEST_SCENARIOS.has(scenario);
}

/** As quatro promessas do protótipo 4.1, que cobrem os pontos do vault
 * (docs/product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md
 * §"Orientação sobre número pessoal" e docs/product-vault/01-Regras/05-WhatsApp.md
 * §"Um número por negócio"), explicadas antes de oferecer a conexão. Cada uma
 * tem o ícone do quadro (traços do protótipo, fora do sprite) e a
 * palavra-chave em destaque. */
const PERSONAL_NUMBER_POINTS: Array<{
  icon: ReactNode;
  key: string;
  lead: ReactNode;
  tail?: string;
}> = [
  {
    icon: (
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    ),
    key: "phone",
    lead: (
      <>
        Use seu WhatsApp <strong>pessoal ou profissional</strong>.
      </>
    ),
    tail: "Só um número por negócio.",
  },
  {
    icon: (
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.2c-.4.3-.8 0-.8-.5z" />
    ),
    key: "chat",
    lead: (
      <>
        Continue usando o WhatsApp <strong>normalmente</strong>.
      </>
    ),
    tail: "Suas conversas ficam organizadas aqui.",
  },
  {
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    key: "user",
    lead: (
      <>
        Quando <strong>você responde</strong>, a IA sai de cena naquela
        conversa.
      </>
    ),
  },
  {
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M6.5 6.5l11 11" />
      </>
    ),
    key: "ban",
    lead: (
      <>
        Você escolhe <strong>quem a IA nunca responde</strong>:
      </>
    ),
    tail: "família, amigos, quem quiser.",
  },
];

export function whatsappStepBody(
  scenario: OnboardingScenario,
  _draft: OnboardingDraft,
  _setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
  onWhatsappStatusChange?: (connected: boolean) => void,
  _onDemoDone?: (done: boolean) => void,
  consentPhase?: WhatsAppConsentPhase,
) {
  if (scenario === "whatsapp-conectar") {
    return (
      <WhatsAppConnectionPanel
        consentPhase={consentPhase}
        onStatusChange={onWhatsappStatusChange}
      />
    );
  }
  if (scenario === "whatsapp-concluido") return null;
  if (scenario === "contatos-ignorados") return <IgnoredContactsPanel />;
  if (isActivationTestScenario(scenario)) {
    return activationTestStepBody(scenario);
  }
  return (
    <ul className="onboarding-points">
      {PERSONAL_NUMBER_POINTS.map((point) => (
        <li key={point.key}>
          <span aria-hidden="true" className="onboarding-promise-icon">
            <svg
              fill="none"
              height="20"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
              viewBox="0 0 24 24"
              width="20"
            >
              {point.icon}
            </svg>
          </span>
          <span>
            <span>{point.lead}</span>
            {point.tail && <> <span>{point.tail}</span></>}
          </span>
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
    ctx.go("contatos-ignorados");
    return;
  }
  if (scenario === "contatos-ignorados") {
    // O onboarding só é concluído no teste real que termina bem (Goal063):
    // esta etapa é opcional e não afirma nada sobre ativação.
    ctx.go("teste-real");
    return;
  }
  if (isActivationTestScenario(scenario)) {
    await persistActivationTestStep(scenario, ctx);
  }
}

/** Ação "Fazer isso depois": leva à tela de conclusão sem exigir o WhatsApp
 * conectado (docs/product-vault/02-Fluxos/01-Onboarding.md §9-10). O
 * onboarding só é concluído no CTA de `whatsapp-concluido` (Goal063): até
 * lá, a pessoa ainda pode voltar e conectar. */
export async function skipWhatsappStep(
  ctx: OnboardingStepContext,
): Promise<void> {
  ctx.go("whatsapp-concluido");
}

/**
 * CTA de `whatsapp-concluido`: só aqui o onboarding é concluído sem
 * WhatsApp. A IA permanece inativa até uma conexão real acontecer.
 */
export async function completeWithoutWhatsapp(
  ctx: OnboardingStepContext,
): Promise<void> {
  await getProductServices().onboarding.complete();
  await ctx.refreshSession();
  ctx.router.replace("/inicio");
}

/**
 * Pular contatos ignorados: etapa opcional, não bloqueia a conclusão (vault
 * `02-Ativacao-e-Teste-do-WhatsApp.md` §"Contatos ignorados"). Nenhuma
 * marcação é gravada ao pular. O onboarding só é concluído no teste real que
 * termina bem (Goal063).
 */
export async function skipIgnoredContactsStep(
  ctx: OnboardingStepContext,
): Promise<void> {
  ctx.go("teste-real");
}
