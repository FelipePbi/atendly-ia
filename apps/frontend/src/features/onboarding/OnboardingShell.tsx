"use client";

import type { FormEvent, ReactNode } from "react";

import { Icon } from "@/shared/icons/Icon";
import { Brand } from "@/shared/ui/Brand";

export function OnboardingShell({
  actions,
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
      <header className="onboarding-topbar">
        <Brand href="/onboarding" />
        <div
          className="step-progress"
          aria-label={`Bloco atual: ${blockLabel}`}
        >
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
        <button className="onboarding-exit" type="button" onClick={onExit}>
          Sair
        </button>
      </header>
      <form className="onboarding-main" onSubmit={onSubmit}>
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
          <div className="onboarding-actions">{actions}</div>
        </div>
      </form>
    </main>
  );
}
