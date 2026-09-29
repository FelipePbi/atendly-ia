import {
  type Appointment,
  type AvailabilityException,
  BffHttpError,
  isActiveAppointmentStatus,
  type TimeBlock,
  type TimeBlockKind,
} from "@/data";
import type { IconName } from "@/shared/icons/Icon";

export const MINUTES_PER_DAY = 24 * 60;

export function timeToMinutes(time: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number): string {
  const normalized = Math.max(
    0,
    Math.min(MINUTES_PER_DAY, Math.round(minutes)),
  );
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Converte um instante ISO para data/hora no fuso do negócio (blocos são absolutos; atendimentos já chegam em wall-clock). */
export function zonedDateTimeParts(
  iso: string,
  timezone?: string | null,
): { date: string; minutes: number; time: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone ?? undefined,
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes,
    time: minutesToTime(minutes),
  };
}

export function isoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function parseDate(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(value: Date, months: number): Date {
  const result = new Date(value);
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** Semana começa na segunda-feira, alinhado ao mini-calendário do produto. */
export function startOfWeek(value: Date): Date {
  const result = new Date(value);
  const weekday = result.getDay();
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - ((weekday + 6) % 7));
  return result;
}

export function startOfMonth(value: Date): Date {
  const result = new Date(value);
  result.setHours(12, 0, 0, 0);
  result.setDate(1);
  return result;
}

export function endOfMonth(value: Date): Date {
  return addDays(addMonths(startOfMonth(value), 1), -1);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
    parseDate(value),
  );
}

export function formatAppointmentDate(appointment: Appointment): string {
  return `${formatDate(appointment.date)} · ${appointment.startTime}–${appointment.endTime}`;
}

export function customerLabel(appointment: Appointment): string {
  return (
    appointment.customer?.name ??
    appointment.customer?.phone ??
    "Cliente não identificado"
  );
}

export function serviceNames(appointment: Appointment): string {
  return (
    appointment.services.map((service) => service.name).join(", ") ||
    appointment.title ||
    "Serviço não informado"
  );
}

export function sourceLabel(source: Appointment["source"]): string {
  if (source === "AI") return "Criado pela IA";
  if (source === "INTEGRATION") return "Origem externa";
  return "Criado manualmente";
}

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  CONFIRMED: "Confirmado",
  NO_SHOW: "Não compareceu",
  SCHEDULED: "Confirmado",
};

export function statusLabel(status: string): string {
  return APPOINTMENT_STATUS_LABELS[status.toUpperCase()] ?? "Confirmado";
}

export function requestError(caught: unknown, fallback: string): string {
  if (caught instanceof BffHttpError) return caught.message;
  if (caught instanceof Error && caught.message) return caught.message;
  return fallback;
}

/** Rótulo próprio de cada kind — nunca um texto genérico de "bloco" (Goal016). */
export function timeBlockKindLabel(kind: TimeBlockKind): string {
  return kind === "PERSONAL" ? "Compromisso pessoal" : "Bloqueio operacional";
}

export interface SeriesOccurrenceConflict {
  appointmentId: string;
  date: string;
}

/**
 * A recusa de série (`409 BLOCK_SERIES_APPOINTMENT_CONFLICT`) já vem com a
 * lista de ocorrências em conflito em `details.conflicts` — é o que a tela
 * mostra antes de perguntar "pular" ou "forçar" (ver PUBLIC_API_V1.md).
 */
export function seriesConflicts(
  caught: unknown,
): SeriesOccurrenceConflict[] | null {
  if (
    !(caught instanceof BffHttpError) ||
    caught.code !== "BLOCK_SERIES_APPOINTMENT_CONFLICT"
  ) {
    return null;
  }
  const details = caught.details as { conflicts?: unknown } | undefined;
  if (!Array.isArray(details?.conflicts)) return [];
  return details.conflicts.filter(
    (item): item is SeriesOccurrenceConflict =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as SeriesOccurrenceConflict).date === "string" &&
      typeof (item as SeriesOccurrenceConflict).appointmentId === "string",
  );
}

/**
 * Início do atendimento como instante local, sem conversão de fuso — `date`
 * e `startTime` são wall-clock do negócio, como o resto da navegação da
 * Agenda já faz.
 */
