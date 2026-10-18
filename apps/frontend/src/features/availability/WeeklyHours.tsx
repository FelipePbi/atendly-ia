import { type ReactNode, useEffect, useId, useRef } from "react";

import { TimeField } from "@/shared/ui/pickers/PickerFields";

/**
 * Peças do horário semanal compartilhadas pelo onboarding (etapas "Dias de
 * atendimento" e "Horários", quadros 2.5 a 2.7) e por Configurações >
 * Disponibilidade (D-187): as pílulas dos dias, o resumo, os cartões de hora
 * com a régua de 24 h e as linhas de "Horários por dia".
 */

export const weekdayLabels = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export const weekdayShortLabels = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
];

// A semana começa na segunda (vault §"Dias e horários"); os valores de
// `dayOfWeek` gravados continuam 0=domingo…6=sábado (Goal065/WU-03), só a
// ordem de exibição muda.
export const weekOrder = [1, 2, 3, 4, 5, 6, 0];

export type HoursInterval = { startTime: string; endTime: string };

export const END_BEFORE_START_MESSAGE =
  "O horário final deve ser depois do horário inicial.";

const MINUTES_PER_DAY = 1440;

export function timeToMinutes(time: string): number | null {
  const [hours, minutes] = time.split(":").map(Number);
  if (hours === undefined || minutes === undefined) return null;
  return Number.isFinite(hours) && Number.isFinite(minutes)
    ? hours * 60 + minutes
    : null;
}

/** "Segunda a sexta", "Só sábado", "Segunda, quarta e sexta". */
export function daysHead(days: number[]): string {
  const selected = weekOrder.filter((day) => days.includes(day));
  const count = selected.length;
  const first = selected[0];
  if (first === undefined) return "";
  const names = selected.map((day) => (weekdayLabels[day] ?? "").toLowerCase());
  const positions = selected.map((day) => weekOrder.indexOf(day));
  const consecutive = positions.every(
    (position, index) =>
      index === 0 || position === (positions[index - 1] ?? 0) + 1,
  );
  if (count === 1) return `Só ${names[0]}`;
  if (consecutive && count >= 3)
    return `${weekdayLabels[first]} a ${names[count - 1]}`;
  const list = `${names.slice(0, -1).join(", ")} e ${names[count - 1]}`;
  return list.charAt(0).toUpperCase() + list.slice(1);
}

export function daysCountText(days: number[]): string {
  const count = weekOrder.filter((day) => days.includes(day)).length;
  return `${count} ${count === 1 ? "dia" : "dias"} por semana`;
}

/** "09:00 – 18:00"; mais de um intervalo no dia vira "09:00 – 12:00, 14:00 –
 * 18:00". */
export function hoursRangeText(intervals: HoursInterval[]): string {
  return intervals
    .map((interval) => `${interval.startTime} – ${interval.endTime}`)
    .join(", ");
}

/** Quadro 2.5: sete alvos de 46×56, de segunda a domingo. `validationMessage`
 * liga o grupo à validação inline do onboarding (`applyInlineValidation`). */
export function DayPills({
  days,
  onToggle,
  validationMessage,
}: {
  days: number[];
  onToggle: (day: number, selected: boolean) => void;
  validationMessage?: string;
}) {
  return (
    <div
      aria-label="Dias de atendimento"
      className="day-pill-row"
      role="group"
      {...(validationMessage === undefined
        ? {}
        : {
            "data-group-error": validationMessage,
            "data-validation-group": "",
          })}
    >
      {weekOrder.map((day) => (
        <label
          className={`day-pill${days.includes(day) ? " is-selected" : ""}`}
          key={day}
        >
          <input
            className="sr-only"
            checked={days.includes(day)}
            type="checkbox"
            onChange={(event) => onToggle(day, event.target.checked)}
          />
          <span aria-hidden="true">{weekdayShortLabels[day]}</span>
          <span className="sr-only">{weekdayLabels[day]}</span>
        </label>
      ))}
    </div>
  );
}

/** A linha-resumo abaixo das pílulas: "Segunda a sexta · 5 dias por semana". */
export function DaysSummary({ days }: { days: number[] }) {
  if (days.length === 0) return null;
  return (
    <p aria-live="polite" className="days-summary">
      <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
        <rect height="14.5" rx="2.5" width="16" x="4" y="5.5" />
        <path d="M4 10h16M8 3.5v4M16 3.5v4" />
      </svg>
      <span>
        <strong>{daysHead(days)}</strong> · {daysCountText(days)}
      </span>
    </p>
  );
}

/** A régua de 0 a 24 h do horário-base (quadro 2.6), com um trecho cheio por
 * intervalo válido. */
export function HoursBar({ intervals }: { intervals: HoursInterval[] }) {
  return (
    <span aria-hidden="true" className="hours-bar">
      <span className="hours-bar-track">
        {intervals.map((interval, index) => {
          const start = timeToMinutes(interval.startTime);
          const end = timeToMinutes(interval.endTime);
          if (start === null || end === null || end <= start) return null;
          return (
            <span
              className="hours-bar-fill"
              key={index}
              style={{
                left: `${(start / MINUTES_PER_DAY) * 100}%`,
                width: `${((end - start) / MINUTES_PER_DAY) * 100}%`,
              }}
            />
          );
        })}
      </span>
      <span className="hours-bar-scale">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>24h</span>
      </span>
    </span>
  );
}

