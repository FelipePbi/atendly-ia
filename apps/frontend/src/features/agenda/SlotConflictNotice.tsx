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
export const CONFLICT_OFF_GRID_TITLE =
  "Esse horário não está entre os que a sua agenda oferece";
export const CONFLICT_NOT_RELEASED_TITLE =
  "Esse horário não foi liberado pela agenda";

/** O que a tela sabe do expediente, lido de Configurações > Agenda. */
export interface ConflictAvailability {
  granularityMinutes: number;
  rules: Array<{
    active: boolean;
    dayOfWeek: number;
    endTime: string;
    startTime: string;
  }>;
}

export type FreeRefusal =
  | { kind: "outside"; intervals: Array<{ end: number; start: number }> }
  | { kind: "off-grid"; granularityMinutes: number }
  | { kind: "unknown" };

/**
 * Por que um intervalo que nada na agenda ocupa foi recusado, pelo mesmo
 * critério do motor (`avenly-availability.ts`): cabe inteiro num período do
 * expediente do dia, e o início cai no passo da granularidade contado do
 * início desse período. Bug de 2026-10-12: toda recusa sem ocupante virava
 * "fora do seu horário de atendimento", inclusive sexta 13:30, que está
 * dentro do expediente e na grade. Sem as regras, a tela não afirma motivo.
 */
export function classifyFreeRefusal({
  availability,
  date,
  durationMinutes,
  startTime,
}: {
  availability?: ConflictAvailability | null;
  date?: string;
  durationMinutes: number;
  startTime: string;
}): FreeRefusal {
  if (!availability || !date) return { kind: "unknown" };
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const intervals = availability.rules
    .filter((rule) => rule.active && rule.dayOfWeek === weekday)
    .map((rule) => ({
      end: timeToMinutes(rule.endTime),
      start: timeToMinutes(rule.startTime),
    }))
    .filter((interval) => interval.start < interval.end)
    .sort((a, b) => a.start - b.start)
    .reduce<Array<{ end: number; start: number }>>((merged, interval) => {
      const last = merged.at(-1);
      if (last && interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        merged.push({ ...interval });
      }
      return merged;
    }, []);
  const start = timeToMinutes(startTime);
  const end = start + durationMinutes;
  const container = intervals.find(
    (interval) => start >= interval.start && end <= interval.end,
  );
  if (!container) return { intervals, kind: "outside" };
  const step = availability.granularityMinutes;
  if (step > 0 && (start - container.start) % step !== 0) {
    return { granularityMinutes: step, kind: "off-grid" };
  }
  return { kind: "unknown" };
}

export function stepLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "de 1 em 1 hora" : `de ${hours} em ${hours} horas`;
  }
  return `de ${minutes} em ${minutes} minutos`;
}

export function hoursLabel(
  intervals: Array<{ end: number; start: number }>,
): string {
  if (intervals.length === 0) return "você não atende neste dia";
  const parts = intervals.map((interval) => span(interval.start, interval.end));
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
  return `seu atendimento neste dia é ${joined}`;
}

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
  availability,
  date,
  durationMinutes,
  entries,
  loading,
  startTime,
}: {
  /** Expediente e granularidade; ausente, a recusa sem ocupante não ganha motivo inventado. */
  availability?: ConflictAvailability | null;
  date?: string;
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
    const free = `Nada na sua agenda ocupa ${minutesToTime(start)}–${minutesToTime(start + durationMinutes)}`;
    const refusal = classifyFreeRefusal({
      availability,
      date,
      durationMinutes,
      startTime,
    });
    if (refusal.kind === "outside") {
      return {
        body: `${free}, mas esse intervalo fica fora do seu horário de atendimento: ${hoursLabel(refusal.intervals)}. Você pode encaixar mesmo assim.`,
        title: CONFLICT_OUTSIDE_TITLE,
      };
    }
    if (refusal.kind === "off-grid") {
      return {
        body: `${free}, mas ${minutesToTime(start)} não está entre os horários que a sua agenda oferece (${stepLabel(refusal.granularityMinutes)}). Você pode encaixar mesmo assim.`,
        title: CONFLICT_OFF_GRID_TITLE,
      };
    }
    return {
      body: `${free}, mas a agenda não liberou o horário agora. Ele pode estar reservado numa confirmação em andamento. Você pode encaixar mesmo assim.`,
      title: CONFLICT_NOT_RELEASED_TITLE,
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
        Você pode encaixar mesmo assim:{" "}
        {ordered.length === 1 ? "os dois" : "todos"} vão ficar no mesmo horário
        na sua agenda.
      </>
    ),
    title: CONFLICT_DEFAULT_TITLE,
  };
}

export function SlotConflictNotice(props: {
  availability?: ConflictAvailability | null;
  date?: string;
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
