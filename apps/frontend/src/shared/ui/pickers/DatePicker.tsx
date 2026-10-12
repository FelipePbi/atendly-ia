"use client";

import clsx from "clsx";
import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Icon } from "@/shared/icons/Icon";

import {
  addDays,
  capitalize,
  longDateLabel,
  MONTHS,
  parseIsoDate,
  sameMonth,
  startOfToday,
  toIsoDate,
  WEEKDAYS,
  weekStart,
} from "./dateTime";

/** Altura do dia (44 px de alvo de toque) mais o vão entre linhas. */
const DAY_HEIGHT = 44;
const ROW_GAP = 6;
const WEEKDAY_HEADERS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
/** Ordem das colunas (segunda a domingo) em `Date.getDay()`. */
const COLUMN_WEEKDAY = [1, 2, 3, 4, 5, 6, 0];

export type DatePickerProps = {
  /** `YYYY-MM-DD`, ou "" quando nada foi escolhido. */
  value: string;
  onChange: (value: string) => void;
  /** Dias antes de `min` ou depois de `max` não respondem. */
  min?: string;
  max?: string;
  /** Dias com atendimentos ganham um ponto. */
  busyDays?: readonly string[];
  /** Dias da semana em que não há atendimento (0 = domingo): ficam em cinza,
   * mas continuam clicáveis. */
  closedWeekdays?: readonly number[];
  /** Nasce com o mês inteiro aberto em vez da semana. */
  startExpanded?: boolean;
  /** Escolher um dia com o mês aberto recolhe de volta para a semana. */
  collapseOnPick?: boolean;
  /** Foca o dia escolhido ao montar (quando abre num painel). */
  autoFocus?: boolean;
  label?: string;
  className?: string;
};

type Motion = { dir: "f" | "b"; tick: number };

/**
 * Seletor de data (Seletores-de-Data-e-Hora.dc.html, quadro 01): um
 * calendário que nasce como semana e abre o mês. Hoje leva anel, o dia
 * escolhido fica petróleo, ponto marca dia com atendimentos.
 */
