"use client";

import Link from "next/link";

import { Icon } from "@/shared/icons/Icon";

import {
  MORE_DESTINATIONS,
  type NavDestination,
  SETTINGS_DESTINATION,
} from "./navigation";

/** As telas que não cabem na barra inferior, mais a porta das configurações. */
const MORE_SHORTCUTS: NavDestination[] = [
  ...MORE_DESTINATIONS.filter((item) =>
    ["notificacoes", "servicos", "faturamento"].includes(item.section),
  ),
  SETTINGS_DESTINATION,
];
const ACCOUNT_DESTINATION = MORE_DESTINATIONS.find(
  (item) => item.section === "conta",
);

/**
 * Conteúdo do "Mais" do celular e do tablet (D-186, revisto em 2026-10-18):
 * só as telas que não estão na barra inferior — Notificações, Serviços,
 * Faturamento — e uma entrada para Configurações, que já tem a própria
 * lista. A conta e o Sair ficam no fim. Abre num modal centralizado.
 */
export function MoreMenu({
  isCurrent,
  notificationsBadge,
  onLogout,
  onNavigate,
}: {
  isCurrent: (href: string) => boolean;
  notificationsBadge: string | null;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="more-sheet">
      <div className="more-tiles">
        {MORE_SHORTCUTS.map((item) => (
          <Link
            aria-current={isCurrent(item.href) ? "page" : undefined}
            className="more-tile"
            href={item.href}
            key={item.section}
            onClick={onNavigate}
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
      <ul className="more-list">
        {ACCOUNT_DESTINATION && (
          <li>
            <Link
              aria-current={
                isCurrent(ACCOUNT_DESTINATION.href) ? "page" : undefined
              }
              className="more-row"
              href={ACCOUNT_DESTINATION.href}
              onClick={onNavigate}
            >
              <span aria-hidden="true" className="more-icon">
                <Icon name={ACCOUNT_DESTINATION.icon} />
              </span>
              <span className="more-row-label">Sua conta</span>
              <Icon name="chevron-right" />
            </Link>
          </li>
        )}
        <li>
          <button
            className="more-row is-danger"
            type="button"
            onClick={onLogout}
          >
            <span aria-hidden="true" className="more-icon">
              <Icon name="logout" />
            </span>
            <span className="more-row-label">Sair</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
