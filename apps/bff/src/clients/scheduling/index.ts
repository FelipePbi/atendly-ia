import {
  type RevenueAppointmentKind,
  type RevenuePeriod,
  revenueAppointmentListSchema,
  revenueReportSchema,
} from "@avenly-ia/public-api-contract";
import { z } from "zod";

import { env } from "../../config/env.js";
import {
  type CalendarSource,
  calendarSourceSchema,
} from "../../lib/calendar-source.js";
import {
  internalActivityPageSchema,
  type InternalActivityQuery,
} from "../activity-source.js";
import {
  InternalHttpClient,
  type InternalRequestContext,
} from "../internal-http-client.js";

const sourceSchema = calendarSourceSchema;
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
  colorHex: z.string().nullable().default(null),
  bufferBeforeMinutes: z.number().int().nonnegative().default(0),
  bufferAfterMinutes: z.number().int().nonnegative().default(0),
  recurrenceIntervalDays: z.number().int().positive().nullable().default(null),
  // Atendimentos dos últimos 90 dias com o serviço (D-170). Só a leitura do
  // catálogo traz; ausente no Scheduling anterior e na criação/edição.
  usageCount: z.number().int().nonnegative().optional(),
});
// Próximo e último atendimento por cliente, no fuso do calendário do negócio
// (Goal075). Ausentes na resposta anterior a este Goal.
const customerAppointmentSummarySchema = z.object({
  date: z.string(),
  startTime: z.string(),
  status: z.string(),
  // Só no próximo atendimento do detalhe do cliente (2026-10-16, D-174).
  serviceNames: z.array(z.string()).optional(),
  title: z.string().nullable().optional(),
  durationMinutes: z.number().int().nonnegative().optional(),
  totalPrice: z.number().nonnegative().nullable().optional(),
  totalPriceType: z.enum(["FIXED", "STARTING_AT", "NONE"]).optional(),
  source: z.enum(["AI", "USER", "INTEGRATION"]).optional(),
});
const customerSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  // Desativada pela profissional (2026-10-18); ausente na resposta anterior.
  active: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  nextAppointment: customerAppointmentSummarySchema.nullable().optional(),
  lastAppointment: customerAppointmentSummarySchema.nullable().optional(),
});
// Quem agenda por quem, só na lista (Goal149). O zod sem `.strict()` descarta
// o campo que o schema não declara, então ficam fora de `customerSchema`: o
// detalhe, a criação, a edição e o atendimento não os trazem. Ausentes na
// resposta anterior a este Goal.
const customerListPersonSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
});
const customerListItemSchema = customerSchema.extend({
  guardian: customerListPersonSchema.nullable().optional(),
  dependents: z.array(customerListPersonSchema).optional(),
});
// Números do histórico inteiro do cliente, no fuso do calendário do negócio
// (Goal075). Ausente na resposta anterior a este Goal.
const customerAppointmentStatsSchema = z.object({
  completed: z.number().int().nonnegative(),
  noShows: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  averageIntervalDays: z.number().nonnegative().nullable(),
  firstAppointmentDate: z.string().nullable(),
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
export const customerDetailSchema = customerSchema.extend({
  primaryGuardian: primaryGuardianSchema.default(null),
  notes: z.array(customerNoteSchema).default([]),
  tags: z.array(customerTagSchema).default([]),
  appointmentStats: customerAppointmentStatsSchema.optional(),
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
  // Ocupacao externa por buffer e serie (Goal009). Defaults mantem
  // decodavel toda resposta anterior a este Goal.
  bufferBeforeMinutes: z.number().int().nonnegative().default(0),
  bufferAfterMinutes: z.number().int().nonnegative().default(0),
  seriesId: z.string().nullable().default(null),
  // Ciclo de vida gravado (Goal103). Defaults mantem decodavel a resposta do
  // Scheduling anterior a este Goal, inclusive replay de idempotencia.
  completedAt: z.string().nullable().default(null),
  completionOrigin: z.enum(["MANUAL", "AUTO"]).nullable().default(null),
  noShowAt: z.string().nullable().default(null),
  noShowNote: z.string().nullable().default(null),
  presenceConfirmedAt: z.string().nullable().default(null),
  finalValue: z.number().nullable().default(null),
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
// --- Lembretes e confirmacao de presenca (Goal021, WU-009) -----------------
const reminderSlotSchema = z.enum(["FIRST", "SECOND"]);
const reminderPricePolicySchema = z.enum(["NEVER", "WHEN_FIXED"]);
const reminderConfigSchema = z.object({
  configured: z.boolean(),
  confirmationEnabled: z.boolean(),
  pricePolicy: reminderPricePolicySchema,
  rules: z.array(
    z.object({
      slot: reminderSlotSchema,
      leadMinutes: z.number().int().positive(),
    }),
  ),
});
/**
 * Estado de envio ao cliente de um compromisso (Goal021, item 8). O
 * vocabulario de estado e de motivo e o do dono do dado, repassado sem
 * traducao: quem traduz para texto de tela e o frontend, num lugar so.
 */
const appointmentNotificationSchema = z.object({
  id: z.string(),
  kind: z.enum(["REMINDER", "CHANGE_NOTICE"]),
  slot: z.enum(["FIRST", "SECOND", "CHANGE_NOTICE"]),
  appointmentVersion: z.number().int().nonnegative(),
  state: z.enum([
    "PENDING",
    "CLAIMED",
    "SENT",
    "FAILED",
    "DISMISSED",
    "CANCELLED",
  ]),
  reason: z
    .enum([
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
    ])
    .nullable(),
  dueAt: z.string(),
  sentAt: z.string().nullable(),
  settledAt: z.string().nullable(),
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
  // Regras de oferta do negocio (Goal009). Defaults iguais ao motor:
  // resposta antiga (sem estes campos) continua decodavel.
  minLeadMinutes: z.number().int().nonnegative().default(0),
  maxLeadDays: z.number().int().positive().default(90),
  granularityMinutes: z.number().int().positive().default(30),
  // Antecedencia minima do cliente (Goal073). Default igual ao motor: resposta
  // antiga (sem este campo) continua decodavel.
  customerChangeMinNoticeMinutes: z.number().int().nonnegative().default(0),
});
const timeBlockKindSchema = z.enum(["BLOCK", "PERSONAL"]);
const timeBlockSchema = z.object({
  id: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  reason: z.string().nullable(),
  kind: timeBlockKindSchema.default("BLOCK"),
  title: z.string().nullable().default(null),
  seriesId: z.string().nullable().default(null),
  // Quando foi criado e o padrão da série (pedido de 2026-10-12); defaults
  // mantêm decodável o Scheduling anterior.
  createdAt: z.string().nullable().default(null),
  series: z
    .object({
      daysOfWeek: z.array(z.number().int().min(0).max(6)),
      occurrenceCount: z.number().int().nullable(),
      seriesEndDate: z.string().nullable(),
    })
    .nullable()
    .default(null),
});
const availabilityExceptionSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  available: z.boolean(),
  reason: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedReason: z.string().nullable(),
});
const blockSeriesSchema = z.object({
  id: z.string(),
  kind: timeBlockKindSchema,
  title: z.string().nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  startTime: z.string(),
  endTime: z.string(),
  seriesStartDate: z.string(),
  seriesEndDate: z.string().nullable(),
  occurrenceCount: z.number().int().positive().nullable(),
  status: z.enum(["ACTIVE", "ENDED"]),
  supersededById: z.string().nullable(),
});
const seriesOccurrencePreviewSchema = z.object({
  index: z.number(),
  requestedDate: z.string(),
  date: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  adjusted: z.boolean(),
  holdId: z.string().nullable(),
  unavailable: z.boolean(),
});
// --- Importacao unica (Goal010, WU-09) -------------------------------------
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
const importSessionStatusSchema = z.enum([
  "DRAFT",
  "ANALYZING",
  "READY",
  "EXECUTING",
  "PARTIAL",
  "FAILED",
  "SUPERSEDED",
  "COMPLETED",
]);
const importDecisionScopeSchema = z.enum(["SESSION", "CATEGORY", "ITEM"]);
const importDecisionKindSchema = z.enum([
  "IMPORT_ALL",
  "INCLUDE",
  "EXCLUDE",
  "MERGE_WITH_EXISTING",
  "CREATE_NEW",
  "KEEP_EXISTING",
  "ACCEPT_PENDING_COMPLETION",
]);
const importCountsSchema = z.object({
  pending: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
});
// Grade vigente/proposta num item de disponibilidade (Goal062 §2): mesma
// forma de `availabilitySettingsSchema.rules`, sem `id`/`active`.
const importAvailabilityGridRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
});
// Candidato de correspondência e valores propostos pela origem (Goal136):
// espelho do contrato público. O candidato de cliente nunca traz telefone.
const importServiceCandidateSchema = z
  .object({
    internalId: z.string(),
    name: z.string(),
    durationMinutes: z.number().int().positive().nullable(),
    priceType: z.enum(["FIXED", "STARTING_AT", "ON_REQUEST", "NOT_INFORMED"]),
    price: z.number().nonnegative().nullable(),
    active: z.boolean(),
  })
  .strict();
