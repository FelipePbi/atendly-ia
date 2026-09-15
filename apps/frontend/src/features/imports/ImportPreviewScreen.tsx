"use client";

import { useEffect, useState } from "react";

import { BffHttpError } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { StatePanel } from "@/shared/ui/States";

import { newIdempotencyKey } from "./idempotency";
import { ImportConflictsScreen } from "./ImportConflictsScreen";
import { ImportsPage, ReplaceAccountZone } from "./ImportsLayout";
import { CATEGORY_LABELS, CATEGORY_ORDER, importCountFormatter, limitationLabel } from "./labels";
import type {
  ImportCategory,
  ImportLiveSession,
  ImportPreview,
  ImportState,
} from "./types";

/**
 * Não repete `error.message` da origem: só linguagem de produto chega à tela.
 * `IMPORT_PREVIEW_STALE` não passa por aqui: preview obsoleto é um estado do
 * produto com saída própria, não mais uma frase de erro.
 */
function executeErrorMessage(error: unknown): string {
  if (error instanceof BffHttpError) {
    switch (error.code) {
      case "IMPORT_SESSION_NOT_SELECTABLE":
        return "Esta importação já não aceita mais escolhas.";
      default:
        return "Não foi possível importar agora. Tente novamente.";
    }
  }
  return "Não foi possível importar agora. Tente novamente.";
}

function orderedCategories(preview: ImportPreview) {
  const byCategory = new Map(preview.categories.map((entry) => [entry.category, entry]));
  return CATEGORY_ORDER.map((category) => byCategory.get(category)).filter(
    (entry): entry is ImportPreview["categories"][number] => entry !== undefined,
  );
}

/**
 * Análise, preview por categoria e escolha do que importar (Goal020/WU-06).
 * Cobre `session.status` em `DRAFT | ANALYZING | READY`: antes disso não há
 * sessão, depois disso a execução já começou e é outra tela.
 */