export function DatePicker({
  autoFocus = false,
  busyDays,
  className,
  closedWeekdays,
  collapseOnPick = true,
  label = "Calendário",
  max,
  min,
  onChange,
  startExpanded = false,
  value,
}: DatePickerProps) {
  const today = startOfToday();
  const selected = parseIsoDate(value);
  const [cursorIso, setCursorIso] = useState(() =>
    toIsoDate(selected ?? today),
  );
  const [expanded, setExpanded] = useState(startExpanded);
  const [focusIso, setFocusIso] = useState<string | null>(null);
  const [slide, setSlide] = useState<Motion>({ dir: "f", tick: 0 });
  const [pop, setPop] = useState(0);
  const [labelTick, setLabelTick] = useState(0);
  // A faixa da semana só desliza na vertical quando abre/recolhe o mês; ao
  // trocar de semana pelas setas ela troca de lugar sem atravessar o mês.
  const [verticalTransition, setVerticalTransition] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);

  // Valor trocado por fora (outro campo, um atalho da tela): o calendário vai
  // até ele. Uma escolha feita aqui já moveu o cursor e não muda nada.
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (parseIsoDate(value) && value !== cursorIso) {
      setCursorIso(value);
      setFocusIso(null);
    }
  }

  const cursor = parseIsoDate(cursorIso) ?? today;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((offset + daysInMonth) / 7);
  const gridStart = addDays(first, -offset);
  const cursorRow = Math.floor((offset + cursor.getDate() - 1) / 7);

  const busy = new Set(busyDays ?? []);
  const closed = new Set(closedWeekdays ?? []);
  const selectedIso = selected ? toIsoDate(selected) : null;
  const todayIso = toIsoDate(today);

  function unavailable(iso: string): boolean {
    return (min !== undefined && iso < min) || (max !== undefined && iso > max);
  }

  function pick(date: Date, keepOpen = false) {
    const iso = toIsoDate(date);
    if (unavailable(iso)) return;
    const crossesMonth = expanded && !sameMonth(date, cursor);
    const collapse = expanded && !keepOpen && collapseOnPick;
    if (crossesMonth) {
      setSlide((s) => ({ dir: date > cursor ? "f" : "b", tick: s.tick + 1 }));
    }
    setCursorIso(iso);
    setFocusIso(null);
    setPop((n) => n + 1);
    setLabelTick((n) => n + 1);
    setVerticalTransition(collapse);
    if (collapse) setExpanded(false);
    onChange(iso);
  }

  function navigate(delta: number) {
    let next: Date;
    if (expanded) {
      const firstOfMonth = new Date(year, month + delta, 1);
      next =
        selected && sameMonth(selected, firstOfMonth) ? selected : firstOfMonth;
    } else {
      next = addDays(cursor, 7 * delta);
    }
    setCursorIso(toIsoDate(next));
    setFocusIso(null);
    setSlide((s) => ({ dir: delta > 0 ? "f" : "b", tick: s.tick + 1 }));
    setPop(0);
    setVerticalTransition(false);
  }

  function toggle() {
    setExpanded((open) => !open);
    setPop(0);
    setVerticalTransition(true);
  }

  function onDayKey(event: KeyboardEvent<HTMLDivElement>, date: Date) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(date);
      return;
    }
    const step = (
      { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<
        string,
        number
      >
    )[event.key];
    if (!step) return;
    event.preventDefault();
    const next = addDays(date, step);
    const moved = expanded
      ? !sameMonth(next, cursor)
      : weekStart(next).getTime() !== weekStart(cursor).getTime();
    const nextIso = toIsoDate(next);
    setFocusIso(nextIso);
    if (moved) {
      setCursorIso(nextIso);
      setSlide((s) => ({ dir: step > 0 ? "f" : "b", tick: s.tick + 1 }));
    }
    setPop(0);
    setVerticalTransition(false);
    pendingFocus.current = nextIso;
  }

  // Foco que acompanha as setas: o dia novo pode ter acabado de ser
  // desenhado (troca de semana ou de mês).
  useLayoutEffect(() => {
    const iso = pendingFocus.current;
    if (!iso) return;
    pendingFocus.current = null;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-iso="${iso}"]`)
      ?.focus({ preventScroll: true });
  });

  useEffect(() => {
    if (!autoFocus) return;
    gridRef.current
      ?.querySelector<HTMLElement>('[tabindex="0"]')
      ?.focus({ preventScroll: true });
    // Só ao montar: o foco inicial entra no calendário uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cells = Array.from({ length: rows * 7 }, (_, index) => {
    const date = addDays(gridStart, index);
    const iso = toIsoDate(date);
    return {
      date,
      iso,
      inMonth: date.getMonth() === month,
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
      isDisabled: unavailable(iso),
      isClosed: closed.has(date.getDay()),
      isBusy: busy.has(iso),
      row: Math.floor(index / 7),
    };
  });
  const visibleRow = (row: number) => expanded || row === cursorRow;
  const tabbable =
    cells.find((c) => c.iso === focusIso && !c.isDisabled) ??
    cells.find((c) => c.isSelected && !c.isDisabled && visibleRow(c.row)) ??
    cells.find(
      (c) => c.iso === cursorIso && !c.isDisabled && visibleRow(c.row),
    ) ??
    cells.find((c) => visibleRow(c.row) && c.inMonth && !c.isDisabled) ??
    cells.find((c) => visibleRow(c.row) && !c.isDisabled);

  const height = expanded
    ? rows * DAY_HEIGHT + (rows - 1) * ROW_GAP
    : DAY_HEIGHT;
  const shift = expanded ? 0 : -cursorRow * (DAY_HEIGHT + ROW_GAP);
  const alternate = (tick: number) => (tick % 2 ? 1 : 2);

  return (
    <div className={clsx("date-picker", className)}>
      <div className="date-picker-head">
        <button
          aria-expanded={expanded}
          className="date-picker-month"
          onClick={toggle}
          title={expanded ? "Recolher para a semana" : "Abrir o mês inteiro"}
          type="button"
        >
          <span className="date-picker-month-name">
            {capitalize(MONTHS[month])}
          </span>
          <span className="date-picker-year">{year}</span>
          <Icon className="date-picker-chevron" name="chevron-down" />
        </button>
        <div className="date-picker-nav">
          <button
            aria-label={expanded ? "Mês anterior" : "Semana anterior"}
            className="date-picker-arrow"
            onClick={() => navigate(-1)}
            type="button"
          >
            <Icon name="chevron-left" />
          </button>
          <button
            aria-label={expanded ? "Próximo mês" : "Próxima semana"}
            className="date-picker-arrow"
            onClick={() => navigate(1)}
            type="button"
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      </div>
      <div aria-hidden="true" className="date-picker-weekdays">
        {WEEKDAY_HEADERS.map((header, column) => (
          <span
            data-closed={closed.has(COLUMN_WEEKDAY[column]) || undefined}
            key={header}
          >
            {header}
          </span>
        ))}
      </div>
      <div className="date-picker-viewport" style={{ height }}>
        <div
          className="date-picker-track"
          data-vertical={verticalTransition || undefined}
          style={{ transform: `translateY(${shift}px)` }}
        >
          <div
            aria-label={label}
            className="date-picker-grid"
            ref={gridRef}
            role="grid"
            style={{
              animation: slide.tick
                ? `date-picker-slide-${slide.dir}${alternate(slide.tick)} 300ms var(--at-ease-standard)`
                : undefined,
            }}
          >
            {Array.from({ length: rows }, (_, row) => (
              <div
                aria-hidden={visibleRow(row) ? undefined : true}
                className="date-picker-row"
                key={row}
                role="row"
              >
                {cells
                  .filter((cell) => cell.row === row)
                  .map((cell) => (
                    <div
                      aria-disabled={cell.isDisabled || undefined}
                      aria-label={dayLabel(cell)}
                      aria-selected={cell.isSelected}
                      className="date-picker-day"
                      data-busy={cell.isBusy || undefined}
                      data-iso={cell.iso}
                      data-muted={!cell.inMonth || cell.isClosed || undefined}
                      data-today={cell.isToday || undefined}
                      key={cell.iso}
                      onClick={() => pick(cell.date)}
                      onKeyDown={(event) => onDayKey(event, cell.date)}
                      role="gridcell"
                      style={{
                        animation:
                          cell.isSelected && pop
                            ? `date-picker-pop${alternate(pop)} 320ms var(--at-ease-standard)`
                            : undefined,
                      }}
                      tabIndex={cell === tabbable ? 0 : -1}
                    >
                      <span>{cell.date.getDate()}</span>
                      <span aria-hidden="true" className="date-picker-dot" />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="date-picker-foot">
        <div className="date-picker-chosen">
          <span className="date-picker-eyebrow">Escolhido</span>
          <span
            aria-live="polite"
            className="date-picker-chosen-label"
            style={{
              animation: labelTick
                ? `picker-reveal${alternate(labelTick)} 260ms var(--at-ease-standard)`
                : undefined,
            }}
          >
            {selected ? longDateLabel(selected) : "Nenhuma data escolhida"}
          </span>
        </div>
        <button
          className="picker-pill"
          disabled={unavailable(todayIso)}
          onClick={() => pick(today, true)}
          type="button"
        >
          Hoje
        </button>
      </div>
    </div>
  );
}

function dayLabel(cell: {
  date: Date;
  isBusy: boolean;
  isDisabled: boolean;
  isToday: boolean;
}): string {
  const { date } = cell;
  return (
    `${capitalize(WEEKDAYS[date.getDay()])}, ${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}` +
    (cell.isToday ? ", hoje" : "") +
    (cell.isBusy ? ", com atendimentos" : "") +
    (cell.isDisabled ? ", indisponível" : "")
  );
}
