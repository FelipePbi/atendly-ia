import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  ExternalEntityType,
  ImportCategory,
  ImportItemStatus,
} from "../../generated/prisma/enums.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import {
  currentInternalContext,
  type InternalRequestContext,
  requireDeliveryCaller,
  requireHumanCaller,
  requireInternalAuth,
} from "../../shared/auth/internal-auth.js";
import {
  addDays,
  databaseTimeToMinutes,
  instantToLocalDateTime,
  localDateTimeToInstant,
  timeFromMinutes,
  weekdayIndex,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  ACTIVITY_AREAS,
  type ActivityChange,
  actorFromContext,
  diffFields,
  listActivity,
  parseActivitySequence,
  recordActivity,
} from "../activity/activity-log.js";
import {
  customerActivity,
  recordCustomerFact,
  serviceActivity,
} from "../activity/entity-activity.js";
import {
  AI_CREATED_APPOINTMENT_EVENTS_MAX_LIMIT,
  listAiCreatedAppointmentEvents,
} from "../appointments/appointment-event-service.js";
import { runAutoCompleteSweep } from "../appointments/auto-complete-loop.js";
import {
  assertNonOverlappingRules,
  sortAvailabilityGrid,
} from "../availability/availability-grid.js";
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
import {
  createTimeBlock,
  listTimeBlocks,
  removeTimeBlock,
} from "../calendar/time-blocks.js";
import { databaseNow } from "../calendar/write-policy.js";
import {
  type AppointmentSummary,
  AvenlyCustomerService,
} from "../customers/avenly-customer-service.js";
import { encryptIntegrationCredentials } from "../integrations/credentials.js";
import { createMinhaAgendaClient } from "../integrations/minha-agenda/client.js";
import {
  minhaAgendaSystemSettings,
  parseMinhaAgendaConnection,
  resolveDiscoveredEmployeeId,
} from "../integrations/minha-agenda/config.js";
import { todayInTimeZone } from "../integrations/minha-agenda/date-time.js";
import {
  type GetImportSnapshotInput,
  MinhaAgendaImportSourceReader,
} from "../integrations/minha-agenda/import-source-reader.js";
import {
  CATEGORY_ENTITY_TYPE,
  ImportBackgroundWork,
  type ImportCompletionResult,
  ImportCompletionService,
  ImportExecutionService,
  type ImportHistoryEntry,
  type ImportLiveSession,
  ImportPreviewService,
  type ImportPreviewSnapshot,
  type ImportPreviewSourceReader,
  type ImportRight,
  importWorkFailure,
  isImportSessionInterrupted,
} from "../migrations/index.js";
import {
  claimDueNotificationIntents,
  settleNotificationIntent,
} from "../reminders/notification-dispatch-service.js";
import {
  FAILED_NOTIFICATION_INTENTS_MAX_LIMIT,
  listFailedNotificationIntents,
} from "../reminders/notification-read-service.js";
import {
  clearExpiredNotificationContent,
  NOTIFICATION_CONTENT_RETENTION_MAX_ROWS_LIMIT,
} from "../reminders/notification-retention-service.js";
import {
  MAX_REMINDER_LEAD_MINUTES,
  ReminderService,
} from "../reminders/reminder-service.js";
import {
  loadRevenueAppointmentList,
  REVENUE_APPOINTMENT_KINDS,
} from "../revenue/revenue-appointments.js";
import {
  loadRevenueReport,
  REVENUE_PERIODS,
} from "../revenue/revenue-report.js";
import { AvenlyServiceService } from "../services/avenly-service-service.js";
import {
  TENANT_PURGE_MAX_ROWS_LIMIT,
  TenantPurgeService,
} from "./tenantPurge.js";

// Fonte da agenda (Goal109): `AVENLY` e o unico valor gravado e devolvido.
// `ATENDLY` e o nome legado do mesmo valor e continua aceito na entrada, para
// que um BFF ainda na versao anterior durante o deploy continue gravando a
// fonte; ele e gravado como `AVENLY`.
const LEGACY_CALENDAR_SOURCE = "ATENDLY";
const sourceSchema = z
  .enum(["AVENLY", LEGACY_CALENDAR_SOURCE])
  .transform(() => "AVENLY" as const);
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
  // Antecedencia minima do cliente (Goal073), aditiva ao mesmo corpo:
  // ausente preserva o valor ja gravado, no mesmo padrao das demais regras
  // de oferta.
  customerChangeMinNoticeMinutes: z
    .number()
    .int()
    .min(0)
    .max(10_080)
    .optional(),
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
// --- Configuracao de lembrete (Goal021, WU-002) -----------------------------
const reminderSlotSchema = z.enum(["FIRST", "SECOND"]);
const reminderPricePolicySchema = z.enum(["NEVER", "WHEN_FIXED"]);
const reminderRuleBodySchema = z.object({
  slot: reminderSlotSchema,
  leadMinutes: z.number().int().positive().max(MAX_REMINDER_LEAD_MINUTES),
});
const reminderSettingsBodySchema = z.object({
  confirmationEnabled: z.boolean().optional(),
  pricePolicy: reminderPricePolicySchema.optional(),
  // Zero e escolha legitima: desligar os lembretes de proposito.
  rules: z.array(reminderRuleBodySchema).max(2),
});

// --- Reivindicacao e liquidacao da entrega (Goal021, WU-005) ---------------
// Vocabulario fechado do motivo, o mesmo do enum do banco: a entrega escolhe
// dentro dele e nunca manda texto livre no lugar do motivo.
const notificationReasonSchema = z.enum([
  "LEAD_ALREADY_PASSED",
  "APPOINTMENT_VERSION_SUPERSEDED",
  "APPOINTMENT_NOT_CONFIRMED",
  "APPOINTMENT_CANCELLED",
  "APPOINTMENT_ALREADY_STARTED",
  "REMINDER_CONFIGURATION_CHANGED",
  "CUSTOMER_WITHOUT_PHONE",
  "CONTACT_IGNORED",
  "AI_NOT_ENABLED",
  "CHANNEL_NOT_CONNECTED",
  "TRANSPORT_FAILED",
  "TRANSPORT_UNKNOWN",
  "ATTEMPTS_EXHAUSTED",
]);
const notificationClaimBodySchema = z.object({
  owner: z.string().trim().min(1).max(128).optional(),
  // Os tetos do corpo só apertam o padrão configurado; nenhum deles afrouxa
  // o que o ambiente declarou, porque o teto existe contra a rajada.
  limit: z.number().int().positive().max(500).optional(),
  perTenantLimit: z.number().int().positive().max(500).optional(),
  leaseTtlSeconds: z.number().int().positive().max(3_600).optional(),
});
const notificationSettleBodySchema = z.object({
  leaseToken: z.string().trim().min(1).max(128),
  outcome: z.enum(["SENT", "FAILED", "DISMISSED"]),
  reason: notificationReasonSchema.optional(),
  // Complemento sanitizado; nunca substitui o motivo e nunca carrega payload
  // cru nem credencial.
  detail: z.string().trim().min(1).max(500).optional(),
  correlationId: z.string().trim().min(1).max(200).optional(),
});

// --- Central de notificacoes e alertas persistentes (Goal022, WU-01) ------
const failedNotificationIntentsQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(FAILED_NOTIFICATION_INTENTS_MAX_LIMIT)
    .optional(),
});
// --- Esvaziamento de conteúdo das intenções terminais (Goal023, WU-03) ----
const notificationContentRetentionBodySchema = z.object({
  settledBefore: z.iso.datetime({ offset: true }),
  maxRows: z
    .number()
    .int()
    .min(1)
    .max(NOTIFICATION_CONTENT_RETENTION_MAX_ROWS_LIMIT),
});

// Purga do negocio inteiro (Goal025/WU-06). `.strict()` recusa qualquer campo
// alem de `maxRows`: nao existe forma de mandar lista de negocios nem sinal de
// "apague tudo" pelo corpo, e o tenant nunca vem daqui — vem so do contexto
// interno ja autenticado (`currentInternalContext`). Sem `maxRows` nao ha
// passada.
const tenantPurgeBodySchema = z
  .object({
    maxRows: z.number().int().min(1).max(TENANT_PURGE_MAX_ROWS_LIMIT),
  })
  .strict();
const aiCreatedAppointmentEventsQuerySchema = z.object({
  // BigInt de `AppointmentEvent.sequence`, sempre nao negativo; a validacao
  // de forma so aceita digitos e a validacao de valor fica no service, que e
  // quem sabe converter para `BigInt` com seguranca.
  afterSequence: z.string().trim().regex(/^\d+$/).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(AI_CREATED_APPOINTMENT_EVENTS_MAX_LIMIT)
    .optional(),
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
  // Cor personalizada do seletor de cores (2026-10-18); exclusiva com o token.
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  bufferBeforeMinutes: z
    .number()
    .int()
    .nonnegative()
    .max(240)
    .nullable()
    .optional(),
  bufferAfterMinutes: z
    .number()
    .int()
    .nonnegative()
    .max(240)
    .nullable()
    .optional(),
  recurrenceIntervalDays: z
    .number()
    .int()
    .positive()
    .max(365)
    .nullable()
    .optional(),
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
    // Desativar/reativar (2026-10-18).
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one customer field is required.",
  });
