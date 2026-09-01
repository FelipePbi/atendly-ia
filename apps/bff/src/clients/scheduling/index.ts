import { z } from "zod";

import { env } from "../../config/env.js";
import {
  InternalHttpClient,
  type InternalRequestContext,
} from "../internal-http-client.js";

const sourceSchema = z.enum(["ATENDLY", "MINHA_AGENDA"]);
const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  durationMinutes: z.number().int().positive(),
  priceType: z.enum(["FIXED", "ON_REQUEST"]),
  price: z.number().nonnegative().nullable(),
  active: z.boolean(),
});
const customerSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
const appointmentSchema = z.object({
  id: z.string(),
  source: z.enum(["AI", "USER", "INTEGRATION"]),
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
      durationMinutes: z.number().int().positive(),
      priceType: z.enum(["FIXED", "ON_REQUEST"]),
      price: z.number().nonnegative().nullable(),
    }),
  ),
  totalPrice: z.number().nonnegative().nullable(),
  comments: z.string().nullable(),
  status: z.string(),
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
    query: { startDate: string; endDate: string; customerPhone?: string },
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

  async listCustomers(context: InternalRequestContext) {
    return this.get(
      context,
      "/internal/customers",
      z.object({
        items: z.array(customerSchema),
        source: sourceSchema,
        managedExternally: z.boolean(),
      }),
    );
  }

  async getCustomer(context: InternalRequestContext, id: string) {
    return this.get(
      context,
      `/internal/customers/${encodeURIComponent(id)}`,
      customerSchema,
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
    method: "POST" | "PATCH" | "DELETE",
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
