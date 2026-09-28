"use client";

import { type ReactNode, useEffect, useState } from "react";

import { useShellConfig } from "@/shared/layout/ShellConfig";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { StatePanel } from "@/shared/ui/States";

import { ConnectSourceScreen } from "./ConnectSourceScreen";
import { ImportHistoryCard } from "./ImportHistoryCard";
import { ImportPreviewScreen } from "./ImportPreviewScreen";
import { ImportRunScreen } from "./ImportRunScreen";
import { ImportsLoading, ImportsPage } from "./ImportsLayout";
import type {
  ImportHistory,
  ImportLiveSession,
  ImportState,
} from "./types";

/**
 * Etapa de análise/preview (WU-06): a sessão ainda não teve nenhuma passada de
 * execução. `READY` está dos dois lados — é o estado de antes da primeira
 * passada e também o de uma passada que terminou sem deixar pendência —, e
 * quem separa os dois é `startedAt`, que só a reivindicação da execução
 * escreve. Depois dela a tela é a da execução, nunca mais a da análise.
 */
function isPreviewStage(session: ImportLiveSession): boolean {
  if (session.status === "DRAFT" || session.status === "ANALYZING") return true;
  return session.status === "READY" && session.startedAt === null;
}

export type ImportStateReader = {
  error: boolean;
  retry: () => void;
  setState: (state: ImportState) => void;
  state: ImportState | null;
};

/**
 * Leitura do estado da importação (Goal020): só `getImportState`, nunca uma
 * tentativa de abrir sessão. Compartilhada por `/importacao` e pela etapa
 * `importacao` do onboarding (Goal066), que decidem a tela do mesmo jeito.
 */
export function useImportState(): ImportStateReader {
  const [state, setState] = useState<ImportState | null>(null);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .migration.getImportState(controller.signal)
      .then(setState)
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      });
    return () => controller.abort();
  }, [reloadToken]);

  function retry() {
    setState(null);
    setError(false);
    setReloadToken((value) => value + 1);
  }

  return { error, retry, setState, state };
}

/**
 * Ponto de entrada do módulo (Goal020): o estado lido decide a tela, nunca
 * uma tentativa de abrir sessão. Uma única chamada de `useShellConfig` por
 * árvore — as telas filhas (`ConnectSourceScreen`, `ResumeSessionScreen`,
 * `ImportHistoryScreen`) nunca chamam o hook.
 */
export function ImportsScreen() {
  const reader = useImportState();

  useShellConfig({
    active: "importacao",
    loading: !reader.state && !reader.error,
    module: "migration",
    title: "Importação",
  });

  return <ImportsFlow reader={reader} />;
}

/**
 * As telas da importação, escolhidas pelo estado lido (Goal020), sem
 * moldura própria: quem monta decide a moldura (`/importacao` no shell da
 * plataforma, ou a etapa `importacao` do onboarding, Goal066) e, com a
 * importação concluída, o que aparece junto do resultado.
 */
export function ImportsFlow({
  historyActions,
  reader,
}: {
  historyActions?: ReactNode;
  reader: ImportStateReader;
}) {
  const { error, retry, setState, state } = reader;

  if (!state && !error) return <ImportsLoading />;

  if (error || !state) {
    return (
      <ImportsPage
        description="Não foi possível carregar o estado da sua importação."
        title="Importação"
      >
        <StatePanel
          description="Nada foi alterado. Tente carregar a página novamente."
          icon="alert"
          onAction={retry}
          actionLabel="Tentar de novo"
          title="Importação indisponível"
          tone="error"
        />
      </ImportsPage>
    );
  }

  if (state.history) {
    return (
      <ImportHistoryScreen history={state.history}>
        {historyActions}
      </ImportHistoryScreen>
    );
  }
  if (state.session) {
    return <ResumeSessionScreen session={state.session} onChanged={setState} />;
  }
  return <ConnectSourceScreen onConnected={setState} />;
}

function ResumeSessionScreen({
  onChanged,
  session,
}: {
  onChanged: (state: ImportState) => void;
  session: ImportLiveSession;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);

  if (replacing) {
    return (
      <ConnectSourceScreen
        replace
        onCancel={() => setReplacing(false)}
        onConnected={onChanged}
      />
    );
  }

  const totalFound =
    session.counts.pending +
    session.counts.imported +
    session.counts.skipped +
    session.counts.failed +
    session.counts.needsReview;
  return (
    <>
      {isPreviewStage(session) ? (
        <ImportPreviewScreen
          onChanged={onChanged}
          onReplaceAccount={() => setConfirmOpen(true)}
          session={session}
        />
      ) : (
        <ImportRunScreen
          onChanged={onChanged}
          onReplaceAccount={() => setConfirmOpen(true)}
          session={session}
        />
      )}
      <Dialog
        eyebrow="Isto não pode ser desfeito"
        onClose={() => setConfirmOpen(false)}
        open={confirmOpen}
        title="Descartar esta importação?"
      >
        <p className="settings-modal-copy">
          A importação em andamento{" "}
          {totalFound > 0 ? `(${totalFound} registros encontrados) ` : ""}
          será descartada para conectar outra conta do Minha Agenda.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setConfirmOpen(false)}
          >
            Continuar esta importação
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              setConfirmOpen(false);
              setReplacing(true);
            }}
          >
            Descartar e conectar outra conta
          </button>
        </div>
      </Dialog>
    </>
  );
}

function ImportHistoryScreen({
  children,
  history,
}: {
  children?: ReactNode;
  history: ImportHistory;
}) {
  return (
    <ImportsPage
      description="Sua única importação do Minha Agenda. Não é possível importar novamente."
      title="Importação"
    >
      <ImportHistoryCard history={history} />
      {children}
    </ImportsPage>
  );
}
