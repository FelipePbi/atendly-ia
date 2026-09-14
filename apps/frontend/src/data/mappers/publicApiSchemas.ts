import { z } from "zod";

export const calendarSourceSchema = z.enum(["ATENDLY", "EXTERNAL"]);
// Três estilos do produto (Goal011): Profissional, Equilibrada e
// Descontraída. O BFF aceita os dois valores antigos como alias de entrada
// mas nunca os devolve — o schema de leitura só precisa do vocabulário novo.
export const aiToneSchema = z.enum(["PROFESSIONAL", "BALANCED", "CASUAL"]);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const okSchema = z.object({ ok: z.literal(true) });
export const messageResultSchema = z.object({ message: z.string().min(1) });

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  createdAt: isoDateTimeSchema,
});

export const tenantSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  role: z.literal("OWNER"),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const businessProfileSchema = z.object({
  id: z.string().min(1),
  businessName: z.string(),
  category: z.string().nullable(),
  timezone: z.string().min(1),
  language: z.string().min(1),
  currency: z.string().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const registerResultSchema = z.object({
  user: userSchema,
  tenant: tenantSchema,
});

export const loginResultSchema = z.object({ user: userSchema });

export const sessionSchema = z.object({
  user: userSchema,
  tenant: tenantSchema,
  businessProfile: businessProfileSchema.nullable(),
  onboardingCompleted: z.boolean(),
});

export const calendarIntegrationSchema = z.object({
  status: z.string(),
  lastSuccessfulSyncAt: isoDateTimeSchema.nullable(),
  lastErrorAt: isoDateTimeSchema.nullable(),
  lastErrorCode: z.string().nullable(),
});

export const calendarCapabilitiesSchema = z.object({
  manageAvailability: z.boolean(),
  manageServices: z.boolean(),
  manageCustomers: z.boolean(),
  createAppointments: z.boolean(),
  migrate: z.boolean(),
});

export const calendarStateSchema = z.object({
  source: calendarSourceSchema.nullable(),
  timezone: z.string().nullable(),
  integration: calendarIntegrationSchema.nullable(),
  capabilities: calendarCapabilitiesSchema,
});

export const availabilityRuleSchema = z.object({
  id: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  active: z.boolean(),
});

export const availabilitySettingsSchema = z.object({
  timezone: z.string().min(1),
  rules: z.array(availabilityRuleSchema),
  // Regras de oferta do negócio (Goal009). Defaults iguais ao motor:
  // resposta antiga (sem estes campos) continua decodável.
  minLeadMinutes: z.number().int().nonnegative().optional().default(0),
  maxLeadDays: z.number().int().positive().optional().default(90),
  granularityMinutes: z.number().int().positive().optional().default(30),
});

export const onboardingStateSchema = z.object({
  business: z
    .object({
      name: z.string(),
      category: z.string().nullable(),
      timezone: z.string().min(1),
    })
    .nullable(),
  calendar: z.object({
    source: calendarSourceSchema.nullable(),
    timezone: z.string().nullable(),
    integration: calendarIntegrationSchema.nullable(),
  }),
  ai: z.object({ tone: aiToneSchema.nullable() }),
  service: z
    .object({
      id: z.string().min(1),
      name: z.string(),
      durationMinutes: z.number().int().positive().nullable(),
      priceType: z.enum(["FIXED", "STARTING_AT", "ON_REQUEST", "NOT_INFORMED"]),
      price: z.number().nonnegative().nullable(),
      active: z.boolean(),
    })
    .nullable(),
  availability: availabilitySettingsSchema.nullable(),
  whatsapp: z
    .object({
      status: z.string(),
      phoneNumber: z.string().nullable(),
    })
    .nullable(),
  completed: z.boolean(),
  completedAt: isoDateTimeSchema.nullable(),
});

export const settingsStateSchema = z.object({
  business: z
    .object({
      name: z.string(),
      category: z.string().nullable(),
      timezone: z.string().min(1),
      language: z.string().min(1),
      currency: z.string().min(1),
    })
    .nullable(),
  ai: z.object({
    enabled: z.boolean(),
    tone: aiToneSchema.nullable(),
  }),
  calendar: calendarStateSchema,
  availability: availabilitySettingsSchema.nullable(),
});

const serviceColorTokenSchema = z.enum([
  "ROSE",
  "AMBER",
  "EMERALD",
  "SKY",
  "VIOLET",
  "SLATE",
]);

export const serviceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  // Ausente e pendencia de revisao (Goal007); resposta antiga continua valida.
  durationMinutes: z.number().int().positive().nullable(),
  priceType: z.enum(["FIXED", "STARTING_AT", "ON_REQUEST", "NOT_INFORMED"]),
  price: z.number().nonnegative().nullable(),
  active: z.boolean(),
  needsReview: z.boolean().optional().default(false),
  reviewOrigin: z.enum(["IMPORT", "MANUAL"]).nullish().optional(),
  description: z.string().nullish().optional(),
  colorToken: serviceColorTokenSchema.nullish().optional(),
  bufferBeforeMinutes: z.number().int().nonnegative().optional().default(0),
  bufferAfterMinutes: z.number().int().nonnegative().optional().default(0),
  recurrenceIntervalDays: z.number().int().positive().nullish().optional(),
});

