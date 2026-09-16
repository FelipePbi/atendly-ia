"use client";

import { type FormEvent, useState } from "react";

import type { BusinessModality, SettingsState } from "@/data";
import {
  BUSINESS_MODALITY_OPTIONS,
  FREQUENT_BUSINESS_SEGMENTS,
} from "@/features/onboarding/blocks/business";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices, useProductRuntime } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

import { SaveActions } from "./shared/fields";
import { SettingsPage } from "./shared/SettingsPage";

export function BusinessSettings({
  settings,
  onSaved,
}: {
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  const { refreshSession } = useProductRuntime();
  const [name, setName] = useState(settings.business?.name ?? "");
  const [category, setCategory] = useState(settings.business?.category ?? "");
  const [customSegment, setCustomSegment] = useState(
    () =>
      !!settings.business?.category &&
      !FREQUENT_BUSINESS_SEGMENTS.includes(settings.business.category),
  );
  const [modalities, setModalities] = useState<BusinessModality[]>(
    settings.business?.modalities ?? [],
  );
  const [address, setAddress] = useState(settings.business?.address ?? "");
  const [timezone, setTimezone] = useState(
    settings.business?.timezone ?? "America/Sao_Paulo",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [timezoneConfirmationOpen, setTimezoneConfirmationOpen] =
    useState(false);
  const requiresAddress = modalities.includes("ON_SITE");
  const pendingProjection =
    settings.business?.contextProjectionStatus === "PENDING";
  async function save(event: FormEvent) {
    event.preventDefault();
    if (modalities.length === 0) {
      setMessage("Escolha ao menos uma modalidade de atendimento.");
      return;
    }
    if (requiresAddress && !address.trim()) {
      setMessage("Informe o endereço do seu espaço.");
      return;
    }
    if (timezone !== settings.business?.timezone) {
      setTimezoneConfirmationOpen(true);
      return;
    }
    await persist();
  }
  async function persist() {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(
        await getProductServices().settings.updateBusiness({
          ...(requiresAddress ? { address: address.trim() } : {}),
          category,
          modalities,
          name,
          timezone,
        }),
      );
      await refreshSession();
      setTimezoneConfirmationOpen(false);
      setMessage("Dados do negócio salvos.");
    } catch {
      setMessage("Não foi possível salvar os dados.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsPage
      title="Negócio"
      description="Dados usados para identificar sua operação."
    >
      <form className="settings-panel" onSubmit={(event) => void save(event)}>
        <div className="settings-form-grid">
          <label className="field">
            <span className="label">Nome do negócio</span>
            <input
              className="input"
              minLength={2}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="field is-wide">
            <span className="label">Qual é o seu segmento?</span>
            <div className="chip-row">
              {FREQUENT_BUSINESS_SEGMENTS.map((segment) => (
                <button
                  className={`chip${!customSegment && category === segment ? " is-active" : ""}`}
                  key={segment}
                  type="button"
                  onClick={() => {
                    setCustomSegment(false);
                    setCategory(segment);
                  }}
                >
                  {segment}
                </button>
              ))}
              <button
                className={`chip${customSegment ? " is-active" : ""}`}
                type="button"
                onClick={() => {
                  setCustomSegment(true);
                  setCategory("");
                }}
              >
                Outro
              </button>
            </div>
            {customSegment && (
              <input
                className="input"
                required
                placeholder="Qual é o seu segmento?"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            )}
          </div>
          <label className="field">
            <span className="label">Idioma</span>
            <span className="input-wrap">
              <select className="select" disabled value="pt-BR">
                <option value="pt-BR">Português (Brasil)</option>
              </select>
              <span className="select-icon">
                <Icon name="chevron-down" />
              </span>
            </span>
          </label>
          <label className="field">
            <span className="label">Moeda</span>
            <span className="input-wrap">
              <select className="select" disabled value="BRL">
                <option value="BRL">Real brasileiro (BRL)</option>
              </select>
              <span className="select-icon">
                <Icon name="chevron-down" />
              </span>
            </span>
          </label>
          <label className="field is-wide">
            <span className="label">Fuso horário</span>
            <span className="input-wrap">
              <select
                className="select"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                <option value="America/Sao_Paulo">Brasília (GMT−3)</option>
                <option value="America/Manaus">Manaus (GMT−4)</option>
                <option value="America/Rio_Branco">Rio Branco (GMT−5)</option>
              </select>
              <span className="select-icon">
                <Icon name="chevron-down" />
              </span>
            </span>
            <span className="field-help">
              A mudança exige revisão porque altera horários futuros.
            </span>
          </label>
          <div className="field is-wide">
            <span className="label">Modalidade de atendimento</span>
            <div className="choice-grid">
              {BUSINESS_MODALITY_OPTIONS.map((option) => {
                const selected = modalities.includes(option.value);
                return (
                  <label
                    className={`choice-card${selected ? " is-selected" : ""}`}
                    key={option.value}
                  >
                    <input
                      checked={selected}
                      className="sr-only"
                      type="checkbox"
                      onChange={(event) =>
                        setModalities((current) =>
                          event.target.checked
                            ? [...current, option.value]
                            : current.filter((item) => item !== option.value),
                        )
                      }
                    />
                    <h3>{option.title}</h3>
                    <p>{option.copy}</p>
                  </label>
                );
              })}
            </div>
          </div>
          {requiresAddress && (
            <label className="field is-wide">
              <span className="label">Endereço do seu espaço</span>
              <input
                className="input"
                maxLength={300}
                required
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>
          )}
        </div>
        {pendingProjection && (
          <div className="onboarding-note is-important">
            <Icon name="info" />
            <span>
              Os dados do negócio foram salvos. A IA ainda está atualizando o
              contexto com essa mudança.
            </span>
          </div>
        )}
        <SaveActions busy={busy} message={message} />
      </form>
      <Dialog
        eyebrow="Revisão necessária"
        onClose={() => setTimezoneConfirmationOpen(false)}
        open={timezoneConfirmationOpen}
        title="Alterar fuso horário?"
      >
        <p className="settings-modal-copy">
          Horários futuros passarão a usar o novo fuso. Revise disponibilidade,
          bloqueios e próximos atendimentos depois da mudança.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            type="button"
            onClick={() => setTimezoneConfirmationOpen(false)}
          >
            Manter fuso atual
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            type="button"
            onClick={() => void persist()}
          >
            {busy ? "Salvando..." : "Alterar fuso"}
          </button>
        </div>
      </Dialog>
    </SettingsPage>
  );
}