export function ImportPreviewScreen({
  onChanged,
  onReplaceAccount,
  session,
}: {
  onChanged: (state: ImportState) => void;
  onReplaceAccount: () => void;
  session: ImportLiveSession;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [analysisError, setAnalysisError] = useState(false);
  const [analysisToken, setAnalysisToken] = useState(0);
  const [mode, setMode] = useState<"summary" | "select" | "conflicts">("summary");
  const [selected, setSelected] = useState<Set<ImportCategory>>(new Set());
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .migration.analyzeImport(
        session.sessionId,
        newIdempotencyKey(),
        controller.signal,
      )
      .then((result) => {
        setPreview(result);
        // A escolha já gravada é a verdade; o `@default(true)` do schema só
        // vale enquanto a sessão ainda não tem categoria nenhuma. Ler o
        // `category` e ignorar o `selected` reapresentaria como incluída uma
        // categoria que o negócio já tinha deixado de fora.
        setSelected(
          session.categories.length > 0
            ? new Set(
                session.categories
                  .filter((c) => c.selected)
                  .map((c) => c.category),
              )
            : new Set(result.categories.map((c) => c.category)),
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAnalysisError(true);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId, analysisToken]);

  function retryAnalysis() {
    setPreview(null);
    setAnalysisError(false);
    setStale(false);
    setExecuteError(null);
    setAnalysisToken((value) => value + 1);
  }

  async function toggleCategory(category: ImportCategory, next: boolean) {
    setSelected((current) => {
      const copy = new Set(current);
      if (next) copy.add(category);
      else copy.delete(category);
      return copy;
    });
    setSelectionError(null);
    try {
      await getProductServices().migration.setImportCategorySelection(
        session.sessionId,
        category,
        { selected: next },
        newIdempotencyKey(),
      );
    } catch {
      setSelected((current) => {
        const copy = new Set(current);
        if (next) copy.delete(category);
        else copy.add(category);
        return copy;
      });
      setSelectionError("Não foi possível salvar essa escolha agora. Tente novamente.");
    }
  }

  async function handleExecute() {
    if (!preview) return;
    setExecuting(true);
    setExecuteError(null);
    try {
      await getProductServices().migration.executeImport(
        session.sessionId,
        { previewVersion: preview.previewVersion },
        newIdempotencyKey(),
      );
      const nextState = await getProductServices().migration.getImportState();
      onChanged(nextState);
    } catch (caught: unknown) {
      setExecuting(false);
      if (
        caught instanceof BffHttpError &&
        caught.code === "IMPORT_PREVIEW_STALE"
      ) {
        // A recusa de preview obsoleto é o contrato funcionando, não uma
        // falha: o que o negócio aprovou não existe mais, e a saída é ver de
        // novo antes de executar — nunca executar a versão vigente no lugar.
        setStale(true);
        return;
      }
      setExecuteError(executeErrorMessage(caught));
    }
  }

  if (stale) {
    return (
      <ImportsPage
        description="Nada foi importado. Sua agenda na Atendly continua como estava."
        title="Seus dados mudaram desde esta análise"
      >
        <StatePanel
          description="O que você viu aqui já não descreve o Minha Agenda. Analise de novo para importar o que existe agora."
          icon="refresh"
          onAction={retryAnalysis}
          actionLabel="Analisar de novo"
          title="Esta análise ficou desatualizada"
        />
        <ReplaceAccountZone onReplace={onReplaceAccount} />
      </ImportsPage>
    );
  }

  if (analysisError) {
    return (
      <ImportsPage
        description="Nada foi alterado na Atendly."
        title="Analisando seus dados"
      >
        <StatePanel
          description="Não foi possível analisar seus dados do Minha Agenda agora."
          icon="alert"
          onAction={retryAnalysis}
          actionLabel="Tentar de novo"
          title="Análise indisponível"
          tone="error"
        />
        <ReplaceAccountZone onReplace={onReplaceAccount} />
      </ImportsPage>
    );
  }

  if (!preview) {
    return (
      <ImportsPage
        description="Nada muda na Atendly até você confirmar."
        title="Analisando seus dados…"
      >
        <div className="imports-panel" aria-busy="true">
          <p className="imports-note">Isso pode levar alguns minutos.</p>
          <div className="imports-skeleton-rows">
            {CATEGORY_ORDER.slice(0, 4).map((category) => (
              <div className="imports-skeleton-row" key={category}>
                <span>{CATEGORY_LABELS[category]}</span>
              </div>
            ))}
          </div>
        </div>
      </ImportsPage>
    );
  }

  const categories = orderedCategories(preview);
  const selectedCount = categories
    .filter((category) => selected.has(category.category))
    .reduce((total, category) => total + category.discoveredCount, 0);
  // "Importar tudo" só pode se chamar assim quando é verdade. A execução lê
  // `selected` do banco: com uma categoria desmarcada, o botão que promete
  // tudo importaria menos do que diz — e, como a importação é única, o que
  // ficasse de fora não teria segunda chance.
  const everythingSelected = categories.every((category) =>
    selected.has(category.category),
  );
  const conflictCategories = categories.filter(
    (category) => category.needsReviewCount > 0,
  );
  const conflictCount = conflictCategories.reduce(
    (total, category) => total + category.needsReviewCount,
    0,
  );

  if (mode === "conflicts") {
    return (
      <ImportConflictsScreen
        categories={conflictCategories}
        onBack={() => setMode("summary")}
        sessionId={session.sessionId}
      />
    );
  }

  if (mode === "select") {
    return (
      <ImportsPage
        description="O que ficar de fora não poderá ser importado depois. Nada muda até você confirmar."
        title="O que você quer trazer?"
      >
        <div className="imports-panel">
          <ul className="imports-select-rows">
            {categories.map((category) => (
              <li key={category.category}>
                <label className="imports-select-row">
                  <input
                    checked={selected.has(category.category)}
                    type="checkbox"
                    onChange={(event) =>
                      void toggleCategory(category.category, event.target.checked)
                    }
                  />
                  <div>
                    <strong>{CATEGORY_LABELS[category.category]}</strong>
                    {!category.sourceSupported && (
                      <small>{limitationLabel(category.limitationCode)}</small>
                    )}
                  </div>
                  {category.sourceSupported && (
                    <span className="imports-row-count">
                      {importCountFormatter.format(category.discoveredCount)}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
          {selectionError && (
            <p className="field-help" role="alert">
              {selectionError}
            </p>
          )}
        </div>
        {executeError && (
          <p className="field-help" role="alert">
            {executeError}
          </p>
        )}
        <div className="imports-actions is-split">
          <button
            className="btn btn-secondary"
            disabled={executing}
            type="button"
            onClick={() => setMode("summary")}
          >
            Voltar
          </button>
          <button
            className="btn btn-primary"
            disabled={executing || selectedCount === 0}
            type="button"
            onClick={() => void handleExecute()}
          >
            {executing
              ? "Importando..."
              : `Importar ${importCountFormatter.format(selectedCount)} registros`}
          </button>
        </div>
        <ConflictsZone
          conflictCount={conflictCount}
          onReview={() => setMode("conflicts")}
        />
        <ReplaceAccountZone onReplace={onReplaceAccount} />
      </ImportsPage>
    );
  }

  return (
    <ImportsPage
      description="Isso não altera nada na Atendly. Revise antes de confirmar."
      title="Encontramos isto no Minha Agenda"
    >
      <div className="imports-panel">
        <ul className="imports-rows">
          {categories.map((category) => (
            <li key={category.category}>
              <div>
                <strong>{CATEGORY_LABELS[category.category]}</strong>
                {!category.sourceSupported && (
                  <small>{limitationLabel(category.limitationCode)}</small>
                )}
                {category.sourceSupported &&
                  !selected.has(category.category) && (
                    <small>Você deixou esta categoria de fora</small>
                  )}
              </div>
              {category.sourceSupported && (
                <span className="imports-row-count">
                  {importCountFormatter.format(category.discoveredCount)}
                </span>
              )}
            </li>
          ))}
        </ul>
        {!everythingSelected && (
          <p className="imports-note">
            {selectedCount === 0
              ? "Nada está escolhido para importar. Escolha o que trazer antes de continuar."
              : "Só o que está escolhido será importado. O que ficar de fora não poderá ser importado depois."}
          </p>
        )}
      </div>
      {executeError && (
        <p className="field-help" role="alert">
          {executeError}
        </p>
      )}
      <div className="imports-actions is-stacked">
        <button
          className="btn btn-primary"
          disabled={executing || selectedCount === 0}
          type="button"
          onClick={() => void handleExecute()}
        >
          {executing
            ? "Importando..."
            : everythingSelected
              ? "Importar tudo"
              : `Importar ${importCountFormatter.format(selectedCount)} registros`}
        </button>
        <button
          className="btn btn-tertiary"
          disabled={executing}
          type="button"
          onClick={() => setMode("select")}
        >
          Escolher o que importar
        </button>
      </div>
      <ConflictsZone
        conflictCount={conflictCount}
        onReview={() => setMode("conflicts")}
      />
      <ReplaceAccountZone onReplace={onReplaceAccount} />
    </ImportsPage>
  );
}

/**
 * Poucos conflitos não podem bloquear milhares de registros válidos (regra do
 * vault): a revisão fica disponível ao lado das ações de importar, nunca no
 * caminho obrigatório delas.
 */
function ConflictsZone({
  conflictCount,
  onReview,
}: {
  conflictCount: number;
  onReview: () => void;
}) {
  if (conflictCount === 0) return null;
  return (
    <div className="imports-conflicts-zone">
      <p className="imports-note">
        {conflictCount === 1
          ? "1 item precisa da sua decisão."
          : `${importCountFormatter.format(conflictCount)} itens precisam da sua decisão.`}{" "}
        Isso não impede importar o restante.
      </p>
      <div className="imports-actions">
        <button className="btn btn-secondary" type="button" onClick={onReview}>
          Revisar conflitos
        </button>
      </div>
    </div>
  );
}
