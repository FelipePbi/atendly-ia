"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  type Appointment,
  appointmentStatusLabel,
  BffHttpError,
  isActiveAppointmentStatus,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Skeleton, StatePanel } from "@/shared/ui/States";

type CustomerAgendaProps = {
  customerId: string;
  timezone: string;
};

/**
 * Busca sempre por `customerId`, nunca por telefone: número compartilhado
 * não pode misturar atendimentos de pessoas diferentes, e cliente sem
 * telefone precisa ver a própria agenda normalmente.
 */
export function CustomerAgenda({ customerId, timezone }: CustomerAgendaProps) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const today = todayIso(timezone);
    const range = {
      endDate: addDays(today, 365),
      startDate: addDays(today, -365),
    };
    getProductServices()
      .calendar.listAppointments({ customerId, ...range }, controller.signal)
      .then(setAppointments)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(
              caught,
              "Não foi possível carregar a agenda deste cliente.",
            ),
          );
      });
    return () => controller.abort();
  }, [customerId, timezone, reload]);

  if (error) {
    return (
      <StatePanel
        actionLabel="Tentar novamente"
        description={error}
        icon="alert"
        onAction={() => {
          setError(null);
          setReload((value) => value + 1);
        }}
        title="Agenda indisponível"
        tone="error"
      />
    );
  }

  if (!appointments) {
    return <AgendaLoading />;
  }

  const today = todayIso(timezone);
  const upcoming = appointments
    .filter((item) => isActiveAppointmentStatus(item.status) && item.date >= today)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const upcomingIds = new Set(upcoming.map((item) => item.id));
  const history = appointments
    .filter((item) => !upcomingIds.has(item.id))
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

  return (
    <>
      <section className="directory-section">
        <div className="directory-section-header">
          <div>
            <h2>Próximos atendimentos</h2>
            <p>Compromissos futuros deste cliente na Agenda Atendly.</p>
          </div>
        </div>
        {upcoming.length === 0 ? (
          <p className="muted small">Nenhum agendamento futuro.</p>
        ) : (
          upcoming.map((appointment) => (
            <AgendaRow appointment={appointment} key={appointment.id} />
          ))
        )}
      </section>
      <section className="directory-section">
        <div className="directory-section-header">
          <div>
            <h2>Histórico</h2>
            <p>Atendimentos anteriores deste cliente.</p>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="muted small">Nenhum atendimento anterior.</p>
        ) : (
          history.map((appointment) => (
            <AgendaRow appointment={appointment} key={appointment.id} />
          ))
        )}
      </section>
    </>
  );
}

function AgendaRow({ appointment }: { appointment: Appointment }) {
  return (
    <Link
      className="directory-appointment"
      href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
    >
      <time>
        {formatShortDate(appointment.date)}
        <br />
        {appointment.startTime}
      </time>
      <span className="directory-appointment-copy">
        <strong>
          {appointment.services.map((item) => item.name).join(", ") ||
            "Serviço não informado"}
        </strong>
        <span>{appointment.durationMinutes} min</span>
      </span>
      <span
        className={clsx(
          "badge",
          isActiveAppointmentStatus(appointment.status) && "badge-success",
        )}
      >
        {appointmentStatusLabel(appointment.status)}
      </span>
    </Link>
  );
}

function AgendaLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando agenda"
      className="directory-loading-shell"
    >
      {[0, 1, 2].map((item) => (
        <div className="directory-loading-row" key={item}>
          <Skeleton className="directory-loading-avatar" />
          <span className="directory-loading-copy">
            <Skeleton className="skeleton-title" />
            <Skeleton className="skeleton-line" />
          </span>
          <Skeleton className="skeleton-line" />
          <Skeleton className="skeleton-line" />
        </div>
      ))}
    </div>
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

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${value}T12:00:00Z`))
    .toLocaleUpperCase("pt-BR");
}

function todayIso(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
