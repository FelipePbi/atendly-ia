"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, useState } from "react";

import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";
import { WEEK_ORDER } from "@/features/settings/agendaSummaries";
import {
  HIDDEN_WEEKDAYS_LIMIT_REASON,
  hiddenWeekdaysLimitReason,
} from "@/features/settings/CalendarSettings";
import { weekdayLabels } from "@/features/settings/shared/labels";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

/** O servidor recusa sete dias ocultos (Goal073); o cliente para em seis. */
const MAX_HIDDEN_WEEKDAYS = 6;

/**
 * Folha "Dias visíveis" do quadro A12, aberta pela pílula da própria Agenda.
 * Os interruptores mexem só num rascunho: nada é gravado antes de "Salvar",
 * que manda apenas `hiddenWeekdays` (sem `initialView`, que fica como
 * estava). `availableWeekdays` é `null` enquanto a disponibilidade não foi
 * lida, e aí o aviso de dia sem atendimento some.
 */
export function AgendaVisibleDaysSheet({
  availableWeekdays,
  hiddenWeekdays,
  onClose,
  onSaved,
}: {
  availableWeekdays: Set<number> | null;
  hiddenWeekdays: number[];
  onClose: () => void;
  onSaved: (hiddenWeekdays: number[]) => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState(() => new Set(hiddenWeekdays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function toggle(day: number) {
    setDraft((current) => {
      if (!current.has(day) && current.size >= MAX_HIDDEN_WEEKDAYS) {
        return current;
      }
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function save() {
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const preference =
        await getProductServices().settings.updateAgendaViewPreference(
          { hiddenWeekdays: [...draft].sort((a, b) => a - b) },
          controller.signal,
        );
      if (controller.signal.aborted) return;
      onSaved(preference.hiddenWeekdays);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        hiddenWeekdaysLimitReason(caught) ??
          "Não foi possível salvar os dias visíveis.",
      );
      setBusy(false);
    }
  }

  return (
    <ChatSheetShell
      className="is-agenda-days"
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Dias visíveis"
      titleId={titleId}
    >
      <div className="agenda-days-head">
        <h2 className="agenda-days-title" id={titleId}>
          Dias visíveis
        </h2>
        <p className="agenda-days-lead">
          Escolha o que aparece em Semana e Mês. Isso não muda seus horários de
          atendimento.
        </p>
      </div>
      <div className="agenda-days-list">
        {WEEK_ORDER.map((day) => (
          <VisibleDayRow
            closed={availableWeekdays !== null && !availableWeekdays.has(day)}
            disabled={
              busy || (!draft.has(day) && draft.size >= MAX_HIDDEN_WEEKDAYS)
            }
            key={day}
            label={weekdayLabels[day]}
            onToggle={() => toggle(day)}
            visible={!draft.has(day)}
          />
        ))}
      </div>
      {draft.size >= MAX_HIDDEN_WEEKDAYS && (
        <p className="agenda-days-note">{HIDDEN_WEEKDAYS_LIMIT_REASON}</p>
      )}
      <p className="agenda-days-note">
        Se algum atendimento cair em um dia oculto, ele continua na visualização
        Dia e você recebe um aviso na semana.
      </p>
      {error && (
        <p className="agenda-days-error" role="alert">
          {error}
        </p>
      )}
      <button
        aria-busy={busy}
        className="agenda-days-save"
        disabled={busy}
        onClick={() => void save()}
        type="button"
      >
        Salvar
      </button>
    </ChatSheetShell>
  );
}

function VisibleDayRow({
  closed,
  disabled,
  label,
  onToggle,
  visible,
}: {
  closed: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
  visible: boolean;
}) {
  const id = useId();
  return (
    <label className={clsx("agenda-days-row", !visible && "is-hidden")} htmlFor={id}>
      <span className="agenda-days-row-copy">
        <span className="agenda-days-row-name" id={`${id}-name`}>
          {label}
        </span>
        {closed && (
          <span className="agenda-days-row-hint" id={`${id}-hint`}>
            Você não atende neste dia
          </span>
        )}
      </span>
      <button
        aria-checked={visible}
        aria-describedby={closed ? `${id}-hint` : undefined}
        aria-labelledby={`${id}-name`}
        className="agenda-days-switch"
        disabled={disabled}
        id={id}
        onClick={onToggle}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="agenda-days-knob" />
      </button>
    </label>
  );
}
