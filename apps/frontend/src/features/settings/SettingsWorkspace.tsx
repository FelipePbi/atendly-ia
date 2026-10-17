"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import type { SettingsState } from "@/data";
import { ListDetailHost } from "@/shared/layout/ListDetail";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import {
  anchorOf,
  isPlainLeftClick,
  pushWithViewTransition,
  useSettleNavigation,
} from "@/shared/motion/PageTransition";
import { supportsViewTransition } from "@/shared/motion/viewTransition";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { recall, remember } from "@/shared/runtime/sessionMemory";

import { SettingsHubPanel } from "./SettingsHub";

export type SettingsData = {
  /** Só com nada para mostrar: uma releitura que falha mantém o que já havia. */
  error: boolean;
  settings: SettingsState | null;
  setSettings: (state: SettingsState) => void;
};

const SETTINGS_MEMORY_KEY = "settings:state";

/**
 * Lê as configurações do negócio. O que já foi lido nesta aba aparece na hora
 * (D-167) e é relido em segundo plano; quem salva uma seção grava o estado
 * novo pelo `setSettings`, que também atualiza a memória.
 */
export function useSettingsState(enabled: boolean): SettingsData {
  const [settings, setSettingsState] = useState<SettingsState | null>(() =>
    enabled ? (recall<SettingsState>(SETTINGS_MEMORY_KEY) ?? null) : null,
  );
  const [error, setError] = useState(false);
  const setSettings = useCallback((state: SettingsState) => {
    remember(SETTINGS_MEMORY_KEY, state);
    setSettingsState(state);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    getProductServices()
      .settings.get(controller.signal)
      .then((state) => {
        setError(false);
        setSettings(state);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      });
    return () => controller.abort();
  }, [enabled, setSettings]);

  return { error: error && settings === null, settings, setSettings };
}

const SettingsDataContext = createContext<SettingsData | null>(null);

/**
 * As configurações da área de Configurações. Debaixo de `SettingsWorkspace`
 * vêm da casca, lidas uma vez para todas as seções; fora dela (testes, telas
 * montadas sozinhas), a própria tela lê.
 */
export function useSettingsData(): SettingsData {
  const shared = useContext(SettingsDataContext);
  const own = useSettingsState(shared === null);
  return shared ?? own;
}

/** Rotas da área: as seções de Configurações e a Importação, que a lista também oferece. */
export function isSettingsArea(pathname: string): boolean {
  return (
    pathname === "/configuracoes" ||
    pathname.startsWith("/configuracoes/") ||
    pathname === "/importacao"
  );
}

/** Linha marcada na lista para a rota aberta; no hub, a seção aberta é o Negócio (M1). */
export function openHrefForPath(pathname: string): string {
  if (pathname === "/importacao") return "/importacao";
  const section = pathname.split("/")[2];
  if (section === "ia") return "/configuracoes/ia";
  if (section === "whatsapp") return "/configuracoes/whatsapp";
  if (section === "agenda" || section === "disponibilidade")
    return "/configuracoes/agenda";
  if (section === "conversas") return "/configuracoes/conversas";
  if (section === "conta") return "/configuracoes/conta";
  if (section === "atividade") return "/configuracoes/atividade";
  return "/configuracoes/negocio";
}

/**
 * Casca de `/configuracoes/*` e `/importacao`, montada pelo layout do grupo
 * de rotas: lê as configurações uma vez e, de 1024 px em diante, mantém a
 * lista de Configurações montada ao lado da seção aberta. Trocar de seção
 * troca só o painel, com crossfade (`vt-settings-swap`, D-173), e cada seção
 * busca só o próprio dado quando abre. Abaixo de 1024 px a seção é tela
 * empurrada, sem a lista, e o hub é a própria página `/configuracoes`.
 */
export function SettingsWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const wide = useWideLayout();
  const data = useSettingsState(true);
  const split = wide && data.settings !== null;

  useSettleNavigation(pathname);

  useEffect(() => {
    if (!split) return;
    function handleClick(event: MouseEvent) {
      if (!isPlainLeftClick(event)) return;
      const anchor = anchorOf(event.target);
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === pathname) return;
      if (!isSettingsArea(pathname) || !isSettingsArea(url.pathname)) return;
      if (!supportsViewTransition()) return;
      // A navegação continua sendo a do Next: só a foto é tirada antes dela.
      event.preventDefault();
      void pushWithViewTransition(
        router,
        `${url.pathname}${url.search}${url.hash}`,
        { fadeOnReducedMotion: true, types: ["settings-swap"] },
      );
    }
    // Na captura, antes do `onClick` do `<Link>`: ele respeita `defaultPrevented`.
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname, router, split]);

  return (
    <SettingsDataContext.Provider value={data}>
      <ListDetailHost
        detail={children}
        list={
          data.settings ? (
            <SettingsHubPanel
              heading={pathname === "/configuracoes" ? "h1" : "h2"}
              openHref={openHrefForPath(pathname)}
              settings={data.settings}
            />
          ) : null
        }
        listLabel="Configurações"
        split={split}
      />
    </SettingsDataContext.Provider>
  );
}