const customerQuerySchema = z.object({
  phone: z.string().trim().min(6).max(32).optional(),
  // Busca livre por nome ou telefone; vazia é o mesmo que não buscar.
  q: z.string().trim().max(100).optional(),
  // `limit` ou `cursor` liga a paginação; sem os dois, a lista sai inteira,
  // como sempre saiu, para quem ainda depende dela inteira.
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1_024).optional(),
  // Abas e ordem da tela de Clientes (2026-10-18); ausentes, todos por nome.
  status: z.enum(["active", "inactive"]).optional(),
  sort: z.enum(["name", "last", "frequency", "next"]).optional(),
});
const CUSTOMER_PAGE_DEFAULT_LIMIT = 50;
const customerDependentsQuerySchema = z.object({
  phone: z.string().trim().min(6).max(32),
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
/** Nome do responsável para o antes/depois, ou o telefone sem nome. */
function guardianLabel(
  customer: { name: string | null; phone: string | null } | null | undefined,
): string | null {
  return customer ? (customer.name ?? customer.phone ?? null) : null;
}

/** Lista separada por vírgula (`area=AGENDA,CUSTOMERS`). */
const commaList = <T extends z.ZodType<string, string>>(item: T) =>
  z
    .string()
    .trim()
    .max(4_000)
    .transform((value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).max(80))
    .optional();

const activityQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  actor: z.enum(["AI", "USER"]).optional(),
  area: commaList(z.enum(ACTIVITY_AREAS)),
  action: commaList(z.string().regex(/^[a-z_]+\.[a-z_]+$/)),
  q: z.string().trim().max(100).optional(),
  beforeAt: z.iso.datetime({ offset: true }).optional(),
  beforeSequence: z
    .string()
    .regex(/^\d{1,19}$/)
    .optional(),
  inclusive: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Faturamento (D-177): um dia qualquer do período pedido, no fuso do negócio.
const revenueQuerySchema = z.object({
  period: z.enum(REVENUE_PERIODS),
  date: dateSchema
    .refine((value) => {
      const [year, month, day] = value.split("-").map(Number) as [
        number,
        number,
        number,
      ];
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return (
        year >= 2000 &&
        year <= 2100 &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
      );
    }, "Invalid calendar date.")
    .optional(),
  // Lista completa de clientes do período (2026-10-18); ausente, os cinco.
  customers: z.enum(["top", "all"]).optional(),
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
    {
      path: ["endTime"],
      message:
        "Provide both startTime and endTime, or neither for a whole day.",
    },
  )
  .refine(
    (value) =>
      value.startTime === undefined ||
      value.endTime === undefined ||
      value.startTime < value.endTime,
    { path: ["endTime"], message: "End must be after start." },
  )
  .refine(
    (value) =>
      (value.decidedBy === undefined) === (value.decidedReason === undefined),
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
// Conexao com so e-mail e senha (Goal060 §2): endereco e cliente OAuth vem do
// sistema, o profissional e descoberto (§3). `.strict()` recusa qualquer
// campo a mais — inclusive o envelope antigo `credentials`/`configuration` —
// sem chamada a origem e sem escrita.
const integrationConnectBodySchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(500),
  })
  .strict();

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
const setImportCategorySelectionBodySchema = z.object({
  selected: z.boolean(),
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

/**
 * Dependencias do trabalho da importacao em segundo plano (Goal061 §1).
 * `importWork` e o conjunto em memoria que `app.close()` espera;
 * `importSourceReader` monta o leitor da origem **dentro** do trabalho — o
 * teste troca-o por uma origem que so responde quando ele a libera.
 */
export interface ManagementRoutesOptions {
  importWork?: ImportBackgroundWork;
  importSourceReader?: (tenantId: string) => Promise<ImportPreviewSourceReader>;
}

export async function registerManagementRoutes(
  app: FastifyInstance,
  prismaClient: PrismaClient = getPrisma(),
  options: ManagementRoutesOptions = {},
): Promise<void> {
  const prisma = prismaClient;
  const internalOnly = { preHandler: requireInternalAuth };
  // Quem nao recebe o conjunto de fora (teste de rota) cria o seu e o
  // espera no proprio `onClose`; `buildApp` passa o dele e o espera antes
  // de desconectar o banco.
  const importWork =
    options.importWork ??
    new ImportBackgroundWork((error) => {
      app.log.error(
        { errorCode: importWorkFailure(error).errorCode },
        "Import work failed",
      );
    });
  if (!options.importWork) {
    app.addHook("onClose", async () => {
      await importWork.drain();
    });
  }
  const importSourceReader =
    options.importSourceReader ??
    ((tenantId: string) => buildMinhaAgendaReader(prisma, tenantId));
  const tenantPurge = new TenantPurgeService(prisma);
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
    await prisma.$transaction(async (transaction) => {
      await transaction.calendarSettings.upsert({
        where: { tenantId: context.tenantId },
        create: { tenantId: context.tenantId, ...body },
        update: { timezone: body.timezone },
      });
      if (existing) {
        await recordSettingsChange(
          transaction,
          context,
          "settings.timezone_updated",
          { timezone: existing.timezone },
          { timezone: body.timezone },
        );
      }
    });
    return data(request, await calendarOverview(prisma, context));
  });

  app.get("/internal/service-catalog", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireCalendar(prisma, context.tenantId);
    const catalog = new AvenlyServiceService(prisma, context.tenantId);
    const [services, usage] = await Promise.all([
      catalog.list(),
      catalog.usageCounts(),
    ]);
    // `usageCount`: atendimentos dos últimos 90 dias com o serviço (D-170),
    // para o novo agendamento mostrar primeiro os mais usados.
    return data(
      request,
      services.map((service) => ({
        ...serviceDto(service),
        usageCount: usage.get(service.id) ?? 0,
      })),
    );
  });

  app.post(
    "/internal/service-catalog",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      await requireCalendar(prisma, context.tenantId);
      const body = parse(serviceBodySchema, request.body);
      const service = await prisma.$transaction(async (transaction) => {
        const created = await new AvenlyServiceService(
          transaction,
          context.tenantId,
        ).create(body);
        await serviceActivity.created(
          transaction,
          context.tenantId,
          actorFromContext(context),
          created,
        );
        return created;
      });
      return reply.code(201).send(data(request, serviceDto(service)));
    },
  );

  app.patch("/internal/service-catalog/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(servicePatchSchema, request.body);
    const service = await prisma.$transaction(async (transaction) => {
      const serviceManager = new AvenlyServiceService(
        transaction,
        context.tenantId,
      );
      const before = await serviceManager.requireService(id);
      let after = await serviceManager.update(id, body);
      if (body.active !== undefined && body.active !== after.active) {
        after = await serviceManager.setActive(id, body.active);
      }
      await serviceActivity.updated(
        transaction,
        context.tenantId,
        actorFromContext(context),
        before,
        after,
      );
      return after;
    });
    return data(request, serviceDto(service));
  });

  app.get("/internal/customers", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const settings = await requireCalendar(prisma, context.tenantId);
    const query = parse(customerQuerySchema, request.query ?? {});
    const customers = new AvenlyCustomerService(prisma, context.tenantId);
    const filter = {
      phone: query.phone,
      search: query.q,
      status: query.status,
      sort: query.sort,
    };
    const options = { timezone: settings.timezone };
    const page =
      query.limit !== undefined || query.cursor !== undefined
        ? await customers.listPage(
            filter,
            {
              limit: query.limit ?? CUSTOMER_PAGE_DEFAULT_LIMIT,
              cursor: query.cursor,
            },
            options,
          )
        : await customers.list(filter, options).then((items) => ({
            items,
            total: items.length,
            nextCursor: null,
          }));
    return data(request, {
      items: page.items.map(customerDto),
      // Total do filtro inteiro, não da página; `nextCursor` nulo é o fim.
      total: page.total,
      nextCursor: page.nextCursor,
      source: settings.source,
      managedExternally: false,
      // Busca por telefone devolve **candidatos**: zero, um ou vários. A
      // escolha entre eles é sempre explícita.
      filteredByPhone: query.phone !== undefined,
    });
  });

  /**
   * Dependentes confirmados dos candidatos de um telefone (Goal142). Rota
   * estática: o Fastify a prefere a `/internal/customers/:id`, então
   * `dependents` nunca é lido como identificador.
   */
  app.get("/internal/customers/dependents", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireCalendar(prisma, context.tenantId);
    const query = parse(customerDependentsQuerySchema, request.query ?? {});
    const items = await new AvenlyCustomerService(
      prisma,
      context.tenantId,
    ).findDependentsByPhone(query.phone);
    return data(request, { items });
  });

  app.get("/internal/customers/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const settings = await requireCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const customers = new AvenlyCustomerService(prisma, context.tenantId);
    const [customer, guardian, notes, tags, appointmentStats, highlights] =
      await Promise.all([
        customers.get(id),
        customers.primaryGuardian(id),
        customers.listNotes(id),
        customers.listTags(id),
        customers.appointmentStats(id, settings.timezone),
        customers.appointmentHighlights(id, { timezone: settings.timezone }),
      ]);
    return data(request, {
      ...customerDto({ ...customer, ...highlights }),
      primaryGuardian: primaryGuardianDto(guardian),
      notes: notes.map(customerNoteDto),
      tags: tags.map(customerTagDto),
      appointmentStats,
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
      await requireCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const authorized = await new AvenlyCustomerService(
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
    await requireCalendar(prisma, context.tenantId);
    const body = parse(customerBodySchema, request.body);
    const customer = await prisma.$transaction(async (transaction) => {
      const created = await new AvenlyCustomerService(
        transaction,
        context.tenantId,
      ).create(body);
      await customerActivity.created(
        transaction,
        context.tenantId,
        actorFromContext(context),
        created,
      );
      return created;
    });
    return reply.code(201).send(data(request, customerDto(customer)));
  });

  /** Nome e telefone só mudam por esta operação explícita. */
  app.patch("/internal/customers/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(customerPatchSchema, request.body);
    const customer = await prisma.$transaction(async (transaction) => {
      const customers = new AvenlyCustomerService(
        transaction,
        context.tenantId,
      );
      const before = await customers.get(id);
      const after = await customers.update(id, body);
      await customerActivity.updated(
        transaction,
        context.tenantId,
        actorFromContext(context),
        before,
        after,
      );
      return after;
    });
    return data(request, customerDto(customer));
  });

  app.put(
    "/internal/customers/:id/primary-guardian",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(primaryGuardianBodySchema, request.body);
      const relation = await prisma.$transaction(async (transaction) => {
        const customers = new AvenlyCustomerService(
          transaction,
          context.tenantId,
        );
        const previous = await customers.primaryGuardian(id);
        const next = await customers.setPrimaryGuardian(id, body);
        await recordCustomerFact(
          transaction,
          context.tenantId,
          actorFromContext(context),
          id,
          "customer.guardian_set",
          [
            {
              field: "primaryGuardian",
              before: guardianLabel(previous?.relatedCustomer),
              after: guardianLabel(next.relatedCustomer),
            },
          ],
          { status: next.status },
        );
        return next;
      });
      return data(request, primaryGuardianDto(relation));
    },
  );

  app.post(
    "/internal/customers/:id/primary-guardian/confirm",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(primaryGuardianConfirmSchema, request.body);
      const relation = await prisma.$transaction(async (transaction) => {
        const confirmed = await new AvenlyCustomerService(
          transaction,
          context.tenantId,
        ).confirmPrimaryGuardian(id, {
          confirmedBy: body.confirmedBy,
          actor: body.actor,
        });
        await recordCustomerFact(
          transaction,
          context.tenantId,
          actorFromContext(context),
          id,
          "customer.guardian_confirmed",
          [],
          { guardianName: guardianLabel(confirmed.relatedCustomer) },
        );
        return confirmed;
      });
      return data(request, primaryGuardianDto(relation));
    },
  );

  app.delete(
    "/internal/customers/:id/primary-guardian",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const result = await prisma.$transaction(async (transaction) => {
        const customers = new AvenlyCustomerService(
          transaction,
          context.tenantId,
        );
        const previous = await customers.primaryGuardian(id);
        const cleared = await customers.clearPrimaryGuardian(id);
        if (cleared.deleted) {
          await recordCustomerFact(
            transaction,
            context.tenantId,
            actorFromContext(context),
            id,
            "customer.guardian_cleared",
            [
              {
                field: "primaryGuardian",
                before: guardianLabel(previous?.relatedCustomer),
                after: null,
              },
            ],
          );
        }
        return cleared;
      });
      return data(request, result);
    },
  );

  app.get("/internal/customers/:id/notes", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const notes = await new AvenlyCustomerService(
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
      await requireCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(customerNoteBodySchema, request.body);
      const note = await prisma.$transaction(async (transaction) => {
        const created = await new AvenlyCustomerService(
          transaction,
          context.tenantId,
        ).addNote(id, body);
        await recordCustomerFact(
          transaction,
          context.tenantId,
          actorFromContext(context),
          id,
          "customer.note_added",
          [{ field: "note", before: null, after: created.body }],
        );
        return created;
      });
      return reply.code(201).send(data(request, customerNoteDto(note)));
    },
  );

  app.patch(
    "/internal/customers/:id/notes/:childId",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireCalendar(prisma, context.tenantId);
      const params = parse(customerChildParamsSchema, request.params);
      const body = parse(authorizationPatchSchema, request.body);
      const note = await prisma.$transaction(async (transaction) => {
        const before = await transaction.customerNote.findFirst({
          where: {
            tenantId: context.tenantId,
            customerId: params.id,
            id: params.childId,
          },
        });
        const after = await new AvenlyCustomerService(
          transaction,
          context.tenantId,
        ).setNoteAuthorization(params.id, params.childId, body);
        if (before?.aiAuthorized !== after.aiAuthorized) {
          await recordCustomerFact(
            transaction,
            context.tenantId,
            actorFromContext(context),
            params.id,
            "customer.note_ai_access",
            [
              {
                field: "aiAuthorized",
                before: before?.aiAuthorized ?? null,
                after: after.aiAuthorized,
              },
            ],
            { note: after.body },
          );
        }
        return after;
      });
      return data(request, customerNoteDto(note));
    },
  );

  app.delete(
    "/internal/customers/:id/notes/:childId",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireCalendar(prisma, context.tenantId);
      const params = parse(customerChildParamsSchema, request.params);
      const result = await prisma.$transaction(async (transaction) => {
        const before = await transaction.customerNote.findFirst({
          where: {
            tenantId: context.tenantId,
            customerId: params.id,
            id: params.childId,
          },
        });
        const removed = await new AvenlyCustomerService(
          transaction,
          context.tenantId,
        ).deleteNote(params.id, params.childId);
        if (before) {
          await recordCustomerFact(
            transaction,
            context.tenantId,
            actorFromContext(context),
            params.id,
            "customer.note_deleted",
            [{ field: "note", before: before.body, after: null }],
          );
        }
        return removed;
      });
      return data(request, result);
    },
  );

  app.get("/internal/customers/:id/tags", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const tags = await new AvenlyCustomerService(
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
      await requireCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(customerTagBodySchema, request.body);
      const tag = await prisma.$transaction(async (transaction) => {
        const created = await new AvenlyCustomerService(
          transaction,
          context.tenantId,
        ).addTag(id, body);
        await recordCustomerFact(
          transaction,
          context.tenantId,
          actorFromContext(context),
          id,
          "customer.tag_added",
          [{ field: "tag", before: null, after: created.label }],
        );
        return created;
      });
      return reply.code(201).send(data(request, customerTagDto(tag)));
    },
  );

  app.patch(
    "/internal/customers/:id/tags/:childId",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireCalendar(prisma, context.tenantId);
      const params = parse(customerChildParamsSchema, request.params);
      const body = parse(authorizationPatchSchema, request.body);
      const tag = await prisma.$transaction(async (transaction) => {
        const before = await transaction.customerTag.findFirst({
          where: {
            tenantId: context.tenantId,
            customerId: params.id,
            id: params.childId,
          },
        });
        const after = await new AvenlyCustomerService(
          transaction,
          context.tenantId,
        ).setTagAuthorization(params.id, params.childId, body);
        if (before?.aiAuthorized !== after.aiAuthorized) {
          await recordCustomerFact(
            transaction,
            context.tenantId,
            actorFromContext(context),
            params.id,
            "customer.tag_ai_access",
            [
              {
                field: "aiAuthorized",
                before: before?.aiAuthorized ?? null,
                after: after.aiAuthorized,
              },
            ],
            { tag: after.label },
          );
        }
        return after;
      });
      return data(request, customerTagDto(tag));
    },
  );

  app.delete(
    "/internal/customers/:id/tags/:childId",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      await requireCalendar(prisma, context.tenantId);
      const params = parse(customerChildParamsSchema, request.params);
      const result = await prisma.$transaction(async (transaction) => {
        const before = await transaction.customerTag.findFirst({
          where: {
            tenantId: context.tenantId,
            customerId: params.id,
            id: params.childId,
          },
        });
        const removed = await new AvenlyCustomerService(
          transaction,
          context.tenantId,
        ).deleteTag(params.id, params.childId);
        if (before) {
          await recordCustomerFact(
            transaction,
            context.tenantId,
            actorFromContext(context),
            params.id,
            "customer.tag_deleted",
            [{ field: "tag", before: before.label, after: null }],
          );
        }
        return removed;
      });
      return data(request, result);
    },
  );

  app.get("/internal/availability-settings", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const calendar = await requireCalendar(prisma, context.tenantId);
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
      const calendar = await requireCalendar(prisma, context.tenantId);
      const body = parse(availabilityBodySchema, request.body);
      assertTimezone(body.timezone);
      assertNonOverlappingRules(body.rules);
      const minLeadMinutes = body.minLeadMinutes ?? calendar.minLeadMinutes;
      const maxLeadDays = body.maxLeadDays ?? calendar.maxLeadDays;
      const granularityMinutes =
        body.granularityMinutes ?? calendar.granularityMinutes;
      // Ausente preserva o valor ja gravado (Goal073): o corpo so muda o que
      // ele de fato manda.
      const customerChangeMinNoticeMinutes =
        body.customerChangeMinNoticeMinutes ??
        calendar.customerChangeMinNoticeMinutes;
      assertOfferRules({ minLeadMinutes, maxLeadDays, granularityMinutes });
      const previousRules = await prisma.availabilityRule.findMany({
        where: { tenantId: context.tenantId },
      });
      await prisma.$transaction(async (transaction) => {
        await recordSettingsChange(
          transaction,
          context,
          "settings.availability_updated",
          {
            ...availabilityActivityFields(
              previousRules.map(availabilityRuleDto),
            ),
            ...offerRulesDto(calendar),
            timezone: calendar.timezone,
          },
          {
            ...availabilityActivityFields(body.rules),
            minLeadMinutes,
            maxLeadDays,
            granularityMinutes,
            customerChangeMinNoticeMinutes,
            timezone: body.timezone,
          },
        );
        await transaction.calendarSettings.update({
          where: { tenantId: context.tenantId },
          data: {
            timezone: body.timezone,
            minLeadMinutes,
            maxLeadDays,
            granularityMinutes,
            customerChangeMinNoticeMinutes,
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
        customerChangeMinNoticeMinutes,
      });
    },
  );

  // --- Configuracao de lembrete (Goal021, WU-002, G-27) --------------------
  // So humano (BFF): quantos lembretes, antecedencia, confirmacao de
  // presenca e politica de preco sao decisao do negocio, no mesmo padrao de
  // disponibilidade e oferta acima. A IA nunca configura lembrete.

  app.get("/internal/reminder-settings", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    await requireCalendar(prisma, context.tenantId);
    const reminders = new ReminderService(prisma, context.tenantId);
    return data(request, reminderConfigDto(await reminders.get()));
  });

  app.patch("/internal/reminder-settings", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    requireHumanCaller(context);
    await requireCalendar(prisma, context.tenantId);
    const body = parse(reminderSettingsBodySchema, request.body);
    const reminders = new ReminderService(prisma, context.tenantId);
    const previous = await reminders.get();
    const config = await reminders.set(body, (transaction, next) =>
      recordSettingsChange(
        transaction,
        context,
        "settings.reminders_updated",
        reminderActivityFields(previous),
        reminderActivityFields(next),
      ),
    );
    return data(request, reminderConfigDto(config));
  });

  // --- Entrega das intencoes de envio (Goal021, WU-005) -------------------
  // So o entregador (IA): reivindicar e liquidar sao o trabalho de quem fala
  // com o cliente, e o BFF nao tem o que fazer aqui.
  //
  // A reivindicacao e a UNICA rota interna que atravessa negocios, de
  // proposito: quem entrega atende todos, e a fila vence por `dueAt`. A
  // justica entre negocios e o teto por tenant, aplicado no dono. A
  // liquidacao volta a ser por negocio — ela e endereçada a uma intencao
  // nomeada, e o tenant do cabecalho e quem a delimita.

  app.post(
    "/internal/notification-intents/claim",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireDeliveryCaller(context);
      const body = parse(notificationClaimBodySchema, request.body ?? {});
      return data(request, await claimDueNotificationIntents(prisma, body));
    },
  );

  app.post(
    "/internal/notification-intents/:id/settle",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireDeliveryCaller(context);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(notificationSettleBodySchema, request.body);
      return data(
        request,
        await settleNotificationIntent(prisma, {
          tenantId: context.tenantId,
          intentId: id,
          ...body,
        }),
      );
    },
  );

  // --- Central de notificacoes e alertas persistentes (Goal022, WU-01) ----
  // So o BFF (pessoa humana): estas duas leituras alimentam a central que o
  // negocio ve, no mesmo padrao de disponibilidade e lembrete acima. Sempre
  // por negocio — tenantId vem so do cabecalho autenticado, nunca do corpo
  // ou da query.

  app.get(
    "/internal/notification-intents/failed",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      await requireCalendar(prisma, context.tenantId);
      const query = parse(
        failedNotificationIntentsQuerySchema,
        request.query ?? {},
      );
      return data(
        request,
        await listFailedNotificationIntents(prisma, context.tenantId, query),
      );
    },
  );

  // --- Esvaziamento de conteúdo das intenções terminais (Goal023, WU-03) --
  // So o BFF (pessoa humana): quem decide o prazo e quem varre e a central de
  // retenção do negócio, nunca a IA. A linha nunca é apagada aqui — só
  // `facts` e `detail`, e só de intenção já liquidada (`SENT`, `FAILED`,
  // `DISMISSED`, `CANCELLED`); `PENDING`/`CLAIMED` não têm `settledAt` e
  // portanto nunca são candidatas.

  app.post(
    "/internal/notification-intents/content-retention",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const body = parse(notificationContentRetentionBodySchema, request.body);
      return data(
        request,
        await clearExpiredNotificationContent(prisma, {
          tenantId: context.tenantId,
          settledBefore: new Date(body.settledBefore),
          maxRows: body.maxRows,
        }),
      );
    },
  );

  app.get(
    "/internal/appointment-events/ai-created",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      await requireCalendar(prisma, context.tenantId);
      const query = parse(
        aiCreatedAppointmentEventsQuerySchema,
        request.query ?? {},
      );
      return data(
        request,
        await listAiCreatedAppointmentEvents(prisma, context.tenantId, query),
      );
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
      await requireCalendar(prisma, context.tenantId);
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
      const calendar = await requireCalendar(prisma, context.tenantId);
      const body = parse(extraAvailabilityBodySchema, request.body);
      const exception = await createExtraAvailability(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        ...body,
      });
      await recordAgendaFact(
        prisma,
        context,
        "agenda.extra_availability_added",
        exception.id,
        exceptionActivityDetails(exception),
      );
      return reply.code(201).send(data(request, exceptionDto(exception)));
    },
  );

  app.post(
    "/internal/availability-exceptions/unavailable",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireCalendar(prisma, context.tenantId);
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
      await recordAgendaFact(
        prisma,
        context,
        "agenda.unavailability_added",
        exception.id,
        exceptionActivityDetails(exception),
      );
      return reply.code(201).send(data(request, exceptionDto(exception)));
    },
  );

  app.delete(
    "/internal/availability-exceptions/:id",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const existing = await prisma.availabilityException.findFirst({
        where: { tenantId: context.tenantId, id },
      });
      await removeAvailabilityException(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        id,
      });
      if (existing) {
        await recordAgendaFact(
          prisma,
          context,
          existing.available
            ? "agenda.extra_availability_removed"
            : "agenda.unavailability_removed",
          id,
          exceptionActivityDetails(existing),
        );
      }
      return data(request, { deleted: true as const });
    },
  );

  // --- Series de bloqueio/compromisso (Goal009) ---------------------------
  // So humano (BFF): a IA nunca cria bloqueio, compromisso ou serie.

  app.post("/internal/block-series", internalOnly, async (request, reply) => {
    const context = currentInternalContext(request);
    requireHumanCaller(context);
    const calendar = await requireCalendar(prisma, context.tenantId);
    const body = parse(blockSeriesBodySchema, request.body);
    const series = await createBlockSeries(prisma, {
      tenantId: context.tenantId,
      timeZone: calendar.timezone,
      rule: { ...body.rule, title: body.rule.title ?? null },
      createdBy: context.userId,
      skipConflicts: body.skipConflicts,
      forceOverlapReason: body.forceOverlapReason,
    });
    await recordAgendaFact(
      prisma,
      context,
      "agenda.block_series_created",
      series.id,
      blockSeriesDto(series),
    );
    return reply.code(201).send(data(request, blockSeriesDto(series)));
  });

  app.patch(
    "/internal/block-series/:id/from-date",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireCalendar(prisma, context.tenantId);
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
      await recordAgendaFact(
        prisma,
        context,
        "agenda.block_series_updated",
        series.id,
        { ...blockSeriesDto(series), fromDate: body.fromDate },
      );
      return data(request, blockSeriesDto(series));
    },
  );

  app.delete("/internal/block-series/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    requireHumanCaller(context);
    const calendar = await requireCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const existing = await prisma.blockSeries.findFirst({
      where: { tenantId: context.tenantId, id },
    });
    await removeBlockSeriesFuture(prisma, {
      tenantId: context.tenantId,
      timeZone: calendar.timezone,
      seriesId: id,
    });
    if (existing) {
      await recordAgendaFact(
        prisma,
        context,
        "agenda.block_series_removed",
        id,
        blockSeriesDto(existing),
      );
    }
    return data(request, { deleted: true as const });
  });

  app.delete(
    "/internal/time-blocks/:id/occurrence",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const existing = await prisma.timeBlock.findFirst({
        where: { tenantId: context.tenantId, id },
      });
      await removeBlockOccurrence(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        id,
      });
      if (existing) {
        await recordAgendaFact(
          prisma,
          context,
          "agenda.block_removed",
          id,
          timeBlockActivityDetails(existing, calendar.timezone),
        );
      }
      return data(request, { deleted: true as const });
    },
  );

  app.patch(
    "/internal/time-blocks/:id/occurrence",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const calendar = await requireCalendar(prisma, context.tenantId);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(moveOccurrenceBodySchema, request.body);
      const existing = await prisma.timeBlock.findFirst({
        where: { tenantId: context.tenantId, id },
      });
      const block = await moveBlockOccurrence(prisma, {
        tenantId: context.tenantId,
        timeZone: calendar.timezone,
        id,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
      });
      const moved = timeBlockActivityDetails(block, calendar.timezone);
      await recordAgendaFact(
        prisma,
        context,
        "agenda.block_moved",
        id,
        moved,
        existing
          ? [
              {
                field: "startsAt",
                before: timeBlockActivityDetails(existing, calendar.timezone)
                  .startsAt,
                after: moved.startsAt,
              },
            ]
          : [],
      );
      return data(request, timeBlockDto(block));
    },
  );

  // Leitura da grade (Goal016): so leitura, nenhuma sobreposicao de janela
  // permitida — startDate/endDate sao obrigatorios.
  app.get("/internal/time-blocks", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const calendar = await requireCalendar(prisma, context.tenantId);
    const query = parse(exceptionListQuerySchema, request.query);
    const blocks = await listTimeBlocks(prisma, {
      tenantId: context.tenantId,
      timeZone: calendar.timezone,
      startDate: query.startDate,
      endDate: query.endDate,
    });
    return data(request, blocks.map(timeBlockDto));
  });

  // Bloqueio ocupa e libera tempo como qualquer atendimento: mesma transacao,
  // mesmo lock e conflito checado dentro dela (Goal008).
  app.post("/internal/time-blocks", internalOnly, async (request, reply) => {
    const context = currentInternalContext(request);
    // Bloqueio, compromisso pessoal e excecao nunca sao da IA (Goal009).
    requireHumanCaller(context);
    const calendar = await requireCalendar(prisma, context.tenantId);
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
    await recordAgendaFact(
      prisma,
      context,
      "agenda.block_created",
      block.id,
      timeBlockActivityDetails(block, calendar.timezone),
    );
    return reply.code(201).send(data(request, timeBlockDto(block)));
  });

  app.delete("/internal/time-blocks/:id", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    requireHumanCaller(context);
    const calendar = await requireCalendar(prisma, context.tenantId);
    const { id } = parse(idParamsSchema, request.params);
    const existing = await prisma.timeBlock.findFirst({
      where: { tenantId: context.tenantId, id },
    });
    await removeTimeBlock(prisma, {
      tenantId: context.tenantId,
      timeZone: calendar.timezone,
      id,
    });
    if (existing) {
      await recordAgendaFact(
        prisma,
        context,
        "agenda.block_removed",
        id,
        timeBlockActivityDetails(existing, calendar.timezone),
      );
    }
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
      // um tenant com calendario configurado, mesmo que a varredura em si
      // seja global (o loop no processo atende todos os tenants do banco do
      // dono).
      await requireCalendar(prisma, context.tenantId);
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
  // mas nao habilitam operacao nenhuma no calendario operacional: a Agenda
  // Avenly e a unica fonte que existe (Goal010; fonte externa retirada no
  // Goal027) e `CalendarProviderFactory` nao instancia outra coisa. O papel
  // dessas rotas e so o ciclo da importacao unica: guardar/testar a
  // credencial e disparar a leitura da origem. `IntegrationProvider` e
  // `CalendarSource` sao enums diferentes — desconectar a integracao nunca
  // desativa a Agenda Avenly, que nao depende de `IntegrationConnection`.
  app.post(
    "/internal/calendar/integration/connect",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      const body = parse(integrationConnectBodySchema, request.body);
      // A conexao existe agora **so** para o ciclo da importacao unica:
      // guardar e testar a credencial da origem. Ela nao muda a fonte da
      // agenda operacional e nao e mais exigida para operar a agenda.
      // Exigir aqui que `calendar.source` seja `MINHA_AGENDA` tornaria a
      // importacao inalcancavel depois do corte do writer remoto: o negocio
      // que opera na Agenda Avenly — que e todo negocio novo — nunca
      // conseguiria conectar a origem que ele quer importar.
      await requireCalendar(prisma, context.tenantId);
      // Endereco e cliente OAuth do sistema (Goal060 §1): sem a chave de
      // ambiente, a recusa acontece aqui, antes de qualquer chamada a origem
      // e antes de qualquer escrita.
      const settings = minhaAgendaSystemSettings();
      const client = createMinhaAgendaClient({
        tenantId: context.tenantId,
        baseUrl: settings.baseUrl,
        basicAuth: settings.basicAuth,
        username: body.email,
        password: body.password,
        timeoutMs: settings.timeoutMs,
        refreshSkewSeconds: settings.refreshSkewSeconds,
      });
      // Login e descoberta do profissional (Goal060 §3) antes de qualquer
      // escrita: nenhuma falha daqui em diante grava linha nova nem altera a
      // existente.
      const employeeId = resolveDiscoveredEmployeeId(
        await client.listProfessionals(),
      );
      const now = new Date();
      const credentials = { email: body.email, password: body.password };
      const config = { employeeId };
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
            encryptIntegrationCredentials(context.tenantId, credentials),
          ),
          config,
          lastSuccessfulSyncAt: now,
        },
        update: {
          status: "CONNECTED",
          credentialsEncrypted: Uint8Array.from(
            encryptIntegrationCredentials(context.tenantId, credentials),
          ),
          config,
          lastSuccessfulSyncAt: now,
          lastErrorAt: null,
          lastErrorCode: null,
        },
      });
      // Nem e-mail nem senha da origem entram no registro.
      await recordImportFact(prisma, context, "import.source_connected", null);
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
        await new MinhaAgendaImportSourceReader(
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
      // operacional: a Agenda Avenly nao depende de `IntegrationConnection`,
      // e por isso desconectar deixou de exigir migracao previa. O que sai e
      // a credencial da origem; a agenda do negocio segue igual.
      await requireCalendar(prisma, context.tenantId);
      const removed = await prisma.integrationConnection.deleteMany({
        where: { tenantId: context.tenantId, provider: "MINHA_AGENDA" },
      });
      if (removed.count > 0) {
        await recordImportFact(
          prisma,
          context,
          "import.source_disconnected",
          null,
        );
      }
      return data(request, await calendarOverview(prisma, context));
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

  // Leitura pura do estado da importação do negócio: direito, sessão viva
  // (quando houver) e histórico (quando concluída). Nunca abre sessão, muda
  // status, incrementa previewVersion ou consome o direito — é por isso que
  // ela não passa por `requireIntegration`: negócio sem conexão, sem sessão
  // e sem histórico é estado válido e vazio, não erro.
  app.get("/internal/calendar/imports", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    requireHumanCaller(context);
    const completion = new ImportCompletionService(prisma);
    const [right, session, history] = await Promise.all([
      completion.getImportRight(context.tenantId),
      completion.getLiveSession(context.tenantId),
      completion.getHistory(context.tenantId),
    ]);
    return data(request, {
      right: importRightDto(right),
      session: session ? importLiveSessionDto(session) : null,
      history: history ? importHistoryDto(history) : null,
    });
  });

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

  // Inicio curto da analise (Goal061 §1): confere, reivindica gravando
  // `ANALYZING` e responde `202` sem tocar a origem. O trabalho roda no
  // proprio processo e so grava enquanto tem o lease. A mesma
  // `Idempotency-Key` devolve a mesma resposta de inicio e nao dispara um
  // segundo trabalho, porque o disparo mora dentro do callback idempotente.
  app.post(
    "/internal/calendar/imports/:sessionId/analyze",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const key = idempotencyKey(request);
      const { sessionId } = parse(importSessionParamsSchema, request.params);
      const calendar = await requireCalendar(prisma, context.tenantId);
      await requireIntegration(prisma, context.tenantId);
      const snapshotInput = importSnapshotWindow(calendar.timezone);
      const result = await withImportIdempotency(
        prisma,
        {
          tenantId: context.tenantId,
          key,
          operation: "import.analyze",
          request: { sessionId },
        },
        async () => {
          const preview = new ImportPreviewService(prisma);
          const start = await preview.startAnalysis({
            tenantId: context.tenantId,
            sessionId,
          });
          importWork.dispatch(() =>
            preview.runAnalysis(
              start,
              () => importSourceReader(context.tenantId),
              snapshotInput,
            ),
          );
          return importWorkStartDto(start);
        },
      );
      reply.code(202);
      return data(request, result);
    },
  );

  // Leitura do preview gravado pela ultima analise (Goal061 §7.4, WU-02): so
  // `ImportSession`/`ImportSessionCategory` da versao vigente, nunca a
  // origem. Sessao sem analise (`previewVersion` 0) e recusada com codigo
  // proprio, em vez de devolver um preview vazio.
  app.get(
    "/internal/calendar/imports/:sessionId/preview",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const { sessionId } = parse(importSessionParamsSchema, request.params);
      const preview: ImportPreviewSnapshot = await new ImportPreviewService(
        prisma,
      ).getPreview({ tenantId: context.tenantId, sessionId });
      return data(request, preview);
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
      // Disponibilidade (Goal062 §2): a troca so e escolhida vendo as duas
      // grades. Por acrescimo, e so nos itens desta categoria, cada item leva
      // a grade vigente do negocio e a proposta gravada pela analise.
      const currentAvailability =
        category === "AVAILABILITY"
          ? (
              await prisma.availabilityRule.findMany({
                where: { tenantId: context.tenantId, active: true },
                orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
              })
            ).map((rule) => {
              const dto = availabilityRuleDto(rule);
              return {
                dayOfWeek: dto.dayOfWeek,
                startTime: dto.startTime,
                endTime: dto.endTime,
              };
            })
          : null;
      // Correspondencia sugerida (Goal136): so em SERVICE e CUSTOMER, os
      // cadastros de hoje dos IDs que a analise gravou, uma consulta por pagina.
      const candidatesOf =
        category === "SERVICE" || category === "CUSTOMER"
          ? await importCandidateReader(
              prisma,
              context.tenantId,
              category,
              page,
            )
          : null;
      return data(request, {
        sessionId,
        category,
        total: all.length,
        limit: query.limit,
        offset: query.offset,
        items: page.map((item) => {
          if (candidatesOf) {
            return {
              ...importItemDto(item),
              candidates: candidatesOf(item.matchCandidateInternalIds),
              ...(category === "SERVICE"
                ? { proposedService: proposedServiceDto(item.proposedService) }
                : {}),
            };
          }
          return currentAvailability
            ? {
                ...importItemDto(item),
                currentAvailability,
                proposedAvailability: proposedAvailabilityDto(
                  item.proposedAvailability,
                ),
              }
            : importItemDto(item);
        }),
      });
    },
  );

  // Escolher o que importar (Goal020, WU-02): marca/desmarca uma categoria
  // inteira da sessao. So muda `selected` — nunca invalida o preview nem
  // mexe em `previewVersion`, porque a escolha de categoria e ortogonal a
  // reanalise da origem (`ImportPreviewService.analyze` preserva o valor
  // vigente na reanalise, ver import-preview-service.ts).
  app.post(
    "/internal/calendar/imports/:sessionId/categories/:category/selection",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const key = idempotencyKey(request);
      const { sessionId, category } = parse(
        importCategoryParamsSchema,
        request.params,
      );
      const body = parse(setImportCategorySelectionBodySchema, request.body);
      const result = await withImportIdempotency(
        prisma,
        {
          tenantId: context.tenantId,
          key,
          operation: "import.category.selection",
          request: { sessionId, category, ...body },
        },
        () =>
          new ImportPreviewService(prisma).setCategorySelection(
            { tenantId: context.tenantId, sessionId },
            category,
            body.selected,
          ),
      );
      return data(request, result);
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

  // Inicio curto da execucao (Goal061 §1), no mesmo formato da analise:
  // tudo ate a reivindicacao do lease na requisicao, o lote no processo.
  app.post(
    "/internal/calendar/imports/:sessionId/execute",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const key = idempotencyKey(request);
      const { sessionId } = parse(importSessionParamsSchema, request.params);
      const body = parse(executeImportBodySchema, request.body ?? {});
      const calendar = await requireCalendar(prisma, context.tenantId);
      await requireIntegration(prisma, context.tenantId);
      const snapshotInput = importSnapshotWindow(calendar.timezone);
      const result = await withImportIdempotency(
        prisma,
        {
          tenantId: context.tenantId,
          key,
          operation: "import.execute",
          request: { sessionId, ...body },
        },
        async () => {
          const execution = new ImportExecutionService(prisma);
          const start = await execution.startExecution(
            { tenantId: context.tenantId, sessionId, userId: context.userId },
            { previewVersion: body.previewVersion },
          );
          // Dentro do bloco idempotente: a retentativa faz replay e não
          // registra o início de novo.
          await recordImportFact(prisma, context, "import.started", sessionId);
          importWork.dispatch(() =>
            execution.runExecution(
              start,
              () => importSourceReader(context.tenantId),
              snapshotInput,
              { maxItems: body.maxItems },
            ),
          );
          return importWorkStartDto(start);
        },
      );
      reply.code(202);
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
      const [items, now] = await Promise.all([
        prisma.importItem.findMany({
          where: { tenantId: context.tenantId, sessionId },
        }),
        databaseNow(prisma),
      ]);
      const categories = IMPORT_CATEGORY_ORDER.map((category) => {
        const rows = items.filter((item) => item.category === category);
        return rows.length === 0
          ? null
          : {
              category,
              ...tallyItems(rows),
              failedReasons: failedReasonsTally(rows),
            };
      }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      return data(request, {
        sessionId: session.id,
        status: session.status,
        previewVersion: session.previewVersion,
        startedAt: session.startedAt?.toISOString() ?? null,
        finishedAt: session.finishedAt?.toISOString() ?? null,
        interrupted: isImportSessionInterrupted(session, now),
        lastError: session.errorCode ? { code: session.errorCode } : null,
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
      // Concluir de novo devolve a mesma conclusão: a atividade é uma só.
      const alreadyRecorded = await prisma.activityLog.findFirst({
        where: {
          tenantId: context.tenantId,
          action: "import.completed",
          entityId: sessionId,
        },
        select: { id: true },
      });
      if (!alreadyRecorded) {
        await recordImportFact(prisma, context, "import.completed", sessionId, {
          source: result.sourceAccountLabel,
          counts: result.counts,
          categories: result.categories.map((category) => ({
            category: category.category,
            imported: category.imported,
            skipped: category.skipped,
            failed: category.failed,
          })),
        });
      }
      return data(request, importCompletionDto(result));
    },
  );

  // --- Registro de atividade (D-176) ---------------------------------------
  // Só leitura, só do negócio do cabeçalho. O BFF intercala esta fonte com a
  // dele e a da IA; o corte (`before*`) é decidido por ele.
  app.get("/internal/activity", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const query = parse(activityQuerySchema, request.query ?? {});
    const page = await listActivity(prisma, context.tenantId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      actor: query.actor,
      areas: query.area,
      actions: query.action,
      q: query.q,
      before: query.beforeAt
        ? {
            occurredAt: new Date(query.beforeAt),
            sequence:
              query.beforeSequence !== undefined
                ? parseActivitySequence(query.beforeSequence)
                : undefined,
            inclusive: query.inclusive === "true",
          }
        : undefined,
      limit: query.limit,
    });
    return data(request, page);
  });

  // --- Faturamento (D-177) -------------------------------------------------
  // Só leitura, só do negócio do cabeçalho, somado aqui: o navegador recebe
  // os totais, nunca a lista de atendimentos.
  app.get("/internal/revenue", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const query = parse(revenueQuerySchema, request.query ?? {});
    const calendar = await requireCalendar(prisma, context.tenantId);
    const now = new Date();
    return data(
      request,
      await loadRevenueReport(prisma, context.tenantId, {
        period: query.period,
        date: query.date ?? localDate(now, calendar.timezone),
        timeZone: calendar.timezone,
        now,
        customers: query.customers,
      }),
    );
  });

  // Os atendimentos por trás dos números (D-179): cancelados, faltas e
  // concluídos sem valor do período, com quem fez cada mudança.
  app.get("/internal/revenue/appointments", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const query = parse(
      revenueQuerySchema.extend({ kind: z.enum(REVENUE_APPOINTMENT_KINDS) }),
      request.query ?? {},
    );
    const calendar = await requireCalendar(prisma, context.tenantId);
    return data(
      request,
      await loadRevenueAppointmentList(prisma, context.tenantId, {
        kind: query.kind,
        period: query.period,
        date: query.date ?? localDate(new Date(), calendar.timezone),
        timeZone: calendar.timezone,
      }),
    );
  });

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
    // Segunda a domingo da semana local do calendario, sempre a semana de
    // `today` — inclui dias ja passados dela, nao so hoje em diante.
    const weekStart = addDays(today, -((weekdayIndex(today) + 6) % 7));
    const weekEnd = addDays(weekStart, 6);
    const weekAppointments = await new CalendarService(prisma).listAppointments(
      context,
      { startDate: weekStart, endDate: weekEnd },
    );
    // `listAppointments` seleciona por sobreposicao de instante, entao um
    // agendamento que cruza meia-noite pode vir de fora da semana; o filtro
    // por `date` garante segunda a domingo da semana local (Goal074).
    const appointmentsThisWeek = weekAppointments.filter(
      (appointment) =>
        appointment.status !== "CANCELLED" &&
        appointment.date >= weekStart &&
        appointment.date <= weekEnd,
    ).length;
    return data(request, {
      appointmentsToday: todayAppointments.length,
      todayAppointments,
      appointmentsThisWeek,
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

  /**
   * Purga do negocio inteiro (Goal025/WU-06).
   *
   * Chamada pela exclusao de conta, depois do prazo de arrependimento: apaga
   * tudo do negocio nas ~27 tabelas com `tenantId` do schema do Scheduling,
   * na ordem segura de chave estrangeira declarada em `TENANT_PURGE_TABLES`.
   *
   * O tenant vem so do contexto interno ja autenticado, nunca do corpo — nao
   * ha campo para apagar outro negocio, nem lista, nem "apague tudo". Sob
   * teto por passada e idempotente: rodar de novo sobre negocio ja purgado
   * nao encontra linha e nao e erro.
   */
  app.post("/internal/retention/tenant", internalOnly, async (request) => {
    const context = currentInternalContext(request);
    const body = parse(tenantPurgeBodySchema, request.body);
    const result = await tenantPurge.purge({
      tenantId: context.tenantId,
      maxRows: body.maxRows,
    });
    app.log.info(
      { tenantId: context.tenantId, ...result },
      "Tenant purge pass completed",
    );
    return data(request, result);
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
  const hasCalendar = settings !== null;
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
      // Retirada da fonte externa (Goal027): as quatro capacidades abaixo
      // eram `source === "ATENDLY"` e passam a ser "tem calendario
      // configurado". Nao e afrouxamento: `CalendarSettings.source` so
      // admite `AVENLY` (constraint `CHECK` no banco), entao haver a linha
      // e exatamente o que a comparacao por fonte ja significava. Nenhuma
      // capability muda de nome nem entra ou sai do payload.
      manageAvailability: hasCalendar,
      manageServices: hasCalendar,
      manageCustomers: hasCalendar,
      createAppointments: hasCalendar,
      migrate: source !== null,
      // "Pelo menos um serviço operacional" (Goal007): lido do que
      // `/internal/services` devolveria para a fonte vigente — mesmo
      // predicado usado pela IA e pela agenda, sem distinguir a origem.
      aiActivationReady: operationalServices > 0,
    },
  };
}

// Mesma leitura que a IA consulta (`CalendarService.listServices`, ja
// filtrada para "operacional"): evita reimplementar o predicado. Tenant sem
// calendario configurado conta como zero, e leitura indisponivel tambem, sem
// derrubar a tela de configuracoes. O significado de `aiActivationReady` nao
// muda com a retirada da fonte externa (Goal027).
async function countOperationalServices(
  prisma: PrismaClient,
  context: CalendarRequestContext,
  source: "AVENLY" | "MINHA_AGENDA" | null,
): Promise<number> {
  if (source === null) return 0;
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
  colorHex?: string | null;
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
    colorHex: service.colorHex ?? null,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    recurrenceIntervalDays: service.recurrenceIntervalDays,
  };
}

