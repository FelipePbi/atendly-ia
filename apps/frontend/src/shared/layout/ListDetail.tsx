import type { ReactNode } from "react";

type ListDetailLayoutProps = {
  detail: ReactNode;
  list: ReactNode;
  listLabel: string;
  /** O painel vem antes da lista no DOM (ordem de foco/leitura); a grade mantém a lista à esquerda. */
  panelFirst?: boolean;
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
  panelFirst = false,
}: ListDetailLayoutProps) {
  const listNode = (
    <aside aria-label={listLabel} className="list-detail-list">
      {list}
    </aside>
  );
  const panelNode = <div className="list-detail-panel">{detail}</div>;
  return panelFirst ? (
    <div className="list-detail list-detail-panel-first">
      {panelNode}
      {listNode}
    </div>
  ) : (
    <div className="list-detail">
      {listNode}
      {panelNode}
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
