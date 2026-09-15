"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  type Appointment,
  type AvailabilitySlot,
  type CalendarState,
  type RescheduleAppointmentInput,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";

import {
  AppointmentFlowShell,
  ReadOnlyState,
  Summary,
  SummaryRow,
} from "./AppointmentFlowShell";
import { readOccupancy } from "./AppointmentForm";
import { ConflictPanel, occupyingEntries } from "./ConflictPanel";
import {
  holdLostMessage,
  isHoldLostError,
  isSlotConflictError,
  newIdempotencyKey,
  useHoldSession,
} from "./holdSession";
import {
  type AgendaEntry,
  customerLabel,
  formatAppointmentDate,
  formatDate,
  isoDate,
  requestError,
  serviceNames,
} from "./occupancy";
import { SlotPicker } from "./SlotPicker";

/**
 * Remarcação (Goal016), com as mesmas regras da criação: o hold é do horário
 * **novo** — o antigo continua ocupado pelo próprio atendimento até a
 * remarcação commitar — e sobrepor exige motivo.
 */
export function RescheduleFlow({ appointmentId }: { appointmentId?: string }) {
  const router = useRouter();
  const hold = useHoldSession();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [date, setDate] = useState(isoDate(new Date()));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(Boolean(appointmentId));
  const [startTime, setStartTime] = useState("");
  const [manualTime, setManualTime] = useState("");
  // Remarcar é sempre uma alteração relevante para o cliente (Goal021):
  // marcado por padrão, e a interface manda o campo sempre explicitamente —
  // nunca se apoia no default do contrato, que é o oposto.
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [loading, setLoading] = useState(Boolean(appointmentId));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
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
        setDate(
          appointmentResult.date < isoDate(new Date())
            ? isoDate(new Date())
            : appointmentResult.date,
        );
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível preparar o reagendamento."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appointmentId]);

  useEffect(() => {
    if (!appointment || !calendar?.capabilities.createAppointments || !date)
      return;
    const controller = new AbortController();
    getProductServices()
      .calendar.getAvailability(
        {
          serviceIds: appointment.services.map((service) => service.serviceId),
          startDate: date,
          days: 1,
          maxSlots: 100,
        },
        controller.signal,
      )
      .then((result) => {
        setSlots(result.filter((slot) => slot.date === date));
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(
              caught,
              "Não foi possível consultar os horários disponíveis.",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [appointment, calendar, date]);

  const durationMinutes = appointment?.durationMinutes ?? 0;
  const canSubmit =
    Boolean(appointment) &&
    Boolean(startTime) &&
    !conflict &&
    hold.phase !== "reserving" &&
    hold.phase !== "expired";

  function resetSlotChoice() {
    hold.release();
    setStartTime("");
    setConflict(null);
  }

  async function chooseTime(time: string) {
    if (!appointment || !time || busy) return;
    setError(null);
    setConflict(null);
    setStartTime(time);
    try {
      await hold.reserve({
        customerId: appointment.customerId ?? undefined,
        date,
        serviceIds: appointment.services.map((service) => service.serviceId),
        startTime: time,
      });
    } catch (caught) {
      if (isSlotConflictError(caught)) {
        await openConflict(time);
        return;
      }
      setError(requestError(caught, "Não foi possível reservar o horário."));
    }
  }

  async function openConflict(time: string) {
    setConflict({
      entries: null,
      loading: true,
      reason: "",
      reasonError: null,
      startTime: time,
    });
    const entries = await readOccupancy(date, calendar?.timezone);
    setConflict((current) =>
      current && current.startTime === time
        ? {
            ...current,
            entries:
              entries === null
                ? null
                : occupyingEntries(
                    // O próprio atendimento remarcado não é conflito consigo
                    // mesmo: ele ocupa o horário antigo até a remarcação
                    // commitar, e o contrato já o exclui da revalidação.
                    entries.filter(
                      (entry) => entry.appointment?.id !== appointment?.id,
                    ),
                    { date, durationMinutes, startTime: time },
                  ),
            loading: false,
          }
        : current,
    );
  }

  async function reschedule(overlapReason?: string) {
    if (!appointment || !startTime || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input: RescheduleAppointmentInput = {
        date,
        holdId: hold.holdId ?? undefined,
        notifyCustomer,
        overlapOverride: overlapReason ? true : undefined,
        overlapOverrideReason: overlapReason,
        startTime,
      };
      const result = await getProductServices().calendar.rescheduleAppointment(
        appointment.id,
        input,
        newIdempotencyKey(),
      );
      router.replace(`/agenda/agendamento?id=${encodeURIComponent(result.id)}`);
    } catch (caught) {
      setConfirm(false);
      if (isHoldLostError(caught)) {
        hold.markLost();
        setStartTime("");
        setConflict(null);
        setError(holdLostMessage(caught));
        return;
      }
      if (isSlotConflictError(caught)) {
        hold.release();
        await openConflict(startTime);
        return;
      }
      setError(requestError(caught, "Não foi possível reagendar."));
    } finally {
      setBusy(false);
    }
  }

  function submitOverride() {
    if (!conflict) return;
    const reason = conflict.reason.trim();
    if (!reason) {
      setConflict({
        ...conflict,
        reasonError:
          "Descreva o motivo da sobreposição. Sem motivo, a remarcação não é enviada.",
      });
      return;
    }
    setStartTime(conflict.startTime);
    void reschedule(reason);
  }

  return (
    <AppointmentFlowShell
      calendar={calendar}
      description="O horário anterior só é liberado depois da confirmação real do novo horário."
      loading={loading}
      title="Reagendar"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.createAppointments ? (
        <ReadOnlyState calendar={calendar} operation="reagendar" />
      ) : (
        appointment && (
          <div className="agenda-flow-layout">
            <form
              className="agenda-form-card"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) setConfirm(true);
              }}
            >
              <div className="agenda-current-slot">
                <span>Horário atual</span>
                <strong>{formatAppointmentDate(appointment)}</strong>
              </div>
              <SlotPicker
                date={date}
                hold={hold}
                legend="Novo horário disponível"
                manualTime={manualTime}
                onDateChange={(value) => {
                  setDate(value);
                  setSlots([]);
                  setSlotsLoading(true);
                  resetSlotChoice();
                  setError(null);
                }}
                onManualTimeChange={setManualTime}
                onSelect={(time) => void chooseTime(time)}
                selected={startTime}
                slots={slots}
                slotsLoading={slotsLoading}
                timezone={calendar?.timezone}
              />
              <label className="switch-row">
                <span>
                  <strong>Notificar cliente</strong>
                  <small>
                    Remarcar é uma alteração relevante: recomendamos avisar
                    o cliente do novo horário.
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
                  Cancelar
                </Button>
                <Button disabled={!canSubmit} type="submit">
                  Revisar alteração
                </Button>
              </div>
            </form>
            <Summary title="Resumo">
              <SummaryRow label="Cliente" value={customerLabel(appointment)} />
              <SummaryRow label="Serviço" value={serviceNames(appointment)} />
              <SummaryRow
                label="Novo horário"
                value={startTime ? `${formatDate(date)} às ${startTime}` : "—"}
              />
              <p className="agenda-summary-note">
                Remarcar não altera o acordo comercial registrado na criação.
              </p>
            </Summary>
          </div>
        )
      )}
      {conflict && appointment && (
        <ConflictPanel
          busy={busy}
          entries={conflict.entries}
          interval={{ date, durationMinutes, startTime: conflict.startTime }}
          loading={conflict.loading}
          onChooseAnother={() => resetSlotChoice()}
          onOverride={submitOverride}
          onReasonChange={(value) =>
            setConflict((current) =>
              current
                ? { ...current, reason: value, reasonError: null }
                : current,
            )
          }
          reason={conflict.reason}
          reasonError={conflict.reasonError}
        />
      )}
      <Dialog
        eyebrow="Confirmação"
        onClose={() => !busy && setConfirm(false)}
        open={confirm}
        title="Confirmar novo horário?"
      >
        <p>
          O horário anterior será liberado somente após a persistência deste
          novo agendamento.
        </p>
        <div className="modal-actions">
          <Button
            disabled={busy}
            onClick={() => setConfirm(false)}
            type="button"
            variant="secondary"
          >
            Voltar
          </Button>
          <Button
            loading={busy}
            onClick={() => void reschedule()}
            type="button"
          >
            Confirmar reagendamento
          </Button>
        </div>
      </Dialog>
    </AppointmentFlowShell>
  );
}

interface ConflictState {
  entries: AgendaEntry[] | null;
  loading: boolean;
  reason: string;
  reasonError: string | null;
  startTime: string;
}
