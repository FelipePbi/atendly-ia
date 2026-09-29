"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type {
  AgendaInitialView,
  AvailabilitySettingsInput,
  SettingsState,
} from "@/data";
import { ReminderSettingsSection } from "@/features/reminders/ReminderSettingsSection";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { SaveActions } from "./shared/fields";
import { weekdayLabels } from "./shared/labels";
import { SettingsPage } from "./shared/SettingsPage";

// Mesma ordem Segunda…Domingo de `AvailabilitySettings` (o valor gravado de
// `dayOfWeek` continua 0=domingo…6=sábado).
const weekOrder = [1, 2, 3, 4, 5, 6, 0];

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

const CUSTOMER_CHANGE_POLICY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sem restrição" },
  { value: 720, label: "Até 12 h antes" },
  { value: 1_440, label: "Até 24 h antes" },
  { value: 2_880, label: "Até 48 h antes" },
];

const INITIAL_VIEW_OPTIONS: Array<{
  value: AgendaInitialView | null;
  label: string;
}> = [
  { value: null, label: "Automática" },
  { value: "DAY", label: "Dia" },
  { value: "WEEK", label: "Semana" },
  { value: "MONTH", label: "Mês" },
];

function ChoiceGroup<T>({
  label,
  onChange,
  options,
  value,
  formatCustomLabel,
}: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  value: T;
  formatCustomLabel?: (value: T) => string;
}) {
  const isKnownValue = options.some((option) => option.value === value);
  const displayOptions =
    isKnownValue || !formatCustomLabel
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
            key={String(option.value)}
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

function formatCustomerChangePolicyLabel(minutes: number): string {
  if (minutes <= 0) return "Sem restrição";
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `Até ${hours} h antes`;
  }
  return `Até ${minutes} min antes`;
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
  const [customerChangeMinNoticeMinutes, setCustomerChangeMinNoticeMinutes] =
    useState(availability?.customerChangeMinNoticeMinutes ?? 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);

  const [hiddenDays, setHiddenDays] = useState<Set<number>>(new Set());
  const [initialView, setInitialView] = useState<AgendaInitialView | null>(null);
  const [viewReading, setViewReading] = useState(true);
  const [viewReadError, setViewReadError] = useState(false);
  const [viewBusy, setViewBusy] = useState(false);
  const [viewMessage, setViewMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .settings.getAgendaViewPreference(controller.signal)
      .then((preference) => {
        setHiddenDays(new Set(preference.hiddenWeekdays));
        setInitialView(preference.initialView);
        setViewReading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setViewReadError(true);
        setViewReading(false);
      });
    return () => controller.abort();
  }, []);

  /**
   * Os dois painéis gravam pelo mesmo `PATCH /v1/settings/availability`, mas
   * cada um envia só o campo que edita: o resto sai do que está gravado
   * (`settings.availability`, atualizado a cada gravação), nunca do estado
   * não salvo do outro painel.
   */
  function persistedAvailabilityInput(): AvailabilitySettingsInput {
    return {
      customerChangeMinNoticeMinutes:
        availability?.customerChangeMinNoticeMinutes ?? 0,
      granularityMinutes: availability?.granularityMinutes ?? 30,
      maxLeadDays: availability?.maxLeadDays ?? 90,
      minLeadMinutes: availability?.minLeadMinutes ?? 0,
      timezone:
        availability?.timezone ?? settings.business?.timezone ?? "America/Sao_Paulo",
      rules: (availability?.rules ?? []).map((rule) => ({
        active: rule.active,
        dayOfWeek: rule.dayOfWeek,
        endTime: rule.endTime,
        startTime: rule.startTime,
      })),
    };
  }

  async function saveOfferRules() {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await getProductServices().settings.updateAvailability({
        ...persistedAvailabilityInput(),
        granularityMinutes,
        maxLeadDays,
        minLeadMinutes,
      });
      onSaved({ ...settings, availability: updated });
      setMessage("Regras de oferta salvas.");
    } catch {
      setMessage("Não foi possível salvar as regras de oferta.");
    } finally {
      setBusy(false);
    }
  }

  async function savePolicy() {
    setPolicyBusy(true);
    setPolicyMessage(null);
    try {
      const updated = await getProductServices().settings.updateAvailability({
        ...persistedAvailabilityInput(),
        customerChangeMinNoticeMinutes,
      });
      onSaved({ ...settings, availability: updated });
      setPolicyMessage("Política salva.");
    } catch {
      setPolicyMessage("Não foi possível salvar a política.");
    } finally {
      setPolicyBusy(false);
    }
  }

  function toggleHiddenDay(day: number) {
    setHiddenDays((current) => {
      const next = new Set(current);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  async function saveAgendaView() {
    if (viewReading || viewReadError) return;
    setViewBusy(true);
    setViewMessage(null);
    try {
      const preference = await getProductServices().settings.updateAgendaViewPreference({
        hiddenWeekdays: [...hiddenDays].sort((a, b) => a - b),
        initialView,
      });
      setHiddenDays(new Set(preference.hiddenWeekdays));
      setInitialView(preference.initialView);
      setViewMessage("Preferências da Agenda salvas.");
    } catch {
      setViewMessage("Não foi possível salvar as preferências da Agenda.");
    } finally {
      setViewBusy(false);
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
          <SaveActions
            busy={busy}
            disabled={policyBusy}
            message={message}
            onClick={() => void saveOfferRules()}
          />
        </section>
        <section className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>Cancelar ou remarcar pelo WhatsApp</h2>
              <p>Prazo mínimo para a cliente cancelar ou remarcar pela IA.</p>
            </div>
          </div>
          <div className="settings-stack">
            <ChoiceGroup
              label="Prazo mínimo"
              options={CUSTOMER_CHANGE_POLICY_OPTIONS}
              value={customerChangeMinNoticeMinutes}
              onChange={setCustomerChangeMinNoticeMinutes}
              formatCustomLabel={formatCustomerChangePolicyLabel}
            />
            <p className="field-help">
              Com restrição, fora do prazo a IA explica a regra e oferece falar
              com você. Pela Agenda, você sempre pode cancelar ou remarcar.
            </p>
          </div>
          <SaveActions
            busy={policyBusy}
            disabled={busy}
            label="Salvar política"
            message={policyMessage}
            onClick={() => void savePolicy()}
          />
        </section>
        <section className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>Como você vê a Agenda</h2>
              <p>Escolha os dias visíveis e a visualização inicial da Agenda.</p>
            </div>
          </div>
          {viewReadError && (
            <p className="field-help" role="alert">
              Não foi possível carregar as preferências da Agenda agora.
              Atualize a página e tente de novo.
            </p>
          )}
          <div className="settings-stack">
            <div className="field is-wide">
              <span className="label">Dias visíveis</span>
              <div className="chip-row">
                {weekOrder.map((day) => {
                  const visible = !hiddenDays.has(day);
                  return (
                    <button
                      aria-pressed={visible}
                      className={`chip${visible ? " is-active" : ""}`}
                      key={day}
                      type="button"
                      onClick={() => toggleHiddenDay(day)}
                    >
                      {weekdayLabels[day]}
                    </button>
                  );
                })}
              </div>
            </div>
            <ChoiceGroup
              label="Visualização inicial"
              options={INITIAL_VIEW_OPTIONS}
              value={initialView}
              onChange={setInitialView}
            />
            <p className="field-help">
              Ocultar um dia só muda o que você vê. Para não atender em um dia,
              ajuste em{" "}
              <Link href="/configuracoes/disponibilidade">
                Dias e horários
              </Link>
              .
            </p>
          </div>
          <SaveActions
            busy={viewBusy}
            disabled={viewReading || viewReadError}
            label="Salvar visualização"
            message={viewMessage}
            onClick={() => void saveAgendaView()}
          />
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
