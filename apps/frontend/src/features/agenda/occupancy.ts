import {
  type Appointment,
  type AvailabilityException,
  BffHttpError,
  isActiveAppointmentStatus,
  type ServiceColorToken,
  type ServiceList,
  type TimeBlock,
  type TimeBlockKind,
} from "@/data";
import type { IconName } from "@/shared/icons/Icon";
import { displayPhone } from "@/shared/phone";

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
    (appointment.customer?.phone
      ? displayPhone(appointment.customer.phone, "")
      : null) ??
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

export type ServiceColorMap = ReadonlyMap<string, ServiceColorToken>;

/** Serviço sem cor no catálogo não entra no mapa: o traço fica neutro. */
export function serviceColorMap(
  services: ServiceList["items"] | null | undefined,
): ServiceColorMap {
  const colors = new Map<string, ServiceColorToken>();
  for (const service of services ?? []) {
    if (service.colorToken) colors.set(service.id, service.colorToken);
  }
  return colors;
}

/** Um token por serviço do atendimento, na ordem dele; `null` é traço neutro. */
export function appointmentServiceColors(
  appointment: Appointment,
  colors: ServiceColorMap,
): Array<ServiceColorToken | null> {
  return appointment.services.map(
    (service) => colors.get(service.serviceId) ?? null,
  );
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

const FULL_DAY_END_MINUTES = 23 * 60 + 59;

/** Bloqueio ou exceção indisponível que cobre o dia inteiro: o Mês e o mini-calendário pintam o dia de fechado. */
export function isFullDayClosure(entry: AgendaEntry): boolean {
  return (
    (entry.kind === "block" || entry.kind === "exception-unavailable") &&
    entry.startMinutes <= 0 &&
    entry.endMinutes >= FULL_DAY_END_MINUTES
  );
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

// --- Mapa da semana (Goal100) ------------------------------------------------

/** 40 → "40 min", 60 → "1 h", 70 → "1 h 10". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

const SHORT_WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** Texto da pílula de dias visíveis: "Seg–Sáb", "Todos os dias" ou a lista. */
export function visibleDaysLabel(hiddenWeekdays: number[]): string {
  const hidden = new Set(hiddenWeekdays);
  const visible = MONDAY_FIRST.filter((day) => !hidden.has(day));
  if (visible.length === 7) return "Todos os dias";
  if (visible.length === 0) return "Nenhum dia";
  const first = MONDAY_FIRST.indexOf(visible[0]);
  const contiguous = visible.every(
    (day, index) => MONDAY_FIRST[first + index] === day,
  );
  if (contiguous && visible.length >= 3) {
    return `${SHORT_WEEKDAYS[visible[0]]}–${SHORT_WEEKDAYS[visible[visible.length - 1]]}`;
  }
  return visible.map((day) => SHORT_WEEKDAYS[day]).join(", ");
}

export interface AvailabilityRuleLike {
  active: boolean;
  dayOfWeek: number;
  endTime: string;
  startTime: string;
}

/**
 * Trechos de `[inicio, fim]` (minutos) dentro da janela que ficam fora do
 * horário de atendimento daquele dia da semana. Sem leitura das regras, ou sem
 * regra ativa para o dia, nada é rebaixado: sem regra não há horário a
 * contrariar.
 */
export function outsideHoursRanges(
  rules: AvailabilityRuleLike[] | null,
  dayOfWeek: number,
  windowStart: number,
  windowEnd: number,
): Array<[number, number]> {
  if (!rules) return [];
  const open = rules
    .filter((rule) => rule.active && rule.dayOfWeek === dayOfWeek)
    .map((rule) => [
      timeToMinutes(rule.startTime),
      timeToMinutes(rule.endTime),
    ])
    .sort((left, right) => (left[0]) - (right[0]));
  if (open.length === 0) return [];
  const ranges: Array<[number, number]> = [];
  let cursor = windowStart;
  for (const [from, to] of open as Array<[number, number]>) {
    if (from > cursor) ranges.push([cursor, Math.min(from, windowEnd)]);
    cursor = Math.max(cursor, to);
    if (cursor >= windowEnd) break;
  }
  if (cursor < windowEnd) ranges.push([cursor, windowEnd]);
  return ranges.filter(([from, to]) => to > from);
}

export interface ServiceLegendItem {
  color: ServiceColorToken | null;
  key: string;
  name: string;
}

/** Serviços dos atendimentos (não cancelados) das entradas, na ordem em que aparecem. */
export function serviceLegend(
  entries: AgendaEntry[],
  colors: ServiceColorMap,
): ServiceLegendItem[] {
  const seen = new Map<string, ServiceLegendItem>();
  for (const entry of entries) {
    if (entry.kind !== "appointment" || !entry.appointment) continue;
    for (const service of entry.appointment.services) {
      if (seen.has(service.serviceId)) continue;
      seen.set(service.serviceId, {
        color: colors.get(service.serviceId) ?? null,
        key: service.serviceId,
        name: service.name,
      });
    }
  }
  return Array.from(seen.values());
}

export function daySummaryHeading(date: string, isToday: boolean): string {
  const parsed = parseDate(date);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
    .format(parsed)
    .replace(/-feira$/, "");
  if (isToday) return `Hoje, ${weekday} ${parsed.getDate()}`;
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${parsed.getDate()}`;
}
