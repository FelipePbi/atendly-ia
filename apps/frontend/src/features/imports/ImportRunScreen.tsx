"use client";

import { useEffect, useRef, useState } from "react";

import { BffHttpError } from "@/data";
import { schedulingRefusalCode } from "@/data/http/schedulingRefusal";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { StatePanel } from "@/shared/ui/States";

import { newIdempotencyKey } from "./idempotency";
import { ImportConflictsScreen } from "./ImportConflictsScreen";
import { ImportsPage, ReplaceAccountZone } from "./ImportsLayout";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  failedReasonLabel,
  formatImportDateTime,
  IMPORT_PENDING_TITLE,
  importCountFormatter,
  importedCardCount,
  importedCardHint,
  importReviewCopy,
  notImportedSentence,
  PENDING_ITEMS_READ_FAILED,
  PENDING_PANEL_NOTE,
  PENDING_PANEL_NOTE_FAILED_ONLY,
  pendingMoreLabel,
  pendingNotProcessedLabel,
  pendingPanelHeading,
  SINGLE_IMPORT_CONFIRMATION_LEAD,
  SINGLE_IMPORT_CONFIRMATION_TAIL,
  SINGLE_IMPORT_CONFIRMATION_TITLE,
  STATUS_LABELS,
  upstreamErrorCode,
  workErrorLabel,
} from "./labels";
import type {
  ImportCategory,
  ImportCompletion,
  ImportItem,
  ImportLiveSession,
  ImportProgress,
  ImportSessionStatus,
  ImportState,
} from "./types";

const PROGRESS_POLL_MS = 3_000;

/** Quantos itens em revisão o painel do 2.I8 mostra, no total das categorias. */
const PENDING_ITEMS_LIMIT = 5;

/** Terminais do domínio (Goal010): depois deles a sessão não muda mais. */
const TERMINAL_STATUSES = new Set<ImportSessionStatus>([
  "COMPLETED",
  "FAILED",
  "SUPERSEDED",
]);

/** `COMPLETABLE_STATUSES` do domínio: concluir só existe em `READY` e `PARTIAL`. */
const COMPLETABLE_STATUSES = new Set<ImportSessionStatus>(["READY", "PARTIAL"]);

type ProgressCategory = ImportProgress["categories"][number];

/**
 * O que ainda não entrou, com a mesma conta que o domínio faz para exigir o
 * aceite (`import-completion-service.ts`): `SKIPPED` não entra, porque deixar
 * de fora já foi decisão explícita do negócio e não precisa ser aceita de novo.
 */
function outstandingOf(counts: ImportProgress["counts"]): number {
  return counts.pending + counts.failed + counts.needsReview;
}

function totalOf(counts: ImportProgress["counts"]): number {
  return (
    counts.pending +
    counts.imported +
    counts.skipped +
    counts.failed +
    counts.needsReview
  );
}

/** Só linguagem de produto: `error.message` da origem nunca chega à tela. */
function completeErrorMessage(error: unknown): string {
  switch (schedulingRefusalCode(error)) {
    case "IMPORT_ALREADY_COMPLETED":
      return "Esta importação já foi concluída.";
    case "IMPORT_SESSION_NOT_COMPLETABLE":
      return "Esta importação ainda não pode ser concluída. Aguarde o fim do processamento.";
    default:
      break;
  }
  return "Não foi possível concluir agora. Nada foi concluído. Tente novamente.";
}

function retryErrorMessage(error: unknown): string {
  if (error instanceof BffHttpError && error.code === "UPSTREAM_ERROR") {
    switch (upstreamErrorCode(error)) {
      case "IMPORT_PREVIEW_STALE":
        return "Os dados do Minha Agenda mudaram desde esta análise. Nada foi importado nesta tentativa.";
      case "IMPORT_SESSION_NOT_EXECUTABLE":
        return "Esta importação já não aceita mais processamento.";
      default:
        return "Não foi possível continuar a importação agora. Tente novamente.";
    }
  }
  return "Não foi possível continuar a importação agora. Tente novamente.";
}

/**
 * A retomada pode ter chegado ao servidor mesmo quando o cliente só viu falha
 * (Goal061 §6). O estado relido é comparado ao último andamento lido: passada
 * em curso, outra fase, outro motivo gravado ou contagem diferente contam como
 * trabalho começado.
 */
