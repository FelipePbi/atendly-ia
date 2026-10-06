import { type ReactNode, useEffect } from "react";

import { OnboardingIgnoredContacts } from "@/features/whatsapp/IgnoredContactsPanel";
import {
  type WhatsAppConnectedContext,
  WhatsAppConnectionPanel,
  type WhatsAppConsentPhase,
} from "@/features/whatsapp/WhatsAppConnectionPanel";
import { Icon } from "@/shared/icons/Icon";
import { formatBrazilianPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import type { OnboardingDraft } from "../OnboardingRuntime";
import { type OnboardingScenario, onboardingScenarios } from "../scenarios";
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

/** Conclusão sem WhatsApp (quadro 4.10): a tela só é alcançada sem número
 * conectado, então a pílula diz "IA inativa" sempre e não lê o status. */
function WhatsappConclusion({ text, title }: { text: string; title: string }) {
  return (
    <div className="onboarding-completion is-inactive">
      <div aria-hidden="true" className="completion-art">
        <span className="completion-disc">
          <span className="completion-disc-mark" />
        </span>
        <span className="completion-badge">
          <svg
            fill="none"
            height="18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            viewBox="0 0 24 24"
            width="18"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      </div>
      <div className="completion-text">
        <h1>{title}</h1>
        <p>{text}</p>
        <span className="completion-pill is-inactive">
          <span aria-hidden="true" className="completion-pill-dot" />
          IA inativa até conectar
        </span>
      </div>
    </div>
  );
}

/** Número conectado (quadro 4.4): o disco com o selo ✓, o telefone na linha do
 * nome e a pílula "Conectado". O contrato não traz nome nem foto do perfil, por
 * isso o disco leva o ícone de pessoa no lugar das iniciais. O título e o texto
 * vêm da moldura da etapa; o rodapé tem "Sim, continuar" e o link de número
 * errado, que abre a folha de desconexão do painel (nada desconecta sem
 * confirmar). */
function WhatsappConnectedBody({
  context,
  onWrongNumberChange,
}: {
  context: WhatsAppConnectedContext;
  onWrongNumberChange?: (open: (() => void) | null) => void;
}) {
  const { error, openDisconnectDialog } = context;
  useEffect(() => {
    onWrongNumberChange?.(openDisconnectDialog);
    return () => onWrongNumberChange?.(null);
  }, [onWrongNumberChange, openDisconnectDialog]);

  const phone = context.connection.phoneNumber
    ? formatBrazilianPhone(context.connection.phoneNumber, "plus")
    : null;
  return (
    <div className="whatsapp-connected">
      <div className="whatsapp-connected-identity">
        <div aria-hidden="true" className="whatsapp-connected-art">
          <span className="whatsapp-connected-disc">
            <Icon name="user" />
          </span>
          <span className="whatsapp-connected-seal">
            <svg
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
              width="16"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>
        <div className="whatsapp-connected-lines">
          {phone && <span className="whatsapp-connected-phone">{phone}</span>}
          <span className="whatsapp-connected-pill">
            <span aria-hidden="true" className="whatsapp-connected-pill-dot" />
            Conectado
          </span>
        </div>
      </div>
      {error && (
        <p className="field-help" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function whatsappStepBody(
  scenario: OnboardingScenario,
  _draft: OnboardingDraft,
  _setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
  onWhatsappStatusChange?: (connected: boolean) => void,
  _onDemoDone?: (done: boolean) => void,
  consentPhase?: WhatsAppConsentPhase,
  onIgnoredCountChange?: (count: number) => void,
) {
  if (scenario === "whatsapp-conectar") {
    return (
      <WhatsAppConnectionPanel
        consentPhase={consentPhase}
        renderConnected={(context) => (
          <WhatsappConnectedBody
            context={context}
            onWrongNumberChange={consentPhase?.onWrongNumberChange}
          />
        )}
        onStatusChange={onWhatsappStatusChange}
      />
    );
  }
  if (scenario === "whatsapp-concluido") {
    return (
      <WhatsappConclusion
        text={onboardingScenarios[scenario][2]}
        title={onboardingScenarios[scenario][1]}
      />
    );
  }
  if (scenario === "contatos-ignorados") {
    return <OnboardingIgnoredContacts onCountChange={onIgnoredCountChange} />;
  }
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
