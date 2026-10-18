"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

import { type AppointmentEvent } from "@/data";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { StatePanel } from "@/shared/ui/States";

import {
  recalledAppointmentHistory,
  rememberAppointmentHistory,
} from "./agendaMemory";
import { formatDuration, requestError } from "./occupancy";

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

/** Verbo do quadro A5 ("Criado pela IA"): o evento no particípio, sem a origem. */
const EVENT_VERBS: Record<AppointmentEvent["type"], string> = {
  CREATED: "Criado",
  RESCHEDULED: "Remarcado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  NO_SHOW: "Falta registrada",
  FINAL_VALUE_SET: "Valor final registrado",
  PRESENCE_CONFIRMED: "Presença confirmada",
  HOLD_CONSUMED: "Reserva consumida",
  OVERLAP_OVERRIDE: "Sobreposição autorizada",
  DURATION_CHANGED: "Duração alterada",
};

/**
 * "40 min → 1 h" do ajuste de duração (D-207), lido do antes/depois do
 * evento; sem os dois números, a linha não aparece.
 */
function durationChange(event: AppointmentEvent): string | null {
  if (event.type !== "DURATION_CHANGED") return null;
  const minutes = (value: unknown) => {
    const field =
      value && typeof value === "object"
        ? (value as { durationMinutes?: unknown }).durationMinutes
        : undefined;
    return typeof field === "number" ? field : null;
  };
  const before = minutes(event.before);
  const after = minutes(event.after);
  if (before === null || after === null) return null;
  return `${formatDuration(before)} → ${formatDuration(after)}`;
}

/**
 * Autoria do evento: a IA aparece como IA; quem agiu pela equipe aparece
 * pelo nome só quando é a própria sessão (AG-07), senão como "equipe".
 */
function EventAuthor({
  actor,
  event,
}: {
  actor: string | null;
  event: AppointmentEvent;
}) {
  if (event.source === "AI")
    return (
      <>
        pela <strong>IA</strong>
      </>
    );
  if (event.source === "USER")
    return actor ? (
      <>
        por <strong>{actor}</strong>
      </>
    ) : (
      <>
        pela <strong>equipe</strong>
      </>
    );
  if (event.source === "INTEGRATION")
    return (
      <>
        pela <strong>integração</strong>
      </>
    );
  return <>automaticamente</>;
}

function formatTimelineTimestamp(value: string): string {
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
    .format(date)
    .replace("-feira", "");
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(date);
  return `${weekday}, ${day} · ${time}`;
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

/** O histórico do quadro A5: um ponto por evento, com autoria. */
export function AppointmentHistory({
  appointmentId,
  reloadKey,
}: {
  appointmentId: string;
  reloadKey?: number;
}) {
  const { session } = useProductRuntime();
  // O histórico visto por último nesta aba aparece na hora (D-168); a
  // leitura abaixo o substitui no lugar.
  const [events, setEvents] = useState<AppointmentEvent[] | null>(() =>
    recalledAppointmentHistory(appointmentId),
  );
  const [seeded, setSeeded] = useState(events !== null);
  const [error, setError] = useState<string | null>(null);
  // Outro atendimento na mesma tela: nada do anterior fica; vale o lembrado
  // dele, ou a linha reservada.
  const [forId, setForId] = useState(appointmentId);
  if (forId !== appointmentId) {
    const remembered = recalledAppointmentHistory(appointmentId);
    setForId(appointmentId);
    setEvents(remembered);
    setSeeded(remembered !== null);
    setError(null);
  }

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .calendar.listAppointmentEvents(appointmentId, controller.signal)
      .then((result) => {
        const sorted = [...result].sort(compareAppointmentEvents);
        setEvents(sorted);
        rememberAppointmentHistory(appointmentId, sorted);
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
  if (!events) return <AppointmentHistoryReserved />;
  // O histórico sempre chega depois do esqueleto: entra com um fade curto
  // (desligado com movimento reduzido), no lugar da linha reservada.
  if (events.length === 0) {
    return (
      <p className={clsx("agenda-summary-note", !seeded && "agenda-reveal")}>
        Nenhum evento registrado ainda.
      </p>
    );
  }
  return (
    <ol className={clsx("agenda-appt-history", !seeded && "agenda-reveal")}>
      {events.map((event) => (
        <li className="agenda-appt-history-item" key={event.id}>
          <span aria-hidden="true" className="agenda-appt-history-dot" />
          <span className="agenda-appt-history-body">
            <span className="agenda-appt-history-text">
              {EVENT_VERBS[event.type]}{" "}
              <EventAuthor
                actor={actorLabel(event.actor, session)}
                event={event}
              />
            </span>
            {durationChange(event) && (
              <span className="agenda-appt-history-reason">
                {durationChange(event)}
              </span>
            )}
            {event.reason && (
              <span className="agenda-appt-history-reason">
                Motivo: {event.reason}
              </span>
            )}
            <span className="agenda-appt-history-time">
              {formatTimelineTimestamp(event.occurredAt)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Carregando (pedido de 2026-10-12): o lugar de uma linha do histórico — o
 * ponto, o texto e a hora —, na altura da linha real, para nada pular quando
 * o histórico chega. Invisível (`visibility: hidden`), sem esqueleto nenhum:
 * o atendimento já está na tela, e uma linha secundária dele não pisca nem
 * numa transição nem depois do splash (revisão de D-168, 2026-10-12).
 */
function AppointmentHistoryReserved() {
  return (
    <div
      aria-hidden="true"
      className="agenda-appt-history agenda-appt-history-reserved"
    >
      <div className="agenda-appt-history-item">
        <span className="agenda-appt-history-dot" />
        <span className="agenda-appt-history-body">
          <span className="agenda-appt-history-text">Criado pela equipe</span>
          <span className="agenda-appt-history-time">Terça, 29/09 · 10:00</span>
        </span>
      </div>
    </div>
  );
}
