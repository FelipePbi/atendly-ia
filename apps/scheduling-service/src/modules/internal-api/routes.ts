import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import {
  currentInternalContext,
  requireInternalAuth,
} from "../../shared/auth/internal-auth.js";
import {
  addDays,
  databaseTimeToMinutes,
  timeFromMinutes,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import { CalendarService } from "../calendar/calendar-service.js";
import { AtendlyCustomerService } from "../customers/atendly-customer-service.js";
import { encryptIntegrationCredentials } from "../integrations/credentials.js";
import { parseMinhaAgendaConnection } from "../integrations/minha-agenda/config.js";
import { MinhaAgendaCalendarProvider } from "../integrations/minha-agenda/provider.js";
import { AtendlyServiceService } from "../services/atendly-service-service.js";

const sourceSchema = z.enum(["ATENDLY", "MINHA_AGENDA"]);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
const calendarBodySchema = z.object({
  source: sourceSchema,
  timezone: z.string().trim().min(1).max(100),
});
const availabilityBodySchema = z.object({
  timezone: z.string().trim().min(1).max(100),
  rules: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: timeSchema,
        endTime: timeSchema,
        active: z.boolean().default(true),
      }),
    )
    .max(28),
});
const serviceBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  durationMinutes: z.number().int().positive().max(1_440),
  priceType: z.enum(["FIXED", "ON_REQUEST"]),
  price: z.number().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
});
const servicePatchSchema = serviceBodySchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one service field is required.",
  );
