"use client";

import clsx from "clsx";
import Link from "next/link";
import { Fragment, type ReactNode, useEffect, useState } from "react";

import { type Appointment, type TimeBlock } from "@/data";
import { Button } from "@/shared/ui/Button";

import {
  addDays,
  type AgendaEntry,
  appointmentServiceColors,
  datesWithActiveAppointment,
  daySummaryHeading,
  describeEntry,
  entriesForDate,
  formatDate,
  formatDuration,
  isoDate,
  minutesToTime,
  parseDate,
  type ServiceColorMap,
  startOfWeek,
  statusLabel,
} from "./occupancy";

const WEEKDAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

/**
 * Dia: lista cronológica (quadro A1). Cada linha é um horário, o traço da cor
 * do serviço e o que acontece ali; a grade de horas é da Semana (`timeGrid`).
 */
export function DayView({
  canCreateAppointment = false,
  date,
  entries,
  hasAvailability = null,
  hiddenWeekdays = [],
  onSelectAppointment,
  onSelectBlock,
  onSelectDay,
  selectedAppointmentId,
  selectedBlockId,
  serviceColors,
}: {
  /** Governa a ação "Criar agendamento" do dia vazio (Goal069 AG-03). */
  canCreateAppointment?: boolean;
  date: string;
  entries: AgendaEntry[];
  /** `null` quando a disponibilidade não pôde ser lida: o motivo some, o resto continua. */
  hasAvailability?: boolean | null;
  hiddenWeekdays?: number[];
  /** Presente só a partir de 1024px (duas colunas): seleciona em vez de navegar. */
  onSelectAppointment?: (appointment: Appointment) => void;
  onSelectBlock?: (block: TimeBlock) => void;
  onSelectDay: (date: Date) => void;
  selectedAppointmentId?: string | null;
  selectedBlockId?: string | null;
  /** serviceId para colorToken, lido do catálogo; vazio deixa o traço neutro. */
  serviceColors?: ServiceColorMap;
}) {
  const now = useNow();
  const today = isoDate(now);
  const isToday = date === today;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const dayEntries = entriesForDate(entries, date);
  const rows = dayEntries
    .filter(isListedEntry)
    .sort((left, right) => left.startMinutes - right.startMinutes);
  const appointmentCount = dayEntries.filter(
    (entry) => entry.kind === "appointment",
  ).length;
  const blockCount = dayEntries.filter(
    (entry) => entry.kind === "block",
  ).length;
  const weekStart = startOfWeek(parseDate(date));
  const activeDates = datesWithActiveAppointment(entries);
  const nowIndex = isToday
    ? rows.findIndex((entry) => entry.startMinutes > nowMinutes)
    : -1;

  return (
    <section
      aria-label={`Agenda de ${formatDate(date)}`}
      className="agenda-calendar agenda-day-panel"
    >
      <WeekStrip
        activeDates={activeDates}
        hiddenWeekdays={hiddenWeekdays}
        onSelectDay={onSelectDay}
        selectedDate={date}
        today={today}
        weekStart={weekStart}
      />
      <div className="agenda-day-summary">
        <strong>{daySummaryHeading(date, isToday)}</strong>
        <span>{daySummaryLabel(appointmentCount, blockCount)}</span>
      </div>
      {rows.length === 0 ? (
        <div className="agenda-day-empty">
          <p className="agenda-no-results">Nenhum atendimento neste dia.</p>
          {hasAvailability === false && (
            <p className="agenda-day-empty-reason">
              Você não atende neste dia.
            </p>
          )}
          {canCreateAppointment && (
            <Button href="/agenda/novo" variant="secondary">
              Criar agendamento
            </Button>
          )}
        </div>
      ) : (
        <ul className="agenda-day-list">
          {rows.map((entry, index) => {
            return (
              <Fragment key={entry.key}>
                {isToday && nowIndex === index && (
                  <NowMarker minutes={nowMinutes} />
                )}
                <li className="agenda-day-item">
                  <DayRow
                    entry={entry}
                    isPast={isPast(entry, date, today, nowMinutes)}
                    onSelectAppointment={onSelectAppointment}
                    onSelectBlock={onSelectBlock}
                    selectedAppointmentId={selectedAppointmentId}
                    selectedBlockId={selectedBlockId}
                    serviceColors={serviceColors}
                  />
                </li>
              </Fragment>
            );
          })}
          {isToday && nowIndex === -1 && <NowMarker minutes={nowMinutes} />}
        </ul>
      )}
    </section>
  );
}

/** Intervalo só aparece depois do atendimento a que pertence. */
function isListedEntry(entry: AgendaEntry): boolean {
  if (entry.kind !== "buffer") return true;
  return (
    entry.appointment !== undefined &&
    entry.startMinutes >= timeOfAppointmentEnd(entry.appointment)
  );
}

