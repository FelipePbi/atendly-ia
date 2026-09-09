import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import { databaseNow } from "../calendar/write-policy.js";
import { recordAppointmentEvent } from "./appointment-event-service.js";

/**
 * Ciclo de vida do atendimento (Goal008): concluir, marcar falta, registrar
 * valor final e confirmar presença. Cada operação é idempotente, roda em uma
 * única transação (efeito + evento no mesmo commit) e nunca toca
 * `AppointmentItem` nem o cálculo do total do acordo — valor final e
 * presença são dados **separados**, nunca inferidos.
 */

type TransactionClient = Prisma.TransactionClient;

interface AppointmentRow {
  id: string;
  tenantId: string;
  status: string;
  completedAt: Date | null;
  completedBy: string | null;
  completionOrigin: "MANUAL" | "AUTO" | null;
  noShowAt: Date | null;
  noShowNote: string | null;
  presenceConfirmedAt: Date | null;
  finalValue: unknown;
  finalValueSetAt: Date | null;
  finalValueSetBy: string | null;
}

export interface AppointmentLifecycleSnapshot {
  id: string;
  status: string;
  completedAt: string | null;
  completedBy: string | null;
  completionOrigin: "MANUAL" | "AUTO" | null;
  noShowAt: string | null;
  noShowNote: string | null;
  presenceConfirmedAt: string | null;
  finalValue: number | null;
  finalValueSetAt: string | null;
  finalValueSetBy: string | null;
}

export const APPOINTMENT_NOT_FOUND = "APPOINTMENT_NOT_FOUND";
export const APPOINTMENT_COMPLETION_INVALID = "APPOINTMENT_COMPLETION_INVALID";
export const APPOINTMENT_NO_SHOW_INVALID = "APPOINTMENT_NO_SHOW_INVALID";
export const APPOINTMENT_FINAL_VALUE_INVALID =
  "APPOINTMENT_FINAL_VALUE_INVALID";
export const APPOINTMENT_STATE_CHANGED_CONCURRENTLY =
  "APPOINTMENT_STATE_CHANGED_CONCURRENTLY";

function toDecimalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toSnapshot(row: AppointmentRow): AppointmentLifecycleSnapshot {
  return {
    id: row.id,
    status: row.status,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    completedBy: row.completedBy,
    completionOrigin: row.completionOrigin,
    noShowAt: row.noShowAt ? row.noShowAt.toISOString() : null,
    noShowNote: row.noShowNote,
    presenceConfirmedAt: row.presenceConfirmedAt
      ? row.presenceConfirmedAt.toISOString()
      : null,
    finalValue: toDecimalNumber(row.finalValue),
    finalValueSetAt: row.finalValueSetAt
      ? row.finalValueSetAt.toISOString()
      : null,
    finalValueSetBy: row.finalValueSetBy,
  };
}

