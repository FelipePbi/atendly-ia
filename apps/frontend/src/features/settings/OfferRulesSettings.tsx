"use client";

import { type ReactNode, useId, useState } from "react";

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
import {
  changePolicyExample,
  horizonExample,
  leadExample,
  offerSimulation,
  stepExample,
} from "./offerPreview";
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

/**
 * Texto que muda com a escolha. O contêiner fica fixo (é ele a região
 * `aria-live`) e só o conteúdo troca, com fade de opacidade depois da primeira
 * edição — também com movimento reduzido (D-173).
 */
function LiveText({ animate, text }: { animate: boolean; text: string }) {
  return (
    <span className={animate ? "rules-swap" : undefined} key={text}>
      {text}
    </span>
  );
}

function ChoiceGroup({
  animate,
  description,
  example,
  formatLabel,
  label,
  list = false,
  onChange,
  options,
  value,
}: {
  animate: boolean;
  description: string;
  example: string;
  formatLabel: (value: number) => string;
  label: string;
  list?: boolean;
  onChange: (value: number) => void;
  options: Option[];
  value: number;
}) {
  const name = useId();
  const labelId = `${name}-label`;
  const descriptionId = `${name}-description`;
  const exampleId = `${name}-example`;
  return (
    <div className="rules-field">
      <div className="rules-field-head">
        <span className="rules-label" id={labelId}>
          {label}
        </span>
        <span className="rules-description" id={descriptionId}>
          {description}
        </span>
      </div>
      <div
        aria-describedby={`${descriptionId} ${exampleId}`}
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
      <p aria-live="polite" className="rules-hint" id={exampleId}>
        <span className="rules-hint-tag">Exemplo</span>{" "}
        <LiveText animate={animate} text={example} />
      </p>
    </div>
  );
}

function RulesSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: "calendar" | "clock" | "refresh";
  title: string;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="rules-section">
      <h2 className="rules-section-title" id={titleId}>
        <Icon name={icon} />
        {title}
      </h2>
      <div className="rules-card">{children}</div>
    </section>
  );
}

function PracticalExample({
  animate,
  simulation,
}: {
  animate: boolean;
  simulation: ReturnType<typeof offerSimulation>;
}) {
  const times = [...simulation.struck, ...simulation.pills].join(" ");
  return (
    <section aria-label="Na prática" className="rules-example">
      <span className="rules-example-title">
        <Icon name="spark" />
        Na prática · agora são {simulation.nowLabel}
      </span>
      {simulation.day ? (
        <>
          <p className="rules-example-lead">
            Se alguém pedir um horário agora, a IA oferece:
          </p>
          <div
            className={`rules-example-offer${animate ? " rules-swap" : ""}`}
            key={`${simulation.day} ${times}`}
          >
            <span className="rules-example-day">{simulation.day}</span>
            <div className="rules-example-times">
              {simulation.struck.map((time) => (
                <s className="rules-example-struck" key={time}>
                  {time}
                </s>
              ))}
              {simulation.pills.map((time) => (
                <span className="rules-example-pill" key={time}>
                  {time}
                </span>
              ))}
              <span aria-hidden="true" className="rules-example-more">
                …
              </span>
            </div>
          </div>
        </>
      ) : (
        <p className="rules-example-empty">{simulation.empty}</p>
      )}
      <ul className="rules-example-facts">
        {simulation.facts.map((fact) => (
          <li key={fact}>
            <Icon name="check" />
            <LiveText animate={animate} text={fact} />
          </li>
        ))}
      </ul>
      <span className="rules-example-legend">
        A IA mostra até três opções por vez e pula os horários que já estão
        ocupados ou bloqueados na Agenda.
      </span>
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
  const [edited, setEdited] = useState(false);
  const [now] = useState(() => new Date());

  const timeZone =
    availability?.timezone ??
    settings.business?.timezone ??
    "America/Sao_Paulo";
  const rules = availability?.rules ?? [];

  function edit(setter: (value: number) => void) {
    return (value: number) => {
      setEdited(true);
      setter(value);
    };
  }

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
          <p className="rules-intro">
            Regras que a IA segue ao marcar pelo WhatsApp. Os exemplos usam a
            data e a hora de agora e mudam conforme você escolhe.
          </p>
          <RulesSection icon="calendar" title="Quando a IA pode marcar">
            <ChoiceGroup
              animate={edited}
              description="O tempo mínimo entre agora e o horário que a IA oferece."
              example={leadExample({ minLeadMinutes, now, timeZone })}
              formatLabel={formatMinLeadLabel}
              label="Com quanta antecedência a IA pode marcar"
              options={MIN_LEAD_OPTIONS}
              value={minLeadMinutes}
              onChange={edit(setMinLeadMinutes)}
            />
            <ChoiceGroup
              animate={edited}
              description="O dia mais distante, contando de hoje, em que a IA ainda marca."
              example={horizonExample({ maxLeadDays, now, timeZone })}
              formatLabel={formatMaxLeadDaysLabel}
              label="Até quantos dias à frente"
              options={MAX_LEAD_DAYS_OPTIONS}
              value={maxLeadDays}
              onChange={edit(setMaxLeadDays)}
            />
          </RulesSection>
          <RulesSection icon="clock" title="Horários que a IA oferece">
            <ChoiceGroup
              animate={edited}
              description="De quanto em quanto tempo começam os horários, a partir do início do seu expediente."
              example={stepExample({ granularityMinutes, rules })}
              formatLabel={formatGranularityLabel}
              label="Intervalo entre horários oferecidos"
              options={GRANULARITY_OPTIONS}
              value={granularityMinutes}
              onChange={edit(setGranularityMinutes)}
            />
          </RulesSection>
          <RulesSection
            icon="refresh"
            title="Cancelamento e remarcação pelo cliente"
          >
            <ChoiceGroup
              animate={edited}
              description="Até quanto tempo antes do horário o cliente pode cancelar ou remarcar falando com a IA."
              example={changePolicyExample({
                minNoticeMinutes: customerChangeMinNoticeMinutes,
                now,
                timeZone,
              })}
              formatLabel={formatCustomerChangePolicyLabel}
              label="Cancelar ou remarcar pelo WhatsApp"
              list
              options={CUSTOMER_CHANGE_POLICY_OPTIONS}
              value={customerChangeMinNoticeMinutes}
              onChange={edit(setCustomerChangeMinNoticeMinutes)}
            />
            <p className="rules-help">
              <Icon name="info" />
              <span>
                Com restrição, fora do prazo a IA explica a regra e oferece
                falar com você. Pela Agenda, você sempre pode cancelar ou
                remarcar.
              </span>
            </p>
          </RulesSection>
          <PracticalExample
            animate={edited}
            simulation={offerSimulation({
              granularityMinutes,
              maxLeadDays,
              minLeadMinutes,
              minNoticeMinutes: customerChangeMinNoticeMinutes,
              now,
              rules,
              timeZone,
            })}
          />
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
