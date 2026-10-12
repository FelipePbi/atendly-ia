"use client";

import clsx from "clsx";
import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Icon } from "@/shared/icons/Icon";

import {
  type Clock,
  clockMinutes,
  durationLabel,
  formatClock,
  pad2,
  parseClock,
} from "./dateTime";

/** Altura de cada linha do tambor (alvo de toque de 44 px). */
const ROW = 44;
/** Onde o tambor centraliza antes de qualquer escolha. */
const PLACEHOLDER: Clock = { hour: 9, minute: 0 };
/** Tempo sem rolagem que conta como "o tambor parou". */
const SETTLE_MS = 90;
/** Quanto o dedo (ou o mouse) anda antes de virar arrasto em vez de toque. */
const DRAG_SLOP = 4;
/** Embalo do arremesso: a velocidade final (px/ms) vezes este tempo. */
const FLING_MS = 120;
/** Parado por mais que isso antes de soltar, o arremesso não conta. */
const FLING_IDLE_MS = 80;

type Drag = {
  base: number;
  element: HTMLDivElement;
  lastT: number;
  lastY: number;
  moved: boolean;
  part: Part;
  pointerId: number;
  startY: number;
  velocity: number;
};

type Part = "hour" | "minute";

export type TimePickerProps = {
  /** `HH:mm`, ou "" quando nada foi escolhido. */
  value: string;
  onChange: (value: string) => void;
  /** Passo dos minutos no tambor. */
  minuteStep?: 5 | 10 | 15 | 30;
  /** `comercial` vai das 07 às 21; `24h`, de 00 a 23. */
  hourRange?: "comercial" | "24h";
  /** Duração em minutos: mostra "até 15:15 · 45 min". */
  duration?: number;
  /** Horário de atendimento: fora dele aparece um aviso âmbar, nunca um
   * bloqueio. */
  businessHours?: { start: string; end: string } | null;
  autoFocus?: boolean;
  label?: string;
  className?: string;
};

/**
 * Seletor de hora (Seletores-de-Data-e-Hora.dc.html, quadro 02): dois
 * tambores com imã de rolagem, horas e minutos, e o horário grande em Literata
 * confirmando a escolha.
 *
 * Um valor que não cabe no tambor (06:00 num tambor comercial, 14:20 num passo
 * de 15) entra na lista em vez de ser arredondado: abrir o seletor nunca muda
 * o que já estava salvo.
 */
