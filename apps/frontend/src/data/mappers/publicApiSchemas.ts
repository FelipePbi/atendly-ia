import { z } from "zod";

export const calendarSourceSchema = z.enum(["ATENDLY", "EXTERNAL"]);
export const aiToneSchema = z.enum(["PROFESSIONAL_OBJECTIVE", "LIGHT_CLOSE"]);

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
  status: z.string(),
});

export const availabilitySlotSchema = z.object({
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
});

export const timeBlockSchema = z.object({
  id: z.string().min(1),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  reason: z.string().nullable(),
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

export type AiTone = z.infer<typeof aiToneSchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
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
export type Migration = z.infer<typeof migrationSchema>;
export type MigrationDiagnosis = z.infer<typeof migrationDiagnosisSchema>;
export type MigrationStart = z.infer<typeof migrationStartSchema>;
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type ServiceList = z.infer<typeof serviceListSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SettingsState = z.infer<typeof settingsStateSchema>;
export type TimeBlock = z.infer<typeof timeBlockSchema>;
export type WhatsAppConnection = z.infer<typeof whatsappConnectionSchema>;
