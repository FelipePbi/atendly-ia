"use client";

import clsx from "clsx";
import Link from "next/link";

import { type TimeBlock } from "@/data";
import { Icon } from "@/shared/icons/Icon";

import {
  type AgendaEntry,
  describeEntry,
  entriesForDate,
  formatDate,
  minutesToTime,
} from "./occupancy";
import {
  entryPlacement,
  type LanedEntry,
  layoutDayEntries,
  timeGridBounds,
} from "./timeGrid";

/**
 * Dia: grade cronológica, com o ocupado na posição real do tempo.
 *
 * É a mesma mecânica da Semana (`timeGrid`): eixo de horas à esquerda e cada
 * entrada posicionada por `--start`/`--span`. Uma lista ordenada diria a
 * ordem dos eventos, mas não onde está o buraco de uma hora entre eles — e é
 * o buraco que a profissional procura ao abrir o Dia.
 */
export function DayView({
  date,
  entries,
  onSelectBlock,
  selectedBlockId,
}: {
  date: string;
  entries: AgendaEntry[];
  onSelectBlock?: (block: TimeBlock) => void;
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

  return (
    <section
      aria-label={`Agenda de ${formatDate(date)}`}
      className="agenda-calendar agenda-day-panel"
    >
      <div className="agenda-day-summary">
        <strong>{formatDate(date)}</strong>
        <span>{daySummaryLabel(appointmentCount, blockCount)}</span>
      </div>
      {laid.length === 0 ? (
        <div className="agenda-no-results">Nenhum evento neste dia.</div>
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
                  onSelectBlock={onSelectBlock}
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

function DayEntryBar({
  laid,
  onSelectBlock,
  selectedBlockId,
  startHour,
}: {
  laid: LanedEntry;
  onSelectBlock?: (block: TimeBlock) => void;
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
      "is-selected": block !== undefined && block.id === selectedBlockId,
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
    return (
      <Link
        className={className}
        href={`/agenda/agendamento?id=${encodeURIComponent(entry.appointment.id)}`}
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
