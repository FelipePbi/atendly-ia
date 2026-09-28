"use client";

import type { FormEvent, ReactNode } from "react";

import { Icon } from "@/shared/icons/Icon";
import { Brand } from "@/shared/ui/Brand";

export function OnboardingShell({
  actions,
  actionsStacked = false,
  blockLabel,
  body,
  description,
  error,
  eyebrow,
  onExit,
  onSubmit,
  progressPercent,
  title,
}: {
  actions: ReactNode;
  // Ações empilhadas em largura total no celular (introdução do WhatsApp).
  actionsStacked?: boolean;
  blockLabel: string;
  body: ReactNode;
  description: string;
  error?: string | null;
  eyebrow: string;
  onExit: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  progressPercent: number;
  title: string;
}) {
  return (
    <main className="onboarding-shell">
      <OnboardingTopbar
        blockLabel={blockLabel}
        onExit={onExit}
        progressPercent={progressPercent}
      />
      <form className="onboarding-main" noValidate onSubmit={onSubmit}>
        <div className="onboarding-content">
          <header className="onboarding-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          <div className="onboarding-step-body">{body}</div>
          {error && (
            <div className="onboarding-note is-important" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          )}
          <div
            className={`onboarding-actions${actionsStacked ? " is-stacked" : ""}`}
          >
            {actions}
          </div>
        </div>
      </form>
    </main>
  );
}

/** Moldura do onboarding sem o formulário da etapa (Goal066): a etapa
 * `importacao` monta as telas do módulo de importação, que têm os próprios
 * formulários, título e ações. Só a barra superior (marca, progresso,
 * "Sair") é a mesma das outras etapas. */
export function OnboardingFrame({
  blockLabel,
  children,
  onExit,
  progressPercent,
}: {
  blockLabel: string;
  children: ReactNode;
  onExit: () => void;
  progressPercent: number;
}) {
  return (
    <main className="onboarding-shell">
      <OnboardingTopbar
        blockLabel={blockLabel}
        onExit={onExit}
        progressPercent={progressPercent}
      />
      <div className="onboarding-main">
        <div className="onboarding-content">{children}</div>
      </div>
    </main>
  );
}

function OnboardingTopbar({
  blockLabel,
  onExit,
  progressPercent,
}: {
  blockLabel: string;
  onExit: () => void;
  progressPercent: number;
}) {
  return (
    <header className="onboarding-topbar">
      <Brand href="/onboarding" />
      <div className="step-progress" aria-label={`Bloco atual: ${blockLabel}`}>
        <div className="step-progress-row">
          <span>{blockLabel}</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-bar"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
      <button
        className="btn btn-secondary onboarding-exit"
        type="button"
        onClick={onExit}
      >
        <Icon name="logout" />
        <span>Sair</span>
      </button>
    </header>
  );
}
