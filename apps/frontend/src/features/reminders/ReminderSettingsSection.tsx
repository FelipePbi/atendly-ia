"use client";

import { useEffect, useId, useState } from "react";

import type {
  ReminderPricePolicy,
  ReminderRule,
  ReminderSettings,
  ReminderSlot,
  SettingsState,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Skeleton } from "@/shared/ui/States";
import { showToast } from "@/shared/ui/toastBus";

import {
  type ReminderPreviewService,
  reminderPreviewText,
} from "./reminderPreview";

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
 * Tela de Lembretes em Configurações → Agenda (Goal021/WU-010, G-27; AG2 no
 * Goal125): lê e grava `/v1/settings/reminders`. Só humano configura — a IA
 * nunca cria ou altera lembrete, no mesmo padrão de disponibilidade e oferta
 * (Goal009). `rules` nasce sempre com no máximo dois itens (FIRST/SECOND) pela
 * forma do estado, não por validação extra; `rules: []` é a escolha explícita
 * de desligar os lembretes. A prévia mostra a mensagem real que a cliente
 * recebe, a partir do que está marcado na tela antes de salvar.
 */
export function ReminderSettingsSection({
  settings: businessSettings,
}: {
  settings: SettingsState;
}) {
  const confirmationDescriptionId = useId();
  const priceLabelId = useId();
  const previewLabelId = useId();
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [services, setServices] = useState<ReminderPreviewService[]>([]);
  const [error, setError] = useState(false);
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [confirmationEnabled, setConfirmationEnabled] = useState(false);
  const [pricePolicy, setPricePolicy] = useState<ReminderPricePolicy>("NEVER");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    const controller = new AbortController();
    const catalog = getProductServices()
      .serviceCatalog.list(controller.signal)
      .then((list) => list.items)
      .catch((): ReminderPreviewService[] => []);
    Promise.all([
      getProductServices().settings.getReminders(controller.signal),
      catalog,
    ])
      .then(([state, items]) => {
        setServices(items);
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
      showToast("Lembretes salvos.");
    } catch {
      setMessage("Não foi possível salvar os lembretes.");
    } finally {
      setBusy(false);
    }
  }

  const preview = reminderPreviewText({
    confirmationEnabled,
    now,
    pricePolicy,
    services,
    timeZone: businessSettings.business?.timezone ?? "America/Sao_Paulo",
    tone: businessSettings.ai.tone,
  });

  return (
    <div className="rules-screen reminders-screen">
      <div className="rules-fields reminders-fields">
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
            className="reminders-add"
            type="button"
            onClick={() => setRule("FIRST", DEFAULT_LEAD_MINUTES)}
          >
            <Icon name="plus" />
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
            className="reminders-add"
            type="button"
            onClick={() => setRule("SECOND", DEFAULT_SECOND_LEAD_MINUTES)}
          >
            <Icon name="plus" />
            Adicionar segundo lembrete
          </button>
        )}
        <label
          className={`reminders-confirm${confirmationEnabled ? " is-checked" : ""}`}
        >
          <input
            aria-describedby={confirmationDescriptionId}
            aria-label="Pedir confirmação de presença"
            checked={confirmationEnabled}
            className="reminders-confirm-input"
            type="checkbox"
            onChange={(event) => setConfirmationEnabled(event.target.checked)}
          />
          <span aria-hidden="true" className="reminders-confirm-box">
            {confirmationEnabled && <Icon name="check" />}
          </span>
          <span className="reminders-confirm-text">
            <strong>Pedir confirmação de presença</strong>
            <small id={confirmationDescriptionId}>
              Se a cliente disser que não vem, a IA pergunta se quer cancelar ou
              remarcar. Sem resposta, o horário continua valendo.
            </small>
          </span>
        </label>
        <div
          aria-labelledby={priceLabelId}
          className="reminders-group"
          role="group"
        >
          <span className="rules-label" id={priceLabelId}>
            Mostrar preço no lembrete
          </span>
          <div className="reminders-segmented">
            <button
              aria-pressed={pricePolicy === "NEVER"}
              className={`reminders-segment${pricePolicy === "NEVER" ? " is-active" : ""}`}
              type="button"
              onClick={() => setPricePolicy("NEVER")}
            >
              Nunca
            </button>
            <button
              aria-pressed={pricePolicy === "WHEN_FIXED"}
              className={`reminders-segment is-wide${pricePolicy === "WHEN_FIXED" ? " is-active" : ""}`}
              type="button"
              onClick={() => setPricePolicy("WHEN_FIXED")}
            >
              Só quando for fixo
            </button>
          </div>
        </div>
        <section aria-labelledby={previewLabelId} className="reminders-preview">
          <span className="reminders-preview-title" id={previewLabelId}>
            Assim chega para a cliente
          </span>
          {rules.length > 0 ? (
            <>
              <div className="reminders-preview-bubble">{preview}</div>
              <span className="reminders-preview-note">
                {pricePolicy === "WHEN_FIXED"
                  ? "Endereço só se ela perguntar. Com o valor quando o serviço tem preço fixo."
                  : "Endereço só se ela perguntar. Sem preço, como configurado."}
              </span>
            </>
          ) : (
            <p className="reminders-preview-empty">
              Nenhum lembrete é enviado.
            </p>
          )}
        </section>
      </div>
      <div className="rules-save">
        <p className="rules-save-note" role="status">
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
  const labelId = useId();
  const [otherOpen, setOtherOpen] = useState(false);
  const other = otherOpen || !LEAD_PRESETS_MINUTES.includes(rule.leadMinutes);
  return (
    <div aria-labelledby={labelId} className="reminders-group" role="group">
      <span className="rules-label" id={labelId}>
        {label}
      </span>
      <div className="reminders-chips">
        {LEAD_PRESETS_MINUTES.map((minutes) => {
          const active = !other && rule.leadMinutes === minutes;
          return (
            <button
              aria-pressed={active}
              className={`reminders-chip${active ? " is-active" : ""}`}
              key={minutes}
              type="button"
              onClick={() => {
                setOtherOpen(false);
                onChange(minutes);
              }}
            >
              {active && <Icon name="check" />}
              {presetLabel(minutes)}
            </button>
          );
        })}
        <button
          aria-pressed={other}
          className={`reminders-chip is-other${other ? " is-active" : ""}`}
          type="button"
          onClick={() => setOtherOpen(true)}
        >
          {other && <Icon name="check" />}
          Outro
        </button>
      </div>
      {other && (
        <label className="reminders-minutes">
          <span className="rules-label">Minutos antes</span>
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
      )}
      <button className="reminders-remove" type="button" onClick={onRemove}>
        {removeLabel}
      </button>
    </div>
  );
}