function customerDto(customer: {
  id: string;
  name: string | null;
  phone: string | null;
  deactivatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  nextAppointment?: AppointmentSummary | null;
  lastAppointment?: AppointmentSummary | null;
  guardian?: { id: string; name: string | null } | null;
  dependents?: Array<{ id: string; name: string | null }>;
}) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    active: !customer.deactivatedAt,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    ...(customer.nextAppointment !== undefined
      ? { nextAppointment: customer.nextAppointment }
      : {}),
    ...(customer.lastAppointment !== undefined
      ? { lastAppointment: customer.lastAppointment }
      : {}),
    ...(customer.guardian !== undefined ? { guardian: customer.guardian } : {}),
    ...(customer.dependents !== undefined
      ? { dependents: customer.dependents }
      : {}),
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

const WEEKDAY_FIELDS = [
  "weekday.0",
  "weekday.1",
  "weekday.2",
  "weekday.3",
  "weekday.4",
  "weekday.5",
  "weekday.6",
] as const;

/**
 * Grade semanal como texto por dia (`09:00–12:00, 13:00–18:00`), nulo no
 * dia fechado: o antes/depois da atividade compara dia a dia.
 */
function availabilityActivityFields(
  rules: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    active: boolean;
  }>,
): Record<string, string | null> {
  const fields: Record<string, string | null> = {};
  WEEKDAY_FIELDS.forEach((field, dayOfWeek) => {
    const ranges = rules
      .filter((rule) => rule.dayOfWeek === dayOfWeek && rule.active)
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
      .map((rule) => `${rule.startTime}–${rule.endTime}`);
    fields[field] = ranges.length > 0 ? ranges.join(", ") : null;
  });
  return fields;
}

