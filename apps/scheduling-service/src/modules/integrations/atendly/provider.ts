import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import {
  addDays,
  instantToLocalDateTime,
  localDateTimeToInstant,
} from "../../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { AtendlyAvailability } from "../../availability/atendly-availability.js";
import type {
  AvailableSlot,
  CalendarAppointment,
  CalendarProvider,
  CalendarServiceDefinition,
  CancelCalendarAppointmentInput,
  CreateCalendarAppointmentInput,
  GetAvailabilityInput,
  ListAppointmentsInput,
  RescheduleCalendarAppointmentInput,
} from "../../calendar/calendar-provider.js";
import { AtendlyCustomerService } from "../../customers/atendly-customer-service.js";
import { AtendlyServiceService } from "../../services/atendly-service-service.js";

const appointmentInclude = {
  customer: true,
  items: true,
} satisfies Prisma.AppointmentInclude;

type AppointmentRecord = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

export class AtendlyCalendarProvider implements CalendarProvider {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tenantId: string,
    private readonly userId: string,
    private readonly timeZone: string,
  ) {}

  async listServices(): Promise<CalendarServiceDefinition[]> {
    return new AtendlyServiceService(
      this.prisma,
      this.tenantId,
    ).listForScheduling();
  }

  async listAppointments(
    input: ListAppointmentsInput,
  ): Promise<CalendarAppointment[]> {
    const customer = input.customerPhone
      ? await new AtendlyCustomerService(
          this.prisma,
          this.tenantId,
        ).findByPhone(input.customerPhone)
      : null;
    if (input.customerPhone && !customer) return [];

    const rangeStart = localDateTimeToInstant(
      input.startDate,
      "00:00",
      this.timeZone,
    );
    const rangeEnd = localDateTimeToInstant(
      addDays(input.endDate, 1),
      "00:00",
      this.timeZone,
    );
    if (rangeEnd <= rangeStart) {
      throw new AppError(
        "INVALID_DATE_RANGE",
        "Appointment end date must not precede start date.",
        400,
      );
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.tenantId,
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
        ...(customer ? { customerId: customer.id } : {}),
      },
      include: appointmentInclude,
      orderBy: { startAt: "asc" },
    });
    return appointments.map((appointment) => this.toAppointment(appointment));
  }

  async getAppointment(appointmentId: string): Promise<CalendarAppointment> {
    return this.toAppointment(await this.requireAppointment(appointmentId));
  }

  async getAvailability(input: GetAvailabilityInput): Promise<AvailableSlot[]> {
    return new AtendlyAvailability(
      this.prisma,
      this.tenantId,
      this.timeZone,
    ).getAvailableSlots(input);
  }

  async createAppointment(
    input: CreateCalendarAppointmentInput,
  ): Promise<CalendarAppointment> {
    const services = await new AtendlyServiceService(
      this.prisma,
      this.tenantId,
    ).requireActive(input.serviceIds);
    const customer = await new AtendlyCustomerService(
      this.prisma,
      this.tenantId,
    ).create({ name: input.customerName, phone: input.customerPhone });
    const durationMinutes = services.reduce(
      (total, service) => total + service.durationMinutes,
      0,
    );
    await new AtendlyAvailability(
      this.prisma,
      this.tenantId,
      this.timeZone,
    ).assertAvailable({
      date: input.date,
      startTime: input.startTime,
      durationMinutes,
      stepMinutes: input.stepMinutes,
    });

    const appointment = await this.prisma.$transaction(
      async (transaction) => {
        await lockCalendarDay(transaction, this.tenantId, input.date);
        const slot = await new AtendlyAvailability(
          transaction,
          this.tenantId,
          this.timeZone,
        ).assertAvailable({
          date: input.date,
          startTime: input.startTime,
          durationMinutes,
          stepMinutes: input.stepMinutes,
        });
        return transaction.appointment.create({
          data: {
            source: input.source ?? "AI",
            startAt: slot.startAt,
            endAt: slot.endAt,
            status: "SCHEDULED",
            createdBy: this.userId,
            comments: input.comments ?? null,
            customer: {
              connect: {
                tenantId_id: {
                  tenantId: this.tenantId,
                  id: customer.id,
                },
              },
            },
            items: {
              create: services.map((service) => ({
                serviceNameSnapshot: service.name,
                durationMinutesSnapshot: service.durationMinutes,
                priceTypeSnapshot: service.priceType,
                priceSnapshot: service.price,
                service: {
                  connect: {
                    tenantId_id: {
                      tenantId: this.tenantId,
                      id: service.id,
                    },
                  },
                },
              })),
            },
          },
          include: appointmentInclude,
        });
      },
      { isolationLevel: "Serializable" },
    );
    return this.toAppointment(appointment);
  }

  async rescheduleAppointment(
    input: RescheduleCalendarAppointmentInput,
  ): Promise<CalendarAppointment> {
    const current = await this.requireAppointment(input.appointmentId);
    assertCanReschedule(current);
    const durationMinutes = appointmentDuration(current);
    await new AtendlyAvailability(
      this.prisma,
      this.tenantId,
      this.timeZone,
    ).assertAvailable({
      date: input.date,
      startTime: input.startTime,
      durationMinutes,
      stepMinutes: input.stepMinutes,
      excludeAppointmentId: current.id,
    });

    const appointment = await this.prisma.$transaction(
      async (transaction) => {
        await lockCalendarDay(transaction, this.tenantId, input.date);
        const persisted = await transaction.appointment.findUnique({
          where: {
            tenantId_id: {
              tenantId: this.tenantId,
              id: input.appointmentId,
            },
          },
          include: appointmentInclude,
        });
        if (!persisted) appointmentNotFound();
        assertCanReschedule(persisted);
        const persistedDuration = appointmentDuration(persisted);
        const slot = await new AtendlyAvailability(
          transaction,
          this.tenantId,
          this.timeZone,
        ).assertAvailable({
          date: input.date,
          startTime: input.startTime,
          durationMinutes: persistedDuration,
          stepMinutes: input.stepMinutes,
          excludeAppointmentId: persisted.id,
        });
        return transaction.appointment.update({
          where: {
            tenantId_id: {
              tenantId: this.tenantId,
              id: persisted.id,
            },
          },
          data: { startAt: slot.startAt, endAt: slot.endAt },
          include: appointmentInclude,
        });
      },
      { isolationLevel: "Serializable" },
    );
    return this.toAppointment(appointment);
  }

  async cancelAppointment(
    input: CancelCalendarAppointmentInput,
  ): Promise<CalendarAppointment> {
    const current = await this.requireAppointment(input.appointmentId);
    if (current.status === "CANCELLED") return this.toAppointment(current);
    const appointment = await this.prisma.appointment.update({
      where: {
        tenantId_id: { tenantId: this.tenantId, id: current.id },
      },
      data: {
        status: "CANCELLED",
        comments: appendComment(current.comments, input.comments),
      },
      include: appointmentInclude,
    });
    return this.toAppointment(appointment);
  }

  private async requireAppointment(
    appointmentId: string,
  ): Promise<AppointmentRecord> {
    const appointment = await this.prisma.appointment.findUnique({
      where: {
        tenantId_id: { tenantId: this.tenantId, id: appointmentId },
      },
      include: appointmentInclude,
    });
    if (!appointment) appointmentNotFound();
    return appointment;
  }

  private toAppointment(appointment: AppointmentRecord): CalendarAppointment {
    const start = instantToLocalDateTime(appointment.startAt, this.timeZone);
    const end = instantToLocalDateTime(appointment.endAt, this.timeZone);
    const services = appointment.items.map((item) => ({
      serviceId: item.serviceId,
      name: item.serviceNameSnapshot,
      durationMinutes: item.durationMinutesSnapshot,
      priceType: item.priceTypeSnapshot,
      price: item.priceSnapshot === null ? null : Number(item.priceSnapshot),
    }));
    const hasOnRequestPrice = services.some(
      (service) => service.priceType === "ON_REQUEST",
    );
    return {
      id: appointment.id,
      source: appointment.source,
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      durationMinutes: Math.round(
        (appointment.endAt.getTime() - appointment.startAt.getTime()) / 60_000,
      ),
      customerId: appointment.customerId,
      customer: {
        id: appointment.customer.id,
        name: appointment.customer.name,
        phone: appointment.customer.phone,
      },
      services,
      totalPrice: hasOnRequestPrice
        ? null
        : services.reduce((total, service) => total + (service.price ?? 0), 0),
      comments: appointment.comments,
      status: appointment.status,
    };
  }
}

async function lockCalendarDay(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  date: string,
): Promise<void> {
  await transaction.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${date}`}))`,
  );
}

function appointmentDuration(appointment: AppointmentRecord): number {
  const duration = appointment.items.reduce(
    (total, item) => total + item.durationMinutesSnapshot,
    0,
  );
  if (duration <= 0) {
    throw new AppError(
      "APPOINTMENT_DURATION_INVALID",
      "Appointment has no valid service duration snapshot.",
      409,
    );
  }
  return duration;
}

function assertCanReschedule(appointment: AppointmentRecord): void {
  if (appointment.status === "CANCELLED") {
    throw new AppError(
      "APPOINTMENT_CANCELLED",
      "Cancelled appointment cannot be rescheduled.",
      409,
    );
  }
}

function appointmentNotFound(): never {
  throw new AppError(
    "APPOINTMENT_NOT_FOUND",
    "Appointment was not found.",
    404,
  );
}

function appendComment(
  current: string | null,
  cancellation: string | undefined,
): string | null {
  const next = cancellation?.trim();
  if (!next) return current;
  return current ? `${current}\n${next}` : next;
}
