import type { AvailableSlot } from "../../calendar/calendar-provider.js";
import {
  addDays,
  minutesFromTime,
  overlaps,
  timeFromMinutes,
  weekdayIndex,
} from "./date-time.js";
import type { MinhaAgendaAppointment, WorkSchedule } from "./types.js";

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

export interface AvailabilityInput {
  companySchedule: WorkSchedule;
  employeeSchedule: WorkSchedule | null;
  appointments: MinhaAgendaAppointment[];
  blockers: MinhaAgendaAppointment[];
  serviceDuration: number;
  startDate: string;
  days: number;
  stepMinutes: number;
  maxSlots: number;
  excludeAppointmentId?: number;
}

export function computeAvailableSlots(
  input: AvailabilityInput,
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const busyByDate = buildBusyIntervals(
    input.appointments,
    input.blockers,
    input.excludeAppointmentId,
  );

  for (let dayOffset = 0; dayOffset < input.days; dayOffset += 1) {
    const date = addDays(input.startDate, dayOffset);
    const workIntervals = resolveWorkIntervals(
      input.companySchedule,
      input.employeeSchedule,
      date,
    );
    const busyIntervals = busyByDate.get(date) ?? [];

    for (const interval of workIntervals) {
      for (
        let start = interval.start;
        start + input.serviceDuration <= interval.end;
        start += input.stepMinutes
      ) {
        const end = start + input.serviceDuration;
        const hasConflict = busyIntervals.some((busy) =>
          overlaps(start, end, busy.start, busy.end),
        );
        if (!hasConflict) {
          slots.push({
            date,
            startTime: timeFromMinutes(start),
            endTime: timeFromMinutes(end),
          });
          if (slots.length >= input.maxSlots) return slots;
        }
      }
    }
  }

  return slots;
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

function resolveWorkIntervals(
  companySchedule: WorkSchedule,
  employeeSchedule: WorkSchedule | null,
  date: string,
): Interval[] {
  const prefix = dayPrefixes[weekdayIndex(date)];
  if (readBoolean(companySchedule, `${prefix}Enabled`) === false) return [];

  const companyIntervals = readIntervals(companySchedule, prefix);
  if (!employeeSchedule) return companyIntervals;
  if (readBoolean(employeeSchedule, `${prefix}Enabled`) === false) return [];

  const employeeIntervals = readIntervals(employeeSchedule, prefix);
  return employeeIntervals.length > 0 ? employeeIntervals : companyIntervals;
}

function buildBusyIntervals(
  appointments: MinhaAgendaAppointment[],
  blockers: MinhaAgendaAppointment[],
  excludeAppointmentId?: number,
): Map<string, Interval[]> {
  const byDate = new Map<string, Interval[]>();
  for (const appointment of [...appointments, ...blockers]) {
    if (excludeAppointmentId && appointment.id === excludeAppointmentId)
      continue;
    if (appointment.deleted) continue;

    const start = minutesFromTime(appointment.startTime);
    const end = appointment.endTime
      ? minutesFromTime(appointment.endTime)
      : start + appointment.duration;
    const current = byDate.get(appointment.date) ?? [];
    current.push({ start, end });
    byDate.set(appointment.date, current);
  }
  return byDate;
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
