import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  ExternalEntityType,
  ImportCategory,
  ImportItemStatus,
} from "../../generated/prisma/enums.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import {
  currentInternalContext,
  requireHumanCaller,
  requireInternalAuth,
} from "../../shared/auth/internal-auth.js";
import {
  addDays,
  databaseTimeToMinutes,
  localDateTimeToInstant,
  timeFromMinutes,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import { runAutoCompleteSweep } from "../appointments/auto-complete-loop.js";
import {
  createExtraAvailability,
  createUnavailability,
  listAvailabilityExceptions,
  removeAvailabilityException,
} from "../calendar/availability-exceptions.js";
import {
  createBlockSeries,
  editBlockSeriesFromDate,
  moveBlockOccurrence,
  removeBlockOccurrence,
  removeBlockSeriesFuture,
} from "../calendar/block-series.js";
import {
  type CalendarRequestContext,
  CalendarService,
} from "../calendar/calendar-service.js";
import { CalendarMutationIdempotency } from "../calendar/idempotency.js";
import { createTimeBlock, removeTimeBlock } from "../calendar/time-blocks.js";
import { AtendlyCustomerService } from "../customers/atendly-customer-service.js";
import { encryptIntegrationCredentials } from "../integrations/credentials.js";
import { parseMinhaAgendaConnection } from "../integrations/minha-agenda/config.js";
import { todayInTimeZone } from "../integrations/minha-agenda/date-time.js";
import {
  type GetImportSnapshotInput,
  MinhaAgendaCalendarProvider,
} from "../integrations/minha-agenda/provider.js";
import {
  CalendarMigrationService,
  CATEGORY_ENTITY_TYPE,
  type ImportCompletionResult,
  ImportCompletionService,
  ImportExecutionService,
  type ImportPreviewResult,
  ImportPreviewService,
} from "../migrations/index.js";
import { AtendlyServiceService } from "../services/atendly-service-service.js";

const sourceSchema = z.enum(["ATENDLY", "MINHA_AGENDA"]);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) });
const calendarBodySchema = z.object({
  source: sourceSchema,
  timezone: z.string().trim().min(1).max(100),
});
// Regras de oferta do negocio (Goal009): antecedencia minima/maxima e
// granularidade, aditivas ao corpo existente. Ausentes preservam o valor ja
// gravado — a rota continua aceitando o corpo antigo (so `timezone` +
// `rules`) sem quebrar quem ainda nao manda os campos novos.
const offerRulesShape = {
  minLeadMinutes: z.number().int().min(0).max(43_200).optional(),
  maxLeadDays: z.number().int().min(1).max(365).optional(),
  granularityMinutes: z.number().int().min(5).max(120).optional(),
};
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
  ...offerRulesShape,
});
const serviceColorTokenSchema = z.enum([
  "ROSE",
  "AMBER",
  "EMERALD",
  "SKY",
  "VIOLET",
  "SLATE",
]);
const serviceBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  // Ausente vira pendencia de revisao (Goal007); nunca zero/duracao inventada.
  durationMinutes: z.number().int().positive().max(1_440).nullable().optional(),
  priceType: z.enum(["FIXED", "STARTING_AT", "ON_REQUEST", "NOT_INFORMED"]),
  price: z.number().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
  description: z.string().trim().max(1_000).nullable().optional(),
  colorToken: serviceColorTokenSchema.nullable().optional(),
  bufferBeforeMinutes: z.number().int().nonnegative().max(240).nullable().optional(),
  bufferAfterMinutes: z.number().int().nonnegative().max(240).nullable().optional(),
  recurrenceIntervalDays: z.number().int().positive().max(365).nullable().optional(),
});
const servicePatchSchema = serviceBodySchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one service field is required.",
  );
// Criação explícita: nome e telefone são ambos opcionais, mas não os dois.
// Telefone deixou de ser obrigatório e de ser exclusivo — ver D-005.
const customerBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).nullable().optional(),
    phone: z.string().trim().min(6).max(32).nullable().optional(),
  })
  .refine((value) => Boolean(value.name ?? value.phone), {
    path: ["name"],
    message: "A customer needs at least a name or a phone number.",
  });
const customerPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).nullable().optional(),
    phone: z.string().trim().min(6).max(32).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one customer field is required.",
  });