function timeOfAppointmentEnd(appointment: Appointment): number {
  const [hours = 0, minutes = 0] = appointment.endTime.split(":").map(Number);
  return hours * 60 + minutes;
}

function isPast(
  entry: AgendaEntry,
  date: string,
  today: string,
  nowMinutes: number,
): boolean {
  if (date < today) return true;
  if (date > today) return false;
  return entry.endMinutes <= nowMinutes;
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function NowMarker({ minutes }: { minutes: number }) {
  return (
    <li className="agenda-day-now">
      <span className="agenda-day-now-label">{minutesToTime(minutes)}</span>
      <span aria-hidden="true" className="agenda-day-now-line" />
      <span aria-hidden="true" className="agenda-day-now-dot" />
    </li>
  );
}

function WeekStrip({
  activeDates,
  hiddenWeekdays,
  onSelectDay,
  selectedDate,
  today,
  weekStart,
}: {
  activeDates: Set<string>;
  hiddenWeekdays: number[];
  onSelectDay: (date: Date) => void;
  selectedDate: string;
  today: string;
  weekStart: Date;
}) {
  const hiddenSet = new Set(hiddenWeekdays);
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  ).filter((day) => !hiddenSet.has(day.getDay()));

  return (
    <div className="agenda-week-strip" role="group" aria-label="Dias da semana">
      {days.map((day) => {
        const iso = isoDate(day);
        return (
          <button
            aria-current={iso === selectedDate ? "date" : undefined}
            className={clsx(
              "agenda-week-strip-day",
              iso === selectedDate && "is-selected",
              iso === today && "is-today",
              iso < today && "is-past",
            )}
            key={iso}
            onClick={() => onSelectDay(day)}
            type="button"
          >
            <span className="agenda-week-strip-label">
              {WEEKDAY_LABELS[(day.getDay() + 6) % 7]}
            </span>
            <span className="agenda-week-strip-number">{day.getDate()}</span>
            {activeDates.has(iso) ? (
              <span aria-hidden="true" className="agenda-week-strip-dot" />
            ) : (
              <span aria-hidden="true" className="agenda-week-strip-gap" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function DayRow({
  entry,
  isPast,
  onSelectAppointment,
  onSelectBlock,
  selectedAppointmentId,
  selectedBlockId,
  serviceColors,
}: {
  entry: AgendaEntry;
  isPast: boolean;
  onSelectAppointment?: (appointment: Appointment) => void;
  onSelectBlock?: (block: TimeBlock) => void;
  selectedAppointmentId?: string | null;
  selectedBlockId?: string | null;
  serviceColors?: ServiceColorMap;
}) {
  const time = minutesToTime(entry.startMinutes);
  const block = entry.timeBlock;
  const appointment = entry.appointment;
  const className = clsx(
    "agenda-day-row",
    `is-${entry.kind}`,
    isPast && "is-past",
  );

  if (entry.kind === "buffer") {
    return (
      <div className="agenda-day-row is-buffer">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span className="agenda-day-buffer-text">
          intervalo · {entry.endMinutes - entry.startMinutes} min
        </span>
      </div>
    );
  }

  if (entry.kind === "appointment" && appointment) {
    const presentation = describeEntry(entry);
    const selected = appointment.id === selectedAppointmentId;
    const content = (
      <AppointmentContent
        appointment={appointment}
        isPast={isPast}
        serviceColors={serviceColors}
        time={time}
        title={presentation.title}
      />
    );
    const rowClass = clsx(
      className,
      presentation.isNoShow && "is-no-show",
      selected && "is-selected",
    );
    // A partir de 1024px a lista seleciona em vez de navegar: o painel de
    // detalhe abre ao lado, na mesma tela (Goal069 §2). Abaixo disso,
    // `onSelectAppointment` não é passado e o link navega como sempre.
    if (onSelectAppointment) {
      return (
        <button
          aria-pressed={selected}
          className={rowClass}
          onClick={() => onSelectAppointment(appointment)}
          type="button"
        >
          {content}
        </button>
      );
    }
    return (
      <Link
        className={rowClass}
        href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
      >
        {content}
      </Link>
    );
  }

  const content = <OccurrenceContent entry={entry} time={time} />;
  const rowClass = clsx(
    className,
    block !== undefined && block.id === selectedBlockId && "is-selected",
  );

  // Bloqueio e compromisso pessoal levam às ações da ocorrência: remover ou
  // mover só esta, ou editar a série a partir daqui (Goal016, item 5).
  if (block && onSelectBlock) {
    return (
      <button
        aria-pressed={block.id === selectedBlockId}
        className={rowClass}
        onClick={() => onSelectBlock(block)}
        type="button"
      >
        {content}
      </button>
    );
  }

  return <div className={clsx(rowClass, "is-readonly")}>{content}</div>;
}

function AppointmentContent({
  appointment,
  isPast,
  serviceColors,
  time,
  title,
}: {
  appointment: Appointment;
  isPast: boolean;
  serviceColors?: ServiceColorMap;
  time: string;
  title: string;
}) {
  const status = appointment.status.toUpperCase();
  const colors = appointmentServiceColors(
    appointment,
    serviceColors ?? new Map(),
  );
  const parts = colors.length > 0 ? colors : [null];
  const meta = [
    serviceLabel(appointment),
    formatDuration(appointment.durationMinutes),
    isPast ? null : priceLabel(appointment),
  ].filter((part): part is string => Boolean(part));
  const confirmedPresence =
    Boolean(appointment.presenceConfirmedAt) &&
    status !== "COMPLETED" &&
    status !== "NO_SHOW";

  return (
    <>
      <span className="agenda-day-time">{time}</span>
      <span aria-hidden="true" className="agenda-day-stripe">
        {parts.map((color, index) => (
          <span
            className="agenda-day-stripe-part"
            data-color={color ?? undefined}
            key={index}
          />
        ))}
      </span>
      <span className="agenda-day-body">
        <span className="agenda-day-main">
          <strong className="agenda-day-name">{title}</strong>
          <span className="agenda-day-meta">{meta.join(" · ")}</span>
          {confirmedPresence && (
            <span className="agenda-day-note">
              <CheckIcon size={11} strokeWidth={3} />
              presença confirmada pelo lembrete
            </span>
          )}
        </span>
        <span
          className={clsx(
            "agenda-day-status",
            status === "NO_SHOW" && "is-no-show",
            status === "COMPLETED" && "is-completed",
          )}
        >
          {status === "NO_SHOW" ? (
            <BanIcon size={12} strokeWidth={2.25} />
          ) : status === "COMPLETED" ? (
            <CheckIcon size={12} strokeWidth={3} />
          ) : (
            <span aria-hidden="true" className="agenda-day-status-dot" />
          )}
          {statusLabel(appointment.status)}
        </span>
      </span>
    </>
  );
}

function OccurrenceContent({
  entry,
  time,
}: {
  entry: AgendaEntry;
  time: string;
}) {
  const presentation = describeEntry(entry);
  const duration = formatDuration(entry.endMinutes - entry.startMinutes);

  let body: ReactNode;
  if (entry.kind === "block") {
    body = (
      <span className="agenda-day-pill">
        <BanIcon size={15} strokeWidth={2} />
        <strong className="agenda-day-pill-title">{presentation.title}</strong>
        <span className="agenda-day-pill-meta">bloqueio · {duration}</span>
      </span>
    );
  } else if (entry.kind === "personal") {
    body = (
      <span className="agenda-day-personal">
        <PersonIcon />
        <strong className="agenda-day-personal-title">
          {presentation.title}
        </strong>
        <span className="agenda-day-personal-meta">
          · compromisso pessoal · {duration}
        </span>
      </span>
    );
  } else {
    body = (
      <span className="agenda-day-personal">
        <strong className="agenda-day-personal-title">
          {presentation.title}
        </strong>
        <span className="agenda-day-personal-meta">
          · {presentation.typeLabel.toLowerCase()} · {duration}
        </span>
        {presentation.detail && (
          <span className="agenda-day-personal-reason">
            {presentation.detail}
          </span>
        )}
      </span>
    );
  }

  return (
    <>
      <span className="agenda-day-time">{time}</span>
      <span aria-hidden="true" />
      {body}
    </>
  );
}

function serviceLabel(appointment: Appointment): string {
  return (
    appointment.services.map((service) => service.name).join(" + ") ||
    appointment.title ||
    "Serviço não informado"
  );
}

function priceLabel(appointment: Appointment): string | null {
  const { totalPrice, totalPriceType } = appointment;
  if (totalPrice === null || totalPrice === undefined) return null;
  if (totalPriceType === "NONE") return null;
  const digits = Number.isInteger(totalPrice) ? 0 : 2;
  const amount = new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  }).format(totalPrice);
  return totalPriceType === "STARTING_AT" ? `a partir de ${amount}` : amount;
}

function daySummaryLabel(appointmentCount: number, blockCount: number): string {
  const appointmentsPart = `${appointmentCount} ${appointmentCount === 1 ? "atendimento" : "atendimentos"}`;
  if (blockCount === 0) return appointmentsPart;
  const blocksPart = `${blockCount} ${blockCount === 1 ? "bloqueio" : "bloqueios"}`;
  return `${appointmentsPart} · ${blocksPart}`;
}

function CheckIcon({
  size,
  strokeWidth,
}: {
  size: number;
  strokeWidth: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function BanIcon({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M6.5 6.5l11 11" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={15}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={15}
    >
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}