const customerBodySchema = z.object({
  name: z.string().trim().min(1).max(200).nullable().optional(),
  phone: z.string().trim().min(6).max(32),
});
const timeBlockBodySchema = z
  .object({
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => new Date(value.startAt) < new Date(value.endAt), {
    path: ["endAt"],
    message: "End must be after start.",
  });
const integrationBodySchema = z.object({
  credentials: z.object({
    basicAuth: z.string().min(1).max(2_000),
    username: z.string().min(1).max(500),
    password: z.string().min(1).max(500),
  }),
  configuration: z.object({
    baseUrl: z.string().url(),
    employeeId: z.number().int().positive(),
    paymentMethod: z.string().min(1).max(100),
    modelVersion: z.number().int().positive().default(2),
    timeoutMs: z.number().int().positive().max(60_000).default(10_000),
    refreshSkewSeconds: z.number().int().nonnegative().max(3_600).default(300),
    enableWrites: z.boolean().default(false),
    bufferBetweenServicesMinutes: z.number().int().nonnegative().default(0),
  }),
});
const migrationBodySchema = z.object({ target: sourceSchema });

export async function registerManagementRoutes(
  app: FastifyInstance,
): Promise<void> {
  const prisma = getPrisma();
  const internalOnly = { preHandler: requireInternalAuth };

  app.get("/internal/calendar", internalOnly, async (request) =>
    data(request, await calendarOverview(prisma, tenantId(request))),
  );

  app.patch("/internal/calendar", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const body = parse(calendarBodySchema, request.body);
    assertTimezone(body.timezone);
    const existing = await prisma.calendarSettings.findUnique({
      where: { tenantId: context.tenantId },
    });
    if (existing && existing.source !== body.source) {
      throw new AppError(
        "CALENDAR_MIGRATION_REQUIRED",
        "Calendar source changes require an assisted migration.",
        409,
      );
    }
    await prisma.calendarSettings.upsert({
      where: { tenantId: context.tenantId },
      create: { tenantId: context.tenantId, ...body },
      update: { timezone: body.timezone },
    });
    return data(request, await calendarOverview(prisma, context.tenantId));
  });

  app.get("/internal/service-catalog", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const settings = await requireCalendar(prisma, context.tenantId);
    const services =
      settings.source === "ATENDLY"
        ? (
            await new AtendlyServiceService(prisma, context.tenantId).list()
          ).map(serviceDto)
        : await new CalendarService(prisma).listServices(context);
    return data(request, services);
  });

  app.post(
    "/internal/service-catalog",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const service = await new AtendlyServiceService(
        prisma,
        context.tenantId,
      ).create(parse(serviceBodySchema, request.body));
      return reply.code(201).send(data(request, serviceDto(service)));
    },
  );

  app.patch("/internal/service-catalog/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireAtendlyCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(servicePatchSchema, request.body);
    const serviceManager = new AtendlyServiceService(prisma, context.tenantId);
    let service = await serviceManager.update(id, body);
    if (body.active !== undefined && body.active !== service.active) {
      service = await serviceManager.setActive(id, body.active);
    }
    return data(request, serviceDto(service));
  });

  app.get("/internal/customers", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const settings = await requireCalendar(prisma, context.tenantId);
    if (settings.source === "MINHA_AGENDA") {
      return data(request, {
        items: [],
        source: settings.source,
        managedExternally: true,
      });
    }
    const customers = await new AtendlyCustomerService(
      prisma,
      context.tenantId,
    ).list();
    return data(request, {
      items: customers.map(customerDto),
      source: settings.source,
      managedExternally: false,
    });
  });

  app.get("/internal/customers/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireAtendlyCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    return data(
      request,
      customerDto(
        await new AtendlyCustomerService(prisma, context.tenantId).get(id),
      ),
    );
  });

  app.post("/internal/customers", internalOnly, async (request, reply) => {
    const context = currentInternalContext(request);
    await requireAtendlyCalendar(prisma, context.tenantId);
    const customer = await new AtendlyCustomerService(
      prisma,
      context.tenantId,
    ).create(parse(customerBodySchema, request.body));
    return reply.code(201).send(data(request, customerDto(customer)));
  });

  app.get("/internal/availability-settings", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
    const rules = await prisma.availabilityRule.findMany({
      where: { tenantId: context.tenantId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return data(request, {
      timezone: calendar.timezone,
      rules: rules.map(availabilityRuleDto),
    });
  });

  app.patch(
    "/internal/availability-settings",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const body = parse(availabilityBodySchema, request.body);
      assertTimezone(body.timezone);
      assertNonOverlappingRules(body.rules);
      await prisma.$transaction(async (transaction) => {
        await transaction.calendarSettings.update({
          where: { tenantId: context.tenantId },
          data: { timezone: body.timezone },
        });
        await transaction.availabilityRule.deleteMany({
          where: { tenantId: context.tenantId },
        });
        if (body.rules.length > 0) {
          await transaction.availabilityRule.createMany({
            data: body.rules.map((rule) => ({
              tenantId: context.tenantId,
              dayOfWeek: rule.dayOfWeek,
              startTime: databaseTime(rule.startTime),
              endTime: databaseTime(rule.endTime),
              active: rule.active,
            })),
          });
        }
      });
      const rules = await prisma.availabilityRule.findMany({
        where: { tenantId: context.tenantId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      });
      return data(request, {
        timezone: body.timezone,
        rules: rules.map(availabilityRuleDto),
      });
    },
  );

  app.post("/internal/time-blocks", internalOnly, async (request, reply) => {
    const context = currentInternalContext(request);
    await requireAtendlyCalendar(prisma, context.tenantId);
    const body = parse(timeBlockBodySchema, request.body);
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    const conflict = await prisma.appointment.findFirst({
      where: {
        tenantId: context.tenantId,
        status: { not: "CANCELLED" },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new AppError(
        "TIME_BLOCK_APPOINTMENT_CONFLICT",
        "Time block overlaps an existing appointment.",
        409,
      );
    }
    const block = await prisma.timeBlock.create({
      data: {
        tenantId: context.tenantId,
        startAt,
        endAt,
        reason: body.reason ?? null,
      },
    });
    return reply.code(201).send(data(request, timeBlockDto(block)));
  });

  app.delete("/internal/time-blocks/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireAtendlyCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const deleted = await prisma.timeBlock.deleteMany({
      where: { id, tenantId: context.tenantId },
    });
    if (deleted.count === 0) {
      throw new AppError(
        "TIME_BLOCK_NOT_FOUND",
        "Time block was not found.",
        404,
      );
    }
    return data(request, { deleted: true as const });
  });

  app.post(
    "/internal/calendar/integration/connect",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const body = parse(integrationBodySchema, request.body);
      const calendar = await requireCalendar(prisma, context.tenantId);
      if (calendar.source !== "MINHA_AGENDA") {
        throw new AppError(
          "CALENDAR_SOURCE_MISMATCH",
          "External integration can only be connected for its active calendar source.",
          409,
        );
      }
      const provider = new MinhaAgendaCalendarProvider({
        tenantId: context.tenantId,
        ...body.credentials,
        ...body.configuration,
      });
      await provider.listServices();
      const now = new Date();
      await prisma.integrationConnection.upsert({
        where: {
          tenantId_provider: {
            tenantId: context.tenantId,
            provider: "MINHA_AGENDA",
          },
        },
        create: {
          tenantId: context.tenantId,
          provider: "MINHA_AGENDA",
          status: "CONNECTED",
          credentialsEncrypted: Uint8Array.from(
            encryptIntegrationCredentials(context.tenantId, body.credentials),
          ),
          config: body.configuration,
          lastSuccessfulSyncAt: now,
        },
        update: {
          status: "CONNECTED",
          credentialsEncrypted: Uint8Array.from(
            encryptIntegrationCredentials(context.tenantId, body.credentials),
          ),
          config: body.configuration,
          lastSuccessfulSyncAt: now,
          lastErrorAt: null,
          lastErrorCode: null,
        },
      });
      return data(request, await calendarOverview(prisma, context.tenantId));
    },
  );

  app.post(
    "/internal/calendar/integration/reconnect",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const connection = await requireIntegration(prisma, context.tenantId);
      try {
        await new MinhaAgendaCalendarProvider(
          parseMinhaAgendaConnection(connection),
        ).listServices();
        await prisma.integrationConnection.update({
          where: { id: connection.id },
          data: {
            status: "CONNECTED",
            lastSuccessfulSyncAt: new Date(),
            lastErrorAt: null,
            lastErrorCode: null,
          },
        });
      } catch (error) {
        await prisma.integrationConnection.update({
          where: { id: connection.id },
          data: {
            status: "ERROR",
            lastErrorAt: new Date(),
            lastErrorCode:
              error instanceof AppError ? error.code : "INTEGRATION_ERROR",
          },
        });
        throw error;
      }
      return data(request, await calendarOverview(prisma, context.tenantId));
    },
  );

  app.delete(
    "/internal/calendar/integration",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const calendar = await requireCalendar(prisma, context.tenantId);
      if (calendar.source === "MINHA_AGENDA") {
        throw new AppError(
          "CALENDAR_MIGRATION_REQUIRED",
          "Migrate to Atendly Calendar before disconnecting the official source.",
          409,
        );
      }
      await prisma.integrationConnection.deleteMany({
        where: { tenantId: context.tenantId, provider: "MINHA_AGENDA" },
      });
      return data(request, await calendarOverview(prisma, context.tenantId));
    },
  );

  app.post(
    "/internal/calendar/migrations/diagnose",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const body = parse(migrationBodySchema, request.body);
      return data(
        request,
        await diagnoseMigration(prisma, context, body.target),
      );
    },
  );

  app.post(
    "/internal/calendar/migrations",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      const body = parse(migrationBodySchema, request.body);
      const diagnosis = await diagnoseMigration(prisma, context, body.target);
      if (!diagnosis.supported) {
        throw new AppError(
          "MIGRATION_NOT_SUPPORTED",
          "Automatic migration is not supported for this target.",
          409,
          { issues: diagnosis.issues },
        );
      }
      const job = await prisma.migrationJob.create({
        data: {
          tenantId: context.tenantId,
          source: diagnosis.source,
          target: diagnosis.target,
          status: diagnosis.issues.length > 0 ? "REQUIRES_REVIEW" : "READY",
        },
        include: { conflicts: true },
      });
      return reply.code(201).send(data(request, migrationDto(job)));
    },
  );

  app.get(
    "/internal/calendar/migrations/:id",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const { id } = parse(idParamsSchema, request.params);
      const job = await prisma.migrationJob.findUnique({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
        include: { conflicts: true },
      });
      if (!job) {
        throw new AppError(
          "MIGRATION_NOT_FOUND",
          "Calendar migration was not found.",
          404,
        );
      }
      return data(request, migrationDto(job));
    },
  );

  app.get("/internal/dashboard", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const calendar = await requireCalendar(prisma, context.tenantId);
    const today = localDate(new Date(), calendar.timezone);
    const appointments = await new CalendarService(prisma).listAppointments(
      context,
      { startDate: today, endDate: addDays(today, 30) },
    );
    const todayAppointments = appointments.filter(
      (appointment) =>
        appointment.date === today && appointment.status !== "CANCELLED",
    );
    return data(request, {
      appointmentsToday: todayAppointments.length,
      nextAppointment:
        appointments.find(
          (appointment) => appointment.status !== "CANCELLED",
        ) ?? null,
      estimatedRevenueToday: revenue(todayAppointments),
      calendar: await calendarOverview(prisma, context.tenantId),
    });
  });
}