export function TimePicker({
  autoFocus = false,
  businessHours,
  className,
  duration,
  hourRange = "comercial",
  label = "Horário",
  minuteStep = 5,
  onChange,
  value,
}: TimePickerProps) {
  const id = useId();
  const parsed = parseClock(value);
  const current = parsed ?? PLACEHOLDER;
  const hours = withValue(
    hourRange === "24h" ? range(0, 23, 1) : range(7, 21, 1),
    current.hour,
  );
  const minutes = withValue(range(0, 59, minuteStep), current.minute);
  const [tick, setTick] = useState(0);
  const [focused, setFocused] = useState(false);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const timers = useRef<Partial<Record<Part, number>>>({});
  const mounted = useRef(false);
  // Os tambores param em momentos diferentes: o segundo a parar precisa ver
  // o que o primeiro acabou de escolher, mesmo antes de o pai renderizar.
  const latest = useRef<{ clock: Clock; chosen: boolean }>({
    clock: current,
    chosen: parsed !== null,
  });
  const onChangeRef = useRef(onChange);
  const listsRef = useRef({ hours, minutes });
  const drag = useRef<Drag | null>(null);
  // O clique que o navegador manda depois de um arrasto não é uma escolha.
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    latest.current = { clock: current, chosen: parsed !== null };
    onChangeRef.current = onChange;
    listsRef.current = { hours, minutes };
  });

  // Centraliza cada tambor no valor. Na primeira pintura, sem animação; nas
  // seguintes, deslizando. Um tambor que a pessoa está rolando não é tocado.
  useLayoutEffect(() => {
    const smooth = mounted.current;
    mounted.current = true;
    const dragging = drag.current?.moved ? drag.current.part : null;
    align(
      hourRef.current,
      hours.indexOf(current.hour),
      smooth,
      timers.current.hour,
      dragging === "hour",
    );
    align(
      minuteRef.current,
      minutes.indexOf(current.minute),
      smooth,
      timers.current.minute,
      dragging === "minute",
    );
  });

  useEffect(() => {
    if (autoFocus) hourRef.current?.focus({ preventScroll: true });
    const pending = timers.current;
    return () => {
      window.clearTimeout(pending.hour);
      window.clearTimeout(pending.minute);
    };
    // Só ao montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(part: Part, next: number, force = false) {
    const { clock } = latest.current;
    // Rolagem que para no mesmo valor não escolhe nada; toque e teclado
    // escolhem, inclusive o valor que já estava centralizado.
    if (!force && clock[part] === next) return;
    const updated = { ...clock, [part]: next };
    latest.current = { clock: updated, chosen: true };
    setTick((n) => n + 1);
    onChangeRef.current(formatClock(updated));
  }

  function handleScroll(part: Part, element: HTMLDivElement) {
    // Durante o arrasto quem decide é o soltar, não a pausa da rolagem.
    if (drag.current?.moved && drag.current.part === part) return;
    window.clearTimeout(timers.current[part]);
    timers.current[part] = window.setTimeout(() => {
      timers.current[part] = undefined;
      const list = listsRef.current[part === "hour" ? "hours" : "minutes"];
      const index = clamp(
        Math.round(element.scrollTop / ROW),
        0,
        list.length - 1,
      );
      commit(part, list[index]);
    }, SETTLE_MS);
  }

  // Arrastar para cima e para baixo, com o dedo ou com o mouse. O tambor é
  // `touch-action: none`: o gesto é todo daqui, igual nos dois, e o soltar
  // leva em conta o embalo e para numa linha.
  function handlePointerDown(part: Part, event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    suppressClick.current = false;
    window.clearTimeout(timers.current[part]);
    timers.current[part] = undefined;
    const list = listsRef.current[part === "hour" ? "hours" : "minutes"];
    drag.current = {
      base: Math.max(0, list.indexOf(latest.current.clock[part])) * ROW,
      element: event.currentTarget,
      lastT: performance.now(),
      lastY: event.clientY,
      moved: false,
      part,
      pointerId: event.pointerId,
      startY: event.clientY,
      velocity: 0,
    };
  }

  function handlePointerMove(part: Part, event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.part !== part || active.pointerId !== event.pointerId)
      return;
    const dy = event.clientY - active.startY;
    if (!active.moved) {
      if (Math.abs(dy) < DRAG_SLOP) return;
      active.moved = true;
      // Só agora captura: um toque parado continua sendo clique no número.
      active.element.setPointerCapture?.(event.pointerId);
      active.element.dataset.dragging = "true";
    }
    event.preventDefault();
    const dt = Math.max(1, performance.now() - active.lastT);
    active.velocity =
      0.8 * ((event.clientY - active.lastY) / dt) + 0.2 * active.velocity;
    active.lastY = event.clientY;
    active.lastT = performance.now();
    const list = listsRef.current[part === "hour" ? "hours" : "minutes"];
    active.element.scrollTop = clamp(
      active.base - dy,
      0,
      (list.length - 1) * ROW,
    );
  }

  function handlePointerEnd(part: Part, event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.part !== part || active.pointerId !== event.pointerId)
      return;
    drag.current = null;
    if (!active.moved) return;
    delete active.element.dataset.dragging;
    if (active.element.hasPointerCapture?.(event.pointerId))
      active.element.releasePointerCapture(event.pointerId);
    suppressClick.current = true;
    const list = listsRef.current[part === "hour" ? "hours" : "minutes"];
    const idle = performance.now() - active.lastT > FLING_IDLE_MS;
    const fling =
      event.type === "pointercancel" || idle ? 0 : active.velocity * FLING_MS;
    const dy = event.clientY - active.startY;
    const index = clamp(
      Math.round((active.base - dy - fling) / ROW),
      0,
      list.length - 1,
    );
    scrollToIndex(active.element, index);
    commit(part, list[index]);
  }

  function chooseFromTap(part: Part, next: number) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    choose(part, next);
  }

  function choose(part: Part, next: number) {
    commit(part, next, true);
  }

  function handleKey(part: Part, event: KeyboardEvent<HTMLDivElement>) {
    const list = listsRef.current[part === "hour" ? "hours" : "minutes"];
    let index = list.indexOf(latest.current.clock[part]);
    const step = (
      { ArrowUp: -1, ArrowDown: 1, PageUp: -4, PageDown: 4 } as Record<
        string,
        number
      >
    )[event.key];
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = list.length - 1;
    else if (step) index += step;
    else if (event.key === "Enter" || event.key === " ") {
      // Enter confirma o valor centralizado, mesmo antes de qualquer giro.
      event.preventDefault();
      choose(part, latest.current.clock[part]);
      return;
    } else return;
    event.preventDefault();
    choose(part, list[clamp(index, 0, list.length - 1)]);
  }

  function now() {
    const date = new Date();
    let minute = Math.ceil(date.getMinutes() / minuteStep) * minuteStep;
    let hour = date.getHours();
    if (minute >= 60) {
      minute = 0;
      hour = (hour + 1) % 24;
    }
    const base = hourRange === "24h" ? range(0, 23, 1) : range(7, 21, 1);
    const updated = { hour: nearest(base, hour), minute };
    latest.current = { clock: updated, chosen: true };
    setTick((n) => n + 1);
    onChange(formatClock(updated));
  }

  const span = Math.max(0, Math.round(duration ?? 0));
  const end = parsed
    ? formatClock(fromMinutes(clockMinutes(parsed) + span))
    : null;
  const open = parseClock(businessHours?.start);
  const close = parseClock(businessHours?.end);
  const hoursLabel =
    open && close ? `${formatClock(open)}–${formatClock(close)}` : null;
  const outOfHours =
    parsed && open && close
      ? clockMinutes(parsed) < clockMinutes(open) ||
        clockMinutes(parsed) >= clockMinutes(close)
      : false;

  return (
    <div
      aria-label={label}
      className={clsx("time-picker", className)}
      role="group"
    >
      <div className="time-picker-summary">
        <div className="time-picker-summary-head">
          <div className="time-picker-reading">
            <span className="picker-eyebrow">{label}</span>
            <div className="time-picker-display-row">
              <span
                aria-live="polite"
                className="time-picker-display"
                style={{
                  animation: tick
                    ? `time-picker-tick${tick % 2 ? 1 : 2} 220ms var(--at-ease-standard)`
                    : undefined,
                }}
              >
                {parsed ? formatClock(parsed) : "--:--"}
              </span>
              {end && span > 0 && (
                <span className="time-picker-end">
                  até {end} · {durationLabel(span)}
                </span>
              )}
            </div>
          </div>
          <button className="picker-pill" onClick={now} type="button">
            Agora
          </button>
        </div>
        {hoursLabel && parsed && outOfHours && (
          <p className="time-picker-warning">
            <Icon name="alert" />
            <span>
              Fora do seu horário de atendimento ({hoursLabel}). Dá para marcar
              mesmo assim.
            </span>
          </p>
        )}
        {hoursLabel && parsed && !outOfHours && (
          <p className="time-picker-hint">
            Dentro do seu horário de atendimento · {hoursLabel}
          </p>
        )}
      </div>
      <div className="time-picker-drums" data-focused={focused || undefined}>
        <div aria-hidden="true" className="time-picker-band" />
        <Drum
          activeId={`${id}-hour-${current.hour}`}
          id={`${id}-hour`}
          label="Horas"
          list={hours}
          onBlur={() => setFocused(false)}
          onChoose={(next) => chooseFromTap("hour", next)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => handleKey("hour", event)}
          onPointerCancel={(event) => handlePointerEnd("hour", event)}
          onPointerDown={(event) => handlePointerDown("hour", event)}
          onPointerMove={(event) => handlePointerMove("hour", event)}
          onPointerUp={(event) => handlePointerEnd("hour", event)}
          onScroll={(event) => handleScroll("hour", event.currentTarget)}
          part="hour"
          refObject={hourRef}
          selected={current.hour}
        />
        <span aria-hidden="true" className="time-picker-colon">
          :
        </span>
        <Drum
          activeId={`${id}-minute-${current.minute}`}
          id={`${id}-minute`}
          label="Minutos"
          list={minutes}
          onBlur={() => setFocused(false)}
          onChoose={(next) => chooseFromTap("minute", next)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => handleKey("minute", event)}
          onPointerCancel={(event) => handlePointerEnd("minute", event)}
          onPointerDown={(event) => handlePointerDown("minute", event)}
          onPointerMove={(event) => handlePointerMove("minute", event)}
          onPointerUp={(event) => handlePointerEnd("minute", event)}
          onScroll={(event) => handleScroll("minute", event.currentTarget)}
          part="minute"
          refObject={minuteRef}
          selected={current.minute}
        />
      </div>
    </div>
  );
}

