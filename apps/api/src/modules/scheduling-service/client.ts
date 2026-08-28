import { z } from "zod";

import { env } from "../../config/env.js";
import { addDays, todayInTimeZone } from "../../lib/dates.js";
import { AppError } from "../../lib/errors.js";
import type { BusinessSettingsDTO } from "../business-settings/business-settings.js";
import type {
  RescheduleAppointmentInput,
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingRequestContext,
  SchedulingServiceDefinition,
} from "./types.js";

const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  durationMinutes: z.number(),
  price: z.number(),
  active: z.boolean(),
  colorId: z.number().nullable().optional(),
});
const appointmentSchema = z.object({
  id: z.string(),
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
      durationMinutes: z.number(),
      price: z.number(),
    }),
  ),
  totalPrice: z.number(),
  comments: z.string().nullable(),
  status: z.string(),
});
const slotSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});

export interface SchedulingServiceGateway {
  listActiveServices(
    context?: SchedulingRequestContext,
  ): Promise<SchedulingServiceDefinition[]>;
  findService(
    serviceId: number,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingServiceDefinition>;
  getAvailableSlotsForServices(
    serviceIds: number[],
    startDate: string | undefined,
    businessSettings: BusinessSettingsDTO,
    context?: SchedulingRequestContext,
  ): Promise<Array<{ date: string; startTime: string; endTime: string }>>;
  createAppointment(
    input: ScheduleAppointmentInput,
    businessSettings: BusinessSettingsDTO,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingAppointment>;
  findFutureAppointmentsForPhone(
    phone: string,
    businessSettings: BusinessSettingsDTO,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingAppointment[]>;
  cancelAppointment(
    appointmentId: number,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<{ appointmentId: number; cancelled: true }>;
  rescheduleAppointment(
    input: RescheduleAppointmentInput,
    businessSettings: BusinessSettingsDTO,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingAppointment>;
}

export class SchedulingServiceClient implements SchedulingServiceGateway {
  async listActiveServices(context?: SchedulingRequestContext) {
    return (
      await this.request("/internal/services", serviceSchema.array(), {
        context,
      })
    )
      .filter((service) => service.active)
      .map(toService);
  }

  async findService(serviceId: number, context?: SchedulingRequestContext) {
    const service = (await this.listActiveServices(context)).find(
      (item) => item.id === serviceId,
    );
    if (!service) {
      throw new AppError("Servico nao encontrado na agenda.", {
        statusCode: 404,
        code: "SERVICE_NOT_FOUND",
      });
    }
    return service;
  }

  async getAvailableSlotsForServices(
    serviceIds: number[],
    startDate: string | undefined,
    businessSettings: BusinessSettingsDTO,
    context?: SchedulingRequestContext,
  ) {
    const query = new URLSearchParams({
      serviceIds: serviceIds.join(","),
      startDate: startDate ?? todayInTimeZone(businessSettings.timezone),
      days: String(businessSettings.availabilityDays),
      stepMinutes: String(businessSettings.slotStepMinutes),
      maxSlots: String(businessSettings.maxSlotsToOffer),
    });
    return this.request(
      `/internal/availability?${query.toString()}`,
      slotSchema.array(),
      { context },
    );
  }

  async createAppointment(
    input: ScheduleAppointmentInput,
    businessSettings: BusinessSettingsDTO,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ) {
    const serviceIds = input.serviceIds ?? [input.serviceId];
    return toAppointment(
      await this.request("/internal/appointments", appointmentSchema, {
        method: "POST",
        context,
        idempotencyKey,
        body: {
          serviceIds: serviceIds.map(String),
          date: input.date,
          startTime: input.startTime,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          comments: input.comments,
          stepMinutes: businessSettings.slotStepMinutes,
        },
      }),
    );
  }

  async findFutureAppointmentsForPhone(
    phone: string,
    businessSettings: BusinessSettingsDTO,
    context?: SchedulingRequestContext,
  ) {
    const startDate = todayInTimeZone(businessSettings.timezone);
    const query = new URLSearchParams({
      customerPhone: phone,
      startDate,
      endDate: addDays(startDate, businessSettings.appointmentLookupDays),
    });
    return (
      await this.request(
        `/internal/appointments?${query.toString()}`,
        appointmentSchema.array(),
        { context },
      )
    ).map(toAppointment);
  }

  async cancelAppointment(
    appointmentId: number,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<{ appointmentId: number; cancelled: true }> {
    await this.request(
      `/internal/appointments/${appointmentId}/cancel`,
      appointmentSchema,
      { method: "POST", context, idempotencyKey, body: {} },
    );
    return { appointmentId, cancelled: true };
  }

  async rescheduleAppointment(
    input: RescheduleAppointmentInput,
    businessSettings: BusinessSettingsDTO,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ) {
    return toAppointment(
      await this.request(
        `/internal/appointments/${input.appointmentId}/reschedule`,
        appointmentSchema,
        {
          method: "POST",
          context,
          idempotencyKey,
          body: {
            date: input.date,
            startTime: input.startTime,
            stepMinutes: businessSettings.slotStepMinutes,
          },
        },
      ),
    );
  }

  private async request<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: {
      method?: "GET" | "POST";
      body?: unknown;
      context?: SchedulingRequestContext;
      idempotencyKey?: string;
    },
  ): Promise<z.output<TSchema>> {
    const context = requireContext(options.context);
    const response = await fetch(
      `${env.SCHEDULING_SERVICE_BASE_URL.replace(/\/$/, "")}${path}`,
      {
        method: options.method ?? "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}`,
          "x-tenant-id": context.tenantId,
          "x-user-id": context.userId,
          "x-request-id": context.requestId,
          ...(options.idempotencyKey
            ? { "idempotency-key": options.idempotencyKey }
            : {}),
          ...(options.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const text = await response.text();
    const payload = text ? parseJson(text) : null;
    if (!response.ok) {
      const error = extractUpstreamError(payload);
      throw new AppError(error.message, {
        statusCode: response.status >= 500 ? 502 : response.status,
        code: error.code,
      });
    }
    const parsed = z.object({ data: z.unknown() }).safeParse(payload);
    if (!parsed.success) {
      throw new AppError("Scheduling Service returned an invalid response.", {
        statusCode: 502,
        code: "SCHEDULING_INVALID_RESPONSE",
      });
    }
    return schema.parse(parsed.data.data);
  }
}

function requireContext(
  context: SchedulingRequestContext | undefined,
): SchedulingRequestContext {
  if (!context?.tenantId || !context.userId || !context.requestId) {
    throw new AppError("Trusted scheduling context is required.", {
      statusCode: 500,
      code: "SCHEDULING_CONTEXT_REQUIRED",
    });
  }
  if (!env.INTERNAL_SERVICE_TOKEN) {
    throw new AppError("Scheduling Service authentication is not configured.", {
      statusCode: 500,
      code: "SCHEDULING_AUTH_NOT_CONFIGURED",
    });
  }
  return context;
}

function toService(
  service: z.output<typeof serviceSchema>,
): SchedulingServiceDefinition {
  return {
    id: externalNumber(service.id),
    name: service.name,
    duration: service.durationMinutes,
    price: service.price,
    colorId: service.colorId ?? null,
  };
}

function toAppointment(
  appointment: z.output<typeof appointmentSchema>,
): SchedulingAppointment {
  const services = appointment.services.map((service) => ({
    serviceId: externalNumber(service.serviceId),
    name: service.name,
    duration: service.durationMinutes,
    price: service.price,
  }));
  return {
    id: externalNumber(appointment.id),
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    duration: appointment.durationMinutes,
    customerId: appointment.customerId
      ? externalNumber(appointment.customerId)
      : null,
    customer: appointment.customer
      ? {
          id: externalNumber(appointment.customer.id),
          name: appointment.customer.name,
          phone: appointment.customer.phone,
        }
      : null,
    services,
    price: appointment.totalPrice,
    comments: appointment.comments,
    status: appointment.status,
    serviceId: services[0]?.serviceId ?? null,
    serviceIds: services.map((service) => service.serviceId),
    serviceName: services.map((service) => service.name).join(", ") || null,
    customerName: appointment.customer?.name ?? null,
  };
}

function externalNumber(value: string): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) {
    throw new AppError("Unsupported external calendar identifier.", {
      statusCode: 502,
      code: "SCHEDULING_INVALID_EXTERNAL_ID",
    });
  }
  return result;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractUpstreamError(value: unknown): {
  code: string;
  message: string;
} {
  const parsed = z
    .object({ error: z.object({ code: z.string(), message: z.string() }) })
    .safeParse(value);
  return parsed.success
    ? parsed.data.error
    : {
        code: "SCHEDULING_UPSTREAM_ERROR",
        message: "Scheduling Service request failed.",
      };
}
