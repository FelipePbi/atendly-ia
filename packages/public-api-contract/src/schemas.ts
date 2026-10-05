import { z } from "zod";

// Único ponto do pacote que ainda conhece o valor anterior à troca de marca
// (Goal109): decodifica como `AVENLY` e nunca é devolvido.
const LEGACY_CALENDAR_SOURCE = "ATENDLY";
export const calendarSourceSchema = z
  .enum(["AVENLY", LEGACY_CALENDAR_SOURCE])
  .transform((): "AVENLY" => "AVENLY");
// Modalidades de atendimento do negócio (Goal018/WU-01), seleção múltipla.
export const businessModalitySchema = z.enum(["ON_SITE", "AT_HOME", "ONLINE"]);
// Estado de projeção do contexto de negócio para a IA (Goal018/WU-03):
// `PROJECTED` quando a última versão gravada já chegou na IA, `PENDING`
// quando a gravação é mais nova que a última projeção bem-sucedida.
export const businessContextProjectionStatusSchema = z.enum([
  "PROJECTED",
  "PENDING",
]);
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
  // Nome do dono da conta (Goal064). Nulo para conta anterior a este Goal;
  // ausente é aceito na decodificação, para resposta anterior ao campo.
  name: z.string().nullable().optional(),
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
  // Modalidades e endereço do negócio (Goal018/WU-01). Opcionais: resposta
  // anterior a este Goal continua decodificando sem eles.
  modalities: z.array(businessModalitySchema).optional(),
  address: z.string().nullable().optional(),
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
  // Leitura real, nunca de configuração local (Goal018/WU-10): ao menos um
  // serviço operacional (já existia no BFF, só passa a ser decodificado) e ao
  // menos uma regra de disponibilidade ativa / integração conectada. Ausente
  // em respostas de `/v1/settings` e `/v1/onboarding`, que não computam o
  // segundo — a Home é a única leitora.
  aiActivationReady: z.boolean().optional(),
  hoursConfigured: z.boolean().optional(),
  // Quarto item do checklist (Goal019 §9): `true` so com execucao do teste
  // real em `SUCCEEDED` que ainda vale para o WhatsApp de hoje. Ausente fora
  // da Home, pela mesma razao que `hoursConfigured`.
  activationTestCompleted: z.boolean().optional(),
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
  // Antecedencia minima do cliente (via IA) para cancelar/remarcar o proprio
  // atendimento (Goal073). Default igual ao motor: resposta antiga continua
  // decodavel.
  customerChangeMinNoticeMinutes: z.number().int().nonnegative().optional().default(0),
});

const serviceColorTokenSchema = z.enum([
  "ROSE",
  "AMBER",
  "EMERALD",
  "SKY",
  "VIOLET",
  "SLATE",
]);

export const onboardingStateSchema = z.object({
  business: z
    .object({
      name: z.string(),
      category: z.string().nullable(),
      timezone: z.string().min(1),
      // Modalidades, endereço e versionamento do contexto de negócio
      // (Goal018/WU-01, WU-03). Opcionais: resposta anterior a este Goal
      // continua decodificando sem eles.
      modalities: z.array(businessModalitySchema).optional(),
      address: z.string().nullable().optional(),
      contextVersion: z.number().int().nonnegative().optional(),
      contextProjectedVersion: z.number().int().nonnegative().optional(),
      contextProjectionStatus: businessContextProjectionStatusSchema.optional(),
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
      // Mesmos campos e tipos de `serviceSchema` (Goal007/Goal009): este
      // objeto é o serviço ativo devolvido por `scheduling.listServices`, sem
      // forma reduzida.
      needsReview: z.boolean().optional().default(false),
      reviewOrigin: z.enum(["IMPORT", "MANUAL"]).nullish().optional(),
      description: z.string().nullish().optional(),
      colorToken: serviceColorTokenSchema.nullish().optional(),
      bufferBeforeMinutes: z.number().int().nonnegative().optional().default(0),
      bufferAfterMinutes: z.number().int().nonnegative().optional().default(0),
      recurrenceIntervalDays: z.number().int().positive().nullish().optional(),
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
      // Modalidades, endereço e versionamento do contexto de negócio
      // (Goal018/WU-01, WU-03). Opcionais: resposta anterior a este Goal
      // continua decodificando sem eles.
      modalities: z.array(businessModalitySchema).optional(),
      address: z.string().nullable().optional(),
      contextVersion: z.number().int().nonnegative().optional(),
      contextProjectedVersion: z.number().int().nonnegative().optional(),
      contextProjectionStatus: businessContextProjectionStatusSchema.optional(),
    })
    .nullable(),
  ai: z.object({
    enabled: z.boolean(),
    tone: aiToneSchema.nullable(),
    // Instante da pausa humana (Goal117). Opcional e anulável: resposta
    // anterior a este Goal continua válida sem o campo.
    pausedAt: isoDateTimeSchema.nullable().optional(),
  }),
  calendar: calendarStateSchema,
  availability: availabilitySettingsSchema.nullable(),
});

