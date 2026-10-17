import type { ActivityKind } from "@avenly-ia/public-api-contract";

/**
 * Tipo de ação do filtro da tela "Atividade" (D-176): cada ação gravada por
 * algum serviço cai em exatamente um tipo. Ação nova que não estiver aqui
 * continua aparecendo sem filtro — só não é alcançada pelo filtro de tipo
 * (o teste do catálogo lembra de classificá-la).
 */
export const ACTIVITY_ACTIONS_BY_KIND: Record<ActivityKind, readonly string[]> = {
  CREATED: [
    "appointment.created",
    "customer.created",
    "customer.note_added",
    "customer.tag_added",
    "customer.memory_added",
    "service.created",
    "agenda.block_created",
    "agenda.block_series_created",
    "agenda.extra_availability_added",
    "agenda.unavailability_added",
    "knowledge.document_created",
    "import.started",
    "import.completed",
    "import.source_connected",
  ],
  CHANGED: [
    "appointment.rescheduled",
    "appointment.completed",
    "appointment.no_show",
    "appointment.final_value_set",
    "appointment.presence_confirmed",
    "customer.updated",
    "customer.guardian_set",
    "customer.guardian_confirmed",
    "customer.note_ai_access",
    "customer.tag_ai_access",
    "customer.memory_ai_access",
    "service.updated",
    "service.reactivated",
    "service.ai_instruction_updated",
    "agenda.block_moved",
    "agenda.block_series_updated",
    "settings.business_updated",
    "settings.ai_enabled",
    "settings.ai_paused",
    "settings.ai_updated",
    "settings.availability_updated",
    "settings.reminders_updated",
    "settings.timezone_updated",
    "settings.notifications_updated",
    "settings.retention_updated",
    "settings.whatsapp_connect_started",
    "account.profile_updated",
    "account.password_changed",
    "account.deletion_cancelled",
    "knowledge.document_updated",
    "knowledge.other_info_updated",
    "conversation.taken_over",
    "conversation.released_to_ai",
    "conversation.handoff_requested",
    "conversation.category_changed",
    "conversation.contact_ignored",
    "conversation.contact_unignored",
    "conversation.resolved",
  ],
  REMOVED: [
    "appointment.cancelled",
    "appointment.deleted",
    "customer.deleted",
    "customer.guardian_cleared",
    "customer.note_deleted",
    "customer.tag_deleted",
    "customer.memory_removed",
    "service.archived",
    "agenda.block_removed",
    "agenda.block_series_removed",
    "agenda.extra_availability_removed",
    "agenda.unavailability_removed",
    "knowledge.document_removed",
    "import.source_disconnected",
    "settings.whatsapp_disconnected",
    "account.deletion_requested",
  ],
};

export function actionsForKinds(kinds: readonly ActivityKind[]): string[] {
  return kinds.flatMap((kind) => ACTIVITY_ACTIONS_BY_KIND[kind]);
}
