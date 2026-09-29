"use client";

import { useState } from "react";

import {
  appointmentStatusLabel,
  BffHttpError,
  type CustomerAppointmentStats,
  type CustomerAppointmentSummary,
  type CustomerSummary as CustomerSummaryRecord,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Spinner } from "@/shared/ui/Spinner";

type CustomerSummaryProps = {
  customerId: string;
  nextAppointment?: CustomerAppointmentSummary | null;
  stats?: CustomerAppointmentStats;
};

export function CustomerSummary({
  customerId,
  nextAppointment,
  stats,
}: CustomerSummaryProps) {
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
    <section aria-label="Resumo" className="directory-section">
      <div className="directory-section-header">
        <div>
          <h2>Números</h2>
        </div>
      </div>
      {stats ? (
        <div className="customer-stat-grid">
          <div className="customer-stat">
            <strong>{stats.completed}</strong>
            <span>atendimentos</span>
          </div>
          <div className="customer-stat">
            <strong>{intervalWeeksLabel(stats.averageIntervalDays)}</strong>
            <span>a cada</span>
          </div>
          <div className="customer-stat">
            <strong>{stats.noShows}</strong>
            <span>faltas</span>
          </div>
          <div className="customer-stat">
            <strong>{stats.cancelled}</strong>
            <span>
              {stats.cancelled === 1 ? "cancelamento" : "cancelamentos"}
            </span>
          </div>
        </div>
      ) : (
        <p className="muted small">Ainda sem números de atendimento.</p>
      )}

      {nextAppointment && (
        <p className="customer-summary-note">
          Próximo atendimento: {formatAppointmentDate(nextAppointment.date)}{" "}
          às {nextAppointment.startTime} ·{" "}
          {appointmentStatusLabel(nextAppointment.status)}
        </p>
      )}

      <div className="directory-section-header">
        <div>
          <h2>Resumo da IA</h2>
          <p>
            Gerado sob demanda, só a partir de observações, tags e
            preferências autorizadas para uso pela IA, além dos próximos
            atendimentos.
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
            item(ns) de preferência, {summary.sources.notes} observação(ões) e{" "}
            {summary.sources.tags} tag(s) autorizadas, além de{" "}
            {summary.sources.upcomingAppointments} atendimento(s) futuro(s).
          </p>
        </>
      )}
    </section>
  );
}

function intervalWeeksLabel(averageIntervalDays: number | null): string {
  if (averageIntervalDays === null) return "—";
  const weeks = Math.round(averageIntervalDays / 7);
  return `${weeks} sem`;
}

function formatAppointmentDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    NETWORK_ERROR: "Não foi possível acessar a Atendly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}