const customerQuerySchema = z.object({
  phone: z.string().trim().min(6).max(32).optional(),
});
const relationActorSchema = z.enum(["AI", "PROFESSIONAL", "CUSTOMER"]);
const primaryGuardianBodySchema = z.object({
  guardianCustomerId: z.string().trim().min(1).max(128),
  proposedBy: relationActorSchema,
  proposedByActor: z.string().trim().max(200).nullable().optional(),
  confirmedBy: z.enum(["PROFESSIONAL", "CUSTOMER"]).nullable().optional(),
  confirmedByActor: z.string().trim().max(200).nullable().optional(),
});
const primaryGuardianConfirmSchema = z.object({
  confirmedBy: z.enum(["PROFESSIONAL", "CUSTOMER"]),
  actor: z.string().trim().max(200).nullable().optional(),
});
// Autorização de uso pela IA é atributo do registro e nasce negada.
const customerNoteBodySchema = z.object({
  body: z.string().trim().min(1).max(2_000),
  aiAuthorized: z.boolean().default(false),
  actor: z.string().trim().max(200).nullable().optional(),
});
const customerTagBodySchema = z.object({
  label: z.string().trim().min(1).max(60),
  aiAuthorized: z.boolean().default(false),
  actor: z.string().trim().max(200).nullable().optional(),
});
const authorizationPatchSchema = z.object({
  aiAuthorized: z.boolean(),
  actor: z.string().trim().max(200).nullable().optional(),
});
const customerChildParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
  childId: z.string().trim().min(1).max(128),
});
const timeBlockKindSchema = z.enum(["BLOCK", "PERSONAL"]);
const timeBlockBodySchema = z
  .object({
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().max(500).nullable().optional(),
    kind: timeBlockKindSchema.default("BLOCK"),
    title: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .refine((value) => new Date(value.startAt) < new Date(value.endAt), {
    path: ["endAt"],
    message: "End must be after start.",
  });
const moveOccurrenceBodySchema = z
  .object({
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
  })
  .refine((value) => new Date(value.startAt) < new Date(value.endAt), {
    path: ["endAt"],
    message: "End must be after start.",
  });

// --- Excecoes de disponibilidade (Goal009) --------------------------------
const exceptionListQuerySchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
});
const extraAvailabilityBodySchema = z
  .object({
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .refine((value) => value.startTime < value.endTime, {
    path: ["endTime"],
    message: "End must be after start.",
  });
const unavailabilityBodySchema = z
  .object({
    date: dateSchema,
    // Ausentes = dia inteiro.
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    reason: z.string().trim().max(500).optional(),
    // Decisao humana explicita para aceitar conflito com atendimento
    // confirmado; os dois juntos ou nenhum.
    decidedBy: z.string().trim().min(1).max(200).optional(),
    decidedReason: z.string().trim().min(1).max(500).optional(),
  })
  .refine(
    (value) =>
      (value.startTime === undefined) === (value.endTime === undefined),
    { path: ["endTime"], message: "Provide both startTime and endTime, or neither for a whole day." },
  )
  .refine(
    (value) =>
      value.startTime === undefined ||
      value.endTime === undefined ||
      value.startTime < value.endTime,
    { path: ["endTime"], message: "End must be after start." },
  )
  .refine(
    (value) => (value.decidedBy === undefined) === (value.decidedReason === undefined),
    {
      path: ["decidedReason"],
      message: "A human decision requires both an actor and a reason.",
    },
  );

// --- Series de bloqueio/compromisso (Goal009) -----------------------------
const blockSeriesRuleShape = {
  kind: timeBlockKindSchema.default("BLOCK"),
  // Sem `.default()`: o passo de edicao distingue "nao informado" (preserva
  // o titulo atual da serie) de "informado como nulo" (limpa o titulo), e
  // um default aqui confundiria os dois atras de `.partial()`.
  title: z.string().trim().min(1).max(200).nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: timeSchema,
  endTime: timeSchema,
  seriesStartDate: dateSchema,
  seriesEndDate: dateSchema.optional(),
  occurrenceCount: z.number().int().positive().max(1_000).optional(),
};
const blockSeriesRuleSchema = z
  .object(blockSeriesRuleShape)
  .refine((value) => value.startTime < value.endTime, {
    path: ["endTime"],
    message: "End must be after start.",
  });
const blockSeriesDecisionShape = {
  skipConflicts: z.boolean().optional(),
  forceOverlapReason: z.string().trim().min(1).max(500).optional(),
};
const blockSeriesBodySchema = z.object({
  rule: blockSeriesRuleSchema,
  ...blockSeriesDecisionShape,
});
const blockSeriesEditBodySchema = z.object({
  fromDate: dateSchema,
  rule: z.object(blockSeriesRuleShape).partial(),
  ...blockSeriesDecisionShape,
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

// --- Importacao unica (Goal010, WU-08) -------------------------------------
const importCategorySchema = z.enum([
  "SERVICE",
  "CUSTOMER",
  "AVAILABILITY",
  "TIME_BLOCK",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
]);
const importItemStatusSchema = z.enum([
  "PENDING",
  "IMPORTED",
  "SKIPPED",
  "FAILED",
  "NEEDS_REVIEW",
]);
const importDecisionKindSchema = z.enum([
  "INCLUDE",
  "EXCLUDE",
  "MERGE_WITH_EXISTING",
  "CREATE_NEW",
  "KEEP_EXISTING",
]);
const importSessionParamsSchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
});
const importCategoryParamsSchema = importSessionParamsSchema.extend({
  category: importCategorySchema,
});
const importItemParamsSchema = importSessionParamsSchema.extend({
  itemId: z.string().trim().min(1).max(128),
});
const importItemsQuerySchema = z.object({
  status: importItemStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const startImportBodySchema = z.object({
  sourceAccountId: z.string().trim().min(1).max(200),
  sourceAccountLabel: z.string().trim().max(200).nullable().optional(),
  // Descarta a sessao viva e abre uma nova (ImportCompletionService).
  replace: z.boolean().optional(),
});
// `previewVersion` e obrigatoria: executar e sempre executar o preview que o
// negocio aprovou. Fosse opcional, omitir o campo executaria a versao vigente
// qualquer que fosse ela — a recusa de preview obsoleto viraria opt-in.
const executeImportBodySchema = z.object({
  previewVersion: z.number().int().nonnegative(),
  maxItems: z.number().int().positive().max(5_000).optional(),
});
const completeImportBodySchema = z.object({
  acceptPending: z.boolean().optional(),
});
// `MERGE_WITH_EXISTING`/`KEEP_EXISTING` apontam para um registro ja
// cadastrado: sem alvo explicito a decisao nao tem o que preservar.
const importDecisionBodySchema = z
  .object({
    decision: importDecisionKindSchema,
    targetInternalId: z.string().trim().min(1).max(128).optional(),
    noteCode: z.string().trim().min(1).max(100).optional(),
  })
  .refine(
    (value) =>
      (value.decision !== "MERGE_WITH_EXISTING" &&
        value.decision !== "KEEP_EXISTING") ||
      Boolean(value.targetInternalId),
    {
      path: ["targetInternalId"],
      message:
        "MERGE_WITH_EXISTING and KEEP_EXISTING require a targetInternalId.",
    },
  );

export async function registerManagementRoutes(
  app: FastifyInstance,
  prismaClient: PrismaClient = getPrisma(),
): Promise<void> {
  const prisma = prismaClient;
  const internalOnly = { preHandler: requireInternalAuth };
  const migrations = new CalendarMigrationService(prisma);
  // Sem recuperacao global no boot (Goal010, WU-05): subir o servico nao
  // reprocessa job de negocio nenhum. A retomada da importacao e por tenant e
  // sob lease (`resumeImportSessions`), pedida por quem tem o negocio em
  // maos — nunca por quem acabou de subir uma instancia.

  app.get("/internal/calendar", internalOnly, async (request) =>
    data(
      request,
      await calendarOverview(prisma, currentInternalContext(request)),
    ),
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
    return data(request, await calendarOverview(prisma, context));
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
    const query = parse(customerQuerySchema, request.query ?? {});
    const customers = await new AtendlyCustomerService(
      prisma,
      context.tenantId,
    ).list({ phone: query.phone });
    return data(request, {
      items: customers.map(customerDto),
      source: settings.source,
      managedExternally: false,
      // Busca por telefone devolve **candidatos**: zero, um ou vários. A
      // escolha entre eles é sempre explícita.
      filteredByPhone: query.phone !== undefined,
    });
  });

  app.get("/internal/customers/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireAtendlyCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const customers = new AtendlyCustomerService(prisma, context.tenantId);
    const [customer, guardian, notes, tags] = await Promise.all([
      customers.get(id),
      customers.primaryGuardian(id),
      customers.listNotes(id),
      customers.listTags(id),
    ]);
    return data(request, {
      ...customerDto(customer),
      primaryGuardian: primaryGuardianDto(guardian),
      notes: notes.map(customerNoteDto),
      tags: tags.map(customerTagDto),
    });
  });

  /**
   * Recorte que a IA pode ver.
   *
   * Só sai daqui o que tem autorização explícita: nota e tag não autorizadas
   * não são carregadas, e relação apenas proposta não é afirmada.
   */
  app.get(
    "/internal/customers/:id/ai-context",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const authorized = await new AtendlyCustomerService(
        prisma,
        context.tenantId,
      ).aiAuthorizedContext(id);
      return data(request, {
        ...customerDto(authorized.customer),
        primaryGuardian: primaryGuardianDto(authorized.primaryGuardian),
        notes: authorized.notes.map((note) => note.body),
        tags: authorized.tags.map((tag) => tag.label),
      });
    },
  );

  app.post("/internal/customers", internalOnly, async (request, reply) => {
    const context = currentInternalContext(request);
    await requireAtendlyCalendar(prisma, context.tenantId);
    const customer = await new AtendlyCustomerService(
      prisma,
      context.tenantId,
    ).create(parse(customerBodySchema, request.body));
    return reply.code(201).send(data(request, customerDto(customer)));
  });

  /** Nome e telefone só mudam por esta operação explícita. */
  app.patch("/internal/customers/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireAtendlyCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(customerPatchSchema, request.body);
    const customer = await new AtendlyCustomerService(
      prisma,
      context.tenantId,
    ).update(id, body);
    return data(request, customerDto(customer));
  });

  app.put(
    "/internal/customers/:id/primary-guardian",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(primaryGuardianBodySchema, request.body);
      const relation = await new AtendlyCustomerService(
        prisma,
        context.tenantId,
      ).setPrimaryGuardian(id, body);
      return data(request, primaryGuardianDto(relation));
    },
  );

  app.post(
    "/internal/customers/:id/primary-guardian/confirm",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(primaryGuardianConfirmSchema, request.body);
      const relation = await new AtendlyCustomerService(
        prisma,
        context.tenantId,
      ).confirmPrimaryGuardian(id, {
        confirmedBy: body.confirmedBy,
        actor: body.actor,
      });
      return data(request, primaryGuardianDto(relation));
    },
  );

  app.delete(
    "/internal/customers/:id/primary-guardian",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      return data(
        request,
        await new AtendlyCustomerService(
          prisma,
          context.tenantId,
        ).clearPrimaryGuardian(id),
      );
    },
  );

  app.get("/internal/customers/:id/notes", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireAtendlyCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const notes = await new AtendlyCustomerService(
      prisma,
      context.tenantId,
    ).listNotes(id);
    return data(request, notes.map(customerNoteDto));
  });

  app.post(
    "/internal/customers/:id/notes",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(customerNoteBodySchema, request.body);
      const note = await new AtendlyCustomerService(
        prisma,
        context.tenantId,
      ).addNote(id, body);
      return reply.code(201).send(data(request, customerNoteDto(note)));
    },
  );

  app.patch(
    "/internal/customers/:id/notes/:childId",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const params = parse(customerChildParamsSchema, request.params);
      const body = parse(authorizationPatchSchema, request.body);
      const note = await new AtendlyCustomerService(
        prisma,
        context.tenantId,
      ).setNoteAuthorization(params.id, params.childId, body);
      return data(request, customerNoteDto(note));
    },
  );

  app.delete(
    "/internal/customers/:id/notes/:childId",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const params = parse(customerChildParamsSchema, request.params);
      return data(
        request,
        await new AtendlyCustomerService(prisma, context.tenantId).deleteNote(
          params.id,
          params.childId,
        ),
      );
    },
  );

  app.get("/internal/customers/:id/tags", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireAtendlyCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const tags = await new AtendlyCustomerService(
      prisma,
      context.tenantId,
    ).listTags(id);
    return data(request, tags.map(customerTagDto));
  });

  app.post(
    "/internal/customers/:id/tags",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(customerTagBodySchema, request.body);
      const tag = await new AtendlyCustomerService(
        prisma,
        context.tenantId,
      ).addTag(id, body);
      return reply.code(201).send(data(request, customerTagDto(tag)));
    },
  );

  app.patch(
    "/internal/customers/:id/tags/:childId",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const params = parse(customerChildParamsSchema, request.params);
      const body = parse(authorizationPatchSchema, request.body);
      const tag = await new AtendlyCustomerService(
        prisma,
        context.tenantId,
      ).setTagAuthorization(params.id, params.childId, body);
      return data(request, customerTagDto(tag));
    },
  );

  app.delete(
    "/internal/customers/:id/tags/:childId",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const params = parse(customerChildParamsSchema, request.params);
      return data(
        request,
        await new AtendlyCustomerService(prisma, context.tenantId).deleteTag(
          params.id,
          params.childId,
        ),
      );
    },
  );

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
      ...offerRulesDto(calendar),
    });
  });

  app.patch(
    "/internal/availability-settings",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      // Regras de oferta e grade semanal so por decisao humana (Goal009): a
      // IA nunca decide granularidade, antecedencia nem disponibilidade
      // semanal do negocio.
      requireHumanCaller(context);
      const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
      const body = parse(availabilityBodySchema, request.body);
      assertTimezone(body.timezone);
      assertNonOverlappingRules(body.rules);
      const minLeadMinutes = body.minLeadMinutes ?? calendar.minLeadMinutes;
      const maxLeadDays = body.maxLeadDays ?? calendar.maxLeadDays;
      const granularityMinutes =
        body.granularityMinutes ?? calendar.granularityMinutes;
      assertOfferRules({ minLeadMinutes, maxLeadDays, granularityMinutes });
      await prisma.$transaction(async (transaction) => {
        await transaction.calendarSettings.update({
          where: { tenantId: context.tenantId },
          data: {
            timezone: body.timezone,
            minLeadMinutes,
            maxLeadDays,
            granularityMinutes,
          },
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
        minLeadMinutes,
        maxLeadDays,
        granularityMinutes,
      });
    },
  );

  // --- Excecoes de disponibilidade (Goal009) ------------------------------
  // Nunca alteram atendimento existente; so mudam o que o motor oferece dali
  // em diante. So humano (BFF): a IA nunca cria excecao.

  app.get(
    "/internal/availability-exceptions",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireAtendlyCalendar(prisma, context.tenantId);
      const query = parse(exceptionListQuerySchema, request.query);
      const exceptions = await listAvailabilityExceptions(prisma, {
        tenantId: context.tenantId,
        startDate: query.startDate,
        endDate: query.endDate,
      });
      return data(request, exceptions.map(exceptionDto));
    },
  );

  app.post(
    "/internal/availability-exceptions/extra",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
      const body = parse(extraAvailabilityBodySchema, request.body);
      const exception = await createExtraAvailability(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        ...body,
      });
      return reply.code(201).send(data(request, exceptionDto(exception)));
    },
  );

  app.post(
    "/internal/availability-exceptions/unavailable",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
      const body = parse(unavailabilityBodySchema, request.body);
      const exception = await createUnavailability(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        date: body.date,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
        reason: body.reason ?? null,
        decision:
          body.decidedBy && body.decidedReason
            ? { decidedBy: body.decidedBy, decidedReason: body.decidedReason }
            : undefined,
      });
      return reply.code(201).send(data(request, exceptionDto(exception)));
    },
  );

  app.delete(
    "/internal/availability-exceptions/:id",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      await removeAvailabilityException(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        id,
      });
      return data(request, { deleted: true as const });
    },
  );

  // --- Series de bloqueio/compromisso (Goal009) ---------------------------
  // So humano (BFF): a IA nunca cria bloqueio, compromisso ou serie.

  app.post(
    "/internal/block-series",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
      const body = parse(blockSeriesBodySchema, request.body);
      const series = await createBlockSeries(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        rule: { ...body.rule, title: body.rule.title ?? null },
        createdBy: context.userId,
        skipConflicts: body.skipConflicts,
        forceOverlapReason: body.forceOverlapReason,
      });
      return reply.code(201).send(data(request, blockSeriesDto(series)));
    },
  );

  app.patch(
    "/internal/block-series/:id/from-date",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(blockSeriesEditBodySchema, request.body);
      const series = await editBlockSeriesFromDate(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        seriesId: id,
        fromDate: body.fromDate,
        rule: body.rule,
        createdBy: context.userId,
        skipConflicts: body.skipConflicts,
        forceOverlapReason: body.forceOverlapReason,
      });
      return data(request, blockSeriesDto(series));
    },
  );

  app.delete(
    "/internal/block-series/:id",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      await removeBlockSeriesFuture(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        seriesId: id,
      });
      return data(request, { deleted: true as const });
    },
  );

  app.delete(
    "/internal/time-blocks/:id/occurrence",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      await removeBlockOccurrence(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        id,
      });
      return data(request, { deleted: true as const });
    },
  );

  app.patch(
    "/internal/time-blocks/:id/occurrence",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(moveOccurrenceBodySchema, request.body);
      const block = await moveBlockOccurrence(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        id,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
      });
      return data(request, timeBlockDto(block));
    },
  );

  // Bloqueio ocupa e libera tempo como qualquer atendimento: mesma transacao,
  // mesmo lock e conflito checado dentro dela (Goal008).
  app.post("/internal/time-blocks", internalOnly, async (request, reply) => {
    const context = currentInternalContext(request);
    // Bloqueio, compromisso pessoal e excecao nunca sao da IA (Goal009).
    requireHumanCaller(context);
    const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
    const body = parse(timeBlockBodySchema, request.body);
    const block = await createTimeBlock(prisma, {
      tenantId: context.tenantId,
      timeZone: calendar.timezone,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      reason: body.reason ?? null,
      kind: body.kind,
      title: body.title ?? null,
    });
    return reply.code(201).send(data(request, timeBlockDto(block)));
  });

  app.delete("/internal/time-blocks/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    requireHumanCaller(context);
    const calendar = await requireAtendlyCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    await removeTimeBlock(prisma, {
      tenantId: context.tenantId,
      timeZone: calendar.timezone,
      id,
    });
    return data(request, { deleted: true as const });
  });

  // Conclusao automatica invocavel (Goal008): a mesma varredura do loop,
  // uma vez, sem esperar o timer. Existe para o teste de integracao provar o
  // relogio do banco e o lease entre duas instancias sem depender de
  // `sleep`; em operacao, o loop no proprio processo e quem a chama.
  app.post(
    "/internal/appointments/auto-complete",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      // Escopo por tenant confirmado antes da varredura: a rota so responde a
      // um tenant com agenda Atendly, mesmo que a varredura em si seja global
      // (o loop no processo atende todos os tenants do banco do dono).
      await requireAtendlyCalendar(prisma, context.tenantId);
      const result = await runAutoCompleteSweep(prisma, {
        graceMinutes: env.CALENDAR_AUTO_COMPLETE_GRACE_MINUTES,
      });
      return data(request, result);
    },
  );

  // --- Integracao Minha Agenda (Goal010, WU-07) ---------------------------
  // Compatibilidade temporaria e declarada: `connect`/`reconnect`/`disconnect`
  // e o par `diagnose`/`migrations` abaixo continuam com o mesmo contrato
  // (enums, campos de `source`/`target`, respostas idempotentes ja gravadas),
  // mas deixaram de habilitar qualquer operacao no calendario operacional —
  // `CalendarProviderFactory` recusa MINHA_AGENDA para escrita, leitura e
  // oferta de horarios (Goal010). O papel dessas rotas agora e so o ciclo da
  // importacao unica: guardar/testar a credencial e disparar a leitura da
  // origem. Desconectar a integracao nunca desativa a Agenda Atendly, que
  // nao depende de `IntegrationConnection`. Remocao definitiva no Goal024,
  // quando o ciclo novo de importacao (ImportSession) assumir esta rota.
  app.post(
    "/internal/calendar/integration/connect",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const body = parse(integrationBodySchema, request.body);
      // A conexao existe agora **so** para o ciclo da importacao unica:
      // guardar e testar a credencial da origem. Ela nao muda a fonte da
      // agenda operacional e nao e mais exigida para operar a agenda.
      // Exigir aqui `calendar.source === "MINHA_AGENDA"` tornaria a
      // importacao inalcancavel depois do corte do writer remoto: o negocio
      // que opera na Agenda Atendly — que e todo negocio novo — nunca
      // conseguiria conectar a origem que ele quer importar.
      await requireCalendar(prisma, context.tenantId);
      if (body.configuration.enableWrites) {
        // Corte do writer remoto (Goal010 §6): a origem de importacao e
        // somente leitura. Guardar uma credencial que se declara de escrita
        // seria guardar uma promessa que o produto nao cumpre mais.
        throw new AppError(
          "INTEGRATION_WRITES_NOT_SUPPORTED",
          "The Minha Agenda connection is read-only: it exists only to import into the Atendly calendar.",
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
      return data(request, await calendarOverview(prisma, context));
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
      return data(request, await calendarOverview(prisma, context));
    },
  );

  app.delete(
    "/internal/calendar/integration",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      // Desconectar a origem de importacao **nunca** desativa a agenda
      // operacional: a Agenda Atendly nao depende de `IntegrationConnection`,
      // e por isso desconectar deixou de exigir migracao previa. O que sai e
      // a credencial da origem; a agenda do negocio segue igual.
      await requireCalendar(prisma, context.tenantId);
      await prisma.integrationConnection.deleteMany({
        where: { tenantId: context.tenantId, provider: "MINHA_AGENDA" },
      });
      return data(request, await calendarOverview(prisma, context));
    },
  );

  // Protocolo antigo de migracao bidirecional (`MigrationJob`), mantido por
  // compatibilidade temporaria: enums, `source`/`target` e as respostas
  // idempotentes ja gravadas continuam legiveis. E substituido pela
  // importacao unica (`ImportSession`, Goal010) e removido no Goal024. Todo
  // `MigrationJob` deste protocolo, mesmo `COMPLETED`, e classificado como
  // legado (`legacyClass`) e nunca conta como a conclusao unica do negocio —
  // ver `modules/migrations/legacy-job-reconciliation.ts`.
  app.post(
    "/internal/calendar/migrations/diagnose",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const body = parse(migrationBodySchema, request.body);
      return data(request, await migrations.diagnose(context, body.target));
    },
  );

  app.post(
    "/internal/calendar/migrations",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      const body = parse(migrationBodySchema, request.body);
      return reply
        .code(201)
        .send(data(request, await migrations.start(context, body.target)));
    },
  );

  app.get(
    "/internal/calendar/migrations/:id",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const { id } = parse(idParamsSchema, request.params);
      return data(request, await migrations.get(context.tenantId, id));
    },
  );

  // --- Importacao unica (Goal010, WU-08) -----------------------------------
  // Uma rota por operacao do ciclo de ImportSession. So humano (BFF): a IA
  // nunca decide o que importar, no mesmo padrao de bloqueio/excecao do
  // Goal009. `source` e ator vem sempre do chamador autenticado
  // (`currentInternalContext`) — nenhum corpo abaixo aceita `tenantId`,
  // `userId`, `source` ou `actor`, entao um corpo que declare esses campos e
  // silenciosamente ignorado pelo `zod` (`z.object` descarta chave
  // desconhecida por padrao).

  app.post("/internal/calendar/imports", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    requireHumanCaller(context);
    const key = idempotencyKey(request);
    const body = parse(startImportBodySchema, request.body);
    const connection = await requireIntegration(prisma, context.tenantId);
    const result = await withImportIdempotency(
      prisma,
      {
        tenantId: context.tenantId,
        key,
        operation: "import.start",
        request: body,
      },
      async () => ({
        ...(await new ImportCompletionService(prisma).startSession({
          tenantId: context.tenantId,
          userId: context.userId,
          sourceAccountId: body.sourceAccountId,
          sourceAccountLabel: body.sourceAccountLabel ?? null,
          provider: connection.provider,
          connectionId: connection.id,
          replace: body.replace,
        })),
      }),
    );
    return data(request, result);
  });

  app.post(
    "/internal/calendar/imports/:sessionId/analyze",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const key = idempotencyKey(request);
      const { sessionId } = parse(importSessionParamsSchema, request.params);
      const calendar = await requireCalendar(prisma, context.tenantId);
      const reader = await buildMinhaAgendaReader(prisma, context.tenantId);
      const snapshotInput = importSnapshotWindow(calendar.timezone);
      const result = await withImportIdempotency(
        prisma,
        {
          tenantId: context.tenantId,
          key,
          operation: "import.analyze",
          request: { sessionId },
        },
        async () =>
          importPreviewSummaryDto(
            await new ImportPreviewService(prisma).analyze(
              { tenantId: context.tenantId, sessionId },
              reader,
              snapshotInput,
            ),
          ),
      );
      return data(request, result);
    },
  );

  // Lista os itens (e, com `status=NEEDS_REVIEW`, os conflitos) de uma
  // categoria da sessao, paginados. So leitura: nenhum efeito, nenhuma
  // `Idempotency-Key`.
  app.get(
    "/internal/calendar/imports/:sessionId/categories/:category/items",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const { sessionId, category } = parse(
        importCategoryParamsSchema,
        request.params,
      );
      const query = parse(importItemsQuerySchema, request.query ?? {});
      await requireImportSession(prisma, context.tenantId, sessionId);
      const where = {
        tenantId: context.tenantId,
        sessionId,
        category,
        ...(query.status ? { status: query.status } : {}),
      };
      const all = await prisma.importItem.findMany({
        where,
        orderBy: [{ externalId: "asc" as const }],
      });
      const page = all.slice(query.offset, query.offset + query.limit);
      return data(request, {
        sessionId,
        category,
        total: all.length,
        limit: query.limit,
        offset: query.offset,
        items: page.map(importItemDto),
      });
    },
  );

  app.post(
    "/internal/calendar/imports/:sessionId/items/:itemId/decision",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const key = idempotencyKey(request);
      const { sessionId, itemId } = parse(
        importItemParamsSchema,
        request.params,
      );
      const body = parse(importDecisionBodySchema, request.body);
      const result = await withImportIdempotency(
        prisma,
        {
          tenantId: context.tenantId,
          key,
          operation: "import.decision",
          request: { sessionId, itemId, ...body },
        },
        () =>
          applyImportDecision(prisma, {
            tenantId: context.tenantId,
            sessionId,
            itemId,
            decidedBy: context.userId,
            decision: body.decision,
            targetInternalId: body.targetInternalId,
            noteCode: body.noteCode,
          }),
      );
      return data(request, result);
    },
  );

  app.post(
    "/internal/calendar/imports/:sessionId/execute",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const key = idempotencyKey(request);
      const { sessionId } = parse(importSessionParamsSchema, request.params);
      const body = parse(executeImportBodySchema, request.body ?? {});
      const calendar = await requireCalendar(prisma, context.tenantId);
      const reader = await buildMinhaAgendaReader(prisma, context.tenantId);
      const snapshotInput = importSnapshotWindow(calendar.timezone);
      const result = await withImportIdempotency(
        prisma,
        {
          tenantId: context.tenantId,
          key,
          operation: "import.execute",
          request: { sessionId, ...body },
        },
        async () => ({
          ...(await new ImportExecutionService(prisma).execute(
            { tenantId: context.tenantId, sessionId, userId: context.userId },
            reader,
            snapshotInput,
            { previewVersion: body.previewVersion, maxItems: body.maxItems },
          )),
        }),
      );
      return data(request, result);
    },
  );

  // Progresso lido do banco a cada chamada: nenhuma contagem fica em memoria
  // entre passadas de execucao.
  app.get(
    "/internal/calendar/imports/:sessionId/progress",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const { sessionId } = parse(importSessionParamsSchema, request.params);
      const session = await requireImportSession(
        prisma,
        context.tenantId,
        sessionId,
      );
      const items = await prisma.importItem.findMany({
        where: { tenantId: context.tenantId, sessionId },
      });
      const categories = IMPORT_CATEGORY_ORDER.map((category) => {
        const rows = items.filter((item) => item.category === category);
        return rows.length === 0 ? null : { category, ...tallyItems(rows) };
      }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      return data(request, {
        sessionId: session.id,
        status: session.status,
        previewVersion: session.previewVersion,
        startedAt: session.startedAt?.toISOString() ?? null,
        finishedAt: session.finishedAt?.toISOString() ?? null,
        counts: tallyItems(items),
        categories,
      });
    },
  );

  app.post(
    "/internal/calendar/imports/:sessionId/complete",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const key = idempotencyKey(request);
      const { sessionId } = parse(importSessionParamsSchema, request.params);
      const body = parse(completeImportBodySchema, request.body ?? {});
      const result = await new ImportCompletionService(prisma).complete(
        { tenantId: context.tenantId, sessionId, userId: context.userId },
        { acceptPending: body.acceptPending, idempotencyKey: key },
      );
      return data(request, importCompletionDto(result));
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
      todayAppointments,
      nextAppointment:
        appointments.find(
          (appointment) =>
            appointment.status !== "CANCELLED" &&
            localDateTimeToInstant(
              appointment.date,
              appointment.startTime,
              calendar.timezone,
            ) >= new Date(),
        ) ?? null,
      estimatedRevenueToday: revenue(todayAppointments),
      calendar: await calendarOverview(prisma, context),
    });
  });
}

