"use client";

import { useEffect, useId, useState } from "react";

import type {
  ReminderPricePolicy,
  ReminderRule,
  ReminderSettings,
  ReminderSlot,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Skeleton } from "@/shared/ui/States";

const LEAD_PRESETS_MINUTES = [2_880, 1_440, 720, 120];
const DEFAULT_LEAD_MINUTES = 1_440;
const DEFAULT_SECOND_LEAD_MINUTES = 120;
const MAX_LEAD_MINUTES = 43_200;

function presetLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

function ruleFor(
  rules: ReminderRule[],
  slot: ReminderSlot,
): ReminderRule | null {
  return rules.find((rule) => rule.slot === slot) ?? null;
}

function isValidLeadMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_LEAD_MINUTES;
}

/**
 * Bloco de Lembretes em Configurações → Agenda (Goal021/WU-010, G-27): lê e
 * grava `/v1/settings/reminders`. Só humano configura — a IA nunca cria ou
 * altera lembrete, no mesmo padrão de disponibilidade e oferta (Goal009).
 * `rules` nasce sempre com no máximo dois itens (FIRST/SECOND) pela forma do
 * estado, não por validação extra; `rules: []` é a escolha explícita de
 * desligar os lembretes.
 */
export function ReminderSettingsSection() {
  const confirmationDescriptionId = useId();
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [error, setError] = useState(false);
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [confirmationEnabled, setConfirmationEnabled] = useState(false);
  const [pricePolicy, setPricePolicy] = useState<ReminderPricePolicy>("NEVER");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .settings.getReminders(controller.signal)
      .then((state) => {
        setSettings(state);
        setRules(state.rules);
        setConfirmationEnabled(state.confirmationEnabled);
        setPricePolicy(state.pricePolicy);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      });
    return () => controller.abort();
  }, []);

  if (!settings && !error) {
    return (
      <section className="settings-panel" aria-busy="true">
        <Skeleton style={{ width: "40%", height: 20 }} />
        <Skeleton style={{ width: "100%", height: 56 }} />
      </section>
    );
  }
  if (error || !settings) return null;

  const first = ruleFor(rules, "FIRST");
  const second = ruleFor(rules, "SECOND");

  function setRule(slot: ReminderSlot, leadMinutes: number) {
    setRules((current) => {
      const withoutSlot = current.filter((rule) => rule.slot !== slot);
      const next = [...withoutSlot, { slot, leadMinutes }];
      return next.sort(
        (a, b) => (a.slot === "FIRST" ? -1 : 1) - (b.slot === "FIRST" ? -1 : 1),
      );
    });
  }

  function removeRule(slot: ReminderSlot) {
    setRules((current) => current.filter((rule) => rule.slot !== slot));
  }

  // Desativar o primeiro lembrete desliga os dois: um "Lembrete 2" órfão,
  // sem o primeiro, não existe na UI nem faz sentido no produto.
  function disableReminders() {
    setRules([]);
  }

  async function save() {
    if (rules.some((rule) => !isValidLeadMinutes(rule.leadMinutes))) {
      setMessage("A antecedência deve ser de 1 minuto até 30 dias.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const saved = await getProductServices().settings.updateReminders({
        confirmationEnabled,
        pricePolicy,
        rules: rules.map(({ slot, leadMinutes }) => ({ slot, leadMinutes })),
      });
      setSettings(saved);
      setRules(saved.rules);
      setConfirmationEnabled(saved.confirmationEnabled);
      setPricePolicy(saved.pricePolicy);
      setMessage("Lembretes salvos.");
    } catch {
      setMessage("Não foi possível salvar os lembretes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <div>
          <p>
            Até dois lembretes por agendamento, com antecedência configurável e
            confirmação de presença separada.
          </p>
        </div>
      </div>
      <div className="settings-stack">
        {first ? (
          <ReminderRuleField
            label="Lembrete 1 · quanto tempo antes"
            rule={first}
            onChange={(minutes) => setRule("FIRST", minutes)}
            onRemove={disableReminders}
            removeLabel="Desativar lembretes"
          />
        ) : (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setRule("FIRST", DEFAULT_LEAD_MINUTES)}
          >
            Ativar lembretes
          </button>
        )}
        {first && second && (
          <ReminderRuleField
            label="Lembrete 2 · quanto tempo antes"
            rule={second}
            onChange={(minutes) => setRule("SECOND", minutes)}
            onRemove={() => removeRule("SECOND")}
            removeLabel="Remover segundo lembrete"
          />
        )}
        {first && !second && (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setRule("SECOND", DEFAULT_SECOND_LEAD_MINUTES)}
          >
            Adicionar segundo lembrete
          </button>
        )}
        <label className="switch-row">
          <span>
            <strong>Pedir confirmação de presença</strong>
            <small id={confirmationDescriptionId}>
              Se a cliente disser que não vem, a IA pergunta se quer cancelar ou
              remarcar. Sem resposta, o horário continua válido.
            </small>
          </span>
          <input
            aria-describedby={confirmationDescriptionId}
            aria-label="Pedir confirmação de presença"
            checked={confirmationEnabled}
            type="checkbox"
            onChange={(event) => setConfirmationEnabled(event.target.checked)}
          />
        </label>
        <div className="field is-wide">
          <span className="label">Mostrar preço no lembrete</span>
          <div className="chip-row">
            <button
              aria-pressed={pricePolicy === "NEVER"}
              className={`chip${pricePolicy === "NEVER" ? " is-active" : ""}`}
              type="button"
              onClick={() => setPricePolicy("NEVER")}
            >
              Nunca
            </button>
            <button
              aria-pressed={pricePolicy === "WHEN_FIXED"}
              className={`chip${pricePolicy === "WHEN_FIXED" ? " is-active" : ""}`}
              type="button"
              onClick={() => setPricePolicy("WHEN_FIXED")}
            >
              Só quando for fixo
            </button>
          </div>
        </div>
      </div>
      <div className="settings-form-actions">
        <span className="settings-save-note" role="status">
          {message}
        </span>
        <button
          className="btn btn-primary"
          disabled={busy}
          type="button"
          onClick={() => void save()}
        >
          {busy ? "Salvando..." : "Salvar lembretes"}
        </button>
      </div>
    </section>
  );
}

function ReminderRuleField({
  label,
  onChange,
  onRemove,
  removeLabel,
  rule,
}: {
  label: string;
  onChange: (leadMinutes: number) => void;
  onRemove: () => void;
  removeLabel: string;
  rule: ReminderRule;
}) {
  return (
    <div className="field is-wide">
      <span className="label">{label}</span>
      <div className="chip-row">
        {LEAD_PRESETS_MINUTES.map((minutes) => (
          <button
            aria-pressed={rule.leadMinutes === minutes}
            className={`chip${rule.leadMinutes === minutes ? " is-active" : ""}`}
            key={minutes}
            type="button"
            onClick={() => onChange(minutes)}
          >
            {presetLabel(minutes)}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="label">Personalizado (minutos)</span>
        <input
          className="input"
          max={MAX_LEAD_MINUTES}
          min={1}
          type="number"
          value={rule.leadMinutes}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) onChange(Math.trunc(value));
          }}
        />
      </label>
      <button className="btn btn-secondary" type="button" onClick={onRemove}>
        {removeLabel}
      </button>
    </div>
  );
}
