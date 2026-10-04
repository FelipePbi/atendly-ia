import type { ReactNode } from "react";

type ListDetailLayoutProps = {
  detail: ReactNode;
  list: ReactNode;
  listLabel: string;
  /** O painel vem antes da lista no DOM (ordem de foco/leitura); a grade mantém a lista à esquerda. */
  panelFirst?: boolean;
  /**
   * Divisão ligada: lista ao lado do detalhe (a partir de 1024 px). Desligada,
   * só o detalhe ocupa a tela: os invólucros não geram caixa e a lista nem é
   * montada, para não buscar dados de um painel escondido.
   */
  split?: boolean;
};

/**
 * Lista e detalhe lado a lado. O invólucro e o painel existem nos dois modos e o
 * slot da lista vira `null` quando a divisão está desligada: o detalhe fica na
 * mesma posição da árvore, então cruzar 1024 px não o remonta nem apaga o que a
 * pessoa já digitou ou rolou.
 */
export function ListDetailLayout({
  detail,
  list,
  listLabel,
  panelFirst = false,
  split = true,
}: ListDetailLayoutProps) {
  const listNode = split ? (
    <aside aria-label={listLabel} className="list-detail-list">
      {list}
    </aside>
  ) : null;
  const panelNode = <div className="list-detail-panel">{detail}</div>;
  const panelFirstClass = panelFirst ? " list-detail-panel-first" : "";
  const className = split
    ? `list-detail${panelFirstClass}`
    : "list-detail-flat";
  return panelFirst ? (
    <div className={className}>
      {panelNode}
      {listNode}
    </div>
  ) : (
    <div className={className}>
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
