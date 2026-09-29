"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";

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
// Mesma ordem Segunda…Domingo da grade (o valor gravado de `dayOfWeek`
// continua 0=domingo…6=sábado), para casar rótulo e coluna com `hiddenWeekdays`.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MAX_VISIBLE_ENTRIES = 3;

export function MonthView({
  entries,
  hiddenWeekdays = [],
  month,
  onSelectDay,
  selectedDate,
}: {
  entries: AgendaEntry[];
  hiddenWeekdays?: number[];
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

  const hiddenSet = new Set(hiddenWeekdays);
  const visibleColumns = WEEKDAY_ORDER.filter((dow) => !hiddenSet.has(dow));
  const columns = Math.max(1, visibleColumns.length);
  const visibleDays = days.filter(
    (_, index) => !hiddenSet.has(WEEKDAY_ORDER[index % 7]),
  );

  return (
    <section
      aria-label="Mapa do mês"
      className="agenda-calendar agenda-month-panel"
      style={{ "--visible-days": columns } as CSSProperties}
    >
      <div className="month-weekday-row">
        {WEEKDAY_LABELS.filter(
          (_, index) => !hiddenSet.has(WEEKDAY_ORDER[index]),
        ).map((label) => (
          <span className="month-weekday" key={label}>
            {label}
          </span>
        ))}
      </div>
      <div className="month-days">
        {visibleDays.map((day, index) => {
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
                (index + 1) % columns === 0 && "is-row-end",
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
