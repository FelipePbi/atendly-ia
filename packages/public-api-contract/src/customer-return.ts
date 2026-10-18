import { z } from "zod";

// --- Retorno de clientes: Renovação e Resgate (D-202) ------------------------
// Espelha `/v1/customer-return/*` e `/v1/customers/:id/return-messages` em
// PUBLIC_API_V1.md. Só humano aprova, pausa, cancela e configura; a IA envia
// no ritmo da rodada e conduz a conversa depois da resposta.

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const RETURN_DAILY_LIMIT_MAX = 30;
export const RETURN_MESSAGE_MAX_LENGTH = 600;
export const RETURN_INCENTIVE_MAX_LENGTH = 300;
export const RETURN_WINBACK_DAY_OPTIONS = [30, 45, 60, 90, 120] as const;

/** Campos do texto-base: trocados pelos dados de cada cliente no envio. */
export const RETURN_MESSAGE_FIELDS = [
  "nome",
  "servico",
  "quando",
  "horarios",
  "incentivo",
] as const;

export type ReturnMessageIssue =
  | { id: "TOO_LONG" }
  | { id: "UNKNOWN_FIELD"; field: string }
  | { id: "WRITTEN_DATE" }
  | { id: "WRITTEN_TIME" };

const FIELD = /\{([^{}]*)\}/g;
// Data e horário escritos à mão sairiam iguais para toda cliente: são os
// fatos que só a agenda pode dizer (`{quando}` e `{horarios}`).
const WRITTEN_DATE = /(^|[^\d])\d{1,2}\/\d{1,2}(?!\d)/;
const WRITTEN_TIME = /(^|[^\d])\d{1,2}(?::\d{2}|h\d{0,2})(?![\p{L}\d])/iu;

/** O primeiro problema do texto-base, ou `null` quando ele pode ser gravado. */
export function returnMessageIssue(text: string): ReturnMessageIssue | null {
  const trimmed = text.trim();
  if (trimmed.length > RETURN_MESSAGE_MAX_LENGTH) return { id: "TOO_LONG" };
  for (const match of trimmed.matchAll(FIELD)) {
    const field = match[1];
    if (!(RETURN_MESSAGE_FIELDS as readonly string[]).includes(field)) {
      return { id: "UNKNOWN_FIELD", field };
    }
  }
  const withoutFields = trimmed.replace(FIELD, " ");
  if (WRITTEN_DATE.test(withoutFields)) return { id: "WRITTEN_DATE" };
  if (WRITTEN_TIME.test(withoutFields)) return { id: "WRITTEN_TIME" };
  return null;
}

/** Texto-base no corpo: ausente mantém, `null` ou vazio volta ao padrão. */
export const returnMessageInputSchema = z
  .string()
  .nullable()
  .superRefine((value, context) => {
    if (value === null) return;
    const issue = returnMessageIssue(value);
    if (issue) {
      context.addIssue({
        code: "custom",
        message: `Return message is invalid (${issue.id}).`,
      });
    }
  });

export const returnKindSchema = z.enum(["RENEWAL", "WINBACK"]);

export const returnSettingsSchema = z.object({
  /** `false` quando o negócio nunca gravou: vale o padrão do produto. */
  configured: z.boolean(),
  dailyLimit: z.number().int().min(1).max(RETURN_DAILY_LIMIT_MAX),
  windowDays: z.array(z.number().int().min(0).max(6)),
  windowStart: clockSchema,
  windowEnd: clockSchema,
  leadDays: z.number().int().min(1).max(5),
  winbackDays: z.number().int().min(14).max(365),
  winbackIncentive: z.string().nullable(),
  renewalMessage: z.string().nullable(),
  winbackMessage: z.string().nullable(),
});

export const returnSettingsInputSchema = z
  .object({
    dailyLimit: z.number().int().min(1).max(RETURN_DAILY_LIMIT_MAX).optional(),
    windowDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .optional(),
    windowStart: clockSchema.optional(),
    windowEnd: clockSchema.optional(),
    leadDays: z.number().int().min(1).max(5).optional(),
    winbackDays: z.number().int().min(14).max(365).optional(),
    winbackIncentive: z
      .string()
      .trim()
      .max(RETURN_INCENTIVE_MAX_LENGTH)
      .nullable()
      .optional(),
    renewalMessage: returnMessageInputSchema.optional(),
    winbackMessage: returnMessageInputSchema.optional(),
  })
  .strict();

export const returnHabitSchema = z.object({
  /** Dias de costume (0 = domingo); vazio quando não há dia claro. */
  weekdays: z.array(z.number().int().min(0).max(6)),
  bandStart: clockSchema,
  bandEnd: clockSchema,
});

export const returnCandidateSchema = z.object({
  customerId: z.string(),
  name: z.string().nullable(),
  phone: z.string(),
  serviceName: z.string().nullable(),
  /** Renovação: data esperada de volta. Resgate: nulo. */
  expectedDate: dateSchema.nullable(),
  intervalDays: z.number().int().nullable(),
  /** De onde veio o prazo: do serviço ou da média da própria cliente. */
  intervalSource: z.enum(["SERVICE", "AVERAGE"]).nullable(),
  lastVisitDate: dateSchema,
  daysSinceLastVisit: z.number().int(),
  /** Último dia em que a mensagem ainda pode sair; nulo sem prazo. */
  sendBy: dateSchema.nullable(),
  habit: returnHabitSchema.nullable(),
});

