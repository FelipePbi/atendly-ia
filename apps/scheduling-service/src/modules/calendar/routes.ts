import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import {
  callerSource,
  currentInternalContext,
  requireInternalAuth,
} from "../../shared/auth/internal-auth.js";
import { AppError } from "../../shared/errors/app-error.js";
import { AtendlyAppointmentSeriesService } from "../appointments/appointment-series-service.js";
import { CalendarService } from "./calendar-service.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
const listAppointmentsQuerySchema = z.object({
  // Pessoa resolvida por ID; o telefone continua valendo como filtro de
  // candidatos, nunca como prova de identidade.
  customerId: z.string().trim().min(1).max(128).optional(),
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
/**
 * Sobreposição por decisão humana (Goal008). A rota apenas transporta a
 * flag e o motivo: quem recusa `source: AI` é o provider, num único lugar,
 * porque a mesma regra tem de valer para todo caminho de escrita — não só
 * para o que passou por HTTP.
 */
const overlapOverrideShape = {
  overlapOverride: z.boolean().optional(),
  overlapOverrideReason: z.string().trim().min(1).max(500).optional(),
};

const createAppointmentBodySchema = z
  .object({
    source: z.enum(["AI", "USER"]).optional(),
    // Vazio é permitido **no schema** porque o atendimento manual
    // excepcional sem serviço cadastrado existe (Goal008); quem restringe
    // isso a `source: USER`, com título e duração, é o provider.
    serviceIds: z.array(z.string().trim().min(1).max(128)).max(10).default([]),
    /** Título do atendimento manual excepcional sem serviço cadastrado. */
    title: z.string().trim().min(1).max(200).optional(),
    /** Duração do atendimento manual excepcional. */
    durationMinutes: z.number().int().min(1).max(1_440).optional(),
    date: dateSchema,
    startTime: timeSchema,
    // Ou a pessoa já foi resolvida (`customerId`), ou o cadastro nasce na
    // confirmação com o que foi informado. Telefone deixou de ser obrigatório.
    customerId: z.string().trim().min(1).max(128).optional(),
    customerName: z.string().trim().min(1).max(200).optional(),
    customerPhone: z.string().trim().min(6).max(32).optional(),
    comments: z.string().trim().max(2_000).optional(),
    stepMinutes: z.number().int().min(1).max(180).default(30),
    /** Hold a consumir nesta confirmação (Goal008). */
    holdId: z.string().trim().min(1).max(128).optional(),
    ...overlapOverrideShape,
  })
  .refine(
    (value) =>
      Boolean(value.customerId ?? value.customerName ?? value.customerPhone),
    {
      path: ["customerId"],
      message:
        "Provide customerId for a resolved person, or a name/phone to create one on confirmation.",
    },
  );
const rescheduleBodySchema = z.object({
  source: z.enum(["AI", "USER"]).optional(),
  date: dateSchema,
  startTime: timeSchema,
  stepMinutes: z.number().int().min(1).max(180).default(30),
  /** Hold do NOVO horário; o original continua ocupado até o commit. */
  holdId: z.string().trim().min(1).max(128).optional(),
  ...overlapOverrideShape,
});
const cancelBodySchema = z.object({
  source: z.enum(["AI", "USER"]).optional(),
  comments: z.string().trim().max(2_000).optional(),
});

const createHoldBodySchema = z.object({
  source: z.enum(["AI", "USER"]).optional(),
  serviceIds: z.array(z.string().trim().min(1).max(128)).min(1).max(10),
  date: dateSchema,
  startTime: timeSchema,
  stepMinutes: z.number().int().min(1).max(180).default(30),
  customerId: z.string().trim().min(1).max(128).optional(),
  /** Contato ainda não resolvido para uma pessoa; nunca funde identidade. */
  contactRef: z.string().trim().min(1).max(200).optional(),
});

// --- Serie de atendimento (Goal009) ---------------------------------------
const seriesPreviewBodySchema = z.object({
  serviceIds: z.array(z.string().trim().min(1).max(128)).min(1).max(10),
  occurrenceCount: z.number().int().min(1).max(365),
  intervalDays: z.number().int().positive().max(3_650).optional(),
  firstDate: dateSchema,
  firstStartTime: timeSchema,
  customerId: z.string().trim().min(1).max(128).optional(),
  contactRef: z.string().trim().min(1).max(200).optional(),
});
const seriesConfirmBodySchema = z.object({
  occurrences: z
    .array(z.object({ holdId: z.string().trim().min(1).max(128) }))
    .min(1)
    .max(365),
  serviceIds: z.array(z.string().trim().min(1).max(128)).min(1).max(10),
  intervalDays: z.number().int().positive().max(3_650),
  customerId: z.string().trim().min(1).max(128).optional(),
  customerName: z.string().trim().min(1).max(200).optional(),
  customerPhone: z.string().trim().min(6).max(32).optional(),
  comments: z.string().trim().max(2_000).optional(),
});

const noShowBodySchema = z.object({
  note: z.string().trim().max(2_000).optional(),
});
const finalValueBodySchema = z.object({
  // Decimal com duas casas: o valor final é dinheiro combinado, não uma
  // média. Negativo é recusado aqui e pela constraint SQL.
  amount: z.number().min(0).max(99_999_999.99),
});

export async function registerCalendarRoutes(
  app: FastifyInstance,
): Promise<void> {
  let calendar: CalendarService | undefined;
  const calendarService = () => (calendar ??= new CalendarService(getPrisma()));
  const internalOnly = { preHandler: requireInternalAuth };

  app.get("/internal/services", internalOnly, async (request) => ({
    data: await calendarService().listOperationalServices(
      currentInternalContext(request),
    ),
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
    const context = currentInternalContext(request);
    const body = parse(createAppointmentBodySchema, request.body);
    const data = await calendarService().createAppointment(context, {
      ...body,
      // `source` do corpo e ignorado: quem prova a origem e a credencial do
      // chamador (Goal009, residuo do Goal008).
      source: callerSource(context.caller),
      idempotencyKey: idempotencyKey(request),
    });
    return reply.code(201).send({ data, requestId: request.id });
  });

  app.post(
    "/internal/appointments/:id/reschedule",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const params = parse(idParamsSchema, request.params);
      const body = parse(rescheduleBodySchema, request.body);
      return {
        data: await calendarService().rescheduleAppointment(context, {
          appointmentId: params.id,
          ...body,
          source: callerSource(context.caller),
          idempotencyKey: idempotencyKey(request),
        }),
        requestId: request.id,
      };
    },
  );

  app.post(
    "/internal/appointments/:id/cancel",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const params = parse(idParamsSchema, request.params);
      const body = parse(cancelBodySchema, request.body ?? {});
      return {
        data: await calendarService().cancelAppointment(context, {
          appointmentId: params.id,
          ...body,
          source: callerSource(context.caller),
          idempotencyKey: idempotencyKey(request),
        }),
        requestId: request.id,
      };
    },
  );

  // --- Holds (Goal008) ---------------------------------------------------
  // Criar hold ocupa tempo, então exige `Idempotency-Key` como qualquer
  // outra mutação da agenda. Listar e liberar não exigem: liberar de novo
  // não tem segundo efeito.

  app.post("/internal/holds", internalOnly, async (request, reply) => {
    const context = currentInternalContext(request);
    const body = parse(createHoldBodySchema, request.body);
    const data = await calendarService().createHold(context, {
      ...body,
      source: callerSource(context.caller),
      idempotencyKey: idempotencyKey(request),
    });
    return reply.code(201).send({ data, requestId: request.id });
  });

  app.get("/internal/holds", internalOnly, async (request) => ({
    data: await calendarService().listHolds(currentInternalContext(request)),
    requestId: request.id,
  }));

  app.get("/internal/holds/:id", internalOnly, async (request) => {
    const params = parse(idParamsSchema, request.params);
    return {
      data: await calendarService().getHold(
        currentInternalContext(request),
        params.id,
      ),
      requestId: request.id,
    };
  });

  app.delete("/internal/holds/:id", internalOnly, async (request) => {
    const params = parse(idParamsSchema, request.params);
    return {
      data: await calendarService().releaseHold(
        currentInternalContext(request),
        params.id,
      ),
      requestId: request.id,
    };
  });

  // --- Ciclo de vida e histórico (Goal008) -------------------------------
  // Estas operações não ocupam nem liberam horário: rodam em transação
  // curta, sem lock de dia e sem `Idempotency-Key` — a idempotência é a
  // própria transição (concluir de novo não é um segundo efeito).

  app.post(
    "/internal/appointments/:id/complete",
    internalOnly,
    async (request) => {
      const params = parse(idParamsSchema, request.params);
      return {
        data: await calendarService().completeAppointment(
          currentInternalContext(request),
          params.id,
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    "/internal/appointments/:id/no-show",
    internalOnly,
    async (request) => {
      const params = parse(idParamsSchema, request.params);
      const body = parse(noShowBodySchema, request.body ?? {});
      return {
        data: await calendarService().markNoShow(
          currentInternalContext(request),
          params.id,
          body.note ?? null,
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    "/internal/appointments/:id/final-value",
    internalOnly,
    async (request) => {
      const params = parse(idParamsSchema, request.params);
      const body = parse(finalValueBodySchema, request.body);
      return {
        data: await calendarService().setFinalValue(
          currentInternalContext(request),
          params.id,
          body.amount,
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    "/internal/appointments/:id/presence",
    internalOnly,
    async (request) => {
      const params = parse(idParamsSchema, request.params);
      return {
        data: await calendarService().confirmPresence(
          currentInternalContext(request),
          params.id,
        ),
        requestId: request.id,
      };
    },
  );

  app.get(
    "/internal/appointments/:id/events",
    internalOnly,
    async (request) => {
      const params = parse(idParamsSchema, request.params);
      return {
        data: await calendarService().listAppointmentHistory(
          currentInternalContext(request),
          params.id,
        ),
        requestId: request.id,
      };
    },
  );

  // --- Serie de atendimento (Goal009) -------------------------------------
  // So a Agenda Atendly: preview cria um hold por ocorrencia, e a
  // confirmacao consome todos em uma unica transacao.
  const prisma = getPrisma();

  app.post(
    "/internal/appointments/series/preview",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const calendar = await requireAtendlyCalendarForSeries(prisma, context.tenantId);
      const body = parse(seriesPreviewBodySchema, request.body);
      const service = new AtendlyAppointmentSeriesService(
        prisma,
        context.tenantId,
        calendar.timezone,
      );
      return {
        data: await service.preview({
          ...body,
          source: callerSource(context.caller),
        }),
        requestId: request.id,
      };
    },
  );

  app.post(
    "/internal/appointments/series/confirm",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      const calendar = await requireAtendlyCalendarForSeries(prisma, context.tenantId);
      const body = parse(seriesConfirmBodySchema, request.body);
      const service = new AtendlyAppointmentSeriesService(
        prisma,
        context.tenantId,
        calendar.timezone,
      );
      const data = await service.confirm({
        ...body,
        source: callerSource(context.caller),
        createdBy: context.userId,
        idempotencyKey: idempotencyKey(request),
      });
      return reply.code(201).send({ data, requestId: request.id });
    },
  );
}

async function requireAtendlyCalendarForSeries(
  prisma: PrismaClient,
  tenantId: string,
) {
  const settings = await prisma.calendarSettings.findUnique({
    where: { tenantId },
  });
  if (!settings) {
    throw new AppError(
      "CALENDAR_SETTINGS_NOT_FOUND",
      "Calendar settings were not found for this tenant.",
      404,
    );
  }
  if (settings.source !== "ATENDLY") {
    throw new AppError(
      "EXTERNAL_CALENDAR_SERIES_UNSUPPORTED",
      "Appointment series are only available for the Atendly calendar.",
      409,
    );
  }
  return settings;
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
