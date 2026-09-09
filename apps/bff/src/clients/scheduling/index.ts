import { z } from "zod";

import { env } from "../../config/env.js";
import {
  InternalHttpClient,
  type InternalRequestContext,
} from "../internal-http-client.js";

const sourceSchema = z.enum(["ATENDLY", "MINHA_AGENDA"]);
const priceTypeSchema = z.enum([
  "FIXED",
  "STARTING_AT",
  "ON_REQUEST",
  "NOT_INFORMED",
]);
const serviceColorTokenSchema = z.enum([
  "ROSE",
  "AMBER",
  "EMERALD",
  "SKY",
  "VIOLET",
  "SLATE",
]);
const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Ausente e pendencia de revisao (Goal007); resposta antiga (sempre
  // presente) continua valida.
  durationMinutes: z.number().int().positive().nullable(),
  priceType: priceTypeSchema,
  price: z.number().nonnegative().nullable(),
  active: z.boolean(),
  needsReview: z.boolean().default(false),
  reviewOrigin: z.enum(["IMPORT", "MANUAL"]).nullable().default(null),
  description: z.string().nullable().default(null),
  colorToken: serviceColorTokenSchema.nullable().default(null),
  bufferBeforeMinutes: z.number().int().nonnegative().default(0),
  bufferAfterMinutes: z.number().int().nonnegative().default(0),
  recurrenceIntervalDays: z.number().int().positive().nullable().default(null),
});
const customerSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
const primaryGuardianSchema = z
  .object({
    id: z.string(),
    status: z.enum(["PROPOSED", "CONFIRMED"]),
    guardian: z.object({
      id: z.string(),
      name: z.string().nullable(),
      phone: z.string().nullable(),
    }),
    proposedBy: z.enum(["AI", "PROFESSIONAL", "CUSTOMER"]),
    proposedByActor: z.string().nullable(),
    proposedAt: z.string(),
    confirmedBy: z.enum(["AI", "PROFESSIONAL", "CUSTOMER"]).nullable(),
    confirmedByActor: z.string().nullable(),
    confirmedAt: z.string().nullable(),
  })
  .nullable();
const customerNoteSchema = z.object({
  id: z.string(),
  body: z.string(),
  aiAuthorized: z.boolean(),
  authorizedAt: z.string().nullable(),
  authorizedBy: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const customerTagSchema = z.object({
  id: z.string(),
  label: z.string(),
  aiAuthorized: z.boolean(),
  authorizedAt: z.string().nullable(),
  authorizedBy: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const customerDetailSchema = customerSchema.extend({
  primaryGuardian: primaryGuardianSchema.default(null),
  notes: z.array(customerNoteSchema).default([]),
  tags: z.array(customerTagSchema).default([]),
});
const appointmentSchema = z.object({
  id: z.string(),
  source: z.enum(["AI", "USER", "INTEGRATION"]),
  // Atendimento manual excepcional sem servico cadastrado (Goal008). Com
  // default: toda resposta anterior a este Goal continua decodavel.
  title: z.string().nullable().default(null),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number().int().positive(),
  customerId: z.string().nullable(),
  customer: customerSchema.nullable(),
  services: z.array(
    z.object({
      serviceId: z.string(),
      name: z.string(),
      durationMinutes: z.number().int().positive().nullable(),
      priceType: priceTypeSchema,
      price: z.number().nonnegative().nullable(),
    }),
  ),
  totalPrice: z.number().nonnegative().nullable(),
  totalPriceType: z.enum(["FIXED", "STARTING_AT", "NONE"]).default("NONE"),
  comments: z.string().nullable(),
  // `status` continua `string`, nao enum: um replay de idempotencia gravado
  // antes do Goal008 traz `SCHEDULED`, e recusar a resposta seria quebrar
  // uma chave ja respondida. A leitura de estado do produto e do frontend.
  status: z.string(),
});

/**
 * Ciclo de vida do atendimento (Goal008): conclusao, falta, presenca e
 * valor final. E um recorte proprio, e nao um pedaco do atendimento, porque
 * as rotas de ciclo respondem exatamente isto — o estado que mudou, sem
 * repetir servicos, cliente e acordo.
 */
const appointmentLifecycleSchema = z.object({
  id: z.string(),
  status: z.string(),
  completedAt: z.string().nullable(),
  completedBy: z.string().nullable(),
  completionOrigin: z.enum(["MANUAL", "AUTO"]).nullable(),
  noShowAt: z.string().nullable(),
  noShowNote: z.string().nullable(),
  presenceConfirmedAt: z.string().nullable(),
  finalValue: z.number().nullable(),
  finalValueSetAt: z.string().nullable(),
  finalValueSetBy: z.string().nullable(),
});

const appointmentEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    "CREATED",
    "RESCHEDULED",
    "CANCELLED",
    "COMPLETED",
    "NO_SHOW",
    "FINAL_VALUE_SET",
    "PRESENCE_CONFIRMED",
    "HOLD_CONSUMED",
    "OVERLAP_OVERRIDE",
  ]),
  source: z.enum(["AI", "USER", "SYSTEM", "INTEGRATION"]),
  actor: z.string().nullable(),
  reason: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  occurredAt: z.string(),
  sequence: z.string(),
});

const holdSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number().int().positive(),
  serviceIds: z.array(z.string()),
  customerId: z.string().nullable(),
  contactRef: z.string().nullable(),
  source: z.enum(["AI", "USER"]),
  expiresAt: z.string(),
  status: z.enum(["ACTIVE", "CONSUMED", "RELEASED", "EXPIRED"]),
});
const calendarSchema = z.object({
  source: sourceSchema.nullable(),
  timezone: z.string().nullable(),
  integration: z
    .object({
      status: z.string(),
      lastSuccessfulSyncAt: z.string().nullable(),
      lastErrorAt: z.string().nullable(),
      lastErrorCode: z.string().nullable(),
    })
    .nullable(),
  capabilities: z.object({
    manageAvailability: z.boolean(),
    manageServices: z.boolean(),
    manageCustomers: z.boolean(),
    createAppointments: z.boolean(),
    migrate: z.boolean(),
    aiActivationReady: z.boolean().default(false),
  }),
});
const availabilitySettingsSchema = z.object({
  timezone: z.string(),
  rules: z.array(
    z.object({
      id: z.string(),
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string(),
      endTime: z.string(),
      active: z.boolean(),
    }),
  ),
});
const migrationEntityCountSchema = z.object({
  total: z.number().int().nonnegative(),
  importable: z.number().int().nonnegative(),
});
const migrationDiagnosisSchema = z.object({
  source: sourceSchema,
  target: sourceSchema,
  supported: z.boolean(),
  conflicts: z.array(
    z.object({
      entityType: z.string(),
      externalId: z.string().nullable(),
      code: z.string(),
      message: z.string(),
    }),
  ),
  entities: z.object({
    services: migrationEntityCountSchema,
    customers: migrationEntityCountSchema,
    appointments: migrationEntityCountSchema,
    availability: migrationEntityCountSchema,
  }),
  warnings: z.array(z.string()),
  limitations: z.array(z.string()),
});
const migrationSchema = z.object({
  migrationId: z.string(),
  source: sourceSchema,
  target: sourceSchema,
  status: z.enum([
    "PENDING",
    "ANALYZING",
    "RUNNING",
    "PARTIAL",
    "COMPLETED",
    "FAILED",
  ]),
  progress: z.number().int().min(0).max(100),
  currentStep: z.string().nullable(),
  summary: z.unknown().nullable(),
  warnings: z.array(z.string()),
  limitations: z.array(z.string()),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  conflicts: z.array(
    z.object({
      id: z.string(),
      entityType: z.string(),
      status: z.string(),
      details: z.unknown(),
    }),
  ),
});
const envelope = <T extends z.ZodType>(schema: T) =>
  z.object({ data: schema, requestId: z.string() });

export class SchedulingClient {
  private readonly http = new InternalHttpClient(
    env.SCHEDULING_SERVICE_BASE_URL,
    "scheduling-service",
  );

  async calendar(context: InternalRequestContext) {
    return this.get(context, "/internal/calendar", calendarSchema);
  }

  async configureCalendar(
    context: InternalRequestContext,
    input: { source: "ATENDLY" | "MINHA_AGENDA"; timezone: string },
  ) {
    return this.mutate(
      context,
      "PATCH",
      "/internal/calendar",
      input,
      calendarSchema,
    );
  }

  async listAppointments(
    context: InternalRequestContext,
    query: {
      startDate: string;
      endDate: string;
      customerId?: string;
      customerPhone?: string;
    },
  ) {
    return this.get(
      context,
      "/internal/appointments",
      z.array(appointmentSchema),
      query,
    );
  }

  async getAppointment(context: InternalRequestContext, id: string) {
    return this.get(
      context,
      `/internal/appointments/${encodeURIComponent(id)}`,
      appointmentSchema,
    );
  }

  async createAppointment(
    context: InternalRequestContext,
    input: unknown,
    idempotencyKey: string,
  ) {
    return this.mutate(
      context,
      "POST",
      "/internal/appointments",
      input,
      appointmentSchema,
      idempotencyKey,
    );
  }

