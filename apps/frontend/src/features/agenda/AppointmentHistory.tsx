"use client";

import { useEffect, useState } from "react";

import { type AppointmentEvent } from "@/data";
import { getProductServices, useProductRuntime } from "@/shared/runtime/ProductRuntime";
import { StatePanel } from "@/shared/ui/States";

import { requestError } from "./occupancy";

const EVENT_TYPE_LABELS: Record<AppointmentEvent["type"], string> = {
  CREATED: "Agendamento criado",
  RESCHEDULED: "Reagendado",
  CANCELLED: "Cancelado",
  COMPLETED: "Atendimento concluído",
  NO_SHOW: "Falta registrada",
  FINAL_VALUE_SET: "Valor final registrado",
  PRESENCE_CONFIRMED: "Presença confirmada",
  HOLD_CONSUMED: "Reserva consumida",
  OVERLAP_OVERRIDE: "Sobreposição autorizada",
};

/** Origem do evento (Goal016): a IA aparece como IA, nunca como termo interno. */
const EVENT_SOURCE_LABELS: Record<AppointmentEvent["source"], string> = {
  AI: "IA",
  USER: "Equipe",
  SYSTEM: "Automático",
  INTEGRATION: "Integração",
};

/**
 * `occurredAt` é o início da transação: eventos gravados juntos compartilham
 * o instante, então o desempate real é `sequence` — um BigInt serializado
 * como string, comparado numericamente para não quebrar em números grandes.
 */
export function compareAppointmentEvents(
  a: AppointmentEvent,
  b: AppointmentEvent,
): number {
  const occurredDiff =
    new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
  if (occurredDiff !== 0) return occurredDiff;
  const sequenceDiff = BigInt(a.sequence) - BigInt(b.sequence);
  const zero = BigInt(0);
  return sequenceDiff < zero ? -1 : sequenceDiff > zero ? 1 : 0;
}

function formatEventTimestamp(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * `actor` grava o `user.id` de quem agiu — um identificador interno, nunca
 * exibível (AG-07). Só quando ele bate com o `user.id` da própria sessão dá
 * para trocá-lo pelo nome (ou e-mail, sem nome) de quem está olhando; para
 * qualquer outro valor não há nome para mostrar, então a linha some.
 */
function actorLabel(
  actor: string | null,
  session: ReturnType<typeof useProductRuntime>["session"],
): string | null {
  if (!actor || !session || actor !== session.user.id) return null;
  return session.user.name ?? session.user.email;
}

export function AppointmentHistory({
  appointmentId,
  reloadKey,
}: {
  appointmentId: string;
  reloadKey?: number;
}) {
  const { session } = useProductRuntime();
  const [events, setEvents] = useState<AppointmentEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .calendar.listAppointmentEvents(appointmentId, controller.signal)
      .then((result) => {
        setEvents([...result].sort(compareAppointmentEvents));
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível carregar o histórico."),
          );
      });
    return () => controller.abort();
  }, [appointmentId, reloadKey]);

  if (error) {
    return (
      <StatePanel
        description={error}
        icon="alert"
        title="Histórico indisponível"
        tone="error"
      />
    );
  }
  if (!events) {
    return (
      <div
        aria-hidden="true"
        className="skeleton agenda-loading-column"
      />
    );
  }
  if (events.length === 0) {
    return (
      <p className="agenda-summary-note">Nenhum evento registrado ainda.</p>
    );
  }
  return (
    <ol className="agenda-history">
      {events.map((event) => {
        const actor = actorLabel(event.actor, session);
        return (
          <li className="agenda-history-item" key={event.id}>
            <strong>
              {EVENT_TYPE_LABELS[event.type]} ·{" "}
              {EVENT_SOURCE_LABELS[event.source]}
            </strong>
            <span>{formatEventTimestamp(event.occurredAt)}</span>
            {actor && <span>Por {actor}</span>}
            {event.reason && <span>Motivo: {event.reason}</span>}
          </li>
        );
      })}
    </ol>
  );
}
