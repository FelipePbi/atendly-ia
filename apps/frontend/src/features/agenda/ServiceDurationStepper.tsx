"use client";

import { useState } from "react";

import type { Appointment, ServiceDurationInput } from "@/data";
import { swatchProps } from "@/shared/serviceColor";

import { durationLabel } from "./NewAppointmentFields";

/**
 * Duração de um serviço só para um atendimento (D-207): o mesmo passo de
 * 5 minutos do "Duração" do formulário de serviço, entre 5 minutos e 12
 * horas. O padrão do catálogo fica ao lado sempre que a duração difere dele.
 */
export const DURATION_STEP_MINUTES = 5;
export const DURATION_MIN_MINUTES = 5;
export const DURATION_MAX_MINUTES = 720;

export function clampDuration(minutes: number): number {
  return Math.min(
    DURATION_MAX_MINUTES,
    Math.max(DURATION_MIN_MINUTES, Math.round(minutes)),
  );
}

/** "padrão 40 min", só quando a duração deste atendimento difere do padrão. */
export function defaultDurationNote(
  minutes: number | null,
  defaultMinutes: number | null | undefined,
): string | null {
  if (minutes === null || defaultMinutes === null || defaultMinutes === undefined)
    return null;
  return minutes === defaultMinutes
    ? null
    : `padrão ${durationLabel(defaultMinutes)}`;
}

/**
 * A duração gravada de cada serviço do atendimento, para remarcar com o
 * tamanho combinado e não com o do catálogo (D-207). Serviço sem duração
 * própria conhecida fica de fora e usa o catálogo.
 */
export function appointmentServiceDurations(
  appointment: Appointment,
): ServiceDurationInput[] {
  return appointment.services.flatMap((service) =>
    service.durationMinutes === null
      ? []
      : [
          {
            durationMinutes: service.durationMinutes,
            serviceId: service.serviceId,
          },
        ],
  );
}

/** "14:00 – 15:00": o fim que a duração nova dá. */
export function rangeLabel(startTime: string, minutes: number): string {
  const [hours, mins] = startTime.split(":").map(Number);
  const total = ((hours ?? 0) * 60 + (mins ?? 0) + minutes) % 1440;
  const end = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return `${startTime} – ${end}`;
}

/**
 * Uma linha por serviço: nome, − valor +, e o padrão com "Usar padrão" quando
 * a duração foi ajustada. O valor também aceita digitação; fora da faixa, ao
 * sair do campo, volta ao último valor válido.
 */
export function ServiceDurationStepper({
  color,
  defaultMinutes,
  disabled = false,
  name,
  onChange,
  value,
}: {
  color?: Parameters<typeof swatchProps>[0];
  defaultMinutes: number | null;
  disabled?: boolean;
  name: string;
  onChange: (minutes: number) => void;
  value: number;
}) {
  const [draft, setDraft] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(value));
  }
  const note = defaultDurationNote(value, defaultMinutes);
  const inputLabel = `Duração de ${name} em minutos`;

  function commit(next: number) {
    const clamped = clampDuration(next);
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <div className="agenda-duration-row">
      <span className="agenda-duration-name">
        <span
          aria-hidden="true"
          className="agenda-appt-service-dot"
          {...swatchProps(color)}
        />
        <span className="agenda-duration-title">{name}</span>
        {note && <span className="agenda-duration-default">{note}</span>}
      </span>
      <span className="agenda-duration-controls">
        <span
          aria-label={`Duração de ${name}`}
          className="agenda-duration-control"
          role="group"
        >
          <button
            aria-label={`Diminuir duração de ${name}`}
            className="agenda-duration-step"
            disabled={disabled || value <= DURATION_MIN_MINUTES}
            onClick={() => commit(value - DURATION_STEP_MINUTES)}
            type="button"
          >
            −
          </button>
          <span className="agenda-duration-value">
            <input
              aria-label={inputLabel}
              className="agenda-duration-input"
              disabled={disabled}
              inputMode="numeric"
              max={DURATION_MAX_MINUTES}
              min={DURATION_MIN_MINUTES}
              onBlur={() => {
                const parsed = Number.parseInt(draft, 10);
                if (Number.isFinite(parsed)) commit(parsed);
                else setDraft(String(value));
              }}
              onChange={(event) => {
                const next = event.target.value;
                setDraft(next);
                const parsed = Number.parseInt(next, 10);
                if (
                  /^\d+$/u.test(next) &&
                  parsed >= DURATION_MIN_MINUTES &&
                  parsed <= DURATION_MAX_MINUTES &&
                  parsed !== value
                ) {
                  onChange(parsed);
                }
              }}
              step={DURATION_STEP_MINUTES}
              type="number"
              value={draft}
            />
            <span aria-hidden="true" className="agenda-duration-unit">
              min
            </span>
          </span>
          <button
            aria-label={`Aumentar duração de ${name}`}
            className="agenda-duration-step"
            disabled={disabled || value >= DURATION_MAX_MINUTES}
            onClick={() => commit(value + DURATION_STEP_MINUTES)}
            type="button"
          >
            +
          </button>
        </span>
        {note && defaultMinutes !== null && (
          <button
            className="agenda-duration-reset"
            disabled={disabled}
            onClick={() => {
              setDraft(String(defaultMinutes));
              onChange(defaultMinutes);
            }}
            type="button"
          >
            Usar padrão
            <span className="sr-only"> de {name}</span>
          </button>
        )}
      </span>
    </div>
  );
}
