"use client";

import clsx from "clsx";
import { type ComponentProps, useEffect, useMemo, useState } from "react";

import type { AvailabilityException, TimeBlock } from "@/data";
import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";
import { useSheetClose } from "@/shared/motion/sheetClose";
import { runViewTransition } from "@/shared/motion/viewTransition";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { recalledAgendaWindow, rememberAgendaWindow } from "./agendaMemory";
import { prefetchAgendaWindows } from "./agendaWindows";
import {
  addDays,
  addMonths,
  type AgendaEntry,
  buildAgendaEntries,
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

/** Seis semanas sempre (42 dias): a folha não muda de altura entre meses de 5 e de 6 linhas. */
const GRID_DAYS = 42;

function monthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month));
  return Array.from({ length: GRID_DAYS }, (_, index) => addDays(start, index));
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
  source,
  timezone,
}: {
  /** Bloqueio e exceção só existem na fonte Avenly, como na Agenda. */
  avenly: boolean;
  focusedDate: Date;
  onClose: () => void;
  onPick: (date: Date) => void;
  /** A fonte do calendário: a chave da memória da aba (D-167). */
  source?: string | null;
  timezone?: string;
}) {
  const [month, setMonth] = useState(() => startOfMonth(focusedDate));
  const days = useMemo(() => monthGrid(month), [month]);
  const startDate = isoDate(days[0]);
  const endDate = isoDate(days[days.length - 1]);
  // Os pontos valem só para a grade que os leu: trocar de mês mostra os da
  // memória da aba (D-167, D-168) ou nenhum, até a nova leitura chegar.
  const sourceKey = source ?? (avenly ? "AVENLY" : null);
  const remembered = useMemo(
    () =>
      sourceKey ? recalledAgendaWindow(sourceKey, startDate, endDate) : null,
    [endDate, sourceKey, startDate],
  );
  const [loaded, setLoaded] = useState<{ marks: MonthMarks; window: string }>({
    marks: NO_MARKS,
    window: "",
  });
  const marks =
    loaded.window === startDate
      ? loaded.marks
      : remembered
        ? marksFrom(
            buildAgendaEntries({
              appointments: remembered.appointments,
              exceptions: remembered.exceptions,
              timeBlocks: remembered.timeBlocks,
              timezone,
            }),
          )
        : NO_MARKS;

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
            buildAgendaEntries({
              appointments,
              exceptions,
              timeBlocks,
              timezone,
            }),
          ),
          window: startDate,
        });
        if (!sourceKey) return;
        rememberAgendaWindow({
          appointments,
          endDate,
          exceptions,
          source: sourceKey,
          startDate,
          timeBlocks,
        });
        // Os meses vizinhos ficam prontos para as setas da folha.
        prefetchAgendaWindows(
          services,
          sourceKey,
          [-1, 1].map((step) => {
            const grid = monthGrid(addMonths(startOfMonth(days[20]), step));
            return {
              endDate: isoDate(grid[grid.length - 1]),
              startDate: isoDate(grid[0]),
            };
          }),
          controller.signal,
        );
      })
      .catch(() => {
        /* Sem pontos, e a folha continua navegável. */
      });
    return () => controller.abort();
  }, [avenly, days, endDate, sourceKey, startDate, timezone]);

  const today = isoDate(new Date());
  const focused = isoDate(focusedDate);
  const currentMonth = month.getMonth();
  const title = monthTitle(month);

  // O passo de mês desliza a grade na direção do passo (pedido do usuário,
  // 2026-10-12); sem View Transitions, a grade só troca.
  function stepMonth(direction: -1 | 1) {
    void runViewTransition(
      () => setMonth((value) => addMonths(value, direction)),
      { types: [direction === 1 ? "step-next" : "step-prev"] },
    );
  }

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
          onClick={() => stepMonth(-1)}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            viewBox="0 0 24 24"
            width="18"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span aria-live="polite" className="agenda-calendar-title">
          {title}
        </span>
        <button
          aria-label="Ver próximo mês"
          className="agenda-calendar-step"
          onClick={() => stepMonth(1)}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            viewBox="0 0 24 24"
            width="18"
          >
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
      <CalendarDays
        currentMonth={currentMonth}
        days={days}
        focused={focused}
        marks={marks}
        month={month}
        onPick={onPick}
        today={today}
      />
      <div className="agenda-calendar-foot">
        <span>Um ponto = dia com atendimentos</span>
        <PickButton
          className="agenda-calendar-today"
          date={new Date()}
          onPick={onPick}
        >
          Ir para hoje
        </PickButton>
      </div>
    </ChatSheetShell>
  );
}

/** Escolher um dia fecha a folha com a saída animada e move a Agenda no mesmo quadro. */
function PickButton({
  children,
  date,
  onPick,
  ...props
}: Omit<ComponentProps<"button">, "onClick" | "type"> & {
  date: Date;
  onPick: (date: Date) => void;
}) {
  const closeSheet = useSheetClose();
  return (
    <button
      {...props}
      onClick={() =>
        closeSheet ? closeSheet(() => onPick(date)) : onPick(date)
      }
      type="button"
    >
      {children}
    </button>
  );
}

function CalendarDays({
  currentMonth,
  days,
  focused,
  marks,
  month,
  onPick,
  today,
}: {
  currentMonth: number;
  days: Date[];
  focused: string;
  marks: MonthMarks;
  month: Date;
  onPick: (date: Date) => void;
  today: string;
}) {
  return (
    <div className="agenda-calendar-days">
      {days.map((day) => {
        const iso = isoDate(day);
        const outside = day.getMonth() !== currentMonth;
        const before = outside && day < month;
        const appointment = !outside && marks.appointments.has(iso);
        const closed = !outside && marks.closed.has(iso);
        return (
          <PickButton
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
            date={day}
            key={iso}
            onPick={onPick}
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
          </PickButton>
        );
      })}
    </div>
  );
}
