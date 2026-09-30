import { z } from "zod";

import {
  accountDeletionResultSchema,
  accountProfileResultSchema,
  activationTestRunSchema,
  agendaViewPreferenceSchema,
  appointmentEventSchema,
  appointmentHoldSchema,
  appointmentLifecycleSchema,
  appointmentNotificationSchema,
  appointmentSchema,
  availabilityExceptionSchema,
  availabilitySettingsSchema,
  availabilitySlotSchema,
  blockSeriesSchema,
  calendarStateSchema,
  conversationEventSchema,
  conversationSchema,
  conversationSuggestionsSchema,
  customerDetailSchema,
  customerListSchema,
  customerMemorySchema,
  customerNoteSchema,
  customerPrimaryGuardianSchema,
  customerSchema,
  customerSummarySchema,
  customerTagSchema,
  dashboardSchema,
  deletedIdempotentSchema,
  deletedSchema,
  ignoredContactSchema,
  importCategorySelectionResultSchema,
  importCompletionSchema,
  importDecisionSchema,
  importItemsPageSchema,
  importPreviewSnapshotSchema,
  importProgressSchema,
  importSessionStartSchema,
  importStateSchema,
  importWorkStartSchema,
  knowledgeDocumentSchema,
  loginResultSchema,
  messageResultSchema,
  messageSchema,
  notificationListSchema,
  notificationMarkReadResultSchema,
  notificationPreferencesSchema,
  notificationSummarySchema,
  okSchema,
  otherInfoResultSchema,
  onboardingStateSchema,
  registerResultSchema,
  reminderSettingsSchema,
  retentionSettingsSchema,
  seriesOccurrencePreviewSchema,
  serviceAiInstructionSchema,
  serviceListSchema,
  serviceSchema,
  sessionSchema,
  settingsStateSchema,
  systemStatusSchema,
  timeBlockSchema,
  whatsappConnectResultSchema,
  whatsappConnectionSchema,
  whatsappDisconnectResultSchema,
  whatsappQrResultSchema,
} from "./schemas.js";

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface PublicApiRoute {
  /** HTTP method, as registered by `app.<verb>(...)` under `apps/bff/src/modules`. */
  method: HttpMethod;
  /** Path pattern as Fastify registers and returns it via `request.routeOptions.url`. */
  pathPattern: string;
  /** Schema of `data` in the `{ data, requestId }` envelope on a successful response. */
  schema: z.ZodTypeAny;
}

