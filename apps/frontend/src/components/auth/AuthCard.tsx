import Image from "next/image";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";

export function AuthCard({
  mode,
  kicker,
  title,
  subtitle,
  mobileTitle,
  mobileSubtitle,
  storyTitle,
  children,
  footer,
}: {
  mode: "login" | "register";
  kicker: string;
  title: string;
  subtitle: string;
  mobileTitle?: string;
  mobileSubtitle?: string;
  storyTitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className={`auth-page auth-page--${mode}`}>
      <aside className="auth-story" aria-label="Atendly IA">
        <span className="auth-story__swoosh" aria-hidden="true" />
        <div className="auth-story__brand">
          <Image
            className="auth-story__brand-image"
            src="/brand/atendly-logo-icon.png"
            alt=""
            width={32}
            height={32}
            priority
          />
          <span>Atendly</span>
        </div>

        <div className="auth-story__mobile-copy">
          <Badge>{mode === "login" ? "Bem-vindo" : "Nova conta"}</Badge>
          <h1 className="auth-story__mobile-title">
            {mode === "login" ? "Seu atendimento, sempre em movimento." : storyTitle}
          </h1>
        </div>

        <div className="auth-story__desktop-copy">
          <Badge>{mode === "login" ? "Atendimento com IA" : "Comece agora"}</Badge>
          <h1 className="auth-story__desktop-title">{storyTitle}</h1>
          <p className="auth-story__desktop-description">
            Uma assistente que aprende o jeito do seu negócio e responde clientes no WhatsApp com clareza,
            contexto e velocidade.
          </p>
        </div>

        <div className="auth-story__chat" aria-hidden="true">
          <div className="auth-story__chat-header">
            <span className="auth-story__avatar">A</span>
            <span>
              Atendly IA
              <small className="auth-story__online">online agora</small>
            </span>
          </div>
          <p className="auth-story__bubble auth-story__bubble--customer">Oi! Vocês têm horário amanhã?</p>
          <p className="auth-story__bubble auth-story__bubble--assistant">
            Temos sim 😊 Posso te mostrar os melhores horários e já deixar agendado.
          </p>
        </div>

        <div className="auth-story__stats" aria-hidden="true">
          <span className="auth-story__stat">
            <strong>24h</strong>
            de atendimento contínuo
          </span>
          <span className="auth-story__stat">
            <strong>3×</strong>
            mais agilidade nas respostas
          </span>
        </div>
      </aside>

      <section className="auth-card-region">
        <div className="auth-card">
          <Badge className="auth-card__kicker">{kicker}</Badge>
          <h2 className="auth-card__title">
            <span className="auth-card__copy--desktop">{title}</span>
            <span className="auth-card__copy--mobile">{mobileTitle ?? title}</span>
          </h2>
          <p className="auth-card__subtitle">
            <span className="auth-card__copy--desktop">{subtitle}</span>
            <span className="auth-card__copy--mobile">{mobileSubtitle ?? subtitle}</span>
          </p>
          <div className="auth-card__body">{children}</div>
          <div className="auth-card__divider">ou</div>
          <div className="auth-card__footer">{footer}</div>
        </div>
      </section>
    </main>
  );
}
