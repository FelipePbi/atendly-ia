"use client";

import { useState } from "react";

import {
  BffHttpError,
  type CustomerSummary as CustomerSummaryRecord,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Spinner } from "@/shared/ui/Spinner";

type CustomerSummaryProps = { customerId: string };

export function CustomerSummary({ customerId }: CustomerSummaryProps) {
  const [summary, setSummary] = useState<CustomerSummaryRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const result =
        await getProductServices().customers.generateSummary(customerId);
      setSummary(result);
    } catch (caught: unknown) {
      setError(requestError(caught, "Não foi possível gerar o resumo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Resumo por IA" className="directory-section">
      <div className="directory-section-header">
        <div>
          <h2>Resumo por IA</h2>
          <p>
            Gerado sob demanda. Cobre apenas observações, tags e memórias
            autorizadas para uso pela IA, além dos próximos atendimentos.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void generate()}
          type="button"
        >
          <Icon name="spark" />
          {busy ? "Gerando..." : summary ? "Gerar novamente" : "Gerar resumo"}
        </button>
      </div>

      {error && (
        <div className="customer-inline-error" role="alert">
          {error}
        </div>
      )}

      {busy && !summary && <Spinner label="Gerando resumo" />}

      {!summary && !busy && !error && (
        <p className="muted small">Nenhum resumo gerado ainda.</p>
      )}

      {summary && (
        <>
          <p className="customer-summary-text">{summary.summary}</p>
          <p className="customer-summary-note">
            Considerou apenas material autorizado: {summary.sources.memory}{" "}
            item(ns) de memória, {summary.sources.notes} observação(ões) e{" "}
            {summary.sources.tags} tag(s) autorizadas, além de{" "}
            {summary.sources.upcomingAppointments} atendimento(s) futuro(s).
          </p>
        </>
      )}
    </section>
  );
}

function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    OPERATION_MANAGED_EXTERNALLY:
      "Esta ação deve ser realizada na fonte oficial.",
    NETWORK_ERROR: "Não foi possível acessar a Atendly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}
