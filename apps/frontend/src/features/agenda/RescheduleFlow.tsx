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
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { swatchProps } from "@/shared/serviceColor";
import { ContactPhoto, customerPhotoUrl } from "@/shared/ui/ContactPhoto";
import { DatePicker } from "@/shared/ui/pickers/DatePicker";
import { TimeField } from "@/shared/ui/pickers/PickerFields";
import { PickerPopover } from "@/shared/ui/pickers/PickerPopover";

import { appointmentHref } from "./agendaLinks";
import {
  forgetAgendaChanges,
  recalledAppointment,
  recalledCalendar,
  rememberAppointment,
} from "./agendaMemory";
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
import { appointmentServiceDurations } from "./ServiceDurationStepper";
import type { ConflictAvailability } from "./SlotConflictNotice";
import { holdNotice } from "./SlotPicker";

const STRIP_DAYS = 6;

/**
 * Remarcação (quadro A9), com as mesmas regras da criação: o hold é do horário
 * **novo** — o antigo continua ocupado pelo próprio atendimento até a
 * remarcação commitar — e sobrepor exige motivo. "Confirmar novo horário" é o
 * único passo: não há diálogo de confirmação depois dele.
 */
export function RescheduleFlow({
  appointmentId,
  returnTo,
}: {
  appointmentId?: string;
  /** Origem do detalhe (D-167): o retorno ao detalhe a leva adiante. */
  returnTo?: string;
}) {
  const router = useRouter();
  const hold = useHoldSession();
  const moreDateRef = useRef<HTMLButtonElement>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Vindo do detalhe, o agendamento e o calendário já estão na memória da
  // aba (D-167): a tela abre preenchida e a leitura abaixo revalida (D-168).
  const [seed] = useState(() => {
    const remembered = appointmentId
      ? recalledAppointment(appointmentId)
      : null;
    const rememberedCalendar = remembered ? recalledCalendar() : null;
    return remembered && rememberedCalendar
      ? { appointment: remembered, calendar: rememberedCalendar }
      : null;
  });
  const [appointment, setAppointment] = useState<Appointment | null>(
    seed?.appointment ?? null,
  );
  const [calendar, setCalendar] = useState<CalendarState | null>(
    seed?.calendar ?? null,
  );
  const [serviceColors, setServiceColors] = useState<ServiceColorMap>(
    () => new Map(),
  );
  const [date, setDate] = useState(() =>
    seed ? initialRescheduleDate(seed.appointment) : isoDate(new Date()),
  );
  const [stripStart, setStripStart] = useState(date);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(Boolean(appointmentId));
  const [startTime, setStartTime] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTime, setManualTime] = useState("");
  // Remarcar é sempre uma alteração relevante para o cliente (Goal021):
  // marcado por padrão, e a interface manda o campo sempre explicitamente —
  // nunca se apoia no default do contrato, que é o oposto.
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [loading, setLoading] = useState(Boolean(appointmentId) && !seed);
  // Esqueleto só se a carga passar de ~150 ms, e nunca sob o splash (D-168).
  const showSkeleton = useDeferredLoading(loading);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  // Expediente e granularidade para o aviso de recusa dizer o motivo real
  // (2026-10-12); sem a leitura, o aviso nao afirma motivo.
  const [availabilitySettings, setAvailabilitySettings] =
    useState<ConflictAvailability | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const settingsService = getProductServices().settings;
    if (!settingsService || typeof settingsService.get !== "function") return;
    settingsService
      .get(controller.signal)
      .then((state) => setAvailabilitySettings(state.availability ?? null))
      .catch(() => {
        // Sem as regras o aviso usa o texto neutro; nao bloqueia o fluxo.
      });
    return () => controller.abort();
  }, []);
  const [error, setError] = useState<string | null>(() =>
    appointmentId ? null : "O agendamento não foi informado.",
  );

  const detailHref = appointmentId
    ? appointmentHref(appointmentId, returnTo)
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
        setAppointment(appointmentResult);
        setCalendar(calendarResult);
        rememberAppointment(appointmentResult);
        // Semeada da memória, a tela já está no dia certo e a pessoa pode
        // ter mexido nele: a revalidação não o move.
        if (seed) return;
        const initial = initialRescheduleDate(appointmentResult);
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
  }, [appointmentId, seed]);

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
          // O tamanho combinado deste atendimento, não o do catálogo (D-207):
          // a remarcação mantém a duração, e o hold precisa cobri-la.
          serviceDurations: appointmentServiceDurations(appointment),
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
        serviceDurations: appointmentServiceDurations(appointment),
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
      // O que a Agenda leu antes da remarcação deixou de valer (D-167).
      forgetAgendaChanges();
      rememberAppointment(result);
      router.replace(appointmentHref(result.id, returnTo));
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
    ? [
        formatDuration(appointment.durationMinutes),
        totalPriceLabel(appointment),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const noticeText =
    hold.phase === "none" ? "" : holdNotice(hold, calendar?.timezone);

  return (
    <AppointmentFlowShell
      agendaBar={false}
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
          {loading && showSkeleton && (
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
          {!loading &&
            calendar &&
            !calendar.capabilities.createAppointments && (
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
                        <ContactPhoto
                          src={customerPhotoUrl(appointment.customerId)}
                        />
                      </span>
                      <span className="agenda-rs-summary-text">
                        <strong>
                          <span
                            aria-hidden="true"
                            className="agenda-appt-service-dot"
                            {...swatchProps(colors[0])}
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
                          {startTime ? shortSlot(date, startTime) : "-"}
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
                          <span
                            aria-hidden="true"
                            className="agenda-rs-day-week"
                          >
                            …
                          </span>
                          <button
                            aria-expanded={datePickerOpen}
                            aria-haspopup="dialog"
                            aria-label="Outra data"
                            className="agenda-rs-more"
                            ref={moreDateRef}
                            type="button"
                            onClick={() => setDatePickerOpen((open) => !open)}
                          >
                            <Icon name="calendar" />
                          </button>
                          {datePickerOpen && (
                            <PickerPopover
                              anchorRef={moreDateRef}
                              label="Escolher outra data"
                              preferredWidth={360}
                              onClose={(reason) => {
                                setDatePickerOpen(false);
                                if (reason === "escape")
                                  moreDateRef.current?.focus();
                              }}
                            >
                              <DatePicker
                                autoFocus
                                collapseOnPick={false}
                                min={isoDate(new Date())}
                                startExpanded
                                value={date}
                                onChange={(value) => {
                                  setDatePickerOpen(false);
                                  moreDateRef.current?.focus();
                                  setStripStart(value);
                                  chooseDate(value);
                                }}
                              />
                            </PickerPopover>
                          )}
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
                                  onChange={() =>
                                    void chooseTime(slot.startTime)
                                  }
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
                            <TimeField
                              duration={durationMinutes}
                              value={manualTime}
                              onValueChange={(value) => setManualTime(value)}
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
                        <small>Recomendado: a data e o horário mudaram.</small>
                      </span>
                      <span className="agenda-rs-switch">
                        <input
                          checked={notifyCustomer}
                          type="checkbox"
                          onChange={(event) =>
                            setNotifyCustomer(event.target.checked)
                          }
                        />
                        <span
                          aria-hidden="true"
                          className="agenda-rs-switch-track"
                        />
                      </span>
                    </label>
                  </div>
                </div>
                {conflict && (
                  <ConflictPanel
                    availability={availabilitySettings}
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

/** O dia em que a remarcação começa: o do agendamento, ou hoje se ele já passou. */
function initialRescheduleDate(appointment: Appointment): string {
  const today = isoDate(new Date());
  return appointment.date < today ? today : appointment.date;
}
