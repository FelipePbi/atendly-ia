"use client";

import { type FormEvent, useState } from "react";

import { type Appointment, type AppointmentLifecycle } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import { formatMoney } from "./AppointmentFlowShell";
import { requestError, statusLabel } from "./occupancy";

type Busy = "complete" | "confirm-presence" | "final-value" | "no-show" | null;

/**
 * `SCHEDULED` é o legado pré-Goal008: para decidir transição, ele é lido
 * como `CONFIRMED`, do mesmo jeito que `appointmentStatusLabel` já lê.
 */
function normalizedStatus(status: string): string {
  const upper = status.toUpperCase();
  return upper === "SCHEDULED" ? "CONFIRMED" : upper;
}

/**
 * Estado, presença e valor final são eixos independentes (Goal008): concluir
 * não confirma presença, confirmar presença não fecha valor, e nenhum dos
 * três infere o outro. Cada linha aqui representa um eixo — nunca uma ação
 * genérica de "editar agendamento".
 */
export function LifecycleActions({
  appointment,
  onUpdated,
}: {
  appointment: Appointment;
  onUpdated: (lifecycle: AppointmentLifecycle) => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [noShowNote, setNoShowNote] = useState("");
  const [finalValueOpen, setFinalValueOpen] = useState(false);
  const [finalValueInput, setFinalValueInput] = useState("");

  const status = normalizedStatus(appointment.status);
  const canComplete = status === "CONFIRMED";
  const canMarkNoShow = status === "CONFIRMED" || status === "COMPLETED";
  const canConfirmPresence =
    status !== "CANCELLED" && !appointment.presenceConfirmedAt;
  const canSetFinalValue = status !== "CANCELLED";

  async function complete() {
    setBusy("complete");
    setError(null);
    try {
      onUpdated(
        await getProductServices().calendar.completeAppointment(
          appointment.id,
        ),
      );
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível concluir o atendimento."),
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitNoShow(event: FormEvent) {
    event.preventDefault();
    setBusy("no-show");
    setError(null);
    try {
      onUpdated(
        await getProductServices().calendar.markAppointmentNoShow(
          appointment.id,
          { note: noShowNote.trim() || undefined },
        ),
      );
      setNoShowOpen(false);
      setNoShowNote("");
    } catch (caught) {
      setError(requestError(caught, "Não foi possível marcar a falta."));
    } finally {
      setBusy(null);
    }
  }

  async function confirmPresence() {
    setBusy("confirm-presence");
    setError(null);
    try {
      onUpdated(
        await getProductServices().calendar.confirmAppointmentPresence(
          appointment.id,
        ),
      );
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível confirmar a presença."),
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitFinalValue(event: FormEvent) {
    event.preventDefault();
    const amount = Number(finalValueInput.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Informe um valor final válido.");
      return;
    }
    setBusy("final-value");
    setError(null);
    try {
      onUpdated(
        await getProductServices().calendar.setAppointmentFinalValue(
          appointment.id,
          { amount },
        ),
      );
      setFinalValueOpen(false);
      setFinalValueInput("");
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível registrar o valor final."),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="agenda-lifecycle">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="agenda-lifecycle-row">
        <div>
          <strong>Estado</strong>
          <span>
            {status === "COMPLETED" && appointment.completionOrigin === "AUTO"
              ? "Concluído automaticamente"
              : statusLabel(appointment.status)}
          </span>
        </div>
        <div className="agenda-lifecycle-actions">
          {canComplete && (
            <Button
              loading={busy === "complete"}
              onClick={() => void complete()}
              type="button"
              variant="secondary"
            >
              Concluir atendimento
            </Button>
          )}
          {canMarkNoShow && (
            <Button
              onClick={() => setNoShowOpen((value) => !value)}
              type="button"
              variant="secondary"
            >
              Marcar falta
            </Button>
          )}
        </div>
      </div>
      {noShowOpen && (
        <form
          className="agenda-lifecycle-form"
          onSubmit={(event) => void submitNoShow(event)}
        >
          <label className="field">
            <span>Observação da falta (opcional)</span>
            <textarea
              onChange={(event) => setNoShowNote(event.target.value)}
              rows={3}
              value={noShowNote}
            />
          </label>
          <div className="agenda-form-footer">
            <Button
              onClick={() => setNoShowOpen(false)}
              type="button"
              variant="secondary"
            >
              Voltar
            </Button>
            <Button loading={busy === "no-show"} type="submit" variant="danger">
              Confirmar falta
            </Button>
          </div>
        </form>
      )}

      <div className="agenda-lifecycle-row">
        <div>
          <strong>Presença</strong>
          <span>
            {appointment.presenceConfirmedAt
              ? "Presença confirmada"
              : "Presença ainda não confirmada"}
          </span>
        </div>
        {canConfirmPresence && (
          <Button
            loading={busy === "confirm-presence"}
            onClick={() => void confirmPresence()}
            type="button"
            variant="secondary"
          >
            Confirmar presença
          </Button>
        )}
      </div>

      <div className="agenda-lifecycle-row">
        <div>
          <strong>Valor final</strong>
          <span>
            {appointment.finalValue === null
              ? "Ainda não registrado"
              : formatMoney(appointment.finalValue)}
          </span>
        </div>
        {canSetFinalValue && (
          <Button
            onClick={() => setFinalValueOpen((value) => !value)}
            type="button"
            variant="secondary"
          >
            Registrar valor final
          </Button>
        )}
      </div>
      {finalValueOpen && (
        <form
          className="agenda-lifecycle-form"
          onSubmit={(event) => void submitFinalValue(event)}
        >
          <label className="field">
            <span>Valor efetivamente cobrado (R$)</span>
            <input
              inputMode="decimal"
              onChange={(event) => setFinalValueInput(event.target.value)}
              required
              value={finalValueInput}
            />
          </label>
          <div className="agenda-form-footer">
            <Button
              onClick={() => setFinalValueOpen(false)}
              type="button"
              variant="secondary"
            >
              Voltar
            </Button>
            <Button loading={busy === "final-value"} type="submit">
              Salvar valor final
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
