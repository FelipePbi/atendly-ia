import { CATEGORY_LABELS, formatImportDateTime } from "./labels";
import type { ImportHistory } from "./types";

/**
 * Resumo da importação concluída — origem, quando, o que entrou por
 * categoria e o que ficou de fora — compartilhado entre a tela completa
 * (`/importacao`) e o bloco de Configurações → Agenda (Goal020/WU-09).
 */
export function ImportHistoryCard({ history }: { history: ImportHistory }) {
  const completedAt = formatImportDateTime(history.completedAt);
  return (
    <div className="imports-panel">
      <div className="imports-panel-header">
        <h2>Importação concluída</h2>
        <p>
          Minha Agenda
          {history.sourceAccountLabel ? ` · ${history.sourceAccountLabel}` : ""}
          {completedAt ? ` · ${completedAt}` : ""}
        </p>
      </div>
      <ul className="imports-rows">
        {history.categories.map((category) => (
          <li key={category.category}>
            <div>
              <strong>{CATEGORY_LABELS[category.category]}</strong>
              {!category.sourceSupported && (
                <small>Minha Agenda não oferece esta categoria</small>
              )}
              {category.failed > 0 && (
                <small>{category.failed} não importados</small>
              )}
            </div>
            <span className="imports-row-count">{category.imported}</span>
          </li>
        ))}
      </ul>
      <p className="imports-note">
        A importação do Minha Agenda é feita uma única vez. Alterações feitas
        lá depois de {completedAt ?? "esta data"} não chegam à Atendly — sua
        agenda oficial é esta.
      </p>
      {history.pendingAcceptance && (
        <p className="imports-note">
          {history.pendingAcceptance.pendingCount} registro(s) ficaram
          pendentes e foram aceitos por decisão explícita em{" "}
          {formatImportDateTime(history.pendingAcceptance.acceptedAt)}.
        </p>
      )}
    </div>
  );
}