async function requireAppointmentWithin(
  transaction: TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<AppointmentRow> {
  const row = (await transaction.appointment.findUnique({
    where: { tenantId_id: { tenantId, id: appointmentId } },
  })) as AppointmentRow | null;
  if (!row) {
    throw new AppError(
      APPOINTMENT_NOT_FOUND,
      "Appointment was not found.",
      404,
    );
  }
  return row;
}

/**
 * Conclusão idempotente, manual ou automática. A revalidação de estado é a
 * própria condição do `updateMany`: sob concorrência (inclusive entre uma
 * confirmação manual e o loop automático), quem commitar primeiro vence, e
 * quem perde enxerga a linha já fora de `CONFIRMED` — sem duplicar efeito
 * nem evento, e sem precisar de `Serializable`, que aqui não protege
 * ocupação nenhuma.
 */
export async function completeAppointmentWithin(
  transaction: TransactionClient,
  input: {
    tenantId: string;
    appointmentId: string;
    origin: "MANUAL" | "AUTO";
    actor: string | null;
    now: Date;
  },
): Promise<{ applied: boolean; snapshot: AppointmentLifecycleSnapshot }> {
  const applied = await transaction.appointment.updateMany({
    where: {
      tenantId: input.tenantId,
      id: input.appointmentId,
      status: "CONFIRMED",
    },
    data: {
      // Sem `statusRaw`: ele preserva o bruto anterior a normalizacao do
      // Goal008 e e escrito uma unica vez (migration para linha legada,
      // criacao para linha nova). Reescreve-lo a cada transicao apagaria
      // exatamente o dado que a migration acabou de preservar.
      status: "COMPLETED",
      completedAt: input.now,
      completedBy: input.actor,
      completionOrigin: input.origin,
    },
  });
  if (applied.count === 0) {
    const current = await requireAppointmentWithin(
      transaction,
      input.tenantId,
      input.appointmentId,
    );
    if (current.status === "COMPLETED") {
      // Já concluído — manual ou automático, repetir não é um segundo efeito.
      return { applied: false, snapshot: toSnapshot(current) };
    }
    throw new AppError(
      APPOINTMENT_COMPLETION_INVALID,
      `Appointment with status ${current.status} cannot be completed.`,
      409,
      { status: current.status },
    );
  }
  const updated = await requireAppointmentWithin(
    transaction,
    input.tenantId,
    input.appointmentId,
  );
  await recordAppointmentEvent(
    transaction,
    input.tenantId,
    input.appointmentId,
    {
      type: "COMPLETED",
      source: input.origin === "AUTO" ? "SYSTEM" : "USER",
      actor: input.actor,
      before: { status: "CONFIRMED" },
      after: { status: "COMPLETED", completionOrigin: input.origin },
    },
  );
  return { applied: true, snapshot: toSnapshot(updated) };
}

/**
 * Falta, com observação opcional. Só a partir de confirmado (falta direta)
 * ou concluído (correção): concluir errado e depois perceber que o cliente
 * não veio precisa de um caminho de volta, e é o único definido — não existe
 * transição de falta de volta para confirmado ou concluído.
 */
export async function markNoShowWithin(
  transaction: TransactionClient,
  input: {
    tenantId: string;
    appointmentId: string;
    note: string | null;
    actor: string;
    now: Date;
  },
): Promise<{ applied: boolean; snapshot: AppointmentLifecycleSnapshot }> {
  const before = await requireAppointmentWithin(
    transaction,
    input.tenantId,
    input.appointmentId,
  );
  if (before.status === "NO_SHOW") {
    return { applied: false, snapshot: toSnapshot(before) };
  }
  if (before.status !== "CONFIRMED" && before.status !== "COMPLETED") {
    throw new AppError(
      APPOINTMENT_NO_SHOW_INVALID,
      `Appointment with status ${before.status} cannot be marked as a no-show.`,
      409,
      { status: before.status },
    );
  }
  const applied = await transaction.appointment.updateMany({
    where: {
      tenantId: input.tenantId,
      id: input.appointmentId,
      status: before.status,
    },
    data: {
      // Mesma razao da conclusao: `statusRaw` nao acompanha transicao.
      status: "NO_SHOW",
      noShowAt: input.now,
      noShowNote: input.note,
      // Correção de concluído para falta: a conclusão deixou de valer.
      completedAt: null,
      completedBy: null,
      completionOrigin: null,
    },
  });
  if (applied.count === 0) {
    throw new AppError(
      APPOINTMENT_STATE_CHANGED_CONCURRENTLY,
      "Appointment status changed concurrently; retry with the current state.",
      409,
    );
  }
  const updated = await requireAppointmentWithin(
    transaction,
    input.tenantId,
    input.appointmentId,
  );
  await recordAppointmentEvent(
    transaction,
    input.tenantId,
    input.appointmentId,
    {
      type: "NO_SHOW",
      source: "USER",
      actor: input.actor,
      reason: input.note,
      before: { status: before.status },
      after: { status: "NO_SHOW", noShowNote: input.note },
    },
  );
  return { applied: true, snapshot: toSnapshot(updated) };
}

/**
 * Valor final: Decimal opcional com data e ator, nunca inferido do preço
 * previsto no acordo. Não toca `AppointmentItem` nem recalcula o total —
 * são dados independentes, e cada chamada é uma correção explícita, não uma
 * operação idempotente de ciclo (por isso grava evento mesmo repetindo o
 * mesmo valor).
 */
export async function setFinalValueWithin(
  transaction: TransactionClient,
  input: {
    tenantId: string;
    appointmentId: string;
    amount: number;
    actor: string;
    now: Date;
  },
): Promise<AppointmentLifecycleSnapshot> {
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new AppError(
      APPOINTMENT_FINAL_VALUE_INVALID,
      "Final value must be a non-negative number.",
      400,
    );
  }
  const before = await requireAppointmentWithin(
    transaction,
    input.tenantId,
    input.appointmentId,
  );
  const updated = (await transaction.appointment.update({
    where: {
      tenantId_id: { tenantId: input.tenantId, id: input.appointmentId },
    },
    data: {
      finalValue: input.amount,
      finalValueSetAt: input.now,
      finalValueSetBy: input.actor,
    },
  })) as AppointmentRow;
  await recordAppointmentEvent(
    transaction,
    input.tenantId,
    input.appointmentId,
    {
      type: "FINAL_VALUE_SET",
      source: "USER",
      actor: input.actor,
      before: { finalValue: toDecimalNumber(before.finalValue) },
      after: { finalValue: input.amount },
    },
  );
  return toSnapshot(updated);
}