/** Início e fim de um intervalo, com o erro de "fim antes do início" no
 * campo final (QA O-33), via `setCustomValidity` lido por
 * `applyInlineValidation`. `hero` é o horário-base (quadro 2.6): dois
 * cartões com a hora em Literata e, com `showBar`, a régua de 0 a 24 h.
 * `invalid` marca o campo final quando quem chama mostra o erro por conta
 * própria (Configurações). */
export function TimeRangeFields({
  endLabel,
  endTime,
  hero = false,
  invalid = false,
  onChangeEnd,
  onChangeStart,
  showBar = true,
  startLabel,
  startTime,
}: {
  endLabel: string;
  endTime: string;
  hero?: boolean;
  invalid?: boolean;
  onChangeEnd: (value: string) => void;
  onChangeStart: (value: string) => void;
  showBar?: boolean;
  startLabel: string;
  startTime: string;
}) {
  const startId = useId();
  const endId = useId();
  const endRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    endRef.current?.setCustomValidity(
      startTime !== "" && endTime !== "" && endTime <= startTime
        ? END_BEFORE_START_MESSAGE
        : "",
    );
  }, [endTime, startTime]);
  const inputClass = hero ? "time-card-input" : "input time-input";
  const startInput = (
    <TimeField
      className={inputClass}
      data-server-field="availability.startTime"
      id={startId}
      required
      value={startTime}
      onValueChange={(value) => onChangeStart(value)}
    />
  );
  const endInput = (
    <TimeField
      aria-invalid={invalid || undefined}
      className={inputClass}
      data-server-field="availability.endTime"
      id={endId}
      ref={endRef}
      required
      value={endTime}
      onValueChange={(value) => onChangeEnd(value)}
    />
  );
  // Cada campo num `div.field`: a mensagem de erro entra logo depois do
  // campo (ou do cartão), dentro da mesma célula da grade.
  return (
    <div className="time-range">
      <div className={hero ? "time-cards" : "choice-grid"}>
        <div className="field">
          {hero ? (
            <label className="time-card" htmlFor={startId}>
              <span className="time-card-label">{startLabel}</span>
              {startInput}
            </label>
          ) : (
            <>
              <label className="label" htmlFor={startId}>
                {startLabel}
              </label>
              {startInput}
            </>
          )}
        </div>
        <div className={`field${invalid ? " field-error" : ""}`}>
          {hero ? (
            <label className="time-card" htmlFor={endId}>
              <span className="time-card-label">{endLabel}</span>
              {endInput}
            </label>
          ) : (
            <>
              <label className="label" htmlFor={endId}>
                {endLabel}
              </label>
              {endInput}
            </>
          )}
        </div>
      </div>
      {hero && showBar && startTime !== "" && endTime !== "" && (
        <HoursBar intervals={[{ endTime, startTime }]} />
      )}
    </div>
  );
}

export function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="icon hours-day-pencil"
      viewBox="0 0 24 24"
    >
      <path d="M4 20h4l10-10-4-4L4 16z" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      <rect height="11" rx="2.5" width="11" x="9" y="9" />
      <path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15" />
    </svg>
  );
}

/** Uma linha de "Horários por dia" (quadro 2.7). O dia sem atendimento diz
 * "Não atende" e não é controle; o dia marcado é um botão que abre, dentro do
 * cartão, os campos só daquele dia (`children`). Só o dia diferente do
 * horário-base ganha o tom e o lápis. */
export function HoursDayRow({
  children,
  day,
  different,
  expanded,
  fieldsId,
  intervals,
  off = false,
  onToggle,
}: {
  children?: ReactNode;
  day: number;
  different: boolean;
  expanded: boolean;
  fieldsId: string;
  intervals: HoursInterval[];
  off?: boolean;
  onToggle: () => void;
}) {
  const name = weekdayLabels[day] ?? "";
  if (off) {
    return (
      <div className="hours-day is-off">
        <div className="hours-day-row">
          <span className="hours-day-name">{name}</span>
          <span className="hours-day-quiet">Não atende</span>
        </div>
      </div>
    );
  }
  const range = hoursRangeText(intervals);
  return (
    <div className={`hours-day${different ? " is-different" : ""}`}>
      <button
        aria-controls={expanded ? fieldsId : undefined}
        aria-expanded={expanded}
        aria-label={`${name} ${range}`}
        className="hours-day-row"
        type="button"
        onClick={onToggle}
      >
        <span className="hours-day-name">{name}</span>
        <span className="hours-day-range">
          {range}
          {different && <PencilIcon />}
        </span>
      </button>
      {expanded && (
        <div className="hours-day-fields" id={fieldsId}>
          {children}
        </div>
      )}
    </div>
  );
}

/** "Copiar sábado para outros dias", centralizado abaixo do cartão. */
export function HoursCopyButton({
  day,
  onClick,
}: {
  day: number;
  onClick: () => void;
}) {
  return (
    <div className="hours-copy-row">
      <button className="hours-copy" type="button" onClick={onClick}>
        <CopyIcon />
        {`Copiar ${(weekdayLabels[day] ?? "").toLowerCase()} para outros dias`}
      </button>
    </div>
  );
}
