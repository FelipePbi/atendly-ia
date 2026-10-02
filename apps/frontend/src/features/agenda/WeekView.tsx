"use client";

import clsx from "clsx";
import { type CSSProperties, useEffect, useState } from "react";

import {
  addDays,
  type AgendaEntry,
  appointmentServiceColors,
  type AvailabilityRuleLike,
  describeEntry,
  entriesForDate,
  formatDuration,
  isoDate,
  minutesToTime,
  outsideHoursRanges,
  parseDate,
  type ServiceColorMap,
  serviceLegend,
} from "./occupancy";
import { entryPlacement, layoutDayEntries } from "./timeGrid";

const WEEKDAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const MAP_START_HOUR = 8;
const MAP_END_HOUR = 20;

function mapBounds(entries: AgendaEntry[]): {
  endHour: number;
  hours: number[];
  startHour: number;
} {
  const startHour = Math.min(
    MAP_START_HOUR,
    ...entries.map((entry) => Math.floor(entry.startMinutes / 60)),
  );
  const endHour = Math.max(
    MAP_END_HOUR,
    ...entries.map((entry) => Math.ceil(entry.endMinutes / 60)),
  );
  const hours: number[] = [];
  for (let hour = startHour; hour <= endHour; hour += 2) hours.push(hour);
  return { endHour, hours, startHour };
}

