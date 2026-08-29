import { AppError } from "../errors/app-error.js";

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})$/;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

export interface LocalDateTime {
  date: string;
  time: string;
}

export function addDays(date: string, amount: number): string {
  const parts = parseDate(date);
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function weekdayIndex(date: string): number {
  const parts = parseDate(date);
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 12),
  ).getUTCDay();
}

export function minutesFromTime(time: string): number {
  const parts = parseTime(time);
  return parts.hour * 60 + parts.minute;
}

export function timeFromMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function databaseTimeToMinutes(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

export function databaseDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function localDateTimeToInstant(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const dateParts = parseDate(date);
  const timeParts = parseTime(time);
  const desiredWallTime = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
  );
  let candidate = desiredWallTime;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const actualWallTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const difference = desiredWallTime - actualWallTime;
    if (difference === 0) break;
    candidate += difference;
  }

  const result = new Date(candidate);
  const resolved = instantToLocalDateTime(result, timeZone);
  if (resolved.date !== date || resolved.time !== time) {
    throw new AppError(
      "INVALID_LOCAL_DATETIME",
      "Local date and time do not exist in the configured timezone.",
      400,
    );
  }
  return result;
}

export function instantToLocalDateTime(
  instant: Date,
  timeZone: string,
): LocalDateTime {
  const parts = zonedParts(instant, timeZone);
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function overlaps(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && startB < endA;
}

function zonedParts(instant: Date, timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
    } catch {
      throw new AppError(
        "INVALID_TIMEZONE",
        "Calendar timezone is invalid.",
        500,
      );
    }
    formatterCache.set(timeZone, formatter);
  }

  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
  };
}

function parseDate(date: string) {
  const match = datePattern.exec(date);
  if (!match) invalidDate();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    invalidDate();
  }
  return { year, month, day };
}

function parseTime(time: string) {
  const match = timePattern.exec(time);
  if (!match) invalidTime();
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) invalidTime();
  return { hour, minute };
}

function invalidDate(): never {
  throw new AppError("INVALID_DATE", "Date must use YYYY-MM-DD.", 400);
}

function invalidTime(): never {
  throw new AppError("INVALID_TIME", "Time must use HH:mm.", 400);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
