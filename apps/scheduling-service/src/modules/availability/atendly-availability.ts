import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  addDays,
  addMinutes,
  databaseDate,
  databaseTimeToMinutes,
  instantToLocalDateTime,
  localDateTimeToInstant,
  overlaps,
  timeFromMinutes,
  weekdayIndex,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  AvailableSlot,
  GetAvailabilityInput,
} from "../calendar/calendar-provider.js";
import { AtendlyServiceService } from "../services/atendly-service-service.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

interface Interval {
  start: number;
  end: number;
}

interface BusyInterval {
  start: Date;
  end: Date;
}

export class AtendlyAvailability {
  constructor(
    private readonly database: DatabaseClient,
    private readonly tenantId: string,
    private readonly timeZone: string,
  ) {}

  async getAvailableSlots(
    input: GetAvailabilityInput,
  ): Promise<AvailableSlot[]> {
    const services = await new AtendlyServiceService(
      this.database,
      this.tenantId,
    ).requireActive(input.serviceIds);
    return this.findSlots({
      ...input,
      durationMinutes: services.reduce(
        (total, service) => total + service.durationMinutes,
        0,
      ),
    });
  }

  async assertAvailable(input: {
    date: string;
    startTime: string;
    durationMinutes: number;
    stepMinutes: number;
    excludeAppointmentId?: string;
  }): Promise<{ startAt: Date; endAt: Date }> {
    const slots = await this.findSlots({
      startDate: input.date,
      days: 1,
      stepMinutes: input.stepMinutes,
      maxSlots: 2_000,
      serviceIds: [],
      durationMinutes: input.durationMinutes,
      excludeAppointmentId: input.excludeAppointmentId,
    });
    const slot = slots.find(
      (candidate) =>
        candidate.date === input.date &&
        candidate.startTime === input.startTime,
    );
    if (!slot) {
      throw new AppError(
        "SLOT_UNAVAILABLE",
        "Slot is unavailable for the service duration.",
        409,
      );
    }
    const startAt = localDateTimeToInstant(
      slot.date,
      slot.startTime,
      this.timeZone,
    );
    return { startAt, endAt: addMinutes(startAt, input.durationMinutes) };
  }

  private async findSlots(
    input: GetAvailabilityInput & {
      durationMinutes: number;
      excludeAppointmentId?: string;
    },
  ): Promise<AvailableSlot[]> {
    if (input.durationMinutes <= 0) {
      throw new AppError(
        "INVALID_SERVICE_DURATION",
        "Appointment duration must be positive.",
        400,
      );
    }

    const endDateExclusive = addDays(input.startDate, input.days);
    const rangeStart = localDateTimeToInstant(
      input.startDate,
      "00:00",
      this.timeZone,
    );
    const rangeEnd = localDateTimeToInstant(
      endDateExclusive,
      "00:00",
      this.timeZone,
    );
    const databaseStartDate = new Date(`${input.startDate}T00:00:00.000Z`);
    const databaseEndDate = new Date(`${endDateExclusive}T00:00:00.000Z`);

    const [rules, exceptions, timeBlocks, appointments] = await Promise.all([
      this.database.availabilityRule.findMany({
        where: { tenantId: this.tenantId, active: true },
      }),
      this.database.availabilityException.findMany({
        where: {
          tenantId: this.tenantId,
          date: { gte: databaseStartDate, lt: databaseEndDate },
        },
      }),
      this.database.timeBlock.findMany({
        where: {
          tenantId: this.tenantId,
          startAt: { lt: rangeEnd },
          endAt: { gt: rangeStart },
        },
      }),
      this.database.appointment.findMany({
        where: {
          tenantId: this.tenantId,
          status: { not: "CANCELLED" },
          startAt: { lt: rangeEnd },
          endAt: { gt: rangeStart },
          ...(input.excludeAppointmentId
            ? { id: { not: input.excludeAppointmentId } }
            : {}),
        },
      }),
    ]);

    const busy: BusyInterval[] = [
      ...timeBlocks.map((block) => ({
        start: block.startAt,
        end: block.endAt,
      })),
      ...appointments.map((appointment) => ({
        start: appointment.startAt,
        end: appointment.endAt,
      })),
    ];
    const slots: AvailableSlot[] = [];
    const now = new Date();

    for (let offset = 0; offset < input.days; offset += 1) {
      const date = addDays(input.startDate, offset);
      const intervals = resolveIntervals(
        rules
          .filter((rule) => rule.dayOfWeek === weekdayIndex(date))
          .map((rule) => ({
            start: databaseTimeToMinutes(rule.startTime),
            end: databaseTimeToMinutes(rule.endTime),
          })),
        exceptions
          .filter((exception) => databaseDate(exception.date) === date)
          .map((exception) => ({
            available: exception.available,
            start:
              exception.startTime === null
                ? 0
                : databaseTimeToMinutes(exception.startTime),
            end:
              exception.endTime === null
                ? 24 * 60
                : databaseTimeToMinutes(exception.endTime),
          })),
      );

      for (const interval of intervals) {
        const intervalEnd = instantForMinute(date, interval.end, this.timeZone);
        for (
          let start = interval.start;
          start < interval.end;
          start += input.stepMinutes
        ) {
          const startAt = instantForMinute(date, start, this.timeZone);
          const endAt = addMinutes(startAt, input.durationMinutes);
          if (endAt > intervalEnd) break;
          if (startAt <= now) continue;
          if (
            busy.some((item) => overlaps(startAt, endAt, item.start, item.end))
          ) {
            continue;
          }

          const localEnd = instantToLocalDateTime(endAt, this.timeZone);
          slots.push({
            date,
            startTime: timeFromMinutes(start),
            endTime: localEnd.time,
          });
          if (slots.length >= input.maxSlots) return slots;
        }
      }
    }

    return slots;
  }
}

function resolveIntervals(
  rules: Interval[],
  exceptions: Array<Interval & { available: boolean }>,
): Interval[] {
  const additions = exceptions
    .filter((exception) => exception.available)
    .map(({ start, end }) => ({ start, end }));
  const removals = exceptions
    .filter((exception) => !exception.available)
    .map(({ start, end }) => ({ start, end }));
  let intervals = mergeIntervals([...rules, ...additions]);
  for (const removal of removals) {
    intervals = intervals.flatMap((interval) => subtract(interval, removal));
  }
  return mergeIntervals(intervals);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.start < interval.end)
    .sort((left, right) => left.start - right.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

function subtract(interval: Interval, removal: Interval): Interval[] {
  if (removal.end <= interval.start || removal.start >= interval.end) {
    return [interval];
  }
  const result: Interval[] = [];
  if (removal.start > interval.start) {
    result.push({ start: interval.start, end: removal.start });
  }
  if (removal.end < interval.end) {
    result.push({ start: removal.end, end: interval.end });
  }
  return result;
}

function instantForMinute(
  date: string,
  minute: number,
  timeZone: string,
): Date {
  if (minute === 24 * 60) {
    return localDateTimeToInstant(addDays(date, 1), "00:00", timeZone);
  }
  return localDateTimeToInstant(date, timeFromMinutes(minute), timeZone);
}
