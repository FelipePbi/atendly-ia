"use client";

import clsx from "clsx";
import {
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type MouseEvent,
  type Ref,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Icon } from "@/shared/icons/Icon";

import { DatePicker, type DatePickerProps } from "./DatePicker";
import {
  formatClock,
  pad2,
  parseClock,
  parseIsoDate,
  toIsoDate,
} from "./dateTime";
import { PickerPopover } from "./PickerPopover";
import { TimePicker, type TimePickerProps } from "./TimePicker";

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "inputMode" | "max" | "min" | "onChange" | "type" | "value"
>;

type FieldBase = InputProps & {
  /** Mesmo formato do campo nativo: `YYYY-MM-DD` ou `HH:mm`, "" quando vazio. */
  value: string;
  onValueChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
  /** Classe do contêiner (o `className` vai para o `<input>`). */
  wrapperClassName?: string;
};

export type DateFieldProps = FieldBase &
  Pick<DatePickerProps, "busyDays" | "closedWeekdays" | "max" | "min">;

export type TimeFieldProps = FieldBase &
  Pick<
    TimePickerProps,
    "businessHours" | "duration" | "hourRange" | "minuteStep"
  >;

/**
 * Campo de data: substitui `<input type="date">`. No computador dá para
 * digitar `dd/mm/aaaa`; o botão do calendário (ou o toque, em tela de toque)
 * abre o seletor de data num painel.
 */
export function DateField({
  busyDays,
  closedWeekdays,
  max,
  min,
  ...props
}: DateFieldProps) {
  return (
    <PickerField
      {...props}
      date={{ busyDays, closedWeekdays, max, min }}
      kind="date"
    />
  );
}

/**
 * Campo de hora: substitui `<input type="time">`. No computador dá para
 * digitar `hh:mm`; o botão do relógio (ou o toque, em tela de toque) abre o
 * tambor de horas e minutos num painel.
 */
export function TimeField({
  businessHours,
  duration,
  hourRange = "24h",
  minuteStep,
  ...props
}: TimeFieldProps) {
  return (
    <PickerField
      {...props}
      kind="time"
      time={{ businessHours, duration, hourRange, minuteStep }}
    />
  );
}

const COARSE_POINTER = "(pointer: coarse)";

function subscribeCoarse(onChange: () => void) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const query = window.matchMedia(COARSE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isCoarsePointer() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(COARSE_POINTER).matches
  );
}

function PickerField({
  className,
  date,
  disabled,
  kind,
  onBlur,
  onClick,
  onValueChange,
  placeholder,
  readOnly,
  ref,
  time,
  value,
  wrapperClassName,
  ...inputProps
}: FieldBase & {
  kind: "date" | "time";
  date?: Pick<DatePickerProps, "busyDays" | "closedWeekdays" | "max" | "min">;
  time?: Pick<
    TimePickerProps,
    "businessHours" | "duration" | "hourRange" | "minuteStep"
  >;
}) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  // Texto em edição; `null` = mostra o valor formatado.
  const [draft, setDraft] = useState<string | null>(null);
  // Em tela de toque o teclado não abre: tocar no campo abre o seletor.
  const coarse = useSyncExternalStore(
    subscribeCoarse,
    isCoarsePointer,
    () => false,
  );

  function setInputRef(element: HTMLInputElement | null) {
    inputRef.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  }

  function choose(next: string, close: boolean) {
    setDraft(null);
    if (next !== value) onValueChange(next);
    if (close) closePicker(true);
  }

  function closePicker(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) inputRef.current?.focus({ preventScroll: true });
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const text =
      kind === "date"
        ? maskDate(event.currentTarget.value)
        : maskTime(event.currentTarget.value);
    setDraft(text);
    const parsed =
      text === ""
        ? ""
        : kind === "date"
          ? parseTypedDate(text)
          : parseTypedTime(text);
    // Como no campo nativo: incompleto vale "", completo vale o valor.
    const next = parsed ?? "";
    if (next !== value) onValueChange(next);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setDraft(null);
    onBlur?.(event);
  }

  function handleClick(event: MouseEvent<HTMLInputElement>) {
    onClick?.(event);
    if (coarse && !disabled && !readOnly) setOpen(true);
  }

  const label = kind === "date" ? "Escolher data" : "Escolher horário";
  return (
    <span className={clsx("picker-field", wrapperClassName)} ref={wrapperRef}>
      <input
        {...inputProps}
        autoComplete="off"
        className={className}
        disabled={disabled}
        inputMode={coarse ? "none" : "numeric"}
        onBlur={handleBlur}
        onChange={handleChange}
        onClick={handleClick}
        placeholder={placeholder ?? (kind === "date" ? "dd/mm/aaaa" : "--:--")}
        readOnly={readOnly || coarse}
        ref={setInputRef}
        type="text"
        value={draft ?? (kind === "date" ? formatDate(value) : value)}
      />
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="picker-field-toggle"
        disabled={disabled || readOnly}
        onClick={() => setOpen((current) => !current)}
        tabIndex={coarse ? -1 : 0}
        type="button"
      >
        <Icon name={kind === "date" ? "calendar" : "clock"} />
      </button>
      {open && (
        <PickerPopover
          anchorRef={wrapperRef}
          label={label}
          onClose={(reason) => closePicker(reason === "escape")}
          preferredWidth={kind === "date" ? 360 : 340}
        >
          {kind === "date" ? (
            <DatePicker
              {...date}
              autoFocus
              collapseOnPick={false}
              onChange={(next) => choose(next, true)}
              startExpanded
              value={value}
            />
          ) : (
            <>
              <TimePicker
                {...time}
                autoFocus
                onChange={(next) => choose(next, false)}
                value={value}
              />
              <div className="picker-popover-foot">
                <button
                  className="picker-pill is-primary"
                  onClick={() => closePicker(true)}
                  type="button"
                >
                  Pronto
                </button>
              </div>
            </>
          )}
        </PickerPopover>
      )}
    </span>
  );
}

function formatDate(value: string): string {
  const date = parseIsoDate(value);
  return date
    ? `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`
    : "";
}

/** "20102026" → "20/10/2026", aceitando a barra digitada ou colada. */
function maskDate(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseTypedDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = parseIsoDate(iso);
  return date ? toIsoDate(date) : null;
}

function parseTypedTime(text: string): string | null {
  const clock = parseClock(text);
  return clock && text.length === 5 ? formatClock(clock) : null;
}

/** "1430" → "14:30"; "9:" vira "09:". Valores colados no formato ISO também. */
function maskTime(text: string): string {
  const single = /^(\d):(\d{0,2})/.exec(text);
  const digits = (
    single ? `0${single[1]}${single[2]}` : text.replace(/\D/g, "")
  ).slice(0, 4);
  return digits.length <= 2
    ? digits
    : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
