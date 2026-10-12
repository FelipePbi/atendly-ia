"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { BffHttpError } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { StatePanel } from "@/shared/ui/States";

import { newIdempotencyKey } from "./idempotency";
import { ImportConflictsScreen } from "./ImportConflictsScreen";
import { ImportsPage, ReplaceAccountZone } from "./ImportsLayout";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  importCountFormatter,
  limitationLabel,
  upstreamErrorCode,
  workErrorLabel,
} from "./labels";
import type {
  ImportCategory,
  ImportLiveSession,
  ImportPreviewCategory,
  ImportPreviewSnapshot,
  ImportState,
} from "./types";

/** Mesmo intervalo de `ImportRunScreen`: leitura de estado, não de progresso. */
const ANALYSIS_POLL_MS = 3_000;

const GENERIC_ANALYSIS_ERROR =
  "Não foi possível analisar seus dados do Minha Agenda agora.";

/**
 * Não repete `error.message` da origem: só linguagem de produto chega à tela.
 * `IMPORT_PREVIEW_STALE` não passa por aqui: preview obsoleto é um estado do
 * produto com saída própria, não mais uma frase de erro. Erros de domínio
 * chegam do BFF como `UPSTREAM_ERROR` com `details.upstreamCode` (Goal061 §7),
 * nunca com o código cru direto em `error.code`.
 */
function executeErrorMessage(error: unknown): string {
  if (error instanceof BffHttpError && error.code === "UPSTREAM_ERROR") {
    switch (upstreamErrorCode(error)) {
      case "IMPORT_SESSION_NOT_SELECTABLE":
        return "Esta importação já não aceita mais escolhas.";
      default:
        return "Não foi possível importar agora. Tente novamente.";
    }
  }
  return "Não foi possível importar agora. Tente novamente.";
}

function isPreviewStaleError(error: unknown): boolean {
  return (
    error instanceof BffHttpError &&
    error.code === "UPSTREAM_ERROR" &&
    upstreamErrorCode(error) === "IMPORT_PREVIEW_STALE"
  );
}

/**
 * A ordem do resumo (2.I4) é a do quadro e só vale nesta tela: horários por
 * último. `CATEGORY_ORDER` segue como a ordem das outras telas.
 */
const SUMMARY_CATEGORY_ORDER: ImportCategory[] = [
  "SERVICE",
  "CUSTOMER",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
  "TIME_BLOCK",
  "AVAILABILITY",
];

function orderedCategories(
  preview: ImportPreviewSnapshot,
  order: ImportCategory[] = CATEGORY_ORDER,
): ImportPreviewCategory[] {
  const byCategory = new Map(
    preview.categories.map((entry) => [entry.category, entry]),
  );
  return order
    .map((category) => byCategory.get(category))
    .filter((entry): entry is ImportPreviewCategory => entry !== undefined);
}

/**
 * O início pode ter chegado ao servidor mesmo sem resposta ao cliente
 * (Goal061 §6): isso conta como trabalho começado, nunca como falha.
 */
function hasStartedWork(session: ImportLiveSession | null): boolean {
  if (!session) return false;
  return (
    session.status === "EXECUTING" ||
    session.status === "PARTIAL" ||
    session.startedAt !== null
  );
}

/**
 * O início da análise pode ter chegado ao servidor mesmo quando o cliente só
 * viu falha (Goal061 §6). O estado relido depois da falha é comparado ao que a
 * tela tinha antes do clique: qualquer avanço — análise em curso, preview
 * novo, outra fase ou outro motivo gravado — conta como trabalho começado.
 */
function analysisStarted(
  before: ImportLiveSession,
  after: ImportLiveSession | null,
): boolean {
  if (!after) return true;
  if (after.status === "ANALYZING" && !after.interrupted) return true;
  return (
    after.status !== before.status ||
    after.previewVersion !== before.previewVersion ||
    after.interrupted !== before.interrupted ||
    (after.lastError?.code ?? null) !== (before.lastError?.code ?? null)
  );
}