export const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
});

// Relação, observações e tags são opcionais no schema de propósito: a
// resposta antiga (sem esses campos) continua válida, e a nova é aceita sem
// redesenho de tela — o cadastro completo é do Goal015.
export const customerPrimaryGuardianSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["PROPOSED", "CONFIRMED"]),
    guardian: z.object({
      id: z.string().min(1),
      name: z.string().nullable(),
      phone: z.string().nullable(),
    }),
    proposedBy: z.enum(["AI", "PROFESSIONAL", "CUSTOMER"]),
    proposedByActor: z.string().nullable(),
    proposedAt: isoDateTimeSchema,
    confirmedBy: z.enum(["AI", "PROFESSIONAL", "CUSTOMER"]).nullable(),
    confirmedByActor: z.string().nullable(),
    confirmedAt: isoDateTimeSchema.nullable(),
  })
  .nullable();

export const customerNoteSchema = z.object({
  id: z.string().min(1),
  body: z.string(),
  aiAuthorized: z.boolean(),
  authorizedAt: isoDateTimeSchema.nullable(),
  authorizedBy: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const customerTagSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  aiAuthorized: z.boolean(),
  authorizedAt: isoDateTimeSchema.nullable(),
  authorizedBy: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const customerDetailSchema = customerSchema.extend({
  primaryGuardian: customerPrimaryGuardianSchema.optional().default(null),
  notes: z.array(customerNoteSchema).optional().default([]),
  tags: z.array(customerTagSchema).optional().default([]),
});

export const appointmentSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["AI", "USER", "INTEGRATION"]),
  // Título do atendimento manual excepcional sem serviço cadastrado
  // (Goal008). Opcional com default: resposta anterior a este Goal — e o
  // replay de idempotência gravado antes dele — continua decodável.
  title: z.string().nullable().optional().default(null),
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  durationMinutes: z.number().int().positive(),
  customerId: z.string().nullable(),
  customer: customerSchema.nullable(),
  services: z.array(
    z.object({
      serviceId: z.string().min(1),
      name: z.string(),
      durationMinutes: z.number().int().positive().nullable(),
      priceType: z.enum(["FIXED", "STARTING_AT", "ON_REQUEST", "NOT_INFORMED"]),
      price: z.number().nonnegative().nullable(),
    }),
  ),
  totalPrice: z.number().nonnegative().nullable(),
  totalPriceType: z.enum(["FIXED", "STARTING_AT", "NONE"]).optional().default("NONE"),
  comments: z.string().nullable(),
  // Texto livre, não enum, de propósito: os estados do produto são
  // `CONFIRMED | COMPLETED | CANCELLED | NO_SHOW`, mas uma resposta antiga
  // ainda traz `SCHEDULED`. Um enum recusaria essa resposta e quebraria a
  // tela por causa de um replay legítimo — a leitura de estado é feita por
  // `appointmentStatusLabel`, que trata `SCHEDULED` como confirmado.
  status: z.string(),
  // Ciclo de vida (Goal008). Todos opcionais: o DTO de agendamento só os
  // traz quando a rota de ciclo respondeu, e a listagem continua válida sem
  // eles.
  completedAt: z.string().nullable().optional().default(null),
  completionOrigin: z.enum(["MANUAL", "AUTO"]).nullable().optional().default(null),
  noShowAt: z.string().nullable().optional().default(null),
  noShowNote: z.string().nullable().optional().default(null),
  presenceConfirmedAt: z.string().nullable().optional().default(null),
  finalValue: z.number().nonnegative().nullable().optional().default(null),
  // Ocupação externa por buffer e série de atendimento (Goal009). Defaults
  // mantêm decodável toda resposta anterior a este Goal.
  bufferBeforeMinutes: z.number().int().nonnegative().optional().default(0),
  bufferAfterMinutes: z.number().int().nonnegative().optional().default(0),
  seriesId: z.string().nullable().optional().default(null),
});