function executionAdvanced(
  before: ImportProgress | null,
  after: ImportLiveSession | null,
): boolean {
  if (!after) return true;
  if (after.status === "EXECUTING" && !after.interrupted) return true;
  if (!before) return false;
  return (
    after.status !== before.status ||
    after.interrupted !== before.interrupted ||
    (after.lastError?.code ?? null) !== (before.lastError?.code ?? null) ||
    after.counts.pending !== before.counts.pending ||
    after.counts.imported !== before.counts.imported ||
    after.counts.failed !== before.counts.failed
  );
}

/**
 * O que sobrou em cada categoria, em linguagem de produto e sem inventar zero.
 * A tela em andamento (2.I7) não conta o que ainda não foi processado: a linha
 * já diz isso pelo estado e pela barra.
 */
function outstandingDetail(
  category: ProgressCategory,
  includePending = true,
): string {
  const parts: string[] = [];
  if (includePending && category.pending > 0) {
    parts.push(
      `${importCountFormatter.format(category.pending)} ainda não processados`,
    );
  }
  if (category.needsReview > 0) {
    parts.push(
      `${importCountFormatter.format(category.needsReview)} esperando sua decisão`,
    );
  }
  if (category.failed > 0) {
    parts.push(
      `${importCountFormatter.format(category.failed)} não importados`,
    );
  }
  return parts.join(" · ");
}

function orderedCategories(categories: ProgressCategory[]): ProgressCategory[] {
  const byCategory = new Map(
    categories.map((entry) => [entry.category, entry]),
  );
  return CATEGORY_ORDER.map((category) => byCategory.get(category)).filter(
    (entry): entry is ProgressCategory => entry !== undefined,
  );
}

