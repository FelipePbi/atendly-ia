/**
 * Central de notificações e alertas persistentes (Goal022).
 *
 * Persistência e motor de reconciliação. As rotas públicas da central
 * consomem o que está aqui; a materialização não tem entrada própria — ela
 * acontece dentro de requisição que já existe.
 */
export {
  aiAppointmentCursor,
  type AiCreatedEventEntry,
  type AwaitingHumanEntry,
  type ConditionPlan,
  type FailedIntentEntry,
  type ImportHistoryEntry,
  planAiAppointmentCreated,
  planAwaitingHuman,
  planImportCompleted,
  planReminderFailed,
  planSetupIncomplete,
  planStatusConditions,
  type StatusAi,
  type StatusWhatsApp,
} from "./plan.js";
export {
  type NotificationReconcileDeps,
  type NotificationReconciliation,
  type NotificationSource,
  reconcileNotificationCenter,
  reconcileStatusConditions,
} from "./reconcile.js";
export {
  aiAppointmentDedupeKey,
  conversationDedupeKey,
  importSessionDedupeKey,
  NOTIFICATION_KINDS,
  NOTIFICATION_SPECIES,
  type NotificationDraft,
  notificationLevel,
  notificationShape,
  reminderIntentDedupeKey,
  tenantConditionDedupeKey,
} from "./species.js";
export {
  loadPreferences,
  loadSyncState,
  materialize,
  type MaterializeResult,
  type NotificationPrisma,
  type NotificationSyncStateRecord,
  resolveConditionsExcept,
  resolveTenantConditions,
  saveSyncState,
} from "./store.js";