/**
 * Estados do produto (Goal008) e o legado que ainda chega por replay.
 * `SCHEDULED` foi normalizado para `CONFIRMED` na migração, mas uma resposta
 * idempotente gravada antes disso continua trazendo o valor antigo.
 */
export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  CONFIRMED: "Confirmado",
  NO_SHOW: "Não compareceu",
  SCHEDULED: "Confirmado",
};

export function appointmentStatusLabel(status: string): string {
  return APPOINTMENT_STATUS_LABELS[status.toUpperCase()] ?? "Confirmado";
}

/** Um atendimento cancelado ou com falta não ocupa mais a agenda. */
export function isActiveAppointmentStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized !== "CANCELLED" && normalized !== "NO_SHOW";
}

/** Ciclo de vida devolvido pelas rotas de conclusão, falta, valor e presença. */
export const appointmentLifecycleSchema = z.object({
  id: z.string().min(1),
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

/** Histórico operacional: um evento por mutação, em ordem cronológica. */
export const appointmentEventSchema = z.object({
  id: z.string().min(1),
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
  // Desempate determinístico: `occurredAt` é o início da transação, então
  // eventos gravados juntos compartilham o instante.
  sequence: z.string(),
});

/** Reserva temporária de um horário em confirmação. */
export const appointmentHoldSchema = z.object({
  id: z.string().min(1),
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  durationMinutes: z.number().int().positive(),
  serviceIds: z.array(z.string().min(1)),
  customerId: z.string().nullable(),
  contactRef: z.string().nullable(),
  source: z.enum(["AI", "USER"]),
  expiresAt: z.string(),
  status: z.enum(["ACTIVE", "CONSUMED", "RELEASED", "EXPIRED"]),
});

export const availabilitySlotSchema = z.object({
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
});

export const timeBlockKindSchema = z.enum(["BLOCK", "PERSONAL"]);

export const timeBlockSchema = z.object({
  id: z.string().min(1),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  reason: z.string().nullable(),
  // Compromisso pessoal, título e vínculo com série (Goal009). Defaults
  // mantêm decodável toda resposta anterior a este Goal.
  kind: timeBlockKindSchema.optional().default("BLOCK"),
  title: z.string().nullable().optional().default(null),
  seriesId: z.string().nullable().optional().default(null),
});

/** Excecoes de disponibilidade geridas (Goal009). */
export const availabilityExceptionSchema = z.object({
  id: z.string().min(1),
  date: dateSchema,
  startTime: timeSchema.nullable(),
  endTime: timeSchema.nullable(),
  available: z.boolean(),
  reason: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedReason: z.string().nullable(),
});

/** Serie finita de bloqueio/compromisso pessoal (Goal009). */
export const blockSeriesSchema = z.object({
  id: z.string().min(1),
  kind: timeBlockKindSchema,
  title: z.string().nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  startTime: timeSchema,
  endTime: timeSchema,
  seriesStartDate: dateSchema,
  seriesEndDate: dateSchema.nullable(),
  occurrenceCount: z.number().int().positive().nullable(),
  status: z.enum(["ACTIVE", "ENDED"]),
  supersededById: z.string().nullable(),
});

/** Ocorrencia pre-visualizada de uma serie de atendimento (Goal009). */
export const seriesOccurrencePreviewSchema = z.object({
  index: z.number(),
  requestedDate: dateSchema,
  date: dateSchema.nullable(),
  startTime: timeSchema.nullable(),
  endTime: timeSchema.nullable(),
  adjusted: z.boolean(),
  holdId: z.string().nullable(),
  unavailable: z.boolean(),
});

export const deletedSchema = z.object({ deleted: z.literal(true) });

export const customerListSchema = z.object({
  items: z.array(customerSchema),
  source: calendarSourceSchema,
  managedExternally: z.boolean(),
  filteredByPhone: z.boolean().optional(),
});

export const serviceListSchema = z.object({
  items: z.array(serviceSchema),
  source: calendarSourceSchema,
  editable: z.boolean(),
});

// --- Kind e attachment de midia (Goal013) -----------------------------------
// Sem tela: o player e a exibicao sao do Goal017. Aqui o schema so passa a
// aceitar os campos, incluindo a recusa de vocabulario desconhecido — mensagem
// de texto e o estoque anterior a este Goal continuam sem os dois campos.
export const messageKindSchema = z.enum([
  "TEXT",
  "AUDIO",
  "IMAGE",
  "DOCUMENT",
  "VIDEO",
  "STICKER",
  "UNKNOWN",
]);

export const messageAttachmentKindSchema = z.enum([
  "AUDIO",
  "IMAGE",
  "DOCUMENT",
  "VIDEO",
  "STICKER",
]);

export const transcriptStatusSchema = z.enum([
  "PENDING",
  "DONE",
  "FAILED",
  "SKIPPED",
]);

export const messageAttachmentSchema = z.object({
  kind: messageAttachmentKindSchema,
  mimetype: z.string().nullable(),
  fileName: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  tooLarge: z.boolean(),
  // Preenchido so quando ha audio (ver garantias em PUBLIC_API_V1.md).
  transcript: z.string().nullable(),
  transcriptStatus: transcriptStatusSchema.nullable(),
  transcriptError: z.string().nullable(),
  // Dica para a UI decidir se oferece "ver midia"; nao garante que o download
  // sob demanda vai ter sucesso — so a rota de midia sabe.
  mediaAvailable: z.boolean(),
});

export const messageSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  source: z.enum(["CUSTOMER", "AI", "OWNER"]).nullable(),
  body: z.string(),
  createdAt: isoDateTimeSchema,
  // Campo opcional: respostas anteriores ao Goal004 nao trazem estado de
  // entrega, e mensagem recebida nunca traz. A composicao do chat que consome
  // isso e do Goal017; aqui o schema so passa a aceitar o campo.
  deliveryState: z
    .enum(["PENDING", "SENT", "FAILED", "UNKNOWN"])
    .nullish()
    .optional(),
  deliveryDetail: z.string().nullish().optional(),
  kind: messageKindSchema.nullish().optional(),
  attachment: messageAttachmentSchema.nullish().optional(),
});