const importCustomerCandidateSchema = z
  .object({ internalId: z.string(), name: z.string() })
  .strict();
const importCandidateSchema = z.union([
  importServiceCandidateSchema,
  importCustomerCandidateSchema,
]);
const importProposedServiceSchema = z.object({
  durationMinutes: z.number().int().positive().nullable(),
  priceType: z.enum(["FIXED", "STARTING_AT", "ON_REQUEST", "NOT_INFORMED"]),
  price: z.number().nonnegative().nullable(),
});
const importItemSchema = z.object({
  id: z.string(),
  category: importCategorySchema,
  externalId: z.string(),
  label: z.string().nullable(),
  status: importItemStatusSchema,
  reasonCode: z.string().nullable(),
  reasonDetail: z.string().nullable(),
  entityType: z.string().nullable(),
  internalId: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  lastAttemptAt: z.string().nullable(),
  processedAt: z.string().nullable(),
  disappearedAt: z.string().nullable(),
  // Presentes so em itens `category: "AVAILABILITY"` (Goal062 §2).
  currentAvailability: z.array(importAvailabilityGridRuleSchema).optional(),
  proposedAvailability: z
    .array(importAvailabilityGridRuleSchema)
    .nullable()
    .optional(),
  // Correspondência sugerida e valores da origem (Goal136), opcionais.
  candidates: z.array(importCandidateSchema).optional(),
  proposedService: importProposedServiceSchema.nullable().optional(),
});
const importDecisionResultSchema = z.object({
  id: z.string(),
  scope: importDecisionScopeSchema,
  decision: importDecisionKindSchema,
  category: importCategorySchema.nullable(),
  itemId: z.string().nullable(),
  externalId: z.string().nullable(),
  targetInternalId: z.string().nullable(),
  noteCode: z.string().nullable(),
  decidedBy: z.string(),
  decidedAt: z.string(),
});
const startImportSessionResultSchema = z.object({
  sessionId: z.string(),
  status: importSessionStatusSchema,
  created: z.boolean(),
  replacedSessionId: z.string().nullable(),
});
const importPreviewCategorySchema = z.object({
  category: importCategorySchema,
  sourceSupported: z.boolean(),
  limitationCode: z.string().nullable(),
  limitationDetail: z.string().nullable(),
  sourceReportedCount: z.number().int().nullable(),
  readCount: z.number().int().nonnegative(),
  discoveredCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  needsReviewCount: z.number().int().nonnegative(),
  importedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
});
// Resposta de inicio de `analyze`/`execute` (Goal061 §1): so o que a
// reivindicacao do lease gravou, sob `202`.
const importWorkStartResultSchema = z.object({
  sessionId: z.string(),
  status: z.enum(["ANALYZING", "EXECUTING"]),
  previewVersion: z.number().int().nonnegative(),
});

