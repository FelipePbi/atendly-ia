import { useEffect, useState } from "react";

import type { Conversation } from "@/data";
import { WhatsAppConnectionPanel } from "@/features/whatsapp/WhatsAppConnectionPanel";
import { Icon } from "@/shared/icons/Icon";
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

/** Os quatro pontos do vault (docs/product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md
 * §"Orientação sobre número pessoal"), explicados antes de oferecer a conexão. */
const PERSONAL_NUMBER_POINTS = [
  "Você pode usar um número de WhatsApp pessoal ou comercial.",
  "A Atendly organiza todas as suas conversas automaticamente.",
  "Você pode desativar a IA para pessoas específicas, como família e amigos.",
  "Quando você responde uma conversa manualmente, a IA sai de cena.",
];

/**
 * Contatos ignorados, etapa opcional entre conectar e testar (vault
 * `02-Ativacao-e-Teste-do-WhatsApp.md` §"Contatos ignorados"). Marcar uma
 * conversa existente reusa `PUT /v1/conversations/:id/ignore`, o mesmo
 * caminho que a IA já respeita; marcar por telefone usa a rota nova que cria
 * o contato quando ele ainda não existe. Cada confirmação em tela só aparece
 * depois da resposta da API — nada é afirmado como ignorado sem a marcação
 * gravada.
 */
function IgnoredContactsStepBody() {
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  );
  const [listError, setListError] = useState<string | null>(null);
  const [markedConversationIds, setMarkedConversationIds] = useState<
    Set<string>
  >(new Set());
  const [pendingConversationId, setPendingConversationId] = useState<
    string | null
  >(null);
  const [phone, setPhone] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [markedPhones, setMarkedPhones] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    getProductServices()
      .conversations.list({ ignored: false, limit: 20 })
      .then((list) => {
        if (active) setConversations(list);
      })
      .catch(() => {
        if (active) setListError("Não foi possível carregar suas conversas.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function markConversation(id: string) {
    setPendingConversationId(id);
    setListError(null);
    try {
      await getProductServices().conversations.setIgnored(id, true);
      setMarkedConversationIds((current) => new Set(current).add(id));
    } catch {
      setListError("Não foi possível marcar este contato. Tente novamente.");
    } finally {
      setPendingConversationId(null);
    }
  }

  async function addPhone() {
    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneError("Informe um número de telefone.");
      return;
    }
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const contact = await getProductServices().conversations.ignoreByPhone(
        trimmed,
        true,
      );
      setMarkedPhones((current) => [...current, contact.externalContactId]);
      setPhone("");
    } catch {
      setPhoneError("Não foi possível marcar este número. Tente novamente.");
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <div className="onboarding-form">
      <div className="field">
        <span className="label">Conversas já existentes</span>
        {conversations === null && !listError && (
          <p className="field-help">Carregando conversas...</p>
        )}
        {listError && (
          <div className="onboarding-note is-important" role="alert">
            <Icon name="alert" />
            <span>{listError}</span>
          </div>
        )}
        {conversations !== null && conversations.length === 0 && (
          <p className="field-help">
            Nenhuma conversa disponível ainda para escolher.
          </p>
        )}
        {conversations !== null && conversations.length > 0 && (
          <ul className="onboarding-points">
            {conversations.map((conversation) => {
              const marked = markedConversationIds.has(conversation.id);
              return (
                <li key={conversation.id}>
                  <Icon name={marked ? "check" : "user"} />
                  <span>
                    {conversation.customerName ?? conversation.externalContactId}
                  </span>
                  <button
                    className="btn btn-secondary"
                    disabled={marked || pendingConversationId === conversation.id}
                    type="button"
                    onClick={() => void markConversation(conversation.id)}
                  >
                    {marked
                      ? "Ignorado"
                      : pendingConversationId === conversation.id
                        ? "Marcando..."
                        : "Ignorar"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="field">
        <span className="label">Informar um número manualmente</span>
        <div className="choice-grid">
          <input
            className="input"
            placeholder="+55 11 99999-0000"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void addPhone();
            }}
          />
          <button
            className="btn btn-secondary"
            disabled={phoneBusy}
            type="button"
            onClick={() => void addPhone()}
          >
            {phoneBusy ? "Adicionando..." : "Adicionar"}
          </button>
        </div>
        {phoneError && (
          <div className="onboarding-note is-important" role="alert">
            <Icon name="alert" />
            <span>{phoneError}</span>
          </div>
        )}
        {markedPhones.length > 0 && (
          <ul className="onboarding-points">
            {markedPhones.map((externalContactId) => (
              <li key={externalContactId}>
                <Icon name="check" />
                <span>{externalContactId} ignorado</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function whatsappStepBody(
  scenario: OnboardingScenario,
  _draft: OnboardingDraft,
  _setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
) {
  if (scenario === "whatsapp-conectar") return <WhatsAppConnectionPanel />;
  if (scenario === "whatsapp-concluido") return null;
  if (scenario === "contatos-ignorados") return <IgnoredContactsStepBody />;
  if (isActivationTestScenario(scenario)) {
    return activationTestStepBody(scenario);
  }
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
