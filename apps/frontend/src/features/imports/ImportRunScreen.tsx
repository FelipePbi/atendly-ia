"use client";

import { useEffect, useRef, useState } from "react";

import { BffHttpError } from "@/data";
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
  importCountFormatter,
  SINGLE_IMPORT_CONFIRMATION_BODY,
  SINGLE_IMPORT_CONFIRMATION_TITLE,
  STATUS_LABELS,
  upstreamErrorCode,
  workErrorLabel,
} from "./labels";
import type {
  ImportCompletion,
  ImportLiveSession,
  ImportProgress,
  ImportSessionStatus,
  ImportState,
} from "./types";

const PROGRESS_POLL_MS = 3_000;

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
  if (error instanceof BffHttpError) {
    switch (error.code) {
      case "IMPORT_ALREADY_COMPLETED":
        return "Esta importação já foi concluída.";
      case "IMPORT_SESSION_NOT_COMPLETABLE":
        return "Esta importação ainda não pode ser concluída. Aguarde o fim do processamento.";
      default:
        return "Não foi possível concluir agora. Nada foi concluído. Tente novamente.";
    }
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

/** O que sobrou em cada categoria, em linguagem de produto e sem inventar zero. */
function outstandingDetail(category: ProgressCategory): string {
  const parts: string[] = [];
  if (category.pending > 0) {
    parts.push(`${importCountFormatter.format(category.pending)} ainda não processados`);
  }
  if (category.needsReview > 0) {
    parts.push(
      `${importCountFormatter.format(category.needsReview)} esperando sua decisão`,
    );
  }
  if (category.failed > 0) {
    parts.push(`${importCountFormatter.format(category.failed)} não importados`);
  }
  return parts.join(" · ");
}

function orderedCategories(categories: ProgressCategory[]): ProgressCategory[] {
  const byCategory = new Map(categories.map((entry) => [entry.category, entry]));
  return CATEGORY_ORDER.map((category) => byCategory.get(category)).filter(
    (entry): entry is ProgressCategory => entry !== undefined,
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
  const completionAttempt = useRef<{ acceptPending: boolean; key: string } | null>(
    null,
  );
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
        caught instanceof BffHttpError &&
        caught.code === "IMPORT_PENDING_ACCEPTANCE_REQUIRED"
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
        onBack={() => {
          setReviewing(false);
          setReadToken((value) => value + 1);
        }}
        sessionId={session.sessionId}
      />
    );
  }

  const startedAt = formatImportDateTime(progress.startedAt ?? session.startedAt);
  // Interrompida: o lease sumiu sem o trabalho terminar (Goal061 §6). Não é
  // mais "em andamento" de fato, mesmo que `status` ainda diga `EXECUTING`.
  const interrupted = progress.interrupted;
  const causeMessage = progress.lastError ? workErrorLabel(progress.lastError.code) : null;
  const executing = (progress.status === "EXECUTING" && !interrupted) || retrying;
  const terminal = TERMINAL_STATUSES.has(progress.status);
  const completable = COMPLETABLE_STATUSES.has(progress.status) && !executing;
  const outstanding = outstandingOf(progress.counts);
  const total = totalOf(progress.counts);
  const processed = total - progress.counts.pending;

  return (
    <>
      <ImportsPage
        description={
          interrupted
            ? "Nada do que já entrou foi perdido."
            : executing
              ? "Estamos trazendo seus dados do Minha Agenda. Isso pode levar alguns minutos."
              : terminal
                ? "Esta importação não continua de onde parou."
                : "Você já tem uma importação em andamento. Continue de onde parou."
        }
        title={
          interrupted
            ? "Isso parou no meio do caminho"
            : executing
              ? "Importando seus dados"
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

        <div className="imports-panel" aria-busy={executing || undefined}>
          <div className="imports-panel-header">
            <h2>{STATUS_LABELS[progress.status]}</h2>
            <p>
              Minha Agenda
              {session.sourceAccountLabel ? ` · ${session.sourceAccountLabel}` : ""}
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
              style={{ width: total > 0 ? `${(processed / total) * 100}%` : "0%" }}
            />
          </div>
          <p aria-live="polite" className="imports-progress-summary">
            {importCountFormatter.format(processed)} de{" "}
            {importCountFormatter.format(total)} registros processados ·{" "}
            {importCountFormatter.format(progress.counts.imported)} importados
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
                    {category.failed > 0 && category.failedReasons.length > 0 && (
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

        {completable && (
          <div className="imports-actions is-stacked">
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
              {completing && !confirmOpen ? "Concluindo..." : "Concluir importação"}
            </button>
          </div>
        )}

        <ReplaceAccountZone onReplace={onReplaceAccount} />
      </ImportsPage>

      <Dialog
        eyebrow="Isto não pode ser desfeito"
        onClose={() => {
          if (completing) return;
          setConfirmOpen(false);
        }}
        open={confirmOpen}
        title={SINGLE_IMPORT_CONFIRMATION_TITLE}
      >
        <p className="settings-modal-copy">{SINGLE_IMPORT_CONFIRMATION_BODY}</p>
        <p className="imports-note">
          {importCountFormatter.format(outstanding)} registro(s) não serão
          importados.
        </p>
        {completeError && (
          <p className="field-help" role="alert">
            {completeError}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={completing}
            type="button"
            onClick={() => setConfirmOpen(false)}
          >
            Revisar antes de concluir
          </button>
          <button
            className="btn btn-danger"
            disabled={completing}
            type="button"
            onClick={() => void runComplete(true)}
          >
            {completing ? "Concluindo..." : "Concluir mesmo assim"}
          </button>
        </div>
      </Dialog>
    </>
  );
}