/**
 * As cinco linhas da análise (2.I3), na ordem do quadro e não na de
 * `CATEGORY_ORDER`. Sem número: enquanto lê, a Avenly ainda não sabe quantos
 * registros existem, e `session.categories` nunca é fonte de contagem aqui.
 * Nenhuma linha se distingue das outras: o sistema não sabe qual categoria já
 * foi lida.
 */
const ANALYSIS_ROWS: {
  icon: ReactNode;
  label: string;
}[] = [
  { icon: <path d="M4 7h16M4 12h16M4 17h10" />, label: "Serviços" },
  {
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    label: "Clientes",
  },
  {
    icon: (
      <>
        <rect height="14.5" rx="2.5" width="16" x="4" y="5.5" />
        <path d="M4 10h16M8 3.5v4M16 3.5v4" />
      </>
    ),
    label: "Agendamentos futuros",
  },
  {
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4.5l3 2" />
      </>
    ),
    label: "Atendimentos anteriores",
  },
  {
    icon: <path d="M4 7h16M4 12h16M4 17h16" />,
    label: "Horários de atendimento",
  },
];

/** O nome dos horários no resumo (2.I4): com maiúscula, ao lado do selo. */
const AVAILABILITY_FOUND_LABEL = "Horários de atendimento";

/** A legenda de "Atendimentos anteriores" na escolha (2.I5). */
const PAST_APPOINTMENT_CHOICE_LEGEND = "histórico de cada cliente";

