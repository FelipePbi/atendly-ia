import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import { isOperationalService } from "../services/atendly-service-service.js";
import type {
  CalendarAppointment,
  CancelCalendarAppointmentInput,
  CreateCalendarAppointmentInput,
  GetAvailabilityInput,
  ListAppointmentsInput,
  RescheduleCalendarAppointmentInput,
} from "./calendar-provider.js";
import { CalendarMutationIdempotency } from "./idempotency.js";
import { CalendarProviderFactory } from "./provider-factory.js";

const calendarAppointmentSchema: z.ZodType<CalendarAppointment> = z.object({
  id: z.string(),
  source: z.enum(["AI", "USER", "INTEGRATION"]),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number(),
  customerId: z.string().nullable(),
  customer: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      phone: z.string().nullable(),
    })
    .nullable(),
  services: z.array(
    z.object({
      serviceId: z.string(),
      name: z.string(),
      durationMinutes: z.number().nullable(),
      priceType: z
        .enum(["FIXED", "STARTING_AT", "ON_REQUEST", "NOT_INFORMED"])
        .default("FIXED"),
      price: z.number().nullable(),
    }),
  ),
  totalPrice: z.number().nullable(),
  totalPriceType: z.enum(["FIXED", "STARTING_AT", "NONE"]).default("NONE"),
  comments: z.string().nullable(),
  status: z.string(),
});

export interface CalendarRequestContext {
  tenantId: string;
  userId: string;
  requestId: string;
}

export class CalendarService {
  private readonly providerFactory: CalendarProviderFactory;
  private readonly idempotency: CalendarMutationIdempotency;

  constructor(private readonly prisma: PrismaClient) {
    this.providerFactory = new CalendarProviderFactory(prisma);
    this.idempotency = new CalendarMutationIdempotency(prisma);
  }

  /** Catálogo completo da fonte vigente: serviço em revisão continua listável (Goal007). */
  async listServices(context: CalendarRequestContext) {
    return (await this.provider(context)).listServices();
  }

  /**
   * "Operacional" (Goal007): o mesmo predicado para todas as fontes, usado
   * por `/internal/services` (o que a IA pode oferecer) e pela capacidade de
   * ativação lida pelo BFF. A Agenda Atendly já filtra em `listForScheduling`;
   * a origem externa não tem estado de revisão, então só ativo e duração
   * conhecida se aplicam.
   */
  async listOperationalServices(context: CalendarRequestContext) {
    const services = await this.listServices(context);
    return services.filter((service) =>
      isOperationalService({
        active: service.active,
        durationMinutes: service.durationMinutes,
        needsReview: false,
      }),
    );
  }

  async listAppointments(
    context: CalendarRequestContext,
    input: ListAppointmentsInput,
  ) {
    return (await this.provider(context)).listAppointments(input);
  }

  async getAppointment(context: CalendarRequestContext, appointmentId: string) {
    return (await this.provider(context)).getAppointment(appointmentId);
  }

  async getAvailability(
    context: CalendarRequestContext,
    input: GetAvailabilityInput,
  ) {
    return (await this.provider(context)).getAvailability(input);
  }

  async createAppointment(
    context: CalendarRequestContext,
    input: CreateCalendarAppointmentInput,
  ) {
    return this.idempotency.execute({
      tenantId: context.tenantId,
      key: input.idempotencyKey,
      operation: "CREATE_APPOINTMENT",
      request: input,
      execute: async () =>
        (await this.provider(context)).createAppointment(input),
      parseResponse: (value) => calendarAppointmentSchema.parse(value),
    });
  }

  async rescheduleAppointment(
    context: CalendarRequestContext,
    input: RescheduleCalendarAppointmentInput,
  ) {
    return this.idempotency.execute({
      tenantId: context.tenantId,
      key: input.idempotencyKey,
      operation: "RESCHEDULE_APPOINTMENT",
      request: input,
      execute: async () =>
        (await this.provider(context)).rescheduleAppointment(input),
      parseResponse: (value) => calendarAppointmentSchema.parse(value),
    });
  }

  async cancelAppointment(
    context: CalendarRequestContext,
    input: CancelCalendarAppointmentInput,
  ) {
    return this.idempotency.execute({
      tenantId: context.tenantId,
      key: input.idempotencyKey,
      operation: "CANCEL_APPOINTMENT",
      request: input,
      execute: async () =>
        (await this.provider(context)).cancelAppointment(input),
      parseResponse: (value) => calendarAppointmentSchema.parse(value),
    });
  }

  private async provider(context: CalendarRequestContext) {
    const settings = await this.prisma.calendarSettings.findUnique({
      where: { tenantId: context.tenantId },
    });
    if (!settings) {
      throw new AppError(
        "CALENDAR_SETTINGS_NOT_FOUND",
        "Calendar settings were not found for this tenant.",
        404,
      );
    }
    return this.providerFactory.create({
      tenantId: context.tenantId,
      userId: context.userId,
      timeZone: settings.timezone,
      source: settings.source,
    });
  }
}
