"use client";

import clsx from "clsx";
import { type CSSProperties, useEffect, useState } from "react";

import { DaySummaryCard } from "./DaySummaryCard";
import {
  addDays,
  type AgendaEntry,
  appointmentServiceColors,
  customerLabel,
  endOfMonth,
  entriesForDate,
  isFullDayClosure,
  isoDate,
  parseDate,
  type ServiceColorMap,
  startOfMonth,
  startOfWeek,
} from "./occupancy";

const WEEKDAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
// Mesma ordem Segunda…Domingo da grade (o valor gravado de `dayOfWeek`
// continua 0=domingo…6=sábado), para casar rótulo e coluna com `hiddenWeekdays`.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Abaixo de 768 px o dia é uma pilha de traços; a partir dele, linhas com nome. */
const LINES_MIN_WIDTH = 768;
const LINES_TWO_MIN_WIDTH = 1024;
const MAX_STRIPES = 5;

type MonthDensity = "stripes" | "lines-3" | "lines-2";

function densityFor(width: number): MonthDensity {
  if (width < LINES_MIN_WIDTH) return "stripes";
  return width < LINES_TWO_MIN_WIDTH ? "lines-3" : "lines-2";
}

function useMonthDensity(): MonthDensity {
  const [density, setDensity] = useState<MonthDensity>(() =>
    typeof window === "undefined" ? "stripes" : densityFor(window.innerWidth),
  );
  useEffect(() => {
    function handleResize() {
      setDensity(densityFor(window.innerWidth));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return density;
}

/** Atendimento, bloqueio, compromisso e indisponibilidade ocupam o dia; intervalo e horário extra não. */
function isDayMark(entry: AgendaEntry): boolean {
  return entry.kind !== "buffer" && entry.kind !== "exception-extra";
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function dayLabel(day: Date, marks: AgendaEntry[]): string {
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
  }).format(day);
  const appointments = marks.filter((entry) => entry.kind === "appointment");
  const others = marks.length - appointments.length;
  const parts = [date];
  if (appointments.length > 0) {
    parts.push(plural(appointments.length, "atendimento", "atendimentos"));
  }
  if (others > 0)
    parts.push(
      plural(others, "bloqueio ou compromisso", "bloqueios ou compromissos"),
    );
  if (marks.length === 0) parts.push("sem atendimentos");
  return parts.join(", ");
}

function appointmentServiceText(entry: AgendaEntry): string {
  const appointment = entry.appointment;
  if (!appointment) return "";
  return (
    appointment.services.map((service) => service.name).join(" + ") ||
    appointment.title ||
    "Serviço não informado"
  );
}

function entryTitle(entry: AgendaEntry): string {
  if (entry.kind === "appointment" && entry.appointment) {
    return customerLabel(entry.appointment);
  }
  if (entry.kind === "block" || entry.kind === "personal") {
    return (
      entry.timeBlock?.title ??
      entry.timeBlock?.reason ??
      (entry.kind === "personal" ? "Compromisso pessoal" : "Bloqueio")
    );
  }
  return "Indisponível";
}

function entrySuffix(entry: AgendaEntry): string {
  if (entry.kind === "appointment") return appointmentServiceText(entry);
  return entry.kind === "personal" ? "compromisso pessoal" : "bloqueio";
}

function Stripe({
  colors,
  entry,
}: {
  colors: ServiceColorMap;
  entry: AgendaEntry;
}) {
  if (entry.kind === "appointment" && entry.appointment) {
    const tokens = appointmentServiceColors(entry.appointment, colors);
    return (
      <i aria-hidden="true" className="month-stripe">
        {(tokens.length > 0 ? tokens : [null]).map((token, index) => (
          <b data-color={token ?? undefined} key={`${token}-${index}`} />
        ))}
      </i>
    );
  }
  return (
    <i
      aria-hidden="true"
      className={clsx(
        "month-stripe",
        entry.kind === "personal" ? "is-personal" : "is-block",
      )}
    />
  );
}

function Line({
  colors,
  entry,
}: {
  colors: ServiceColorMap;
  entry: AgendaEntry;
}) {
  const appointment = entry.kind === "appointment" ? entry.appointment : null;
  const tokens = appointment
    ? appointmentServiceColors(appointment, colors)
    : [];
  return (
    <span className={clsx("month-line", `is-${entry.kind}`)}>
      {appointment && (
        <i aria-hidden="true" className="month-line-bar">
          {(tokens.length > 0 ? tokens : [null]).map((token, index) => (
            <b data-color={token ?? undefined} key={`${token}-${index}`} />
          ))}
        </i>
      )}
      {entryTitle(entry)}
      <span className="month-line-service"> · {entrySuffix(entry)}</span>
    </span>
  );
}

export function MonthView({
  availableWeekdays = null,
  entries,
  hiddenWeekdays = [],
  month,
  onSelectDay,
  selectedDate,
  serviceColors,
}: {
  availableWeekdays?: Set<number> | null;
  entries: AgendaEntry[];
  hiddenWeekdays?: number[];
  month: Date;
  onSelectDay: (date: Date) => void;
  selectedDate?: string;
  serviceColors?: ServiceColorMap;
}) {
  const colors: ServiceColorMap = serviceColors ?? new Map();
  const density = useMonthDensity();
  // Primeiro toque só marca o dia e mostra o resumo; tocar no dia já marcado
  // (ou em "Abrir dia") abre o Dia. A marca recomeça a cada mudança de cursor.
  const [focused, setFocused] = useState(selectedDate ?? isoDate(month));

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = addDays(startOfWeek(endOfMonth(month)), 6);
  const days: Date[] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  const todayDate = new Date();
  const today = isoDate(todayDate);
  const currentMonth = month.getMonth();

  const hiddenSet = new Set(hiddenWeekdays);
  const visibleColumns = WEEKDAY_ORDER.filter((dow) => !hiddenSet.has(dow));
  const columns = Math.max(1, visibleColumns.length);
  const visibleDays = days.filter(
    (_, index) => !hiddenSet.has(WEEKDAY_ORDER[index % 7]),
  );
  const lineCap = density === "lines-2" ? 2 : 3;

  function tapDay(day: Date) {
    if (isoDate(day) === focused) {
      onSelectDay(day);
      return;
    }
    setFocused(isoDate(day));
  }

  return (
    <>
      <section
        aria-label="Mapa do mês"
        className="month-map"
        style={{ "--visible-days": columns } as CSSProperties}
      >
        <div className="month-weekday-row">
          {WEEKDAY_LABELS.filter(
            (_, index) => !hiddenSet.has(WEEKDAY_ORDER[index]),
          ).map((label, index) => (
            <span
              className={clsx(
                "month-weekday",
                visibleColumns[index] === todayDate.getDay() && "is-today",
              )}
              key={label}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="month-days">
          {visibleDays.map((day) => {
            const iso = isoDate(day);
            const marks = entriesForDate(entries, iso).filter(isDayMark);
            const closed = marks.some(isFullDayClosure);
            const visibleCount =
              density === "stripes"
                ? Math.min(marks.length, MAX_STRIPES)
                : marks.length <= lineCap + 1
                  ? marks.length
                  : lineCap;
            const visible = marks.slice(0, visibleCount);
            const overflow = marks.length - visible.length;
            return (
              <button
                aria-current={iso === today ? "date" : undefined}
                aria-label={dayLabel(day, marks)}
                aria-pressed={iso === focused}
                className={clsx(
                  "month-day",
                  day.getMonth() !== currentMonth && "is-outside",
                  iso === today && "is-today",
                  iso === focused && "is-selected",
                  closed && "is-closed",
                )}
                key={iso}
                onClick={() => tapDay(day)}
                type="button"
              >
                <span className="month-day-number">{day.getDate()}</span>
                <span className="month-day-entries">
                  {visible.map((entry) =>
                    density === "stripes" ? (
                      <Stripe colors={colors} entry={entry} key={entry.key} />
                    ) : (
                      <Line colors={colors} entry={entry} key={entry.key} />
                    ),
                  )}
                  {overflow > 0 && (
                    <span className="month-day-more">+{overflow}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <DaySummaryCard
        date={focused}
        entries={entries}
        hasAvailability={
          availableWeekdays !== null
            ? availableWeekdays.has(parseDate(focused).getDay())
            : null
        }
        isToday={focused === today}
        onOpenDay={onSelectDay}
        serviceColors={colors}
      />
    </>
  );
}
