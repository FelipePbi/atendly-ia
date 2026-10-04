"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";

import { Icon } from "@/shared/icons/Icon";
import { Brand, BrandMark } from "@/shared/ui/Brand";

import { chapterProgress } from "./blocks";
import { type OnboardingScenario, onboardingScenarios } from "./scenarios";

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
  description?: string;
  error?: string | null;
  eyebrow: string;
  onExit: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  scenario: OnboardingScenario;
  title: string;
}) {
  return (
    <main className="onboarding-layout" data-step={scenario}>
      <OnboardingSidebar scenario={scenario} />
      <div className="onboarding-panel">
        <form className="onboarding-column" noValidate onSubmit={onSubmit}>
          <OnboardingTop
            back={back}
            eyebrow={eyebrow}
            onExit={onExit}
            scenario={scenario}
          />
          <div className="onboarding-content">
            <header className="onboarding-heading">
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </header>
            <div className="onboarding-step-body">{body}</div>
            {error && (
              <div className="onboarding-note is-important" role="alert">
                <Icon name="alert" />
                <span>{error}</span>
              </div>
            )}
          </div>
          {actions && (
            <div
              className={`onboarding-actions${actionsStacked ? " is-stacked" : ""}`}
            >
              {actions}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

/** Moldura do onboarding sem o formulário da etapa (Goal066): a etapa
 * `importacao` monta as telas do módulo de importação, que têm os próprios
 * formulários, título e ações. Topo, sidebar e painel são os mesmos das outras
 * etapas; a navegação de volta é a do módulo de importação, sem chevron. */
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
    <main className="onboarding-layout" data-step={scenario}>
      <OnboardingSidebar scenario={scenario} />
      <div className="onboarding-panel">
        <div className="onboarding-column">
          <OnboardingTop
            eyebrow={onboardingScenarios[scenario][0]}
            onExit={onExit}
            scenario={scenario}
          />
          <div className="onboarding-content is-frame">{children}</div>
        </div>
      </div>
    </main>
  );
}

/** Topo da coluna: chevron, barra de progresso e "Sair" (só abaixo de
 * 1024 px; de 1024 px em diante o "Sair" vai para o rodapé da sidebar) e o
 * eyebrow do capítulo. */
function OnboardingTop({
  back,
  eyebrow,
  onExit,
  scenario,
}: {
  back?: OnboardingBack;
  eyebrow: string;
  onExit: () => void;
  scenario: OnboardingScenario;
}) {
  return (
    <div className="onboarding-top">
      <div className="onboarding-top-row">
        <OnboardingBackLink back={back} />
        {scenario === "boas-vindas" && (
          <span aria-hidden="true" className="onboarding-welcome-brand">
            <BrandMark />
            <span>Avenly</span>
          </span>
        )}
        <OnboardingProgress scenario={scenario} />
        <button
          className="btn btn-secondary onboarding-exit"
          type="button"
          onClick={onExit}
        >
          <Icon name="logout" />
          <span>Sair</span>
        </button>
      </div>
      <p className="onboarding-eyebrow">{eyebrow}</p>
    </div>
  );
}

function OnboardingBackLink({ back }: { back?: OnboardingBack }) {
  if (!back) return null;
  if ("disabled" in back) {
    // Sem href e com tabIndex=-1: nem alcançável por Tab nem navegável.
    return (
      <a
        aria-disabled="true"
        aria-label="Voltar"
        className="onboarding-back-link is-disabled"
        role="link"
        tabIndex={-1}
      >
        <Icon name="chevron-left" />
      </a>
    );
  }
  return (
    <Link
      aria-label="Voltar"
      className="onboarding-back-link"
      href={back.href}
    >
      <Icon name="chevron-left" />
    </Link>
  );
}

/** Barra de quatro segmentos (abaixo de 1024 px): o concluído é cheio e o
 * atual tem preenchimento parcial pela posição no capítulo. O preenchimento é
 * decorativo; o estado vem de `aria-current` e do nome "concluído". Na
 * Boas-vindas a configuração não começou e não há barra. */
function OnboardingProgress({ scenario }: { scenario: OnboardingScenario }) {
  if (scenario === "boas-vindas") return null;
  const chapters = chapterProgress(scenario);
  return (
    <div
      aria-label="Progresso da configuração inicial"
      className="step-progress"
      role="group"
    >
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
          >
            {chapter.status === "current" && (
              <span
                aria-hidden="true"
                className="step-segment-fill"
                style={{ width: `${Math.round(chapter.fill * 100)}%` }}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Sidebar "Configuração inicial" (de 1024 px em diante): marca e quatro
 * capítulos numerados; o concluído troca o número por ✓ e ganha "concluído" no
 * nome. */
function OnboardingSidebar({ scenario }: { scenario: OnboardingScenario }) {
  const chapters = chapterProgress(scenario);
  return (
    <nav aria-label="Configuração inicial" className="onboarding-sidebar">
      <Brand href="/onboarding" />
      <div className="onboarding-stepper">
        <p className="onboarding-stepper-title" aria-hidden="true">
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
              className={`onboarding-stepper-item is-${chapter.status}`}
              key={chapter.id}
            >
              <span aria-hidden="true" className="onboarding-stepper-marker">
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
      </div>
    </nav>
  );
}
