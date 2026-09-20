"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { type Appointment, type CalendarState } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";

import {
  AppointmentFlowShell,
  ReadOnlyState,
  Summary,
  SummaryRow,
} from "./AppointmentFlowShell";
import { newIdempotencyKey } from "./holdSession";
import {
  customerLabel,
  formatAppointmentDate,
  requestError,
  serviceNames,
  statusLabel,
} from "./occupancy";

/**
 * Cancelamento (Goal016): confirmação explícita que diz o efeito real —
 * muda o estado, devolve o horário à agenda e preserva o histórico. O acordo
 * comercial gravado na criação (Goal007) é imutável e não é tocado aqui.
 */
export function CancelFlow({ appointmentId }: { appointmentId?: string }) {
  const router = useRouter();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [comments, setComments] = useState("");
  // Cancelar é sempre uma alteração relevante para o cliente (Goal021):
  // marcado por padrão, e a interface manda o campo sempre explicitamente —
  // nunca se apoia no default do contrato, que é o oposto.
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [loading, setLoading] = useState(Boolean(appointmentId));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    appointmentId ? null : "O agendamento não foi informado.",
  );

  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    Promise.all([
      getProductServices().calendar.getAppointment(
        appointmentId,
        controller.signal,
      ),
      getProductServices().calendar.getCalendar(controller.signal),
    ])
      .then(([appointmentResult, calendarResult]) => {
        setAppointment(appointmentResult);
        setCalendar(calendarResult);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível preparar o cancelamento."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appointmentId]);

  async function cancel() {
    if (!appointment || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getProductServices().calendar.cancelAppointment(
        appointment.id,
        { comments: comments.trim() || undefined, notifyCustomer },
        newIdempotencyKey(),
      );
      router.replace(`/agenda/agendamento?id=${encodeURIComponent(result.id)}`);
    } catch (caught) {
      setError(requestError(caught, "Não foi possível cancelar o agendamento."));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppointmentFlowShell
      calendar={calendar}
      description="O cancelamento preserva o histórico e só é confirmado após persistência real."
      loading={loading}
      title="Cancelar agendamento"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.createAppointments ? (
        <ReadOnlyState operation="cancelar agendamentos" />
      ) : (
        appointment && (
          <div className="agenda-flow-layout">
            <form
              className="agenda-form-card"
              onSubmit={(event) => {
                event.preventDefault();
                setConfirm(true);
              }}
            >
              <h2>{customerLabel(appointment)}</h2>
              <p>
                {formatAppointmentDate(appointment)} ·{" "}
                {serviceNames(appointment)}
              </p>
              <label className="field">
                <span>Motivo ou observação (opcional)</span>
                <textarea
                  rows={4}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                />
              </label>
              <label className="switch-row">
                <span>
                  <strong>Notificar cliente</strong>
                  <small>
                    Cancelamento é uma alteração relevante: recomendamos
                    avisar o cliente.
                  </small>
                </span>
                <input
                  checked={notifyCustomer}
                  type="checkbox"
                  onChange={(event) => setNotifyCustomer(event.target.checked)}
                />
              </label>
              <div className="agenda-form-footer">
                <Button
                  href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
                  variant="secondary"
                >
                  Voltar
                </Button>
                <Button type="submit" variant="danger">
                  Revisar cancelamento
                </Button>
              </div>
            </form>
            <Summary title="O que o cancelamento faz">
              <SummaryRow
                label="Estado atual"
                value={statusLabel(appointment.status)}
              />
              <SummaryRow label="Passa a" value="Cancelado" />
              <SummaryRow
                label="Horário"
                value={`${appointment.startTime}–${appointment.endTime}`}
              />
              <p className="agenda-summary-note">
                O horário volta a ficar livre na agenda, o atendimento continua
                no histórico do cliente e o acordo comercial registrado na
                criação não é alterado.
              </p>
            </Summary>
          </div>
        )
      )}
      <Dialog
        eyebrow="Atenção"
        onClose={() => !busy && setConfirm(false)}
        open={confirm}
        title="Cancelar este agendamento?"
      >
        <p>
          O atendimento passa a Cancelado, o horário volta a ficar livre para
          novos agendamentos e o histórico do atendimento é preservado. Esta
          ação não pode ser desfeita por aqui: seria preciso criar um novo
          agendamento.
        </p>
        <div className="modal-actions">
          <Button
            disabled={busy}
            onClick={() => setConfirm(false)}
            type="button"
            variant="secondary"
          >
            Manter agendamento
          </Button>
          <Button
            loading={busy}
            onClick={() => void cancel()}
            type="button"
            variant="danger"
          >
            Confirmar cancelamento
          </Button>
        </div>
      </Dialog>
    </AppointmentFlowShell>
  );
}
