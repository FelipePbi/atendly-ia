"use client";

import { useEffect, useRef, useState } from "react";

import type { Appointment } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";
import { showToast } from "@/shared/ui/toastBus";

import { readOccupancy } from "./AppointmentForm";
import { occupyingEntries } from "./ConflictPanel";
import { isSlotConflictError, newIdempotencyKey } from "./holdSession";
import {
  type AgendaEntry,
  appointmentServiceColors,
  formatDuration,
  requestError,
  type ServiceColorMap,
} from "./occupancy";
import { rangeLabel, ServiceDurationStepper } from "./ServiceDurationStepper";
import {
  type ConflictAvailability,
  SlotConflictNotice,
} from "./SlotConflictNotice";

/** Um atendimento só tem a duração ajustada quando cada serviço tem a sua. */
export function canAdjustDuration(appointment: Appointment): boolean {
  return (
    appointment.status.toUpperCase() === "CONFIRMED" &&
    appointment.services.length > 0 &&
    appointment.services.every((service) => service.durationMinutes !== null)
  );
}

interface ConflictState {
  entries: AgendaEntry[] | null;
  loading: boolean;
  reason: string;
  reasonError: string | null;
}

/**
 * "Ajustar duração" do detalhe (D-207): um serviço que leva 40 min por padrão
 * pode levar 60 para esta cliente. O início fica; o fim muda. Crescer passa
 * pela mesma validação da remarcação — a recusa mostra o mesmo aviso do
 * quadro A7, e o encaixe com motivo é a saída. A cliente não é avisada: o
 * início não muda, e o lembrete continua o mesmo.
 */
export function AppointmentDurationDialog({
  appointment,
  onClose,
  onSaved,
  serviceColors,
  timezone,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
  serviceColors: ServiceColorMap;
  timezone?: string | null;
}) {
  const [durations, setDurations] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      appointment.services.map((service) => [
        service.serviceId,
        service.durationMinutes ?? 0,
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [availability, setAvailability] =
    useState<ConflictAvailability | null>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const colors = appointmentServiceColors(appointment, serviceColors);

  // O expediente diz ao aviso de recusa o motivo verdadeiro, como na criação.
  useEffect(() => {
    const controller = new AbortController();
    const settings = getProductServices().settings;
    if (!settings || typeof settings.get !== "function") return;
    Promise.resolve()
      .then(() => settings.get(controller.signal))
      .then((state) => setAvailability(state.availability ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const total = appointment.services.reduce(
    (sum, service) => sum + (durations[service.serviceId] ?? 0),
    0,
  );
  const changed = appointment.services.some(
    (service) => durations[service.serviceId] !== service.durationMinutes,
  );

  function change(serviceId: string, minutes: number) {
    setDurations((current) => ({ ...current, [serviceId]: minutes }));
    setConflict(null);
    setError(null);
  }

  async function openConflict() {
    setConflict({ entries: null, loading: true, reason: "", reasonError: null });
    const entries = await readOccupancy(appointment.date, timezone);
    setConflict((current) =>
      current
        ? {
            ...current,
            // O próprio atendimento não ocupa contra ele mesmo.
            entries:
              entries === null
                ? null
                : occupyingEntries(
                    entries.filter(
                      (entry) => entry.appointment?.id !== appointment.id,
                    ),
                    {
                      date: appointment.date,
                      durationMinutes: total,
                      startTime: appointment.startTime,
                    },
                  ),
            loading: false,
          }
        : current,
    );
  }

  async function save(overlapReason?: string) {
    if (busy || !changed) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await getProductServices().calendar.changeAppointmentDuration(
        appointment.id,
        {
          overlapOverride: overlapReason ? true : undefined,
          overlapOverrideReason: overlapReason,
          services: appointment.services.map((service) => ({
            durationMinutes: durations[service.serviceId] ?? 0,
            serviceId: service.serviceId,
          })),
        },
        newIdempotencyKey(),
      );
      showToast("Duração salva.");
      onSaved(updated);
    } catch (caught) {
      if (!overlapReason && isSlotConflictError(caught)) {
        await openConflict();
        return;
      }
      setError(requestError(caught, "Não foi possível salvar a duração."));
    } finally {
      setBusy(false);
    }
  }

  function saveAnyway() {
    if (!conflict || conflict.loading || busy) return;
    const reason = conflict.reason.trim();
    if (!reason) {
      setConflict({
        ...conflict,
        reasonError:
          "Descreva o motivo do encaixe. Sem motivo, a duração não é salva.",
      });
      reasonRef.current?.focus();
      return;
    }
    void save(reason);
  }

  return (
    <Dialog
      eyebrow={appointment.services.map((service) => service.name).join(" + ")}
      onClose={onClose}
      open
      title="Ajustar duração"
    >
      <form
        className="agenda-duration-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (conflict) saveAnyway();
          else void save();
        }}
      >
        <p className="agenda-duration-hint">
          Vale só para este agendamento. O serviço continua com a duração de
          sempre, e a cliente não recebe aviso: o início não muda.
        </p>
        <div className="agenda-duration-list">
          {appointment.services.map((service, index) => (
            <ServiceDurationStepper
              color={colors[index]}
              defaultMinutes={service.defaultDurationMinutes ?? null}
              disabled={busy}
              key={service.serviceId}
              name={service.name}
              onChange={(minutes) => change(service.serviceId, minutes)}
              value={durations[service.serviceId] ?? 0}
            />
          ))}
        </div>
        <p aria-live="polite" className="agenda-duration-summary">
          <span>Horário</span>
          <strong>
            {rangeLabel(appointment.startTime, total)}
            <span className="sr-only"> · </span>
            <small>{formatDuration(total)}</small>
          </strong>
        </p>
        {conflict && (
          <>
            <SlotConflictNotice
              availability={availability}
              date={appointment.date}
              durationMinutes={total}
              entries={conflict.entries}
              loading={conflict.loading}
              startTime={appointment.startTime}
            />
            <div className="agenda-new-block">
              <label className="label" htmlFor="agenda-duration-reason">
                Motivo do encaixe
              </label>
              <input
                aria-describedby={
                  conflict.reasonError ? "agenda-duration-reason-error" : undefined
                }
                aria-invalid={conflict.reasonError ? true : undefined}
                className="input"
                id="agenda-duration-reason"
                onChange={(event) => {
                  const value = event.target.value;
                  setConflict((current) =>
                    current
                      ? { ...current, reason: value, reasonError: null }
                      : current,
                  );
                }}
                ref={reasonRef}
                type="text"
                value={conflict.reason}
              />
              {conflict.reasonError && (
                <p
                  className="form-error"
                  id="agenda-duration-reason-error"
                  role="alert"
                >
                  {conflict.reasonError}
                </p>
              )}
            </div>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button
            disabled={busy}
            onClick={onClose}
            type="button"
            variant="secondary"
          >
            Voltar
          </Button>
          <Button
            disabled={!changed || conflict?.loading === true}
            loading={busy}
            type="submit"
          >
            {conflict ? "Encaixar mesmo assim" : "Salvar duração"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