async function calendarOverview(prisma: PrismaClient, tenantId: string) {
  const [settings, integration] = await Promise.all([
    prisma.calendarSettings.findUnique({ where: { tenantId } }),
    prisma.integrationConnection.findUnique({
      where: {
        tenantId_provider: { tenantId, provider: "MINHA_AGENDA" },
      },
    }),
  ]);
  const source = settings?.source ?? null;
  const externalWritesEnabled = integration
    ? minhaAgendaWritesSchema.safeParse(integration.config).data
        ?.enableWrites === true
    : false;
  return {
    source,
    timezone: settings?.timezone ?? null,
    integration: integration
      ? {
          status: integration.status,
          lastSuccessfulSyncAt:
            integration.lastSuccessfulSyncAt?.toISOString() ?? null,
          lastErrorAt: integration.lastErrorAt?.toISOString() ?? null,
          lastErrorCode: integration.lastErrorCode,
        }
      : null,
    capabilities: {
      manageAvailability: source === "ATENDLY",
      manageServices: source === "ATENDLY",
      manageCustomers: source === "ATENDLY",
      createAppointments:
        source === "ATENDLY" ||
        (source === "MINHA_AGENDA" &&
          integration?.status === "CONNECTED" &&
          externalWritesEnabled),
      migrate: source !== null,
    },
  };
}

