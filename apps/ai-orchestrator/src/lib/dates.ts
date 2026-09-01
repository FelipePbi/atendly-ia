const minutePattern = /^(\d{2}):(\d{2})$/;

export function minutesFromTime(time: string): number {
  const match = minutePattern.exec(time);
  if (!match) throw new Error(`Invalid HH:mm time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function timeFromMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function todayInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export function startOfTodayInTimeZone(timeZone: string): Date {
  const [year, month, day] = todayInTimeZone(timeZone).split("-").map(Number);
  const desiredWallTime = Date.UTC(year, month - 1, day);
  let candidate = desiredWallTime;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const actualWallTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    const difference = desiredWallTime - actualWallTime;
    if (difference === 0) break;
    candidate += difference;
  }

  return new Date(candidate);
}

export function weekdayIndex(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

export function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}