export const sessionCategorySchema = z.enum([
  "COMMERCIAL",
  "UNCLASSIFIED",
  "PERSONAL",
]);

export const conversationSchema = z.object({
  id: z.string().min(1),
  externalContactId: z.string(),
  customerName: z.string().nullable(),
  status: z.enum(["ACTIVE", "HUMAN_HANDOFF", "CLOSED"]),
  humanHandoff: z.boolean(),
  handoffReason: z.string().nullable(),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  updatedAt: isoDateTimeSchema,
  // Campos do Goal005, todos opcionais: resposta anterior continua valida e a
  // inbox em tres abas, que consome isto de verdade, e do Goal017. Aqui o
  // schema so passa a aceitar os campos e as operacoes novas.
  category: sessionCategorySchema.optional(),
  categorySource: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
  suggestedCategory: sessionCategorySchema.nullish().optional(),
  handling: z.enum(["AI", "HUMAN"]).optional(),
  ignored: z.boolean().optional(),
  ignoredAt: isoDateTimeSchema.nullish().optional(),
  aiPaused: z.boolean().optional(),
  session: z
    .object({
      id: z.string().min(1),
      startedAt: isoDateTimeSchema,
      expiresAt: isoDateTimeSchema,
      lastContactMessageAt: isoDateTimeSchema.nullish().optional(),
      humanHandlingSince: isoDateTimeSchema.nullish().optional(),
    })
    .nullish()
    .optional(),
});

