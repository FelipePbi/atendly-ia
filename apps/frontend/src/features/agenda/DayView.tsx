"use client";

import clsx from "clsx";
import Link from "next/link";

import { type Appointment, type TimeBlock } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { Button } from "@/shared/ui/Button";

import {
  addDays,
  type AgendaEntry,
  datesWithActiveAppointment,
  describeEntry,
  entriesForDate,
  formatDate,
  isoDate,
  minutesToTime,
  parseDate,
  startOfWeek,
} from "./occupancy";
import {
  entryPlacement,
  type LanedEntry,
  layoutDayEntries,
  timeGridBounds,
} from "./timeGrid";

const WEEKDAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

/**
 * Dia: grade cronológica, com o ocupado na posição real do tempo.
 *
 * É a mesma mecânica da Semana (`timeGrid`): eixo de horas à esquerda e cada
 * entrada posicionada por `--start`/`--span`. Uma lista ordenada diria a
 * ordem dos eventos, mas não onde está o buraco de uma hora entre eles — e é
 * o buraco que a profissional procura ao abrir o Dia.
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
}) {
  const dayEntries = entriesForDate(entries, date);
  const laid = layoutDayEntries(dayEntries);
  const appointmentCount = dayEntries.filter(
    (entry) => entry.kind === "appointment",
  ).length;
  const blockCount = dayEntries.filter(
    (entry) => entry.kind === "block" || entry.kind === "personal",
  ).length;
  const { gridHeight, hours, startHour } = timeGridBounds(dayEntries);
  const weekStart = startOfWeek(parseDate(date));
  const activeDates = datesWithActiveAppointment(entries);

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
        weekStart={weekStart}
      />
      <div className="agenda-day-summary">
        <strong>{formatDate(date)}</strong>
        <span>{daySummaryLabel(appointmentCount, blockCount)}</span>
      </div>
      {laid.length === 0 ? (
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
        <div className="agenda-day-scroll">
          <div className="week-body">
            <div className="week-time-axis" style={{ height: gridHeight }}>
              {hours.map((hour) => (
                <div className="week-time" key={hour}>
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            <div className="agenda-day-column" style={{ height: gridHeight }}>
              {laid.map((item) => (
                <DayEntryBar
                  key={item.entry.key}
                  laid={item}
                  onSelectAppointment={onSelectAppointment}
                  onSelectBlock={onSelectBlock}
                  selectedAppointmentId={selectedAppointmentId}
                  selectedBlockId={selectedBlockId}
                  startHour={startHour}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function WeekStrip({
  activeDates,
  hiddenWeekdays,
  onSelectDay,
  selectedDate,
  weekStart,
}: {
  activeDates: Set<string>;
  hiddenWeekdays: number[];
  onSelectDay: (date: Date) => void;
  selectedDate: string;
  weekStart: Date;
}) {
  const hiddenSet = new Set(hiddenWeekdays);
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  ).filter((day) => !hiddenSet.has(day.getDay()));
  const today = isoDate(new Date());

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
            )}
            key={iso}
            onClick={() => onSelectDay(day)}
            type="button"
          >
            <span className="agenda-week-strip-label">
              {WEEKDAY_LABELS[(day.getDay() + 6) % 7]}
            </span>
            <span className="agenda-week-strip-number">{day.getDate()}</span>
            {activeDates.has(iso) && (
              <span aria-hidden="true" className="agenda-week-strip-dot" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function DayEntryBar({
  laid,
  onSelectAppointment,
  onSelectBlock,
  selectedAppointmentId,
  selectedBlockId,
  startHour,
}: {
  laid: LanedEntry;
  onSelectAppointment?: (appointment: Appointment) => void;
  onSelectBlock?: (block: TimeBlock) => void;
  selectedAppointmentId?: string | null;
  selectedBlockId?: string | null;
  startHour: number;
}) {
  const { entry, lane } = laid;
  const presentation = describeEntry(entry);
  const timeRange = `${minutesToTime(entry.startMinutes)}–${minutesToTime(entry.endMinutes)}`;
  const block = entry.timeBlock;
  const className = clsx(
    "week-appointment",
    "agenda-day-entry",
    `is-${entry.kind}`,
    {
      "is-no-show": presentation.isNoShow,
      "is-selected":
        (block !== undefined && block.id === selectedBlockId) ||
        (entry.kind === "appointment" &&
          entry.appointment !== undefined &&
          entry.appointment.id === selectedAppointmentId),
    },
  );
  const style = entryPlacement(entry, startHour, lane);
  const content = (
    <>
      <span className="appointment-time" aria-label={timeRange}>
        {timeRange}
      </span>
      <span className="week-appointment-kind">
        <Icon name={presentation.icon} />
        {presentation.typeLabel}
      </span>
      <strong>{presentation.title}</strong>
      {presentation.detail && <span>{presentation.detail}</span>}
      {presentation.statusText && (
        <span
          className={clsx(
            "badge",
            entry.kind === "appointment" &&
              entry.appointment &&
              entry.appointment.status.toUpperCase() === "COMPLETED" &&
              "badge-success",
            presentation.isNoShow && "badge-danger",
          )}
        >
          {presentation.statusText}
        </span>
      )}
    </>
  );

  if (entry.kind === "appointment" && entry.appointment) {
    const appointment = entry.appointment;
    // A partir de 1024px, a lista seleciona em vez de navegar: o painel de
    // detalhe abre ao lado, na mesma tela (Goal069 §2). Abaixo disso,
    // `onSelectAppointment` não é passado e o link navega como sempre.
    if (onSelectAppointment) {
      return (
        <button
          aria-pressed={appointment.id === selectedAppointmentId}
          className={className}
          onClick={() => onSelectAppointment(appointment)}
          style={style}
          type="button"
        >
          {content}
        </button>
      );
    }
    return (
      <Link
        className={className}
        href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
        style={style}
      >
        {content}
      </Link>
    );
  }

  // Bloqueio e compromisso pessoal levam às ações da ocorrência: remover ou
  // mover só esta, ou editar a série a partir daqui (Goal016, item 5).
  if (block && onSelectBlock) {
    return (
      <button
        aria-pressed={block.id === selectedBlockId}
        className={className}
        onClick={() => onSelectBlock(block)}
        style={style}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={clsx(className, "is-readonly")} style={style}>
      {content}
    </div>
  );
}

function daySummaryLabel(appointmentCount: number, blockCount: number): string {
  const appointmentsPart = `${appointmentCount} ${appointmentCount === 1 ? "atendimento" : "atendimentos"}`;
  if (blockCount === 0) return appointmentsPart;
  const blocksPart = `${blockCount} ${blockCount === 1 ? "bloqueio" : "bloqueios"}`;
  return `${appointmentsPart} · ${blocksPart}`;
}
