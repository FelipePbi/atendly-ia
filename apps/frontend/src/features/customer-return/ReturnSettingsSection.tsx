"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";

import {
  type AiMessageDelivery,
  type AiTone,
  RETURN_DAILY_LIMIT_MAX,
  RETURN_INCENTIVE_MAX_LENGTH,
  RETURN_WINBACK_DAY_OPTIONS,
  type ReturnKind,
  type ReturnSettings,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { TimeField } from "@/shared/ui/pickers/PickerFields";
import { Skeleton } from "@/shared/ui/States";
import { showToast } from "@/shared/ui/toastBus";

import { windowLabel } from "./returnCopy";
import { ReturnMessageEditor } from "./ReturnMessageEditor";

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];
const LEAD_OPTIONS = [1, 2, 3, 4, 5];

/**
 * Configuração do retorno de clientes (D-206): o ritmo das rodadas (quantas
 * mensagens por dia, em que dias e horários), o prazo da Renovação, quantos
 * dias contam como "sumida" no Resgate, o incentivo e o texto-base de cada
 * rotina. Vale para as próximas rodadas: a que já está correndo guarda as
 * regras do dia em que foi aprovada.
 */
export function ReturnSettingsSection({
  delivery = "PARTS",
  tone,
}: {
  /** Como a IA envia (D-208): o texto-base inicial e o aviso do editor. */
  delivery?: AiMessageDelivery;
  tone: AiTone;
}) {
  const limitId = useId();
  const windowLabelId = useId();
  const startId = useId();
  const endId = useId();
  const leadLabelId = useId();
  const winbackLabelId = useId();
  const otherDaysId = useId();
  const incentiveId = useId();
  const [settings, setSettings] = useState<ReturnSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [windowDays, setWindowDays] = useState<number[]>([]);
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("19:00");
  const [leadDays, setLeadDays] = useState(2);
  const [winbackDays, setWinbackDays] = useState(60);
  const [otherDays, setOtherDays] = useState(false);
  const [incentive, setIncentive] = useState("");
  const [editing, setEditing] = useState<ReturnKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const closeEditor = useCallback(() => setEditing(null), []);

  function apply(value: ReturnSettings) {
    setSettings(value);
    setDailyLimit(value.dailyLimit);
    setWindowDays(value.windowDays);
    setWindowStart(value.windowStart);
    setWindowEnd(value.windowEnd === "24:00" ? "23:59" : value.windowEnd);
    setLeadDays(value.leadDays);
    setWinbackDays(value.winbackDays);
    setOtherDays(
      !(RETURN_WINBACK_DAY_OPTIONS as readonly number[]).includes(
        value.winbackDays,
      ),
    );
    setIncentive(value.winbackIncentive ?? "");
  }

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .customerReturn.settings(controller.signal)
      .then(apply)
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
      });
    return () => controller.abort();
  }, []);

  if (!settings && !failed) {
    return (
      <section className="settings-panel" aria-busy="true">
        <Skeleton style={{ width: "40%", height: 20 }} />
        <Skeleton style={{ width: "100%", height: 56 }} />
      </section>
    );
  }
  if (!settings) {
    return (
      <p className="settings-error" role="alert">
        Não foi possível carregar o retorno de clientes. Tente de novo em
        instantes.
      </p>
    );
  }

  const invalidWindow = windowDays.length === 0 || windowEnd <= windowStart;
  const invalidDays =
    !Number.isInteger(winbackDays) || winbackDays < 14 || winbackDays > 365;

  async function save() {
    if (invalidWindow) {
      setMessage(
        "Escolha ao menos um dia e um horário que termina depois de começar.",
      );
      return;
    }
    if (invalidDays) {
      setMessage("O Resgate conta de 14 a 365 dias sem vir.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const saved = await getProductServices().customerReturn.updateSettings({
        dailyLimit,
        windowDays,
        windowStart,
        windowEnd,
        leadDays,
        winbackDays,
        winbackIncentive: incentive.trim() || null,
      });
      apply(saved);
      setMessage("Retorno de clientes salvo.");
      showToast("Retorno de clientes salvo.");
    } catch {
      setMessage("Não foi possível salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rules-screen return-settings">
      <div className="rules-fields">
        <p className="return-settings-intro">
          O ritmo e as mensagens das rodadas de retorno. Quem recebe você
          escolhe e aprova em{" "}
          <Link className="return-inline-link" href="/clientes/retorno">
            Clientes › Chamar clientes de volta
          </Link>
          .
        </p>
        <div className="reminders-group">
          <label className="rules-label" htmlFor={limitId}>
            Mensagens por dia
          </label>
          <div className="return-stepper">
            <button
              aria-label="Uma mensagem a menos por dia"
              className="return-stepper-button"
              disabled={dailyLimit <= 1}
              onClick={() => setDailyLimit((value) => Math.max(1, value - 1))}
              type="button"
            >
              −
            </button>
            <input
              className="input return-stepper-input"
              id={limitId}
              inputMode="numeric"
              max={RETURN_DAILY_LIMIT_MAX}
              min={1}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) {
                  setDailyLimit(
                    Math.min(
                      RETURN_DAILY_LIMIT_MAX,
                      Math.max(1, Math.round(value)),
                    ),
                  );
                }
              }}
              type="number"
              value={dailyLimit}
            />
            <button
              aria-label="Uma mensagem a mais por dia"
              className="return-stepper-button"
              disabled={dailyLimit >= RETURN_DAILY_LIMIT_MAX}
              onClick={() =>
                setDailyLimit((value) =>
                  Math.min(RETURN_DAILY_LIMIT_MAX, value + 1),
                )
              }
              type="button"
            >
              +
            </button>
          </div>
          <small className="return-settings-help">
            Até {RETURN_DAILY_LIMIT_MAX}. Um limite baixo protege seu número:
            muitas mensagens iniciadas por você num dia só é o que mais leva o
            WhatsApp a bloquear. Entre uma e outra, a Avenly espera de 3 a 10
            minutos.
          </small>
        </div>

        <div
          aria-labelledby={windowLabelId}
          className="reminders-group"
          role="group"
        >
          <span className="rules-label" id={windowLabelId}>
            Quando as mensagens saem
          </span>
          <div aria-label="Dias de envio" className="day-pill-row" role="group">
            {WEEK_ORDER.map((day) => (
              <label
                className={`day-pill${windowDays.includes(day) ? " is-selected" : ""}`}
                key={day}
              >
                <input
                  checked={windowDays.includes(day)}
                  className="sr-only"
                  onChange={(event) =>
                    setWindowDays((current) =>
                      event.target.checked
                        ? [...current, day].sort((a, b) => a - b)
                        : current.filter((item) => item !== day),
                    )
                  }
                  type="checkbox"
                />
                <span aria-hidden="true">{WEEKDAY_SHORT[day]}</span>
                <span className="sr-only">{WEEKDAY_NAMES[day]}</span>
              </label>
            ))}
          </div>
          <div className="choice-grid">
            <div className="field">
              <label className="label" htmlFor={startId}>
                Das
              </label>
              <TimeField
                className="input time-input"
                id={startId}
                onValueChange={setWindowStart}
                value={windowStart}
              />
            </div>
            <div className={`field${invalidWindow ? " field-error" : ""}`}>
              <label className="label" htmlFor={endId}>
                Até
              </label>
              <TimeField
                aria-invalid={invalidWindow || undefined}
                className="input time-input"
                id={endId}
                onValueChange={setWindowEnd}
                value={windowEnd}
              />
            </div>
          </div>
          {!invalidWindow && (
            <small className="return-settings-help">
              Saem {windowLabel(windowDays, windowStart, windowEnd)}, no fuso do
              seu negócio.
            </small>
          )}
        </div>

        <div
          aria-labelledby={leadLabelId}
          className="reminders-group"
          role="group"
        >
          <span className="rules-label" id={leadLabelId}>
            Renovação: quantos dias antes da data
          </span>
          <div className="reminders-chips">
            {LEAD_OPTIONS.map((value) => (
              <button
                aria-pressed={leadDays === value}
                className={`reminders-chip${leadDays === value ? " is-active" : ""}`}
                key={value}
                onClick={() => setLeadDays(value)}
                type="button"
              >
                {leadDays === value && <Icon name="check" />}
                {value === 1 ? "1 dia" : `${value} dias`}
              </button>
            ))}
          </div>
          <small className="return-settings-help">
            A mensagem sai até essa antecedência da data esperada de volta.
            Ninguém recebe no próprio dia.
          </small>
        </div>

        <div
          aria-labelledby={winbackLabelId}
          className="reminders-group"
          role="group"
        >
          <span className="rules-label" id={winbackLabelId}>
            Resgate: sem vir há
          </span>
          <div className="reminders-chips">
            {RETURN_WINBACK_DAY_OPTIONS.map((value) => {
              const active = !otherDays && winbackDays === value;
              return (
                <button
                  aria-pressed={active}
                  className={`reminders-chip${active ? " is-active" : ""}`}
                  key={value}
                  onClick={() => {
                    setOtherDays(false);
                    setWinbackDays(value);
                  }}
                  type="button"
                >
                  {active && <Icon name="check" />}
                  {value} dias
                </button>
              );
            })}
            <button
              aria-pressed={otherDays}
              className={`reminders-chip is-other${otherDays ? " is-active" : ""}`}
              onClick={() => setOtherDays(true)}
              type="button"
            >
              {otherDays && <Icon name="check" />}
              Outro
            </button>
          </div>
          {otherDays && (
            <div className={`field${invalidDays ? " field-error" : ""}`}>
              <label className="label" htmlFor={otherDaysId}>
                Dias sem vir
              </label>
              <input
                aria-invalid={invalidDays || undefined}
                className="input"
                id={otherDaysId}
                inputMode="numeric"
                max={365}
                min={14}
                onChange={(event) => setWinbackDays(Number(event.target.value))}
                type="number"
                value={Number.isFinite(winbackDays) ? winbackDays : ""}
              />
            </div>
          )}
        </div>

        <div className="reminders-group">
          <label className="rules-label" htmlFor={incentiveId}>
            Incentivo do Resgate
          </label>
          <input
            className="input"
            id={incentiveId}
            maxLength={RETURN_INCENTIVE_MAX_LENGTH}
            onChange={(event) => setIncentive(event.target.value)}
            placeholder="Ex.: hidratação de brinde na volta"
            value={incentive}
          />
          <small className="return-settings-help">
            Opcional. A IA usa este texto na mensagem e na conversa, sem
            inventar outro benefício.
          </small>
        </div>

        <div className="reminders-group">
          <span className="rules-label">Mensagens</span>
          <div className="return-settings-messages">
            <button
              className="btn btn-secondary"
              onClick={() => setEditing("RENEWAL")}
              type="button"
            >
              Mensagem da Renovação
              {settings.renewalMessage ? " · personalizada" : ""}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setEditing("WINBACK")}
              type="button"
            >
              Mensagem do Resgate
              {settings.winbackMessage ? " · personalizada" : ""}
            </button>
          </div>
        </div>
      </div>
      <div className="rules-save">
        <p className="rules-save-note" role="status">
          {message}
        </p>
        <button
          className="rules-save-button"
          disabled={busy}
          onClick={() => void save()}
          type="button"
        >
          {busy ? "Salvando..." : "Salvar"}
        </button>
      </div>
      {editing && (
        <ReturnMessageEditor
          kind={editing}
          onClose={closeEditor}
          onSaved={(saved) => {
            apply(saved);
            setEditing(null);
          }}
          open
          delivery={delivery}
          settings={settings}
          tone={tone}
        />
      )}
    </div>
  );
}
