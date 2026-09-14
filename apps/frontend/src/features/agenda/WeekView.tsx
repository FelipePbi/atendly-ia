"use client";

import clsx from "clsx";

import { Icon } from "@/shared/icons/Icon";

import {
  addDays,
  type AgendaEntry,
  describeEntry,
  entriesForDate,
  isoDate,
  minutesToTime,
  parseDate,
} from "./occupancy";
import { entryPlacement, timeGridBounds } from "./timeGrid";

const WEEKDAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

export function WeekView({
  entries,
  onSelectDay,
  start,
}: {
  entries: AgendaEntry[];
  onSelectDay: (date: Date) => void;
  start: string;
}) {
  const startDate = parseDate(start);
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(startDate, index),
  );
  const today = isoDate(new Date());

  const { gridHeight, hours, startHour } = timeGridBounds(entries);

  return (
    <section
      aria-label="Mapa da semana"
      className="agenda-calendar agenda-week-scroll"
    >
      <div className="week-board">
        <div className="week-header">
          <div className="week-header-spacer" />
          {days.map((day) => {
            const iso = isoDate(day);
            return (
              <button
                className={clsx("week-day-head", iso === today && "is-today")}
                key={iso}
                onClick={() => onSelectDay(day)}
                type="button"
              >
                <span>{WEEKDAY_LABELS[(day.getDay() + 6) % 7]}</span>
                <strong>{day.getDate()}</strong>
              </button>
            );
          })}
        </div>
        <div className="week-body">
          <div className="week-time-axis" style={{ height: gridHeight }}>
            {hours.map((hour) => (
              <div className="week-time" key={hour}>
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div className="week-days">
            {days.map((day) => {
              const iso = isoDate(day);
              const dayEntries = entriesForDate(entries, iso);
              return (
                <div
                  className="week-day"
                  key={iso}
                  style={{ height: gridHeight }}
                >
                  {dayEntries.map((entry) => (
                    <WeekEntryBar
                      entry={entry}
                      key={entry.key}
                      startHour={startHour}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function WeekEntryBar({
  entry,
  startHour,
}: {
  entry: AgendaEntry;
  startHour: number;
}) {
  const presentation = describeEntry(entry);
  const label = presentation.statusText
    ? `${presentation.typeLabel}: ${presentation.title}, ${presentation.statusText}`
    : `${presentation.typeLabel}: ${presentation.title}`;

  return (
    <div
      aria-label={label}
      className={clsx("week-appointment", `is-${entry.kind}`, {
        "is-no-show": presentation.isNoShow,
      })}
      style={entryPlacement(entry, startHour)}
    >
      <span className="appointment-time">
        {minutesToTime(entry.startMinutes)}–{minutesToTime(entry.endMinutes)}
      </span>
      <span className="week-appointment-kind">
        <Icon name={presentation.icon} />
        {presentation.typeLabel}
      </span>
      <strong>{presentation.title}</strong>
      {presentation.statusText && <span>{presentation.statusText}</span>}
    </div>
  );
}
