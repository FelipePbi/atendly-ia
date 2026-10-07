"use client";

import { createContext, type ReactNode, useContext } from "react";

import { PushedBar } from "@/shared/layout/PushedBar";
import { Skeleton } from "@/shared/ui/States";

/**
 * Moldura em que as telas do módulo aparecem (Goal066): `platform` é
 * `/importacao`, dentro do shell da plataforma; `onboarding` é a etapa
 * `importacao` do onboarding, que tem a própria moldura (progresso, "Sair")
 * e de onde nenhum link da importação pode sair. As telas são as mesmas nas
 * duas; só `ImportsPage` lê a moldura.
 */
export type ImportsFrame = "onboarding" | "platform";

const ImportsFrameContext = createContext<ImportsFrame>("platform");

export function useImportsFrame(): ImportsFrame {
  return useContext(ImportsFrameContext);
}

export function ImportsFrameProvider({
  children,
  frame,
}: {
  children: ReactNode;
  frame: ImportsFrame;
}) {
  return (
    <ImportsFrameContext.Provider value={frame}>
      {children}
    </ImportsFrameContext.Provider>
  );
}

/**
 * Casco visual comum às telas do módulo (Goal020). Na moldura `platform` a
 * tela é empurrada dentro de Configurações (D-103, Goal105): a barra
 * "Importação" é o único `<h1>` e traz o voltar para `/configuracoes` (que
 * some de 1024 px em diante, com a lista ao lado). O título de cada tela vira
 * `<h2>`. Na moldura do onboarding o `<h1>` daqui é o único da tela
 * (Goal066). `bare` dispensa o cabeçalho da tela; sem `description`, o
 * cabeçalho é só o título (a origem, 2.I1). `eyebrow={false}` tira o
 * "Importação" do onboarding das duas telas que o quadro não mostra com ele
 * (as credenciais, 2.I2, e a análise, 2.I3): o único eyebrow é o da moldura.
 */
export function ImportsPage({
  bare = false,
  children,
  description,
  eyebrow = true,
  title,
}: {
  bare?: boolean;
  children: ReactNode;
  description?: string;
  eyebrow?: boolean;
  title: string;
}) {
  const frame = useContext(ImportsFrameContext);
  const onboarding = frame === "onboarding";
  const Heading = onboarding ? "h1" : "h2";
  const header = !bare && (
    <header className="imports-header">
      {onboarding && eyebrow && description && (
        <p className="eyebrow">Importação</p>
      )}
      <Heading>{title}</Heading>
      {description && <p>{description}</p>}
    </header>
  );
  if (onboarding) {
    return (
      <section className="imports-page">
        {header}
        {children}
      </section>
    );
  }
  return (
    <section className="imports-page is-pushed">
      <PushedBar
        backHref="/configuracoes"
        backLabel="Voltar para configurações"
        hideBackWide
        title="Importação"
      />
      <div className="imports-pushed-body">
        {header}
        {children}
      </div>
    </section>
  );
}

export function ImportsLoading() {
  return (
    <ImportsPage
      description="Buscando o estado atual da sua importação."
      title="Importação"
    >
      <div className="imports-panel" aria-busy="true">
        <Skeleton style={{ width: "60%", height: 20 }} />
        <Skeleton style={{ width: "100%", height: 56 }} />
        <Skeleton style={{ width: "100%", height: 56 }} />
      </div>
    </ImportsPage>
  );
}

/**
 * Ação de trocar de conta, disponível em qualquer etapa de uma sessão viva
 * (Goal020): a confirmação de descarte é sempre de quem chama, nunca daqui.
 */
export function ReplaceAccountZone({ onReplace }: { onReplace: () => void }) {
  return (
    <div className="imports-danger-zone">
      <p className="imports-note">
        Prefere conectar outra conta do Minha Agenda? A importação atual será
        descartada — isso não pode ser desfeito.
      </p>
      <div className="imports-actions">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onReplace}
        >
          Conectar outra conta
        </button>
      </div>
    </div>
  );
}