function Drum({
  activeId,
  id,
  label,
  list,
  onBlur,
  onChoose,
  onFocus,
  onKeyDown,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onScroll,
  part,
  refObject,
  selected,
}: {
  activeId: string;
  id: string;
  label: string;
  list: number[];
  onBlur: () => void;
  onChoose: (value: number) => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onScroll: (event: { currentTarget: HTMLDivElement }) => void;
  part: Part;
  refObject: RefObject<HTMLDivElement | null>;
  selected: number;
}) {
  const selectedIndex = list.indexOf(selected);
  return (
    <div
      aria-activedescendant={activeId}
      aria-label={label}
      className="time-picker-drum"
      data-drum={part}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onScroll={onScroll}
      ref={refObject}
      role="listbox"
      tabIndex={0}
    >
      <div aria-hidden="true" className="time-picker-spacer" />
      {list.map((item, index) => {
        const distance = Math.abs(index - selectedIndex);
        return (
          <div
            aria-selected={item === selected}
            className="time-picker-option"
            data-distance={Math.min(distance, 2)}
            id={`${id}-${item}`}
            key={item}
            onClick={() => onChoose(item)}
            role="option"
          >
            {pad2(item)}
          </div>
        );
      })}
      <div aria-hidden="true" className="time-picker-spacer" />
    </div>
  );
}

function align(
  element: HTMLDivElement | null,
  index: number,
  smooth: boolean,
  pendingTimer: number | undefined,
  dragging: boolean,
) {
  if (!element || index < 0 || pendingTimer !== undefined || dragging) return;
  const top = index * ROW;
  if (Math.abs(element.scrollTop - top) < 1) return;
  if (smooth && typeof element.scrollTo === "function") {
    element.scrollTo({ top, behavior: "smooth" });
  } else {
    element.scrollTop = top;
  }
}

function range(from: number, to: number, step: number): number[] {
  const list: number[] = [];
  for (let value = from; value <= to; value += step) list.push(value);
  return list;
}

function withValue(list: number[], value: number): number[] {
  return list.includes(value) ? list : [...list, value].sort((a, b) => a - b);
}

function nearest(list: number[], value: number): number {
  return list.reduce(
    (best, item) =>
      Math.abs(item - value) < Math.abs(best - value) ? item : best,
    list[0],
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function fromMinutes(total: number): Clock {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return { hour: Math.floor(wrapped / 60), minute: wrapped % 60 };
}

function scrollToIndex(element: HTMLDivElement, index: number) {
  const top = index * ROW;
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ top, behavior: "smooth" });
  } else {
    element.scrollTop = top;
  }
}
