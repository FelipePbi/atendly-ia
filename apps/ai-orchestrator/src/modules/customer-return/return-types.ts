import { z } from "zod";

/**
 * Contrato da rodada de retorno com o dono da agenda (D-202), decodificado
 * de forma estrita: fato que nao casa com o contrato e resposta invalida,
 * nunca uma mensagem montada com campo inventado.
 */

export const RETURN_SKIP_REASONS = [
  "CONTACT_IGNORED",
  "PERSONAL_CONTACT",
  "NOT_ALLOWED_LOCALLY",
  "INVALID_PHONE",
  "REPLIED",
] as const;
export type ReturnSkipReason = (typeof RETURN_SKIP_REASONS)[number];

export const RETURN_FAIL_REASONS = [
  "TRANSPORT_FAILED",
  "TRANSPORT_UNKNOWN",
] as const;
export type ReturnFailReason = (typeof RETURN_FAIL_REASONS)[number];

export type ReturnSettlementOutcome =
  "SENT" | "FAILED" | "SKIPPED" | "DEFERRED";

const slotSchema = z.object({ date: z.string(), time: z.string() });

export const returnHabitSchema = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)),
  bandStart: z.string(),
  bandEnd: z.string(),
  usedWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
  visits: z.number().int().optional(),
});
export type ReturnHabit = z.infer<typeof returnHabitSchema>;

export const returnFactsSchema = z.object({
  kind: z.enum(["RENEWAL", "WINBACK"]),
  followUp: z.boolean(),
  customerId: z.string(),
  customerName: z.string().nullable(),
  customerPhone: z.string(),
  serviceName: z.string().nullable(),
  timezone: z.string(),
  today: z.string(),
  expectedDate: z.string().nullable(),
  intervalDays: z.number().int().nullable(),
  intervalSource: z.string().nullable(),
  lastVisitDate: z.string().nullable(),
  daysSinceLastVisit: z.number().int().nullable(),
  offeredSlots: z.array(slotSchema),
  habit: returnHabitSchema.nullable(),
  incentive: z.string().nullable(),
  messageTemplate: z.string().nullable(),
});
export type ReturnFacts = z.infer<typeof returnFactsSchema>;

export const claimedReturnTargetSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  campaignId: z.string(),
  leaseKind: z.enum(["INITIAL", "FOLLOW_UP"]),
  leaseToken: z.string(),
  leaseExpiresAt: z.string(),
  correlationId: z.string(),
  sentAt: z.string().nullable(),
  facts: returnFactsSchema,
});
export type ClaimedReturnTarget = z.infer<typeof claimedReturnTargetSchema>;

export const returnClaimResultSchema = z.object({
  claimed: z.array(claimedReturnTargetSchema),
  skipped: z.number().int(),
  released: z.number().int(),
});
export type ReturnClaimResult = z.infer<typeof returnClaimResultSchema>;

export const returnSettlementSchema = z.object({
  applied: z.boolean(),
  state: z.string(),
  followUpState: z.string().nullable(),
});

export const returnReplySchema = z.object({ applied: z.boolean() });

export const customerReturnStatusSchema = z.object({
  customerId: z.string(),
  blocked: z.boolean(),
  permanent: z.boolean(),
  blockedUntil: z.string().nullable(),
  reason: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
});
export type CustomerReturnStatus = z.infer<typeof customerReturnStatusSchema>;

export interface SettleReturnTargetInput {
  tenantId: string;
  targetId: string;
  leaseToken: string;
  outcome: ReturnSettlementOutcome;
  reason?: ReturnSkipReason | ReturnFailReason | null;
  messageBody?: string | null;
}
