"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/shared/layout/AppShell";
import { ShellConfigProvider, useShellConfigValue } from "@/shared/layout/ShellConfig";

/**
 * Monta o AppShell uma única vez para todo o grupo `(platform)`. As telas não
 * renderizam mais o próprio AppShell: declaram destino, título e ação
 * contextual via `useShellConfig` e a navegação sobrevive à troca de rota sem
 * remontar sidebar, bottom nav ou o status de WhatsApp/IA.
 *
 * Antes do primeiro `useShellConfig` de uma tela (troca de rota inicial), o
 * shell usa um destino neutro ("inicio") por uma renderização — o efeito da
 * tela corrige o destino ativo antes da pintura seguinte.
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <ShellConfigProvider>
      <PlatformShellFrame>{children}</PlatformShellFrame>
    </ShellConfigProvider>
  );
}

function PlatformShellFrame({ children }: { children: ReactNode }) {
  const config = useShellConfigValue();
  if (config?.chrome === false) return <>{children}</>;
  return (
    <AppShell
      action={config?.action}
      active={config?.active ?? "inicio"}
      attention={config?.attention}
      loading={config?.loading}
      mainClassName={config?.mainClassName}
      module={config?.module}
      showBottomNav={config?.showBottomNav}
      showMobileHeader={config?.showMobileHeader}
      source={config?.source}
      title={config?.title ?? "Atendly"}
    >
      {children}
    </AppShell>
  );
}
