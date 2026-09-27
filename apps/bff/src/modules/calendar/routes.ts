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
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { reconcileBusinessTimezone } from "../../lib/timezone-reconciliation.js";
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
/**
 * `Notificar cliente` na alteração manual (Goal021, WU-009, item 7 do G-27).
 * **Omitir é não notificar**: o default do contrato é silêncio, e quem
 * notifica é quem pede. A IA cancela e remarca a pedido do próprio cliente —
 * avisá-lo do que ele acabou de pedir seria ruído — e nunca tem este campo em
 * nenhum contrato dela; ele só existe aqui, na rota que a interface chama.
 */
const notifyCustomerShape = {
  notifyCustomer: z.boolean().optional(),
};
const rescheduleSchema = z.object({
  date: dateSchema,
  startTime: timeSchema,
  stepMinutes: z.number().int().min(1).max(180).default(30),
  holdId: z.string().trim().min(1).max(128).optional(),
  ...overlapOverrideShape,
  ...notifyCustomerShape,
});
const cancelSchema = z.object({
  // Motivo do cancelamento (Goal008): vai para o evento e para o comentário
  // do atendimento. `comments` continua aceito como o nome anterior do mesmo
  // campo, para não quebrar quem já chama a rota.
  reason: z.string().trim().max(2_000).optional(),
  comments: z.string().trim().max(2_000).optional(),
  ...notifyCustomerShape,
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
  maxSlots: z.coerce.number().int().min(1).max(100).default(20),
});
const timeBlockKindSchema = z.enum(["BLOCK", "PERSONAL"]);
const timeBlockSchema = z.object({
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().max(500).nullable().optional(),
  kind: timeBlockKindSchema.default("BLOCK"),
  title: z.string().trim().min(1).max(200).nullable().optional(),
});
const moveOccurrenceSchema = z.object({
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
});

// --- Excecoes de disponibilidade (Goal009) --------------------------------
const exceptionsQuerySchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
});
const extraAvailabilitySchema = z.object({
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
});
// `decidedBy` nao vem mais do corpo (Goal016): quem decide e a sessao
// autenticada, nunca o cliente. Um corpo antigo que ainda envie `decidedBy`
// e aceito e o valor e ignorado, sem erro — `z.object` descarta chave
// desconhecida por padrao.
const unavailabilitySchema = z.object({
  date: dateSchema,
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  reason: z.string().trim().max(500).optional(),
  decidedReason: z.string().trim().min(1).max(500).optional(),
});

// --- Series de bloqueio/compromisso (Goal009) -----------------------------
const blockSeriesRuleShape = {
  kind: timeBlockKindSchema.default("BLOCK"),
  title: z.string().trim().min(1).max(200).nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: timeSchema,
  endTime: timeSchema,
  seriesStartDate: dateSchema,
  seriesEndDate: dateSchema.optional(),
  occurrenceCount: z.number().int().positive().max(1_000).optional(),
};
const blockSeriesDecisionShape = {
  skipConflicts: z.boolean().optional(),
  forceOverlapReason: z.string().trim().min(1).max(500).optional(),
};
const blockSeriesBodySchema = z.object({
  rule: z.object(blockSeriesRuleShape),
  ...blockSeriesDecisionShape,
});
const blockSeriesEditSchema = z.object({
  fromDate: dateSchema,
  rule: z.object(blockSeriesRuleShape).partial(),
  ...blockSeriesDecisionShape,
});

// --- Serie de atendimento (Goal009) ---------------------------------------
const seriesPreviewSchema = z.object({
  serviceIds: z.array(z.string().trim().min(1).max(128)).min(1).max(10),
  occurrenceCount: z.number().int().min(1).max(365),
  intervalDays: z.number().int().positive().max(3_650).optional(),
  firstDate: dateSchema,
  firstStartTime: timeSchema,
  customerId: z.string().trim().min(1).max(128).optional(),
  contactRef: z.string().trim().min(1).max(200).optional(),
});
const seriesConfirmSchema = z.object({
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
// Conexao com so e-mail e senha (Goal060 §2/§5): endereco, cliente OAuth e
// profissional passam a vir do sistema e da descoberta no Scheduling.
// `.strict()` recusa o corpo antigo `credentials`/`configuration` inteiro
// com `VALIDATION_ERROR`, antes de qualquer chamada ao Scheduling.
const integrationSchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(500),
  })
  .strict();

// Classes de erro cujo status HTTP e a propria decisao do Scheduling, nao um
// upstream 5xx generico (Goal060 §4): `internal-http-client.ts` reduz todo
// `>= 500` a 502 por padrao, e essas duas classes precisam chegar com o
// status que o Scheduling escolheu. O codigo nunca muda, so o status.
const MINHA_AGENDA_UPSTREAM_STATUS: Record<string, number> = {
  MINHA_AGENDA_AUTH_FAILED: 422,
  MINHA_AGENDA_NOT_CONFIGURED: 503,
};