const dependencyErrorSchema = z.object({
  status: z.literal("error"),
  data: z.null(),
  code: z.literal("DEPENDENCY_UNAVAILABLE"),
});

const dependencyResultSchema = <TSchema extends z.ZodType>(schema: TSchema) =>
  z.union([
    z.object({ status: z.literal("ok"), data: schema }),
    dependencyErrorSchema,
  ]);

const schedulingDashboardSchema = z.object({
  appointmentsToday: z.number().int().nonnegative(),
  todayAppointments: z.array(appointmentSchema),
  nextAppointment: appointmentSchema.nullable(),
  estimatedRevenueToday: z.number().nonnegative().nullable(),
  calendar: calendarStateSchema,
});

export const dashboardSchema = z.object({
  platform: z.object({
    tenantName: z.string(),
    timezone: z.string().min(1),
    onboardingCompleted: z.boolean(),
  }),
  ai: dependencyResultSchema(
    z.object({
      conversationsNeedingAttention: z.array(conversationSchema),
      conversationsNeedingAttentionCount: z.number().int().nonnegative(),
      aiAppointmentsToday: z.number().int().nonnegative(),
      automatedConversationsToday: z.number().int().nonnegative(),
    }),
  ),
  scheduling: dependencyResultSchema(schedulingDashboardSchema),
  whatsapp: dependencyResultSchema(
    z
      .object({
        status: z.enum(["CONNECTED", "DISCONNECTED"]),
        phoneNumber: z.string().nullable(),
      })
      .nullable(),
  ),
  degraded: z.boolean(),
});

const migrationEntityCountSchema = z.object({
  total: z.number().int().nonnegative(),
  importable: z.number().int().nonnegative(),
});

