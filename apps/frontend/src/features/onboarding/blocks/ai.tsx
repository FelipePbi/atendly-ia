import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";
import { Choice, type OnboardingStepContext } from "./shared";

const WEEKDAY_LABELS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function demoPriceLabel(draft: OnboardingDraft): string {
  if (draft.servicePriceType === "ON_REQUEST") return "sob consulta";
  const value = Number(draft.servicePrice.replace(",", "."));
  if (!Number.isFinite(value)) return "sob consulta";
  return currencyFormatter.format(value);
}

function demoDayLabel(draft: OnboardingDraft): string {
  const [firstDay] = [...draft.days].sort((a, b) => a - b);
  return WEEKDAY_LABELS[firstDay ?? 1] ?? WEEKDAY_LABELS[1];
}

/**
 * Demonstração automática do bloco Sua IA, antes do estilo (vault
 * `01-Onboarding.md` §7): simulação local, sem porta de envio e sem escrita
 * em Appointment/Customer/Conversation/Message — só o serviço, o preço e o
 * horário já reais do negócio, lidos do draft carregado do onboarding.
 */
function AiDemoStepBody({ draft }: { draft: OnboardingDraft }) {
  if (!draft.serviceOperational || !draft.hoursValid) {
    const missing: string[] = [];
    if (!draft.serviceOperational) {
      missing.push("um serviço ativo com duração definida");
    }
    if (!draft.hoursValid) {
      missing.push("um horário de atendimento configurado");
    }
    return (
      <div className="onboarding-note is-important">
        <Icon name="info" />
        <span>
          Configure {missing.join(" e ")} para ver a demonstração da IA.
        </span>
      </div>
    );
  }

  const price = demoPriceLabel(draft);
  const day = demoDayLabel(draft);

  return (
    <>
      <div className="onboarding-note">
        <Icon name="spark" />
        <span>
          Demonstração simulada — nenhuma mensagem é enviada e nenhum
          agendamento é criado de verdade.
        </span>
      </div>
      <div className="onboarding-demo-chat" aria-label="Demonstração simulada da IA">
        <div className="message-group">
          <span className="message-sender">Cliente</span>
          <div className="message-bubble">
            Oi! Quanto custa o {draft.serviceName}?
          </div>
        </div>
        <div className="message-group is-outgoing is-ai">
          <span className="message-sender">Sua IA</span>
          <div className="message-bubble">
            O {draft.serviceName} custa {price}.
          </div>
          <span className="message-meta">Serviço reconhecido</span>
        </div>
        <div className="message-group">
          <span className="message-sender">Cliente</span>
          <div className="message-bubble">Tem horário {day}?</div>
        </div>
        <div className="message-group is-outgoing is-ai">
          <span className="message-sender">Sua IA</span>
          <div className="message-bubble">
            Tenho sim! Horário disponível às {draft.startTime}.
          </div>
          <span className="message-meta">Agenda consultada</span>
        </div>
        <div className="message-group">
          <span className="message-sender">Cliente</span>
          <div className="message-bubble">Pode agendar pra mim?</div>
        </div>
        <div className="message-group is-outgoing is-ai">
          <span className="message-sender">Sua IA</span>
          <div className="message-bubble">
            Prontinho! Agendamento simulado para {day} às {draft.startTime}.
          </div>
          <span className="message-meta">Agendamento simulado</span>
        </div>
      </div>
    </>
  );
}

export function aiStepBody(
  scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
) {
  if (scenario === "demonstracao-da-ia") return <AiDemoStepBody draft={draft} />;
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
  scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
): Promise<void> {
  // Só navegação: a demonstração é simulada em memória, sem porta de envio
  // nem escrita em Appointment/Customer/Conversation/Message.
  if (scenario === "demonstracao-da-ia") {
    ctx.go("tom-da-ia");
    return;
  }
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
