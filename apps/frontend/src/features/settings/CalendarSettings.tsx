"use client";

import Link from "next/link";
import { useState } from "react";

import type { SettingsState } from "@/data";
import { ReminderSettingsSection } from "@/features/reminders/ReminderSettingsSection";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { SaveActions } from "./shared/fields";
import { SettingsPage } from "./shared/SettingsPage";

const MIN_LEAD_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sem antecedência mínima" },
  { value: 60, label: "1 hora" },
  { value: 120, label: "2 horas" },
  { value: 240, label: "4 horas" },
  { value: 1_440, label: "1 dia" },
];

const MAX_LEAD_DAYS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 30, label: "30 dias" },
  { value: 60, label: "60 dias" },
  { value: 90, label: "90 dias" },
];

const GRANULARITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 h" },
];

function ChoiceGroup({
  label,
  onChange,
  options,
  value,
  formatCustomLabel,
}: {
  label: string;
  onChange: (value: number) => void;
  options: Array<{ value: number; label: string }>;
  value: number;
  formatCustomLabel: (value: number) => string;
}) {
  const isKnownValue = options.some((option) => option.value === value);
  const displayOptions = isKnownValue
    ? options
    : [...options, { value, label: formatCustomLabel(value) }];

  return (
    <div className="field is-wide">
      <span className="label">{label}</span>
      <div className="chip-row">
        {displayOptions.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={`chip${value === option.value ? " is-active" : ""}`}
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatMinLeadLabel(minutes: number): string {
  if (minutes <= 0) return "Sem antecedência mínima";
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440;
    return days === 1 ? "1 dia" : `${days} dias`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  return `${minutes} min`;
}

function formatMaxLeadDaysLabel(days: number): string {
  return days === 1 ? "1 dia" : `${days} dias`;
}

function formatGranularityLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 h" : `${hours} h`;
  }
  return `${minutes} min`;
}

export function CalendarSettings({
  settings,
  onSaved,
}: {
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  const availability = settings.availability;
  const [minLeadMinutes, setMinLeadMinutes] = useState(
    availability?.minLeadMinutes ?? 0,
  );
  const [maxLeadDays, setMaxLeadDays] = useState(
    availability?.maxLeadDays ?? 90,
  );
  const [granularityMinutes, setGranularityMinutes] = useState(
    availability?.granularityMinutes ?? 30,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await getProductServices().settings.updateAvailability({
        granularityMinutes,
        maxLeadDays,
        minLeadMinutes,
        timezone:
          availability?.timezone ?? settings.business?.timezone ?? "America/Sao_Paulo",
        rules: (availability?.rules ?? []).map((rule) => ({
          active: rule.active,
          dayOfWeek: rule.dayOfWeek,
          endTime: rule.endTime,
          startTime: rule.startTime,
        })),
      });
      onSaved({ ...settings, availability: updated });
      setMessage("Regras de oferta salvas.");
    } catch {
      setMessage("Não foi possível salvar as regras de oferta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPage
      title="Agenda"
      description="Defina como a IA oferece horários e configure lembretes."
    >
      <div className="settings-stack">
        <section className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>Como a IA oferece horários</h2>
              <p>Antecedência, limite futuro e intervalo entre os horários oferecidos.</p>
            </div>
          </div>
          <div className="settings-stack">
            <ChoiceGroup
              label="Com quanta antecedência a IA pode marcar"
              options={MIN_LEAD_OPTIONS}
              value={minLeadMinutes}
              onChange={setMinLeadMinutes}
              formatCustomLabel={formatMinLeadLabel}
            />
            <ChoiceGroup
              label="Até quando no futuro"
              options={MAX_LEAD_DAYS_OPTIONS}
              value={maxLeadDays}
              onChange={setMaxLeadDays}
              formatCustomLabel={formatMaxLeadDaysLabel}
            />
            <ChoiceGroup
              label="Intervalo entre horários oferecidos"
              options={GRANULARITY_OPTIONS}
              value={granularityMinutes}
              onChange={setGranularityMinutes}
              formatCustomLabel={formatGranularityLabel}
            />
          </div>
          <SaveActions busy={busy} message={message} onClick={() => void save()} />
        </section>
        <Link className="settings-hub-card" href="/configuracoes/disponibilidade">
          <span className="settings-hub-icon">
            <Icon name="clock" />
          </span>
          <span className="settings-hub-copy">
            <strong>Disponibilidade</strong>
            <span>Dias e horários de atendimento</span>
          </span>
          <Icon name="chevron-right" />
        </Link>
        <ReminderSettingsSection />
      </div>
    </SettingsPage>
  );
}