const minhaAgendaWritesSchema = z.object({
  enableWrites: z.boolean().default(false),
});

async function requireCalendar(prisma: PrismaClient, tenantId: string) {
  const calendar = await prisma.calendarSettings.findUnique({
    where: { tenantId },
  });
  if (!calendar) {
    throw new AppError(
      "CALENDAR_SETTINGS_NOT_FOUND",
      "Calendar settings were not found for this tenant.",
      404,
    );
  }
  return calendar;
}

async function requireAtendlyCalendar(prisma: PrismaClient, tenantId: string) {
  const calendar = await requireCalendar(prisma, tenantId);
  if (calendar.source !== "ATENDLY") {
    throw new AppError(
      "OPERATION_MANAGED_EXTERNALLY",
      "This operation is managed by the official external calendar.",
      409,
    );
  }
  return calendar;
}

async function requireIntegration(prisma: PrismaClient, tenantId: string) {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      tenantId_provider: { tenantId, provider: "MINHA_AGENDA" },
    },
  });
  if (!connection) {
    throw new AppError(
      "INTEGRATION_CONNECTION_NOT_FOUND",
      "Calendar integration was not found.",
      404,
    );
  }
  return connection;
}

async function diagnoseMigration(
  prisma: PrismaClient,
  context: { tenantId: string; userId: string; requestId: string },
  target: "ATENDLY" | "MINHA_AGENDA",
) {
  const calendar = await requireCalendar(prisma, context.tenantId);
  if (calendar.source === target) {
    throw new AppError(
      "MIGRATION_SOURCE_EQUALS_TARGET",
      "Migration target must differ from the current source.",
      409,
    );
  }

  if (calendar.source === "ATENDLY") {
    const now = new Date();
    const [services, customers, futureAppointments] = await Promise.all([
      prisma.service.count({ where: { tenantId: context.tenantId } }),
      prisma.customer.count({ where: { tenantId: context.tenantId } }),
      prisma.appointment.count({
        where: {
          tenantId: context.tenantId,
          startAt: { gte: now },
          status: { not: "CANCELLED" },
        },
      }),
    ]);
    return {
      source: calendar.source,
      target,
      services,
      customers,
      futureAppointments,
      supported: false,
      issues: [
        "Automatic transfer to the external calendar is not confirmed by the integration.",
      ],
    };
  }

  const provider = new CalendarService(prisma);
  const startDate = localDate(new Date(), calendar.timezone);
  const [services, appointments] = await Promise.all([
    provider.listServices(context),
    provider.listAppointments(context, {
      startDate,
      endDate: addDays(startDate, 365),
    }),
  ]);
  return {
    source: calendar.source,
    target,
    services: services.length,
    customers: new Set(
      appointments.map((appointment) => appointment.customerId).filter(Boolean),
    ).size,
    futureAppointments: appointments.filter(
      (appointment) => appointment.status !== "CANCELLED",
    ).length,
    supported: true,
    issues: [] as string[],
  };
}