function withMinhaAgendaUpstreamStatus(error: unknown): never {
  if (error instanceof AppError && error.code === "UPSTREAM_ERROR") {
    const upstreamCode = (error.details as { upstreamCode?: string } | undefined)
      ?.upstreamCode;
    const status = upstreamCode
      ? MINHA_AGENDA_UPSTREAM_STATUS[upstreamCode]
      : undefined;
    if (status !== undefined && status !== error.statusCode) {
      throw new AppError(error.code, error.message, status, error.details);
    }
  }
  throw error;
}

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
            notifyCustomer: body.notifyCustomer,
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

  // Estado de envio ao cliente deste agendamento (Goal021): o detalhe le
  // daqui se o lembrete desta ocorrencia saiu, e nao da configuracao do
  // negocio, que responde outra pergunta.
  app.get(
    "/v1/appointments/:id/notifications",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.listAppointmentNotifications(
          internalContext(request),
          id,
        ),
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

  app.get(
    "/v1/time-blocks",
    { preHandler: requireTenantContext },
    async (request) => {
      const query = parseQuery(exceptionsQuerySchema, request.query);
      return dataResponse(
        request,
        await scheduling.listTimeBlocks(internalContext(request), query),
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

  app.delete(
    "/v1/time-blocks/:id/occurrence",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.removeBlockOccurrence(internalContext(request), id),
      );
    },
  );

  app.patch(
    "/v1/time-blocks/:id/occurrence",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.moveBlockOccurrence(
          internalContext(request),
          id,
          parseBody(moveOccurrenceSchema, request.body),
        ),
      );
    },
  );

  // --- Excecoes de disponibilidade (Goal009) ------------------------------

  app.get(
    "/v1/availability-exceptions",
    { preHandler: requireTenantContext },
    async (request) => {
      const query = parseQuery(exceptionsQuerySchema, request.query);
      return dataResponse(
        request,
        await scheduling.listAvailabilityExceptions(
          internalContext(request),
          query,
        ),
      );
    },
  );

  app.post(
    "/v1/availability-exceptions/extra",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const exception = await scheduling.createExtraAvailability(
        internalContext(request),
        parseBody(extraAvailabilitySchema, request.body),
      );
      return reply.code(201).send(dataResponse(request, exception));
    },
  );

  app.post(
    "/v1/availability-exceptions/unavailable",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const context = internalContext(request);
      const body = parseBody(unavailabilitySchema, request.body);
      const exception = await scheduling.createUnavailability(context, {
        ...body,
        // Decisao humana explicita: o ator e sempre quem esta autenticado
        // nesta sessao, nunca um valor vindo do corpo.
        decidedBy: body.decidedReason ? context.userId : undefined,
      });
      return reply.code(201).send(dataResponse(request, exception));
    },
  );

  app.delete(
    "/v1/availability-exceptions/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.removeAvailabilityException(
          internalContext(request),
          id,
        ),
      );
    },
  );

  // --- Series de bloqueio/compromisso (Goal009) ---------------------------

  app.post(
    "/v1/block-series",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const series = await scheduling.createBlockSeries(
        internalContext(request),
        parseBody(blockSeriesBodySchema, request.body),
      );
      return reply.code(201).send(dataResponse(request, series));
    },
  );

  app.patch(
    "/v1/block-series/:id/from-date",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.editBlockSeriesFromDate(
          internalContext(request),
          id,
          parseBody(blockSeriesEditSchema, request.body),
        ),
      );
    },
  );

  app.delete(
    "/v1/block-series/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.removeBlockSeries(internalContext(request), id),
      );
    },
  );

  // --- Serie de atendimento (Goal009) --------------------------------------

  app.post(
    "/v1/appointments/series/preview",
    { preHandler: requireTenantContext },
    async (request) => {
      const preview = await scheduling.previewAppointmentSeries(
        internalContext(request),
        parseBody(seriesPreviewSchema, request.body),
      );
      return dataResponse(request, preview);
    },
  );

  app.post(
    "/v1/appointments/series/confirm",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const appointments = await scheduling.confirmAppointmentSeries(
        internalContext(request),
        parseBody(seriesConfirmSchema, request.body),
        idempotencyKey(request),
      );
      return reply.code(201).send(dataResponse(request, appointments));
    },
  );

  app.get(
    "/v1/calendar",
    { preHandler: requireTenantContext },
    async (request) => {
      const context = internalContext(request);
      // A agenda do frontend le o `timezone` daqui para renderizar dia,
      // semana, mes, formulario e bloqueios. Por isso este e o segundo ponto
      // de reconciliacao obrigatorio do fuso unico do negocio (Goal029/WU-04,
      // D-010): quem le estado e quem tem o dado para decidir.
      //
      // O dono vem do Prisma do proprio BFF, em paralelo com a leitura que
      // esta rota ja fazia — nenhuma consulta nova ao Scheduling, e o
      // Scheduling continua sem consultar o BFF: a direcao e sempre
      // BFF -> Scheduling.
      const [profile, calendar] = await Promise.all([
        getPrisma().businessProfile.findUnique({
          where: { tenantId: currentTenantContext(request).tenantId },
          select: { timezone: true },
        }),
        scheduling.calendar(context),
      ]);
      // Nunca lanca: tenant convergido devolve `NOOP` sem escrita, e a
      // divergencia que nao converge sai como o fuso que continua gravado no
      // Scheduling, sem `500` e sem afirmar convergencia que nao houve.
      const reconciliation = await reconcileBusinessTimezone(
        context,
        {
          scheduling,
          log: {
            warn: (payload, message) => request.log.warn(payload, message),
          },
        },
        {
          businessTimezone: profile?.timezone ?? null,
          calendarTimezone: calendar.timezone,
        },
      );
      return dataResponse(
        request,
        publicCalendar({
          ...calendar,
          timezone: reconciliation.calendarTimezone,
        }),
      );
    },
  );

  app.post(
    "/v1/calendar/integration/connect",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        publicCalendar(
          await scheduling
            .connectIntegration(
              internalContext(request),
              parseBody(integrationSchema, request.body),
            )
            .catch(withMinhaAgendaUpstreamStatus),
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
    source: calendar.source === "ATENDLY" ? "ATENDLY" : null,
  };
}
