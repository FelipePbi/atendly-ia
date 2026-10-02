"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  type Appointment,
  type AppointmentLifecycle,
  type CalendarState,
  isActiveAppointmentStatus,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { displayPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { StatePanel } from "@/shared/ui/States";

import { AppointmentFlowShell, formatMoney } from "./AppointmentFlowShell";
import { AppointmentHistory } from "./AppointmentHistory";
import { AppointmentReminder, useLifecycleMenu } from "./LifecycleActions";
import {
  appointmentServiceColors,
  customerLabel,
  formatDuration,
  parseDate,
  requestError,
  type ServiceColorMap,
  serviceColorMap,
  statusLabel,
} from "./occupancy";

/**
 * Detalhe do agendamento (quadro A5, D-110 (c) e (d)): horário em destaque
 * com o status, a cliente, os serviços, o lembrete, as observações e o
 * histórico. Remarcar e Cancelar ficam no rodapé; o ciclo do atendimento
 * (Concluir, Não compareceu, presença e valor final) vive no "•••".
 */
export function AppointmentDetail({ appointmentId }: { appointmentId?: string }) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [loading, setLoading] = useState(Boolean(appointmentId));
  const [historyReload, setHistoryReload] = useState(0);
  const [error, setError] = useState<string | null>(() =>
    appointmentId ? null : "O agendamento não foi informado.",
  );
  const [serviceColors, setServiceColors] = useState<ServiceColorMap>(
    () => new Map(),
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

  // Só a cor do ponto de cada serviço depende do catálogo: sem ele, o ponto
  // fica neutro e o detalhe continua.
  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    const catalog = getProductServices().serviceCatalog;
    if (!catalog || typeof catalog.list !== "function") return;
    Promise.resolve()
      .then(() => catalog.list(controller.signal))
      .then((result) => setServiceColors(serviceColorMap(result.items)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [appointmentId]);

  const writable = Boolean(
    calendar?.capabilities.createAppointments &&
    appointment ? isActiveAppointmentStatus(appointment.status) : false,
  );
  // Ciclo de vida e histórico exigem fonte configurada (Goal016).
  const lifecycleAvailable = calendar?.source === "ATENDLY";

  function applyLifecycle(lifecycle: AppointmentLifecycle) {
    setAppointment(
      (current) =>
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
  }

  const lifecycle = useLifecycleMenu({
    appointment: lifecycleAvailable ? appointment : null,
    onUpdated: applyLifecycle,
  });

  return (
    <AppointmentFlowShell
      appointmentRoute={{ date: appointment?.date ?? null, id: appointmentId }}
      bare
      calendar={calendar}
      loading={loading}
      title="Detalhes do agendamento"
    >
      <div className="agenda-appt">
        <PushedBar
          backHref="/agenda"
          backLabel="Voltar para a agenda"
          menuItems={lifecycle.menuItems}
          menuLabel="Mais ações do agendamento"
        />
        <h1 className="sr-only">Detalhes do agendamento</h1>
        {loading ? (
          <div
            aria-busy="true"
            aria-label="Carregando agendamento"
            className="agenda-appt-body"
          >
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line" />
          </div>
        ) : error || !appointment ? (
          <div className="agenda-appt-body">
            <StatePanel
              actionHref="/agenda"
              actionLabel="Voltar à agenda"
              description={error ?? "Agendamento não encontrado."}
              icon="alert"
              title="Agendamento indisponível"
              tone="error"
            />
          </div>
        ) : (
          <>
            <div className="agenda-appt-body">
              {lifecycle.panel}
              <div className="agenda-appt-columns">
                <div className="agenda-appt-main">
                  <AppointmentWhen appointment={appointment} />
                  <AppointmentCustomer
                    appointment={appointment}
                    key={appointment.customerId ?? ""}
                  />
                  <AppointmentServices
                    appointment={appointment}
                    serviceColors={serviceColors}
                  />
                </div>
                <div className="agenda-appt-side">
                  {lifecycleAvailable && (
                    <AppointmentReminder appointmentId={appointment.id} />
                  )}
                  <section className="agenda-appt-block">
                    <h2 className="agenda-appt-label">Observações</h2>
                    <p
                      className={clsx(
                        "agenda-appt-text",
                        !appointment.comments && "is-empty",
                      )}
                    >
                      {appointment.comments || "Nenhuma observação."}
                    </p>
                  </section>
                  {lifecycleAvailable && (
                    <section className="agenda-appt-block is-history">
                      <h2 className="agenda-appt-label">Histórico</h2>
                      <AppointmentHistory
                        appointmentId={appointment.id}
                        reloadKey={historyReload}
                        variant="timeline"
                      />
                    </section>
                  )}
                </div>
              </div>
            </div>
            {writable && (
              <div className="agenda-appt-footer">
                <Link
                  className="agenda-appt-action"
                  href={`/agenda/reagendar?id=${encodeURIComponent(appointment.id)}`}
                >
                  <Icon name="calendar" />
                  Remarcar
                </Link>
                <Link
                  className="agenda-appt-action is-danger"
                  href={`/agenda/cancelar?id=${encodeURIComponent(appointment.id)}`}
                >
                  Cancelar
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </AppointmentFlowShell>
  );
}

function AppointmentWhen({ appointment }: { appointment: Appointment }) {
  const status = appointment.status.toUpperCase();
  return (
    <div className="agenda-appt-when">
      <span className="agenda-appt-label">{longDayLabel(appointment.date)}</span>
      <div className="agenda-appt-when-row">
        <span className="agenda-appt-hero">
          {appointment.startTime}
          <span> – {appointment.endTime}</span>
        </span>
        <span
          className={clsx(
            "agenda-appt-status",
            status === "COMPLETED" && "is-completed",
            status === "NO_SHOW" && "is-no-show",
            status === "CANCELLED" && "is-cancelled",
          )}
        >
          <span aria-hidden="true" className="agenda-appt-status-dot" />
          {status === "COMPLETED" && appointment.completionOrigin === "AUTO"
            ? "Concluído automaticamente"
            : statusLabel(appointment.status)}
        </span>
      </div>
    </div>
  );
}

/**
 * A cliente com o telefone (D-099) e, quando há `customerId` e a leitura
 * responde, a contagem de atendimentos e o atalho para a conversa dela
 * (D-110 (d)). Leitura que falha some sem erro na tela.
 */
function AppointmentCustomer({ appointment }: { appointment: Appointment }) {
  const customerId = appointment.customerId;
  const [completed, setCompleted] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    // Leitura auxiliar: qualquer falha, inclusive síncrona, só esconde a contagem.
    Promise.resolve()
      .then(() =>
        getProductServices().customers.get(customerId, controller.signal),
      )
      .then((customer) =>
        setCompleted(customer.appointmentStats?.completed ?? null),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [customerId]);

  // A conversa mais recente da pessoa, como no perfil do cliente (Goal075).
  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    Promise.resolve()
      .then(() =>
        getProductServices().conversations.list(
          { customerId, limit: 1 },
          controller.signal,
        ),
      )
      .then((result) => setConversationId(result[0]?.id ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [customerId]);

  const name = customerLabel(appointment);
  const line = [
    displayPhone(appointment.customer?.phone, ""),
    completed === null
      ? ""
      : `${completed} ${completed === 1 ? "atendimento" : "atendimentos"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="agenda-appt-customer">
      <span aria-hidden="true" className="agenda-appt-avatar">
        {initials(name)}
      </span>
      <div className="agenda-appt-customer-text">
        <h2>{name}</h2>
        {line && <span>{line}</span>}
      </div>
      {customerId && conversationId && (
        <Link
          className="agenda-appt-conversation"
          href={`/conversas/${encodeURIComponent(conversationId)}`}
        >
          <Icon name="chat" />
          Conversa
        </Link>
      )}
    </div>
  );
}

function AppointmentServices({
  appointment,
  serviceColors,
}: {
  appointment: Appointment;
  serviceColors: ServiceColorMap;
}) {
  const colors = appointmentServiceColors(appointment, serviceColors);
  const total = [
    formatDuration(appointment.durationMinutes),
    totalPriceLabel(appointment),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="agenda-appt-services">
      <h2 className="agenda-appt-label">Serviços</h2>
      {appointment.services.length === 0 ? (
        <div className="agenda-appt-service">
          <span className="agenda-appt-service-name">
            <span aria-hidden="true" className="agenda-appt-service-dot" />
            {appointment.title || "Serviço não informado"}
          </span>
        </div>
      ) : (
        appointment.services.map((service, index) => (
          <div className="agenda-appt-service" key={`${service.serviceId}-${index}`}>
            <span className="agenda-appt-service-name">
              <span
                aria-hidden="true"
                className="agenda-appt-service-dot"
                data-color={colors[index] ?? undefined}
              />
              {service.name}
            </span>
            <span className="agenda-appt-service-meta">
              {[
                service.durationMinutes
                  ? formatDuration(service.durationMinutes)
                  : "",
                servicePriceLabel(service),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        ))
      )}
      <div className="agenda-appt-total">
        <span>Total</span>
        <strong>{total}</strong>
      </div>
      {appointment.finalValue !== null && (
        <div className="agenda-appt-total">
          <span>Valor final</span>
          <strong>{formatMoney(appointment.finalValue)}</strong>
        </div>
      )}
    </section>
  );
}

function money(value: number): string {
  const digits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  }).format(value);
}

function servicePriceLabel(service: Appointment["services"][number]): string {
  if (service.priceType === "ON_REQUEST") return "sob consulta";
  if (service.price === null || service.priceType === "NOT_INFORMED") return "";
  return service.priceType === "STARTING_AT"
    ? `a partir de ${money(service.price)}`
    : money(service.price);
}

export function totalPriceLabel(appointment: Appointment): string {
  const { totalPrice, totalPriceType } = appointment;
  if (totalPrice === null || totalPriceType === "NONE") return "";
  return totalPriceType === "STARTING_AT"
    ? `a partir de ${money(totalPrice)}`
    : money(totalPrice);
}

/** "Sexta, 19 de setembro", como no quadro. */
export function longDayLabel(date: string): string {
  const label = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  })
    .format(parseDate(date))
    .replace("-feira", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter((part) => /\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