function reminderActivityFields(config: {
  confirmationEnabled: boolean;
  pricePolicy: string;
  rules: Array<{ slot: string; leadMinutes: number }>;
}): Record<string, string | number | boolean | null> {
  const lead = (slot: string) =>
    config.rules.find((rule) => rule.slot === slot)?.leadMinutes ?? null;
  return {
    "reminder.FIRST": lead("FIRST"),
    "reminder.SECOND": lead("SECOND"),
    confirmationEnabled: config.confirmationEnabled,
    pricePolicy: config.pricePolicy,
  };
}

/**
 * Bloqueio, compromisso e exceção da agenda (só a profissional). O serviço de
 * cada um abre a própria transação, então a atividade é gravada logo depois
 * do commit — a exceção à regra da mesma transação registrada no D-176.
 */
async function recordAgendaFact(
  prisma: PrismaClient,
  context: InternalRequestContext,
  action: string,
  entityId: string,
  details: Record<string, unknown>,
  changes: ActivityChange[] = [],
): Promise<void> {
  const label =
    typeof details.title === "string" && details.title
      ? details.title
      : typeof details.reason === "string" && details.reason
        ? details.reason
        : null;
  await recordActivity(prisma, context.tenantId, {
    actor: actorFromContext(context),
    area: "AGENDA",
    action,
    entityType: action.includes("series")
      ? "block_series"
      : action.includes("block")
        ? "time_block"
        : "availability_exception",
    entityId,
    entityLabel: label,
    changes,
    details,
  });
}