/** Presença confirmada: campo separado da conclusão, idempotente. */
export async function confirmPresenceWithin(
  transaction: TransactionClient,
  input: {
    tenantId: string;
    appointmentId: string;
    actor: string;
    now: Date;
  },
): Promise<{ applied: boolean; snapshot: AppointmentLifecycleSnapshot }> {
  const applied = await transaction.appointment.updateMany({
    where: {
      tenantId: input.tenantId,
      id: input.appointmentId,
      presenceConfirmedAt: null,
    },
    data: { presenceConfirmedAt: input.now },
  });
  if (applied.count === 0) {
    const current = await requireAppointmentWithin(
      transaction,
      input.tenantId,
      input.appointmentId,
    );
    return { applied: false, snapshot: toSnapshot(current) };
  }
  const updated = await requireAppointmentWithin(
    transaction,
    input.tenantId,
    input.appointmentId,
  );
  await recordAppointmentEvent(
    transaction,
    input.tenantId,
    input.appointmentId,
    {
      type: "PRESENCE_CONFIRMED",
      source: "USER",
      actor: input.actor,
      after: { presenceConfirmedAt: input.now.toISOString() },
    },
  );
  return { applied: true, snapshot: toSnapshot(updated) };
}

/**
 * Fachada para uso direto (fora do loop de conclusão automática): cada
 * operação abre sua própria transação, curta e sem lock de dia — o ciclo de
 * vida não ocupa nem libera horário, então não precisa da política de
 * escrita da agenda.
 */
export class AtendlyAppointmentLifecycleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tenantId: string,
    private readonly actor: string,
  ) {}

  async complete(
    appointmentId: string,
    options: { origin: "MANUAL" | "AUTO" } = { origin: "MANUAL" },
  ): Promise<AppointmentLifecycleSnapshot> {
    return this.prisma.$transaction(async (transaction) => {
      const now = await databaseNow(transaction);
      const { snapshot } = await completeAppointmentWithin(transaction, {
        tenantId: this.tenantId,
        appointmentId,
        origin: options.origin,
        actor: options.origin === "AUTO" ? null : this.actor,
        now,
      });
      return snapshot;
    });
  }

  async markNoShow(
    appointmentId: string,
    options: { note?: string | null } = {},
  ): Promise<AppointmentLifecycleSnapshot> {
    return this.prisma.$transaction(async (transaction) => {
      const now = await databaseNow(transaction);
      const { snapshot } = await markNoShowWithin(transaction, {
        tenantId: this.tenantId,
        appointmentId,
        note: options.note?.trim() || null,
        actor: this.actor,
        now,
      });
      return snapshot;
    });
  }

  async setFinalValue(
    appointmentId: string,
    amount: number,
  ): Promise<AppointmentLifecycleSnapshot> {
    return this.prisma.$transaction(async (transaction) => {
      const now = await databaseNow(transaction);
      return setFinalValueWithin(transaction, {
        tenantId: this.tenantId,
        appointmentId,
        amount,
        actor: this.actor,
        now,
      });
    });
  }

  async confirmPresence(
    appointmentId: string,
  ): Promise<AppointmentLifecycleSnapshot> {
    return this.prisma.$transaction(async (transaction) => {
      const now = await databaseNow(transaction);
      const { snapshot } = await confirmPresenceWithin(transaction, {
        tenantId: this.tenantId,
        appointmentId,
        actor: this.actor,
        now,
      });
      return snapshot;
    });
  }
}