// --- Lembretes e confirmação de presença (Goal021, WU-010) ------------------
// Espelha `GET/PATCH /v1/settings/reminders` em PUBLIC_API_V1.md: só humano
// configura, no mesmo padrão de disponibilidade e oferta (Goal009). `rules`
// tem no máximo dois itens, um por posição — a restrição de "até dois" nasce
// da forma, não de validação extra aqui.
export const reminderSlotSchema = z.enum(["FIRST", "SECOND"]);
export const reminderPricePolicySchema = z.enum(["NEVER", "WHEN_FIXED"]);
export const reminderRuleSchema = z.object({
  slot: reminderSlotSchema,
  leadMinutes: z.number().int().positive().max(43_200),
});
export const reminderSettingsSchema = z.object({
  // `false` quando o negócio nunca gravou a configuração: a resposta traz o
  // default do produto (um lembrete a 24h, FIRST), não um estado vazio.
  configured: z.boolean(),
  confirmationEnabled: z.boolean(),
  pricePolicy: reminderPricePolicySchema,
  rules: z.array(reminderRuleSchema).max(2),
});

// --- Preferencia de visualizacao da agenda (Goal073) ------------------------
// Espelha `GET/PATCH /v1/settings/agenda-view`. So do BFF; a Agenda Avenly
// nao tem nocao de "vista". Ausencia de linha e o default do produto (nada
// oculto, sem vista inicial), nunca gravada so pela leitura.
export const agendaInitialViewSchema = z.enum(["DAY", "WEEK", "MONTH"]);
export const agendaViewPreferenceSchema = z.object({
  hiddenWeekdays: z.array(z.number().int().min(0).max(6)).max(6),
  initialView: agendaInitialViewSchema.nullable(),
});

export const retentionDaysSchema = z.union([
  z.literal(30),
  z.literal(90),
  z.literal(180),
  z.literal(365),
]);
export const retentionSettingsSchema = z.object({
  commercialRetentionDays: retentionDaysSchema,
  personalRetentionDays: retentionDaysSchema,
  // A allowlist e do servidor: o seletor a le, nao a declara.
  retentionDaysOptions: z.array(retentionDaysSchema),
  // U-01 no contrato, nao so na tela: conteudo nao classificado segue o prazo Comercial.
  unclassifiedRetentionFollows: z.literal("COMMERCIAL"),
  // Ultima varredura concluida deste negocio; nula enquanto nenhuma concluiu.
  lastSweepCompletedAt: z.string().nullable(),
  appliesFrom: z.literal("NEXT_SWEEP"),
});

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

// Recorte de um agendamento no fuso do calendário do negócio (Goal075):
// próximo e último atendimento na lista de clientes. Ausente na resposta
// anterior a este Goal, que continua decodável sem os dois campos.
export const customerAppointmentSummarySchema = z.object({
  date: dateSchema,
  startTime: timeSchema,
  status: z.string(),
});

export const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
  nextAppointment: customerAppointmentSummarySchema.nullable().optional(),
  lastAppointment: customerAppointmentSummarySchema.nullable().optional(),
});

