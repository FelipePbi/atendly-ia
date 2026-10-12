"use client";

import { type ReactNode, useSyncExternalStore } from "react";

import { ImportsPage } from "./ImportsLayout";
import {
  CATEGORY_LABELS,
  HISTORY_CATEGORY_ORDER,
  historyPillLabel,
  importCountFormatter,
} from "./labels";
import type { ImportHistory } from "./types";

/**
 * A casca da plataforma troca a barra inferior ("Mais") pela sidebar
 * ("Configurações") a partir de 1100 px (`app-frame`, `avenly.css`): é a
 * largura em que o caminho até a importação muda.
 */
const SIDEBAR_QUERY = "(min-width: 1100px)";

function subscribe(onChange: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => undefined;
  }
  const query = window.matchMedia(SIDEBAR_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(SIDEBAR_QUERY).matches
  );
}

/**
 * Nota do rodapé da importação concluída no onboarding (2.I10): onde o
 * histórico fica depois, pelo caminho que a navegação desta largura mostra.
 * Onde a barra inferior tem "Mais", `/importacao` está dentro dele; onde a
 * sidebar tem "Configurações", a entrada fica em Configurações.
 */
export function ImportDonePathNote() {
  const sidebar = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return (
    <p className="imports-done-path">
      O histórico desta importação fica em {sidebar ? "Configurações" : "Mais"}{" "}
      › Importação.
    </p>
  );
}

function pendingNote(count: number): string {
  return count === 1
    ? "1 registro com pendência"
    : `${importCountFormatter.format(count)} registros com pendência`;
}

/**
 * Importação concluída na moldura do onboarding (2.I10): o selo, o título, a
 * descrição, uma pílula por categoria importada e, no rodapé, o que `Continuar`
 * pede. Só o onboarding a mostra; em `/importacao` o histórico continua sendo
 * `ImportHistoryScreen` (I1), com o detalhe por categoria e as pendências.
 */
export function ImportDoneScreen({
  children,
  history,
}: {
  children?: ReactNode;
  history: ImportHistory;
}) {
  const pills = HISTORY_CATEGORY_ORDER.flatMap((category) => {
    const entry = history.categories.find((item) => item.category === category);
    return entry && entry.imported > 0 ? [entry] : [];
  });
  const pendingCount = history.pendingAcceptance?.pendingCount ?? 0;
  const failedCount = history.categories.reduce(
    (total, category) => total + category.failed,
    0,
  );
  const notes = [
    ...(pendingCount > 0 ? [pendingNote(pendingCount)] : []),
    ...(failedCount > 0
      ? [`${importCountFormatter.format(failedCount)} não importados`]
      : []),
  ];

  return (
    <ImportsPage bare title="Importação concluída">
      <div className="imports-done">
        <div className="imports-done-body">
          <span aria-hidden="true" className="imports-done-seal">
            <span className="imports-done-ring" />
            <span className="imports-done-disc">
              <svg
                aria-hidden="true"
                fill="none"
                height="34"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
                width="34"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
          </span>
          <div className="imports-done-text">
            <h1>Importação concluída</h1>
            <p>
              Seus dados agora estão na Avenly. A partir de agora, sua agenda é
              gerenciada por aqui. Alterações futuras no Minha Agenda não serão
              refletidas.
            </p>
          </div>
          {(pills.length > 0 || notes.length > 0) && (
            <div className="imports-done-tally">
              {pills.length > 0 && (
                <ul
                  aria-label="O que foi importado"
                  className="imports-done-pills"
                >
                  {pills.map((entry) => (
                    <li
                      className={
                        entry.category === "AVAILABILITY"
                          ? "imports-done-pill is-plain"
                          : "imports-done-pill"
                      }
                      key={entry.category}
                    >
                      <span aria-hidden="true">
                        {historyPillLabel(entry.category, entry.imported)}
                      </span>
                      <span className="sr-only">
                        {entry.category === "AVAILABILITY"
                          ? CATEGORY_LABELS[entry.category]
                          : `${CATEGORY_LABELS[entry.category]}: ${importCountFormatter.format(entry.imported)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {notes.length > 0 && (
                <p className="imports-done-note">{notes.join(" · ")}</p>
              )}
            </div>
          )}
        </div>
        <div className="imports-done-footer">{children}</div>
      </div>
    </ImportsPage>
  );
}
