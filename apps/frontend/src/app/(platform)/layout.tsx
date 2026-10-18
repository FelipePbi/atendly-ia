"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/shared/layout/AppShell";
import { ShellConfigProvider, useShellConfigValue } from "@/shared/layout/ShellConfig";
import { useSplashArm, useSplashHold } from "@/shared/motion/splash";

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
  // No primeiro carregamento, o splash da marca só sai quando a tela se
  // declarou à casca E terminou a primeira leitura que ela declara em
  // `loading` (D-168): depois dele a tela entra com conteúdo, nunca com
  // esqueleto. A espera é registrada antes de armar a saída.
  useSplashHold(Boolean(config?.loading));
  useSplashArm(config !== null);
  if (config?.chrome === false) return <>{children}</>;
  return (
    <AppShell
      action={config?.action}
      active={config?.active ?? "inicio"}
      attention={config?.attention}
      loading={config?.loading}
      mainClassName={config?.mainClassName}
      module={config?.module}
      pushed={config?.pushed}
      pushedWide={config?.pushedWide}
      showBottomNav={config?.showBottomNav}
      title={config?.title ?? "Avenly"}
      whatsappInBand={config?.whatsappInBand}
    >
      {children}
    </AppShell>
  );
}
