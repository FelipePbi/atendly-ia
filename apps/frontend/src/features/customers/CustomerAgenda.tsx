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
import { totalPriceLabel } from "@/features/agenda/AppointmentDetail";
import {
  appointmentServiceColors,
  type ServiceColorMap,
  serviceColorMap,
} from "@/features/agenda/occupancy";
import { Icon } from "@/shared/icons/Icon";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { recall, remember } from "@/shared/runtime/sessionMemory";
import { swatchProps } from "@/shared/serviceColor";
import { BrandLoader } from "@/shared/ui/Brand";
import { StatePanel } from "@/shared/ui/States";

type CustomerAgendaProps = {
  customerId: string;
  timezone: string;
};

/**
 * Atendimentos já lidos de cada cliente, na memória da aba (D-167,
 * 2026-10-18). O perfil pede a leitura assim que abre
 * (`prefetchCustomerAgenda`), então a aba Atendimentos entra pronta, sem
 * esqueleto; ao abrir, ela mostra o que já tem e relê por baixo se a leitura
 * tiver mais de 30 s.
 */
type AgendaMemory = { data: Appointment[]; at: number };
const pendingAgenda = new Map<string, Promise<Appointment[]>>();

/** Leitura mais nova que isso não é refeita ao abrir a aba. */
const FRESH_MS = 30_000;

function agendaKey(customerId: string, timezone: string) {
  return `customer-agenda:${customerId}:${todayIso(timezone)}`;
}

function rememberedAgenda(customerId: string, timezone: string) {
  return recall<AgendaMemory>(agendaKey(customerId, timezone));
}

function loadAgenda(customerId: string, timezone: string) {
  const key = agendaKey(customerId, timezone);
  const running = pendingAgenda.get(key);
  if (running) return running;
  const memory = recall<AgendaMemory>(key);
  if (memory && Date.now() - memory.at < FRESH_MS)
    return Promise.resolve(memory.data);
  const today = todayIso(timezone);
  const pending = getProductServices()
    .calendar.listAppointments({
      customerId,
      endDate: addDays(today, 365),
      startDate: addDays(today, -365),
    })
    .then((appointments) => {
      remember(key, { data: appointments, at: Date.now() });
      return appointments;
    })
    .finally(() => pendingAgenda.delete(key));
  pendingAgenda.set(key, pending);
  return pending;
}

/** Lê os atendimentos antes de a aba abrir; falha aqui fica para a aba. */
export function prefetchCustomerAgenda(customerId: string, timezone: string) {
  try {
    void loadAgenda(customerId, timezone).catch(() => undefined);
  } catch {
    // Sem agenda disponível agora: a aba tenta de novo ao abrir.
  }
}

/**
 * Busca sempre por `customerId`, nunca por telefone: número compartilhado
 * não pode misturar atendimentos de pessoas diferentes, e cliente sem
 * telefone precisa ver a própria agenda normalmente.
 */
