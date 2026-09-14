"use client";

import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

import { Icon, type IconName } from "@/shared/icons/Icon";

export function Stepper({ step }: { step: number }) {
  return (
    <ol className="migration-stepper" aria-label="Progresso da migração">
      {[
        ["Preparar", 1],
        ["Revisar", 2],
        ["Realizar corte", 3],
      ].map(([label, number]) => (
        <li
          className={clsx(
            Number(number) < step && "is-complete",
            number === step && "is-current",
          )}
          aria-current={number === step ? "step" : undefined}
          key={label}
        >
          <span className="migration-step-index">
            {Number(number) < step ? (
              <Icon name="check" />
            ) : (
              String(number).padStart(2, "0")
            )}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function Route({
  source,
  target,
  complete,
}: {
  source: string;
  target: string;
  complete: boolean;
}) {
  return (
    <section className="migration-route" aria-label="Mudança da fonte oficial">
      <div className="migration-route-node">
        <span>{complete ? "Fonte anterior" : "Fonte atual"}</span>
        <strong>{source}</strong>
      </div>
      <Icon name="chevron-right" />
      <div className="migration-route-node">
        <span>{complete ? "Fonte oficial" : "Destino proposto"}</span>
        <strong>{target}</strong>
      </div>
    </section>
  );
}

export function SideNotes({ children }: { children?: ReactNode }) {
  return (
    <aside className="migration-side" aria-label="Proteções da migração">
      <section className="migration-side-card">
        <h2>Proteções mantidas</h2>
        <ul className="migration-side-list">
          <li>
            <Icon name="shield" />
            <span>A fonte atual continua oficial durante a preparação.</span>
          </li>
          <li>
            <Icon name="check" />
            <span>A troca só ocorre após validar o destino.</span>
          </li>
          <li>
            <Icon name="chat" />
            <span>Conversas e histórico local permanecem na Atendly.</span>
          </li>
        </ul>
      </section>
      {children}
    </aside>
  );
}

export function Status({
  icon,
  tone,
  children,
}: {
  icon?: IconName;
  tone?: "is-ready" | "is-warning" | "is-danger";
  children: ReactNode;
}) {
  return (
    <span className={clsx("migration-status", tone)}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function Frame({
  title,
  description,
  step,
  back,
  badge,
  children,
}: {
  title: string;
  description: string;
  step: number;
  back: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="migration-page">
      <div className="migration-toolbar">
        <Link className="migration-back" href={back}>
          <Icon name="chevron-right" />
          Configurações
        </Link>
        <span className="migration-progress-label">MIGRAÇÃO ASSISTIDA</span>
      </div>
      <header className="migration-header">
        <div className="migration-header-copy">
          <p className="eyebrow">Fonte oficial da agenda</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {badge}
      </header>
      <Stepper step={step} />
      {children}
    </div>
  );
}
