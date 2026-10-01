"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

import type {
  PlatformSection,
  ShellContextualAction,
  ShellModule,
} from "./navigation";

/**
 * `useLayoutEffect` de verdade no cliente: a atualização do config commita
 * antes da pintura seguinte, então a troca de rota nunca pisca o destino
 * anterior (ou o chrome completo numa tela que pediu `chrome: false`).
 * `useEffect` no servidor evita o aviso de `useLayoutEffect` sem efeito no SSR.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export type ShellConfig = {
  action?: ShellContextualAction | null;
  active: PlatformSection;
  attention?: boolean;
  /** `false` pula o AppShell inteiro (sidebar, bottom nav, status): usado por telas de interrupção como sessão expirada. */
  chrome?: boolean;
  loading?: boolean;
  mainClassName?: string;
  module?: ShellModule;
  /**
   * Tela empurrada (detalhe, criação ou edição): abaixo de 1024 px a casca
   * esconde a barra de abas e o botão flutuante; a barra própria da tela
   * (`PushedBar`) assume o voltar.
   */
  pushed?: boolean;
  showBottomNav?: boolean;
  title: string;
  /** A tela já diz o estado do WhatsApp em faixa própria: a casca não repete o banner. */
  whatsappInBand?: boolean;
};

type ShellConfigContextValue = {
  config: ShellConfig | null;
  setConfig: (config: ShellConfig) => void;
};

const ShellConfigContext = createContext<ShellConfigContextValue | null>(null);

function sameConfig(a: ShellConfig | null, b: ShellConfig): boolean {
  if (!a) return false;
  return (
    a.active === b.active &&
    a.title === b.title &&
    a.attention === b.attention &&
    a.chrome === b.chrome &&
    a.loading === b.loading &&
    a.mainClassName === b.mainClassName &&
    a.module === b.module &&
    a.pushed === b.pushed &&
    a.showBottomNav === b.showBottomNav &&
    a.whatsappInBand === b.whatsappInBand &&
    a.action?.href === b.action?.href &&
    a.action?.label === b.action?.label &&
    a.action?.icon === b.action?.icon
  );
}

export function ShellConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<ShellConfig | null>(null);
  const setConfig = (next: ShellConfig) => {
    setConfigState((previous) => (sameConfig(previous, next) ? previous : next));
  };
  return (
    <ShellConfigContext.Provider value={{ config, setConfig }}>
      {children}
    </ShellConfigContext.Provider>
  );
}

function useShellConfigContext(): ShellConfigContextValue {
  const value = useContext(ShellConfigContext);
  if (!value) {
    throw new Error("useShellConfig must be used inside ShellConfigProvider.");
  }
  return value;
}

/**
 * Declara o destino ativo, o título e a ação contextual (o `+` do módulo) da
 * tela atual. O shell é montado uma única vez em `app/(platform)/layout.tsx`;
 * cada tela só registra o que muda nela, nunca monta o próprio AppShell.
 *
 * O efeito roda a cada render de propósito (sem lista de dependências):
 * atualizar o estado de um componente ancestral durante a fase de render de
 * outro componente não é seguro em React, e o config muda com frequência
 * (loading, attention) — `setConfig` já descarta atualizações idênticas.
 */
export function useShellConfig(config: ShellConfig): void {
  const { setConfig } = useShellConfigContext();
  useIsomorphicLayoutEffect(() => {
    setConfig(config);
  });
}

export function useShellConfigValue(): ShellConfig | null {
  return useShellConfigContext().config;
}
