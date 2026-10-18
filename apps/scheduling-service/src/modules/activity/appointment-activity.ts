import type {
  AppointmentEventSource,
  AppointmentEventType,
  Prisma,
} from "../../generated/prisma/client.js";
import { instantToLocalDateTime } from "../../shared/date-time/calendar-date-time.js";
import {
  type ActivityActor,
  type ActivityChange,
  actorFromSource,
  recordActivity,
} from "./activity-log.js";

type Transaction = Prisma.TransactionClient;

/**
 * Tipo do histórico do atendimento que vira atividade do negócio (D-176).
 * `HOLD_CONSUMED` e `OVERLAP_OVERRIDE` são detalhe interno da mesma mutação
 * que já gerou a atividade; a conclusão automática (`SYSTEM`) e a importação
 * (`INTEGRATION`) não são ato de ninguém e ficam de fora — a importação
 * aparece como uma atividade só, a do resumo.
 */
const ACTION_BY_EVENT: Partial<Record<AppointmentEventType, string>> = {
  CREATED: "appointment.created",
  RESCHEDULED: "appointment.rescheduled",
  CANCELLED: "appointment.cancelled",
  COMPLETED: "appointment.completed",
  NO_SHOW: "appointment.no_show",
  FINAL_VALUE_SET: "appointment.final_value_set",
  PRESENCE_CONFIRMED: "appointment.presence_confirmed",
  DURATION_CHANGED: "appointment.duration_changed",
};

export interface AppointmentActivityEvent {
  type: AppointmentEventType;
  source: AppointmentEventSource;
  actor: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Instante local do negócio, sem fuso: `2026-10-20T14:00`. */
function localStamp(instant: Date, timeZone: string): string {
  const local = instantToLocalDateTime(instant, timeZone);
  return `${local.date}T${local.time}`;
}

function intervalStamp(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const { date, startTime } = value as { date?: unknown; startTime?: unknown };
  return typeof date === "string" && typeof startTime === "string"
    ? `${date}T${startTime}`
    : null;
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

async function tenantTimeZone(
  transaction: Transaction,
  tenantId: string,
): Promise<string> {
  const settings = await transaction.calendarSettings.findUnique({
    where: { tenantId },
    select: { timezone: true },
  });
  return settings?.timezone ?? "America/Sao_Paulo";
}

/** Rótulo e contexto da frase: cliente, serviços e horário local. */
export async function appointmentActivityContext(
  transaction: Transaction,
  tenantId: string,
  appointmentId: string,
): Promise<{
  label: string | null;
  details: Record<string, unknown>;
} | null> {
  const appointment = await transaction.appointment.findUnique({
    where: { tenantId_id: { tenantId, id: appointmentId } },
    select: {
      startAt: true,
      endAt: true,
      title: true,
      customer: { select: { name: true, phone: true } },
      items: { select: { serviceNameSnapshot: true } },
    },
  });
  if (!appointment) return null;
  const timeZone = await tenantTimeZone(transaction, tenantId);
  const customerName =
    appointment.customer.name ?? appointment.customer.phone ?? null;
  return {
    label: customerName,
    details: {
      customerName,
      services: appointment.items.map((item) => item.serviceNameSnapshot),
      title: appointment.title,
      startsAt: localStamp(appointment.startAt, timeZone),
      endsAt: localStamp(appointment.endAt, timeZone),
    },
  };
}

function changesFor(event: AppointmentActivityEvent): ActivityChange[] {
  switch (event.type) {
    case "RESCHEDULED":
      return [
        {
          field: "startsAt",
          before: intervalStamp(event.before),
          after: intervalStamp(event.after),
        },
      ];
    case "CANCELLED":
    case "COMPLETED":
    case "NO_SHOW": {
      const before = field(event.before, "status");
      const after = field(event.after, "status");
      return [
        {
          field: "status",
          before: typeof before === "string" ? before : null,
          after: typeof after === "string" ? after : null,
        },
      ];
    }
    case "DURATION_CHANGED": {
      // A duracao total do atendimento (D-207): "Duracao: 40 min → 1 h".
      const before = field(event.before, "durationMinutes");
      const after = field(event.after, "durationMinutes");
      return [
        {
          field: "durationMinutes",
          before: typeof before === "number" ? before : null,
          after: typeof after === "number" ? after : null,
        },
      ];
    }
    case "FINAL_VALUE_SET": {
      const before = field(event.before, "finalValue");
      const after = field(event.after, "finalValue");
      return [
        {
          field: "finalValue",
          before: typeof before === "number" ? before : null,
          after: typeof after === "number" ? after : null,
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * Atividade de um evento do histórico do atendimento, gravada na mesma
 * transação dele. Chamada por `recordAppointmentEvent`, então todo caminho
 * que muda um atendimento — tela, IA, série — passa por aqui.
 */
export async function recordAppointmentActivity(
  transaction: Transaction,
  tenantId: string,
  appointmentId: string,
  event: AppointmentActivityEvent,
): Promise<void> {
  const action = ACTION_BY_EVENT[event.type];
  if (!action) return;
  const actor = actorFromSource(event.source, event.actor);
  if (!actor) return;
  const context = await appointmentActivityContext(
    transaction,
    tenantId,
    appointmentId,
  );
  if (!context) return;
  const reason = event.reason?.trim();
  await recordActivity(transaction, tenantId, {
    actor,
    area: "AGENDA",
    action,
    entityType: "appointment",
    entityId: appointmentId,
    entityLabel: context.label,
    changes: changesFor(event),
    details: {
      ...context.details,
      ...(reason && event.type === "CANCELLED" ? { reason } : {}),
    },
  });
}

/** Remoção definitiva: o contexto é lido antes de o atendimento sumir. */
export async function recordAppointmentDeletion(
  transaction: Transaction,
  tenantId: string,
  appointmentId: string,
  actor: ActivityActor,
): Promise<void> {
  const context = await appointmentActivityContext(
    transaction,
    tenantId,
    appointmentId,
  );
  if (!context) return;
  await recordActivity(transaction, tenantId, {
    actor,
    area: "AGENDA",
    action: "appointment.deleted",
    entityType: "appointment",
    entityId: appointmentId,
    entityLabel: context.label,
    details: context.details,
  });
}
