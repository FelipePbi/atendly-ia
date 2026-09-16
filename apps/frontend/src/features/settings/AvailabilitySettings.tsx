"use client";

import { useState } from "react";

import type { SettingsState } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { SaveActions } from "./shared/fields";
import { weekdayLabels } from "./shared/labels";
import { SettingsPage } from "./shared/SettingsPage";

export function AvailabilitySettings({
  settings,
  onSaved,
}: {
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  const active =
    settings.availability?.rules.filter((rule) => rule.active) ?? [];
  const [days, setDays] = useState(active.map((rule) => rule.dayOfWeek));
  const [startTime, setStartTime] = useState(active[0]?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(active[0]?.endTime ?? "18:00");
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
        <SaveActions
          busy={busy}
          message={message}
          onClick={() => void save()}
        />
      </section>
    </SettingsPage>
  );
}
