import type { ReactNode } from "react";

import {
  type AgendaEntry,
  customerLabel,
  describeEntry,
  minutesToTime,
  timeToMinutes,
} from "./occupancy";

/** Triângulo do quadro A7 (`M12 4 21 20H3z`), portado como está. */
export function ConflictGlyph({
  size,
  strokeWidth,
}: {
  size: number;
  strokeWidth: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className="agenda-new-conflict-glyph"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M12 4 21 20H3z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  );
}

export const CONFLICT_DEFAULT_TITLE = "Esse horário já está ocupado";
export const CONFLICT_OUTSIDE_TITLE =
  "Esse horário está fora do seu horário de atendimento";
export const CONFLICT_UNREAD_TITLE =
  "Não foi possível ver o que ocupa este horário";

function span(startMinutes: number, endMinutes: number): string {
  return `das ${minutesToTime(startMinutes)} às ${minutesToTime(endMinutes)}`;
}

function entrySentence(entry: AgendaEntry): ReactNode {
  if (entry.kind === "appointment" && entry.appointment) {
    const appointment = entry.appointment;
    const status = appointment.status.toUpperCase();
    const services =
      appointment.services.map((service) => service.name).join(" + ") ||
      appointment.title ||
      "Serviço não informado";
    const note =
      status === "COMPLETED" || status === "NO_SHOW"
        ? ""
        : appointment.presenceConfirmedAt
          ? " (presença confirmada)"
          : " (em confirmação)";
    return (
      <>
        <strong>{customerLabel(appointment)}</strong> tem {services} às{" "}
        {minutesToTime(entry.startMinutes)}
        {note}.
      </>
    );
  }
  if (entry.kind === "buffer") {
    return `Intervalo entre atendimentos ${span(entry.startMinutes, entry.endMinutes)}.`;
  }
  if (
    (entry.kind === "block" || entry.kind === "personal") &&
    entry.timeBlock
  ) {
    const type = entry.kind === "personal" ? "Compromisso pessoal" : "Bloqueio";
    const name = (entry.timeBlock.title ?? entry.timeBlock.reason)?.trim();
    return `${type}${name ? ` "${name}"` : ""} ${span(entry.startMinutes, entry.endMinutes)}.`;
  }
  const presentation = describeEntry(entry);
  return `${presentation.title} ${span(entry.startMinutes, entry.endMinutes)}.`;
}

/**
 * O que o aviso do A7 diz, só pelo que a leitura da ocupação trouxe:
 * `null` é leitura falhada (nunca vira "nada ocupa"), `[]` é leitura
 * respondida sem nada no intervalo.
 */
export function describeSlotConflict({
  durationMinutes,
  entries,
  loading,
  startTime,
}: {
  durationMinutes: number;
  entries: AgendaEntry[] | null;
  loading: boolean;
  startTime: string;
}): { body: ReactNode; title: string } {
  if (loading) {
    return {
      body: "Consultando o que ocupa este horário…",
      title: CONFLICT_DEFAULT_TITLE,
    };
  }
  if (entries === null) {
    return {
      body: "A agenda recusou o horário. Você pode encaixar mesmo assim ou escolher outro horário.",
      title: CONFLICT_UNREAD_TITLE,
    };
  }
  if (entries.length === 0) {
    const start = timeToMinutes(startTime);
    return {
      body: `Nada na sua agenda ocupa ${minutesToTime(start)}–${minutesToTime(start + durationMinutes)}, mas o horário fica fora da grade de atendimento. Você pode encaixar mesmo assim.`,
      title: CONFLICT_OUTSIDE_TITLE,
    };
  }
  const ordered = [...entries].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
  );
  return {
    body: (
      <>
        {ordered.map((entry) => (
          <span key={entry.key}>{entrySentence(entry)} </span>
        ))}
        Você pode encaixar mesmo assim —{" "}
        {ordered.length === 1 ? "os dois" : "todos"} vão ficar no mesmo horário
        na sua agenda.
      </>
    ),
    title: CONFLICT_DEFAULT_TITLE,
  };
}

export function SlotConflictNotice(props: {
  durationMinutes: number;
  entries: AgendaEntry[] | null;
  loading: boolean;
  startTime: string;
}) {
  const { body, title } = describeSlotConflict(props);
  return (
    <div className="agenda-new-conflict" role="alert">
      <ConflictGlyph size={20} strokeWidth={1.75} />
      <div className="agenda-new-conflict-copy">
        <span className="agenda-new-conflict-title">{title}</span>
        <span className="agenda-new-conflict-body">{body}</span>
      </div>
    </div>
  );
}
