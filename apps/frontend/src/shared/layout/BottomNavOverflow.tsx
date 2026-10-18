"use client";

import clsx from "clsx";
import { useSyncExternalStore } from "react";

import { Icon } from "@/shared/icons/Icon";

import {
  BOTTOM_NAV_TIERS,
  bottomNavTabCount,
  isMoreActive,
  MOBILE_TAB_SECTIONS,
  type PlatformSection,
} from "./navigation";

/** Uma consulta por degrau de `BOTTOM_NAV_TIERS` (o degrau 0 vale sempre). */
const TIER_QUERIES = BOTTOM_NAV_TIERS.filter((tier) => tier.minWidth > 0).map(
  (tier) => `(min-width: ${tier.minWidth}px)`,
);

function hasMatchMedia(): boolean {
  return (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
  );
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => undefined;
  const queries = TIER_QUERIES.map((query) => window.matchMedia(query));
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}

function getSnapshot(): number {
  if (!hasMatchMedia()) return MOBILE_TAB_SECTIONS.length;
  const widest = BOTTOM_NAV_TIERS.filter(
    (tier) =>
      tier.minWidth === 0 ||
      window.matchMedia(`(min-width: ${tier.minWidth}px)`).matches,
  ).at(-1);
  return bottomNavTabCount(widest?.minWidth ?? 0);
}

function getServerSnapshot(): number {
  return MOBILE_TAB_SECTIONS.length;
}

/**
 * Quantos destinos cabem na barra inferior agora (D-192). Usa as mesmas
 * consultas de largura do CSS, que já decidiu o que aparece na primeira
 * pintura: este número só decide o que o JS precisa saber — qual botão
 * ("Mais" ou "Conta") está ativo e o que o modal lista. Sem `matchMedia`
 * (servidor, jsdom), vale a barra do celular.
 */
export function useBottomNavTabCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * O último item da barra inferior. Os dois botões estão sempre no HTML e o CSS
 * mostra um deles conforme a largura, sem esperar a hidratação:
 *
 * - "Mais", quando algum destino não coube: abre o modal com os que sobraram,
 *   a conta e o Sair; fica ativo quando a tela atual é um desses destinos;
 * - "Conta", quando todos couberam: abre o mesmo modal só com a conta e o
 *   Sair, que de outro jeito ficariam fora de alcance abaixo de 1100 px. Leva
 *   as iniciais da pessoa, como a conta da sidebar, para não repetir o ícone
 *   de Clientes.
 */
export function BottomNavMenuButtons({
  accountInitials,
  active,
  expanded,
  onOpen,
  tabCount,
}: {
  accountInitials: string;
  active: PlatformSection;
  expanded: boolean;
  onOpen: () => void;
  tabCount: number;
}) {
  const moreActive = isMoreActive(active, tabCount);
  const lastTier = BOTTOM_NAV_TIERS.at(-1)?.minWidth ?? 0;
  return (
    <>
      <button
        aria-current={moreActive ? "page" : undefined}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        className={clsx("bottom-nav-item", moreActive && "is-active")}
        data-bottom-until={lastTier}
        onClick={onOpen}
        type="button"
      >
        <Icon name="nav-more" />
        <span>Mais</span>
      </button>
      <button
        aria-expanded={expanded}
        aria-haspopup="dialog"
        className="bottom-nav-item"
        data-bottom-from={lastTier}
        onClick={onOpen}
        type="button"
      >
        {accountInitials ? (
          <span aria-hidden="true" className="bottom-nav-avatar">
            {accountInitials}
          </span>
        ) : (
          <Icon name="user" />
        )}
        <span>Conta</span>
      </button>
    </>
  );
}