export function CustomerAgenda({ customerId, timezone }: CustomerAgendaProps) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(
    () => rememberedAgenda(customerId, timezone)?.data ?? null,
  );
  const [serviceColors, setServiceColors] = useState<ServiceColorMap>(
    () => new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    // O que já foi lido aparece na hora (estado inicial); a leitura nova —
    // ou a que o perfil já pediu — troca em silêncio quando chegar.
    loadAgenda(customerId, timezone)
      .then((result) => {
        if (active) setAppointments(result);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            requestError(
              caught,
              "Não foi possível carregar a agenda deste cliente.",
            ),
          );
      });
    return () => {
      active = false;
    };
  }, [customerId, timezone, reload]);
  const showLoader = useDeferredLoading(!appointments && !error);

  // A cor do traço vem do catálogo; sem leitura, o traço fica neutro e a
  // lista continua (mesma regra da Agenda).
  useEffect(() => {
    const controller = new AbortController();
    const catalog = getProductServices().serviceCatalog;
    if (!catalog || typeof catalog.list !== "function") return;
    Promise.resolve()
      .then(() => catalog.list(controller.signal))
      .then((result) => setServiceColors(serviceColorMap(result?.items)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

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
    // Sem esqueleto (2026-10-18): a área fica quieta e, se a leitura passar
    // de ~150 ms, o "A" da marca aparece no lugar.
    return (
      <div aria-busy="true" className="customer-appts-pending">
        {showLoader ? (
          <BrandLoader inline label="Carregando atendimentos" />
        ) : (
          <p className="sr-only" role="status">
            Carregando atendimentos
          </p>
        )}
      </div>
    );
  }

  const today = todayIso(timezone);
  const upcoming = appointments
    .filter(
      (item) =>
        isActiveAppointmentStatus(item.status) &&
        item.status.toUpperCase() !== "COMPLETED" &&
        item.date >= today,
    )
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const upcomingIds = new Set(upcoming.map((item) => item.id));
  const history = appointments
    .filter((item) => !upcomingIds.has(item.id))
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
  const footer = recordedValueFooter(appointments);

  return (
    <div className="customer-appts">
      <section aria-labelledby="customer-appts-upcoming">
        <h2 className="customer-appts-heading" id="customer-appts-upcoming">
          Próximo
        </h2>
        {upcoming.length === 0 ? (
          <p className="muted small">Nenhum agendamento futuro.</p>
        ) : (
          upcoming.map((appointment) => (
            <AgendaRow
              appointment={appointment}
              key={appointment.id}
              serviceColors={serviceColors}
            />
          ))
        )}
      </section>
      <section aria-labelledby="customer-appts-history">
        <h2 className="customer-appts-heading" id="customer-appts-history">
          Anteriores
        </h2>
        {history.length === 0 ? (
          <p className="muted small">Nenhum atendimento anterior.</p>
        ) : (
          history.map((appointment) => (
            <AgendaRow
              appointment={appointment}
              key={appointment.id}
              serviceColors={serviceColors}
            />
          ))
        )}
      </section>
      {footer && (
        <div className="customer-appts-footer">
          <span>
            Valor registrado: <strong>{money(footer.recorded)}</strong>
          </span>
          {footer.withoutValue > 0 && (
            <span>
              {footer.withoutValue === 1
                ? "1 atendimento sem valor"
                : `${footer.withoutValue} atendimentos sem valor`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Soma só o valor final de fato registrado dos atendimentos concluídos: o
 * preço previsto nunca entra, e cancelados e faltas não contam. Sem nenhum
 * concluído não há rodapé.
 */
function recordedValueFooter(
  appointments: Appointment[],
): { recorded: number; withoutValue: number } | null {
  const completed = appointments.filter(
    (item) => item.status.toUpperCase() === "COMPLETED",
  );
  if (completed.length === 0) return null;
  let recorded = 0;
  let withoutValue = 0;
  for (const item of completed) {
    if (item.finalValue === null) withoutValue += 1;
    else recorded += item.finalValue;
  }
  return { recorded, withoutValue };
}

function AgendaRow({
  appointment,
  serviceColors,
}: {
  appointment: Appointment;
  serviceColors: ServiceColorMap;
}) {
  const status = appointment.status.toUpperCase();
  const cancelled = status === "CANCELLED";
  const completed = status === "COMPLETED";
  const active = !completed && isActiveAppointmentStatus(appointment.status);
  const colors = appointmentServiceColors(appointment, serviceColors);
  const stripe = colors.length > 0 ? colors : [null];
  const name =
    appointment.services.map((item) => item.name).join(" + ") ||
    "Serviço não informado";

  return (
    <Link
      className={clsx(
        "customer-appt",
        active ? "is-active" : "is-past",
        cancelled && "is-cancelled",
      )}
      href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
    >
      <span className="customer-appt-when">
        {formatShortDate(appointment.date)}
        <br />
        <span>{appointment.startTime}</span>
      </span>
      <span aria-hidden="true" className="customer-appt-stripe">
        {stripe.map((color, index) => (
          <span
            className="customer-appt-stripe-part"
            {...swatchProps(cancelled ? null : color)}
            key={index}
          />
        ))}
      </span>
      <span className="customer-appt-body">
        <span className="customer-appt-main">
          <strong className="customer-appt-name">{name}</strong>
          <span className="customer-appt-meta">{rowDetail(appointment)}</span>
        </span>
        <span
          className={clsx(
            "customer-appt-status",
            status === "NO_SHOW" && "is-no-show",
            completed && "is-completed",
            cancelled && "is-cancelled",
          )}
        >
          {completed ? (
            <Icon name="check" />
          ) : active ? (
            <span aria-hidden="true" className="customer-appt-status-dot" />
          ) : null}
          {appointmentStatusLabel(appointment.status)}
        </span>
      </span>
    </Link>
  );
}

function rowDetail(appointment: Appointment) {
  const status = appointment.status.toUpperCase();
  if (status === "COMPLETED") {
    return appointment.finalValue === null ? (
      <>
        valor não registrado ·{" "}
        <span className="customer-appt-register">registrar</span>
      </>
    ) : (
      `${money(appointment.finalValue)} registrado`
    );
  }
  if (status === "CANCELLED" || status === "NO_SHOW") {
    return `${appointment.durationMinutes} min`;
  }
  return [`${appointment.durationMinutes} min`, totalPriceLabel(appointment)]
    .filter(Boolean)
    .join(" · ");
}


function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    NETWORK_ERROR: "Não foi possível acessar a Avenly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
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

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
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
