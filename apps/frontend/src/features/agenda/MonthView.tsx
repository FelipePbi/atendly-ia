"use client";

import clsx from "clsx";

import { Icon } from "@/shared/icons/Icon";

import {
  addDays,
  type AgendaEntry,
  describeEntry,
  endOfMonth,
  entriesForDate,
  isoDate,
  startOfMonth,
  startOfWeek,
} from "./occupancy";

const WEEKDAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const MAX_VISIBLE_ENTRIES = 3;

export function MonthView({
  entries,
  month,
  onSelectDay,
  selectedDate,
}: {
  entries: AgendaEntry[];
  month: Date;
  onSelectDay: (date: Date) => void;
  selectedDate?: string;
}) {
  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = addDays(startOfWeek(endOfMonth(month)), 6);
  const days: Date[] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  const today = isoDate(new Date());
  const currentMonth = month.getMonth();

  return (
    <section
      aria-label="Mapa do mês"
      className="agenda-calendar agenda-month-panel"
    >
      <div className="month-weekday-row">
        {WEEKDAY_LABELS.map((label) => (
          <span className="month-weekday" key={label}>
            {label}
          </span>
        ))}
      </div>
      <div className="month-days">
        {days.map((day) => {
          const iso = isoDate(day);
          const dayEntries = entriesForDate(entries, iso).filter(
            (entry) => entry.kind !== "buffer",
          );
          const visible = dayEntries.slice(0, MAX_VISIBLE_ENTRIES);
          const overflow = dayEntries.length - visible.length;
          return (
            <button
              aria-current={iso === today ? "date" : undefined}
              aria-pressed={iso === selectedDate}
              className={clsx(
                "month-day",
                day.getMonth() !== currentMonth && "is-outside",
                iso === today && "is-today",
                iso === selectedDate && "is-selected",
              )}
              key={iso}
              onClick={() => onSelectDay(day)}
              type="button"
            >
              <span className="month-day-number">{day.getDate()}</span>
              <span className="month-day-entries">
                {visible.map((entry) => {
                  const presentation = describeEntry(entry);
                  return (
                    <span
                      className={clsx("month-entry", `is-${entry.kind}`)}
                      key={entry.key}
                    >
                      <Icon name={presentation.icon} />
                      <span>{presentation.title}</span>
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="month-day-more">+{overflow}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