async function calendarOverview(
  prisma: PrismaClient,
  context: CalendarRequestContext,
) {
  const { tenantId } = context;
  const [settings, integration] = await Promise.all([
    prisma.calendarSettings.findUnique({ where: { tenantId } }),
    prisma.integrationConnection.findUnique({
      where: {
        tenantId_provider: { tenantId, provider: "MINHA_AGENDA" },
      },
    }),
  ]);
  const source = settings?.source ?? null;
  const operationalServices = await countOperationalServices(
    prisma,
    context,
    source,
  );
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
      // Corte do writer remoto (Goal010): a Agenda Atendly e a unica fonte
      // operacional. `CalendarProviderFactory` recusa MINHA_AGENDA para
      // qualquer operacao, entao anunciar essa capacidade para a fonte
      // externa prometeria uma escrita que a factory sempre recusaria.
      createAppointments: source === "ATENDLY",
      migrate: source !== null,
      // "Pelo menos um serviço operacional" (Goal007): lido do que
      // `/internal/services` devolveria para a fonte vigente — mesmo
      // predicado usado pela IA e pela agenda, sem distinguir a origem.
      aiActivationReady: operationalServices > 0,
    },
  };
}

// Mesma fonte que a IA consulta (`CalendarService.listServices`, ja filtrada
// para "operacional"): evita reimplementar o predicado por fonte e cobre a
// Agenda Atendly e o Minha Agenda igualmente. Origem sem calendario
// configurado ou integracao indisponivel conta como zero, sem derrubar a
// tela de configuracoes.
async function countOperationalServices(
  prisma: PrismaClient,
  context: CalendarRequestContext,
  source: "ATENDLY" | "MINHA_AGENDA" | null,
): Promise<number> {
  if (source !== "ATENDLY" && source !== "MINHA_AGENDA") return 0;
  try {
    return (await new CalendarService(prisma).listOperationalServices(context))
      .length;
  } catch {
    return 0;
  }
}

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

