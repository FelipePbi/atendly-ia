import Image from "next/image";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";

const steps = ["Dados básicos", "Identificação", "Persona", "Configurações", "Conectar WhatsApp"];

export function OnboardingShell({
  currentStep,
  title,
  subtitle,
  mobileTitle,
  mobileSubtitle,
  headerAddon,
  tone = "mint",
  children,
}: {
  currentStep: number;
  title: string;
  subtitle: string;
  mobileTitle?: string;
  mobileSubtitle?: string;
  headerAddon?: ReactNode;
  tone?: "mint" | "violet";
  children: ReactNode;
}) {
  const stepNumber = currentStep + 1;

  return (
    <main className="onboarding-page">
      <header className="onboarding-topbar">
        <span className="onboarding-brand">
          <Image src="/brand/atendly-logo-icon.png" alt="" width={32} height={32} priority />
          <span>Atendly</span>
        </span>
        <button className="onboarding-help" type="button" aria-label="Ajuda">
          <span aria-hidden="true">?</span>
          <span className="onboarding-help__label">Ajuda</span>
        </button>
      </header>

      <div className="onboarding-mobile-progress" data-step={stepNumber} aria-hidden="true">
        <div className="onboarding-mobile-progress__track">
          <div className="onboarding-mobile-progress__bar" />
        </div>
      </div>

      <div className="onboarding-body">
        <aside className="onboarding-sidebar" data-step={stepNumber}>
          <Badge tone="violet">Configuração inicial</Badge>
          <h1 className="onboarding-sidebar__title">Vamos preparar seu atendimento.</h1>
          <p className="onboarding-sidebar__copy">
            Cinco passos rápidos para deixar a Atendly pronta para conversar.
          </p>
          <p className="onboarding-sidebar__progress-label">Progresso · {stepNumber * 20}%</p>
          <div className="onboarding-sidebar__progress-track" aria-hidden="true">
            <div className="onboarding-sidebar__progress-bar" />
          </div>
          <ol className="onboarding-sidebar__steps">
            {steps.map((step, index) => {
              const done = index < currentStep;
              const active = index === currentStep;
              return (
                <li
                  className="onboarding-sidebar__step"
                  data-active={active}
                  data-done={done}
                  key={step}
                >
                  <span className="onboarding-sidebar__step-index">{done ? "✓" : index + 1}</span>
                  <span>{step}</span>
                </li>
              );
            })}
          </ol>
          <div className="onboarding-sidebar__tip">
            <strong>✦ Dica da Atendly</strong>
            Você poderá revisar tudo depois em Configurações.
          </div>
        </aside>

        <section className="onboarding-panel" data-tone={tone}>
          <header className="onboarding-panel__header" data-has-addon={Boolean(headerAddon)}>
            <Badge>Etapa {stepNumber} de 5</Badge>
            <h2 className="onboarding-panel__title">
              <span className="responsive-copy--desktop">{title}</span>
              <span className="responsive-copy--mobile">{mobileTitle ?? title}</span>
            </h2>
            <p className="onboarding-panel__subtitle">
              <span className="responsive-copy--desktop">{subtitle}</span>
              <span className="responsive-copy--mobile">{mobileSubtitle ?? subtitle}</span>
            </p>
            {headerAddon}
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
