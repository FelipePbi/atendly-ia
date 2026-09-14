"use client";

import { type AvailabilitySlot } from "@/data";

import {
  HOLD_EXPIRED_NOTICE,
  HOLD_UNSUPPORTED_NOTICE,
  type HoldSession,
} from "./holdSession";
import { isoDate } from "./occupancy";

/**
 * Escolha de data e horário com o estado da reserva sempre visível.
 *
 * Dois caminhos, de propósito: os horários que a disponibilidade ofereceu e um
 * horário digitado fora da grade. O segundo existe porque sobrepor é uma
 * decisão humana legítima do Goal008 — sem ele, a profissional nunca
 * conseguiria pedir um horário ocupado, e a decisão de sobreposição seria
 * inalcançável na tela.
 */
export function SlotPicker({
  date,
  disabled = false,
  hold,
  legend,
  manualTime,
  minDate,
  onDateChange,
  onManualTimeChange,
  onSelect,
  selected,
  slots,
  slotsLoading,
  timezone,
}: {
  date: string;
  disabled?: boolean;
  hold: HoldSession;
  legend: string;
  manualTime: string;
  minDate?: string;
  onDateChange: (value: string) => void;
  onManualTimeChange: (value: string) => void;
  onSelect: (startTime: string) => void;
  selected: string;
  slots: AvailabilitySlot[];
  slotsLoading: boolean;
  timezone?: string | null;
}) {
  return (
    <>
      <div className="agenda-form-grid">
        <label className="field">
          <span>Data</span>
          <input
            min={minDate ?? isoDate(new Date())}
            required
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </label>
      </div>
      <fieldset disabled={disabled || slotsLoading}>
        <legend>{legend}</legend>
        {slotsLoading ? (
          <p>Consultando disponibilidade…</p>
        ) : slots.length === 0 ? (
          <p className="muted">Nenhum horário disponível para esta seleção.</p>
        ) : (
          <div className="agenda-time-options">
            {slots.map((slot) => (
              <label
                className="agenda-time-option"
                key={`${slot.date}-${slot.startTime}`}
              >
                <input
                  checked={selected === slot.startTime}
                  name="start-time"
                  onChange={() => onSelect(slot.startTime)}
                  type="radio"
                />
                <span>{slot.startTime}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="agenda-manual-time">
        <label className="field">
          <span>Outro horário, fora dos oferecidos</span>
          <input
            disabled={disabled}
            onChange={(event) => onManualTimeChange(event.target.value)}
            type="time"
            value={manualTime}
          />
        </label>
        <button
          className="btn btn-secondary"
          disabled={disabled || !manualTime}
          onClick={() => onSelect(manualTime)}
          type="button"
        >
          Usar este horário
        </button>
        <p className="muted">
          Um horário fora dos oferecidos pode estar ocupado. Se estiver, a
          agenda mostra o que ocupa o intervalo e sobrepor exige motivo.
        </p>
      </div>
      <p className="agenda-hold-status" role="status">
        {holdNotice(hold, timezone)}
      </p>
    </>
  );
}

function holdNotice(hold: HoldSession, timezone?: string | null): string {
  if (hold.phase === "reserving") return "Reservando o horário…";
  if (hold.phase === "unsupported") return HOLD_UNSUPPORTED_NOTICE;
  if (hold.phase === "expired") return HOLD_EXPIRED_NOTICE;
  if (hold.phase === "held" && hold.expiresAt) {
    return `Horário reservado para você até ${formatClock(hold.expiresAt, timezone)}. Depois disso a reserva cai sozinha e é preciso escolher de novo.`;
  }
  return "Nenhum horário reservado ainda. Escolher um horário reserva-o enquanto você confirma.";
}

function formatClock(iso: string, timezone?: string | null): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "short",
    timeZone: timezone ?? undefined,
  }).format(new Date(iso));
}