  async rescheduleAppointment(
    context: InternalRequestContext,
    id: string,
    input: unknown,
    idempotencyKey: string,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/appointments/${encodeURIComponent(id)}/reschedule`,
      input,
      appointmentSchema,
      idempotencyKey,
    );
  }

  async cancelAppointment(
    context: InternalRequestContext,
    id: string,
    input: unknown,
    idempotencyKey: string,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/appointments/${encodeURIComponent(id)}/cancel`,
      input,
      appointmentSchema,
      idempotencyKey,
    );
  }

  /**
   * Hold (Goal008). Criar segura tempo, entao exige `Idempotency-Key`, como
   * confirmar e remarcar; listar e liberar nao — liberar de novo nao tem
   * segundo efeito.
   */
  async createHold(
    context: InternalRequestContext,
    input: unknown,
    idempotencyKey: string,
  ) {
    return this.mutate(
      context,
      "POST",
      "/internal/holds",
      input,
      holdSchema,
      idempotencyKey,
    );
  }

  async listHolds(context: InternalRequestContext) {
    return this.get(context, "/internal/holds", z.array(holdSchema));
  }

  async releaseHold(context: InternalRequestContext, id: string) {
    return this.mutate(
      context,
      "DELETE",
      `/internal/holds/${encodeURIComponent(id)}`,
      undefined,
      holdSchema,
    );
  }

  async completeAppointment(context: InternalRequestContext, id: string) {
    return this.mutate(
      context,
      "POST",
      `/internal/appointments/${encodeURIComponent(id)}/complete`,
      {},
      appointmentLifecycleSchema,
    );
  }

  async markAppointmentNoShow(
    context: InternalRequestContext,
    id: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/appointments/${encodeURIComponent(id)}/no-show`,
      input,
      appointmentLifecycleSchema,
    );
  }

  async setAppointmentFinalValue(
    context: InternalRequestContext,
    id: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/appointments/${encodeURIComponent(id)}/final-value`,
      input,
      appointmentLifecycleSchema,
    );
  }

  async confirmAppointmentPresence(
    context: InternalRequestContext,
    id: string,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/appointments/${encodeURIComponent(id)}/presence`,
      {},
      appointmentLifecycleSchema,
    );
  }

  async listAppointmentEvents(context: InternalRequestContext, id: string) {
    return this.get(
      context,
      `/internal/appointments/${encodeURIComponent(id)}/events`,
      z.array(appointmentEventSchema),
    );
  }

  async availability(
    context: InternalRequestContext,
    query: Record<string, string | number | boolean | undefined>,
  ) {
    return this.get(
      context,
      "/internal/availability",
      z.array(
        z.object({
          date: z.string(),
          startTime: z.string(),
          endTime: z.string(),
        }),
      ),
      query,
    );
  }

  async availabilitySettings(context: InternalRequestContext) {
    return this.get(
      context,
      "/internal/availability-settings",
      availabilitySettingsSchema,
    );
  }

  async updateAvailabilitySettings(
    context: InternalRequestContext,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "PATCH",
      "/internal/availability-settings",
      input,
      availabilitySettingsSchema,
    );
  }

  async createTimeBlock(context: InternalRequestContext, input: unknown) {
    return this.mutate(
      context,
      "POST",
      "/internal/time-blocks",
      input,
      z.object({
        id: z.string(),
        startAt: z.string(),
        endAt: z.string(),
        reason: z.string().nullable(),
      }),
    );
  }

  async deleteTimeBlock(context: InternalRequestContext, id: string) {
    return this.mutate(
      context,
      "DELETE",
      `/internal/time-blocks/${encodeURIComponent(id)}`,
      undefined,
      z.object({ deleted: z.literal(true) }),
    );
  }

  async listCustomers(
    context: InternalRequestContext,
    query: { phone?: string } = {},
  ) {
    return this.get(
      context,
      "/internal/customers",
      z.object({
        items: z.array(customerSchema),
        source: sourceSchema,
        managedExternally: z.boolean(),
        filteredByPhone: z.boolean().optional(),
      }),
      query,
    );
  }

  async getCustomer(context: InternalRequestContext, id: string) {
    return this.get(
      context,
      `/internal/customers/${encodeURIComponent(id)}`,
      customerDetailSchema,
    );
  }

  async createCustomer(context: InternalRequestContext, input: unknown) {
    return this.mutate(
      context,
      "POST",
      "/internal/customers",
      input,
      customerSchema,
    );
  }

  async updateCustomer(
    context: InternalRequestContext,
    id: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "PATCH",
      `/internal/customers/${encodeURIComponent(id)}`,
      input,
      customerSchema,
    );
  }

  async setCustomerPrimaryGuardian(
    context: InternalRequestContext,
    id: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "PUT",
      `/internal/customers/${encodeURIComponent(id)}/primary-guardian`,
      input,
      primaryGuardianSchema,
    );
  }

  async confirmCustomerPrimaryGuardian(
    context: InternalRequestContext,
    id: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/customers/${encodeURIComponent(id)}/primary-guardian/confirm`,
      input,
      primaryGuardianSchema,
    );
  }

  async clearCustomerPrimaryGuardian(
    context: InternalRequestContext,
    id: string,
  ) {
    return this.mutate(
      context,
      "DELETE",
      `/internal/customers/${encodeURIComponent(id)}/primary-guardian`,
      undefined,
      z.object({ deleted: z.boolean() }),
    );
  }

  async createCustomerNote(
    context: InternalRequestContext,
    id: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/customers/${encodeURIComponent(id)}/notes`,
      input,
      customerNoteSchema,
    );
  }

  async updateCustomerNote(
    context: InternalRequestContext,
    id: string,
    noteId: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "PATCH",
      `/internal/customers/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`,
      input,
      customerNoteSchema,
    );
  }

  async deleteCustomerNote(
    context: InternalRequestContext,
    id: string,
    noteId: string,
  ) {
    return this.mutate(
      context,
      "DELETE",
      `/internal/customers/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`,
      undefined,
      z.object({ deleted: z.literal(true) }),
    );
  }

  async createCustomerTag(
    context: InternalRequestContext,
    id: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/customers/${encodeURIComponent(id)}/tags`,
      input,
      customerTagSchema,
    );
  }

  async updateCustomerTag(
    context: InternalRequestContext,
    id: string,
    tagId: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "PATCH",
      `/internal/customers/${encodeURIComponent(id)}/tags/${encodeURIComponent(tagId)}`,
      input,
      customerTagSchema,
    );
  }

  async deleteCustomerTag(
    context: InternalRequestContext,
    id: string,
    tagId: string,
  ) {
    return this.mutate(
      context,
      "DELETE",
      `/internal/customers/${encodeURIComponent(id)}/tags/${encodeURIComponent(tagId)}`,
      undefined,
      z.object({ deleted: z.literal(true) }),
    );
  }

  async listServices(context: InternalRequestContext) {
    return this.get(
      context,
      "/internal/service-catalog",
      z.array(serviceSchema),
    );
  }

  async createService(context: InternalRequestContext, input: unknown) {
    return this.mutate(
      context,
      "POST",
      "/internal/service-catalog",
      input,
      serviceSchema,
    );
  }

  async updateService(
    context: InternalRequestContext,
    id: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "PATCH",
      `/internal/service-catalog/${encodeURIComponent(id)}`,
      input,
      serviceSchema,
    );
  }

  async connectIntegration(context: InternalRequestContext, input: unknown) {
    return this.mutate(
      context,
      "POST",
      "/internal/calendar/integration/connect",
      input,
      calendarSchema,
    );
  }

  async reconnectIntegration(context: InternalRequestContext) {
    return this.mutate(
      context,
      "POST",
      "/internal/calendar/integration/reconnect",
      undefined,
      calendarSchema,
    );
  }

  async disconnectIntegration(context: InternalRequestContext) {
    return this.mutate(
      context,
      "DELETE",
      "/internal/calendar/integration",
      undefined,
      calendarSchema,
    );
  }

  async diagnoseMigration(context: InternalRequestContext, input: unknown) {
    return this.mutate(
      context,
      "POST",
      "/internal/calendar/migrations/diagnose",
      input,
      migrationDiagnosisSchema,
    );
  }

  async createMigration(context: InternalRequestContext, input: unknown) {
    return this.mutate(
      context,
      "POST",
      "/internal/calendar/migrations",
      input,
      migrationSchema,
    );
  }

  async getMigration(context: InternalRequestContext, id: string) {
    return this.get(
      context,
      `/internal/calendar/migrations/${encodeURIComponent(id)}`,
      migrationSchema,
    );
  }

  async dashboard(context: InternalRequestContext) {
    return this.get(
      context,
      "/internal/dashboard",
      z.object({
        appointmentsToday: z.number().int().nonnegative(),
        todayAppointments: z.array(appointmentSchema),
        nextAppointment: appointmentSchema.nullable(),
        estimatedRevenueToday: z.number().nonnegative().nullable(),
        calendar: calendarSchema,
      }),
    );
  }

  private async get<T extends z.ZodType>(
    context: InternalRequestContext,
    path: string,
    schema: T,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<z.output<T>> {
    const response = await this.http.request({
      method: "GET",
      path,
      context,
      query,
      schema: envelope(schema),
    });
    return (response as { data: z.output<T> }).data;
  }

  private async mutate<T extends z.ZodType>(
    context: InternalRequestContext,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body: unknown,
    schema: T,
    idempotencyKey?: string,
  ): Promise<z.output<T>> {
    const response = await this.http.request({
      method,
      path,
      context,
      body,
      idempotencyKey,
      schema: envelope(schema),
    });
    return (response as { data: z.output<T> }).data;
  }
}
