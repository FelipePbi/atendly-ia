"use client";

import Link from "next/link";

import { Icon } from "@/shared/icons/Icon";

import {
  bottomNavOverflow,
  MOBILE_TAB_SECTIONS,
  MORE_DESTINATIONS,
  type NavDestination,
} from "./navigation";

const ACCOUNT_DESTINATION = MORE_DESTINATIONS.find(
  (item) => item.section === "conta",
);

/**
 * Conteúdo do "Mais" do celular e do tablet (D-186, revisto pelo D-192): só
 * os destinos que não couberam na barra inferior (`shortcuts`, por padrão os
 * do celular: Serviços, Faturamento, Notificações e Configurações, que já
 * tem a própria lista). A conta e o Sair ficam no fim. Quando tudo cabe na
 * barra, sobram só os dois. Abre num modal centralizado.
 */
export function MoreMenu({
  isCurrent,
  notificationsBadge,
  onLogout,
  onNavigate,
  shortcuts = bottomNavOverflow(MOBILE_TAB_SECTIONS.length),
}: {
  isCurrent: (href: string) => boolean;
  notificationsBadge: string | null;
  onLogout: () => void;
  onNavigate?: () => void;
  shortcuts?: NavDestination[];
}) {
  return (
    <div className="more-sheet">
      {shortcuts.length > 0 && (
        <div className="more-tiles">
          {shortcuts.map((item) => (
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
      )}
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
