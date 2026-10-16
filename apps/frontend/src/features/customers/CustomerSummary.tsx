"use client";

import { useId } from "react";

import {
  appointmentStatusLabel,
  type CustomerAppointmentStats,
  type CustomerAppointmentSummary,
} from "@/data";
import { durationLabel } from "@/shared/ui/pickers/dateTime";

/**
 * Histórico da cliente em linguagem natural (pedido de 2026-10-16): no lugar
 * da fileira "9 · 7 sem · 0 · 1" com rótulos soltos, o cartão diz quantos
 * atendimentos, desde quando, de quanto em quanto tempo ela volta e se houve
 * falta ou cancelamento — o número de destaque é o que importa, e falta e
 * cancelamento só ganham cor quando aconteceram. O Resumo da IA saiu do
 * perfil (D-174).
 */
export function CustomerHistory({
  stats,
}: {
  stats?: CustomerAppointmentStats;
}) {
  const headingId = useId();
  const total = stats ? stats.completed + stats.noShows + stats.cancelled : 0;
  return (
    <section aria-labelledby={headingId} className="resume-history">
      <h2 className="resume-heading" id={headingId}>
        Histórico
      </h2>
      {!stats || total === 0 ? (
        <p className="resume-history-empty">
          Nenhum atendimento concluído ainda.
        </p>
      ) : (
        <>
          <p className="resume-history-total">
            <strong>{stats.completed}</strong>{" "}
            {stats.completed === 1 ? "atendimento" : "atendimentos"}
            {stats.firstAppointmentDate && (
              <span className="resume-history-since">
                {" "}
                desde {monthYearLabel(stats.firstAppointmentDate)}
              </span>
            )}
          </p>
          <p className="resume-history-rhythm">
            {rhythmLabel(stats.averageIntervalDays)}
          </p>
          <ul
            aria-label="Faltas e cancelamentos"
            className="resume-history-flags"
          >
            <li className={stats.noShows > 0 ? "is-alert" : undefined}>
              <span aria-hidden="true" className="resume-dot" />
              {stats.noShows === 0
                ? "Nenhuma falta"
                : `${stats.noShows} ${stats.noShows === 1 ? "falta" : "faltas"}`}
            </li>
            <li className={stats.cancelled > 0 ? "is-warning" : undefined}>
              <span aria-hidden="true" className="resume-dot" />
              {stats.cancelled === 0
                ? "Nenhum cancelamento"
                : `${stats.cancelled} ${stats.cancelled === 1 ? "cancelamento" : "cancelamentos"}`}
            </li>
          </ul>
        </>
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
  // Como no quadro CL5: "15:30 · Corte feminino" e, abaixo, duração, valor e
  // quem marcou, quando a resposta traz esses dados.
  const what =
    appointment.serviceNames && appointment.serviceNames.length > 0
      ? appointment.serviceNames.join(" + ")
      : (appointment.title ?? null);
  const meta = [
    appointment.durationMinutes
      ? durationLabel(appointment.durationMinutes)
      : null,
    priceLabel(appointment),
    sourceLabel(appointment.source),
  ].filter(Boolean);
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
          <div className="resume-next-what">
            <span className="resume-next-time">
              {appointment.startTime}
              {what && <> · {what}</>}
            </span>
            {meta.length > 0 && (
              <span className="resume-next-meta">{meta.join(" · ")}</span>
            )}
          </div>
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

/** "R$ 90", "a partir de R$ 90"; sem valor fechado, nada (não inventa). */
function priceLabel(appointment: CustomerAppointmentSummary): string | null {
  if (
    appointment.totalPrice === null ||
    appointment.totalPrice === undefined ||
    appointment.totalPriceType === "NONE"
  )
    return null;
  const money = new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    maximumFractionDigits: appointment.totalPrice % 1 === 0 ? 0 : 2,
    minimumFractionDigits: appointment.totalPrice % 1 === 0 ? 0 : 2,
    style: "currency",
  }).format(appointment.totalPrice);
  return appointment.totalPriceType === "STARTING_AT"
    ? `a partir de ${money}`
    : money;
}

function sourceLabel(
  source: CustomerAppointmentSummary["source"],
): string | null {
  if (source === "AI") return "marcado pela IA";
  if (source === "USER") return "marcado por você";
  if (source === "INTEGRATION") return "importado";
  return null;
}

/** De quanto em quanto tempo a cliente volta, em média. */
export function rhythmLabel(averageIntervalDays: number | null): string {
  if (averageIntervalDays === null)
    return "A frequência aparece a partir do segundo atendimento.";
  const days = Math.max(1, Math.round(averageIntervalDays));
  if (days < 10)
    return days === 1
      ? "Volta todo dia, em média."
      : `Volta a cada ${days} dias, em média.`;
  const weeks = Math.round(days / 7);
  if (weeks <= 8)
    return weeks === 1
      ? "Volta toda semana, em média."
      : `Volta a cada ${weeks} semanas, em média.`;
  const months = Math.round(days / 30);
  return months <= 1
    ? "Volta todo mês, em média."
    : `Volta a cada ${months} meses, em média.`;
}

function monthYearLabel(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  })
    .format(new Date(`${value}T12:00:00Z`))
    .replace(".", "")
    .replace(" de ", " ");
}

function weekdayLabel(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" })
    .format(new Date(`${value}T12:00:00Z`))
    .replace(".", "");
}

function formatAppointmentDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