// Números do histórico inteiro de um cliente (Goal075), no fuso do
// calendário do negócio. Ausente na resposta anterior a este Goal.
export const customerAppointmentStatsSchema = z.object({
  completed: z.number().int().nonnegative(),
  noShows: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  averageIntervalDays: z.number().nonnegative().nullable(),
  firstAppointmentDate: dateSchema.nullable(),
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
  appointmentStats: customerAppointmentStatsSchema.optional(),
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
  totalPriceType: z
    .enum(["FIXED", "STARTING_AT", "NONE"])
    .optional()
    .default("NONE"),
  comments: z.string().nullable(),
  // Texto livre, não enum, de propósito: os estados do produto são
  // `CONFIRMED | COMPLETED | CANCELLED | NO_SHOW`, mas uma resposta antiga
  // ainda traz `SCHEDULED`. Um enum recusaria essa resposta e quebraria a
  // tela por causa de um replay legítimo — a leitura de estado é feita por
  // `appointmentStatusLabel`, que trata `SCHEDULED` como confirmado.
  status: z.string(),
  // Ciclo de vida (Goal008). A listagem e a leitura trazem o que está gravado
  // (Goal103); todos seguem opcionais com default nulo, para que resposta
  // anterior ao Goal103 — e replay de idempotência — continue válida.
  completedAt: z.string().nullable().optional().default(null),
  completionOrigin: z
    .enum(["MANUAL", "AUTO"])
    .nullable()
    .optional()
    .default(null),
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

/**
 * Estado de envio ao cliente **deste** agendamento (Goal021). É a resposta
 * para "o lembrete desta ocorrência saiu?" — pergunta que `ReminderSettings`
 * não responde: a configuração diz só com quanta antecedência ele sairia.
 */
export const appointmentNotificationKindSchema = z.enum([
  "REMINDER",
  "CHANGE_NOTICE",
]);
export const appointmentNotificationSlotSchema = z.enum([
  "FIRST",
  "SECOND",
  "CHANGE_NOTICE",
]);
export const appointmentNotificationStateSchema = z.enum([
  "PENDING",
  "CLAIMED",
  "SENT",
  "FAILED",
  "DISMISSED",
  "CANCELLED",
]);
export const appointmentNotificationReasonSchema = z.enum([
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
export const appointmentNotificationSchema = z.object({
  id: z.string().min(1),
  kind: appointmentNotificationKindSchema,
  slot: appointmentNotificationSlotSchema,
  appointmentVersion: z.number().int().nonnegative(),
  state: appointmentNotificationStateSchema,
  // Obrigatório nos estados terminais que o exigem e proibido nos demais —
  // invariante do banco, não da tela; aqui ele é só lido.
  reason: appointmentNotificationReasonSchema.nullable(),
  dueAt: z.string(),
  sentAt: z.string().nullable(),
  settledAt: z.string().nullable(),
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

/**
 * DELETE /v1/customers/:id/primary-guardian é idempotente: repetir a remoção
 * quando não havia vínculo devolve `deleted: false`, não erro.
 */
export const deletedIdempotentSchema = z.object({ deleted: z.boolean() });

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

// `GET/PUT /v1/services/:id/ai-instruction` (Goal078): instrução privada por
// serviço, nunca revelada ao cliente pelo modelo. Vazia (`""`) quando o
// negócio nunca salvou nada para este serviço — não é erro.
export const serviceAiInstructionSchema = z.object({ content: z.string() });
export type ServiceAiInstruction = z.infer<typeof serviceAiInstructionSchema>;

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
  // Goal115: de quem e a decisao manual vigente. `null` na classificacao
  // automatica, ausente no estoque anterior a este campo.
  categoryScope: z.enum(["CONVERSATION", "CONTACT"]).nullish().optional(),
  // Goal116: decisao manual do contato, independente da vigente na conversa.
  // `null` sem decisao do contato, ausente no estoque anterior ao campo.
  contactCategory: sessionCategorySchema.nullish().optional(),
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
  // Vínculo com a pessoa do Scheduling (Goal017): `null` quando o contato
  // ainda não está vinculado, ausente no estoque anterior a este campo.
  customerId: z.string().nullish().optional(),
  // Ate quando o conteudo desta conversa ja foi purgado (Goal023). Nulo
  // enquanto nada expirou, ausente no estoque anterior a este campo. So
  // avanca, nunca retrocede — e a marca que a tela le para dizer que
  // mensagens antigas expiraram, nunca inferida pela ausencia de mensagem.
  contentExpiredThrough: isoDateTimeSchema.nullish().optional(),
});

// --- Eventos de agenda que a IA fez na conversa (Goal070) -------------------
// Deriva só do ledger `AiToolCall` de `create_appointment`, nunca do texto do
// modelo (D-073). Espelha `ConversationEvent` de
// `apps/ai-orchestrator/src/modules/conversations/conversation-events.ts`.
export const holdPlacedEventSchema = z.object({
  type: z.literal("HOLD_PLACED"),
  id: z.string().min(1),
  occurredAt: z.string(),
  date: dateSchema,
  startTime: timeSchema,
  holdExpiresAt: z.string(),
});
export const holdExpiredEventSchema = z.object({
  type: z.literal("HOLD_EXPIRED"),
  id: z.string().min(1),
  occurredAt: z.string(),
  date: dateSchema,
  startTime: timeSchema,
});
export const appointmentCreatedEventSchema = z.object({
  type: z.literal("APPOINTMENT_CREATED"),
  id: z.string().min(1),
  occurredAt: z.string(),
  appointmentId: z.string().min(1),
  date: dateSchema,
  startTime: timeSchema,
});
export const conversationEventSchema = z.discriminatedUnion("type", [
  holdPlacedEventSchema,
  holdExpiredEventSchema,
  appointmentCreatedEventSchema,
]);
export type ConversationEvent = z.infer<typeof conversationEventSchema>;

// Contato ignorado por telefone, sem conversa ainda (Goal019/WU-07): a etapa
// opcional entre conectar e testar aceita numero informado manualmente,
// criando o contato quando ele nao existe.
export const ignoredContactSchema = z.object({
  contactId: z.string().min(1),
  externalContactId: z.string().min(1),
  ignored: z.boolean(),
  ignoredAt: isoDateTimeSchema.nullable(),
});

// Execucao do teste real da ativacao (Goal019). Espelha `GET/POST
// /v1/activation-test` em `apps/bff/PUBLIC_API_V1.md`. Nada aqui e derivado
// de tempo: os seis marcos so ficam `reached` quando ha fato gravado atras
// deles, e a tela nunca preenche o que a leitura nao trouxe.
export const activationTestStepSchema = z.enum([
  "TEST_NOTICE",
  "CLIENT_ASKS_PRICE",
  "AI_IDENTIFIES_SERVICE",
  "AI_ANSWERS_PRICE",
  "CLIENT_ASKS_SLOT",
  "AI_CHECKS_AVAILABILITY",
  "CLIENT_ACCEPTS_SLOT",
  "AI_CONFIRMS_APPOINTMENT",
]);

export const activationTestMilestoneNameSchema = z.enum([
  "MESSAGE_SENT",
  "SERVICE_IDENTIFIED",
  "PRICE_INFORMED",
  "AVAILABILITY_CHECKED",
  "SLOT_SELECTED",
  "APPOINTMENT_CONFIRMED",
]);

export const activationTestRunSchema = z.object({
  id: z.string().min(1),
  state: z.enum([
    "RUNNING",
    "PAUSED_BY_HUMAN",
    "SUCCEEDED",
    "FAILED",
    "DISCARDED",
  ]),
  terminal: z.boolean(),
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable(),
  pausedAt: isoDateTimeSchema.nullable(),
  currentStep: activationTestStepSchema.nullable(),
  completedStep: activationTestStepSchema.nullable(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().nonnegative(),
  failedStep: activationTestStepSchema.nullable(),
  /** Passo que falhou em linguagem do negocio, vindo pronto do servidor. */
  failedStepLabel: z.string().nullable(),
  failureCode: z.string().nullable(),
  appointmentId: z.string().nullable(),
  channelId: z.string(),
  supersededByChannelChange: z.boolean(),
  cleanupState: z.enum(["PENDING", "CLEAN", "RESIDUAL"]),
  cleanupAt: isoDateTimeSchema.nullable(),
  cleanupResidue: z.array(
    z.object({
      target: z.enum([
        "MESSAGE",
        "CONVERSATION",
        "CONTACT",
        "APPOINTMENT",
        "CUSTOMER",
      ]),
      id: z.string(),
      reason: z.enum([
        "OPERATION_UNAVAILABLE",
        "WOULD_TOUCH_OTHER_ROWS",
        "REMOVAL_FAILED",
        "STILL_VISIBLE",
      ]),
      label: z.string(),
      explanation: z.string(),
    }),
  ),
  milestones: z.array(
    z.object({
      milestone: activationTestMilestoneNameSchema,
      reached: z.boolean(),
      reachedAt: isoDateTimeSchema.nullable(),
      sourceKind: z
        .enum(["MESSAGE", "SERVICE", "AVAILABILITY", "APPOINTMENT"])
        .nullable(),
      sourceId: z.string().nullable(),
    }),
  ),
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
  // Semana local corrente (segunda a domingo, incluindo dias ja passados),
  // para "Esta semana" (Goal074).
  appointmentsThisWeek: z.number().int().nonnegative(),
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
      // Contadores da semana local corrente (segunda a domingo, incluindo
      // dias ja passados), para "Esta semana" (Goal074).
      aiAppointmentsThisWeek: z.number().int().nonnegative(),
      automatedConversationsToday: z.number().int().nonnegative(),
      conversationsTakenOverThisWeek: z.number().int().nonnegative(),
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

// GET /v1/whatsapp/qr (Goal071/WU-01): leitura do QR corrente enquanto a
// vinculação por QR está em curso. `qrcode: null` tanto quando o número já
// está conectado/logado (o marcador foi limpo) quanto quando a Evolution não
// tem QR disponível agora — os dois são resposta válida, não erro.
export const whatsappQrResultSchema = z.object({
  connection: whatsappConnectionSchema,
  qrcode: z.string().nullable(),
});

// --- Status honesto de WhatsApp e IA (Goal014) ------------------------------
// Read model dedicado de `GET /v1/status`: nunca deduz de configuração salva,
// só do que a verificação desta requisição encontrou. Ver PUBLIC_API_V1.md.
export const whatsappStatusValueSchema = z.enum([
  "CONNECTED",
  "DISCONNECTED",
  "UNKNOWN",
]);
export const aiStateValueSchema = z.enum([
  "ACTIVE",
  "OFF",
  "PENDING",
  "UNKNOWN",
]);
// O que a reconciliação desired/effective fez nesta requisição (Goal019 §7).
// Sempre presente: a reconciliação nunca lança, então toda leitura de
// `GET /v1/status` computa um valor, mesmo quando ela falha (`FAILED`).
export const aiReconciledValueSchema = z.enum([
  "NOOP",
  "ACTIVATED",
  "DEACTIVATED_BY_CHANNEL_CHANGE",
  "CONVERGED",
  "FAILED",
  "UNKNOWN",
]);

// --- Ciclo de vida da conta (Goal025/WU-03) ---------------------------------
// `NONE` é o negócio que nunca pediu exclusão; `CANCELLED` também admite pedir
// de novo (a mesma linha é reescrita). Ver PUBLIC_API_V1.md.
export const accountDeletionStatusSchema = z.enum([
  "NONE",
  "SCHEDULED",
  "CANCELLED",
  "PURGED",
]);
export const accountDeletionStateSchema = z.object({
  status: accountDeletionStatusSchema,
  dueAt: isoDateTimeSchema.nullable(),
});
// `POST`/`DELETE /v1/account/deletion` sempre gravam algo antes de responder:
// `dueAt` nunca é `null` na resposta dessas duas rotas, diferente da leitura
// de `GET /v1/status` (que também cobre o negócio sem pedido nenhum).
export const accountDeletionResultSchema = z.object({
  status: accountDeletionStatusSchema,
  dueAt: isoDateTimeSchema,
});
export type AccountDeletionStatus = z.infer<typeof accountDeletionStatusSchema>;
export type AccountDeletionState = z.infer<typeof accountDeletionStateSchema>;

// `PATCH /v1/account/profile` (Goal067): grava só o nome do dono da conta.
export const accountProfileResultSchema = z.object({ user: userSchema });
export type AccountProfileResult = z.infer<typeof accountProfileResultSchema>;

export const systemStatusSchema = z.object({
  whatsapp: z.object({
    status: whatsappStatusValueSchema,
    phoneNumber: z.string().nullable(),
    checkedAt: z.string(),
  }),
  ai: z.object({
    desiredEnabled: z.boolean(),
    effectiveEnabled: z.boolean().nullable(),
    state: aiStateValueSchema,
    reconciled: aiReconciledValueSchema,
  }),
  accountDeletion: accountDeletionStateSchema,
  degraded: z.boolean(),
});
export type WhatsAppStatusValue = z.infer<typeof whatsappStatusValueSchema>;
export type AiStateValue = z.infer<typeof aiStateValueSchema>;
export type AiReconciledValue = z.infer<typeof aiReconciledValueSchema>;
export type SystemStatus = z.infer<typeof systemStatusSchema>;

// --- Central de notificacoes e alertas persistentes (Goal022/WU-04) --------
// `kind`, `level` e `shape` sao vocabulario fechado do dono (BFF): recusar um
// valor desconhecido em vez de deixá-lo passar como texto livre é o mesmo
// princípio já aplicado ao estado de envio de lembretes
// (`appointmentNotificationKindSchema` etc.) — a tela nunca renderiza espécie
// que o produto não reconhece em silêncio.
export const notificationKindSchema = z.enum([
  "CUSTOMER_WAITING_HUMAN",
  "REMINDER_FAILED",
  "IMPORT_COMPLETED",
  "AI_APPOINTMENT_CREATED",
  "WHATSAPP_DISCONNECTED",
  "AI_UNAVAILABLE",
  "SETUP_INCOMPLETE",
  "AI_ACTIVATED",
]);
export const notificationLevelSchema = z.enum(["INFO", "ATTENTION", "CRITICAL"]);
export const notificationShapeSchema = z.enum(["EVENT", "CONDITION"]);

export const notificationSchema = z.object({
  id: z.string().min(1),
  kind: notificationKindSchema,
  level: notificationLevelSchema,
  shape: notificationShapeSchema,
  subjectId: z.string().nullable(),
  occurredAt: z.string(),
  readAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  // Copy pronta por espécie; nunca telefone, credencial ou payload cru do
  // dono (PUBLIC_API_V1.md) — a forma exata varia por `kind`, então aqui é
  // só o que sobrevive à validação do dono.
  payload: z.unknown(),
});

export const notificationListSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  items: z.array(notificationSchema),
});

export const notificationSummarySchema = z.object({
  byLevel: z.object({
    INFO: z.number().int().nonnegative(),
    ATTENTION: z.number().int().nonnegative(),
    CRITICAL: z.number().int().nonnegative(),
  }),
  unreadCount: z.number().int().nonnegative(),
  openConditionsCount: z.number().int().nonnegative(),
});

export const notificationMarkReadResultSchema = z.object({
  updated: z.number().int().nonnegative(),
});

export const notificationPreferencesSchema = z.object({
  aiAppointmentCreated: z.boolean(),
});

export type NotificationKind = z.infer<typeof notificationKindSchema>;
export type NotificationLevel = z.infer<typeof notificationLevelSchema>;
export type NotificationShape = z.infer<typeof notificationShapeSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationList = z.infer<typeof notificationListSchema>;
export type NotificationSummary = z.infer<typeof notificationSummarySchema>;
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;

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

// `GET /v1/knowledge/other-info` (Goal067): leitura do campo livre "Outras
// informações importantes". Vazio (`""`) quando o negócio nunca salvou nada.
export const otherInfoResultSchema = z.object({ content: z.string() });
export type OtherInfoResult = z.infer<typeof otherInfoResultSchema>;

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
export type BusinessModality = z.infer<typeof businessModalitySchema>;
export type BusinessContextProjectionStatus = z.infer<
  typeof businessContextProjectionStatusSchema
>;
export type Appointment = z.infer<typeof appointmentSchema>;
export type AppointmentLifecycle = z.infer<typeof appointmentLifecycleSchema>;
export type AppointmentEvent = z.infer<typeof appointmentEventSchema>;
export type AppointmentNotificationKind = z.infer<
  typeof appointmentNotificationKindSchema
>;
export type AppointmentNotificationSlot = z.infer<
  typeof appointmentNotificationSlotSchema
>;
export type AppointmentNotificationState = z.infer<
  typeof appointmentNotificationStateSchema
>;
export type AppointmentNotificationReason = z.infer<
  typeof appointmentNotificationReasonSchema
>;
export type AppointmentNotification = z.infer<
  typeof appointmentNotificationSchema
>;
export type AppointmentHold = z.infer<typeof appointmentHoldSchema>;
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;
export type AvailabilitySettings = z.infer<typeof availabilitySettingsSchema>;
export type ReminderSlot = z.infer<typeof reminderSlotSchema>;
export type ReminderPricePolicy = z.infer<typeof reminderPricePolicySchema>;
export type ReminderRule = z.infer<typeof reminderRuleSchema>;
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;
export type RetentionDays = z.infer<typeof retentionDaysSchema>;
export type RetentionSettings = z.infer<typeof retentionSettingsSchema>;
export type AgendaInitialView = z.infer<typeof agendaInitialViewSchema>;
export type AgendaViewPreference = z.infer<typeof agendaViewPreferenceSchema>;
export type CalendarSource = z.infer<typeof calendarSourceSchema>;
export type CalendarState = z.infer<typeof calendarStateSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type SessionCategory = z.infer<typeof sessionCategorySchema>;
export type Customer = z.infer<typeof customerSchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
export type CustomerAppointmentSummary = z.infer<
  typeof customerAppointmentSummarySchema
>;
export type CustomerAppointmentStats = z.infer<
  typeof customerAppointmentStatsSchema
>;
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
// Substitui a migracao bidirecional como caminho de produto. Aqui nao ha
// tela (Goal019): so o contrato que a camada de dados precisa entender.
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

// Causa nao-de-item de uma falha de trabalho (Goal061 §3), conjunto fechado:
// a mensagem nunca sai daqui, so o codigo.
export const importWorkErrorCodeSchema = z.enum([
  "IMPORT_SOURCE_AUTH_REJECTED",
  "IMPORT_SOURCE_UNAVAILABLE",
  "IMPORT_SOURCE_INVALID_RESPONSE",
  "IMPORT_PREVIEW_STALE",
  "IMPORT_INTERNAL_ERROR",
]);
export const importLastErrorSchema = z
  .object({ code: importWorkErrorCodeSchema })
  .nullable();

// Resposta de inicio de `POST .../analyze` e `POST .../execute` (Goal061
// §1): so o que a reivindicacao do lease gravou, sob `202`. O preview e o
// andamento sao lidos por rota propria, nunca aqui.
export const importWorkStartSchema = z.object({
  sessionId: z.string().min(1),
  status: z.enum(["ANALYZING", "EXECUTING"]),
  previewVersion: z.number().int().nonnegative(),
});

// Grade semanal da grade vigente/proposta num item de disponibilidade
// (Goal062 §2): mesma forma de `availabilityRuleSchema`, sem `id`/`active` —
// aqui é só o que a comparação de troca precisa mostrar.
export const importAvailabilityGridRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
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
  // Grade vigente do negócio e grade proposta pela origem (Goal062 §2):
  // presentes só nos itens de `category: "AVAILABILITY"`, ausentes em toda
  // outra categoria. `proposedAvailability` é `null` quando a análise não
  // gravou grade (sobreposição, registro ilegível).
  currentAvailability: z.array(importAvailabilityGridRuleSchema).optional(),
  proposedAvailability: z
    .array(importAvailabilityGridRuleSchema)
    .nullable()
    .optional(),
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

// Leitura do preview gravado pela ultima analise (Goal061 §4), sem tocar a
// origem: `GET .../preview`. Sem `changesSincePreviousVersion` — nao e
// gravado hoje, entao esta rota nunca o devolve.
export const importPreviewSnapshotSchema = z.object({
  sessionId: z.string().min(1),
  previewVersion: z.number().int().nonnegative(),
  generatedAt: isoDateTimeSchema.nullable(),
  categories: z.array(importPreviewCategorySchema),
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

// Motivos das falhas `FAILED` desta categoria, contados (Goal061 §4).
const importCategoryFailedReasonSchema = z.object({
  reasonCode: z.string().min(1),
  count: z.number().int().nonnegative(),
});
const importProgressCategorySchema = importCategoryCountsSchema.extend({
  failedReasons: z.array(importCategoryFailedReasonSchema),
});

export const importProgressSchema = z.object({
  sessionId: z.string().min(1),
  status: importSessionStatusSchema,
  previewVersion: z.number().int().nonnegative(),
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  // Sessao `ANALYZING`/`EXECUTING` com lease vencido pelo relogio do banco,
  // ou sem lease (Goal061 §4). O frontend nunca compara relogio proprio.
  interrupted: z.boolean(),
  lastError: importLastErrorSchema,
  counts: importCountsSchema,
  categories: z.array(importProgressCategorySchema),
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

// --- Estado da importação e seleção de categoria (Goal020, WU-003/WU-004) --
// Espelham `GET /v1/calendar/imports` e `POST .../categories/:category/
// selection` em PUBLIC_API_V1.md: leitura pura do direito/sessão/histórico e
// a marcação de categoria, que não muda `previewVersion` nem os itens.
export const importRightSchema = z.object({
  available: z.boolean(),
  sessionId: z.string().nullable(),
  completedAt: isoDateTimeSchema.nullable(),
});

const importLiveSessionCategorySchema = importCategoryCountsSchema.extend({
  selected: z.boolean(),
});

export const importLiveSessionSchema = z.object({
  sessionId: z.string().min(1),
  status: importSessionStatusSchema,
  previewVersion: z.number().int().nonnegative(),
  provider: z.enum(["MINHA_AGENDA"]),
  sourceAccountId: z.string().min(1),
  sourceAccountLabel: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  previewGeneratedAt: isoDateTimeSchema.nullable(),
  // Mesmo par de `importProgressSchema` (Goal061 §4), por acrescimo: a tela
  // sabe o que mostrar ja ao montar, sem esperar a rota de progresso.
  interrupted: z.boolean(),
  lastError: importLastErrorSchema,
  counts: importCountsSchema,
  categories: z.array(importLiveSessionCategorySchema),
});

export const importHistorySchema = importCompletionSchema.extend({
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
});

export const importStateSchema = z.object({
  right: importRightSchema,
  session: importLiveSessionSchema.nullable(),
  history: importHistorySchema.nullable(),
});

export const importCategorySelectionResultSchema = z.object({
  sessionId: z.string().min(1),
  category: importCategorySchema,
  selected: z.boolean(),
});

export type ImportCategory = z.infer<typeof importCategorySchema>;
export type ImportItemStatus = z.infer<typeof importItemStatusSchema>;
export type ImportSessionStatus = z.infer<typeof importSessionStatusSchema>;
export type ImportDecisionScope = z.infer<typeof importDecisionScopeSchema>;
export type ImportDecisionKind = z.infer<typeof importDecisionKindSchema>;
export type ImportSessionStart = z.infer<typeof importSessionStartSchema>;
export type ImportWorkErrorCode = z.infer<typeof importWorkErrorCodeSchema>;
export type ImportWorkStart = z.infer<typeof importWorkStartSchema>;
export type ImportAvailabilityGridRule = z.infer<
  typeof importAvailabilityGridRuleSchema
>;
export type ImportItem = z.infer<typeof importItemSchema>;
export type ImportPreview = z.infer<typeof importPreviewSchema>;
export type ImportPreviewSnapshot = z.infer<typeof importPreviewSnapshotSchema>;
export type ImportPreviewCategory = z.infer<typeof importPreviewCategorySchema>;
export type ImportItemsPage = z.infer<typeof importItemsPageSchema>;
export type ImportDecision = z.infer<typeof importDecisionSchema>;
export type ImportExecution = z.infer<typeof importExecutionSchema>;
export type ImportProgress = z.infer<typeof importProgressSchema>;
export type ImportCompletion = z.infer<typeof importCompletionSchema>;
export type ImportRight = z.infer<typeof importRightSchema>;
export type ImportLiveSession = z.infer<typeof importLiveSessionSchema>;
export type ImportHistory = z.infer<typeof importHistorySchema>;
export type ImportState = z.infer<typeof importStateSchema>;
export type ImportCategorySelectionResult = z.infer<
  typeof importCategorySelectionResultSchema
>;
export type IgnoredContact = z.infer<typeof ignoredContactSchema>;
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
export type ActivationTestRun = z.infer<typeof activationTestRunSchema>;
export type ActivationTestMilestoneName = z.infer<
  typeof activationTestMilestoneNameSchema
>;
export type ActivationTestMilestone = ActivationTestRun["milestones"][number];
export type ActivationTestResidueItem =
  ActivationTestRun["cleanupResidue"][number];
