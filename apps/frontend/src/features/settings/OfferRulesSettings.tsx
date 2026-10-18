"use client";

import { useId, useState } from "react";

import type { AvailabilitySettingsInput, SettingsState } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { showToast } from "@/shared/ui/toastBus";

import {
  CUSTOMER_CHANGE_POLICY_OPTIONS,
  formatCustomerChangePolicyLabel,
  formatGranularityLabel,
  formatMaxLeadDaysLabel,
  formatMinLeadLabel,
  GRANULARITY_OPTIONS,
  MAX_LEAD_DAYS_OPTIONS,
  MIN_LEAD_OPTIONS,
} from "./agendaSummaries";
import { offerPreview } from "./offerPreview";
import { SettingsPage } from "./shared/SettingsPage";

type Option = { value: number; label: string };

function withCustomOption(
  options: Option[],
  value: number,
  formatLabel: (value: number) => string,
): Option[] {
  return options.some((option) => option.value === value)
    ? options
    : [...options, { value, label: formatLabel(value) }];
}

function ChoiceGroup({
  formatLabel,
  label,
  list = false,
  onChange,
  options,
  value,
}: {
  formatLabel: (value: number) => string;
  label: string;
  list?: boolean;
  onChange: (value: number) => void;
  options: Option[];
  value: number;
}) {
  const name = useId();
  const labelId = `${name}-label`;
  return (
    <div className="rules-field">
      <span className="rules-label" id={labelId}>
        {label}
      </span>
      <div
        aria-labelledby={labelId}
        className={`rules-options${list ? " is-list" : ""}`}
        role="radiogroup"
      >
        {withCustomOption(options, value, formatLabel).map((option) => {
          const selected = option.value === value;
          return (
            <label
              className={`rules-option${selected ? " is-selected" : ""}`}
              key={option.value}
            >
              <input
                checked={selected}
                className="rules-option-input"
                name={name}
                type="radio"
                value={option.value}
                onChange={() => onChange(option.value)}
              />
              {list && selected && <Icon name="check" />}
              {option.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function PracticalExample({
  granularityMinutes,
  minLeadMinutes,
  now,
  timeZone,
}: {
  granularityMinutes: number;
  minLeadMinutes: number;
  now: Date;
  timeZone: string;
}) {
  const preview = offerPreview({
    granularityMinutes,
    minLeadMinutes,
    now,
    timeZone,
  });
  return (
    <section aria-label="Na prática" className="rules-example">
      <span className="rules-example-title">
        Na prática · agora são {preview.nowLabel}
      </span>
      <div className="rules-example-times">
        {preview.struck.map((time) => (
          <s className="rules-example-struck" key={time}>
            {time}
          </s>
        ))}
        {preview.pills.map((time) => (
          <span className="rules-example-pill" key={time}>
            {time}
          </span>
        ))}
        <span className="rules-example-more">…</span>
      </div>
      <span className="rules-example-legend">{preview.legend}</span>
    </section>
  );
}

export function OfferRulesSettings({
  onSaved,
  settings,
}: {
  onSaved: (state: SettingsState) => void;
  settings: SettingsState;
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
  const [customerChangeMinNoticeMinutes, setCustomerChangeMinNoticeMinutes] =
    useState(availability?.customerChangeMinNoticeMinutes ?? 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [now] = useState(() => new Date());

  const timeZone =
    availability?.timezone ??
    settings.business?.timezone ??
    "America/Sao_Paulo";

  async function save() {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    const input: AvailabilitySettingsInput = {
      customerChangeMinNoticeMinutes,
      granularityMinutes,
      maxLeadDays,
      minLeadMinutes,
      timezone: timeZone,
      rules: (availability?.rules ?? []).map((rule) => ({
        active: rule.active,
        dayOfWeek: rule.dayOfWeek,
        endTime: rule.endTime,
        startTime: rule.startTime,
      })),
    };
    try {
      const updated =
        await getProductServices().settings.updateAvailability(input);
      onSaved({ ...settings, availability: updated });
      setMessage("Regras da Agenda salvas.");
      showToast("Regras da Agenda salvas.");
    } catch {
      setFailed(true);
      setMessage("Não foi possível salvar as regras da Agenda.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPage
      backHref="/configuracoes/agenda"
      backLabel="Voltar para Agenda"
      title="Antecedência e intervalos"
      description="Defina como a IA oferece horários."
    >
      <div className="rules-screen">
        <div className="rules-fields">
          <ChoiceGroup
            formatLabel={formatMinLeadLabel}
            label="Com quanta antecedência a IA pode marcar"
            options={MIN_LEAD_OPTIONS}
            value={minLeadMinutes}
            onChange={setMinLeadMinutes}
          />
          <ChoiceGroup
            formatLabel={formatMaxLeadDaysLabel}
            label="Até quando no futuro"
            options={MAX_LEAD_DAYS_OPTIONS}
            value={maxLeadDays}
            onChange={setMaxLeadDays}
          />
          <ChoiceGroup
            formatLabel={formatGranularityLabel}
            label="Intervalo entre horários oferecidos"
            options={GRANULARITY_OPTIONS}
            value={granularityMinutes}
            onChange={setGranularityMinutes}
          />
          <PracticalExample
            granularityMinutes={granularityMinutes}
            minLeadMinutes={minLeadMinutes}
            now={now}
            timeZone={timeZone}
          />
          <div className="rules-policy">
            <ChoiceGroup
              formatLabel={formatCustomerChangePolicyLabel}
              label="Cancelar ou remarcar pelo WhatsApp"
              list
              options={CUSTOMER_CHANGE_POLICY_OPTIONS}
              value={customerChangeMinNoticeMinutes}
              onChange={setCustomerChangeMinNoticeMinutes}
            />
            <span className="rules-help">
              Com restrição, fora do prazo a IA explica a regra e oferece falar
              com você. Pela Agenda, você sempre pode cancelar ou remarcar.
            </span>
          </div>
        </div>
        <div className="rules-save">
          <p
            className={`rules-save-note${failed ? " is-error" : ""}`}
            role={failed ? "alert" : "status"}
          >
            {message}
          </p>
          <button
            className="rules-save-button"
            disabled={busy}
            type="button"
            onClick={() => void save()}
          >
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </SettingsPage>
  );
}