// Leitura do preview gravado pela ultima analise (Goal061 §4), sem
// `changesSincePreviousVersion` — nao e gravado hoje.
const importPreviewSnapshotSchema = z.object({
  sessionId: z.string(),
  previewVersion: z.number().int().nonnegative(),
  generatedAt: z.string().nullable(),
  categories: z.array(importPreviewCategorySchema),
});

// Causa nao-de-item de uma falha de trabalho (Goal061 §3), conjunto fechado.
const importLastErrorSchema = z
  .object({
    code: z.enum([
      "IMPORT_SOURCE_AUTH_REJECTED",
      "IMPORT_SOURCE_UNAVAILABLE",
      "IMPORT_SOURCE_INVALID_RESPONSE",
      "IMPORT_PREVIEW_STALE",
      "IMPORT_INTERNAL_ERROR",
    ]),
  })
  .nullable();
const importItemsPageSchema = z.object({
  sessionId: z.string(),
  category: importCategorySchema,
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  items: z.array(importItemSchema),
});
const importDecisionResponseSchema = z.object({
  item: importItemSchema,
  decision: importDecisionResultSchema,
});
const importCategoryCountsSchema = importCountsSchema.extend({
  category: importCategorySchema,
});
// --- Estado da importacao e selecao de categoria (Goal020, WU-003) ---------
const importRightSchema = z.object({
  available: z.boolean(),
  sessionId: z.string().nullable(),
  completedAt: z.string().nullable(),
});
const importLiveSessionCategorySchema = importCategoryCountsSchema.extend({
  selected: z.boolean(),
});
const importLiveSessionSchema = z.object({
  sessionId: z.string(),
  status: importSessionStatusSchema,
  previewVersion: z.number().int().nonnegative(),
  provider: z.enum(["MINHA_AGENDA"]),
  sourceAccountId: z.string(),
  sourceAccountLabel: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  previewGeneratedAt: z.string().nullable(),
  interrupted: z.boolean(),
  lastError: importLastErrorSchema,
  counts: importCountsSchema,
  categories: z.array(importLiveSessionCategorySchema),
});
const importCategorySelectionResultSchema = z.object({
  sessionId: z.string(),
  category: importCategorySchema,
  selected: z.boolean(),
});
const importProgressCategorySchema = importCategoryCountsSchema.extend({
  failedReasons: z.array(
    z.object({ reasonCode: z.string(), count: z.number().int().nonnegative() }),
  ),
});
const importProgressSchema = z.object({
  sessionId: z.string(),
  status: importSessionStatusSchema,
  previewVersion: z.number().int().nonnegative(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  interrupted: z.boolean(),
  lastError: importLastErrorSchema,
  counts: importCountsSchema,
  categories: z.array(importProgressCategorySchema),
});
const importCompletionCategorySchema = importCountsSchema.extend({
  category: importCategorySchema,
  discovered: z.number().int().nonnegative(),
  sourceSupported: z.boolean(),
  limitationCode: z.string().nullable(),
});
const importCompletionResultSchema = z.object({
  sessionId: z.string(),
  provider: z.enum(["MINHA_AGENDA"]),
  sourceAccountId: z.string(),
  sourceAccountLabel: z.string().nullable(),
  status: z.literal("COMPLETED"),
  completedAt: z.string(),
  completedBy: z.string(),
  counts: importCountsSchema,
  categories: z.array(importCompletionCategorySchema),
  pendingAcceptance: z
    .object({
      acceptedBy: z.string(),
      acceptedAt: z.string(),
      pendingCount: z.number().int().nonnegative(),
    })
    .nullable(),
});

const importHistoryResultSchema = importCompletionResultSchema.extend({
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
const importStateSchema = z.object({
  right: importRightSchema,
  session: importLiveSessionSchema.nullable(),
  history: importHistoryResultSchema.nullable(),
});

// --- Central de notificacoes (Goal022, WU-03) ------------------------------
// As duas leituras por negocio que a central materializa. Nenhuma delas traz
// `facts`, `leaseToken`, telefone ou payload cru — o recorte e o do dono, e o
// BFF nao alarga o que ele decidiu nao expor.
const failedNotificationIntentSchema = z.object({
  id: z.string(),
  appointmentId: z.string(),
  kind: z.string(),
  slot: z.string(),
  appointmentVersion: z.number().int().nonnegative(),
  reason: z.string().nullable(),
  detail: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  dueAt: z.string(),
  settledAt: z.string().nullable(),
});
const failedNotificationIntentsPageSchema = z.object({
  items: z.array(failedNotificationIntentSchema),
  nextCursor: z.string().nullable(),
});
const aiCreatedAppointmentEventSchema = z.object({
  id: z.string(),
  appointmentId: z.string(),
  after: z.unknown().nullable(),
  occurredAt: z.string(),
  sequence: z.string(),
});
const aiCreatedAppointmentEventsPageSchema = z.object({
  items: z.array(aiCreatedAppointmentEventSchema),
  nextCursor: z.string().nullable(),
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
    input: { source: CalendarSource; timezone: string },
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

  async listAppointmentNotifications(
    context: InternalRequestContext,
    id: string,
  ) {
    return this.get(
      context,
      `/internal/appointments/${encodeURIComponent(id)}/notifications`,
      z.array(appointmentNotificationSchema),
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

  // --- Lembretes e confirmacao de presenca (Goal021, WU-009) ---------------

  async reminderSettings(context: InternalRequestContext) {
    return this.get(
      context,
      "/internal/reminder-settings",
      reminderConfigSchema,
    );
  }

  async updateReminderSettings(
    context: InternalRequestContext,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "PATCH",
      "/internal/reminder-settings",
      input,
      reminderConfigSchema,
    );
  }

  async listTimeBlocks(
    context: InternalRequestContext,
    query: { startDate: string; endDate: string },
  ) {
    return this.get(
      context,
      "/internal/time-blocks",
      z.array(timeBlockSchema),
      query,
    );
  }

  async createTimeBlock(context: InternalRequestContext, input: unknown) {
    return this.mutate(
      context,
      "POST",
      "/internal/time-blocks",
      input,
      timeBlockSchema,
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

  async removeBlockOccurrence(context: InternalRequestContext, id: string) {
    return this.mutate(
      context,
      "DELETE",
      `/internal/time-blocks/${encodeURIComponent(id)}/occurrence`,
      undefined,
      z.object({ deleted: z.literal(true) }),
    );
  }

  async moveBlockOccurrence(
    context: InternalRequestContext,
    id: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "PATCH",
      `/internal/time-blocks/${encodeURIComponent(id)}/occurrence`,
      input,
      timeBlockSchema,
    );
  }

  // --- Excecoes de disponibilidade (Goal009) ------------------------------

  async listAvailabilityExceptions(
    context: InternalRequestContext,
    query: { startDate: string; endDate: string },
  ) {
    return this.get(
      context,
      "/internal/availability-exceptions",
      z.array(availabilityExceptionSchema),
      query,
    );
  }

  async createExtraAvailability(
    context: InternalRequestContext,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "POST",
      "/internal/availability-exceptions/extra",
      input,
      availabilityExceptionSchema,
    );
  }

  async createUnavailability(context: InternalRequestContext, input: unknown) {
    return this.mutate(
      context,
      "POST",
      "/internal/availability-exceptions/unavailable",
      input,
      availabilityExceptionSchema,
    );
  }

  async removeAvailabilityException(
    context: InternalRequestContext,
    id: string,
  ) {
    return this.mutate(
      context,
      "DELETE",
      `/internal/availability-exceptions/${encodeURIComponent(id)}`,
      undefined,
      z.object({ deleted: z.literal(true) }),
    );
  }

  // --- Series de bloqueio/compromisso (Goal009) ---------------------------

  async createBlockSeries(context: InternalRequestContext, input: unknown) {
    return this.mutate(
      context,
      "POST",
      "/internal/block-series",
      input,
      blockSeriesSchema,
    );
  }

  async editBlockSeriesFromDate(
    context: InternalRequestContext,
    id: string,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "PATCH",
      `/internal/block-series/${encodeURIComponent(id)}/from-date`,
      input,
      blockSeriesSchema,
    );
  }

  async removeBlockSeries(context: InternalRequestContext, id: string) {
    return this.mutate(
      context,
      "DELETE",
      `/internal/block-series/${encodeURIComponent(id)}`,
      undefined,
      z.object({ deleted: z.literal(true) }),
    );
  }

  // --- Serie de atendimento (Goal009) --------------------------------------

  async previewAppointmentSeries(
    context: InternalRequestContext,
    input: unknown,
  ) {
    return this.mutate(
      context,
      "POST",
      "/internal/appointments/series/preview",
      input,
      z.array(seriesOccurrencePreviewSchema),
    );
  }

  async confirmAppointmentSeries(
    context: InternalRequestContext,
    input: unknown,
    idempotencyKey: string,
  ) {
    return this.mutate(
      context,
      "POST",
      "/internal/appointments/series/confirm",
      input,
      z.array(appointmentSchema),
      idempotencyKey,
    );
  }

  async listCustomers(
    context: InternalRequestContext,
    query: {
      phone?: string;
      q?: string;
      limit?: number;
      cursor?: string;
      status?: "active" | "inactive";
      sort?: "name" | "last" | "frequency";
    } = {},
  ) {
    return this.get(
      context,
      "/internal/customers",
      z.object({
        items: z.array(customerListItemSchema),
        source: sourceSchema,
        managedExternally: z.boolean(),
        filteredByPhone: z.boolean().optional(),
        // Paginação por cursor: `total` é o filtro inteiro, `nextCursor`
        // nulo é o fim. Opcionais enquanto o Scheduling anterior responde.
        total: z.number().int().nonnegative().optional(),
        nextCursor: z.string().nullable().optional(),
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

  // --- Importacao unica (Goal010, WU-09) -----------------------------------

  // Leitura pura do estado da importacao (direito, sessao viva e historico),
  // sem nenhum efeito: negocio sem conexao, sem sessao e sem historico e
  // estado valido e vazio, nunca erro.
  async importState(context: InternalRequestContext) {
    return this.get(context, "/internal/calendar/imports", importStateSchema);
  }

  async setImportCategorySelection(
    context: InternalRequestContext,
    sessionId: string,
    category: string,
    input: { selected: boolean },
    idempotencyKey: string,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/calendar/imports/${encodeURIComponent(sessionId)}/categories/${encodeURIComponent(category)}/selection`,
      input,
      importCategorySelectionResultSchema,
      idempotencyKey,
    );
  }

  async startImport(
    context: InternalRequestContext,
    input: {
      sourceAccountId: string;
      sourceAccountLabel?: string | null;
      replace?: boolean;
    },
    idempotencyKey: string,
  ) {
    return this.mutate(
      context,
      "POST",
      "/internal/calendar/imports",
      input,
      startImportSessionResultSchema,
      idempotencyKey,
    );
  }

  /**
   * Inicio curto da analise (Goal061 §1): so o que a reivindicacao do lease
   * gravou. O status acompanha, porque `202` e a unica resposta de sucesso
   * desta rota — o trabalho roda no proprio processo, sem confirmacao aqui.
   */
  async analyzeImport(
    context: InternalRequestContext,
    sessionId: string,
    idempotencyKey: string,
  ) {
    const { data, status } = await this.mutateWithStatus(
      context,
      "POST",
      `/internal/calendar/imports/${encodeURIComponent(sessionId)}/analyze`,
      undefined,
      importWorkStartResultSchema,
      idempotencyKey,
    );
    return { start: data, status };
  }

  /**
   * Leitura do preview gravado pela ultima analise (Goal061 §4), sem tocar a
   * origem.
   */
  async previewImport(context: InternalRequestContext, sessionId: string) {
    return this.get(
      context,
      `/internal/calendar/imports/${encodeURIComponent(sessionId)}/preview`,
      importPreviewSnapshotSchema,
    );
  }

  async listImportItems(
    context: InternalRequestContext,
    sessionId: string,
    category: string,
    query: { status?: string; limit?: number; offset?: number },
  ) {
    return this.get(
      context,
      `/internal/calendar/imports/${encodeURIComponent(sessionId)}/categories/${encodeURIComponent(category)}/items`,
      importItemsPageSchema,
      query,
    );
  }

  async decideImportItem(
    context: InternalRequestContext,
    sessionId: string,
    itemId: string,
    input: unknown,
    idempotencyKey: string,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/calendar/imports/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(itemId)}/decision`,
      input,
      importDecisionResponseSchema,
      idempotencyKey,
    );
  }

  /** Inicio curto da execucao (Goal061 §1), no mesmo formato da analise. */
  async executeImport(
    context: InternalRequestContext,
    sessionId: string,
    input: { previewVersion: number; maxItems?: number },
    idempotencyKey: string,
  ) {
    const { data, status } = await this.mutateWithStatus(
      context,
      "POST",
      `/internal/calendar/imports/${encodeURIComponent(sessionId)}/execute`,
      input,
      importWorkStartResultSchema,
      idempotencyKey,
    );
    return { start: data, status };
  }

  async importProgress(context: InternalRequestContext, sessionId: string) {
    return this.get(
      context,
      `/internal/calendar/imports/${encodeURIComponent(sessionId)}/progress`,
      importProgressSchema,
    );
  }

  async completeImport(
    context: InternalRequestContext,
    sessionId: string,
    input: { acceptPending?: boolean },
    idempotencyKey: string,
  ) {
    return this.mutate(
      context,
      "POST",
      `/internal/calendar/imports/${encodeURIComponent(sessionId)}/complete`,
      input,
      importCompletionResultSchema,
      idempotencyKey,
    );
  }

  // --- Central de notificacoes (Goal022, WU-03) ---------------------------

  /**
   * Falhas de entrega do negocio (`state = FAILED`), por cursor estavel.
   *
   * O filtro por `FAILED` e do dono, e nao do BFF: `DISMISSED` e `CANCELLED`
   * sao decisoes legitimas do dominio (antecedencia vencida, cliente sem
   * telefone, versao superada) e nunca chegam aqui. Notificar funcionamento
   * correto seria transformar decisao em alarme.
   */
  async listFailedNotificationIntents(
    context: InternalRequestContext,
    query: { cursor?: string | null; limit?: number } = {},
  ) {
    return this.get(
      context,
      "/internal/notification-intents/failed",
      failedNotificationIntentsPageSchema,
      {
        cursor: query.cursor ?? undefined,
        limit: query.limit,
      },
    );
  }

  /**
   * Feed de compromissos criados pela IA, avancando por `sequence` — unico e
   * monotonico, e por isso cursor confiavel onde `occurredAt` nao e (eventos
   * da mesma transacao compartilham o instante).
   */
  async listAiCreatedAppointmentEvents(
    context: InternalRequestContext,
    query: { afterSequence?: string | null; limit?: number } = {},
  ) {
    return this.get(
      context,
      "/internal/appointment-events/ai-created",
      aiCreatedAppointmentEventsPageSchema,
      {
        afterSequence: query.afterSequence ?? undefined,
        limit: query.limit,
      },
    );
  }

  /**
   * Esvaziamento do conteúdo das intenções de envio já liquidadas
   * (Goal023/WU-05 chamando a porta do WU-03).
   *
   * O instante vai **calculado** daqui e o Scheduling não deriva janela por
   * conta própria — mas o prazo que o chamador aplica aqui é o **técnico**,
   * `RETENTION_INTENT_CONTENT_DAYS`, e não o prazo escolhido em Configurações:
   * `facts`/`detail` são rastro de execução do envio e não dizem se a conversa
   * era comercial ou pessoal. O cálculo e o motivo estão em
   * `modules/retention/sweep.ts` (`intentContentCutoff`). O teto limita a
   * passada e `hasMore` diz se sobrou trabalho. Chamador: a varredura, nunca
   * uma rota pública.
   */
  async purgeNotificationIntentContent(
    context: InternalRequestContext,
    input: { settledBefore: Date; maxRows: number },
  ) {
    return this.mutate(
      context,
      "POST",
      "/internal/notification-intents/content-retention",
      {
        settledBefore: input.settledBefore.toISOString(),
        maxRows: input.maxRows,
      },
      z.object({
        cleared: z.number().int().nonnegative(),
        hasMore: z.boolean(),
      }),
    );
  }

  /**
   * Purga do negócio inteiro no Scheduling (Goal025/WU-07 chamando a rota do
   * WU-06).
   *
   * Sem instante de corte, ao contrário de `purgeNotificationIntentContent`:
   * não há janela de prazo aqui, o negócio inteiro vai embora. O tenant viaja
   * só no contexto interno já autenticado — não existe campo de corpo para
   * apagar outro negócio. O teto limita a passada e `hasMore` diz se sobrou
   * trabalho; rodar de novo sobre negócio já purgado não é erro. Chamador: a
   * purga de conta vencida, nunca uma rota pública.
   *
   * As tabelas são as do Scheduling e a lista é dele: o BFF registra o que
   * voltou, sem replicar aqui um schema que não é seu.
   */
  async purgeTenant(
    context: InternalRequestContext,
    input: { maxRows: number },
  ) {
    return this.mutate(
      context,
      "POST",
      "/internal/retention/tenant",
      { maxRows: input.maxRows },
      z.object({
        deleted: z.record(z.string(), z.number().int().nonnegative()),
        totalDeleted: z.number().int().nonnegative(),
        hasMore: z.boolean(),
      }),
    );
  }

  /** Registro de atividade do Scheduling (D-176), já com o corte do BFF. */
  async activity(
    context: InternalRequestContext,
    query: InternalActivityQuery,
  ) {
    return this.get(context, "/internal/activity", internalActivityPageSchema, {
      ...query,
    });
  }

  /** Faturamento do período (D-177), já somado pelo Scheduling. */
  async revenue(
    context: InternalRequestContext,
    query: { period: RevenuePeriod; date?: string; customers?: "top" | "all" },
  ) {
    return this.get(context, "/internal/revenue", revenueReportSchema, query);
  }

  /** Os atendimentos por trás dos números do Faturamento (D-179). */
  async revenueAppointments(
    context: InternalRequestContext,
    query: {
      period: RevenuePeriod;
      date?: string;
      kind: RevenueAppointmentKind;
    },
  ) {
    return this.get(
      context,
      "/internal/revenue/appointments",
      revenueAppointmentListSchema,
      query,
    );
  }

  async dashboard(context: InternalRequestContext) {
    return this.get(
      context,
      "/internal/dashboard",
      z.object({
        appointmentsToday: z.number().int().nonnegative(),
        todayAppointments: z.array(appointmentSchema),
        // Semana local corrente (segunda a domingo, incluindo dias ja
        // passados), para "Esta semana" (Goal074).
        appointmentsThisWeek: z.number().int().nonnegative(),
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
    const { data } = await this.mutateWithStatus(
      context,
      method,
      path,
      body,
      schema,
      idempotencyKey,
    );
    return data;
  }

  /**
   * Igual a `mutate`, mas devolve tambem o status HTTP do Scheduling: usado
   * pelo inicio da analise e da execucao (Goal061 §1), onde `202` e a unica
   * resposta de sucesso e o chamador precisa repassa-la, nao apresenta-la
   * como `200`/`201`. `mutate` delega a este metodo, para que a escrita tenha
   * uma unica chamada ao transporte.
   */
  private async mutateWithStatus<T extends z.ZodType>(
    context: InternalRequestContext,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body: unknown,
    schema: T,
    idempotencyKey?: string,
  ): Promise<{ data: z.output<T>; status: number }> {
    const response = await this.http.requestWithStatus({
      method,
      path,
      context,
      body,
      idempotencyKey,
      schema: envelope(schema),
    });
    return {
      data: (response.data as { data: z.output<T> }).data,
      status: response.status,
    };
  }
}