/** `CATEGORY_LABELS` é minúsculo; a escolha (2.I5) pede o nome com maiúscula. */
function capitalized(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

type Phase =
  | { kind: "working" }
  | { kind: "interrupted" }
  | { kind: "error"; message: string }
  | { kind: "ready"; preview: ImportPreviewSnapshot };

/**
 * Análise, preview por categoria e escolha do que importar (Goal020/WU-06,
 * Goal061 §6). Cobre `session.status` em `DRAFT | ANALYZING | READY` sem
 * execução iniciada: antes disso não há sessão, depois disso a execução já
 * começou e é `ImportRunScreen`.
 *
 * Montar nunca reanalisa sozinho quando já existe preview gravado
 * (`previewVersion > 0`, sessão `READY`): a leitura é `GET .../preview`. A
 * análise só é disparada sozinha em `DRAFT` sem preview; `ANALYZING` só lê o
 * estado até sair de lá, nunca inicia de novo.
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
  const [phase, setPhase] = useState<Phase>({ kind: "working" });
  const [mode, setMode] = useState<"summary" | "select" | "conflicts">(
    "summary",
  );
  const [selected, setSelected] = useState<Set<ImportCategory>>(new Set());
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  // Depois de "Tentar de novo"/"Continuar", a fase local vence o
  // `lastError`/`interrupted` que a prop ainda carrega da tentativa anterior:
  // sem isso a tela declararia falha de uma análise que acabou de começar. Volta
  // a `false` quando o estado relido é entregue ao pai.
  const [ownerRestarted, setOwnerRestarted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reinício manual ("Tentar de novo"/"Continuar"): chama direto o
  // `startAnalysis` do efeito vigente, fora do fluxo de dependências — assim
  // nunca reexecuta sozinho a cada prop nova que a própria análise produzir.
  const startRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    function applyPreview(snapshot: ImportPreviewSnapshot) {
      if (!active) return;
      setPhase({ kind: "ready", preview: snapshot });
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
          : new Set(snapshot.categories.map((c) => c.category)),
      );
    }

    async function readPreview() {
      try {
        const snapshot = await getProductServices().migration.getImportPreview(
          session.sessionId,
          controller.signal,
        );
        applyPreview(snapshot);
      } catch {
        if (!active) return;
        setPhase({ kind: "error", message: GENERIC_ANALYSIS_ERROR });
      }
    }

    function handOver(next: ImportState) {
      setOwnerRestarted(false);
      onChanged(next);
    }

    function settle(next: ImportState) {
      const nextSession = next.session;
      if (!nextSession || nextSession.status !== "ANALYZING") {
        // Saiu de ANALYZING (READY, ou voltou ao estado de partida com
        // `lastError`): o pai recebe o estado novo e este componente
        // reavalia a partir dele.
        handOver(next);
        return;
      }
      if (nextSession.interrupted) {
        setPhase({ kind: "interrupted" });
        return;
      }
      if (session.lastError || session.interrupted) {
        // Reinício aceito pelo dono: a prop ainda diz que a tentativa
        // anterior falhou ou parou. O pai recebe a sessão em ANALYZING, sem
        // os dois, e este componente segue lendo a partir dela.
        handOver(next);
        return;
      }
      timer.current = setTimeout(
        () => void pollUntilSettled(),
        ANALYSIS_POLL_MS,
      );
    }

    async function pollUntilSettled() {
      if (!active) return;
      let next: ImportState;
      try {
        next = await getProductServices().migration.getImportState(
          controller.signal,
        );
      } catch {
        if (!active) return;
        setPhase({ kind: "error", message: GENERIC_ANALYSIS_ERROR });
        return;
      }
      if (!active) return;
      settle(next);
    }

    async function startAnalysis() {
      try {
        await getProductServices().migration.analyzeImport(
          session.sessionId,
          newIdempotencyKey(),
          controller.signal,
        );
      } catch {
        if (!active) return;
        // Incerteza não é falha (Goal061 §6): rede, timeout ou 5xx não dizem
        // se o início chegou ao servidor. Relê o estado antes de decidir; o
        // erro só aparece quando o estado relido mostra que nada começou.
        let next: ImportState;
        try {
          next = await getProductServices().migration.getImportState(
            controller.signal,
          );
        } catch {
          if (!active) return;
          setPhase({ kind: "error", message: GENERIC_ANALYSIS_ERROR });
          return;
        }
        if (!active) return;
        if (analysisStarted(session, next.session)) {
          settle(next);
          return;
        }
        setPhase({ kind: "error", message: GENERIC_ANALYSIS_ERROR });
        return;
      }
      await pollUntilSettled();
    }

    // Ação explícita do dono ("Tentar de novo"/"Continuar"): sempre inicia de
    // novo, mesmo que a sessão ainda carregue o `lastError`/`interrupted` da
    // tentativa anterior — é exatamente isso que limpa os dois. Chamada
    // direto por `startRef`, nunca reavaliada pelas dependências abaixo.
    startRef.current = () => {
      setOwnerRestarted(true);
      setPhase({ kind: "working" });
      void startAnalysis();
    };

    // `lastError`/`interrupted` são estado derivado direto da prop
    // (`derivedPhase` no corpo do componente): nada para buscar sozinho
    // enquanto o dono não agir, então o efeito não dispara nada aqui.
    // `phase` já nasce `working` (estado inicial do `useState`): nenhum
    // destes três ramos precisa repetir `setPhase` antes do fetch — só o
    // resultado assíncrono grava estado, nunca o próprio corpo do efeito.
    if (!session.lastError && !session.interrupted) {
      if (session.status === "ANALYZING") {
        void pollUntilSettled();
      } else if (session.previewVersion > 0) {
        void readPreview();
      } else {
        void startAnalysis();
      }
    }

    return () => {
      active = false;
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session.sessionId,
    session.status,
    session.previewVersion,
    session.interrupted,
    session.lastError,
  ]);

  function retry() {
    setStale(false);
    setExecuteError(null);
    startRef.current();
  }

  // Derivado direto da prop, nunca de `setState` num efeito (evita a
  // cascata de render que a regra `set-state-in-effect` proíbe): a sessão já
  // diz que parou ou falhou, sem nenhuma leitura para decidir isso. Depois do
  // reinício pelo dono, quem decide é a fase local (`ownerRestarted`).
  const derivedPhase: Phase | null = ownerRestarted
    ? null
    : session.lastError
      ? { kind: "error", message: workErrorLabel(session.lastError.code) }
      : session.interrupted
        ? { kind: "interrupted" }
        : null;
  const effectivePhase = derivedPhase ?? phase;

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
      setSelectionError(
        "Não foi possível salvar essa escolha agora. Tente novamente.",
      );
    }
  }

  async function handleExecute() {
    if (effectivePhase.kind !== "ready") return;
    const { preview } = effectivePhase;
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
      if (isPreviewStaleError(caught)) {
        // A recusa de preview obsoleto é o contrato funcionando, não uma
        // falha: o que o negócio aprovou não existe mais, e a saída é ver de
        // novo antes de executar — nunca executar a versão vigente no lugar.
        setExecuting(false);
        setStale(true);
        return;
      }
      // Incerteza não é falha (Goal061 §6): o início pode ter chegado ao
      // servidor mesmo sem resposta ao cliente (timeout, rede, 5xx de
      // transporte). Relê o estado antes de decidir — só mostra o erro
      // quando o estado relido confirma que nada começou.
      try {
        const nextState = await getProductServices().migration.getImportState();
        if (hasStartedWork(nextState.session)) {
          onChanged(nextState);
          return;
        }
      } catch {
        // A checagem também falhou: cai no erro de execução abaixo.
      }
      setExecuting(false);
      setExecuteError(executeErrorMessage(caught));
    }
  }

  if (stale) {
    return (
      <ImportsPage
        description="Nada foi importado. Sua agenda na Avenly continua como estava."
        title="Seus dados mudaram desde esta análise"
      >
        <StatePanel
          description="O que você viu aqui já não descreve o Minha Agenda. Analise de novo para importar o que existe agora."
          icon="refresh"
          onAction={retry}
          actionLabel="Analisar de novo"
          title="Esta análise ficou desatualizada"
        />
        <ReplaceAccountZone onReplace={onReplaceAccount} />
      </ImportsPage>
    );
  }

  if (effectivePhase.kind === "interrupted") {
    return (
      <ImportsPage
        description="Nada do que já foi lido se perdeu."
        title="A análise parou no meio do caminho"
      >
        <StatePanel
          description="Isso pode acontecer quando o processo reinicia durante o trabalho. Continue para retomar de onde parou."
          icon="refresh"
          onAction={retry}
          actionLabel="Continuar"
          title="Análise interrompida"
        />
        <ReplaceAccountZone onReplace={onReplaceAccount} />
      </ImportsPage>
    );
  }

  if (effectivePhase.kind === "error") {
    return (
      <ImportsPage
        description="Nada foi alterado na Avenly."
        title="Analisando seus dados"
      >
        <StatePanel
          description={effectivePhase.message}
          icon="alert"
          onAction={retry}
          actionLabel="Tentar de novo"
          title="Análise indisponível"
          tone="error"
        />
        <ReplaceAccountZone onReplace={onReplaceAccount} />
      </ImportsPage>
    );
  }

  if (effectivePhase.kind === "working") {
    return (
      <ImportsPage
        description="Nada muda na Avenly até você confirmar."
        eyebrow={false}
        title="Analisando seus dados…"
      >
        <div className="imports-analysis" aria-busy="true">
          <div
            aria-label="Analisando seus dados"
            className="imports-analysis-bar"
            role="progressbar"
          >
            <span className="imports-analysis-fill" />
          </div>
          <ul className="imports-analysis-card">
            {ANALYSIS_ROWS.map((row) => (
              <li className="imports-analysis-row" key={row.label}>
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="22"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.75"
                  viewBox="0 0 24 24"
                  width="22"
                >
                  {row.icon}
                </svg>
                <span className="imports-analysis-label">{row.label}</span>
                <span aria-hidden="true" className="imports-analysis-pill" />
              </li>
            ))}
          </ul>
          <p className="imports-analysis-note">
            Isso pode levar alguns minutos.
          </p>
        </div>
      </ImportsPage>
    );
  }

  const { preview } = effectivePhase;
  const categories = orderedCategories(preview);
  const summaryCategories = orderedCategories(preview, SUMMARY_CATEGORY_ORDER);
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

  // O que já está pronto, nas categorias escolhidas: o que foi descoberto menos
  // o que espera decisão (a segunda frase da descrição dos conflitos, 2.I6).
  const readyCount = categories
    .filter((category) => selected.has(category.category))
    .reduce(
      (total, category) =>
        total +
        Math.max(0, category.discoveredCount - category.needsReviewCount),
      0,
    );

  if (mode === "conflicts") {
    return (
      <ImportConflictsScreen
        categories={conflictCategories}
        onBack={() => setMode("summary")}
        readyCount={readyCount}
        sessionId={session.sessionId}
      />
    );
  }

  if (mode === "select") {
    return (
      <ImportsPage
        description="O que ficar de fora não poderá ser importado depois."
        eyebrow={false}
        title="O que você quer trazer?"
      >
        <div className="imports-summary is-choice">
          <ul className="imports-summary-card">
            {summaryCategories.map((category) => {
              const checked = selected.has(category.category);
              // Sob "Atendimentos anteriores" o quadro legenda o que o
              // histórico traz; a limitação da origem, quando houver, vale
              // mais e ocupa o lugar dela.
              const legend = !category.sourceSupported
                ? limitationLabel(category.limitationCode)
                : category.category === "PAST_APPOINTMENT"
                  ? PAST_APPOINTMENT_CHOICE_LEGEND
                  : null;
              return (
                <li key={category.category}>
                  <label
                    className={
                      checked
                        ? "imports-choice-row"
                        : "imports-choice-row is-off"
                    }
                  >
                    <input
                      checked={checked}
                      type="checkbox"
                      onChange={(event) =>
                        void toggleCategory(
                          category.category,
                          event.target.checked,
                        )
                      }
                    />
                    <span className="imports-choice-copy">
                      <strong>
                        {capitalized(CATEGORY_LABELS[category.category])}
                      </strong>
                      {legend && <small>{legend}</small>}
                    </span>
                    {category.category !== "AVAILABILITY" && (
                      <span className="imports-choice-count">
                        {importCountFormatter.format(category.discoveredCount)}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
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
        <div className="imports-summary-actions is-choice">
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
          <button
            className="imports-text-action"
            disabled={executing}
            type="button"
            onClick={() => setMode("summary")}
          >
            Voltar
          </button>
        </div>
        <ConflictsZone
          conflictCount={conflictCount}
          onReview={() => setMode("conflicts")}
        />
      </ImportsPage>
    );
  }

  return (
    <ImportsPage title="Encontramos isto no Minha Agenda">
      <div className="imports-summary">
        <ul className="imports-summary-card">
          {summaryCategories.map((category) => {
            // Horários não têm número que o quadro mostre: o selo diz que foram
            // encontrados. Com 0 regras ou sem suporte da origem, a linha é
            // como as outras (número ou limitação).
            const found =
              category.category === "AVAILABILITY" &&
              category.sourceSupported &&
              category.discoveredCount > 0;
            return (
              <li
                className={
                  found ? "imports-summary-row is-seal" : "imports-summary-row"
                }
                key={category.category}
              >
                {/* Rótulo à esquerda e número à direita, como numa lista de
                    totais ("Cancelamentos 0"). */}
                <div className="imports-summary-copy">
                  <strong>
                    {found
                      ? AVAILABILITY_FOUND_LABEL
                      : capitalized(CATEGORY_LABELS[category.category])}
                  </strong>
                  {found && <span className="sr-only">, encontrados</span>}
                  {!category.sourceSupported && (
                    <small>{limitationLabel(category.limitationCode)}</small>
                  )}
                  {category.sourceSupported &&
                    !selected.has(category.category) && (
                      <small>Você deixou esta categoria de fora</small>
                    )}
                </div>
                {found ? (
                  <span aria-hidden="true" className="imports-summary-seal">
                    <svg
                      fill="none"
                      height="14"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                      viewBox="0 0 24 24"
                      width="14"
                    >
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                ) : (
                  <span className="imports-summary-count">
                    {importCountFormatter.format(category.discoveredCount)}
                  </span>
                )}
              </li>
            );
          })}
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
      <div className="imports-summary-actions">
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
          className="imports-text-action"
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
