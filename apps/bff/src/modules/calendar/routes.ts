import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { SchedulingClient } from "../../clients/scheduling/index.js";
import { AppError } from "../../lib/errors.js";
import {
  dataResponse,
  parseBody,
  parseParams,
  parseQuery,
} from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const idSchema = z.object({ id: z.string().trim().min(1).max(128) });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const appointmentsQuerySchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  // Pessoa por ID; telefone continua valendo como filtro de candidatos.
  customerId: z.string().trim().min(1).max(128).optional(),
  customerPhone: z.string().trim().min(6).max(32).optional(),
});
/**
 * Sobreposição por decisão humana (Goal008). Estas rotas são as **únicas**
 * que podem carregá-la: toda mutação daqui sai com `source: "USER"`, e é o
 * Scheduling que recusa o override vindo de qualquer outra origem. O motivo
 * é obrigatório e vai para o histórico do atendimento.
 */
const overlapOverrideShape = {
  overlapOverride: z.boolean().optional(),
  overlapOverrideReason: z.string().trim().min(1).max(500).optional(),
};

const appointmentBodySchema = z
  .object({
    // Vazio só no atendimento manual excepcional sem serviço cadastrado
    // (Goal008), que exige `title` e `durationMinutes`. Quem valida a
    // combinação é o Scheduling, em um lugar só.
    serviceIds: z.array(z.string().trim().min(1).max(128)).max(10).default([]),
    title: z.string().trim().min(1).max(200).optional(),
    durationMinutes: z.number().int().min(1).max(1_440).optional(),
    date: dateSchema,
    startTime: timeSchema,
    customerId: z.string().trim().min(1).max(128).optional(),
    customerName: z.string().trim().min(1).max(200).optional(),
    customerPhone: z.string().trim().min(6).max(32).optional(),
    comments: z.string().trim().max(2_000).optional(),
    stepMinutes: z.number().int().min(1).max(180).default(30),
    holdId: z.string().trim().min(1).max(128).optional(),
    ...overlapOverrideShape,
  })
  .refine(
    (value) =>
      Boolean(value.customerId ?? value.customerName ?? value.customerPhone),
    {
      path: ["customerId"],
      message:
        "Informe customerId de uma pessoa já cadastrada, ou nome/telefone para criá-la na confirmação.",
    },
  );
