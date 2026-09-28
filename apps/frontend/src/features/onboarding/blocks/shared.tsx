import { BffHttpError, type Session } from "@/data";
import { Icon } from "@/shared/icons/Icon";

import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";

export type OnboardingStepContext = {
  draft: OnboardingDraft;
  go: (step: OnboardingScenario) => void;
  refresh: () => Promise<unknown>;
  refreshSession: () => Promise<Session | null>;
  router: { replace: (href: string) => void };
  setError: (message: string | null) => void;
};

export type OnboardingStepBody = (
  scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
  // Só o bloco WhatsApp usa isto, para o CTA "Continuar" de whatsapp-conectar
  // saber quando o número já conectou (Goal071/WU-03).
  onWhatsappStatusChange?: (connected: boolean) => void,
) => React.ReactNode;

export type OnboardingStepPersist = (
  scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
) => Promise<void>;

export function Choice({
  copy,
  onClick,
  selected,
  title,
}: {
  copy: string;
  onClick: () => void;
  selected: boolean;
  title: string;
}) {
  return (
    <button
      className={`choice-card${selected ? " is-selected" : ""}`}
      type="button"
      onClick={onClick}
    >
      <span className="choice-check">
        <Icon name="check" />
      </span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </button>
  );
}

export function Summary({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="service-summary">
      {rows.map(([label, value]) => (
        <div className="summary-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function onboardingError(error: unknown): string {
  if (error instanceof BffHttpError && error.status === 409) {
    return "Ainda há itens obrigatórios pendentes. Revise negócio, agenda, serviço, disponibilidade e tom da IA.";
  }
  return "Não foi possível salvar esta etapa. Tente novamente.";
}
