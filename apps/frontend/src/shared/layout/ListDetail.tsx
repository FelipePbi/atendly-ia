import type { ReactNode } from "react";

type ListDetailLayoutProps = {
  detail: ReactNode;
  list: ReactNode;
  listLabel: string;
};

/**
 * Lista e detalhe lado a lado (a partir de 1024 px). Quem usa só monta isto
 * em largura suficiente: abaixo disso a lista nem é montada quando a rota é de
 * detalhe, para não buscar dados de um painel escondido.
 */
export function ListDetailLayout({
  detail,
  list,
  listLabel,
}: ListDetailLayoutProps) {
  return (
    <div className="list-detail">
      <aside aria-label={listLabel} className="list-detail-list">
        {list}
      </aside>
      <div className="list-detail-panel">{detail}</div>
    </div>
  );
}

export function ListDetailEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="list-detail-empty">
      <p>{children}</p>
    </div>
  );
}
