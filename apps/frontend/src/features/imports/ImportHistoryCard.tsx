import { Icon } from "@/shared/icons/Icon";

import {
  CATEGORY_LABELS,
  DEFAULT_BUSINESS_TIMEZONE,
  formatImportDayMonth,
  formatImportMoment,
  HISTORY_CATEGORY_ORDER,
  importCountFormatter,
} from "./labels";
import type { ImportHistory } from "./types";

/**
 * Resumo da importação concluída (I1) — quando, o que entrou por categoria,
 * o que ficou de fora e o aceite das pendências — compartilhado entre a tela
 * completa (`/importacao`), o bloco de Configurações → Agenda (Goal020/WU-09)
 * e o resultado do onboarding. As datas seguem o fuso do negócio.
 */
export function ImportHistoryCard({
  history,
  timeZone,
}: {
  history: ImportHistory;
  timeZone?: string | null;
}) {
  const zone = timeZone || DEFAULT_BUSINESS_TIMEZONE;
  const completedAt = formatImportMoment(history.completedAt, zone);
  const completedDay = formatImportDayMonth(history.completedAt, zone);
  const pending = history.pendingAcceptance;
  const pendingCount = pending?.pendingCount ?? 0;
  const categories = [...history.categories].sort(
    (a, b) =>
      HISTORY_CATEGORY_ORDER.indexOf(a.category) -
      HISTORY_CATEGORY_ORDER.indexOf(b.category),
  );
  return (
    <div className="import-history">
      <div className="import-history-done">
        <span aria-hidden="true" className="import-history-done-mark">
          <Icon name="check" />
        </span>
        <div className="import-history-done-copy">
          <h2>Importação concluída</h2>
          <span>
            Minha Agenda{completedAt ? ` · ${completedAt}` : ""}
          </span>
        </div>
      </div>
      <ul className="import-history-rows">
        {categories.map((category) => {
          const confirmed =
            category.category === "AVAILABILITY" && category.imported > 0;
          return (
            <li key={category.category}>
              <span className="import-history-count">
                {confirmed ? (
                  <Icon label="Importados" name="check" />
                ) : (
                  importCountFormatter.format(category.imported)
                )}
              </span>
              <div className="import-history-label">
                <strong>{CATEGORY_LABELS[category.category]}</strong>
                {!category.sourceSupported && (
                  <small>Minha Agenda não oferece esta categoria</small>
                )}
                {category.failed > 0 && (
                  <small>{category.failed} não importados</small>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {pending && pendingCount > 0 && (
        <div className="import-history-pending">
          <div className="import-history-pending-title">
            <Icon name="alert" />
            <h3>
              {pendingCount === 1
                ? "1 registro com pendência"
                : `${importCountFormatter.format(pendingCount)} registros com pendência`}
            </h3>
          </div>
          <p>
            Ficaram pendentes e foram aceitos por decisão explícita em{" "}
            {formatImportMoment(pending.acceptedAt, zone)}.
          </p>
        </div>
      )}
      <p className="import-history-note">
        A importação do Minha Agenda é feita uma única vez. Alterações feitas lá
        depois de {completedDay ?? "esta data"} não chegam à Avenly — sua
        agenda oficial é esta.
      </p>
    </div>
  );
}
