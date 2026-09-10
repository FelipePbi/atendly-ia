import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  addMinutes,
  localDateTimeToInstant,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import { lockCalendarDays, runCalendarWrite } from "./write-policy.js";

/**
 * Excecoes de disponibilidade geridas (Goal009): disponibilidade extra em
 * data normalmente fechada, indisponibilidade pontual (intervalo ou dia
 * inteiro), listagem por periodo e remocao — todas sob a politica unica
 * (transacao, lock do dia, retry). Uma indisponibilidade que cobre
 * atendimento confirmado e recusada, salvo decisao humana explicita
 * (ator + motivo), gravada na propria excecao. A excecao nunca altera
 * atendimento existente — ela so muda o que o motor de disponibilidade
 * oferece dali em diante.
 */

interface ExceptionScope {
  tenantId: string;
  timeZone: string;
}

export interface HumanConflictDecision {
  decidedBy: string;
  decidedReason: string;
}

function databaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function databaseDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

async function assertNoConfirmedConflict(
  transaction: Prisma.TransactionClient,
  input: {
    tenantId: string;
    timeZone: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    decision?: HumanConflictDecision;
  },
): Promise<void> {
  // Janela do dia local em instante: quando a excecao nao informa
  // intervalo, "dia inteiro" cobre 00:00-24:00 locais — a mesma leitura que
  // o motor de oferta faz para ausencia de horario.
  const rangeStart = localDateTimeToInstant(
    input.date,
    input.startTime ?? "00:00",
    input.timeZone,
  );
  const rangeEnd = input.endTime
    ? localDateTimeToInstant(input.date, input.endTime, input.timeZone)
    : addMinutes(
        localDateTimeToInstant(input.date, "00:00", input.timeZone),
        24 * 60,
      );

  const conflict = await transaction.appointment.findFirst({
    where: {
      tenantId: input.tenantId,
      status: { not: "CANCELLED" },
      startAt: { lt: rangeEnd },
      endAt: { gt: rangeStart },
    },
    select: { id: true },
  });
  if (conflict && !input.decision) {
    throw new AppError(
      "EXCEPTION_APPOINTMENT_CONFLICT",
      "The unavailability covers a confirmed appointment; a human decision with a reason is required.",
      409,
      { appointmentId: conflict.id },
    );
  }
}

export async function createExtraAvailability(
  prisma: PrismaClient,
  input: ExceptionScope & { date: string; startTime: string; endTime: string },
) {
  if (input.startTime >= input.endTime) {
    throw new AppError(
      "INVALID_AVAILABILITY_RANGE",
      "Availability start must precede end.",
      400,
    );
  }
  return runCalendarWrite(prisma, async (transaction) => {
    await lockCalendarDays(transaction, input.tenantId, [input.date]);
    return transaction.availabilityException.create({
      data: {
        tenantId: input.tenantId,
        date: databaseDateOnly(input.date),
        startTime: databaseTime(input.startTime),
        endTime: databaseTime(input.endTime),
        available: true,
      },
    });
  });
}

export async function createUnavailability(
  prisma: PrismaClient,
  input: ExceptionScope & {
    date: string;
    startTime: string | null;
    endTime: string | null;
    reason: string | null;
    decision?: HumanConflictDecision;
  },
) {
  if (input.startTime && input.endTime && input.startTime >= input.endTime) {
    throw new AppError(
      "INVALID_AVAILABILITY_RANGE",
      "Availability start must precede end.",
      400,
    );
  }
  return runCalendarWrite(prisma, async (transaction) => {
    await lockCalendarDays(transaction, input.tenantId, [input.date]);
    await assertNoConfirmedConflict(transaction, {
      tenantId: input.tenantId,
      timeZone: input.timeZone,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      decision: input.decision,
    });
    return transaction.availabilityException.create({
      data: {
        tenantId: input.tenantId,
        date: databaseDateOnly(input.date),
        startTime: input.startTime ? databaseTime(input.startTime) : null,
        endTime: input.endTime ? databaseTime(input.endTime) : null,
        available: false,
        reason: input.reason,
        decidedBy: input.decision?.decidedBy ?? null,
        decidedReason: input.decision?.decidedReason ?? null,
      },
    });
  });
}

export async function listAvailabilityExceptions(
  prisma: PrismaClient,
  input: { tenantId: string; startDate: string; endDate: string },
) {
  return prisma.availabilityException.findMany({
    where: {
      tenantId: input.tenantId,
      date: {
        gte: databaseDateOnly(input.startDate),
        lte: databaseDateOnly(input.endDate),
      },
    },
    orderBy: [{ date: "asc" }],
  });
}

export async function removeAvailabilityException(
  prisma: PrismaClient,
  input: ExceptionScope & { id: string },
) {
  return runCalendarWrite(prisma, async (transaction) => {
    const exception = await transaction.availabilityException.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (!exception) exceptionNotFound();
    await lockCalendarDays(transaction, input.tenantId, [
      exception.date.toISOString().slice(0, 10),
    ]);
    const deleted = await transaction.availabilityException.deleteMany({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (deleted.count === 0) exceptionNotFound();
  });
}

function exceptionNotFound(): never {
  throw new AppError(
    "AVAILABILITY_EXCEPTION_NOT_FOUND",
    "Availability exception was not found.",
    404,
  );
}