function serviceDto(service: {
  id: string;
  name: string;
  durationMinutes: number;
  priceType: "FIXED" | "ON_REQUEST";
  price: { toString(): string } | number | null;
  active: boolean;
}) {
  return {
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    priceType: service.priceType,
    price: service.price === null ? null : Number(service.price),
    active: service.active,
  };
}

function customerDto(customer: {
  id: string;
  name: string | null;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function availabilityRuleDto(rule: {
  id: string;
  dayOfWeek: number;
  startTime: Date;
  endTime: Date;
  active: boolean;
}) {
  return {
    id: rule.id,
    dayOfWeek: rule.dayOfWeek,
    startTime: timeFromMinutes(databaseTimeToMinutes(rule.startTime)),
    endTime: timeFromMinutes(databaseTimeToMinutes(rule.endTime)),
    active: rule.active,
  };
}

function timeBlockDto(block: {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
}) {
  return {
    id: block.id,
    startAt: block.startAt.toISOString(),
    endAt: block.endAt.toISOString(),
    reason: block.reason,
  };
}

function migrationDto(job: {
  id: string;
  source: "ATENDLY" | "MINHA_AGENDA";
  target: "ATENDLY" | "MINHA_AGENDA";
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  conflicts: Array<{
    id: string;
    entityType: string;
    status: string;
    details: unknown;
  }>;
}) {
  return {
    id: job.id,
    source: job.source,
    target: job.target,
    status: job.status,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    conflicts: job.conflicts.map((conflict) => ({
      id: conflict.id,
      entityType: conflict.entityType,
      status: conflict.status,
      details: conflict.details,
    })),
  };
}

function parse<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Request validation failed.",
      400,
      z.flattenError(parsed.error).fieldErrors,
    );
  }
  return parsed.data;
}

function tenantId(request: FastifyRequest): string {
  return currentInternalContext(request).tenantId;
}

function data<T>(request: FastifyRequest, value: T) {
  return { data: value, requestId: request.id };
}

function databaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function assertNonOverlappingRules(
  rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
): void {
  for (const rule of rules) {
    if (rule.startTime >= rule.endTime) {
      throw new AppError(
        "INVALID_AVAILABILITY_RANGE",
        "Availability start must precede end.",
        400,
      );
    }
    const overlap = rules.some(
      (candidate) =>
        candidate !== rule &&
        candidate.dayOfWeek === rule.dayOfWeek &&
        candidate.startTime < rule.endTime &&
        candidate.endTime > rule.startTime,
    );
    if (overlap) {
      throw new AppError(
        "AVAILABILITY_OVERLAP",
        "Availability periods cannot overlap.",
        409,
      );
    }
  }
}

function assertTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
  } catch {
    throw new AppError(
      "INVALID_TIMEZONE",
      "A valid IANA timezone is required.",
      400,
    );
  }
}

function localDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function revenue(
  appointments: Array<{ totalPrice: number | null }>,
): number | null {
  if (appointments.some((appointment) => appointment.totalPrice === null)) {
    return null;
  }
  return appointments.reduce(
    (total, appointment) => total + (appointment.totalPrice ?? 0),
    0,
  );
}
