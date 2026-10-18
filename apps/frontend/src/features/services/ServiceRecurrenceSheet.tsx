"use client";

import { useState } from "react";

import { Dialog } from "@/shared/ui/Dialog";

type RecurrenceUnit = "days" | "weeks" | "months";

/** Dias por unidade: o contrato só guarda `recurrenceIntervalDays` (D-202). */
const UNIT_DAYS: Record<RecurrenceUnit, number> = {
  days: 1,
  months: 30,
  weeks: 7,
};

const UNIT_MAX: Record<RecurrenceUnit, number> = {
  days: 365,
  months: 12,
  weeks: 52,
};

const units: Array<{ label: string; value: RecurrenceUnit }> = [
  { label: "dias", value: "days" },
  { label: "semanas", value: "weeks" },
  { label: "meses", value: "months" },
];

/** O que o quadro S6 mostra quando o serviço ainda não tem recorrência. */
const START = { count: 2, unit: "weeks" as RecurrenceUnit };

function splitDays(days: number | null): {
  count: number;
  unit: RecurrenceUnit;
} {
  if (days === null || days <= 0) return START;
  if (days % 30 === 0) return { count: days / 30, unit: "months" };
  if (days % 7 === 0) return { count: days / 7, unit: "weeks" };
  return { count: days, unit: "days" };
}

const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});

const checkMark = (
  <svg
    aria-hidden="true"
    fill="none"
    height="14"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="3"
    viewBox="0 0 24 24"
    width="14"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/**
 * Recorrência do serviço (quadro "Serviço · recorrência", S6): "Este serviço
 * costuma ser recorrente", "A cada" com − e +, dias/semanas/meses e o exemplo
 * "as próximas 3". Folha no celular, modal centralizado do tablet em diante.
 * "Salvar" só devolve o intervalo ao formulário; quem grava é o formulário.
 */
export function ServiceRecurrenceSheet({
  initialDays,
  onClose,
  onSave,
}: {
  initialDays: number | null;
  onClose: () => void;
  onSave: (days: number | null) => void;
}) {
  const start = splitDays(initialDays);
  const [enabled, setEnabled] = useState(initialDays !== null);
  const [count, setCount] = useState(start.count);
  const [unit, setUnit] = useState<RecurrenceUnit>(start.unit);
  const max = UNIT_MAX[unit];
  const days = count * UNIT_DAYS[unit];
  const today = new Date();
  const dates = [1, 2, 3].map((step) => {
    const date = new Date(today);
    date.setDate(date.getDate() + days * step);
    return shortDate.format(date);
  });

  function changeUnit(next: RecurrenceUnit) {
    setUnit(next);
    setCount((current) => Math.min(current, UNIT_MAX[next]));
  }

  return (
    <Dialog onClose={onClose} open title="Recorrência" variant="sheet">
      <div
        className="service-sheet service-recurrence"
        // O formulário atrás marca "alterações não salvas" a cada mudança; o
        // rascunho da folha só conta quando volta por "Salvar".
        onChange={(event) => event.stopPropagation()}
      >
        <label className="service-recurrence-check">
          <input
            aria-describedby="service-recurrence-hint"
            checked={enabled}
            type="checkbox"
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span aria-hidden="true" className="service-sheet-box">
            {enabled && checkMark}
          </span>
          <span className="service-recurrence-copy">
            <span className="service-sheet-title">
              Este serviço costuma ser recorrente
            </span>
            <span className="service-sheet-hint" id="service-recurrence-hint">
              Uma referência para a IA — não uma obrigação para a cliente.
            </span>
          </span>
        </label>
        {enabled && (
          <>
            <div className="service-recurrence-every">
              <label
                className="service-recurrence-label"
                htmlFor="service-recurrence-count"
              >
                A cada
              </label>
              <span className="service-recurrence-stepper">
                <button
                  aria-label="Diminuir intervalo da recorrência"
                  disabled={count <= 1}
                  type="button"
                  onClick={() => setCount((value) => Math.max(1, value - 1))}
                >
                  −
                </button>
                <input
                  id="service-recurrence-count"
                  inputMode="numeric"
                  max={max}
                  min={1}
                  type="number"
                  value={count}
                  onChange={(event) => {
                    const next = Math.round(Number(event.target.value));
                    if (Number.isFinite(next) && next >= 1)
                      setCount(Math.min(next, max));
                  }}
                />
                <button
                  aria-label="Aumentar intervalo da recorrência"
                  className="is-increase"
                  disabled={count >= max}
                  type="button"
                  onClick={() => setCount((value) => Math.min(max, value + 1))}
                >
                  +
                </button>
              </span>
              <div
                aria-label="Unidade da recorrência"
                className="service-recurrence-units"
                role="radiogroup"
              >
                {units.map((option) => (
                  <label key={option.value}>
                    <input
                      checked={unit === option.value}
                      name="service-recurrence-unit"
                      type="radio"
                      value={option.value}
                      onChange={() => changeUnit(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="service-recurrence-example">
              <span className="service-recurrence-example-title">
                Se a cliente pedir “as próximas 3”
              </span>
              <ol className="service-recurrence-dates">
                {dates.map((date, index) => (
                  <li key={index}>
                    {index > 0 && <span aria-hidden="true" />}
                    <span className="service-recurrence-date">{date}</span>
                  </li>
                ))}
              </ol>
              <span className="service-recurrence-example-note">
                A IA busca horários perto dessas datas, mostra as três opções e
                só marca depois que a cliente aceitar.
              </span>
            </div>
          </>
        )}
        <button
          className="btn btn-primary service-sheet-cta"
          type="button"
          onClick={() => onSave(enabled ? days : null)}
        >
          Salvar
        </button>
      </div>
    </Dialog>
  );
}
