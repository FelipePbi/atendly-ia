import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { getPrisma } from "../../infrastructure/database/prisma.js";
import {
  currentInternalContext,
  requireInternalAuth,
} from "../../shared/auth/internal-auth.js";
import { AppError } from "../../shared/errors/app-error.js";
import { CalendarService } from "./calendar-service.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
const listAppointmentsQuerySchema = z.object({
  customerPhone: z.string().trim().min(6).max(32).optional(),
  startDate: dateSchema,
  endDate: dateSchema,
});
const availabilityQuerySchema = z.object({
  serviceIds: z.preprocess(
    parseServiceIds,
    z.array(z.string().trim().min(1).max(128)).min(1).max(10),
  ),
  startDate: dateSchema,
  days: z.coerce.number().int().min(1).max(60).default(14),
  stepMinutes: z.coerce.number().int().min(1).max(180).default(30),
  maxSlots: z.coerce.number().int().min(1).max(100).default(20),
});

function parseServiceIds(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).split(",");
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    typeof item === "string" || typeof item === "number"
      ? String(item).split(",")
      : [],
  );
}
const createAppointmentBodySchema = z.object({
  serviceIds: z.array(z.string().trim().min(1).max(128)).min(1).max(10),
  date: dateSchema,
  startTime: timeSchema,
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().min(6).max(32),
  comments: z.string().trim().max(2_000).optional(),
  stepMinutes: z.number().int().min(1).max(180).default(30),
});
const rescheduleBodySchema = z.object({
  date: dateSchema,
  startTime: timeSchema,
  stepMinutes: z.number().int().min(1).max(180).default(30),
});
const cancelBodySchema = z.object({
  comments: z.string().trim().max(2_000).optional(),
});

export async function registerCalendarRoutes(
  app: FastifyInstance,
): Promise<void> {
  let calendar: CalendarService | undefined;
  const calendarService = () => (calendar ??= new CalendarService(getPrisma()));
  const internalOnly = { preHandler: requireInternalAuth };

  app.get("/internal/services", internalOnly, async (request) => ({
    data: await calendarService().listServices(currentInternalContext(request)),
    requestId: request.id,
  }));

  app.get("/internal/appointments", internalOnly, async (request) => {
    const query = parse(listAppointmentsQuerySchema, request.query);
    return {
      data: await calendarService().listAppointments(
        currentInternalContext(request),
        query,
      ),
      requestId: request.id,
    };
  });

  app.get("/internal/appointments/:id", internalOnly, async (request) => {
    const params = parse(idParamsSchema, request.params);
    return {
      data: await calendarService().getAppointment(
        currentInternalContext(request),
        params.id,
      ),
      requestId: request.id,
    };
  });

  app.get("/internal/availability", internalOnly, async (request) => {
    const query = parse(availabilityQuerySchema, request.query);
    return {
      data: await calendarService().getAvailability(
        currentInternalContext(request),
        query,
      ),
      requestId: request.id,
    };
  });

  app.post("/internal/appointments", internalOnly, async (request, reply) => {
    const body = parse(createAppointmentBodySchema, request.body);
    const data = await calendarService().createAppointment(
      currentInternalContext(request),
      { ...body, idempotencyKey: idempotencyKey(request) },
    );
    return reply.code(201).send({ data, requestId: request.id });
  });

  app.post(
    "/internal/appointments/:id/reschedule",
    internalOnly,
    async (request) => {
      const params = parse(idParamsSchema, request.params);
      const body = parse(rescheduleBodySchema, request.body);
      return {
        data: await calendarService().rescheduleAppointment(
          currentInternalContext(request),
          {
            appointmentId: params.id,
            ...body,
            idempotencyKey: idempotencyKey(request),
          },
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    "/internal/appointments/:id/cancel",
    internalOnly,
    async (request) => {
      const params = parse(idParamsSchema, request.params);
      const body = parse(cancelBodySchema, request.body ?? {});
      return {
        data: await calendarService().cancelAppointment(
          currentInternalContext(request),
          {
            appointmentId: params.id,
            ...body,
            idempotencyKey: idempotencyKey(request),
          },
        ),
        requestId: request.id,
      };
    },
  );
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

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || key.length > 200) {
    throw new AppError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required for mutations.",
      400,
    );
  }
  return key;
}
