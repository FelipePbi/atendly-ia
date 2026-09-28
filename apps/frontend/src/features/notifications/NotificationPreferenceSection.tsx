"use client";

import { useEffect, useId, useState } from "react";

import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Skeleton } from "@/shared/ui/States";

/**
 * Preferência da central (Goal022/WU-03): `aiAppointmentCreated`, único campo
 * do contrato hoje, com default desligado. Vive na central — a Especificação
 * das Telas põe Notificações como destino próprio, e `ProductSettingsScreen`
 * não ganha bloco novo para isto (será redecomposta no 024).
 */
export function NotificationPreferenceSection() {
  const descriptionId = useId();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .notifications.getPreferences(controller.signal)
      .then((preferences) => setEnabled(preferences.aiAppointmentCreated))
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      });
    return () => controller.abort();
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const preferences = await getProductServices().notifications.updatePreferences({
        aiAppointmentCreated: next,
      });
      setEnabled(preferences.aiAppointmentCreated);
      setMessage(
        preferences.aiAppointmentCreated
          ? "Você vai receber notificação quando a IA criar um agendamento."
          : "Notificação de agendamento criado pela IA desligada.",
      );
    } catch {
      setMessage("Não foi possível salvar a preferência.");
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null && !error) {
    return (
      <section aria-busy="true" className="settings-panel">
        <Skeleton style={{ width: "50%", height: 20 }} />
        <Skeleton style={{ width: "100%", height: 44 }} />
      </section>
    );
  }
  if (error || enabled === null) return null;

  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <div>
          <h2>Preferências</h2>
          <p>Escolha o que a central avisa além do que é sempre mostrado.</p>
        </div>
      </div>
      <label className="switch-row">
        <span>
          <strong>Agendamento criado pela IA</strong>
          <small id={descriptionId}>
            Desligada por padrão: avise quando a IA confirmar um horário
            sozinha, sem intervenção sua.
          </small>
        </span>
        <input
          aria-describedby={descriptionId}
          aria-label="Agendamento criado pela IA"
          checked={enabled}
          disabled={busy}
          type="checkbox"
          onChange={(event) => void toggle(event.target.checked)}
        />
      </label>
      <span className="settings-save-note" role="status">
        {message}
      </span>
    </section>
  );
}
