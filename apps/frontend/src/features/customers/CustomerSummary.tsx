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
  stats?: CustomerAppointmentStats;
};

export function CustomerSummary({ customerId, stats }: CustomerSummaryProps) {
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
    <section aria-label="Resumo" className="resume-main">
      <div className="resume-ai">
        <span className="resume-label">
          <span aria-hidden="true" className="resume-dot" />
          Resumo da IA
        </span>
        {summary && (
          <>
            <p className="resume-ai-text">{summary.summary}</p>
            <p className="resume-ai-hint">
              Considerou apenas material autorizado: {summary.sources.memory}{" "}
              item(ns) de preferência, {summary.sources.notes} observação(ões) e{" "}
              {summary.sources.tags} tag(s) autorizadas, além de{" "}
              {summary.sources.upcomingAppointments} atendimento(s) futuro(s).
            </p>
          </>
        )}
        {error && (
          <div className="customer-inline-error" role="alert">
            {error}
          </div>
        )}
        {busy && !summary && <Spinner label="Gerando resumo" />}
        {!summary && !busy && !error && (
          <p className="resume-ai-text is-empty">Nenhum resumo gerado ainda.</p>
        )}
        {!summary && (
          <p className="resume-ai-hint">
            Gerado sob demanda, só a partir de observações, tags e preferências
            autorizadas para uso pela IA, além dos próximos atendimentos.
          </p>
        )}
        <button
          className="resume-ai-action"
          disabled={busy}
          onClick={() => void generate()}
          type="button"
        >
          <Icon name="spark" />
          {busy ? "Gerando..." : summary ? "Gerar novamente" : "Gerar resumo"}
        </button>
      </div>

      <h2 className="sr-only">Números</h2>
      {stats ? (
        <div className="resume-stats">
          <div className="resume-stat">
            <strong>{stats.completed}</strong>
            <span>atendimentos</span>
          </div>
          <div className="resume-stat">
            <strong>{intervalWeeksLabel(stats.averageIntervalDays)}</strong>
            <span>a cada</span>
          </div>
          <div className="resume-stat">
            <strong>{stats.noShows}</strong>
            <span>faltas</span>
          </div>
          <div className="resume-stat">
            <strong>{stats.cancelled}</strong>
            <span>
              {stats.cancelled === 1 ? "cancelamento" : "cancelamentos"}
            </span>
          </div>
        </div>
      ) : (
        <p className="muted small">Ainda sem números de atendimento.</p>
      )}
    </section>
  );
}

export function CustomerNextAppointment({
  appointment,
}: {
  appointment?: CustomerAppointmentSummary | null;
}) {
  if (!appointment) return null;
  const confirmed = appointment.status === "CONFIRMED";
  return (
    <section aria-label="Próximo atendimento" className="resume-next">
      <h2 className="resume-heading">Próximo</h2>
      <div className="resume-next-row">
        <span className="resume-next-when">
          {weekdayLabel(appointment.date)}
          <br />
          <span>{formatAppointmentDate(appointment.date)}</span>
        </span>
        <span aria-hidden="true" className="resume-next-bar" />
        <div className="resume-next-main">
          <span className="resume-next-time">{appointment.startTime}</span>
          <span
            className={
              confirmed
                ? "resume-next-status is-confirmed"
                : "resume-next-status"
            }
          >
            <span aria-hidden="true" className="resume-dot" />
            {appointmentStatusLabel(appointment.status)}
          </span>
        </div>
      </div>
    </section>
  );
}

function weekdayLabel(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" })
    .format(new Date(`${value}T12:00:00Z`))
    .replace(".", "");
}

function intervalWeeksLabel(averageIntervalDays: number | null): string {
  if (averageIntervalDays === null) return "-";
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
    NETWORK_ERROR: "Não foi possível acessar a Avenly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}