const rescheduleSchema = z.object({
  date: dateSchema,
  startTime: timeSchema,
  stepMinutes: z.number().int().min(1).max(180).default(30),
  holdId: z.string().trim().min(1).max(128).optional(),
  ...overlapOverrideShape,
});
const cancelSchema = z.object({
  // Motivo do cancelamento (Goal008): vai para o evento e para o comentário
  // do atendimento. `comments` continua aceito como o nome anterior do mesmo
  // campo, para não quebrar quem já chama a rota.
  reason: z.string().trim().max(2_000).optional(),
  comments: z.string().trim().max(2_000).optional(),
});
const holdBodySchema = z.object({
  serviceIds: z.array(z.string().trim().min(1).max(128)).min(1).max(10),
  date: dateSchema,
  startTime: timeSchema,
  stepMinutes: z.number().int().min(1).max(180).default(30),
  customerId: z.string().trim().min(1).max(128).optional(),
  contactRef: z.string().trim().min(1).max(200).optional(),
});
const noShowSchema = z.object({
  note: z.string().trim().max(2_000).optional(),
});
const finalValueSchema = z.object({
  amount: z.number().min(0).max(99_999_999.99),
});
const availabilityQuerySchema = z.object({
  serviceIds: z.string().transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
  startDate: dateSchema,
  days: z.coerce.number().int().min(1).max(60).default(14),
  stepMinutes: z.coerce.number().int().min(1).max(180).default(30),
  maxSlots: z.coerce.number().int().min(1).max(100).default(20),
});
const timeBlockSchema = z.object({
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().max(500).nullable().optional(),
});
const integrationSchema = z.object({
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

export async function registerV1CalendarRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();

  app.get(
    "/v1/appointments",
    { preHandler: requireTenantContext },
    async (request) => {
      const query = parseQuery(appointmentsQuerySchema, request.query);
      return dataResponse(
        request,
        await scheduling.listAppointments(internalContext(request), query),
      );
    },
  );

  app.get(
    "/v1/appointments/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.getAppointment(internalContext(request), id),
      );
    },
  );

  app.post(
    "/v1/appointments",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const appointment = await scheduling.createAppointment(
        internalContext(request),
        { ...parseBody(appointmentBodySchema, request.body), source: "USER" },
        idempotencyKey(request),
      );
      return reply.code(201).send(dataResponse(request, appointment));
    },
  );

  app.post(
    "/v1/appointments/:id/reschedule",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.rescheduleAppointment(
          internalContext(request),
          id,
          { ...parseBody(rescheduleSchema, request.body), source: "USER" },
          idempotencyKey(request),
        ),
      );
    },
  );

  app.post(
    "/v1/appointments/:id/cancel",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      const body = parseBody(cancelSchema, request.body ?? {});
      return dataResponse(
        request,
        await scheduling.cancelAppointment(
          internalContext(request),
          id,
          {
            source: "USER",
            comments: body.reason ?? body.comments,
          },
          idempotencyKey(request),
        ),
      );
    },
  );

  // --- Holds (Goal008) ---------------------------------------------------

  app.post(
    "/v1/holds",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const hold = await scheduling.createHold(
        internalContext(request),
        { ...parseBody(holdBodySchema, request.body), source: "USER" },
        idempotencyKey(request),
      );
      return reply.code(201).send(dataResponse(request, hold));
    },
  );

  app.get(
    "/v1/holds",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        await scheduling.listHolds(internalContext(request)),
      ),
  );

  app.delete(
    "/v1/holds/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.releaseHold(internalContext(request), id),
      );
    },
  );

  // --- Ciclo de vida e histórico (Goal008) -------------------------------
  // Sem `Idempotency-Key`: estas operações não ocupam nem liberam horário e
  // a idempotência é a própria transição — concluir de novo não é um segundo
  // efeito. CSRF continua exigido, como em toda mutação por cookie.

  app.post(
    "/v1/appointments/:id/complete",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.completeAppointment(internalContext(request), id),
      );
    },
  );

  app.post(
    "/v1/appointments/:id/no-show",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.markAppointmentNoShow(
          internalContext(request),
          id,
          parseBody(noShowSchema, request.body ?? {}),
        ),
      );
    },
  );

  app.post(
    "/v1/appointments/:id/final-value",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.setAppointmentFinalValue(
          internalContext(request),
          id,
          parseBody(finalValueSchema, request.body),
        ),
      );
    },
  );

  app.post(
    "/v1/appointments/:id/presence",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.confirmAppointmentPresence(
          internalContext(request),
          id,
        ),
      );
    },
  );

  app.get(
    "/v1/appointments/:id/events",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.listAppointmentEvents(internalContext(request), id),
      );
    },
  );

  app.get(
    "/v1/availability",
    { preHandler: requireTenantContext },
    async (request) => {
      const query = parseQuery(availabilityQuerySchema, request.query);
      if (query.serviceIds.length === 0) {
        throw new AppError(
          "VALIDATION_ERROR",
          "At least one service is required.",
          400,
        );
      }
      return dataResponse(
        request,
        await scheduling.availability(internalContext(request), {
          ...query,
          serviceIds: query.serviceIds.join(","),
        }),
      );
    },
  );

  app.post(
    "/v1/time-blocks",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const block = await scheduling.createTimeBlock(
        internalContext(request),
        parseBody(timeBlockSchema, request.body),
      );
      return reply.code(201).send(dataResponse(request, block));
    },
  );

  app.delete(
    "/v1/time-blocks/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.deleteTimeBlock(internalContext(request), id),
      );
    },
  );

  app.get(
    "/v1/calendar",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        publicCalendar(await scheduling.calendar(internalContext(request))),
      ),
  );

  app.post(
    "/v1/calendar/integration/connect",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        publicCalendar(
          await scheduling.connectIntegration(
            internalContext(request),
            parseBody(integrationSchema, request.body),
          ),
        ),
      ),
  );

  app.post(
    "/v1/calendar/integration/reconnect",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        publicCalendar(
          await scheduling.reconnectIntegration(internalContext(request)),
        ),
      ),
  );

  app.delete(
    "/v1/calendar/integration",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        publicCalendar(
          await scheduling.disconnectIntegration(internalContext(request)),
        ),
      ),
  );
}

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || key.length > 200) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A valid Idempotency-Key header is required.",
      400,
    );
  }
  return key;
}

function publicCalendar(calendar: {
  source: "ATENDLY" | "MINHA_AGENDA" | null;
  timezone: string | null;
  integration: unknown;
  capabilities: unknown;
}) {
  return {
    ...calendar,
    source:
      calendar.source === null
        ? null
        : calendar.source === "ATENDLY"
          ? "ATENDLY"
          : "EXTERNAL",
  };
}
