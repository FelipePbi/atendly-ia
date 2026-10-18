"use client";

import Link from "next/link";
import { type ReactNode, useId } from "react";

import { Icon } from "@/shared/icons/Icon";

import { MORE_DESTINATIONS } from "./navigation";

/** Atalhos em destaque no topo do "Mais". */
const MORE_SHORTCUTS = new Set(["notificacoes", "servicos", "faturamento"]);

/**
 * Conteúdo do "Mais" (pedido de 2026-10-16): atalhos em destaque no topo,
 * configurações numa lista com ícone e seta, e a conta com o "Sair" no fim —
 * cada linha com alvo de toque de 48 px e a página aberta marcada. Desde
 * 2026-10-18 é uma tela (`/mais`), não mais uma folha.
 */
export function MoreMenu({
  isCurrent,
  notificationsBadge,
  onLogout,
}: {
  isCurrent: (href: string) => boolean;
  notificationsBadge: string | null;
  onLogout: () => void;
}) {
  return (
    <div className="more-sheet">
      <div className="more-tiles">
        {MORE_DESTINATIONS.filter((item) =>
          MORE_SHORTCUTS.has(item.section),
        ).map((item) => (
          <Link
            aria-current={isCurrent(item.href) ? "page" : undefined}
            className="more-tile"
            href={item.href}
            key={item.section}
          >
            <span aria-hidden="true" className="more-icon">
              <Icon name={item.icon} />
            </span>
            <span className="more-tile-label">{item.label}</span>
            {item.section === "notificacoes" && notificationsBadge && (
              <span className="badge-count">{notificationsBadge}</span>
            )}
          </Link>
        ))}
      </div>
      <MoreGroup
        items={MORE_DESTINATIONS.filter(
          (item) =>
            !MORE_SHORTCUTS.has(item.section) && item.section !== "conta",
        )}
        isCurrent={isCurrent}
        title="Configurações"
      />
      <MoreGroup
        items={MORE_DESTINATIONS.filter((item) => item.section === "conta")}
        isCurrent={isCurrent}
        title="Sua conta"
      >
        <li>
          <button className="more-row is-danger" type="button" onClick={onLogout}>
            <span aria-hidden="true" className="more-icon">
              <Icon name="logout" />
            </span>
            <span className="more-row-label">Sair</span>
          </button>
        </li>
      </MoreGroup>
    </div>
  );
}

function MoreGroup({
  children,
  isCurrent,
  items,
  title,
}: {
  children?: ReactNode;
  isCurrent: (href: string) => boolean;
  items: typeof MORE_DESTINATIONS;
  title: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="more-group">
      <h2 className="more-group-title" id={headingId}>
        {title}
      </h2>
      <ul className="more-list">
        {items.map((item) => (
          <li key={item.section}>
            <Link
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className="more-row"
              href={item.href}
            >
              <span aria-hidden="true" className="more-icon">
                <Icon name={item.icon} />
              </span>
              <span className="more-row-label">{item.label}</span>
              <Icon name="chevron-right" />
            </Link>
          </li>
        ))}
        {children}
      </ul>
    </section>
  );
}
