"use client";

import { useEffect, useId, useState } from "react";

import type { RetentionDays, RetentionSettings } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { Skeleton } from "@/shared/ui/States";

type RetentionCategory = "commercialRetentionDays" | "personalRetentionDays";

const CATEGORY_LABELS: Record<RetentionCategory, string> = {
  commercialRetentionDays: "Comercial",
  personalRetentionDays: "Pessoal",
};

function retentionLabel(days: RetentionDays): string {
  return days === 365 ? "1 ano" : `${days} dias`;
}

const NOT_AFFECTED = [
  "Clientes e agendamentos",
  "Histórico de atendimentos e valores",
  "Observações e resumo de cada cliente",
];

/**
 * Retenção em Configurações → **Conversas** (Goal023/§8, G-29; R1 no 104):
 * lê e grava `/v1/settings/retention`. Só duas categorias existem — Comercial
 * e Pessoal. Não classificadas não tem seletor porque **U-01** a faz seguir o
 * prazo Comercial: a nota diz isso e que classificar como Pessoal passa a
 * aplicar o prazo Pessoal dali em diante.
 *
 * Escolher só muda o rascunho; um único "Salvar" grava os dois prazos num
 * `PATCH`. Se algum prazo diminuiu, a confirmação abre antes e o pedido vai
 * com `confirmReduction: true`; até lá, nada é enviado.
 *
 * **As opções vêm da resposta, não daqui.** A allowlist é do servidor: o
 * seletor mostra o que o `GET` declarou aceitar, e um seletor que inventasse a
 * própria lista ofereceria um valor que o `PATCH` recusaria.
 */
export function RetentionSection() {
  const [settings, setSettings] = useState<RetentionSettings | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<
    Partial<Record<RetentionCategory, RetentionDays>>
  >({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .retention.get(controller.signal)
      .then(setSettings)
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      });
    return () => controller.abort();
  }, []);

  if (!settings && !error) {
    return (
      <section aria-busy="true" className="settings-panel">
        <Skeleton style={{ width: "40%", height: 20 }} />
        <Skeleton style={{ width: "100%", height: 56 }} />
      </section>
    );
  }
  if (error || !settings) {
    return (
      <section className="settings-panel">
        <div className="settings-panel-header">
          <div>
            <h2>Conversas</h2>
            <p>Não foi possível carregar o prazo de retenção agora.</p>
          </div>
        </div>
      </section>
    );
  }

  const saved = settings;
  const commercial = draft.commercialRetentionDays ?? saved.commercialRetentionDays;
  const personal = draft.personalRetentionDays ?? saved.personalRetentionDays;
  const dirty =
    commercial !== saved.commercialRetentionDays ||
    personal !== saved.personalRetentionDays;
  const reductions = (
    [
      ["commercialRetentionDays", commercial],
      ["personalRetentionDays", personal],
    ] as const
  ).filter(([category, days]) => days < saved[category]);

  async function persist(confirmReduction: boolean) {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const updated = await getProductServices().retention.update({
        commercialRetentionDays: commercial,
        personalRetentionDays: personal,
        ...(confirmReduction ? { confirmReduction: true } : {}),
      });
      setSettings(updated);
      setDraft({});
      setConfirming(false);
      setMessage("Prazo de retenção salvo.");
    } catch {
      setConfirming(false);
      setFailed(true);
      setMessage("Não foi possível salvar o prazo de retenção.");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!dirty || busy) return;
    if (reductions.length > 0) {
      setConfirming(true);
      return;
    }
    void persist(false);
  }

  const reducesCommercial = reductions.some(
    ([category]) => category === "commercialRetentionDays",
  );
  const reductionTitle =
    reductions.length === 1
      ? `Reduzir retenção ${CATEGORY_LABELS[reductions[0][0]]}?`
      : "Reduzir os prazos de retenção?";

  return (
    <div className="rules-screen retention-screen">
      <div className="rules-fields retention-fields">
        <div className="retention-intro">
          <h2>Por quanto tempo guardar as mensagens</h2>
          <p>
            Depois do prazo, as mensagens são removidas. A conversa continua na
            lista, indicando que as antigas expiraram.
          </p>
        </div>
        <RetentionGroup
          busy={busy}
          hint="com clientes"
          label="Conversas comerciais"
          options={saved.retentionDaysOptions}
          value={commercial}
          onChange={(days) =>
            setDraft((current) => ({ ...current, commercialRetentionDays: days }))
          }
        />
        <RetentionGroup
          busy={busy}
          hint="aba Pessoal"
          label="Conversas pessoais"
          options={saved.retentionDaysOptions}
          value={personal}
          onChange={(days) =>
            setDraft((current) => ({ ...current, personalRetentionDays: days }))
          }
        />
        <section aria-label="O que não é afetado" className="retention-unaffected">
          <span className="retention-unaffected-title">O que não é afetado</span>
          <ul>
            {NOT_AFFECTED.map((item) => (
              <li key={item}>
                <Icon name="check" />
                {item}
              </li>
            ))}
          </ul>
        </section>
        <p className="retention-note">
          <Icon name="info" />
          <span>
            Conversas Não classificadas seguem o prazo Comercial. Ao classificar
            uma conversa como Pessoal, o prazo Pessoal passa a valer para ela
            daí em diante.
          </span>
        </p>
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
          disabled={!dirty || busy}
          type="button"
          onClick={save}
        >
          {busy && !confirming ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <Dialog
        eyebrow="Redução de prazo"
        onClose={() => setConfirming(false)}
        open={confirming}
        title={reductionTitle}
      >
        <p className="settings-modal-copy">
          {reducesCommercial
            ? "Mensagens Comerciais e Não classificadas mais antigas que o novo prazo poderão ser removidas na próxima varredura. "
            : "Mensagens mais antigas que o novo prazo poderão ser removidas na próxima varredura. "}
          {reducesCommercial && reductions.length > 1
            ? "O mesmo vale para as Pessoais. "
            : ""}
          Não há como recuperá-las depois.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            type="button"
            onClick={() => setConfirming(false)}
          >
            Manter prazo atual
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            type="button"
            onClick={() => void persist(true)}
          >
            {busy ? "Salvando..." : "Reduzir prazo"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function RetentionGroup({
  busy,
  hint,
  label,
  onChange,
  options,
  value,
}: {
  busy: boolean;
  hint: string;
  label: string;
  onChange: (days: RetentionDays) => void;
  options: readonly RetentionDays[];
  value: RetentionDays;
}) {
  const name = useId();
  const labelId = `${name}-label`;
  return (
    <div className="retention-group">
      <div className="retention-group-head">
        <span className="retention-group-label" id={labelId}>
          {label}
        </span>
        <span className="retention-group-hint">{hint}</span>
      </div>
      <div
        aria-labelledby={labelId}
        className="retention-segments"
        role="radiogroup"
      >
        {options.map((days) => {
          const selected = value === days;
          return (
            <label
              className={`retention-segment${selected ? " is-selected" : ""}`}
              key={days}
            >
              <input
                checked={selected}
                className="retention-segment-input"
                disabled={busy}
                name={name}
                type="radio"
                value={days}
                onChange={() => onChange(days)}
              />
              {retentionLabel(days)}
            </label>
          );
        })}
      </div>
    </div>
  );
}