export const migrationDiagnosisSchema = z.object({
  source: calendarSourceSchema,
  target: calendarSourceSchema,
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

export const migrationStartSchema = z.object({
  migrationId: z.string().min(1),
});

export const migrationSchema = z.object({
  migrationId: z.string().min(1),
  source: calendarSourceSchema,
  target: calendarSourceSchema,
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
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  conflicts: z.array(
    z.object({
      id: z.string().min(1),
      entityType: z.string(),
      status: z.string(),
      details: z.unknown(),
    }),
  ),
});

export const whatsappConnectionSchema = z.object({
  id: z.string().min(1),
  phoneNumber: z.string().nullable(),
  status: z.string(),
  connectedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});

export const whatsappConnectResultSchema = z.object({
  connection: whatsappConnectionSchema,
  pairingCode: z.string().nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  qrcode: z.string().nullable(),
});

export const whatsappDisconnectResultSchema = z.object({
  disconnected: z.literal(true),
});

// --- Conhecimento, memoria do cliente, resumo e sugestoes (Goal012) --------
// Sem tela: a experiencia e dos Goals 015, 017 e 023. Aqui e so o contrato
// que a camada de dados precisa entender, incluindo a recusa de vocabulario
// desconhecido em campos fechados (`type`/`status` do documento, `kind` e
// `origin` da memoria).
export const knowledgeDocumentTypeSchema = z.enum([
  "FAQ",
  "GUIDANCE",
  "CARE",
  "PROCEDURE",
  "BUSINESS_INFO",
  "TEXT_POLICY",
]);

export const knowledgeDocumentStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const knowledgeChunkSchema = z.object({
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const knowledgeDocumentSchema = z.object({
  id: z.string().min(1),
  type: knowledgeDocumentTypeSchema,
  // Liga o documento a um servico do catalogo por ID; ausente, e geral.
  serviceId: z.string().nullable(),
  title: z.string(),
  source: z.string(),
  // Cada edicao gera versao nova e inativa a anterior; nunca apaga.
  version: z.string(),
  checksum: z.string(),
  status: knowledgeDocumentStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const customerMemoryKindSchema = z.enum([
  "PREFERRED_PERIOD",
  "PREFERRED_DAY",
  "RECURRING_SERVICE",
  "OBSERVATION",
]);

export const customerMemoryOriginSchema = z.enum([
  "CUSTOMER_STATED",
  "AI_INFERRED",
  "PROFESSIONAL",
]);

export const customerMemorySchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  kind: customerMemoryKindSchema,
  value: z.string(),
  origin: customerMemoryOriginSchema,
  // Permissao explicita de uso pela IA; nasce negada por padrao.
  aiAllowed: z.boolean(),
  // So preenchida quando a memoria foi inferida pela IA.
  confidence: z.number().nullable(),
  sourceConversationId: z.string().nullable(),
  sourceMessageIds: z.array(z.string()),
  observedAt: isoDateTimeSchema,
  lastReinforcedAt: isoDateTimeSchema.nullable(),
  // Inferencia nova que contradiz a anterior substitui, sem apagar.
  supersededById: z.string().nullable(),
  removedAt: isoDateTimeSchema.nullable(),
  removedBy: z.string().nullable(),
});

export const customerSummarySchema = z.object({
  customerId: z.string().min(1),
  summary: z.string(),
  promptVersion: z.string(),
  // Auditoria obrigatoria: resumo sem AiRun nao e gerado, entao nunca chega
  // nulo aqui.
  aiRunId: z.string().min(1),
  sources: z.object({
    memory: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
    tags: z.number().int().nonnegative(),
    upcomingAppointments: z.number().int().nonnegative(),
  }),
});

export const conversationSuggestionsSchema = z.object({
  conversationId: z.string().min(1),
  suggestions: z.array(z.string()),
  // Auditoria (`AiRun.kind = SUGGESTION`) e versao do prompt de sugestao:
  // ambas nascem antes da chamada ao modelo, entao sempre chegam.
  aiRunId: z.string().min(1),
  promptVersion: z.string(),
});

export type KnowledgeDocumentType = z.infer<typeof knowledgeDocumentTypeSchema>;
export type KnowledgeDocumentStatus = z.infer<
  typeof knowledgeDocumentStatusSchema
>;
export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export type CustomerMemoryKind = z.infer<typeof customerMemoryKindSchema>;
export type CustomerMemoryOrigin = z.infer<typeof customerMemoryOriginSchema>;
export type CustomerMemory = z.infer<typeof customerMemorySchema>;
export type CustomerSummary = z.infer<typeof customerSummarySchema>;
export type ConversationSuggestions = z.infer<
  typeof conversationSuggestionsSchema
>;

export type AiTone = z.infer<typeof aiToneSchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
export type AppointmentLifecycle = z.infer<typeof appointmentLifecycleSchema>;
export type AppointmentEvent = z.infer<typeof appointmentEventSchema>;
export type AppointmentHold = z.infer<typeof appointmentHoldSchema>;
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;
export type AvailabilitySettings = z.infer<typeof availabilitySettingsSchema>;
export type CalendarSource = z.infer<typeof calendarSourceSchema>;
export type CalendarState = z.infer<typeof calendarStateSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type SessionCategory = z.infer<typeof sessionCategorySchema>;
export type Customer = z.infer<typeof customerSchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
export type CustomerNote = z.infer<typeof customerNoteSchema>;
export type CustomerTag = z.infer<typeof customerTagSchema>;
export type CustomerList = z.infer<typeof customerListSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type Message = z.infer<typeof messageSchema>;
export type MessageKind = z.infer<typeof messageKindSchema>;
export type MessageAttachmentKind = z.infer<typeof messageAttachmentKindSchema>;
export type TranscriptStatus = z.infer<typeof transcriptStatusSchema>;
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

// --- Importacao unica do Minha Agenda (Goal010) ----------------------------
// Substitui a migracao bidirecional como caminho de produto. Os schemas
// antigos (`migrationSchema` e companhia) continuam acima e continuam
// decodificando as respostas ja gravadas do protocolo anterior — o corte
// deles e do Goal024, nao deste. Aqui nao ha tela (Goal019): so o contrato
// que a camada de dados precisa entender.
export const importCategorySchema = z.enum([
  "SERVICE",
  "CUSTOMER",
  "AVAILABILITY",
  "TIME_BLOCK",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
]);
export const importItemStatusSchema = z.enum([
  "PENDING",
  "IMPORTED",
  "SKIPPED",
  "FAILED",
  "NEEDS_REVIEW",
]);
export const importSessionStatusSchema = z.enum([
  "DRAFT",
  "ANALYZING",
  "READY",
  "EXECUTING",
  "PARTIAL",
  "FAILED",
  "SUPERSEDED",
  "COMPLETED",
]);
export const importDecisionScopeSchema = z.enum([
  "SESSION",
  "CATEGORY",
  "ITEM",
]);
export const importDecisionKindSchema = z.enum([
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
const importCategoryCountsSchema = importCountsSchema.extend({
  category: importCategorySchema,
});

export const importSessionStartSchema = z.object({
  sessionId: z.string().min(1),
  status: importSessionStatusSchema,
  created: z.boolean(),
  replacedSessionId: z.string().nullable(),
});

export const importItemSchema = z.object({
  id: z.string().min(1),
  category: importCategorySchema,
  externalId: z.string(),
  label: z.string().nullable(),
  status: importItemStatusSchema,
  reasonCode: z.string().nullable(),
  reasonDetail: z.string().nullable(),
  entityType: z.string().nullable(),
  internalId: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  lastAttemptAt: isoDateTimeSchema.nullable(),
  processedAt: isoDateTimeSchema.nullable(),
  disappearedAt: isoDateTimeSchema.nullable(),
});

// Contagens por categoria, nunca uma contagem generica de agendamentos; a
// limitacao declarada da origem vem junto com a categoria que a sofreu.
export const importPreviewCategorySchema = z.object({
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

export const importPreviewSchema = z.object({
  sessionId: z.string().min(1),
  previewVersion: z.number().int().nonnegative(),
  generatedAt: isoDateTimeSchema,
  categories: z.array(importPreviewCategorySchema),
  changesSincePreviousVersion: z.object({
    newCount: z.number().int().nonnegative(),
    changedCount: z.number().int().nonnegative(),
    disappearedCount: z.number().int().nonnegative(),
  }),
});

export const importItemsPageSchema = z.object({
  sessionId: z.string().min(1),
  category: importCategorySchema,
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  items: z.array(importItemSchema),
});

export const importDecisionSchema = z.object({
  item: importItemSchema,
  decision: z.object({
    id: z.string().min(1),
    scope: importDecisionScopeSchema,
    decision: importDecisionKindSchema,
    category: importCategorySchema.nullable(),
    itemId: z.string().nullable(),
    externalId: z.string().nullable(),
    targetInternalId: z.string().nullable(),
    noteCode: z.string().nullable(),
    decidedBy: z.string().min(1),
    decidedAt: isoDateTimeSchema,
  }),
});

export const importExecutionSchema = z.object({
  sessionId: z.string().min(1),
  previewVersion: z.number().int().nonnegative(),
  status: z.enum(["PARTIAL", "READY"]),
  processed: z.number().int().nonnegative(),
  counts: importCountsSchema,
  categories: z.array(importCategoryCountsSchema),
  leaseOwner: z.string().min(1),
  leaseLost: z.boolean(),
});

export const importProgressSchema = z.object({
  sessionId: z.string().min(1),
  status: importSessionStatusSchema,
  previewVersion: z.number().int().nonnegative(),
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  counts: importCountsSchema,
  categories: z.array(importCategoryCountsSchema),
});

export const importCompletionSchema = z.object({
  sessionId: z.string().min(1),
  provider: z.enum(["MINHA_AGENDA"]),
  sourceAccountId: z.string().min(1),
  sourceAccountLabel: z.string().nullable(),
  status: z.literal("COMPLETED"),
  completedAt: isoDateTimeSchema,
  completedBy: z.string().min(1),
  counts: importCountsSchema,
  categories: z.array(
    importCountsSchema.extend({
      category: importCategorySchema,
      discovered: z.number().int().nonnegative(),
      sourceSupported: z.boolean(),
      limitationCode: z.string().nullable(),
    }),
  ),
  // Aceite explicito de pendentes: autor, data e a contagem no momento da
  // decisao; nulo quando nao havia pendencia nenhuma.
  pendingAcceptance: z
    .object({
      acceptedBy: z.string().min(1),
      acceptedAt: isoDateTimeSchema,
      pendingCount: z.number().int().nonnegative(),
    })
    .nullable(),
});

export type Migration = z.infer<typeof migrationSchema>;
export type MigrationDiagnosis = z.infer<typeof migrationDiagnosisSchema>;
export type MigrationStart = z.infer<typeof migrationStartSchema>;
export type ImportCategory = z.infer<typeof importCategorySchema>;
export type ImportItemStatus = z.infer<typeof importItemStatusSchema>;
export type ImportSessionStatus = z.infer<typeof importSessionStatusSchema>;
export type ImportDecisionScope = z.infer<typeof importDecisionScopeSchema>;
export type ImportDecisionKind = z.infer<typeof importDecisionKindSchema>;
export type ImportSessionStart = z.infer<typeof importSessionStartSchema>;
export type ImportItem = z.infer<typeof importItemSchema>;
export type ImportPreview = z.infer<typeof importPreviewSchema>;
export type ImportPreviewCategory = z.infer<typeof importPreviewCategorySchema>;
export type ImportItemsPage = z.infer<typeof importItemsPageSchema>;
export type ImportDecision = z.infer<typeof importDecisionSchema>;
export type ImportExecution = z.infer<typeof importExecutionSchema>;
export type ImportProgress = z.infer<typeof importProgressSchema>;
export type ImportCompletion = z.infer<typeof importCompletionSchema>;
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type ServiceList = z.infer<typeof serviceListSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SettingsState = z.infer<typeof settingsStateSchema>;
export type TimeBlock = z.infer<typeof timeBlockSchema>;
export type TimeBlockKind = z.infer<typeof timeBlockKindSchema>;
export type AvailabilityException = z.infer<typeof availabilityExceptionSchema>;
export type BlockSeries = z.infer<typeof blockSeriesSchema>;
export type SeriesOccurrencePreview = z.infer<
  typeof seriesOccurrencePreviewSchema
>;
export type WhatsAppConnection = z.infer<typeof whatsappConnectionSchema>;
