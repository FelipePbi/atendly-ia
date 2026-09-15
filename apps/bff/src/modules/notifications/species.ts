import type {
  NotificationKind,
  NotificationLevel,
  NotificationShape,
} from "../../generated/prisma/enums.js";

/**
 * As sete espécies da central (Goal022 §3), com nível e forma **derivados do
 * `kind` por tabela fixa**.
 *
 * `level` não é coluna livre nem escolha de quem materializa: é esta tabela, e
 * só ela. Quem cria a notificação informa o fato; o produto decide se aquilo é
 * informativo, atenção ou crítico. Mudar o nível de uma espécie é mudar uma
 * linha aqui, não caçar chamadores.
 *
 * `shape` distingue o que aconteceu (`EVENT`, fica no histórico) do que está
 * acontecendo (`CONDITION`, abre e depois resolve). Só `CONDITION` recebe
 * `resolvedAt`.
 */
export const NOTIFICATION_SPECIES: Record<
  NotificationKind,
  { level: NotificationLevel; shape: NotificationShape }
> = {
  CUSTOMER_WAITING_HUMAN: { level: "ATTENTION", shape: "CONDITION" },
  REMINDER_FAILED: { level: "ATTENTION", shape: "EVENT" },
  IMPORT_COMPLETED: { level: "INFO", shape: "EVENT" },
  AI_APPOINTMENT_CREATED: { level: "INFO", shape: "EVENT" },
  WHATSAPP_DISCONNECTED: { level: "CRITICAL", shape: "CONDITION" },
  AI_UNAVAILABLE: { level: "CRITICAL", shape: "CONDITION" },
  SETUP_INCOMPLETE: { level: "ATTENTION", shape: "CONDITION" },
};

export const NOTIFICATION_KINDS = Object.keys(
  NOTIFICATION_SPECIES,
) as NotificationKind[];

export function notificationLevel(kind: NotificationKind): NotificationLevel {
  return NOTIFICATION_SPECIES[kind].level;
}

export function notificationShape(kind: NotificationKind): NotificationShape {
  return NOTIFICATION_SPECIES[kind].shape;
}

/**
 * Chave de dedupe: a identidade do **fato no dono**, nunca `now()`, nunca
 * contador local, nunca o texto exibido.
 *
 * `CUSTOMER_WAITING_HUMAN` deduplica pela **conversa**, e não pela linha de
 * handoff: a IA pode gravar mais de um `Handoff` OPEN para a mesma conversa, e
 * uma conversa esperando é uma notificação.
 */
export function conversationDedupeKey(conversationId: string): string {
  return `CUSTOMER_WAITING_HUMAN:conversation:${conversationId}`;
}

export function reminderIntentDedupeKey(intentId: string): string {
  return `REMINDER_FAILED:intent:${intentId}`;
}

export function importSessionDedupeKey(sessionId: string): string {
  return `IMPORT_COMPLETED:session:${sessionId}`;
}

/** `sequence` do `AppointmentEvent`: único e monotônico no dono. */
export function aiAppointmentDedupeKey(sequence: string): string {
  return `AI_APPOINTMENT_CREATED:event:${sequence}`;
}

/**
 * Condições que valem para o negócio inteiro: a identidade é o par
 * tenant+espécie, e o tenant já está na chave única da tabela.
 */
export function tenantConditionDedupeKey(kind: NotificationKind): string {
  return `${kind}:tenant`;
}

/**
 * Uma notificação a materializar. `payload` guarda só o que a copy e o link
 * precisam — nunca telefone cru, credencial, `facts`, `leaseToken` ou payload
 * bruto do dono.
 */
export interface NotificationDraft {
  kind: NotificationKind;
  dedupeKey: string;
  subjectId: string | null;
  occurredAt: Date;
  payload: Record<string, unknown>;
}