function timeBlockActivityDetails(
  block: {
    startAt: Date;
    endAt: Date;
    kind: string;
    title: string | null;
    reason: string | null;
  },
  timeZone: string,
): {
  startsAt: string;
  endsAt: string;
  kind: string;
  title: string | null;
  reason: string | null;
} {
  const stamp = (instant: Date) => {
    const local = instantToLocalDateTime(instant, timeZone);
    return `${local.date}T${local.time}`;
  };
  return {
    startsAt: stamp(block.startAt),
    endsAt: stamp(block.endAt),
    kind: block.kind,
    title: block.title,
    reason: block.reason,
  };
}

function exceptionActivityDetails(
  exception: Parameters<typeof exceptionDto>[0],
): Record<string, unknown> {
  const dto = exceptionDto(exception);
  return {
    date: dto.date,
    startTime: dto.startTime,
    endTime: dto.endTime,
    reason: dto.reason,
  };
}

/** Importação da Minha Agenda: um registro por passo, nunca por item importado. */
async function recordImportFact(
  prisma: PrismaClient,
  context: InternalRequestContext,
  action: string,
  sessionId: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  await recordActivity(prisma, context.tenantId, {
    actor: actorFromContext(context),
    area: "IMPORT",
    action,
    entityType: sessionId ? "import_session" : "integration",
    entityId: sessionId,
    entityLabel: "Minha Agenda",
    details: details ?? null,
  });
}

