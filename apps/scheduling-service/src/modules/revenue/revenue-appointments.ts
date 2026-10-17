import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  addDays,
  instantToLocalDateTime,
  localDateTimeToInstant,
} from "../../shared/date-time/calendar-date-time.js";
import {
  agreementCents,
  appointmentValueCents,
  type RevenueAppointmentRow,
  type RevenuePeriod,
  revenuePeriodRange,
} from "./revenue-report.js";

/**
 * Os atendimentos por trás dos números do Faturamento (D-179): ao tocar em
 * "Faltas e cancelamentos" ou no aviso de "atendimentos concluídos sem
 * valor", a profissional vê quais foram, quem marcou e quem cancelou ou
 * registrou a falta — a IA, você, a conclusão automática ou a importação —,
 * com o motivo escrito quando houver.
 */

export const REVENUE_APPOINTMENT_KINDS = [
  "cancelled",
  "no_show",
  "unvalued",
] as const;
export type RevenueAppointmentKind = (typeof REVENUE_APPOINTMENT_KINDS)[number];

/** Uma leitura nunca traz mais que isto; `total` diz quantos havia. */
export const REVENUE_APPOINTMENTS_LIMIT = 200;

/** Por que um concluído não tem valor. */
export type UnvaluedReason =
  "ON_REQUEST" | "STARTING_AT" | "NOT_INFORMED" | "UNLISTED";

export interface RevenueAppointmentItem {
  id: string;
  /** Dia e hora no fuso do negócio. */
  date: string;
  time: string;
  customerId: string;
  customerName: string | null;
  services: string[];
  /** Valor do acordo (o que deixou de entrar); nulo sem preço fixo. */
  amount: number | null;
  /** Quem marcou: `AI`, `USER` ou `INTEGRATION`. */
  bookedBy: string;
  /** Quem cancelou ou registrou a falta; nulo quando não há registro. */
  changedBy: string | null;
  /** O motivo escrito no cancelamento ou na falta, quando houver. */
  note: string | null;
  /** Só em `unvalued`: por que ficou sem valor. */
  unvaluedReason: UnvaluedReason | null;
}

export interface RevenueAppointmentList {
  kind: RevenueAppointmentKind;
  start: string;
  end: string;
  total: number;
  items: RevenueAppointmentItem[];
}

export interface RevenueAppointmentRowWithChange extends RevenueAppointmentRow {
  id: string;
  /** Último evento de cancelamento ou falta, se houver. */
  change: { source: string; reason: string | null } | null;
}

const STATUS_BY_KIND: Record<RevenueAppointmentKind, string> = {
  cancelled: "CANCELLED",
  no_show: "NO_SHOW",
  unvalued: "COMPLETED",
};

export function unvaluedReasonOf(row: RevenueAppointmentRow): UnvaluedReason {
  if (row.items.length === 0) return "UNLISTED";
  for (const item of row.items) {
    if (item.priceType === "ON_REQUEST") return "ON_REQUEST";
    if (item.priceType === "STARTING_AT") return "STARTING_AT";
    if (item.priceType === "NOT_INFORMED") return "NOT_INFORMED";
  }
  return "NOT_INFORMED";
}

export function buildRevenueAppointmentList(
  rows: readonly RevenueAppointmentRowWithChange[],
  input: {
    kind: RevenueAppointmentKind;
    period: RevenuePeriod;
    date: string;
    timeZone: string;
  },
): RevenueAppointmentList {
  const range = revenuePeriodRange(input.period, input.date);
  const status = STATUS_BY_KIND[input.kind];
  const matching = rows
    .filter((row) => {
      if (row.status !== status) return false;
      const date = instantToLocalDateTime(row.startAt, input.timeZone).date;
      if (date < range.start || date >= range.end) return false;
      return input.kind !== "unvalued" || appointmentValueCents(row) === null;
    })
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime());

  return {
    kind: input.kind,
    start: range.start,
    end: addDays(range.end, -1),
    total: matching.length,
    items: matching.slice(0, REVENUE_APPOINTMENTS_LIMIT).map((row) => {
      const local = instantToLocalDateTime(row.startAt, input.timeZone);
      const agreement = agreementCents(row);
      return {
        id: row.id,
        date: local.date,
        time: local.time,
        customerId: row.customerId,
        customerName: row.customerName,
        services: row.items.map((item) => item.serviceName),
        amount:
          input.kind === "unvalued" || agreement === null
            ? null
            : agreement / 100,
        bookedBy: row.source ?? "USER",
        changedBy:
          input.kind === "unvalued" ? null : (row.change?.source ?? null),
        note: input.kind === "unvalued" ? null : (row.change?.reason ?? null),
        unvaluedReason:
          input.kind === "unvalued" ? unvaluedReasonOf(row) : null,
      };
    }),
  };
}

export async function loadRevenueAppointmentList(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    kind: RevenueAppointmentKind;
    period: RevenuePeriod;
    date: string;
    timeZone: string;
  },
): Promise<RevenueAppointmentList> {
  const range = revenuePeriodRange(input.period, input.date);
  const eventType = input.kind === "no_show" ? "NO_SHOW" : "CANCELLED";
  const rows = await prisma.appointment.findMany({
    where: {
      tenantId,
      status: STATUS_BY_KIND[input.kind],
      startAt: {
        gte: localDateTimeToInstant(range.start, "00:00", input.timeZone),
        lt: localDateTimeToInstant(range.end, "00:00", input.timeZone),
      },
    },
    select: {
      id: true,
      status: true,
      startAt: true,
      source: true,
      customerId: true,
      finalValue: true,
      customer: { select: { name: true } },
      events: {
        where: { type: eventType },
        orderBy: [{ occurredAt: "desc" }, { sequence: "desc" }],
        select: { source: true, reason: true },
        take: 1,
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          serviceId: true,
          serviceNameSnapshot: true,
          priceTypeSnapshot: true,
          priceSnapshot: true,
          service: { select: { name: true } },
        },
      },
    },
  });
  return buildRevenueAppointmentList(
    rows.map((row) => ({
      id: row.id,
      status: row.status,
      startAt: row.startAt,
      source: row.source,
      customerId: row.customerId,
      customerName: row.customer.name,
      finalValue: row.finalValue,
      change: row.events[0]
        ? { source: row.events[0].source, reason: row.events[0].reason }
        : null,
      items: row.items.map((item) => ({
        serviceId: item.serviceId,
        serviceName: item.service.name || item.serviceNameSnapshot,
        colorToken: null,
        priceType: item.priceTypeSnapshot,
        price: item.priceSnapshot,
      })),
    })),
    input,
  );
}
