import { z } from "zod";

import { env } from "../../config/env.js";
import { addDays, todayInTimeZone } from "../../lib/dates.js";
import { AppError } from "../../lib/errors.js";
import {
  CALLER_ID,
  deriveInternalToken,
} from "../../lib/internal-credentials.js";
import type { BusinessContext } from "../tenant-config/business-context.js";
import type {
  ConfirmAppointmentSeriesInput,
  CreateSchedulingHoldInput,
  PreviewAppointmentSeriesInput,
  RescheduleAppointmentInput,
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingAuthorizedCustomerContext,
  SchedulingCustomerCandidate,
  SchedulingHold,
  SchedulingRequestContext,
  SchedulingSeriesOccurrencePreview,
  SchedulingServiceDefinition,
} from "./types.js";

const priceTypeSchema = z.enum([
  "FIXED",
  "STARTING_AT",
  "ON_REQUEST",
  "NOT_INFORMED",
]);
const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  // `/internal/services` so devolve servico operacional (Goal007): duracao
  // sempre presente aqui.
  durationMinutes: z.number(),
  priceType: priceTypeSchema,
  price: z.number().nullable(),
  active: z.boolean(),
  colorId: z.number().nullable().optional(),
});
const appointmentSchema = z.object({
  id: z.string(),
  // Atendimento manual excepcional sem servico cadastrado (Goal008). O
  // default mantem decodavel toda resposta anterior a este Goal, inclusive
  // replay de idempotencia gravado antes dele.
  title: z.string().nullable().default(null),
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
      priceType: priceTypeSchema,
      price: z.number().nullable(),
    }),
  ),
  totalPrice: z.number().nullable(),
  totalPriceType: z.enum(["FIXED", "STARTING_AT", "NONE"]).default("NONE"),
  comments: z.string().nullable(),
  status: z.string(),
});
const customerCandidateSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
});
const customerListSchema = z.object({
  items: z.array(customerCandidateSchema),
  source: z.string(),
  managedExternally: z.boolean(),
  filteredByPhone: z.boolean().optional(),
});
const authorizedCustomerSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  notes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  primaryGuardian: z
    .object({ guardian: z.object({ id: z.string(), name: z.string().nullable() }) })
    .nullable()
    .default(null),
});
const slotSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});
const holdSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number(),
  serviceIds: z.array(z.string()),
  customerId: z.string().nullable(),
  contactRef: z.string().nullable(),
  source: z.enum(["AI", "USER"]),
  expiresAt: z.string(),
  status: z.enum(["ACTIVE", "CONSUMED", "RELEASED", "EXPIRED"]),
});
const seriesOccurrenceSchema = z.object({
  index: z.number(),
  requestedDate: z.string(),
  date: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  adjusted: z.boolean(),
  holdId: z.string().nullable(),
  unavailable: z.boolean(),
});
const DEFAULT_AVAILABILITY_DAYS = 14;
const DEFAULT_APPOINTMENT_LOOKUP_DAYS = 90;
const DEFAULT_MAX_SLOTS = 3;
const DEFAULT_SLOT_STEP_MINUTES = 30;

