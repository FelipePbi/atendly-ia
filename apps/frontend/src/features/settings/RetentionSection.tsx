"use client";

import { useEffect, useState } from "react";

import type { RetentionDays, RetentionSettings } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { Skeleton } from "@/shared/ui/States";

type RetentionCategory = "commercialRetentionDays" | "personalRetentionDays";

interface PendingReduction {
  category: RetentionCategory;
  categoryLabel: string;
  days: RetentionDays;
}

function retentionLabel(days: RetentionDays): string {
  return `${days} dias`;
}

/**
 * Bloco de retenção em Configurações → **Conversas** (Goal023/§8, G-29): lê e
 * grava `/v1/settings/retention`. Só duas categorias existem — Comercial e
 * Pessoal — no mesmo padrão do WU-01; Não classificadas não tem seletor
 * porque **U-01** a faz seguir o prazo Comercial: a nota ao lado diz isso e
 * que classificar como Pessoal passa a aplicar o prazo Pessoal dali em diante.
 *
 * Reduzir qualquer categoria exige confirmação explícita antes do PATCH; até
 * a confirmação, o seletor continua mostrando o valor salvo. O diálogo da
 * Comercial avisa que a redução vale também para Não classificadas.
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
  const [pendingReduction, setPendingReduction] =
    useState<PendingReduction | null>(null);

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

  async function persist(patch: {
    commercialRetentionDays?: RetentionDays;
    personalRetentionDays?: RetentionDays;
    confirmReduction?: boolean;
  }) {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await getProductServices().retention.update(patch);
      setSettings(saved);
      setPendingReduction(null);
      setMessage("Prazo de retenção salvo.");
    } catch {
      setMessage("Não foi possível salvar o prazo de retenção.");
    } finally {
      setBusy(false);
    }
  }

  function choose(
    category: RetentionCategory,
    categoryLabel: string,
    days: RetentionDays,
  ) {
    if (!settings || settings[category] === days) return;
    if (days < settings[category]) {
      setPendingReduction({ category, categoryLabel, days });
      return;
    }
    void persist({ [category]: days });
  }

  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <div>
          <h2>Conversas</h2>
          <p>
            Prazo de retenção do conteúdo das mensagens, separado por
            Comercial e Pessoal.
          </p>
        </div>
      </div>
      <div className="settings-stack">
        <RetentionField
          busy={busy}
          label="Comercial"
          options={settings.retentionDaysOptions}
          value={settings.commercialRetentionDays}
          onChange={(days) => choose("commercialRetentionDays", "Comercial", days)}
        />
        <RetentionField
          busy={busy}
          label="Pessoal"
          options={settings.retentionDaysOptions}
          value={settings.personalRetentionDays}
          onChange={(days) => choose("personalRetentionDays", "Pessoal", days)}
        />
        <div className="onboarding-note">
          <Icon name="info" />
          <span>
            Conversas Não classificadas seguem o prazo Comercial. Ao classificar
            uma conversa como Pessoal, o prazo Pessoal passa a valer para ela
            daí em diante.
          </span>
        </div>
      </div>
      <span className="settings-save-note" role="status">
        {message}
      </span>
      <Dialog
        eyebrow="Redução de prazo"
        onClose={() => setPendingReduction(null)}
        open={pendingReduction !== null}
        title={`Reduzir retenção ${pendingReduction?.categoryLabel ?? ""}?`}
      >
        <p className="settings-modal-copy">
          {pendingReduction?.category === "commercialRetentionDays"
            ? "Mensagens Comerciais e Não classificadas mais antigas que o novo prazo poderão ser removidas na próxima varredura. Não há como recuperá-las depois."
            : "Mensagens mais antigas que o novo prazo poderão ser removidas na próxima varredura. Não há como recuperá-las depois."}
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            type="button"
            onClick={() => setPendingReduction(null)}
          >
            Manter prazo atual
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            type="button"
            onClick={() =>
              pendingReduction &&
              void persist({
                [pendingReduction.category]: pendingReduction.days,
                confirmReduction: true,
              })
            }
          >
            {busy ? "Salvando..." : "Reduzir prazo"}
          </button>
        </div>
      </Dialog>
    </section>
  );
}

function RetentionField({
  busy,
  label,
  onChange,
  options,
  value,
}: {
  busy: boolean;
  label: string;
  onChange: (days: RetentionDays) => void;
  options: readonly RetentionDays[];
  value: RetentionDays;
}) {
  return (
    <div className="field is-wide">
      <span className="label">{label}</span>
      <div className="chip-row">
        {options.map((days) => (
          <button
            aria-label={`${label}: ${retentionLabel(days)}`}
            aria-pressed={value === days}
            className={`chip${value === days ? " is-active" : ""}`}
            disabled={busy}
            key={days}
            type="button"
            onClick={() => onChange(days)}
          >
            {retentionLabel(days)}
          </button>
        ))}
      </div>
    </div>
  );
}
