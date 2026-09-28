"use client";

import Link from "next/link";
import { createContext, type ReactNode, useContext } from "react";

import { Icon } from "@/shared/icons/Icon";
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
 * Casco visual comum às telas do módulo (Goal020): o link "Configurações"
 * reflete o lugar conceitual da importação (Configurações → Importação, ver
 * vault), mesmo com a rota vivendo fora do prefixo `/configuracoes`. Na
 * moldura do onboarding o link não aparece, e o `<h1>` daqui é o único da
 * tela (Goal066).
 */
export function ImportsPage({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  const frame = useContext(ImportsFrameContext);
  return (
    <section className="imports-page">
      {frame === "platform" && (
        <Link className="imports-back" href="/configuracoes">
          <Icon name="chevron-right" />
          Configurações
        </Link>
      )}
      <header className="imports-header">
        <p className="eyebrow">Importação</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
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
