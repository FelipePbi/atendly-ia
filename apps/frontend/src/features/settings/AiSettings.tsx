"use client";

import { useState } from "react";

import type { AiTone, SettingsState } from "@/data";
import { KnowledgeSection } from "@/features/knowledge/KnowledgeSection";
import { OtherInfoSection } from "@/features/knowledge/OtherInfoSection";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

import { SaveActions, ToneChoice } from "./shared/fields";
import { SettingsPage } from "./shared/SettingsPage";

export function AiSettings({
  settings,
  onSaved,
}: {
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  const [enabled, setEnabled] = useState(settings.ai.enabled);
  const [tone, setTone] = useState<AiTone>(settings.ai.tone ?? "BALANCED");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pauseConfirmationOpen, setPauseConfirmationOpen] = useState(false);
  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await getProductServices().settings.updateAi({ enabled, tone }));
      setMessage("Configuração da IA salva.");
    } catch {
      setMessage("Não foi possível salvar a configuração.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsPage
      title="Atendente virtual"
      description="Ative o atendimento automático e escolha um dos três estilos disponíveis."
    >
      <div className="settings-stack">
        <section className="settings-panel">
          <label className="switch-row">
            <span>
              <strong>Atendimento automático</strong>
              <small>A IA atua somente com dados e tools autorizadas.</small>
            </span>
            <input
              checked={enabled}
              type="checkbox"
              onChange={(event) => {
                if (event.target.checked) setEnabled(true);
                else setPauseConfirmationOpen(true);
              }}
            />
          </label>
          <div className="settings-choice-grid">
            <ToneChoice
              checked={tone === "PROFESSIONAL"}
              label="Profissional"
              onChange={() => setTone("PROFESSIONAL")}
            />
            <ToneChoice
              checked={tone === "BALANCED"}
              label="Equilibrada"
              onChange={() => setTone("BALANCED")}
            />
            <ToneChoice
              checked={tone === "CASUAL"}
              label="Descontraída"
              onChange={() => setTone("CASUAL")}
            />
          </div>
          <SaveActions
            busy={busy}
            message={message}
            onClick={() => void save()}
          />
        </section>
        <KnowledgeSection />
        <OtherInfoSection />
      </div>
      <Dialog
        eyebrow="Impacto operacional"
        onClose={() => setPauseConfirmationOpen(false)}
        open={pauseConfirmationOpen}
        title="Pausar atendimento automático?"
      >
        <p className="settings-modal-copy">
          A Atendly deixará de responder novas mensagens. Conversas em
          atendimento humano continuam disponíveis.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setPauseConfirmationOpen(false)}
          >
            Manter atendimento ativo
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              setEnabled(false);
              setPauseConfirmationOpen(false);
            }}
          >
            Pausar atendimento
          </button>
        </div>
      </Dialog>
    </SettingsPage>
  );
}
