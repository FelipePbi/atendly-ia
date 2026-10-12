/**
 * Datas e horários como strings de formulário: data em `YYYY-MM-DD` e hora em
 * `HH:mm`, sempre no fuso local. É o mesmo formato que `<input type="date">` e
 * `<input type="time">` entregavam, então os seletores trocam o campo nativo sem
 * mudar o estado de quem usa.
 */

export const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
export const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
export const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** `null` para qualquer coisa que não seja uma data real (31/02 inclusive). */
export function parseIsoDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Segunda-feira da semana de `date`: a grade começa na segunda. */
export function weekStart(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function daysFromToday(date: Date): number {
  return Math.round((date.getTime() - startOfToday().getTime()) / 86_400_000);
}

/** "Hoje, ter 20 de outubro", "Amanhã, …" ou "Quinta-feira, 22 de outubro". */
export function longDateLabel(date: Date): string {
  const diff = daysFromToday(date);
  const dayMonth = `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
  if (diff === 0) return `Hoje, ${WEEKDAYS_SHORT[date.getDay()]} ${dayMonth}`;
  if (diff === 1) return `Amanhã, ${WEEKDAYS_SHORT[date.getDay()]} ${dayMonth}`;
  return `${capitalize(WEEKDAYS[date.getDay()])}, ${dayMonth}`;
}

export type Clock = { hour: number; minute: number };

export function parseClock(value: string | null | undefined): Clock | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

export function formatClock(clock: Clock): string {
  return `${pad2(clock.hour)}:${pad2(clock.minute)}`;
}

export function clockMinutes(clock: Clock): number {
  return clock.hour * 60 + clock.minute;
}

/** "45 min", "1 h", "1 h 30". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${pad2(rest)}` : ""}`;
}
