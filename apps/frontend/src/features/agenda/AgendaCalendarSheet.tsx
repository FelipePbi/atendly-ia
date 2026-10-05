"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

import type { AvailabilityException, TimeBlock } from "@/data";
import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import {
  addDays,
  addMonths,
  type AgendaEntry,
  buildAgendaEntries,
  endOfMonth,
  isFullDayClosure,
  isoDate,
  startOfMonth,
  startOfWeek,
} from "./occupancy";

const WEEKDAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

/** Dias que têm atendimento e dias fechados o dia inteiro, por data ISO. */
interface MonthMarks {
  appointments: Set<string>;
  closed: Set<string>;
}

const NO_MARKS: MonthMarks = { appointments: new Set(), closed: new Set() };

function marksFrom(entries: AgendaEntry[]): MonthMarks {
  const marks: MonthMarks = { appointments: new Set(), closed: new Set() };
  for (const entry of entries) {
    if (entry.kind === "appointment") marks.appointments.add(entry.date);
    if (isFullDayClosure(entry)) marks.closed.add(entry.date);
  }
  return marks;
}

function monthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month));
  const end = addDays(startOfWeek(endOfMonth(month)), 6);
  const days: Date[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

function monthTitle(month: Date): string {
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  })
    .format(month)
    .replace(" de ", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dayName(day: Date, appointment: boolean, closed: boolean): string {
  const parts = [
    new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: "long",
      weekday: "long",
    }).format(day),
  ];
  if (appointment) parts.push("com atendimentos");
  if (closed) parts.push("dia fechado");
  return parts.join(", ");
}

/**
 * Mini-calendário do quadro A3: só navega, não é a visão mensal. Lê o mês da
 * grade com as mesmas três leituras da Agenda (a janela já carregada é uma
 * semana no Dia) e marca ponto no dia com agendamento e cinza no dia fechado
 * o dia inteiro. Uma falha deixa a folha navegável, sem pontos; fechar a folha
 * cancela a leitura em voo.
 */
export function AgendaCalendarSheet({
  avenly,
  focusedDate,
  onClose,
  onPick,
  timezone,
}: {
  /** Bloqueio e exceção só existem na fonte Avenly, como na Agenda. */
  avenly: boolean;
  focusedDate: Date;
  onClose: () => void;
  onPick: (date: Date) => void;
  timezone?: string;
}) {
  const [month, setMonth] = useState(() => startOfMonth(focusedDate));
  // Os pontos valem só para a grade que os leu: trocar de mês os apaga até a nova leitura chegar.
  const [loaded, setLoaded] = useState<{ marks: MonthMarks; window: string }>({
    marks: NO_MARKS,
    window: "",
  });
  const days = useMemo(() => monthGrid(month), [month]);
  const startDate = isoDate(days[0]);
  const endDate = isoDate(days[days.length - 1]);
  const marks = loaded.window === startDate ? loaded.marks : NO_MARKS;

  useEffect(() => {
    const controller = new AbortController();
    const services = getProductServices().calendar;
    const queryWindow = { endDate, startDate };
    Promise.all([
      services.listAppointments(queryWindow, controller.signal),
      avenly
        ? services.listTimeBlocks(queryWindow, controller.signal)
        : Promise.resolve<TimeBlock[]>([]),
      avenly
        ? services.listAvailabilityExceptions(queryWindow, controller.signal)
        : Promise.resolve<AvailabilityException[]>([]),
    ])
      .then(([appointments, timeBlocks, exceptions]) => {
        if (controller.signal.aborted) return;
        setLoaded({
          marks: marksFrom(
            buildAgendaEntries({ appointments, exceptions, timeBlocks, timezone }),
          ),
          window: startDate,
        });
      })
      .catch(() => {
        /* Sem pontos, e a folha continua navegável. */
      });
    return () => controller.abort();
  }, [avenly, endDate, startDate, timezone]);

  const today = isoDate(new Date());
  const focused = isoDate(focusedDate);
  const currentMonth = month.getMonth();
  const title = monthTitle(month);

  return (
    <ChatSheetShell
      className="is-agenda-calendar"
      onClose={onClose}
      title="Calendário"
    >
      <div className="agenda-calendar-head">
        <button
          aria-label="Ver mês anterior"
          className="agenda-calendar-step"
          onClick={() => setMonth((value) => addMonths(value, -1))}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" viewBox="0 0 24 24" width="18">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span aria-live="polite" className="agenda-calendar-title">
          {title}
        </span>
        <button
          aria-label="Ver próximo mês"
          className="agenda-calendar-step"
          onClick={() => setMonth((value) => addMonths(value, 1))}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" viewBox="0 0 24 24" width="18">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div aria-hidden="true" className="agenda-calendar-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span className={clsx(label === "DOM" && "is-sunday")} key={label}>
            {label}
          </span>
        ))}
      </div>
      <div className="agenda-calendar-days">
        {days.map((day) => {
          const iso = isoDate(day);
          const outside = day.getMonth() !== currentMonth;
          const before = outside && day < month;
          const appointment = !outside && marks.appointments.has(iso);
          const closed = !outside && marks.closed.has(iso);
          return (
            <button
              aria-current={iso === today ? "date" : undefined}
              aria-label={dayName(day, appointment, closed)}
              aria-pressed={iso === focused}
              className={clsx(
                "agenda-calendar-day",
                outside && "is-outside",
                !outside && iso < today && "is-past",
                closed && "is-closed",
                iso === today && "is-today",
                iso === focused && "is-selected",
              )}
              key={iso}
              onClick={() => onPick(day)}
              type="button"
            >
              <span>{day.getDate()}</span>
              {/* O quadro guarda a linha do ponto antes do mês e a dispensa depois. */}
              {(!outside || before) && (
                <span
                  className={clsx(
                    "agenda-calendar-dot",
                    appointment && "has-appointment",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="agenda-calendar-foot">
        <span>Um ponto = dia com atendimentos</span>
        <button
          className="agenda-calendar-today"
          onClick={() => onPick(new Date())}
          type="button"
        >
          Ir para hoje
        </button>
      </div>
    </ChatSheetShell>
  );
}