function appointmentStartInstant(appointment: Appointment): Date {
  const [year = 0, month = 1, day = 1] = appointment.date
    .split("-")
    .map(Number);
  const [hour = 0, minute = 0] = appointment.startTime.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

/**
 * Decide se as ações de fim (Goal069 AG-09) já podem aparecer.
 */
export function appointmentHasStarted(
  appointment: Appointment,
  now: Date = new Date(),
): boolean {
  return appointmentStartInstant(appointment).getTime() <= now.getTime();
}

export function compareAppointments(
  left: Appointment,
  right: Appointment,
): number {
  return `${left.date}T${left.startTime}`.localeCompare(
    `${right.date}T${right.startTime}`,
  );
}

/**
 * O próximo agendamento ativo a partir de agora (Goal069 AG-06) — não o
 * primeiro da janela navegada, que pode já ter passado.
 */
export function nextActiveAppointment(
  appointments: Appointment[],
  now: Date = new Date(),
): Appointment | undefined {
  return appointments
    .filter(
      (appointment) =>
        isActiveAppointmentStatus(appointment.status) &&
        appointmentStartInstant(appointment).getTime() >= now.getTime(),
    )
    .sort(compareAppointments)[0];
}

// --- Ocupação honesta da grade (Goal016) ------------------------------------
// Todo campo exibido vem de Appointment, TimeBlock ou AvailabilityException;
// nada aqui é inferido além do que o próprio read model já garante (buffers
// reais do Goal009, `isActiveAppointmentStatus` para decidir ocupação).

export type AgendaEntryKind =
  | "appointment"
  | "buffer"
  | "block"
  | "personal"
  | "exception-extra"
  | "exception-unavailable";

export interface AgendaEntry {
  appointment?: Appointment;
  date: string;
  endMinutes: number;
  exception?: AvailabilityException;
  key: string;
  kind: AgendaEntryKind;
  startMinutes: number;
  timeBlock?: TimeBlock;
}

function clampSpan(start: number, end: number): [number, number] {
  const startMinutes = Math.max(0, Math.min(MINUTES_PER_DAY, start));
  const endMinutes = Math.max(startMinutes + 1, Math.min(MINUTES_PER_DAY, end));
  return [startMinutes, endMinutes];
}

/**
 * Um atendimento cancelado nunca aparece na grade. Um atendimento com falta
 * aparece, mas — como um cancelado — não gera ocupação de buffer: só um
 * atendimento que `isActiveAppointmentStatus` ainda considera ativo ocupa o
 * intervalo antes/depois dele.
 */
export function appointmentEntries(appointments: Appointment[]): AgendaEntry[] {
  const entries: AgendaEntry[] = [];
  for (const appointment of appointments) {
    if (appointment.status.toUpperCase() === "CANCELLED") continue;
    const start = timeToMinutes(appointment.startTime);
    const end = timeToMinutes(appointment.endTime);
    entries.push({
      appointment,
      date: appointment.date,
      endMinutes: Math.max(start + 1, end),
      key: appointment.id,
      kind: "appointment",
      startMinutes: start,
    });
    if (!isActiveAppointmentStatus(appointment.status)) continue;
    if (appointment.bufferBeforeMinutes > 0) {
      const [bufferStart, bufferEnd] = clampSpan(
        start - appointment.bufferBeforeMinutes,
        start,
      );
      entries.push({
        appointment,
        date: appointment.date,
        endMinutes: bufferEnd,
        key: `${appointment.id}-buffer-before`,
        kind: "buffer",
        startMinutes: bufferStart,
      });
    }
    if (appointment.bufferAfterMinutes > 0) {
      const [bufferStart, bufferEnd] = clampSpan(
        end,
        end + appointment.bufferAfterMinutes,
      );
      entries.push({
        appointment,
        date: appointment.date,
        endMinutes: bufferEnd,
        key: `${appointment.id}-buffer-after`,
        kind: "buffer",
        startMinutes: bufferStart,
      });
    }
  }
  return entries;
}

export function timeBlockEntries(
  blocks: TimeBlock[],
  timezone?: string | null,
): AgendaEntry[] {
  return blocks.map((block) => {
    const start = zonedDateTimeParts(block.startAt, timezone);
    const end = zonedDateTimeParts(block.endAt, timezone);
    // Bloco que atravessa a virada do dia: mostra o trecho do dia de início até
    // a meia-noite. Ocorrência multi-dia própria não é tela deste Goal.
    const endMinutes = end.date === start.date ? end.minutes : MINUTES_PER_DAY;
    return {
      date: start.date,
      endMinutes: Math.max(start.minutes + 1, endMinutes),
      key: block.id,
      kind: block.kind === "PERSONAL" ? "personal" : "block",
      startMinutes: start.minutes,
      timeBlock: block,
    } satisfies AgendaEntry;
  });
}

export function exceptionEntries(
  exceptions: AvailabilityException[],
): AgendaEntry[] {
  return exceptions.map((exception) => {
    const start = exception.startTime ? timeToMinutes(exception.startTime) : 0;
    const end = exception.endTime
      ? timeToMinutes(exception.endTime)
      : MINUTES_PER_DAY;
    return {
      date: exception.date,
      endMinutes: Math.max(start + 1, end),
      exception,
      key: exception.id,
      kind: exception.available ? "exception-extra" : "exception-unavailable",
      startMinutes: start,
    } satisfies AgendaEntry;
  });
}

export function buildAgendaEntries(params: {
  appointments: Appointment[];
  exceptions: AvailabilityException[];
  timeBlocks: TimeBlock[];
  timezone?: string | null;
}): AgendaEntry[] {
  return [
    ...appointmentEntries(params.appointments),
    ...timeBlockEntries(params.timeBlocks, params.timezone),
    ...exceptionEntries(params.exceptions),
  ].sort((left, right) =>
    left.date === right.date
      ? left.startMinutes - right.startMinutes
      : left.date.localeCompare(right.date),
  );
}

export function entriesForDate(
  entries: AgendaEntry[],
  date: string,
): AgendaEntry[] {
  return entries.filter((entry) => entry.date === date);
}

/**
 * Datas com pelo menos um agendamento ativo (Goal069 AG-01) — a faixa da
 * semana marca ponto só nelas, nunca em bloqueio, buffer ou exceção.
 */
export function datesWithActiveAppointment(entries: AgendaEntry[]): Set<string> {
  const dates = new Set<string>();
  for (const entry of entries) {
    if (
      entry.kind === "appointment" &&
      entry.appointment &&
      isActiveAppointmentStatus(entry.appointment.status)
    ) {
      dates.add(entry.date);
    }
  }
  return dates;
}

export function groupEntriesByDate(
  entries: AgendaEntry[],
): Array<[string, AgendaEntry[]]> {
  const grouped = new Map<string, AgendaEntry[]>();
  for (const entry of entries) {
    grouped.set(entry.date, [...(grouped.get(entry.date) ?? []), entry]);
  }
  return Array.from(grouped);
}

export interface EntryPresentation {
  detail: string | null;
  icon: IconName;
  isNoShow: boolean;
  statusText: string | null;
  title: string;
  typeLabel: string;
}

/**
 * Texto e forma de cada tipo de evento, para nunca depender só de cor
 * (critério de aceite): cada `typeLabel`/`icon` é distinto por tipo, e
 * `statusText` distingue cancelado (nem chega aqui) e falta de confirmado.
 */
export function describeEntry(entry: AgendaEntry): EntryPresentation {
  if (entry.kind === "appointment" && entry.appointment) {
    const appointment = entry.appointment;
    const status = appointment.status.toUpperCase();
    return {
      detail: `${serviceNames(appointment)} · ${appointment.durationMinutes} min`,
      icon:
        status === "NO_SHOW" ? "x" : status === "COMPLETED" ? "check" : "clock",
      isNoShow: status === "NO_SHOW",
      statusText: statusLabel(appointment.status),
      title: customerLabel(appointment),
      typeLabel: "Atendimento",
    };
  }
  if (entry.kind === "buffer") {
    return {
      detail: `${entry.endMinutes - entry.startMinutes} min de intervalo`,
      icon: "clock",
      isNoShow: false,
      statusText: null,
      title: "Ocupado · intervalo entre atendimentos",
      typeLabel: "Buffer",
    };
  }
  if (entry.kind === "block" || entry.kind === "personal") {
    const block = entry.timeBlock;
    const isPersonal = entry.kind === "personal";
    return {
      detail: block?.title && block.reason ? block.reason : null,
      icon: isPersonal ? "user" : "lock",
      isNoShow: false,
      statusText: null,
      title:
        block?.title ??
        block?.reason ??
        (isPersonal ? "Compromisso pessoal" : "Bloqueio"),
      typeLabel: isPersonal ? "Compromisso pessoal" : "Bloqueio",
    };
  }
  const exception = entry.exception;
  const extra = entry.kind === "exception-extra";
  return {
    detail: exception?.reason ?? null,
    icon: extra ? "calendar" : "alert",
    isNoShow: false,
    statusText: null,
    title: extra ? "Horário extra liberado" : "Indisponível",
    typeLabel: extra
      ? "Exceção · horário extra"
      : "Exceção · indisponibilidade",
  };
}
