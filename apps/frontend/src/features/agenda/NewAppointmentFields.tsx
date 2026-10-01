"use client";

import { useId } from "react";

import { type Customer, type CustomerList } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { displayPhone } from "@/shared/phone";

import {
  addDays,
  type AgendaEntry,
  describeEntry,
  formatDate,
  isoDate,
  minutesToTime,
  parseDate,
  timeToMinutes,
} from "./occupancy";

const SUGGESTED_CUSTOMERS = 5;
const DATE_STRIP_DAYS = 6;

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

export function weekdayShort(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(parseDate(date))
    .replace(".", "")
    .toLowerCase();
}

export function personLabel(customer: Customer): string {
  return (
    customer.name ??
    (customer.phone ? displayPhone(customer.phone, "") : null) ??
    "Cliente sem identificação"
  );
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function CustomerField({
  customers,
  name,
  onChoose,
  onName,
  onPhone,
  onSwap,
  phone,
  selected,
}: {
  customers: CustomerList | null;
  name: string;
  onChoose: (customer: Customer) => void;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onSwap: () => void;
  phone: string;
  selected: Customer | undefined;
}) {
  const labelId = useId();
  const query = name.trim();
  const registered =
    customers && !customers.managedExternally ? customers.items : [];
  const needle = normalize(query);
  const matches = (
    needle
      ? registered.filter((item) =>
          normalize(`${item.name ?? ""} ${item.phone ?? ""}`).includes(needle),
        )
      : registered
  ).slice(0, SUGGESTED_CUSTOMERS);
  const exact = registered.some((item) => normalize(item.name ?? "") === needle);

  return (
    <div aria-labelledby={labelId} className="agenda-new-block" role="group">
      <span className="label" id={labelId}>
        Cliente
      </span>
      {selected ? (
        <div className="agenda-new-customer">
          <span aria-hidden="true" className="agenda-new-avatar">
            {initials(personLabel(selected))}
          </span>
          <strong>{personLabel(selected)}</strong>
          <button className="btn btn-tertiary" onClick={onSwap} type="button">
            Trocar
          </button>
        </div>
      ) : (
        <>
          <input
            aria-label="Nome do cliente"
            autoComplete="off"
            className="input"
            onChange={(event) => onName(event.target.value)}
            placeholder={
              registered.length > 0
                ? "Buscar ou cadastrar cliente"
                : "Nome do cliente"
            }
            value={name}
          />
          {matches.length > 0 && (
            <ul className="agenda-new-options">
              {matches.map((item) => (
                <li key={item.id}>
                  <button
                    className="agenda-new-option"
                    onClick={() => onChoose(item)}
                    type="button"
                  >
                    <span aria-hidden="true" className="agenda-new-avatar">
                      {initials(personLabel(item))}
                    </span>
                    <span>{personLabel(item)}</span>
                    {item.name && item.phone && (
                      <small>{displayPhone(item.phone, "")}</small>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query && !exact && (
            <p className="agenda-new-hint">
              <Icon name="plus" /> Cadastrar “{query}” como novo cliente ao
              criar.
            </p>
          )}
          {query && (
            <label className="field">
              <span className="label">Telefone (opcional)</span>
              <input
                className="input"
                inputMode="tel"
                onChange={(event) => onPhone(event.target.value)}
                value={phone}
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}

export function DateStrip({
  date,
  onChange,
  onTogglePicker,
  pickerOpen,
}: {
  date: string;
  onChange: (value: string) => void;
  onTogglePicker: () => void;
  pickerOpen: boolean;
}) {
  const today = new Date();
  const days = Array.from({ length: DATE_STRIP_DAYS }, (_, index) =>
    isoDate(addDays(today, index)),
  );
  const custom = !days.includes(date);
  return (
    <div className="agenda-new-block">
      <span className="label" id="agenda-new-date-label">
        Data
      </span>
      <div
        aria-labelledby="agenda-new-date-label"
        className="agenda-new-days"
        role="group"
      >
        {days.map((day) => {
          const parsed = parseDate(day);
          return (
            <button
              aria-label={new Intl.DateTimeFormat("pt-BR", {
                day: "numeric",
                month: "long",
                weekday: "long",
              }).format(parsed)}
              aria-pressed={date === day}
              className="agenda-new-day"
              key={day}
              onClick={() => onChange(day)}
              type="button"
            >
              <span>{weekdayShort(day)}</span>
              <strong>{parsed.getDate()}</strong>
            </button>
          );
        })}
        <button
          aria-expanded={pickerOpen || custom}
          aria-label="Escolher outra data"
          className="agenda-new-day"
          onClick={onTogglePicker}
          type="button"
        >
          <span>…</span>
          <Icon name="calendar" />
        </button>
      </div>
      {(pickerOpen || custom) && (
        <label className="field">
          <span className="label">Outra data</span>
          <input
            className="input"
            min={isoDate(today)}
            onChange={(event) => {
              if (event.target.value) onChange(event.target.value);
            }}
            required
            type="date"
            value={date}
          />
        </label>
      )}
    </div>
  );
}

export function DayList({
  date,
  entries,
  loading,
  preview,
}: {
  date: string;
  entries: AgendaEntry[] | null;
  loading: boolean;
  preview: { label: string; minutes: number; startTime: string } | null;
}) {
  const rows = (entries ?? [])
    .filter((entry) => entry.kind !== "buffer")
    .map((entry) => ({
      end: entry.endMinutes,
      key: entry.key,
      presentation: describeEntry(entry),
      start: entry.startMinutes,
    }));
  const previewStart = preview ? timeToMinutes(preview.startTime) : null;
  return (
    <aside aria-label={`Dia ${formatDate(date)}`} className="agenda-new-day-panel">
      <h2>{formatDate(date)}</h2>
      {loading ? (
        <p className="muted">Consultando a agenda do dia…</p>
      ) : entries === null ? (
        <p className="muted">Não foi possível listar o que já está marcado.</p>
      ) : rows.length === 0 && !preview ? (
        <p className="muted">Nada marcado neste dia.</p>
      ) : (
        <ol className="agenda-new-day-list">
          {[
            ...rows.map((row) => ({ ...row, isNew: false })),
            ...(preview && previewStart !== null
              ? [
                  {
                    end: previewStart + preview.minutes,
                    isNew: true,
                    key: "new",
                    presentation: {
                      detail: null as string | null,
                      title: preview.label,
                    },
                    start: previewStart,
                  },
                ]
              : []),
          ]
            .sort((a, b) => a.start - b.start)
            .map((row) => (
              <li className={row.isNew ? "is-new" : undefined} key={row.key}>
                <span className="agenda-new-day-time">
                  {minutesToTime(row.start)}–{minutesToTime(row.end)}
                </span>
                <strong>{row.presentation.title}</strong>
                {row.presentation.detail && (
                  <span className="muted">{row.presentation.detail}</span>
                )}
              </li>
            ))}
        </ol>
      )}
    </aside>
  );
}