/** `CATEGORY_LABELS` é minúsculo; o quadro do andamento (2.I7) pede o nome com maiúscula. */
function capitalized(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

type RowState = "done" | "active" | "queued";

const ROW_STATE_LABELS: Record<RowState, string> = {
  active: "em andamento",
  done: "concluída",
  queued: "na fila",
};

/**
 * Tela em andamento (2.I7): só quando o banco diz que há passada em curso. O
 * estado de cada linha sai das contagens, nunca de relógio nem de animação: a
 * execução é sequencial na ordem de `CATEGORY_ORDER`, então a categoria em
 * curso é a primeira da lista com `pending`, as de antes estão concluídas e as
 * de depois estão na fila. Horários de atendimento nunca mostram número.
 */
function ImportRunningBody({
  busy,
  categories,
  failedRead,
  imported,
  needsReview,
  onReview,
  processed,
  total,
}: {
  busy: boolean;
  categories: ProgressCategory[];
  failedRead: boolean;
  imported: number;
  needsReview: number;
  onReview: () => void;
  processed: number;
  total: number;
}) {
  const activeCategory = categories.find((category) => category.pending > 0);
  return (
    <div aria-busy={busy || undefined} className="imports-running">
      <div className="imports-running-total">
        <div className="imports-running-figures">
          <span className="imports-running-processed">
            {importCountFormatter.format(processed)}
          </span>
          <span className="imports-running-of">
            de {importCountFormatter.format(total)} registros
          </span>
        </div>
        <div
          aria-label="Andamento da importação"
          aria-valuemax={total}
          aria-valuemin={0}
          aria-valuenow={processed}
          aria-valuetext={`${importCountFormatter.format(processed)} de ${importCountFormatter.format(total)} registros processados`}
          className="imports-running-track"
          role="progressbar"
        >
          <span
            className="imports-running-fill"
            style={{
              width: total > 0 ? `${(processed / total) * 100}%` : "0%",
            }}
          />
        </div>
        <p aria-live="polite" className="sr-only">
          {importCountFormatter.format(processed)} de{" "}
          {importCountFormatter.format(total)} registros processados ·{" "}
          {importCountFormatter.format(imported)} importados
        </p>
      </div>
      {failedRead && (
        <p className="imports-note" role="status">
          A última leitura do andamento falhou. Os números acima são da leitura
          anterior.
        </p>
      )}
      <ul className="imports-running-list">
        {categories.map((category) => {
          const state: RowState =
            category.pending === 0
              ? "done"
              : category === activeCategory
                ? "active"
                : "queued";
          const categoryTotal = totalOf(category);
          const categoryProcessed = categoryTotal - category.pending;
          const showCount = category.category !== "AVAILABILITY";
          const detail = outstandingDetail(category, false);
          const name = (
            <>
              <strong>{capitalized(CATEGORY_LABELS[category.category])}</strong>
              <span className="sr-only">, {ROW_STATE_LABELS[state]}</span>
            </>
          );
          return (
            <li
              className={`imports-running-row is-${state}`}
              key={category.category}
            >
              {state === "done" && (
                <span
                  aria-hidden="true"
                  className="imports-running-mark is-done"
                >
                  <svg
                    fill="none"
                    height="13"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                    width="13"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              )}
              {state === "active" && (
                <span
                  aria-hidden="true"
                  className="imports-running-mark is-active"
                >
                  <span className="imports-running-halo" />
                  <span className="imports-running-dot" />
                </span>
              )}
              {state === "queued" && (
                <span
                  aria-hidden="true"
                  className="imports-running-mark is-queued"
                />
              )}
              {state === "active" ? (
                <div className="imports-running-body">
                  <div className="imports-running-line">
                    <span className="imports-running-name">{name}</span>
                    {showCount && (
                      <span className="imports-running-count">
                        {`${importCountFormatter.format(categoryProcessed)} de ${importCountFormatter.format(categoryTotal)}`}
                      </span>
                    )}
                  </div>
                  {detail && (
                    <small className="imports-running-detail">{detail}</small>
                  )}
                  <span aria-hidden="true" className="imports-running-bar">
                    <span
                      className="imports-running-bar-fill"
                      style={{
                        width: `${(categoryProcessed / categoryTotal) * 100}%`,
                      }}
                    />
                  </span>
                </div>
              ) : (
                <>
                  <span className="imports-running-name">
                    {name}
                    {detail && (
                      <small className="imports-running-detail">{detail}</small>
                    )}
                  </span>
                  {state === "done" && showCount && (
                    <span className="imports-running-count">
                      {importCountFormatter.format(categoryTotal)}
                    </span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {needsReview > 0 && (
        <div className="imports-running-footer">
          <button
            className="imports-text-action"
            type="button"
            onClick={onReview}
          >
            Revisar itens
          </button>
        </div>
      )}
    </div>
  );
}

/** Um item em revisão do painel do 2.I8, com a categoria em que foi lido. */
interface ReviewItem {
  category: ImportCategory;
  item: ImportItem;
}

/**
 * O resultado da leitura dos itens em revisão, preso ao andamento que a pediu:
 * um andamento novo faz o painel voltar a "lendo" sem estado a zerar.
 */
interface ReviewRead {
  failed: boolean;
  items: ReviewItem[];
  progress: ImportProgress;
}

/**
 * Tela parada (2.I8): a importação executada que ainda pode ser concluída. O
 * sucesso vem primeiro; o painel das pendências só existe com o que ainda não
 * entrou (`outstanding`) e traz até `PENDING_ITEMS_LIMIT` itens em revisão,
 * lidos da rota de itens. Falhas e o que não foi processado entram como linhas
 * sem ação: o quadro só desenha itens em revisão.
 */
function ImportPendingBody({
  categories,
  counts,
  onCorrect,
  read,
  sessionId,
}: {
  categories: ProgressCategory[];
  counts: ImportProgress["counts"];
  onCorrect: (category: ImportCategory) => void;
  sessionId: string;
  /** `null` enquanto a leitura dos itens em revisão não terminou. */
  read: ReviewRead | null;
}) {
  const outstanding = outstandingOf(counts);
  const reviewCategories = categories.filter(
    (category) => category.needsReview > 0,
  );
  const failedCategories = categories.filter((category) => category.failed > 0);
  const reading = counts.needsReview > 0 && read === null;
  const shown = read && !read.failed ? read.items : [];
  const hidden = read && !read.failed ? counts.needsReview - shown.length : 0;
  return (
    <div className="imports-pending">
      <div className="imports-pending-success">
        <span aria-hidden="true" className="imports-pending-seal">
          <svg
            fill="none"
            height="20"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            viewBox="0 0 24 24"
            width="20"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <div className="imports-pending-figures">
          <span className="imports-pending-count">
            {importedCardCount(counts.imported)}
          </span>
          <span className="imports-pending-hint">
            {importedCardHint(counts.imported)}
          </span>
        </div>
      </div>
      {outstanding > 0 && (
        <>
          <section
            aria-busy={reading || undefined}
            className="imports-pending-panel"
          >
            <div className="imports-pending-head">
              <svg
                aria-hidden="true"
                fill="none"
                height="18"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                viewBox="0 0 24 24"
                width="18"
              >
                <path d="M12 4 21 20H3z" />
                <path d="M12 10v4M12 17v.5" />
              </svg>
              <h2>{pendingPanelHeading(counts.needsReview, outstanding)}</h2>
            </div>
            <ul className="imports-pending-rows">
              {shown.map(({ category, item }) => {
                const copy = importReviewCopy(item.reasonCode, category);
                const name = item.label?.trim() || "Sem nome";
                return (
                  <li className="imports-pending-row" key={item.id}>
                    <div className="imports-pending-who">
                      <span className="imports-pending-name">{name}</span>
                      <span className="imports-pending-why">{copy.reason}</span>
                    </div>
                    <button
                      className="imports-pending-action"
                      type="button"
                      onClick={() => onCorrect(category)}
                    >
                      {copy.action} <span className="sr-only">{name}</span>
                    </button>
                  </li>
                );
              })}
              {hidden > 0 && (
                <li className="imports-pending-row">
                  <span className="imports-pending-why">
                    {pendingMoreLabel(hidden)}
                  </span>
                </li>
              )}
              {read?.failed &&
                reviewCategories.map((category) => (
                  <li className="imports-pending-row" key={category.category}>
                    <span className="imports-pending-name">
                      {`${importCountFormatter.format(category.needsReview)} ${CATEGORY_LABELS[category.category]}`}
                    </span>
                  </li>
                ))}
              {failedCategories.map((category) => (
                <li
                  className="imports-pending-row is-failed"
                  key={`failed-${category.category}`}
                >
                  <div className="imports-pending-who">
                    <span className="imports-pending-name">
                      {capitalized(CATEGORY_LABELS[category.category])}
                    </span>
                    <span className="imports-pending-why">
                      {`${importCountFormatter.format(category.failed)} não importados`}
                    </span>
                    {category.failedReasons.map((reason) => (
                      <span
                        className="imports-pending-why"
                        key={reason.reasonCode}
                      >
                        {`${failedReasonLabel(reason.reasonCode)} (${importCountFormatter.format(reason.count)})`}
                      </span>
                    ))}
                  </div>
                  <FailedItems
                    category={category.category}
                    failed={category.failed}
                    sessionId={sessionId}
                  />
                </li>
              ))}
              {counts.pending > 0 && (
                <li className="imports-pending-row">
                  <span className="imports-pending-name">
                    {pendingNotProcessedLabel(counts.pending)}
                  </span>
                </li>
              )}
            </ul>
            {read?.failed && (
              <p
                className="imports-pending-why imports-pending-read-failed"
                role="status"
              >
                {PENDING_ITEMS_READ_FAILED}
              </p>
            )}
          </section>
          <p className="imports-pending-note">
            {counts.needsReview === 0 && counts.pending === 0
              ? PENDING_PANEL_NOTE_FAILED_ONLY
              : PENDING_PANEL_NOTE}
          </p>
        </>
      )}
    </div>
  );
}

const FAILED_ITEMS_PAGE = 50;

/**
 * Os registros que não entraram, sob a linha da categoria (validação de
 * 2026-10-11): a pessoa via só a contagem e o motivo, sem saber quais eram.
 * Lê sob demanda, 50 por vez, só os itens `FAILED` da categoria.
 */
function FailedItems({
  category,
  failed,
  sessionId,
}: {
  category: ImportCategory;
  failed: number;
  sessionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const listId = `failed-items-${category}`;

  async function load(offset: number) {
    setLoading(true);
    setError(false);
    try {
      const page = await getProductServices().migration.listImportItems(
        sessionId,
        category,
        { limit: FAILED_ITEMS_PAGE, offset, status: "FAILED" },
      );
      setItems((current) => [...current, ...page.items]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        aria-controls={listId}
        aria-expanded={open}
        className="imports-pending-action imports-failed-toggle"
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && items.length === 0 && !loading) void load(0);
        }}
      >
        {open
          ? "Ocultar registros"
          : failed === 1
            ? "Ver qual registro ficou de fora"
            : `Ver quais registros ficaram de fora`}
      </button>
      {open && (
        <div
          aria-busy={loading || undefined}
          className="imports-failed-items"
          id={listId}
        >
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <span className="imports-pending-name">
                  {item.label?.trim() || "Sem nome"}
                </span>
                <span className="imports-pending-why">
                  {failedReasonLabel(item.reasonCode ?? "")}
                </span>
              </li>
            ))}
          </ul>
          {loading && (
            <p className="imports-pending-why">Carregando registros…</p>
          )}
          {error && (
            <p className="imports-pending-why" role="status">
              Não foi possível carregar os registros.{" "}
              <button
                className="imports-pending-action"
                type="button"
                onClick={() => void load(items.length)}
              >
                Tentar de novo
              </button>
            </p>
          )}
          {!loading && !error && items.length < failed && (
            <button
              className="imports-pending-action"
              type="button"
              onClick={() => void load(items.length)}
            >
              Ver mais
            </button>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Execução, progresso e conclusão (Goal020/WU-08). Cobre `session.status`
 * fora de `DRAFT | ANALYZING | READY`-sem-execução, que é a tela de preview.
 *
 * Três coisas que esta tela **não** faz, e cada uma delas seria uma mentira:
 * não soma progresso localmente (o número vem sempre de `GET .../progress`),
 * não continua lendo depois de um estado terminal e não envia `acceptPending`
 * sem a confirmação explícita do negócio.
 */
export function ImportRunScreen({
  onChanged,
  onReplaceAccount,
  session,
}: {
  onChanged: (state: ImportState) => void;
  onReplaceAccount: () => void;
  session: ImportLiveSession;
}) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [progressError, setProgressError] = useState(false);
  const [readToken, setReadToken] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  // A categoria que a ação de um item do 2.I8 abre; `null` abre a lista.
  const [reviewCategory, setReviewCategory] = useState<ImportCategory | null>(
    null,
  );
  const [reviewRead, setReviewRead] = useState<ReviewRead | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Uma tentativa de conclusão, uma chave — e a tentativa é definida pelo
  // corpo, não pela tela. Retentar o mesmo corpo reusa a chave, que é o que
  // torna segura a requisição que não se sabe se chegou. Mas aceitar as
  // pendências é outro corpo (`{acceptPending:true}` no lugar de `{}`), e o
  // domínio inclui esse campo no hash da idempotência: reusar a chave faria o
  // backend recusar por conflito e deixaria a decisão irreversível sem saída.
  const completionAttempt = useRef<{
    acceptPending: boolean;
    key: string;
  } | null>(null);
  // O guarda de dupla submissão é `ref`, não estado: dois cliques no mesmo
  // tick não esperam por re-render, e concluir duas vezes é irreversível.
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function read() {
      try {
        const next = await getProductServices().migration.getImportProgress(
          session.sessionId,
          controller.signal,
        );
        if (!active) return;
        setProgress(next);
        setProgressError(false);
        // Progresso é fato do banco: a leitura só segue enquanto o banco
        // disser que há passada em andamento. Todo estado terminal
        // (`COMPLETED`, `FAILED`, `SUPERSEDED`) cai aqui e a leitura para —
        // não há retomada silenciosa.
        if (next.status !== "EXECUTING") return;
        timer.current = setTimeout(() => void read(), PROGRESS_POLL_MS);
      } catch {
        if (!active) return;
        setProgressError(true);
      }
    }

    void read();
    return () => {
      active = false;
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [session.sessionId, readToken]);

  // Os itens em revisão do 2.I8: uma leitura por categoria com `needsReview`,
  // uma vez por leitura do andamento, só enquanto a sessão pode ser concluída.
  // Falha aqui nunca bloqueia nada: o painel diz que não listou e segue.
  useEffect(() => {
    if (
      !progress ||
      progress.interrupted ||
      !COMPLETABLE_STATUSES.has(progress.status)
    ) {
      return;
    }
    const targets = orderedCategories(progress.categories).filter(
      (category) => category.needsReview > 0,
    );
    if (targets.length === 0) return;
    const controller = new AbortController();
    async function readItems(current: ImportProgress) {
      try {
        const pages = await Promise.all(
          targets.map((category) =>
            getProductServices().migration.listImportItems(
              session.sessionId,
              category.category,
              { limit: PENDING_ITEMS_LIMIT, status: "NEEDS_REVIEW" },
              controller.signal,
            ),
          ),
        );
        if (controller.signal.aborted) return;
        setReviewRead({
          failed: false,
          items: pages
            .flatMap((page, index) =>
              page.items.map((item) => ({
                category: targets[index].category,
                item,
              })),
            )
            .slice(0, PENDING_ITEMS_LIMIT),
          progress: current,
        });
      } catch {
        if (controller.signal.aborted) return;
        setReviewRead({ failed: true, items: [], progress: current });
      }
    }
    void readItems(progress);
    return () => controller.abort();
  }, [progress, session.sessionId]);

  async function settleCompleted(completion: ImportCompletion) {
    try {
      onChanged(await getProductServices().migration.getImportState());
    } catch {
      // A conclusão já aconteceu e é irreversível: uma falha de leitura
      // depois dela não pode virar "tente de novo". O histórico sai da
      // própria resposta da conclusão.
      onChanged({
        history: {
          ...completion,
          finishedAt: progress?.finishedAt ?? session.finishedAt,
          startedAt: progress?.startedAt ?? session.startedAt,
        },
        right: {
          available: false,
          completedAt: completion.completedAt,
          sessionId: completion.sessionId,
        },
        session: null,
      });
    }
  }

  async function runComplete(acceptPending: boolean) {
    if (submitting.current) return;
    submitting.current = true;
    setCompleting(true);
    setCompleteError(null);
    if (
      !completionAttempt.current ||
      completionAttempt.current.acceptPending !== acceptPending
    ) {
      completionAttempt.current = { acceptPending, key: newIdempotencyKey() };
    }
    try {
      const completion = await getProductServices().migration.completeImport(
        session.sessionId,
        acceptPending ? { acceptPending: true } : {},
        completionAttempt.current.key,
      );
      setConfirmOpen(false);
      await settleCompleted(completion);
    } catch (caught: unknown) {
      submitting.current = false;
      setCompleting(false);
      if (
        schedulingRefusalCode(caught) === "IMPORT_PENDING_ACCEPTANCE_REQUIRED"
      ) {
        // O banco viu pendência que a última leitura não tinha. A resposta é
        // pedir a confirmação ao negócio, nunca reenviar `acceptPending` por
        // conta própria.
        setConfirmOpen(true);
        return;
      }
      setCompleteError(completeErrorMessage(caught));
    }
  }

  async function retryPending(previewVersion: number) {
    setRetrying(true);
    setRetryError(null);
    // Ler enquanto executa: o progresso da retomada é o mesmo fato do banco.
    setReadToken((value) => value + 1);
    try {
      await getProductServices().migration.executeImport(
        session.sessionId,
        { previewVersion },
        newIdempotencyKey(),
      );
    } catch (caught: unknown) {
      // Incerteza não é falha (Goal061 §6): rede, timeout ou 5xx não dizem se
      // a retomada chegou ao servidor. Relê o estado antes de decidir; o erro
      // só aparece quando o estado relido mostra que nada começou.
      let next: ImportState | null = null;
      try {
        next = await getProductServices().migration.getImportState();
      } catch {
        // A checagem também falhou: cai no erro da retomada abaixo.
      }
      if (next && !next.session) {
        onChanged(next);
      } else if (!next || !executionAdvanced(progress, next.session)) {
        setRetryError(retryErrorMessage(caught));
      }
    } finally {
      setRetrying(false);
      setReadToken((value) => value + 1);
    }
  }

  if (!progress && progressError) {
    return (
      <ImportsPage
        description="Nada foi alterado na sua importação."
        title="Continuar importação"
      >
        <StatePanel
          description="Não foi possível ler o andamento da importação agora."
          icon="alert"
          onAction={() => setReadToken((value) => value + 1)}
          actionLabel="Tentar de novo"
          title="Andamento indisponível"
          tone="error"
        />
        <ReplaceAccountZone onReplace={onReplaceAccount} />
      </ImportsPage>
    );
  }

  if (!progress) {
    return (
      <ImportsPage
        description="Estamos lendo o andamento da sua importação."
        title="Continuar importação"
      >
        <div className="imports-panel" aria-busy="true">
          <p className="imports-note">Lendo o andamento da importação…</p>
        </div>
        <ReplaceAccountZone onReplace={onReplaceAccount} />
      </ImportsPage>
    );
  }

  const categories = orderedCategories(progress.categories);
  const outstandingCategories = categories.filter(
    (category) => outstandingOf(category) > 0,
  );
  const conflictCategories = categories
    .filter((category) => category.needsReview > 0)
    .map((category) => ({
      category: category.category,
      needsReviewCount: category.needsReview,
    }));

  if (reviewing) {
    return (
      <ImportConflictsScreen
        categories={conflictCategories}
        initialCategory={reviewCategory ?? undefined}
        onBack={() => {
          setReviewing(false);
          setReviewCategory(null);
          setReadToken((value) => value + 1);
        }}
        readyCount={progress.counts.imported}
        sessionId={session.sessionId}
      />
    );
  }

  const startedAt = formatImportDateTime(
    progress.startedAt ?? session.startedAt,
  );
  // Interrompida: o lease sumiu sem o trabalho terminar (Goal061 §6). Não é
  // mais "em andamento" de fato, mesmo que `status` ainda diga `EXECUTING`.
  const interrupted = progress.interrupted;
  const causeMessage = progress.lastError
    ? workErrorLabel(progress.lastError.code)
    : null;
  const executing =
    (progress.status === "EXECUTING" && !interrupted) || retrying;
  const terminal = TERMINAL_STATUSES.has(progress.status);
  const completable = COMPLETABLE_STATUSES.has(progress.status) && !executing;
  const outstanding = outstandingOf(progress.counts);
  const total = totalOf(progress.counts);
  const processed = total - progress.counts.pending;
  // A tela em andamento (2.I7) só existe com passada em curso de verdade.
  const running = executing && !interrupted;
  // A tela parada (2.I8): pode ser concluída e nada está em curso nem parou no
  // meio. Interrompida e terminal seguem a tela de sempre.
  const pendingView = completable && !interrupted;
  const pendingRead = reviewRead?.progress === progress ? reviewRead : null;
  // A lista segue a ordem da execução e não mostra o que o negócio deixou de
  // fora na escolha. O estado de cada linha vem só das contagens.
  const deselected = new Set(
    session.categories
      .filter((category) => !category.selected)
      .map((category) => category.category),
  );
  const runningCategories = categories.filter(
    (category) => !deselected.has(category.category) && totalOf(category) > 0,
  );

  return (
    <>
      <ImportsPage
        description={
          pendingView
            ? undefined
            : interrupted
              ? "Nada do que já entrou foi perdido."
              : executing
                ? "Leva alguns minutos."
                : terminal
                  ? "Esta importação não continua de onde parou."
                  : "Você já tem uma importação em andamento. Continue de onde parou."
        }
        eyebrow={!running}
        title={
          pendingView
            ? IMPORT_PENDING_TITLE
            : interrupted
              ? "Isso parou no meio do caminho"
              : executing
                ? "Importando…"
                : terminal
                  ? "Esta importação não pode continuar"
                  : "Continuar importação"
        }
      >
        {interrupted && (
          <div className="imports-panel" role="status">
            <p className="imports-note">
              {causeMessage ??
                "A importação parou no meio do caminho. Nada do que já entrou foi perdido."}
            </p>
            <div className="imports-actions">
              <button
                className="btn btn-primary"
                disabled={retrying}
                type="button"
                onClick={() => void retryPending(progress.previewVersion)}
              >
                {retrying ? "Continuando..." : "Continuar"}
              </button>
            </div>
          </div>
        )}

        {pendingView ? (
          <ImportPendingBody
            categories={categories}
            counts={progress.counts}
            onCorrect={(category) => {
              setReviewCategory(category);
              setReviewing(true);
            }}
            read={pendingRead}
            sessionId={session.sessionId}
          />
        ) : running ? (
          <ImportRunningBody
            busy={executing}
            categories={runningCategories}
            failedRead={progressError}
            imported={progress.counts.imported}
            needsReview={progress.counts.needsReview}
            onReview={() => setReviewing(true)}
            processed={processed}
            total={total}
          />
        ) : (
          <>
            <div className="imports-panel" aria-busy={executing || undefined}>
              <div className="imports-panel-header">
                <h2>{STATUS_LABELS[progress.status]}</h2>
                <p>
                  Minha Agenda
                  {session.sourceAccountLabel
                    ? ` · ${session.sourceAccountLabel}`
                    : ""}
                  {startedAt ? ` · desde ${startedAt}` : ""}
                </p>
              </div>
              <div
                aria-label="Andamento da importação"
                aria-valuemax={total}
                aria-valuemin={0}
                aria-valuenow={processed}
                aria-valuetext={`${importCountFormatter.format(processed)} de ${importCountFormatter.format(total)} registros processados`}
                className="imports-progress-track"
                role="progressbar"
              >
                <span
                  className="imports-progress-fill"
                  style={{
                    width: total > 0 ? `${(processed / total) * 100}%` : "0%",
                  }}
                />
              </div>
              <p aria-live="polite" className="imports-progress-summary">
                {importCountFormatter.format(processed)} de{" "}
                {importCountFormatter.format(total)} registros processados ·{" "}
                {importCountFormatter.format(progress.counts.imported)}{" "}
                importados
              </p>
              {progressError && (
                <p className="imports-note" role="status">
                  A última leitura do andamento falhou. Os números acima são da
                  leitura anterior.
                </p>
              )}
            </div>

            {outstanding > 0 && (
              <div className="imports-panel">
                <div className="imports-panel-header">
                  <h2>
                    O que ainda não entrou (
                    {importCountFormatter.format(outstanding)})
                  </h2>
                  <p>
                    {progress.counts.failed > 0
                      ? "Itens que falharam não são tentados de novo nesta importação."
                      : "Nada aqui foi descartado: cada item continua nesta sessão."}
                  </p>
                </div>
                <ul className="imports-rows">
                  {outstandingCategories.map((category) => (
                    <li key={category.category}>
                      <div>
                        <strong>{CATEGORY_LABELS[category.category]}</strong>
                        <small>{outstandingDetail(category)}</small>
                        {category.failed > 0 &&
                          category.failedReasons.length > 0 && (
                            <ul className="imports-failed-reasons">
                              {category.failedReasons.map((reason) => (
                                <li key={reason.reasonCode}>
                                  {`${failedReasonLabel(reason.reasonCode)} (${importCountFormatter.format(reason.count)})`}
                                </li>
                              ))}
                            </ul>
                          )}
                      </div>
                      <span className="imports-row-count">
                        {importCountFormatter.format(outstandingOf(category))}
                      </span>
                    </li>
                  ))}
                </ul>
                {progress.counts.needsReview > 0 && (
                  <div className="imports-actions">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setReviewing(true)}
                    >
                      Revisar itens
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {retryError && (
          <p className="field-help" role="alert">
            {retryError}
          </p>
        )}
        {completeError && (
          <p className="field-help" role="alert">
            {completeError}
          </p>
        )}

        {pendingView && progressError && (
          <p className="imports-note" role="status">
            A última leitura do andamento falhou. Os números acima são da
            leitura anterior.
          </p>
        )}

        {completable && (
          <div
            className={
              pendingView
                ? "imports-pending-footer"
                : "imports-actions is-stacked"
            }
          >
            {progress.counts.pending > 0 && (
              <button
                className="btn btn-primary"
                disabled={retrying || completing}
                type="button"
                onClick={() => void retryPending(progress.previewVersion)}
              >
                {retrying
                  ? "Importando..."
                  : `Importar os ${importCountFormatter.format(progress.counts.pending)} que faltam`}
              </button>
            )}
            <button
              className={
                progress.counts.pending > 0
                  ? "btn btn-secondary"
                  : "btn btn-primary"
              }
              disabled={completing || retrying}
              type="button"
              onClick={() => {
                if (outstanding > 0) {
                  setConfirmOpen(true);
                  return;
                }
                void runComplete(false);
              }}
            >
              {/* Quem está ocupada é a confirmação, quando ela está aberta:
                  dois botões dizendo "Concluindo..." ao mesmo tempo não dizem
                  qual deles é a decisão. */}
              {completing && !confirmOpen
                ? "Concluindo..."
                : "Concluir importação"}
            </button>
            {pendingView && progress.counts.needsReview > 0 && (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setReviewing(true)}
              >
                Revisar pendências
              </button>
            )}
          </div>
        )}

        {/* Em andamento e na tela parada (quase concluída) a troca de conta
            sai da tela (validação de 2026-10-11); fica nos estados
            interrompido, terminal e de continuação. */}
        {!running && !pendingView && (
          <ReplaceAccountZone onReplace={onReplaceAccount} />
        )}
      </ImportsPage>

      <Dialog
        onClose={() => {
          if (completing) return;
          setConfirmOpen(false);
        }}
        open={confirmOpen}
        title={SINGLE_IMPORT_CONFIRMATION_TITLE}
        variant="sheet"
      >
        <div className="imports-confirm">
          <p className="imports-confirm-copy">
            {SINGLE_IMPORT_CONFIRMATION_LEAD}{" "}
            <strong>{notImportedSentence(outstanding)}</strong>{" "}
            {SINGLE_IMPORT_CONFIRMATION_TAIL}
          </p>
          {completeError && (
            <p className="field-help" role="alert">
              {completeError}
            </p>
          )}
          <div className="imports-confirm-actions">
            <button
              className="btn btn-primary"
              disabled={completing}
              type="button"
              onClick={() => void runComplete(true)}
            >
              {completing ? "Concluindo..." : "Concluir importação"}
            </button>
            <button
              className="btn btn-secondary"
              disabled={completing}
              type="button"
              onClick={() => setConfirmOpen(false)}
            >
              Voltar e revisar
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
