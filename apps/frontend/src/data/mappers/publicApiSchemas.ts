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
      durationMinutes: z.number().int().positive(),
      priceType: z.enum(["FIXED", "ON_REQUEST"]),
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

export const serviceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  durationMinutes: z.number().int().positive(),
  priceType: z.enum(["FIXED", "ON_REQUEST"]),
  price: z.number().nonnegative().nullable(),
  active: z.boolean(),
});

export const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
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
      durationMinutes: z.number().int().positive(),
      priceType: z.enum(["FIXED", "ON_REQUEST"]),
      price: z.number().nonnegative().nullable(),
    }),
  ),
  totalPrice: z.number().nonnegative().nullable(),
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
});

export const conversationSchema = z.object({
  id: z.string().min(1),
  externalContactId: z.string(),
  customerName: z.string().nullable(),
  status: z.enum(["ACTIVE", "HUMAN_HANDOFF", "CLOSED"]),
  humanHandoff: z.boolean(),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  updatedAt: isoDateTimeSchema,
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
      conversationsNeedingAttention: z.number().int().nonnegative(),
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

export const migrationDiagnosisSchema = z.object({
  source: calendarSourceSchema,
  target: calendarSourceSchema,
  services: z.number().int().nonnegative(),
  customers: z.number().int().nonnegative(),
  futureAppointments: z.number().int().nonnegative(),
  supported: z.boolean(),
  issues: z.array(z.string()),
});

export const migrationSchema = z.object({
  id: z.string().min(1),
  source: calendarSourceSchema,
  target: calendarSourceSchema,
  status: z.string(),
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
export type Customer = z.infer<typeof customerSchema>;
export type CustomerList = z.infer<typeof customerListSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Migration = z.infer<typeof migrationSchema>;
export type MigrationDiagnosis = z.infer<typeof migrationDiagnosisSchema>;
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type ServiceList = z.infer<typeof serviceListSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SettingsState = z.infer<typeof settingsStateSchema>;
export type TimeBlock = z.infer<typeof timeBlockSchema>;
export type WhatsAppConnection = z.infer<typeof whatsappConnectionSchema>;