function serviceDto(service: {
  id: string;
  name: string;
  durationMinutes: number | null;
  priceType: "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";
  price: { toString(): string } | number | null;
  active: boolean;
  needsReview: boolean;
  reviewOrigin: "IMPORT" | "MANUAL" | null;
  description: string | null;
  colorToken: string | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  recurrenceIntervalDays: number | null;
}) {
  return {
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    priceType: service.priceType,
    price: service.price === null ? null : Number(service.price),
    active: service.active,
    needsReview: service.needsReview,
    reviewOrigin: service.reviewOrigin,
    description: service.description,
    colorToken: service.colorToken,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    recurrenceIntervalDays: service.recurrenceIntervalDays,
  };
}

function customerDto(customer: {
  id: string;
  name: string | null;
  phone: string | null;
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

function primaryGuardianDto(
  relation: {
    id: string;
    status: "PROPOSED" | "CONFIRMED";
    proposedBy: "AI" | "PROFESSIONAL" | "CUSTOMER";
    proposedByActor: string | null;
    proposedAt: Date;
    confirmedBy: "AI" | "PROFESSIONAL" | "CUSTOMER" | null;
    confirmedByActor: string | null;
    confirmedAt: Date | null;
    relatedCustomer: { id: string; name: string | null; phone: string | null };
  } | null,
) {
  if (!relation) return null;
  return {
    id: relation.id,
    status: relation.status,
    guardian: {
      id: relation.relatedCustomer.id,
      name: relation.relatedCustomer.name,
      phone: relation.relatedCustomer.phone,
    },
    proposedBy: relation.proposedBy,
    proposedByActor: relation.proposedByActor,
    proposedAt: relation.proposedAt.toISOString(),
    confirmedBy: relation.confirmedBy,
    confirmedByActor: relation.confirmedByActor,
    confirmedAt: relation.confirmedAt?.toISOString() ?? null,
  };
}

function customerNoteDto(note: {
  id: string;
  body: string;
  aiAuthorized: boolean;
  authorizedAt: Date | null;
  authorizedBy: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: note.id,
    body: note.body,
    aiAuthorized: note.aiAuthorized,
    authorizedAt: note.authorizedAt?.toISOString() ?? null,
    authorizedBy: note.authorizedBy,
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function customerTagDto(tag: {
  id: string;
  label: string;
  aiAuthorized: boolean;
  authorizedAt: Date | null;
  authorizedBy: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: tag.id,
    label: tag.label,
    aiAuthorized: tag.aiAuthorized,
    authorizedAt: tag.authorizedAt?.toISOString() ?? null,
    authorizedBy: tag.authorizedBy,
    createdBy: tag.createdBy,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
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
  kind: "BLOCK" | "PERSONAL";
  title: string | null;
  seriesId: string | null;
}) {
  return {
    id: block.id,
    startAt: block.startAt.toISOString(),
    endAt: block.endAt.toISOString(),
    reason: block.reason,
    kind: block.kind,
    title: block.title,
    seriesId: block.seriesId,
  };
}

function offerRulesDto(calendar: {
  minLeadMinutes: number;
  maxLeadDays: number;
  granularityMinutes: number;
}) {
  return {
    minLeadMinutes: calendar.minLeadMinutes,
    maxLeadDays: calendar.maxLeadDays,
    granularityMinutes: calendar.granularityMinutes,
  };
}

function assertOfferRules(rules: {
  minLeadMinutes: number;
  maxLeadDays: number;
  granularityMinutes: number;
}): void {
  if (rules.granularityMinutes < 5 || rules.granularityMinutes > 120 || rules.granularityMinutes % 5 !== 0) {
    throw new AppError(
      "INVALID_OFFER_RULES",
      "Granularity must be a multiple of 5 minutes between 5 and 120.",
      400,
    );
  }
  if (rules.minLeadMinutes < 0 || rules.maxLeadDays <= 0) {
    throw new AppError(
      "INVALID_OFFER_RULES",
      "Minimum lead time must not be negative and maximum lead time must be positive.",
      400,
    );
  }
  if (rules.minLeadMinutes >= rules.maxLeadDays * 1_440) {
    throw new AppError(
      "INVALID_OFFER_RULES",
      "Minimum lead time must be smaller than the maximum lead time.",
      400,
    );
  }
}

function exceptionDto(exception: {
  id: string;
  date: Date;
  startTime: Date | null;
  endTime: Date | null;
  available: boolean;
  reason: string | null;
  decidedBy: string | null;
  decidedReason: string | null;
}) {
  return {
    id: exception.id,
    date: exception.date.toISOString().slice(0, 10),
    startTime:
      exception.startTime === null
        ? null
        : timeFromMinutes(databaseTimeToMinutes(exception.startTime)),
    endTime:
      exception.endTime === null
        ? null
        : timeFromMinutes(databaseTimeToMinutes(exception.endTime)),
    available: exception.available,
    reason: exception.reason,
    decidedBy: exception.decidedBy,
    decidedReason: exception.decidedReason,
  };
}

function blockSeriesDto(series: {
  id: string;
  kind: "BLOCK" | "PERSONAL";
  title: string | null;
  daysOfWeek: number[];
  startTime: Date;
  endTime: Date;
  seriesStartDate: Date;
  seriesEndDate: Date | null;
  occurrenceCount: number | null;
  status: "ACTIVE" | "ENDED";
  supersededById: string | null;
}) {
  return {
    id: series.id,
    kind: series.kind,
    title: series.title,
    daysOfWeek: series.daysOfWeek,
    startTime: timeFromMinutes(databaseTimeToMinutes(series.startTime)),
    endTime: timeFromMinutes(databaseTimeToMinutes(series.endTime)),
    seriesStartDate: series.seriesStartDate.toISOString().slice(0, 10),
    seriesEndDate: series.seriesEndDate?.toISOString().slice(0, 10) ?? null,
    occurrenceCount: series.occurrenceCount,
    status: series.status,
    supersededById: series.supersededById,
  };
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

/** Envolve uma mutacao da importacao na mesma idempotencia da agenda (Goal008). */
async function withImportIdempotency<TResult extends Record<string, unknown>>(
  prisma: PrismaClient,
  input: { tenantId: string; key: string; operation: string; request: unknown },
  run: () => Promise<TResult>,
): Promise<TResult> {
  return new CalendarMutationIdempotency(prisma).execute<TResult>({
    tenantId: input.tenantId,
    key: input.key,
    operation: input.operation,
    request: input.request,
    execute: () => run(),
    parseResponse: (value) => value as TResult,
  });
}

async function requireImportSession(
  prisma: PrismaClient,
  tenantId: string,
  sessionId: string,
) {
  const session = await prisma.importSession.findUnique({
    where: { tenantId_id: { tenantId, id: sessionId } },
  });
  if (!session) {
    throw new AppError(
      "IMPORT_SESSION_NOT_FOUND",
      "Import session was not found.",
      404,
    );
  }
  return session;
}

async function buildMinhaAgendaReader(
  prisma: PrismaClient,
  tenantId: string,
): Promise<MinhaAgendaCalendarProvider> {
  const connection = await requireIntegration(prisma, tenantId);
  return new MinhaAgendaCalendarProvider(
    parseMinhaAgendaConnection(connection),
  );
}

/**
 * Janela da leitura da origem: dez anos para tras (historico de agendamento
 * passado/cancelado/falta) e dez anos para frente (agenda futura), com
 * "hoje" no fuso do negocio como referencia que separa passado de futuro.
 */
function importSnapshotWindow(timezone: string): GetImportSnapshotInput {
  const referenceDate = todayInTimeZone(timezone);
  return {
    referenceDate,
    startDate: addDays(referenceDate, -3_650),
    endDate: addDays(referenceDate, 3_650),
  };
}

/**
 * Resumo da analise devolvido pela rota: os itens em si sao lidos pela rota
 * de listagem paginada, nunca inteiros aqui — uma sessao com milhares de
 * registros nao cabe, de novo, no corpo de `analyze` nem na resposta gravada
 * pela `Idempotency-Key`.
 */
function importPreviewSummaryDto(
  result: ImportPreviewResult,
): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    previewVersion: result.previewVersion,
    generatedAt: result.generatedAt,
    categories: result.categories,
    changesSincePreviousVersion: result.changesSincePreviousVersion,
  };
}

const IMPORT_CATEGORY_ORDER: ImportCategory[] = [
  "SERVICE",
  "CUSTOMER",
  "AVAILABILITY",
  "TIME_BLOCK",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
];

/** Um item ja resolvido, ou ja decidido, nao recebe uma segunda decisao. */
const DECIDED_ITEM_STATUSES = new Set<ImportItemStatus>([
  "IMPORTED",
  "SKIPPED",
  "FAILED",
]);

function tallyItems(rows: Array<{ status: ImportItemStatus }>) {
  const counts = {
    pending: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    needsReview: 0,
  };
  for (const row of rows) {
    if (row.status === "PENDING") counts.pending += 1;
    else if (row.status === "IMPORTED") counts.imported += 1;
    else if (row.status === "SKIPPED") counts.skipped += 1;
    else if (row.status === "FAILED") counts.failed += 1;
    else if (row.status === "NEEDS_REVIEW") counts.needsReview += 1;
  }
  return counts;
}

function importItemDto(item: {
  id: string;
  category: ImportCategory;
  externalId: string;
  label: string | null;
  status: ImportItemStatus;
  reasonCode: string | null;
  reasonDetail: string | null;
  entityType: ExternalEntityType | null;
  internalId: string | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  processedAt: Date | null;
  disappearedAt: Date | null;
}) {
  return {
    id: item.id,
    category: item.category,
    externalId: item.externalId,
    label: item.label,
    status: item.status,
    reasonCode: item.reasonCode,
    reasonDetail: item.reasonDetail,
    entityType: item.entityType,
    internalId: item.internalId,
    attemptCount: item.attemptCount,
    lastAttemptAt: item.lastAttemptAt?.toISOString() ?? null,
    processedAt: item.processedAt?.toISOString() ?? null,
    disappearedAt: item.disappearedAt?.toISOString() ?? null,
  };
}

function importDecisionDto(decision: {
  id: string;
  scope: string;
  decision: string;
  category: ImportCategory | null;
  itemId: string | null;
  externalId: string | null;
  targetInternalId: string | null;
  noteCode: string | null;
  decidedBy: string;
  decidedAt: Date;
}) {
  return {
    id: decision.id,
    scope: decision.scope,
    decision: decision.decision,
    category: decision.category,
    itemId: decision.itemId,
    externalId: decision.externalId,
    targetInternalId: decision.targetInternalId,
    noteCode: decision.noteCode,
    decidedBy: decision.decidedBy,
    decidedAt: decision.decidedAt.toISOString(),
  };
}

function importCompletionDto(
  result: ImportCompletionResult,
): Record<string, unknown> {
  return {
    ...result,
    completedAt: result.completedAt.toISOString(),
    pendingAcceptance: result.pendingAcceptance
      ? {
          ...result.pendingAcceptance,
          acceptedAt: result.pendingAcceptance.acceptedAt.toISOString(),
        }
      : null,
  };
}

type ImportItemUpdateData = Parameters<
  PrismaClient["importItem"]["update"]
>[0]["data"];

/**
 * Aplica a decisao de um item da importacao (Goal010, WU-08).
 *
 * `EXCLUDE` resolve o item como `SKIPPED` — nunca mais reprocessado.
 * `INCLUDE`/`CREATE_NEW` devolvem o item a `PENDING`, ignorando a
 * correspondencia que o preview sugeriu: a proxima execucao cria um registro
 * novo. `MERGE_WITH_EXISTING`/`KEEP_EXISTING` resolvem o item como
 * `IMPORTED` apontando para o registro ja cadastrado escolhido, e gravam
 * `ExternalEntityMap` no mesmo commit para que uma reanalise ou nova
 * execucao reconhecam o item como ja tratado. So `SERVICE` e `CUSTOMER` tem
 * correspondencia calculada pelo preview (Goal010, WU-03): as demais
 * categorias nunca recebem essas duas decisoes.
 */
async function applyImportDecision(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    sessionId: string;
    itemId: string;
    decidedBy: string;
    decision:
      | "INCLUDE"
      | "EXCLUDE"
      | "MERGE_WITH_EXISTING"
      | "CREATE_NEW"
      | "KEEP_EXISTING";
    targetInternalId?: string;
    noteCode?: string;
  },
): Promise<Record<string, unknown>> {
  const session = await requireImportSession(
    prisma,
    input.tenantId,
    input.sessionId,
  );
  if (session.status === "COMPLETED") {
    throw new AppError(
      "IMPORT_ALREADY_COMPLETED",
      "This business has already completed its single import; there is no second one.",
      409,
      { sessionId: session.id, completedAt: session.completedAt },
    );
  }
  const item = await prisma.importItem.findUnique({
    where: { tenantId_id: { tenantId: input.tenantId, id: input.itemId } },
  });
  if (!item || item.sessionId !== input.sessionId) {
    throw new AppError(
      "IMPORT_ITEM_NOT_FOUND",
      "Import item was not found.",
      404,
    );
  }
  const existingDecision = await prisma.importDecision.findFirst({
    where: { tenantId: input.tenantId, itemId: item.id, scope: "ITEM" },
  });
  if (existingDecision || DECIDED_ITEM_STATUSES.has(item.status)) {
    throw new AppError(
      "IMPORT_ITEM_ALREADY_DECIDED",
      "This item already has a decision; a decision is registered once.",
      409,
      { itemId: item.id, status: item.status },
    );
  }

  const entityType = CATEGORY_ENTITY_TYPE[item.category];
  const mergeable =
    input.decision === "MERGE_WITH_EXISTING" ||
    input.decision === "KEEP_EXISTING";
  if (mergeable && entityType !== "SERVICE" && entityType !== "CUSTOMER") {
    throw new AppError(
      "IMPORT_DECISION_NOT_SUPPORTED_FOR_CATEGORY",
      `${input.decision} is not supported for category ${item.category}.`,
      422,
      { category: item.category },
    );
  }

  const now = new Date();
  const [updatedItem, decision] = await prisma.$transaction(
    async (transaction) => {
      let itemUpdate: ImportItemUpdateData;
      if (input.decision === "EXCLUDE") {
        itemUpdate = {
          status: "SKIPPED",
          reasonCode: "EXCLUDED_BY_DECISION",
          reasonDetail: "Item excluído da importação por decisão explícita.",
          processedAt: now,
        };
      } else if (mergeable) {
        const targetId = input.targetInternalId as string;
        const target =
          entityType === "SERVICE"
            ? await transaction.service.findUnique({
                where: {
                  tenantId_id: { tenantId: input.tenantId, id: targetId },
                },
              })
            : await transaction.customer.findUnique({
                where: {
                  tenantId_id: { tenantId: input.tenantId, id: targetId },
                },
              });
        if (!target) {
          throw new AppError(
            "IMPORT_DECISION_TARGET_NOT_FOUND",
            "The chosen existing record was not found.",
            404,
            { targetInternalId: targetId },
          );
        }
        await transaction.externalEntityMap.upsert({
          where: {
            tenantId_provider_entityType_externalId: {
              tenantId: input.tenantId,
              provider: session.provider,
              entityType,
              externalId: item.externalId,
            },
          },
          create: {
            tenantId: input.tenantId,
            provider: session.provider,
            entityType,
            externalId: item.externalId,
            internalId: targetId,
          },
          update: { internalId: targetId },
        });
        itemUpdate = {
          status: "IMPORTED",
          entityType,
          internalId: targetId,
          reasonCode:
            input.decision === "MERGE_WITH_EXISTING"
              ? "MERGED_BY_DECISION"
              : "KEPT_EXISTING_BY_DECISION",
          reasonDetail:
            input.decision === "MERGE_WITH_EXISTING"
              ? "Registro mesclado com um já cadastrado, por decisão explícita."
              : "Registro existente mantido; nada foi criado, por decisão explícita.",
          processedAt: now,
        };
      } else {
        // INCLUDE ou CREATE_NEW: volta a ser um item pendente comum, e o
        // motor cria um registro novo na proxima execucao — ignorando a
        // correspondencia sugerida.
        itemUpdate = {
          status: "PENDING",
          reasonCode:
            input.decision === "CREATE_NEW"
              ? "CREATE_NEW_BY_DECISION"
              : "INCLUDED_BY_DECISION",
          reasonDetail:
            "Inclusão confirmada por decisão explícita, ignorando a correspondência sugerida.",
        };
      }

      const updated = await transaction.importItem.update({
        where: { tenantId_id: { tenantId: input.tenantId, id: item.id } },
        data: itemUpdate,
      });
      const createdDecision = await transaction.importDecision.create({
        data: {
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          scope: "ITEM",
          decision: input.decision,
          category: item.category,
          itemId: item.id,
          externalId: item.externalId,
          previewVersion: session.previewVersion,
          targetInternalId: input.targetInternalId ?? null,
          noteCode: input.noteCode ?? null,
          decidedBy: input.decidedBy,
          decidedAt: now,
        },
      });
      return [updated, createdDecision] as const;
    },
  );

  return {
    item: importItemDto(updatedItem),
    decision: importDecisionDto(decision),
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