/** Mudança de configuração da agenda: só registra o que mudou de fato. */
async function recordSettingsChange(
  transaction: Prisma.TransactionClient,
  context: InternalRequestContext,
  action: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  const changes = diffFields(before, after, Object.keys(after));
  if (changes.length === 0) return;
  await recordActivity(transaction, context.tenantId, {
    actor: actorFromContext(context),
    area: "SETTINGS",
    action,
    entityType: "settings",
    changes,
  });
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

/**
 * `createdAt` e o resumo da série (pedido de 2026-10-12): a folha de ações
 * do bloqueio mostra quando ele foi criado e o padrão da série ("Repete toda
 * terça"). A série só vem onde a leitura a inclui (lista e mover
 * ocorrência); criar um bloco avulso não tem série, e `null` é o valor.
 */
function timeBlockDto(block: {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  kind: "BLOCK" | "PERSONAL";
  title: string | null;
  seriesId: string | null;
  createdAt?: Date | null;
  series?: {
    daysOfWeek: number[];
    occurrenceCount: number | null;
    seriesEndDate: Date | null;
  } | null;
}) {
  return {
    id: block.id,
    startAt: block.startAt.toISOString(),
    endAt: block.endAt.toISOString(),
    reason: block.reason,
    kind: block.kind,
    title: block.title,
    seriesId: block.seriesId,
    createdAt: block.createdAt?.toISOString() ?? null,
    series: block.series
      ? {
          daysOfWeek: [...block.series.daysOfWeek].sort((a, b) => a - b),
          occurrenceCount: block.series.occurrenceCount,
          seriesEndDate:
            block.series.seriesEndDate?.toISOString().slice(0, 10) ?? null,
        }
      : null,
  };
}

function offerRulesDto(calendar: {
  minLeadMinutes: number;
  maxLeadDays: number;
  granularityMinutes: number;
  customerChangeMinNoticeMinutes: number;
}) {
  return {
    minLeadMinutes: calendar.minLeadMinutes,
    maxLeadDays: calendar.maxLeadDays,
    granularityMinutes: calendar.granularityMinutes,
    customerChangeMinNoticeMinutes: calendar.customerChangeMinNoticeMinutes,
  };
}

function assertOfferRules(rules: {
  minLeadMinutes: number;
  maxLeadDays: number;
  granularityMinutes: number;
}): void {
  if (
    rules.granularityMinutes < 5 ||
    rules.granularityMinutes > 120 ||
    rules.granularityMinutes % 5 !== 0
  ) {
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

function reminderConfigDto(config: {
  configured: boolean;
  confirmationEnabled: boolean;
  pricePolicy: string;
  rules: Array<{ slot: string; leadMinutes: number }>;
}) {
  return {
    configured: config.configured,
    confirmationEnabled: config.confirmationEnabled,
    pricePolicy: config.pricePolicy,
    rules: config.rules.map((rule) => ({
      slot: rule.slot,
      leadMinutes: rule.leadMinutes,
    })),
  };
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
): Promise<MinhaAgendaImportSourceReader> {
  const connection = await requireIntegration(prisma, tenantId);
  return new MinhaAgendaImportSourceReader(
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
 * Resposta de inicio da analise e da execucao (Goal061 §1): so o que a
 * reivindicacao gravou. O preview e o andamento sao lidos do banco pelas
 * rotas de leitura, nunca carregados nesta resposta nem na resposta gravada
 * pela `Idempotency-Key`.
 */
function importWorkStartDto(start: {
  sessionId: string;
  status: "ANALYZING" | "EXECUTING";
  previewVersion: number;
}): Record<string, unknown> {
  return {
    sessionId: start.sessionId,
    status: start.status,
    previewVersion: start.previewVersion,
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

/** Itens `FAILED` desta categoria, contados por motivo (Goal061 §7.4, WU-02). */
function failedReasonsTally(
  rows: Array<{ status: ImportItemStatus; reasonCode: string | null }>,
): Array<{ reasonCode: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "FAILED") continue;
    const reasonCode = row.reasonCode ?? "UNKNOWN";
    counts.set(reasonCode, (counts.get(reasonCode) ?? 0) + 1);
  }
  return [...counts.entries()].map(([reasonCode, count]) => ({
    reasonCode,
    count,
  }));
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

/**
 * Grade proposta gravada pela analise, relida sem confiar na forma do JSON:
 * so `dayOfWeek`, `startTime` e `endTime` saem daqui, por dia e horario.
 * Nula quando a analise nao gravou grade (sobreposicao, registro ilegivel).
 */
function proposedAvailabilityDto(
  value: unknown,
): Array<{ dayOfWeek: number; startTime: string; endTime: string }> | null {
  if (!Array.isArray(value)) return null;
  const rules = value.flatMap((entry: unknown) => {
    const rule = entry as Record<string, unknown> | null;
    return rule &&
      typeof rule.dayOfWeek === "number" &&
      typeof rule.startTime === "string" &&
      typeof rule.endTime === "string"
      ? [
          {
            dayOfWeek: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
          },
        ]
      : [];
  });
  return sortAvailabilityGrid(rules);
}

/**
 * Valores da origem gravados pela analise em `ImportItem.proposedService`,
 * relidos sem confiar na forma do JSON. Nulo quando a analise nao gravou.
 */
function proposedServiceDto(value: unknown): {
  durationMinutes: number | null;
  priceType: "FIXED" | "NOT_INFORMED";
  price: number | null;
} | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const stored = value as Record<string, unknown>;
  // Mesma regra de `importProposedServiceSchema` (contrato): duracao inteira
  // positiva e preco finito nao negativo, senao desconhecidos. Cobre o que uma
  // analise anterior ao Goal138 gravou, sem migration nem reanalise.
  const durationMinutes =
    typeof stored.durationMinutes === "number" &&
    Number.isInteger(stored.durationMinutes) &&
    stored.durationMinutes > 0
      ? stored.durationMinutes
      : null;
  const fixedPrice =
    stored.priceType === "FIXED" &&
    typeof stored.price === "number" &&
    Number.isFinite(stored.price) &&
    stored.price >= 0
      ? stored.price
      : null;
  return {
    durationMinutes,
    priceType: fixedPrice === null ? "NOT_INFORMED" : "FIXED",
    price: fixedPrice,
  };
}

/** IDs gravados em `matchCandidateInternalIds`; qualquer outra forma e lista vazia. */
function storedCandidateIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
}

/**
 * Candidatos de correspondencia de uma pagina de itens (Goal136). Uma consulta
 * so por pagina, sempre com `tenantId` do contexto: um ID de outro negocio
 * gravado a forca nunca volta. O candidato apagado e omitido e a ordem e a
 * gravada pela analise. O de cliente leva so `internalId` e `name`.
 */
async function importCandidateReader(
  prisma: PrismaClient,
  tenantId: string,
  category: "SERVICE" | "CUSTOMER",
  page: Array<{ matchCandidateInternalIds: unknown }>,
): Promise<(stored: unknown) => Array<Record<string, unknown>>> {
  const ids = [
    ...new Set(
      page.flatMap((item) =>
        storedCandidateIds(item.matchCandidateInternalIds),
      ),
    ),
  ];
  const byId = new Map<string, Record<string, unknown>>();
  if (ids.length > 0 && category === "SERVICE") {
    const services = await prisma.service.findMany({
      where: { tenantId, id: { in: ids } },
    });
    for (const service of services) {
      const dto = serviceDto(service);
      byId.set(service.id, {
        internalId: dto.id,
        name: dto.name,
        durationMinutes: dto.durationMinutes,
        priceType: dto.priceType,
        price: dto.price,
        active: dto.active,
      });
    }
  } else if (ids.length > 0) {
    const customers = await prisma.customer.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, name: true },
    });
    for (const customer of customers) {
      byId.set(customer.id, {
        internalId: customer.id,
        name: customer.name ?? "",
      });
    }
  }
  return (stored) =>
    storedCandidateIds(stored).flatMap((id) => {
      const candidate = byId.get(id);
      return candidate ? [candidate] : [];
    });
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

function importRightDto(right: ImportRight): Record<string, unknown> {
  return {
    ...right,
    completedAt: right.completedAt?.toISOString() ?? null,
  };
}

function importLiveSessionDto(
  session: ImportLiveSession,
): Record<string, unknown> {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString() ?? null,
    finishedAt: session.finishedAt?.toISOString() ?? null,
    previewGeneratedAt: session.previewGeneratedAt?.toISOString() ?? null,
  };
}

function importHistoryDto(entry: ImportHistoryEntry): Record<string, unknown> {
  return {
    ...importCompletionDto(entry),
    startedAt: entry.startedAt?.toISOString() ?? null,
    finishedAt: entry.finishedAt?.toISOString() ?? null,
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

      if (item.category === "AVAILABILITY") {
        itemUpdate = {
          ...itemUpdate,
          reasonDetail:
            input.decision === "EXCLUDE"
              ? "Horários atuais mantidos por decisão explícita; os da origem não foram importados."
              : "Troca confirmada por decisão explícita: os horários da origem substituem os atuais.",
        };
      }

      const decide = async (target: { id: string; externalId: string }) => {
        const updated = await transaction.importItem.update({
          where: { tenantId_id: { tenantId: input.tenantId, id: target.id } },
          data: itemUpdate,
        });
        const createdDecision = await transaction.importDecision.create({
          data: {
            tenantId: input.tenantId,
            sessionId: input.sessionId,
            scope: "ITEM",
            decision: input.decision,
            category: item.category,
            itemId: target.id,
            externalId: target.externalId,
            previewVersion: session.previewVersion,
            targetInternalId: input.targetInternalId ?? null,
            noteCode: input.noteCode ?? null,
            decidedBy: input.decidedBy,
            decidedAt: now,
          },
        });
        return [updated, createdDecision] as const;
      };

      const decided = await decide(item);
      // Disponibilidade é uma grade só (Goal062 §2): `company` e
      // `employee:<id>` são trocados ou mantidos juntos. A escolha de um item
      // vale para os demais itens do grupo ainda sem decisão, cada um com a
      // própria linha de decisão de item — a tabela continua append-only e
      // uma decisão por item.
      if (
        item.category === "AVAILABILITY" &&
        (input.decision === "INCLUDE" || input.decision === "EXCLUDE")
      ) {
        const siblings = await transaction.importItem.findMany({
          where: {
            tenantId: input.tenantId,
            sessionId: input.sessionId,
            category: "AVAILABILITY",
            id: { not: item.id },
            status: { notIn: [...DECIDED_ITEM_STATUSES] },
          },
        });
        const alreadyDecided = new Set(
          (
            await transaction.importDecision.findMany({
              where: {
                tenantId: input.tenantId,
                scope: "ITEM",
                itemId: { in: siblings.map((sibling) => sibling.id) },
              },
            })
          ).map((entry) => entry.itemId),
        );
        for (const sibling of siblings) {
          if (!alreadyDecided.has(sibling.id)) await decide(sibling);
        }
      }
      return decided;
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
