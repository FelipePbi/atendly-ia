"use client";

import { useMemo, useState } from "react";

import type { SettingsState } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { SaveActions } from "./shared/fields";
import { weekdayLabels } from "./shared/labels";
import { SettingsPage } from "./shared/SettingsPage";

type AvailabilityRule = NonNullable<
  SettingsState["availability"]
>["rules"][number];

/** Uma entrada por dia com >1 regra ativa: a grade tem mais de um intervalo. */
function groupActiveRulesByDay(
  rules: AvailabilityRule[],
): Map<number, AvailabilityRule[]> {
  const grouped = new Map<number, AvailabilityRule[]>();
  for (const rule of rules) {
    if (!rule.active) continue;
    const forDay = grouped.get(rule.dayOfWeek) ?? [];
    forDay.push(rule);
    grouped.set(rule.dayOfWeek, forDay);
  }
  return grouped;
}

/**
 * O formulário abaixo só grava um horário único para os dias escolhidos.
 * Ele "cabe" quando cada dia ativo tem exatamente um intervalo e todos os
 * dias compartilham o mesmo horário — caso contrário, salvar com este
 * formulário substituiria uma grade que ele não consegue representar.
 */
function fitsSingleIntervalForm(rulesByDay: Map<number, AvailabilityRule[]>) {
  let shared: { startTime: string; endTime: string } | null = null;
  for (const dayRules of rulesByDay.values()) {
    if (dayRules.length !== 1) return false;
    const [rule] = dayRules;
    if (!shared) {
      shared = { startTime: rule.startTime, endTime: rule.endTime };
    } else if (
      rule.startTime !== shared.startTime ||
      rule.endTime !== shared.endTime
    ) {
      return false;
    }
  }
  return true;
}

export function AvailabilitySettings({
  settings,
  onSaved,
}: {
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  const rules = settings.availability?.rules;
  const activeRules = useMemo(
    () => rules?.filter((rule) => rule.active) ?? [],
    [rules],
  );
  const rulesByDay = useMemo(
    () => groupActiveRulesByDay(activeRules),
    [activeRules],
  );
  const fitsSingleInterval = fitsSingleIntervalForm(rulesByDay);
  const [days, setDays] = useState(
    () => [...rulesByDay.keys()].sort((a, b) => a - b),
  );
  const [startTime, setStartTime] = useState(
    activeRules[0]?.startTime ?? "09:00",
  );
  const [endTime, setEndTime] = useState(activeRules[0]?.endTime ?? "18:00");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save() {
    if (days.length === 0) {
      setMessage("Escolha pelo menos um dia de atendimento.");
      return;
    }
    if (startTime >= endTime) {
      setMessage("O horário final deve ser posterior ao horário inicial.");
      return;
    }
    if (!fitsSingleInterval && !replaceConfirmed) {
      setMessage(
        "Marque a confirmação para substituir os horários existentes.",
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const availability =
        await getProductServices().settings.updateAvailability({
          timezone: settings.business?.timezone ?? "America/Sao_Paulo",
          rules: days.map((dayOfWeek) => ({
            active: true,
            dayOfWeek,
            startTime,
            endTime,
          })),
        });
      onSaved({ ...settings, availability });
      setMessage("Disponibilidade salva.");
      setReplaceConfirmed(false);
    } catch {
      setMessage("Não foi possível salvar a disponibilidade.");
    } finally {
      setBusy(false);
    }
  }
  if (settings.calendar.source !== "ATENDLY")
    return (
      <SettingsPage
        title="Disponibilidade"
        description="A disponibilidade pertence à fonte oficial."
      >
        <div className="onboarding-note is-important">
          <Icon name="info" />
          <span>Edite os horários diretamente na Minha Agenda.</span>
        </div>
      </SettingsPage>
    );
  return (
    <SettingsPage
      title="Disponibilidade"
      description="Defina os dias e o intervalo habitual da Agenda Atendly."
    >
      <section className="settings-panel">
        {rulesByDay.size > 0 && (
          <ul aria-label="Horários atuais" className="availability-current-rules">
            {weekdayLabels.map((label, day) => {
              const dayRules = rulesByDay.get(day);
              if (!dayRules) return null;
              return (
                <li key={label}>
                  <strong>{label}</strong>
                  <span>
                    {dayRules
                      .map((rule) => `${rule.startTime}–${rule.endTime}`)
                      .join(", ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {!fitsSingleInterval && (
          <div className="onboarding-note is-important" role="alert">
            <Icon name="info" />
            <span>
              Um ou mais dias têm mais de um intervalo. Este formulário grava
              um único horário para os dias escolhidos e salvar substitui os
              intervalos atuais.
            </span>
          </div>
        )}
        <div className="choice-grid">
          {weekdayLabels.map((label, day) => (
            <label
              className={`choice-card${days.includes(day) ? " is-selected" : ""}`}
              key={label}
            >
              <input
                className="sr-only"
                checked={days.includes(day)}
                type="checkbox"
                onChange={(event) =>
                  setDays((value) =>
                    event.target.checked
                      ? [...value, day].sort()
                      : value.filter((item) => item !== day),
                  )
                }
              />
              <strong>{label}</strong>
            </label>
          ))}
        </div>
        <div className="settings-form-grid">
          <label className="field">
            <span className="label">Início</span>
            <input
              className="input"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Fim</span>
            <input
              className="input"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </label>
        </div>
        {!fitsSingleInterval && (
          <label className="switch-row">
            <span>
              <strong>Substituir horários existentes</strong>
              <small>
                Confirme para trocar os intervalos atuais por este horário
                único.
              </small>
            </span>
            <input
              checked={replaceConfirmed}
              type="checkbox"
              onChange={(event) => setReplaceConfirmed(event.target.checked)}
            />
          </label>
        )}
        <SaveActions
          busy={busy}
          message={message}
          onClick={() => void save()}
        />
      </section>
    </SettingsPage>
  );
}