export const returnExclusionCountsSchema = z.object({
  deactivated: z.number().int().nonnegative(),
  noPhone: z.number().int().nonnegative(),
  futureAppointment: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  recentlyContacted: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  /** Contato ignorado na IA. */
  ignored: z.number().int().nonnegative(),
  /** Conversa marcada como pessoal. */
  personal: z.number().int().nonnegative(),
});

export const returnCandidateListSchema = z.object({
  kind: returnKindSchema,
  timezone: z.string(),
  today: dateSchema,
  weekStart: dateSchema.nullable(),
  weekEnd: dateSchema.nullable(),
  days: z.number().int().nullable(),
  candidates: z.array(returnCandidateSchema),
  excluded: returnExclusionCountsSchema,
});

export const returnPlanInputSchema = z.object({
  kind: returnKindSchema,
  week: z.enum(["this", "next"]).optional(),
  days: z.number().int().min(14).max(365).optional(),
  customerIds: z.array(z.string().min(1).max(128)).min(1).max(500),
  dailyLimit: z.number().int().min(1).max(RETURN_DAILY_LIMIT_MAX).optional(),
});

export const returnCampaignInputSchema = returnPlanInputSchema.extend({
  acceptNotFitting: z.boolean().optional(),
});

export const returnPlanSchema = z.object({
  dailyLimit: z.number().int(),
  total: z.number().int(),
  /** Clientes que não cabem no limite antes da própria data. */
  notFitting: z.array(z.string()),
  /** Menor limite diário (até 30) em que todas cabem; nulo se nem 30 basta. */
  minimumDailyLimit: z.number().int().nullable(),
  lastPlannedDate: dateSchema.nullable(),
});

export const returnCampaignStateSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "DONE",
  "CANCELLED",
]);
export const returnTargetStateSchema = z.enum([
  "QUEUED",
  "CLAIMED",
  "SENT",
  "REPLIED",
  "BOOKED",
  "DECLINED",
  "SKIPPED",
  "FAILED",
]);

export const returnCampaignCountsSchema = z.object({
  total: z.number().int(),
  queued: z.number().int(),
  sent: z.number().int(),
  replied: z.number().int(),
  booked: z.number().int(),
  declined: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  /** Faturado dos atendimentos marcados pela rodada e já concluídos. */
  revenue: z.number(),
});

export const returnCampaignSummarySchema = z.object({
  id: z.string(),
  kind: returnKindSchema,
  state: returnCampaignStateSchema,
  dailyLimit: z.number().int(),
  incentive: z.string().nullable(),
  weekStart: dateSchema.nullable(),
  winbackDays: z.number().int().nullable(),
  createdAt: isoDateTimeSchema,
  pausedAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  counts: returnCampaignCountsSchema,
});

export const returnTargetSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  customerName: z.string().nullable(),
  state: returnTargetStateSchema,
  reason: z.string().nullable(),
  serviceName: z.string().nullable(),
  expectedDate: dateSchema.nullable(),
  lastVisitDate: dateSchema.nullable(),
  sendBy: dateSchema.nullable(),
  plannedDate: dateSchema.nullable(),
  sentAt: isoDateTimeSchema.nullable(),
  repliedAt: isoDateTimeSchema.nullable(),
  bookedAt: isoDateTimeSchema.nullable(),
  appointmentId: z.string().nullable(),
  followUpState: z.string().nullable(),
  followUpSentAt: isoDateTimeSchema.nullable(),
  offeredSlots: z.array(z.object({ date: dateSchema, time: z.string() })),
  messageBody: z.string().nullable(),
});

export const returnCampaignListSchema = z.array(returnCampaignSummarySchema);

export const returnCampaignDetailSchema = returnCampaignSummarySchema.extend({
  messageTemplate: z.string().nullable(),
  targets: z.array(returnTargetSchema),
});

export const customerReturnStatusSchema = z.object({
  customerId: z.string(),
  blocked: z.boolean(),
  /** Bloqueio sem data: a cliente pediu para parar, ou a profissional bloqueou. */
  permanent: z.boolean(),
  blockedUntil: isoDateTimeSchema.nullable(),
  reason: z.enum(["DECLINED", "STOPPED", "OWNER"]).nullable(),
  lastMessageAt: isoDateTimeSchema.nullable(),
});

export const customerReturnStatusInputSchema = z
  .object({ blocked: z.boolean() })
  .strict();

export type ReturnKind = z.infer<typeof returnKindSchema>;
export type ReturnSettings = z.infer<typeof returnSettingsSchema>;
export type ReturnSettingsInput = z.infer<typeof returnSettingsInputSchema>;
export type ReturnHabit = z.infer<typeof returnHabitSchema>;
export type ReturnCandidate = z.infer<typeof returnCandidateSchema>;
export type ReturnExclusionCounts = z.infer<typeof returnExclusionCountsSchema>;
export type ReturnCandidateList = z.infer<typeof returnCandidateListSchema>;
export type ReturnPlanInput = z.infer<typeof returnPlanInputSchema>;
export type ReturnCampaignInput = z.infer<typeof returnCampaignInputSchema>;
export type ReturnPlan = z.infer<typeof returnPlanSchema>;
export type ReturnCampaignState = z.infer<typeof returnCampaignStateSchema>;
export type ReturnTargetState = z.infer<typeof returnTargetStateSchema>;
export type ReturnCampaignCounts = z.infer<typeof returnCampaignCountsSchema>;
export type ReturnCampaignSummary = z.infer<typeof returnCampaignSummarySchema>;
export type ReturnTarget = z.infer<typeof returnTargetSchema>;
export type ReturnCampaignDetail = z.infer<typeof returnCampaignDetailSchema>;
export type CustomerReturnStatus = z.infer<typeof customerReturnStatusSchema>;
