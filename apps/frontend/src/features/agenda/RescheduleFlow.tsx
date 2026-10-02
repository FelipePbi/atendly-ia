"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  type Appointment,
  type AvailabilitySlot,
  type CalendarState,
  type RescheduleAppointmentInput,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { initials, totalPriceLabel } from "./AppointmentDetail";
import { AppointmentFlowShell, ReadOnlyState } from "./AppointmentFlowShell";
import { readOccupancy } from "./AppointmentForm";
import { ConflictPanel, occupyingEntries } from "./ConflictPanel";
import {
  holdLostMessage,
  isHoldLostError,
  isSlotConflictError,
  newIdempotencyKey,
  useHoldSession,
} from "./holdSession";
import {
  addDays,
  type AgendaEntry,
  appointmentServiceColors,
  customerLabel,
  formatDuration,
  isoDate,
  parseDate,
  requestError,
  type ServiceColorMap,
  serviceColorMap,
  serviceNames,
} from "./occupancy";
import { holdNotice } from "./SlotPicker";

const STRIP_DAYS = 6;

/**
 * Remarcação (quadro A9), com as mesmas regras da criação: o hold é do horário
 * **novo** — o antigo continua ocupado pelo próprio atendimento até a
 * remarcação commitar — e sobrepor exige motivo. "Confirmar novo horário" é o
 * único passo: não há diálogo de confirmação depois dele.
 */
