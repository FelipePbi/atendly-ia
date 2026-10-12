"use client";

import { Icon } from "@/shared/icons/Icon";
import { Button } from "@/shared/ui/Button";

import {
  type AgendaEntry,
  describeEntry,
  minutesToTime,
  timeToMinutes,
} from "./occupancy";
import {
  classifyFreeRefusal,
  type ConflictAvailability,
  hoursLabel,
  stepLabel,
} from "./SlotConflictNotice";

/**
 * Motivo de uma recusa sem ocupante, com o mesmo critério do aviso do Novo
 * agendamento (SlotConflictNotice). Antes dizia sempre "fora da grade de
 * atendimento", mesmo com o horário dentro do expediente (2026-10-12).
 */
export function freeRefusalText({
  availability,
  interval,
}: {
  availability?: ConflictAvailability | null;
  interval: { date: string; durationMinutes: number; startTime: string };
}): string {
  const refusal = classifyFreeRefusal({
    availability,
    date: interval.date,
    durationMinutes: interval.durationMinutes,
    startTime: interval.startTime,
  });
  const lead = "Nenhum evento da agenda cobre este intervalo";
  if (refusal.kind === "outside") {
    return `${lead}, mas ele fica fora do seu horário de atendimento: ${hoursLabel(refusal.intervals)}.`;
  }
  if (refusal.kind === "off-grid") {
    return `${lead}, mas ${minutesToTime(timeToMinutes(interval.startTime))} não está entre os horários que a sua agenda oferece (${stepLabel(refusal.granularityMinutes)}).`;
  }
  return `${lead}, mas a agenda não liberou o horário agora. Ele pode estar reservado numa confirmação em andamento.`;
}

/**
 * O que ocupa um intervalo, lido do read model da própria agenda.
 *
 * A recusa do contrato é `409 SLOT_UNAVAILABLE` e não diz **quem** ocupa —
 * então quem responde isso é a agenda do dia (atendimentos ativos, bloqueios,
 * compromissos pessoais e a ocupação por buffer do Goal009). Nada é inferido:
 * um intervalo recusado sem nenhum evento sobreposto é dito como tal, porque
 * pode estar simplesmente fora da grade de atendimento.
 */
export function occupyingEntries(
  entries: AgendaEntry[],
  interval: { date: string; durationMinutes: number; startTime: string },
): AgendaEntry[] {
  const start = timeToMinutes(interval.startTime);
  const end = start + interval.durationMinutes;
  return entries.filter(
    (entry) =>
      entry.date === interval.date &&
      entry.startMinutes < end &&
      entry.endMinutes > start,
  );
}

export function ConflictPanel({
  availability,
  busy,
  entries,
  interval,
  loading,
  onChooseAnother,
  onOverride,
  onReasonChange,
  reason,
  reasonError,
}: {
  /** Expediente e granularidade (Configurações > Agenda), para dizer o motivo real. */
  availability?: ConflictAvailability | null;
  busy: boolean;
  /** `null` enquanto a leitura da ocupação não respondeu ou falhou. */
  entries: AgendaEntry[] | null;
  interval: { date: string; durationMinutes: number; startTime: string };
  loading: boolean;
  onChooseAnother: () => void;
  onOverride: () => void;
  onReasonChange: (value: string) => void;
  reason: string;
  reasonError: string | null;
}) {
  const start = timeToMinutes(interval.startTime);
  const range = `${minutesToTime(start)}–${minutesToTime(start + interval.durationMinutes)}`;

  return (
    <section
      aria-labelledby="agenda-conflict-title"
      className="agenda-conflict"
    >
      <p className="eyebrow">Conflito de horário</p>
      <h2 id="agenda-conflict-title">
        O intervalo {range} não está livre nesta agenda
      </h2>
      {loading ? (
        <p>Consultando o que ocupa este intervalo…</p>
      ) : entries === null ? (
        <p className="muted">
          Não foi possível listar o que ocupa este intervalo. A agenda recusou o
          horário mesmo assim.
        </p>
      ) : entries.length === 0 ? (
        <p className="muted">{freeRefusalText({ availability, interval })}</p>
      ) : (
        <ul className="agenda-conflict-list">
          {entries.map((entry) => {
            const presentation = describeEntry(entry);
            return (
              <li key={entry.key}>
                <span className="agenda-item-kind">
                  <Icon name={presentation.icon} />
                  {presentation.typeLabel}
                </span>
                <strong>{presentation.title}</strong>
                <span className="badge">
                  {minutesToTime(entry.startMinutes)}–
                  {minutesToTime(entry.endMinutes)}
                </span>
                {presentation.detail && <span>{presentation.detail}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <label className="field">
        <span>Motivo da sobreposição</span>
        <textarea
          aria-invalid={reasonError ? true : undefined}
          onChange={(event) => onReasonChange(event.target.value)}
          rows={3}
          value={reason}
        />
      </label>
      {reasonError && (
        <p className="form-error" role="alert">
          {reasonError}
        </p>
      )}
      <p className="muted">
        Sobrepor é decisão de quem está autenticado e fica registrada no
        histórico do atendimento, com o motivo.
      </p>
      <div className="agenda-form-footer">
        <Button
          disabled={busy}
          onClick={onChooseAnother}
          type="button"
          variant="secondary"
        >
          Escolher outro horário
        </Button>
        <Button
          loading={busy}
          onClick={onOverride}
          type="button"
          variant="danger"
        >
          Sobrepor mesmo assim
        </Button>
      </div>
    </section>
  );
}
