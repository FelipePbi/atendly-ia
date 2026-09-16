import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/shared/icons/Icon";

export function SettingsPage({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="settings-page">
      <Link className="settings-back" href="/configuracoes">
        <Icon name="chevron-right" />
        Configurações
      </Link>
      <header className="settings-page-header">
        <div>
          <p className="eyebrow">Configurações</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export function SettingsMessage({
  copy,
  error = false,
  title,
}: {
  copy: string;
  error?: boolean;
  title: string;
}) {
  return (
    <section className="settings-page">
      <div className="settings-state-shell">
        <div className="settings-state-card">
          <span className={`settings-source-icon${error ? " is-danger" : ""}`}>
            <Icon name={error ? "alert" : "refresh"} />
          </span>
          <h1>{title}</h1>
          <p>{copy}</p>
        </div>
      </div>
    </section>
  );
}