export const publicApiRoutes: readonly PublicApiRoute[] = [
  // account
  { method: "POST", pathPattern: "/v1/account/deletion", schema: accountDeletionResultSchema },
  { method: "DELETE", pathPattern: "/v1/account/deletion", schema: accountDeletionResultSchema },
  { method: "PATCH", pathPattern: "/v1/account/profile", schema: accountProfileResultSchema },

  // activation-test
  { method: "GET", pathPattern: "/v1/activation-test", schema: activationTestRunSchema.nullable() },
  { method: "POST", pathPattern: "/v1/activation-test", schema: activationTestRunSchema },
  { method: "POST", pathPattern: "/v1/activation-test/restart", schema: activationTestRunSchema },

  // auth
  { method: "POST", pathPattern: "/v1/auth/register", schema: registerResultSchema },
  { method: "POST", pathPattern: "/v1/auth/login", schema: loginResultSchema },
  { method: "POST", pathPattern: "/v1/auth/logout", schema: okSchema },
  { method: "GET", pathPattern: "/v1/auth/session", schema: sessionSchema },
  { method: "PATCH", pathPattern: "/v1/auth/password", schema: okSchema },
  { method: "POST", pathPattern: "/v1/auth/forgot-password", schema: messageResultSchema },
  { method: "POST", pathPattern: "/v1/auth/reset-password", schema: okSchema },
  { method: "POST", pathPattern: "/v1/auth/logout-all", schema: okSchema },

  // calendar
  { method: "GET", pathPattern: "/v1/appointments", schema: z.array(appointmentSchema) },
  { method: "GET", pathPattern: "/v1/appointments/:id", schema: appointmentSchema },
  { method: "POST", pathPattern: "/v1/appointments", schema: appointmentSchema },
  { method: "POST", pathPattern: "/v1/appointments/:id/reschedule", schema: appointmentSchema },
  { method: "POST", pathPattern: "/v1/appointments/:id/cancel", schema: appointmentSchema },
  { method: "POST", pathPattern: "/v1/appointments/:id/complete", schema: appointmentLifecycleSchema },
  { method: "POST", pathPattern: "/v1/appointments/:id/no-show", schema: appointmentLifecycleSchema },
  { method: "POST", pathPattern: "/v1/appointments/:id/final-value", schema: appointmentLifecycleSchema },
  { method: "POST", pathPattern: "/v1/appointments/:id/presence", schema: appointmentLifecycleSchema },
  { method: "GET", pathPattern: "/v1/appointments/:id/events", schema: z.array(appointmentEventSchema) },
  { method: "GET", pathPattern: "/v1/appointments/:id/notifications", schema: z.array(appointmentNotificationSchema) },
  { method: "POST", pathPattern: "/v1/holds", schema: appointmentHoldSchema },
  { method: "GET", pathPattern: "/v1/holds", schema: z.array(appointmentHoldSchema) },
  { method: "DELETE", pathPattern: "/v1/holds/:id", schema: appointmentHoldSchema },
  { method: "GET", pathPattern: "/v1/availability", schema: z.array(availabilitySlotSchema) },
  { method: "GET", pathPattern: "/v1/time-blocks", schema: z.array(timeBlockSchema) },
  { method: "POST", pathPattern: "/v1/time-blocks", schema: timeBlockSchema },
  { method: "DELETE", pathPattern: "/v1/time-blocks/:id", schema: deletedSchema },
  { method: "DELETE", pathPattern: "/v1/time-blocks/:id/occurrence", schema: deletedSchema },
  { method: "PATCH", pathPattern: "/v1/time-blocks/:id/occurrence", schema: timeBlockSchema },
  { method: "GET", pathPattern: "/v1/availability-exceptions", schema: z.array(availabilityExceptionSchema) },
  { method: "POST", pathPattern: "/v1/availability-exceptions/extra", schema: availabilityExceptionSchema },
  { method: "POST", pathPattern: "/v1/availability-exceptions/unavailable", schema: availabilityExceptionSchema },
  { method: "DELETE", pathPattern: "/v1/availability-exceptions/:id", schema: deletedSchema },
  { method: "POST", pathPattern: "/v1/block-series", schema: blockSeriesSchema },
  { method: "PATCH", pathPattern: "/v1/block-series/:id/from-date", schema: blockSeriesSchema },
  { method: "DELETE", pathPattern: "/v1/block-series/:id", schema: deletedSchema },
  { method: "POST", pathPattern: "/v1/appointments/series/preview", schema: z.array(seriesOccurrencePreviewSchema) },
  { method: "POST", pathPattern: "/v1/appointments/series/confirm", schema: z.array(appointmentSchema) },
  { method: "GET", pathPattern: "/v1/calendar", schema: calendarStateSchema },
  { method: "POST", pathPattern: "/v1/calendar/integration/connect", schema: calendarStateSchema },
  { method: "POST", pathPattern: "/v1/calendar/integration/reconnect", schema: calendarStateSchema },
  { method: "DELETE", pathPattern: "/v1/calendar/integration", schema: calendarStateSchema },

  // conversations
  { method: "GET", pathPattern: "/v1/conversations", schema: z.array(conversationSchema) },
  { method: "GET", pathPattern: "/v1/conversations/:id", schema: conversationSchema },
  { method: "GET", pathPattern: "/v1/conversations/:id/messages", schema: z.array(messageSchema) },
  { method: "GET", pathPattern: "/v1/conversations/:id/events", schema: z.array(conversationEventSchema) },
  // Raw media bytes (`reply.send(media.body)`); never wrapped in the `{ data, requestId }` envelope.
  { method: "GET", pathPattern: "/v1/conversations/:id/messages/:messageId/media", schema: z.unknown() },
  { method: "POST", pathPattern: "/v1/conversations/:id/messages", schema: messageSchema },
  { method: "PUT", pathPattern: "/v1/conversations/:id/category", schema: conversationSchema },
  { method: "PUT", pathPattern: "/v1/conversations/:id/ignore", schema: conversationSchema },
  { method: "PUT", pathPattern: "/v1/conversations/ignored-contacts", schema: ignoredContactSchema },
  { method: "POST", pathPattern: "/v1/conversations/:id/suggestions", schema: conversationSuggestionsSchema },
  { method: "POST", pathPattern: "/v1/conversations/:id/takeover", schema: conversationSchema },
  { method: "POST", pathPattern: "/v1/conversations/:id/release", schema: conversationSchema },
  { method: "POST", pathPattern: "/v1/conversations/:id/resolve", schema: conversationSchema },

  // customers
  { method: "GET", pathPattern: "/v1/customers", schema: customerListSchema },
  { method: "GET", pathPattern: "/v1/customers/:id", schema: customerDetailSchema },
  { method: "POST", pathPattern: "/v1/customers", schema: customerSchema },
  { method: "PATCH", pathPattern: "/v1/customers/:id", schema: customerSchema },
  { method: "PUT", pathPattern: "/v1/customers/:id/primary-guardian", schema: customerPrimaryGuardianSchema },
  { method: "POST", pathPattern: "/v1/customers/:id/primary-guardian/confirm", schema: customerPrimaryGuardianSchema },
  { method: "DELETE", pathPattern: "/v1/customers/:id/primary-guardian", schema: deletedIdempotentSchema.or(customerPrimaryGuardianSchema) },
  { method: "POST", pathPattern: "/v1/customers/:id/notes", schema: customerNoteSchema },
  { method: "PATCH", pathPattern: "/v1/customers/:id/notes/:childId", schema: customerNoteSchema },
  { method: "DELETE", pathPattern: "/v1/customers/:id/notes/:childId", schema: deletedSchema },
  { method: "POST", pathPattern: "/v1/customers/:id/tags", schema: customerTagSchema },
  { method: "PATCH", pathPattern: "/v1/customers/:id/tags/:childId", schema: customerTagSchema },
  { method: "DELETE", pathPattern: "/v1/customers/:id/tags/:childId", schema: deletedSchema },
  { method: "GET", pathPattern: "/v1/customers/:id/memory", schema: z.array(customerMemorySchema) },
  { method: "POST", pathPattern: "/v1/customers/:id/memory", schema: customerMemorySchema },
  { method: "PATCH", pathPattern: "/v1/customers/:id/memory/:memoryId", schema: customerMemorySchema },
  { method: "DELETE", pathPattern: "/v1/customers/:id/memory/:memoryId", schema: customerMemorySchema },
  { method: "POST", pathPattern: "/v1/customers/:id/summary", schema: customerSummarySchema },

  // dashboard
  { method: "GET", pathPattern: "/v1/dashboard", schema: dashboardSchema },

  // knowledge
  { method: "GET", pathPattern: "/v1/knowledge/documents", schema: z.array(knowledgeDocumentSchema) },
  { method: "POST", pathPattern: "/v1/knowledge/documents", schema: knowledgeDocumentSchema },
  { method: "GET", pathPattern: "/v1/knowledge/documents/:id", schema: knowledgeDocumentSchema },
  { method: "PUT", pathPattern: "/v1/knowledge/documents/:id", schema: knowledgeDocumentSchema },
  { method: "DELETE", pathPattern: "/v1/knowledge/documents/:id", schema: knowledgeDocumentSchema },
  { method: "PUT", pathPattern: "/v1/knowledge/other-info", schema: knowledgeDocumentSchema },
  { method: "GET", pathPattern: "/v1/knowledge/other-info", schema: otherInfoResultSchema },

  // migrations
  { method: "GET", pathPattern: "/v1/calendar/imports", schema: importStateSchema },
  { method: "POST", pathPattern: "/v1/calendar/imports", schema: importSessionStartSchema },
  { method: "POST", pathPattern: "/v1/calendar/imports/:sessionId/analyze", schema: importWorkStartSchema },
  { method: "GET", pathPattern: "/v1/calendar/imports/:sessionId/preview", schema: importPreviewSnapshotSchema },
  { method: "GET", pathPattern: "/v1/calendar/imports/:sessionId/categories/:category/items", schema: importItemsPageSchema },
  { method: "POST", pathPattern: "/v1/calendar/imports/:sessionId/categories/:category/selection", schema: importCategorySelectionResultSchema },
  { method: "POST", pathPattern: "/v1/calendar/imports/:sessionId/items/:itemId/decision", schema: importDecisionSchema },
  { method: "POST", pathPattern: "/v1/calendar/imports/:sessionId/execute", schema: importWorkStartSchema },
  { method: "GET", pathPattern: "/v1/calendar/imports/:sessionId/progress", schema: importProgressSchema },
  { method: "POST", pathPattern: "/v1/calendar/imports/:sessionId/complete", schema: importCompletionSchema },

  // notifications
  { method: "GET", pathPattern: "/v1/notifications", schema: notificationListSchema },
  { method: "GET", pathPattern: "/v1/notifications/summary", schema: notificationSummarySchema },
  { method: "POST", pathPattern: "/v1/notifications/read", schema: notificationMarkReadResultSchema },
  { method: "GET", pathPattern: "/v1/notifications/preferences", schema: notificationPreferencesSchema },
  { method: "PATCH", pathPattern: "/v1/notifications/preferences", schema: notificationPreferencesSchema },

  // onboarding
  { method: "GET", pathPattern: "/v1/onboarding", schema: onboardingStateSchema },
  { method: "PATCH", pathPattern: "/v1/onboarding", schema: onboardingStateSchema },
  { method: "POST", pathPattern: "/v1/onboarding/complete", schema: onboardingStateSchema },

  // retention
  { method: "GET", pathPattern: "/v1/settings/retention", schema: retentionSettingsSchema },
  { method: "PATCH", pathPattern: "/v1/settings/retention", schema: retentionSettingsSchema },

  // services
  { method: "GET", pathPattern: "/v1/services", schema: serviceListSchema },
  { method: "POST", pathPattern: "/v1/services", schema: serviceSchema },
  { method: "PATCH", pathPattern: "/v1/services/:id", schema: serviceSchema },
  { method: "GET", pathPattern: "/v1/services/:id/ai-instruction", schema: serviceAiInstructionSchema },
  { method: "PUT", pathPattern: "/v1/services/:id/ai-instruction", schema: serviceAiInstructionSchema },

  // settings
  { method: "GET", pathPattern: "/v1/settings", schema: settingsStateSchema },
  { method: "PATCH", pathPattern: "/v1/settings/business", schema: settingsStateSchema },
  { method: "PATCH", pathPattern: "/v1/settings/ai", schema: settingsStateSchema },
  { method: "PATCH", pathPattern: "/v1/settings/availability", schema: availabilitySettingsSchema },
  { method: "GET", pathPattern: "/v1/settings/reminders", schema: reminderSettingsSchema },
  { method: "PATCH", pathPattern: "/v1/settings/reminders", schema: reminderSettingsSchema },
  { method: "GET", pathPattern: "/v1/settings/agenda-view", schema: agendaViewPreferenceSchema },
  { method: "PATCH", pathPattern: "/v1/settings/agenda-view", schema: agendaViewPreferenceSchema },

  // status
  { method: "GET", pathPattern: "/v1/status", schema: systemStatusSchema },

  // whatsapp
  { method: "GET", pathPattern: "/v1/whatsapp", schema: whatsappConnectionSchema.nullable() },
  { method: "GET", pathPattern: "/v1/whatsapp/qr", schema: whatsappQrResultSchema },
  { method: "POST", pathPattern: "/v1/whatsapp/connect", schema: whatsappConnectResultSchema },
  { method: "POST", pathPattern: "/v1/whatsapp/reconnect", schema: whatsappConnectResultSchema },
  { method: "DELETE", pathPattern: "/v1/whatsapp", schema: whatsappDisconnectResultSchema },
];

function routeKey(method: HttpMethod, pathPattern: string): string {
  return `${method} ${pathPattern}`;
}

/** Keyed by `${method} ${pathPattern}`, e.g. from `request.method` + `request.routeOptions.url`. */
export const publicApiRoutesByKey: ReadonlyMap<string, PublicApiRoute> = new Map(
  publicApiRoutes.map((route) => [routeKey(route.method, route.pathPattern), route]),
);

export function findPublicApiRoute(
  method: HttpMethod,
  pathPattern: string,
): PublicApiRoute | undefined {
  return publicApiRoutesByKey.get(routeKey(method, pathPattern));
}
