import { minutesFromTime, timeFromMinutes } from "./date-time.js";
import type { WorkSchedule } from "./types.js";

const dayPrefixes = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

interface Interval {
  start: number;
  end: number;
}

export interface MigrationAvailabilityRule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export function migrationAvailabilityRules(
  companySchedule: WorkSchedule,
  employeeSchedule: WorkSchedule | null,
): MigrationAvailabilityRule[] {
  return dayPrefixes.flatMap((prefix, dayOfWeek) => {
    if (readBoolean(companySchedule, `${prefix}Enabled`) === false) return [];
    if (readBoolean(employeeSchedule ?? {}, `${prefix}Enabled`) === false)
      return [];
    const employeeIntervals = employeeSchedule
      ? readIntervals(employeeSchedule, prefix)
      : [];
    const intervals =
      employeeIntervals.length > 0
        ? employeeIntervals
        : readIntervals(companySchedule, prefix);
    return intervals.map((interval) => ({
      dayOfWeek,
      startTime: timeFromMinutes(interval.start),
      endTime: timeFromMinutes(interval.end),
    }));
  });
}

function readIntervals(schedule: WorkSchedule, prefix: string): Interval[] {
  const intervals: Interval[] = [];
  for (const index of [1, 2, 3]) {
    const start = schedule[`${prefix}StartTime${index}`];
    const end = schedule[`${prefix}EndTime${index}`];
    if (typeof start === "string" && typeof end === "string") {
      intervals.push({
        start: minutesFromTime(start),
        end: minutesFromTime(end),
      });
    }
  }
  return intervals;
}

function readBoolean(schedule: WorkSchedule, key: string): boolean | null {
  const value = schedule[key];
  return typeof value === "boolean" ? value : null;
}
