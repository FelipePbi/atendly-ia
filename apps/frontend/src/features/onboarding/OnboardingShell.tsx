"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";

import { Icon } from "@/shared/icons/Icon";
import { Brand } from "@/shared/ui/Brand";

import { chapterProgress } from "./blocks";
import type { OnboardingScenario } from "./scenarios";

/** Voltar no topo da etapa: `href` navega; `disabled` é o chevron cinza da
 * Boas-vindas (sem destino e fora da ordem de Tab); ausente, não há chevron. */
export type OnboardingBack = { href: string } | { disabled: true };

export function OnboardingShell({
  actions,
  actionsStacked = false,
  back,
  body,
  description,
  error,
  eyebrow,
  onExit,
  onSubmit,
  scenario,
  title,
}: {
  actions: ReactNode;
  // Ações empilhadas em largura total no celular (introdução do WhatsApp).
  actionsStacked?: boolean;
  back?: OnboardingBack;
  body: ReactNode;
  description: string;
  error?: string | null;
  eyebrow: string;
  onExit: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  scenario: OnboardingScenario;
  title: string;
}) {
  return (
    <main className="onboarding-shell">
      <OnboardingTopbar onExit={onExit} scenario={scenario} />
      <div className="onboarding-body">
        <OnboardingRail scenario={scenario} />
        <form className="onboarding-main" noValidate onSubmit={onSubmit}>
          <OnboardingBackLink back={back} />
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
            {actions && (
              <div
                className={`onboarding-actions${actionsStacked ? " is-stacked" : ""}`}
              >
                {actions}
              </div>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

/** Moldura do onboarding sem o formulário da etapa (Goal066): a etapa
 * `importacao` monta as telas do módulo de importação, que têm os próprios
 * formulários, título e ações. Só a barra superior (marca, progresso,
 * "Sair") e o trilho são os mesmos das outras etapas; a navegação de volta
 * é a do módulo de importação, sem chevron. */
export function OnboardingFrame({
  children,
  onExit,
  scenario,
}: {
  children: ReactNode;
  onExit: () => void;
  scenario: OnboardingScenario;
}) {
  return (
    <main className="onboarding-shell">
      <OnboardingTopbar onExit={onExit} scenario={scenario} />
      <div className="onboarding-body">
        <OnboardingRail scenario={scenario} />
        <div className="onboarding-main">
          <div className="onboarding-content">{children}</div>
        </div>
      </div>
    </main>
  );
}

function OnboardingBackLink({ back }: { back?: OnboardingBack }) {
  if (!back) return null;
  if ("disabled" in back) {
    // Sem href e com tabIndex=-1: nem alcançável por Tab nem navegável.
    return (
      <div className="onboarding-back">
        <a
          aria-disabled="true"
          aria-label="Voltar"
          className="onboarding-back-link is-disabled"
          role="link"
          tabIndex={-1}
        >
          <Icon name="chevron-left" />
        </a>
      </div>
    );
  }
  return (
    <div className="onboarding-back">
      <Link
        aria-label="Voltar"
        className="onboarding-back-link"
        href={back.href}
      >
        <Icon name="chevron-left" />
      </Link>
    </div>
  );
}

/** Trilho "Configuração inicial" (a partir de 768 px): quatro capítulos
 * numerados; o concluído troca o número por ✓ e ganha "concluído" no nome. */
function OnboardingRail({ scenario }: { scenario: OnboardingScenario }) {
  const chapters = chapterProgress(scenario);
  return (
    <nav aria-label="Configuração inicial" className="onboarding-rail">
      <p className="onboarding-rail-title" aria-hidden="true">
        Configuração inicial
      </p>
      <ol>
        {chapters.map((chapter, index) => (
          <li
            aria-current={chapter.status === "current" ? "step" : undefined}
            aria-label={
              chapter.status === "done"
                ? `${chapter.label}, concluído`
                : chapter.label
            }
            className={`onboarding-rail-item is-${chapter.status}`}
            key={chapter.id}
          >
            <span aria-hidden="true" className="onboarding-rail-marker">
              {chapter.status === "done" ? (
                <Icon name="check" />
              ) : (
                index + 1
              )}
            </span>
            <span aria-hidden="true">{chapter.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function OnboardingTopbar({
  onExit,
  scenario,
}: {
  onExit: () => void;
  scenario: OnboardingScenario;
}) {
  const chapters = chapterProgress(scenario);
  const current = chapters.find((chapter) => chapter.status === "current");
  return (
    <header className="onboarding-topbar">
      <Brand href="/onboarding" />
      <div
        aria-label="Progresso da configuração inicial"
        className="step-progress"
        role="group"
      >
        <div className="step-progress-row">
          <span>{current?.label}</span>
        </div>
        <ol className="step-segments">
          {chapters.map((chapter) => (
            <li
              aria-current={chapter.status === "current" ? "step" : undefined}
              aria-label={
                chapter.status === "done"
                  ? `${chapter.label}, concluído`
                  : chapter.label
              }
              className={`step-segment is-${chapter.status}`}
              key={chapter.id}
            />
          ))}
        </ol>
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