function weekRangeLabel(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "";
  const monthName = (value: Date) =>
    new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(value);
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} de ${monthName(last)}`;
  }
  return `${first.getDate()} de ${monthName(first)} – ${last.getDate()} de ${monthName(last)}`;
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function WeekView({
  availabilityRules = null,
  entries,
  hiddenWeekdays = [],
  onSelectDay,
  serviceColors,
  start,
}: {
  availabilityRules?: AvailabilityRuleLike[] | null;
  entries: AgendaEntry[];
  hiddenWeekdays?: number[];
  onSelectDay: (date: Date) => void;
  /** serviceId para colorToken, lido do catálogo; vazio deixa o traço neutro. */
  serviceColors?: ServiceColorMap;
  start: string;
}) {
  const colors: ServiceColorMap = serviceColors ?? new Map();
  const startDate = parseDate(start);
  const hiddenSet = new Set(hiddenWeekdays);
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(startDate, index),
  ).filter((day) => !hiddenSet.has(day.getDay()));
  const now = useNow();
  const today = isoDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const dayIsos = new Set(days.map(isoDate));
  const weekEntries = entries.filter((entry) => dayIsos.has(entry.date));
  const { endHour, hours, startHour } = mapBounds(weekEntries);
  const appointmentCount = weekEntries.filter(
    (entry) => entry.kind === "appointment",
  ).length;
  const legend = serviceLegend(weekEntries, colors);
  const hasUncolored = legend.some((item) => item.color === null);
  const windowStyle = {
    "--hours": endHour - startHour,
    "--visible-days": days.length,
  } as CSSProperties;

  return (
    <section aria-label="Mapa da semana" className="week-map" style={windowStyle}>
      <div className="week-map-summary">
        <span className="week-map-range">{weekRangeLabel(days)}</span>
        <span className="week-map-count">
          {appointmentCount}{" "}
          {appointmentCount === 1 ? "atendimento" : "atendimentos"}
        </span>
      </div>
      <div className="week-map-board">
        <div className="week-map-axis" aria-hidden="true">
          {hours.map((hour) => (
            <span
              className="week-map-hour"
              key={hour}
              style={{ "--at": hour - startHour } as CSSProperties}
            >
              {hour}h
            </span>
          ))}
        </div>
        <div className="week-map-days">
          {days.map((day) => {
            const iso = isoDate(day);
            const isToday = iso === today;
            const dayEntries = entriesForDate(entries, iso);
            const outside = outsideHoursRanges(
              availabilityRules,
              day.getDay(),
              startHour * 60,
              endHour * 60,
            );
            return (
              <div className="week-map-day" key={iso}>
                <button
                  className={clsx("week-map-head", isToday && "is-today")}
                  onClick={() => onSelectDay(day)}
                  type="button"
                >
                  <span className="week-map-weekday">
                    {WEEKDAY_LABELS[(day.getDay() + 6) % 7]}
                  </span>
                  <span className="week-map-date">{day.getDate()}</span>
                </button>
                <div className="week-map-column">
                  {outside.map(([from, to]) => (
                    <span
                      aria-hidden="true"
                      className="week-map-off"
                      data-testid="week-off-hours"
                      key={from}
                      style={
                        {
                          "--span": (to - from) / 60,
                          "--start": from / 60 - startHour,
                        } as CSSProperties
                      }
                    />
                  ))}
                  {layoutDayEntries(dayEntries).map(({ entry, lane }) => (
                    <WeekEntryBar
                      colors={colors}
                      entry={entry}
                      isPast={isToday && entry.endMinutes <= nowMinutes}
                      key={entry.key}
                      lane={lane}
                      startHour={startHour}
                    />
                  ))}
                  {isToday &&
                    nowMinutes >= startHour * 60 &&
                    nowMinutes <= endHour * 60 && (
                      <span
                        aria-hidden="true"
                        className="week-map-now"
                        style={
                          {
                            "--start": nowMinutes / 60 - startHour,
                          } as CSSProperties
                        }
                      />
                    )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {legend.length > 0 && (
        <ul aria-label="Legenda de serviços" className="week-map-legend">
          {legend
            .filter((item) => item.color !== null)
            .map((item) => (
              <li key={item.key}>
                <span
                  aria-hidden="true"
                  className="week-map-dot"
                  data-color={item.color ?? undefined}
                />
                {item.name}
              </li>
            ))}
          {hasUncolored && (
            <li>
              <span aria-hidden="true" className="week-map-dot is-none" />
              Sem cor definida
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function WeekEntryBar({
  colors,
  entry,
  isPast,
  lane,
  startHour,
}: {
  colors: ServiceColorMap;
  entry: AgendaEntry;
  isPast: boolean;
  lane: { index: number; total: number };
  startHour: number;
}) {
  const presentation = describeEntry(entry);
  const timeRange = `${minutesToTime(entry.startMinutes)}–${minutesToTime(entry.endMinutes)}`;
  // Nome e serviço no nome acessível, sem perder o tipo (`typeLabel`): sem ele,
  // um bloqueio e um compromisso com o mesmo título ficam com o mesmo nome
  // acessível (D-089, item 2). `presentation.detail` já traz "<serviço> ·
  // <duração>" para atendimento.
  const label = `${presentation.typeLabel}: ${[
    presentation.title,
    presentation.detail,
    timeRange,
    presentation.statusText,
  ]
    .filter(Boolean)
    .join(", ")}`;

  const appointment = entry.kind === "appointment" ? entry.appointment : null;
  const tokens = appointment ? appointmentServiceColors(appointment, colors) : [];
  const serviceText = appointment
    ? appointment.services.map((service) => service.name).join(" + ") ||
      appointment.title ||
      "Serviço não informado"
    : null;
  const subText =
    serviceText ??
    (entry.kind === "block" || entry.kind === "personal"
      ? `${entry.kind === "personal" ? "compromisso pessoal" : "bloqueio"}${
          entry.kind === "block"
            ? ` · ${formatDuration(entry.endMinutes - entry.startMinutes)}`
            : ""
        }`
      : presentation.detail);

  return (
    <div
      aria-label={label}
      className={clsx("week-bar", `is-${entry.kind}`, {
        "is-no-show": presentation.isNoShow,
        "is-past": isPast,
      })}
      style={entryPlacement(entry, startHour, lane)}
    >
      {appointment && (
        <>
          <i
            aria-hidden="true"
            className={clsx("week-bar-stripe", tokens.length > 1 && "is-split")}
          >
            {(tokens.length > 0 ? tokens : [null]).map((token, index) => (
              <b data-color={token ?? undefined} key={`${token}-${index}`} />
            ))}
          </i>
          <span className="week-bar-text">
            <span className="week-bar-name">{presentation.title}</span>
            <span className="week-bar-sub is-inline">{subText}</span>
          </span>
        </>
      )}
      {!appointment && (
        <span className="week-bar-text">
          <span className="week-bar-name">{presentation.title}</span>
          <span className="week-bar-sub">{subText}</span>
        </span>
      )}
    </div>
  );
}
