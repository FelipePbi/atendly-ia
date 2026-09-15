import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/shared/icons/Icon";
import { Skeleton } from "@/shared/ui/States";

/**
 * Casco visual comum às telas do módulo (Goal020): o link "Configurações"
 * reflete o lugar conceitual da importação (Configurações → Importação, ver
 * vault), mesmo com a rota vivendo fora do prefixo `/configuracoes`.
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
  return (
    <section className="imports-page">
      <Link className="imports-back" href="/configuracoes">
        <Icon name="chevron-right" />
        Configurações
      </Link>
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