export function RescheduleFlow({ appointmentId }: { appointmentId?: string }) {
  const router = useRouter();
  const hold = useHoldSession();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [serviceColors, setServiceColors] = useState<ServiceColorMap>(
    () => new Map(),
  );
  const [date, setDate] = useState(isoDate(new Date()));
  const [stripStart, setStripStart] = useState(isoDate(new Date()));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(Boolean(appointmentId));
  const [startTime, setStartTime] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTime, setManualTime] = useState("");
  // Remarcar é sempre uma alteração relevante para o cliente (Goal021):
  // marcado por padrão, e a interface manda o campo sempre explicitamente —
  // nunca se apoia no default do contrato, que é o oposto.
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [loading, setLoading] = useState(Boolean(appointmentId));
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [error, setError] = useState<string | null>(() =>
    appointmentId ? null : "O agendamento não foi informado.",
  );

  const detailHref = appointmentId
    ? `/agenda/agendamento?id=${encodeURIComponent(appointmentId)}`
    : "/agenda";

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
        const initial =
          appointmentResult.date < isoDate(new Date())
            ? isoDate(new Date())
            : appointmentResult.date;
        setAppointment(appointmentResult);
        setCalendar(calendarResult);
        setDate(initial);
        setStripStart(initial);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível preparar o reagendamento."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appointmentId]);

  // Só a cor do ponto do serviço depende do catálogo: sem ele o ponto fica
  // neutro e a remarcação continua.
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

  useEffect(() => {
    if (!appointment || !calendar?.capabilities.createAppointments || !date)
      return;
    const controller = new AbortController();
    getProductServices()
      .calendar.getAvailability(
        {
          serviceIds: appointment.services.map((service) => service.serviceId),
          startDate: date,
          days: 1,
          maxSlots: 100,
        },
        controller.signal,
      )
      .then((result) => {
        setSlots(result.filter((slot) => slot.date === date));
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(
              caught,
              "Não foi possível consultar os horários disponíveis.",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [appointment, calendar, date]);

  const durationMinutes = appointment?.durationMinutes ?? 0;
  const canSubmit =
    Boolean(appointment) &&
    Boolean(startTime) &&
    !conflict &&
    !busy &&
    hold.phase !== "reserving" &&
    hold.phase !== "expired";

  function resetSlotChoice() {
    hold.release();
    setStartTime("");
    setConflict(null);
  }

  function chooseDate(value: string) {
    if (!value || value === date) return;
    setDate(value);
    setSlots([]);
    setSlotsLoading(true);
    resetSlotChoice();
    setError(null);
  }

  async function chooseTime(time: string) {
    if (!appointment || !time || busy) return;
    setError(null);
    setConflict(null);
    setStartTime(time);
    try {
      await hold.reserve({
        customerId: appointment.customerId ?? undefined,
        date,
        serviceIds: appointment.services.map((service) => service.serviceId),
        startTime: time,
      });
    } catch (caught) {
      if (isSlotConflictError(caught)) {
        await openConflict(time);
        return;
      }
      setError(requestError(caught, "Não foi possível reservar o horário."));
    }
  }

  async function openConflict(time: string) {
    setConflict({
      entries: null,
      loading: true,
      reason: "",
      reasonError: null,
      startTime: time,
    });
    const entries = await readOccupancy(date, calendar?.timezone);
    setConflict((current) =>
      current && current.startTime === time
        ? {
            ...current,
            entries:
              entries === null
                ? null
                : occupyingEntries(
                    // O próprio atendimento remarcado não é conflito consigo
                    // mesmo: ele ocupa o horário antigo até a remarcação
                    // commitar, e o contrato já o exclui da revalidação.
                    entries.filter(
                      (entry) => entry.appointment?.id !== appointment?.id,
                    ),
                    { date, durationMinutes, startTime: time },
                  ),
            loading: false,
          }
        : current,
    );
  }

  async function reschedule(overlapReason?: string) {
    if (!appointment || !startTime || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input: RescheduleAppointmentInput = {
        date,
        holdId: hold.holdId ?? undefined,
        notifyCustomer,
        overlapOverride: overlapReason ? true : undefined,
        overlapOverrideReason: overlapReason,
        startTime,
      };
      const result = await getProductServices().calendar.rescheduleAppointment(
        appointment.id,
        input,
        newIdempotencyKey(),
      );
      router.replace(`/agenda/agendamento?id=${encodeURIComponent(result.id)}`);
    } catch (caught) {
      if (isHoldLostError(caught)) {
        hold.markLost();
        setStartTime("");
        setConflict(null);
        setError(holdLostMessage(caught));
        return;
      }
      if (isSlotConflictError(caught)) {
        hold.release();
        await openConflict(startTime);
        return;
      }
      setError(requestError(caught, "Não foi possível reagendar."));
    } finally {
      setBusy(false);
    }
  }

  function submitOverride() {
    if (!conflict) return;
    const reason = conflict.reason.trim();
    if (!reason) {
      setConflict({
        ...conflict,
        reasonError:
          "Descreva o motivo da sobreposição. Sem motivo, a remarcação não é enviada.",
      });
      return;
    }
    setStartTime(conflict.startTime);
    void reschedule(reason);
  }

  const stripDates = Array.from({ length: STRIP_DAYS }, (_, index) =>
    isoDate(addDays(parseDate(stripStart), index)),
  );
  const colors = appointment
    ? appointmentServiceColors(appointment, serviceColors)
    : [];
  const summaryMeta = appointment
    ? [formatDuration(appointment.durationMinutes), totalPriceLabel(appointment)]
        .filter(Boolean)
        .join(" · ")
    : "";
  const noticeText =
    hold.phase === "none" ? "" : holdNotice(hold, calendar?.timezone);

  return (
    <AppointmentFlowShell
      appointmentRoute={{ date: appointment?.date ?? null, id: appointmentId }}
      bare
      calendar={calendar}
      loading={loading}
      title="Remarcar"
    >
      <form
        className="agenda-appt agenda-rs"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) void reschedule();
        }}
      >
        <PushedBar
          backHref={detailHref}
          backIcon="x"
          backLabel="Fechar remarcação"
          title="Remarcar"
        />
        <div className="agenda-appt-body agenda-rs-body">
          {loading && (
            <>
              <span className="skeleton skeleton-title" />
              <span className="skeleton skeleton-line" />
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!loading && calendar && !calendar.capabilities.createAppointments && (
            <ReadOnlyState operation="reagendar" />
          )}
          {!loading &&
            appointment &&
            calendar?.capabilities.createAppointments && (
              <>
                <div className="agenda-appt-columns">
                  <div className="agenda-appt-main">
                    <div className="agenda-rs-summary">
                      <span aria-hidden="true" className="agenda-rs-avatar">
                        {initials(customerLabel(appointment))}
                      </span>
                      <span className="agenda-rs-summary-text">
                        <strong>
                          <span
                            aria-hidden="true"
                            className="agenda-appt-service-dot"
                            data-color={colors[0] ?? undefined}
                          />
                          {customerLabel(appointment)} ·{" "}
                          {serviceNames(appointment)}
                        </strong>
                        {summaryMeta && <small>{summaryMeta}</small>}
                      </span>
                    </div>
                    <div className="agenda-rs-change">
                      <div className="agenda-rs-box">
                        <span className="agenda-rs-box-label">
                          Horário atual
                        </span>
                        <span className="agenda-rs-box-value is-old">
                          {shortSlot(appointment.date, appointment.startTime)}
                        </span>
                      </div>
                      <svg
                        aria-hidden="true"
                        className="agenda-rs-arrow"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                      <div className="agenda-rs-box is-new">
                        <span className="agenda-rs-box-label">
                          Novo horário
                        </span>
                        <span className="agenda-rs-box-value">
                          {startTime ? shortSlot(date, startTime) : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="agenda-rs-section">
                      <span className="agenda-rs-field-label" id="rs-date">
                        Data
                      </span>
                      <div
                        aria-labelledby="rs-date"
                        className="agenda-rs-strip"
                        role="group"
                      >
                        {stripDates.map((value) => {
                          const selected = value === date;
                          const original =
                            value === appointment.date && !selected;
                          return (
                            <button
                              aria-label={longDate(value)}
                              aria-pressed={selected}
                              className={clsx(
                                "agenda-rs-day",
                                selected && "is-selected",
                                original && "is-original",
                              )}
                              key={value}
                              type="button"
                              onClick={() => chooseDate(value)}
                            >
                              <span className="agenda-rs-day-week">
                                {weekdayShort(value)}
                              </span>
                              <span className="agenda-rs-day-num">
                                {parseDate(value).getDate()}
                              </span>
                            </button>
                          );
                        })}
                        <span className="agenda-rs-day is-more">
                          <span aria-hidden="true" className="agenda-rs-day-week">
                            …
                          </span>
                          <button
                            aria-label="Outra data"
                            className="agenda-rs-more"
                            type="button"
                            onClick={() => {
                              const input = dateInputRef.current;
                              if (!input) return;
                              if (typeof input.showPicker === "function")
                                input.showPicker();
                              else input.click();
                            }}
                          >
                            <Icon name="calendar" />
                          </button>
                          <input
                            aria-label="Escolher outra data"
                            className="agenda-rs-date-input"
                            min={isoDate(new Date())}
                            ref={dateInputRef}
                            tabIndex={-1}
                            type="date"
                            value={date}
                            onChange={(event) => {
                              if (!event.target.value) return;
                              setStripStart(event.target.value);
                              chooseDate(event.target.value);
                            }}
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="agenda-appt-side">
                    <div className="agenda-rs-section">
                      <span className="agenda-rs-field-label" id="rs-time">
                        Horário{" "}
                        <span>
                          · {weekdayLong(date)}, livres para{" "}
                          {formatDuration(durationMinutes)}
                        </span>
                      </span>
                      <fieldset
                        aria-labelledby="rs-time"
                        className="agenda-rs-chips"
                        disabled={slotsLoading}
                      >
                        {slotsLoading ? (
                          <p className="agenda-rs-hint">
                            Consultando disponibilidade…
                          </p>
                        ) : (
                          <>
                            {slots.map((slot) => (
                              <label
                                className="agenda-rs-chip"
                                key={`${slot.date}-${slot.startTime}`}
                              >
                                <input
                                  checked={startTime === slot.startTime}
                                  name="start-time"
                                  type="radio"
                                  onChange={() => void chooseTime(slot.startTime)}
                                />
                                <span>{slot.startTime}</span>
                              </label>
                            ))}
                            <button
                              aria-expanded={manualOpen}
                              className="agenda-rs-chip is-other"
                              type="button"
                              onClick={() => setManualOpen((open) => !open)}
                            >
                              Outro horário
                            </button>
                          </>
                        )}
                      </fieldset>
                      {!slotsLoading && slots.length === 0 && (
                        <p className="agenda-rs-hint">
                          Nenhum horário disponível para esta seleção.
                        </p>
                      )}
                      {manualOpen && !slotsLoading && (
                        <div className="agenda-rs-manual">
                          <label className="agenda-rs-manual-field">
                            <span>Outro horário, fora dos oferecidos</span>
                            <input
                              type="time"
                              value={manualTime}
                              onChange={(event) =>
                                setManualTime(event.target.value)
                              }
                            />
                          </label>
                          <button
                            className="agenda-rs-manual-use"
                            disabled={!manualTime}
                            type="button"
                            onClick={() => void chooseTime(manualTime)}
                          >
                            Usar este horário
                          </button>
                          <p className="agenda-rs-hint">
                            Um horário fora dos oferecidos pode estar ocupado.
                            Se estiver, a agenda mostra o que ocupa o intervalo
                            e sobrepor exige motivo.
                          </p>
                        </div>
                      )}
                      <p className="agenda-rs-hold" role="status">
                        {noticeText}
                      </p>
                    </div>
                    <label className="agenda-rs-notify">
                      <span className="agenda-rs-notify-text">
                        <strong>Avisar a cliente pelo WhatsApp</strong>
                        <small>
                          Recomendado: a data e o horário mudaram.
                        </small>
                      </span>
                      <span className="agenda-rs-switch">
                        <input
                          checked={notifyCustomer}
                          type="checkbox"
                          onChange={(event) =>
                            setNotifyCustomer(event.target.checked)
                          }
                        />
                        <span aria-hidden="true" className="agenda-rs-switch-track" />
                      </span>
                    </label>
                  </div>
                </div>
                {conflict && (
                  <ConflictPanel
                    busy={busy}
                    entries={conflict.entries}
                    interval={{
                      date,
                      durationMinutes,
                      startTime: conflict.startTime,
                    }}
                    loading={conflict.loading}
                    onChooseAnother={() => resetSlotChoice()}
                    onOverride={submitOverride}
                    onReasonChange={(value) =>
                      setConflict((current) =>
                        current
                          ? { ...current, reason: value, reasonError: null }
                          : current,
                      )
                    }
                    reason={conflict.reason}
                    reasonError={conflict.reasonError}
                  />
                )}
              </>
            )}
        </div>
        {!loading &&
          appointment &&
          calendar?.capabilities.createAppointments && (
            <div className="agenda-appt-footer agenda-rs-footer">
              <button
                aria-busy={busy}
                className="agenda-rs-confirm"
                disabled={!canSubmit}
                type="submit"
              >
                Confirmar novo horário
              </button>
            </div>
          )}
      </form>
    </AppointmentFlowShell>
  );
}

/** "Sex, 19/09 · 15:30", como no quadro. */
function shortSlot(date: string, time: string): string {
  const parsed = parseDate(date);
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(parsed);
  const week = weekdayShort(date);
  return `${week.charAt(0).toUpperCase()}${week.slice(1)}, ${day} · ${time}`;
}

function weekdayShort(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(parseDate(date))
    .replace(".", "");
}

function weekdayLong(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
    .format(parseDate(date))
    .replace("-feira", "");
}

function longDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(
    parseDate(date),
  );
}

interface ConflictState {
  entries: AgendaEntry[] | null;
  loading: boolean;
  reason: string;
  reasonError: string | null;
  startTime: string;
}