export interface SchedulingGateway {
  listActiveServices(
    context?: SchedulingRequestContext,
  ): Promise<SchedulingServiceDefinition[]>;
  findService(
    serviceId: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingServiceDefinition>;
  getAvailableSlotsForServices(
    serviceIds: string[],
    startDate: string | undefined,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
  ): Promise<Array<{ date: string; startTime: string; endTime: string }>>;
  createAppointment(
    input: ScheduleAppointmentInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingAppointment>;
  findFutureAppointmentsForPhone(
    phone: string,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingAppointment[]>;
  findFutureAppointmentsForCustomer(
    customerId: string,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingAppointment[]>;
  findCustomerCandidatesByPhone(
    phone: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingCustomerCandidate[]>;
  getAuthorizedCustomerContext(
    customerId: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingAuthorizedCustomerContext>;
  cancelAppointment(
    appointmentId: string,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<{ appointmentId: string; cancelled: true }>;
  rescheduleAppointment(
    input: RescheduleAppointmentInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingAppointment>;
  /**
   * Hold (Goal008): segura o horário proposto enquanto a cliente decide.
   *
   * Não há `createManualAppointment` nem parâmetro de sobreposição em lugar
   * nenhum desta interface, de propósito: o que a IA não consegue expressar
   * ela não consegue fazer por engano.
   */
  createHold(
    input: CreateSchedulingHoldInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingHold>;
  releaseHold(
    holdId: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingHold>;
  /**
   * Recorrência de atendimento (Goal009): pré-visualização cria um hold por
   * ocorrência ajustada à grade do negócio. Nunca decide granularidade nem
   * antecedência — o motor decide, como em `get_availability`.
   */
  previewAppointmentSeries(
    input: PreviewAppointmentSeriesInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingSeriesOccurrencePreview[]>;
  /**
   * Confirmação atômica: consome todos os holds da série de uma vez. Hold
   * vencido não confirma nada — a resposta identifica a ocorrência e a IA
   * consulta de novo, nunca força.
   */
  confirmAppointmentSeries(
    input: ConfirmAppointmentSeriesInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingAppointment[]>;
}

export class SchedulingClient implements SchedulingGateway {
  async listActiveServices(context?: SchedulingRequestContext) {
    return (
      await this.request("/internal/services", serviceSchema.array(), {
        context,
      })
    )
      .filter((service) => service.active)
      .map(toService);
  }

  async findService(serviceId: string, context?: SchedulingRequestContext) {
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
    serviceIds: string[],
    startDate: string | undefined,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
  ) {
    // Sem `stepMinutes` (Goal009): a granularidade da oferta é sempre a do
    // negócio, decidida pelo motor de disponibilidade — a IA não propõe a
    // própria grade.
    const query = new URLSearchParams({
      serviceIds: serviceIds.join(","),
      startDate: startDate ?? todayInTimeZone(businessContext.timezone),
      days: String(DEFAULT_AVAILABILITY_DAYS),
      maxSlots: String(DEFAULT_MAX_SLOTS),
    });
    return this.request(
      `/internal/availability?${query.toString()}`,
      slotSchema.array(),
      { context },
    );
  }

  async createAppointment(
    input: ScheduleAppointmentInput,
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
          // Pessoa resolvida vence: sem `customerId`, o Scheduling cria o
          // cadastro dentro da transação de confirmação.
          customerId: input.customerId ?? undefined,
          customerName: input.customerName ?? undefined,
          customerPhone: input.customerPhone ?? undefined,
          comments: input.comments,
          stepMinutes: DEFAULT_SLOT_STEP_MINUTES,
          // O hold criado ao propor. Vencido, o Scheduling recusa com
          // `APPOINTMENT_HOLD_EXPIRED` em vez de confirmar assim mesmo.
          holdId: input.holdId ?? undefined,
        },
      }),
    );
  }

  /** Segura o horário proposto; sempre `source: AI`, nunca override. */
  async createHold(
    input: CreateSchedulingHoldInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingHold> {
    return toHold(
      await this.request("/internal/holds", holdSchema, {
        method: "POST",
        context,
        idempotencyKey,
        body: {
          source: "AI",
          serviceIds: input.serviceIds.map(String),
          date: input.date,
          startTime: input.startTime,
          stepMinutes: DEFAULT_SLOT_STEP_MINUTES,
          customerId: input.customerId ?? undefined,
          contactRef: input.contactRef ?? undefined,
        },
      }),
    );
  }

  async releaseHold(
    holdId: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingHold> {
    return toHold(
      await this.request(
        `/internal/holds/${encodeURIComponent(holdId)}`,
        holdSchema,
        { method: "DELETE", context },
      ),
    );
  }

  async previewAppointmentSeries(
    input: PreviewAppointmentSeriesInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingSeriesOccurrencePreview[]> {
    return this.request(
      "/internal/appointments/series/preview",
      seriesOccurrenceSchema.array(),
      {
        method: "POST",
        context,
        idempotencyKey,
        body: {
          serviceIds: input.serviceIds.map(String),
          occurrenceCount: input.occurrenceCount,
          intervalDays: input.intervalDays,
          firstDate: input.firstDate,
          firstStartTime: input.firstStartTime,
          customerId: input.customerId ?? undefined,
          contactRef: input.contactRef ?? undefined,
        },
      },
    );
  }

  async confirmAppointmentSeries(
    input: ConfirmAppointmentSeriesInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingAppointment[]> {
    return (
      await this.request(
        "/internal/appointments/series/confirm",
        appointmentSchema.array(),
        {
          method: "POST",
          context,
          idempotencyKey,
          body: {
            occurrences: input.holdIds.map((holdId) => ({ holdId })),
            serviceIds: input.serviceIds.map(String),
            intervalDays: input.intervalDays,
            customerId: input.customerId ?? undefined,
            customerName: input.customerName ?? undefined,
            customerPhone: input.customerPhone ?? undefined,
            comments: input.comments,
          },
        },
      )
    ).map(toAppointment);
  }

  /**
   * Candidatos para o número do contato.
   *
   * Zero, um ou vários — o número não prova de quem é o atendimento, então a
   * escolha volta para a conversa em vez de ser adivinhada aqui.
   */
  async findCustomerCandidatesByPhone(
    phone: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingCustomerCandidate[]> {
    const query = new URLSearchParams({ phone });
    const result = await this.request(
      `/internal/customers?${query.toString()}`,
      customerListSchema,
      { context },
    );
    return result.items;
  }

  /** Só o que a pessoa autorizou explicitamente chega ao modelo. */
  async getAuthorizedCustomerContext(
    customerId: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingAuthorizedCustomerContext> {
    const authorized = await this.request(
      `/internal/customers/${encodeURIComponent(customerId)}/ai-context`,
      authorizedCustomerSchema,
      { context },
    );
    return {
      id: authorized.id,
      name: authorized.name,
      phone: authorized.phone,
      notes: authorized.notes,
      tags: authorized.tags,
      primaryGuardian: authorized.primaryGuardian
        ? {
            id: authorized.primaryGuardian.guardian.id,
            name: authorized.primaryGuardian.guardian.name,
          }
        : null,
    };
  }

  async findFutureAppointmentsForCustomer(
    customerId: string,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
  ) {
    const startDate = todayInTimeZone(businessContext.timezone);
    const query = new URLSearchParams({
      customerId,
      startDate,
      endDate: addDays(startDate, DEFAULT_APPOINTMENT_LOOKUP_DAYS),
    });
    return (
      await this.request(
        `/internal/appointments?${query.toString()}`,
        appointmentSchema.array(),
        { context },
      )
    ).map(toAppointment);
  }

  async findFutureAppointmentsForPhone(
    phone: string,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
  ) {
    const startDate = todayInTimeZone(businessContext.timezone);
    const query = new URLSearchParams({
      customerPhone: phone,
      startDate,
      endDate: addDays(startDate, DEFAULT_APPOINTMENT_LOOKUP_DAYS),
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
    appointmentId: string,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<{ appointmentId: string; cancelled: true }> {
    await this.request(
      `/internal/appointments/${appointmentId}/cancel`,
      appointmentSchema,
      { method: "POST", context, idempotencyKey, body: {} },
    );
    return { appointmentId, cancelled: true };
  }

  async rescheduleAppointment(
    input: RescheduleAppointmentInput,
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
            stepMinutes: DEFAULT_SLOT_STEP_MINUTES,
            // Hold do NOVO horário; o original segue ocupado pelo próprio
            // atendimento até esta transação commitar.
            holdId: input.holdId ?? undefined,
          },
        },
      ),
    );
  }

  private async request<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: {
      method?: "GET" | "POST" | "DELETE";
      body?: unknown;
      context?: SchedulingRequestContext;
      idempotencyKey?: string;
    },
  ): Promise<z.output<TSchema>> {
    const context = requireContext(options.context);
    const baseUrl = normalizeBaseUrl(env.SCHEDULING_SERVICE_BASE_URL);
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        // Credencial própria deste chamador/uso, distinta da que o BFF
        // apresenta e da que a IA aceita nas rotas internas.
        authorization: `Bearer ${schedulingCommandToken()}`,
        "x-service-audience": "scheduling-service",
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
    });
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

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  return /^https?:\/\//u.test(trimmed) ? trimmed : `http://${trimmed}`;
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
  if (!schedulingCommandToken()) {
    throw new AppError("Scheduling Service authentication is not configured.", {
      statusCode: 500,
      code: "SCHEDULING_AUTH_NOT_CONFIGURED",
    });
  }
  return context;
}

function schedulingCommandToken(): string {
  if (env.SCHEDULING_SERVICE_COMMAND_TOKEN) {
    return env.SCHEDULING_SERVICE_COMMAND_TOKEN;
  }
  if (!env.INTERNAL_SERVICE_TOKEN) return "";
  return deriveInternalToken(
    env.INTERNAL_SERVICE_TOKEN,
    CALLER_ID,
    "scheduling-service",
    "command",
  );
}

function toService(
  service: z.output<typeof serviceSchema>,
): SchedulingServiceDefinition {
  return {
    id: service.id,
    name: service.name,
    duration: service.durationMinutes,
    priceType: service.priceType,
    price: service.price,
    colorId: service.colorId ?? null,
  };
}

function toAppointment(
  appointment: z.output<typeof appointmentSchema>,
): SchedulingAppointment {
  const services = appointment.services.map((service) => ({
    serviceId: service.serviceId,
    name: service.name,
    duration: service.durationMinutes,
    priceType: service.priceType,
    price: service.price,
  }));
  return {
    id: appointment.id,
    title: appointment.title,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    duration: appointment.durationMinutes,
    customerId: appointment.customerId,
    customer: appointment.customer
      ? {
          id: appointment.customer.id,
          name: appointment.customer.name,
          phone: appointment.customer.phone,
        }
      : null,
    services,
    price: appointment.totalPrice,
    totalPriceType: appointment.totalPriceType,
    comments: appointment.comments,
    status: appointment.status,
    serviceId: services[0]?.serviceId ?? null,
    serviceIds: services.map((service) => service.serviceId),
    serviceName: services.map((service) => service.name).join(", ") || null,
    customerName: appointment.customer?.name ?? null,
  };
}

function toHold(hold: z.output<typeof holdSchema>): SchedulingHold {
  return {
    id: hold.id,
    date: hold.date,
    startTime: hold.startTime,
    endTime: hold.endTime,
    duration: hold.durationMinutes,
    serviceIds: hold.serviceIds,
    expiresAt: hold.expiresAt,
    status: hold.status,
  };
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
