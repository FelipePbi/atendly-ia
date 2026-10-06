"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { BffHttpError, type SettingsState } from "@/data";
import { PushedBar } from "@/shared/layout/PushedBar";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { useSystemStatus } from "@/shared/runtime/systemStatus";

const ACCOUNT_HREF = "/configuracoes/conta";
const DELETION_DAYS = 7;
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/**
 * Previsão do vencimento: o dia de hoje no fuso do negócio mais sete dias. O
 * vencimento que vale é o `dueAt` do servidor, que a tela de Conta mostra
 * depois do pedido.
 */
function deletionDateLabel(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "numeric",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const due = new Date(
    Date.UTC(part("year"), part("month") - 1, part("day") + DELETION_DAYS),
  );
  return `Em ${new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(due)}`;
}

export function AccountDeletionScreen({
  settings,
}: {
  settings: SettingsState;
}) {
  const router = useRouter();
  const { accountDeletion, phase, refresh } = useSystemStatus();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = accountDeletion?.status;
  const redirecting = status === "SCHEDULED" || status === "PURGED";

  useEffect(() => {
    if (redirecting) router.replace(ACCOUNT_HREF);
  }, [redirecting, router]);

  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await getProductServices().account.requestDeletion(password);
    } catch (failure: unknown) {
      setBusy(false);
      setError(
        failure instanceof BffHttpError && failure.status === 401
          ? "Senha atual incorreta."
          : "Não foi possível pedir a exclusão agora. Tente novamente.",
      );
      return;
    }
    // O pedido já foi aceito: reler `GET /v1/status` é o único jeito de a tela
    // de Conta mostrar o vencimento real sem inventar um estado local.
    refresh();
    router.replace(ACCOUNT_HREF);
  }

  const timezone = settings.business?.timezone ?? DEFAULT_TIMEZONE;
  const canRequest = status === "NONE" || status === "CANCELLED";

  return (
    <section className="settings-page is-pushed">
      <PushedBar
        backHref={ACCOUNT_HREF}
        backLabel="Voltar para Conta"
        headingLevel="h2"
        hideBackWide
        title="Excluir conta"
      />
      {canRequest ? (
        <form
          className="deletion-screen"
          onSubmit={(event) => void requestDeletion(event)}
        >
          <div className="deletion-body">
            <div className="deletion-intro">
              <h1>Excluir sua conta na Avenly?</h1>
              <p>
                Você tem 7 dias para mudar de ideia. Depois disso, a exclusão é
                definitiva.
              </p>
            </div>
            <ol className="deletion-timeline">
              <li className="deletion-step">
                <span aria-hidden="true" className="deletion-step-mark">
                  1
                </span>
                <div className="deletion-step-text">
                  <span className="deletion-step-title">Hoje</span>
                  <span className="deletion-step-copy">
                    Sua IA para de atender e o WhatsApp é desconectado. Nenhum
                    cliente recebe aviso.
                  </span>
                </div>
              </li>
              <li className="deletion-step">
                <span aria-hidden="true" className="deletion-step-mark">
                  2
                </span>
                <div className="deletion-step-text">
                  <span className="deletion-step-title">Próximos 7 dias</span>
                  <span className="deletion-step-copy">
                    Para desistir, basta entrar de novo e tocar em “Cancelar
                    exclusão”. Ao voltar, você reconecta o WhatsApp e refaz o
                    teste.
                  </span>
                </div>
              </li>
              <li className="deletion-step is-final">
                <span aria-hidden="true" className="deletion-step-mark">
                  3
                </span>
                <div className="deletion-step-text">
                  <span className="deletion-step-title">
                    {deletionDateLabel(timezone)}
                  </span>
                  <span className="deletion-step-copy">
                    Clientes, agenda, serviços e conversas são apagados de
                    forma definitiva.
                  </span>
                </div>
              </li>
            </ol>
            <label className="deletion-field">
              <span className="deletion-field-label">
                Confirme com sua senha
              </span>
              <input
                autoComplete="current-password"
                className="deletion-input"
                name="password"
                placeholder="Sua senha"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && (
              <p className="deletion-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="deletion-footer">
            <button
              className="settings-sheet-confirm is-danger"
              disabled={!password || busy}
              type="submit"
            >
              {busy ? "Pedindo exclusão..." : "Excluir minha conta"}
            </button>
            <button
              className="settings-sheet-cancel"
              disabled={busy}
              type="button"
              onClick={() => router.push(ACCOUNT_HREF)}
            >
              Voltar
            </button>
          </div>
        </form>
      ) : (
        <div className="deletion-screen">
          <div className="deletion-body">
            {!redirecting && !accountDeletion && phase === "loading" ? (
              <p aria-hidden="true" className="deletion-state">
                Carregando o estado da exclusão...
              </p>
            ) : !redirecting ? (
              <p className="deletion-state" role="alert">
                Não foi possível carregar o estado da exclusão agora. Atualize a
                página e tente de novo.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
