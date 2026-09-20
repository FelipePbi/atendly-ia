"use client";

import { useEffect, useState } from "react";

import {
  type Appointment,
  type CalendarState,
  isActiveAppointmentStatus,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { StatePanel } from "@/shared/ui/States";

import { AppointmentFlowShell, formatMoney, SummaryRow } from "./AppointmentFlowShell";
import { AppointmentHistory } from "./AppointmentHistory";
import { LifecycleActions } from "./LifecycleActions";
import {
  customerLabel,
  formatAppointmentDate,
  formatDate,
  requestError,
  serviceNames,
  sourceLabel,
  statusLabel,
} from "./occupancy";

export function AppointmentDetail({ appointmentId }: { appointmentId?: string }) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [loading, setLoading] = useState(Boolean(appointmentId));
  const [historyReload, setHistoryReload] = useState(0);
  const [error, setError] = useState<string | null>(() =>
    appointmentId ? null : "O agendamento não foi informado.",
  );

  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    Promise.all([
      getProductServices().calendar.getAppointment(
        appointmentId,
        controller.signal,
      ),
      getProductServices().calendar.getCalendar(controller.signal),
    ])
      .then(([appointmentResult, calendarResult]) => {
        setAppointment(appointmentResult);
        setCalendar(calendarResult);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível carregar o agendamento."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appointmentId]);

  const writable = Boolean(
    calendar?.capabilities.createAppointments &&
    appointment ? isActiveAppointmentStatus(appointment.status) : false,
  );
  // Ciclo de vida e histórico exigem fonte configurada (Goal016).
  const lifecycleAvailable = calendar?.source === "ATENDLY";

  return (
    <AppointmentFlowShell
      calendar={calendar}
      description="Dados persistidos na fonte oficial do negócio."
      loading={loading}
      title="Detalhes do agendamento"
    >
      {error && (
        <StatePanel
          actionHref="/agenda"
          actionLabel="Voltar à agenda"
          description={error}
          icon="alert"
          title="Agendamento indisponível"
          tone="error"
        />
      )}
      {appointment && (
        <>
          <section className="agenda-detail-hero">
            <div>
              <p className="eyebrow">{statusLabel(appointment.status)}</p>
              <h2>{customerLabel(appointment)}</h2>
              <p className="agenda-detail-date">
                {formatAppointmentDate(appointment)}
              </p>
              <p className="agenda-detail-service">
                {serviceNames(appointment)}
              </p>
            </div>
            {writable && (
              <div className="agenda-detail-actions">
                <Button
                  href={`/agenda/reagendar?id=${encodeURIComponent(appointment.id)}`}
                  variant="secondary"
                >
                  Reagendar
                </Button>
                <Button
                  href={`/agenda/cancelar?id=${encodeURIComponent(appointment.id)}`}
                  variant="danger"
                >
                  Cancelar agendamento
                </Button>
              </div>
            )}
          </section>
          <div className="agenda-detail-grid">
            <section className="agenda-detail-section">
              <h2>Cliente</h2>
              <div className="agenda-summary-list">
                <SummaryRow label="Nome" value={customerLabel(appointment)} />
                <SummaryRow
                  label="Telefone"
                  value={appointment.customer?.phone ?? "Não informado"}
                />
              </div>
            </section>
            <section className="agenda-detail-section">
              <h2>Agendamento</h2>
              <div className="agenda-summary-list">
                <SummaryRow label="Data" value={formatDate(appointment.date)} />
                <SummaryRow
                  label="Horário"
                  value={`${appointment.startTime}–${appointment.endTime}`}
                />
                <SummaryRow
                  label="Duração"
                  value={`${appointment.durationMinutes} min`}
                />
                <SummaryRow
                  label="Origem"
                  value={sourceLabel(appointment.source)}
                />
                <SummaryRow
                  label="Valor"
                  value={formatMoney(appointment.totalPrice)}
                />
              </div>
            </section>
            {appointment.comments && (
              <section className="agenda-detail-section">
                <h2>Observações</h2>
                <p>{appointment.comments}</p>
              </section>
            )}
          </div>
          {lifecycleAvailable && (
            <section className="agenda-detail-section">
              <h2>Ciclo do atendimento</h2>
              <LifecycleActions
                appointment={appointment}
                onUpdated={(lifecycle) => {
                  setAppointment((current) =>
                    current && {
                      ...current,
                      completedAt: lifecycle.completedAt,
                      completionOrigin: lifecycle.completionOrigin,
                      finalValue: lifecycle.finalValue,
                      noShowAt: lifecycle.noShowAt,
                      noShowNote: lifecycle.noShowNote,
                      presenceConfirmedAt: lifecycle.presenceConfirmedAt,
                      status: lifecycle.status,
                    },
                  );
                  setHistoryReload((value) => value + 1);
                }}
              />
            </section>
          )}
          {lifecycleAvailable && (
            <section className="agenda-detail-section">
              <h2>Histórico</h2>
              <AppointmentHistory
                appointmentId={appointment.id}
                reloadKey={historyReload}
              />
            </section>
          )}
        </>
      )}
    </AppointmentFlowShell>
  );
}
