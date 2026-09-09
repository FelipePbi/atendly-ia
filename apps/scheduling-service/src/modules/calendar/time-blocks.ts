import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  calendarDaysBetween,
  lockCalendarDays,
  runCalendarWrite,
} from "./write-policy.js";

/**
 * Bloqueio de agenda sob a política única de escrita (Goal008).
 *
 * Bloquear ocupa tempo e desbloquear libera tempo, exatamente como confirmar
 * e cancelar: as duas operações rodam na mesma transação `Serializable`, com
 * lock de todos os dias que o intervalo cobre. A checagem de conflito com
 * atendimentos acontece **dentro** da transação — feita fora dela, ela
 * responderia sobre um estado que já podia ter mudado quando a linha fosse
 * gravada.
 */

interface TimeBlockScope {
  tenantId: string;
  timeZone: string;
}

export async function createTimeBlock(
  prisma: PrismaClient,
  input: TimeBlockScope & {
    startAt: Date;
    endAt: Date;
    reason: string | null;
  },
) {
  return runCalendarWrite(prisma, async (transaction) => {
    await lockCalendarDays(
      transaction,
      input.tenantId,
      calendarDaysBetween(input.startAt, input.endAt, input.timeZone),
    );
    const conflict = await transaction.appointment.findFirst({
      where: {
        tenantId: input.tenantId,
        status: { not: "CANCELLED" },
        startAt: { lt: input.endAt },
        endAt: { gt: input.startAt },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new AppError(
        "TIME_BLOCK_APPOINTMENT_CONFLICT",
        "Time block overlaps an existing appointment.",
        409,
      );
    }
    return transaction.timeBlock.create({
      data: {
        tenantId: input.tenantId,
        startAt: input.startAt,
        endAt: input.endAt,
        reason: input.reason,
      },
    });
  });
}

export async function removeTimeBlock(
  prisma: PrismaClient,
  input: TimeBlockScope & { id: string },
): Promise<void> {
  await runCalendarWrite(prisma, async (transaction) => {
    const block = await transaction.timeBlock.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (!block) timeBlockNotFound();
    await lockCalendarDays(
      transaction,
      input.tenantId,
      calendarDaysBetween(block.startAt, block.endAt, input.timeZone),
    );
    const deleted = await transaction.timeBlock.deleteMany({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (deleted.count === 0) timeBlockNotFound();
  });
}

function timeBlockNotFound(): never {
  throw new AppError("TIME_BLOCK_NOT_FOUND", "Time block was not found.", 404);
}
