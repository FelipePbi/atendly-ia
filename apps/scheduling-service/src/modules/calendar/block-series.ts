import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  addDays,
  instantToLocalDateTime,
  localDateTimeToInstant,
  weekdayIndex,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import { createTimeBlockRow } from "./time-blocks.js";
import {
  calendarDaysBetween,
  databaseNow,
  lockCalendarDays,
  runCalendarWrite,
} from "./write-policy.js";

/**
 * Serie finita de bloqueio/compromisso (Goal009): regra semanal
 * materializada em `TimeBlock` no momento da criacao — nunca gerada sob
 * demanda, nunca infinita. Criacao e edicao rodam sob a politica unica,
 * travando todos os dias afetados em ordem estavel; conflito de qualquer
 * ocorrencia com atendimento confirmado e reportado por ocorrencia e a
 * operacao e recusada, salvo decisao humana explicita de pular as
 * ocorrencias em conflito ou de forcar sobreposicao com motivo. `source` e
 * sempre `USER`: a IA nunca cria bloqueio, compromisso, excecao ou serie
 * (aplicado pela rota, nao por este modulo).
 */

export type BlockKind = "BLOCK" | "PERSONAL";

interface SeriesScope {
  tenantId: string;
  timeZone: string;
}

export interface BlockSeriesRule {
  kind: BlockKind;
  title: string | null;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  seriesStartDate: string;
  seriesEndDate?: string;
  occurrenceCount?: number;
}

export interface ConflictDecision {
  skipConflicts?: boolean;
  forceOverlapReason?: string;
}

interface OccurrenceConflict {
  date: string;
  appointmentId: string;
}

function assertRuleShape(rule: BlockSeriesRule): void {
  const days = [...new Set(rule.daysOfWeek)];
  if (
    days.length === 0 ||
    days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new AppError(
      "INVALID_BLOCK_SERIES_DAYS",
      "A block series requires at least one valid day of week (0-6).",
      400,
    );
  }
  if (rule.startTime >= rule.endTime) {
    throw new AppError(
      "INVALID_BLOCK_SERIES_TIME",
      "Block series start must precede end.",
      400,
    );
  }
  const hasEndDate = Boolean(rule.seriesEndDate);
  const hasCount = rule.occurrenceCount !== undefined;
  if (hasEndDate === hasCount) {
    throw new AppError(
      "INVALID_BLOCK_SERIES_TERMINATION",
      "A block series must terminate by an end date or by an occurrence count, never both or neither.",
      400,
    );
  }
  if (hasCount && (rule.occurrenceCount as number) <= 0) {
    throw new AppError(
      "INVALID_BLOCK_SERIES_TERMINATION",
      "Block series occurrence count must be positive.",
      400,
    );
  }
}

/**
 * Datas locais das ocorrencias, em ordem, respeitando o teto configurado.
 * Nunca gera alem do teto — uma serie que precisaria de mais e recusada
 * (`BLOCK_SERIES_TOO_LONG`), nao truncada silenciosamente.
 */
export function computeOccurrenceDates(rule: BlockSeriesRule): string[] {
  const days = new Set(rule.daysOfWeek);
  const cap = env.BLOCK_SERIES_MAX_OCCURRENCES;
  const dates: string[] = [];
  let cursor = rule.seriesStartDate;
  // Limite de varredura generoso (dez anos de dias) so para nao rodar para
  // sempre se a data final estiver mal formada; o teto de ocorrencias e quem
  // decide o tamanho real da serie.
  for (let scanned = 0; scanned < 3_650; scanned += 1) {
    if (rule.seriesEndDate && cursor > rule.seriesEndDate) break;
    if (days.has(weekdayIndex(cursor))) {
      dates.push(cursor);
      if (dates.length > cap) {
        throw new AppError(
          "BLOCK_SERIES_TOO_LONG",
          `Block series would produce more than the configured cap of ${cap} occurrences.`,
          400,
          { cap },
        );
      }
      if (rule.occurrenceCount && dates.length >= rule.occurrenceCount) break;
    }
    cursor = addDays(cursor, 1);
  }
  return dates;
}

async function conflictsFor(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  occurrences: Array<{ date: string; startAt: Date; endAt: Date }>,
): Promise<OccurrenceConflict[]> {
  const conflicts: OccurrenceConflict[] = [];
  for (const occurrence of occurrences) {
    const conflict = await transaction.appointment.findFirst({
      where: {
        tenantId,
        status: { not: "CANCELLED" },
        startAt: { lt: occurrence.endAt },
        endAt: { gt: occurrence.startAt },
      },
      select: { id: true },
    });
    if (conflict) {
      conflicts.push({ date: occurrence.date, appointmentId: conflict.id });
    }
  }
  return conflicts;
}

function conflictError(conflicts: OccurrenceConflict[]): AppError {
  return new AppError(
    "BLOCK_SERIES_APPOINTMENT_CONFLICT",
    "One or more occurrences overlap a confirmed appointment; a human decision (skip or force with a reason) is required.",
    409,
    { conflicts },
  );
}

async function materializeOccurrences(
  transaction: Prisma.TransactionClient,
  input: {
    tenantId: string;
    timeZone: string;
    seriesId: string;
    rule: BlockSeriesRule;
    decision?: ConflictDecision;
  },
): Promise<void> {
  const dates = computeOccurrenceDates(input.rule);
  const occurrences = dates.map((date) => ({
    date,
    startAt: localDateTimeToInstant(date, input.rule.startTime, input.timeZone),
    endAt: localDateTimeToInstant(date, input.rule.endTime, input.timeZone),
  }));
  const conflicts = await conflictsFor(transaction, input.tenantId, occurrences);
  if (
    conflicts.length > 0 &&
    !input.decision?.skipConflicts &&
    !input.decision?.forceOverlapReason
  ) {
    throw conflictError(conflicts);
  }
  const conflictingDates = new Set(conflicts.map((item) => item.date));
  for (const occurrence of occurrences) {
    const isConflicting = conflictingDates.has(occurrence.date);
    if (isConflicting && input.decision?.skipConflicts) continue;
    const forced = isConflicting && Boolean(input.decision?.forceOverlapReason);
    await createTimeBlockRow(transaction, {
      tenantId: input.tenantId,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      reason: forced
        ? `Sobreposicao forcada: ${input.decision?.forceOverlapReason}`
        : null,
      kind: input.rule.kind,
      title: input.rule.title,
      seriesId: input.seriesId,
      occurrenceDate: occurrence.date,
    });
  }
}

export async function createBlockSeries(
  prisma: PrismaClient,
  input: SeriesScope & { rule: BlockSeriesRule; createdBy: string } & ConflictDecision,
) {
  assertRuleShape(input.rule);
  const dates = computeOccurrenceDates(input.rule);
  if (dates.length === 0) {
    throw new AppError(
      "BLOCK_SERIES_EMPTY",
      "The block series rule produces no occurrence.",
      400,
    );
  }
  return runCalendarWrite(prisma, async (transaction) => {
    await lockCalendarDays(transaction, input.tenantId, dates);
    const series = await transaction.blockSeries.create({
      data: {
        tenantId: input.tenantId,
        kind: input.rule.kind,
        title: input.rule.title,
        daysOfWeek: input.rule.daysOfWeek,
        startTime: databaseTime(input.rule.startTime),
        endTime: databaseTime(input.rule.endTime),
        seriesStartDate: databaseDateOnly(input.rule.seriesStartDate),
        seriesEndDate: input.rule.seriesEndDate
          ? databaseDateOnly(input.rule.seriesEndDate)
          : null,
        occurrenceCount: input.rule.occurrenceCount ?? null,
        createdBy: input.createdBy,
      },
    });
    await materializeOccurrences(transaction, {
      tenantId: input.tenantId,
      timeZone: input.timeZone,
      seriesId: series.id,
      rule: input.rule,
      decision: input,
    });
    return series;
  });
}

/**
 * Edita a serie "desta data em diante" (Goal009): encerra a serie atual —
 * ocorrencias passadas nunca sao tocadas — e cria outra, cujas ocorrencias
 * (a partir de `fromDate`) sao materializadas sob a mesma checagem de
 * conflito. Nunca reescreve a serie antiga; so a encerra e a sucede.
 */
export async function editBlockSeriesFromDate(
  prisma: PrismaClient,
  input: SeriesScope & {
    seriesId: string;
    fromDate: string;
    rule: Partial<BlockSeriesRule>;
    createdBy: string;
  } & ConflictDecision,
) {
  return runCalendarWrite(prisma, async (transaction) => {
    const current = await transaction.blockSeries.findFirst({
      where: { id: input.seriesId, tenantId: input.tenantId, status: "ACTIVE" },
    });
    if (!current) blockSeriesNotFound();

    const futureOccurrences = await transaction.timeBlock.findMany({
      where: {
        tenantId: input.tenantId,
        seriesId: input.seriesId,
        occurrenceDate: { gte: databaseDateOnly(input.fromDate) },
      },
    });
    // Termino tambem herda da serie atual quando nao informado: um
    // `Partial<BlockSeriesRule>` que so muda o horario, por exemplo, nao
    // pode perder o "por data" ou "por contagem" que a serie ja tinha.
    const inheritedTermination =
      input.rule.seriesEndDate !== undefined ||
      input.rule.occurrenceCount !== undefined
        ? {
            seriesEndDate: input.rule.seriesEndDate,
            occurrenceCount: input.rule.occurrenceCount,
          }
        : {
            seriesEndDate: current.seriesEndDate
              ? current.seriesEndDate.toISOString().slice(0, 10)
              : undefined,
            occurrenceCount: current.occurrenceCount ?? undefined,
          };
    const newRule: BlockSeriesRule = {
      kind: input.rule.kind ?? current.kind,
      title: input.rule.title !== undefined ? input.rule.title : current.title,
      daysOfWeek: input.rule.daysOfWeek ?? current.daysOfWeek,
      startTime: input.rule.startTime ?? timeString(current.startTime),
      endTime: input.rule.endTime ?? timeString(current.endTime),
      seriesStartDate: input.fromDate,
      ...inheritedTermination,
    };
    assertRuleShape(newRule);
    const newDates = computeOccurrenceDates(newRule);

    const daysToLock = [
      ...futureOccurrences.map((occurrence) =>
        instantToLocalDateTime(occurrence.startAt, input.timeZone).date,
      ),
      ...newDates,
    ];
    await lockCalendarDays(transaction, input.tenantId, daysToLock);

    await transaction.timeBlock.deleteMany({
      where: {
        tenantId: input.tenantId,
        seriesId: input.seriesId,
        occurrenceDate: { gte: databaseDateOnly(input.fromDate) },
      },
    });

    const created = await transaction.blockSeries.create({
      data: {
        tenantId: input.tenantId,
        kind: newRule.kind,
        title: newRule.title,
        daysOfWeek: newRule.daysOfWeek,
        startTime: databaseTime(newRule.startTime),
        endTime: databaseTime(newRule.endTime),
        seriesStartDate: databaseDateOnly(newRule.seriesStartDate),
        seriesEndDate: newRule.seriesEndDate
          ? databaseDateOnly(newRule.seriesEndDate)
          : null,
        occurrenceCount: newRule.occurrenceCount ?? null,
        createdBy: input.createdBy,
      },
    });
    await transaction.blockSeries.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: current.id } },
      data: { status: "ENDED", supersededById: created.id },
    });
    await materializeOccurrences(transaction, {
      tenantId: input.tenantId,
      timeZone: input.timeZone,
      seriesId: created.id,
      rule: newRule,
      decision: input,
    });
    return created;
  });
}

/** Remove ou move uma unica ocorrencia sem tocar a serie (Goal009). */
export async function removeBlockOccurrence(
  prisma: PrismaClient,
  input: SeriesScope & { id: string },
) {
  return runCalendarWrite(prisma, async (transaction) => {
    const block = await transaction.timeBlock.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (!block) occurrenceNotFound();
    await lockCalendarDays(
      transaction,
      input.tenantId,
      calendarDaysBetween(block.startAt, block.endAt, input.timeZone),
    );
    const deleted = await transaction.timeBlock.deleteMany({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (deleted.count === 0) occurrenceNotFound();
  });
}

export async function moveBlockOccurrence(
  prisma: PrismaClient,
  input: SeriesScope & { id: string; startAt: Date; endAt: Date },
) {
  if (input.endAt <= input.startAt) {
    throw new AppError(
      "INVALID_AVAILABILITY_RANGE",
      "End must be after start.",
      400,
    );
  }
  return runCalendarWrite(prisma, async (transaction) => {
    const block = await transaction.timeBlock.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
    });
    if (!block) occurrenceNotFound();
    const days = [
      ...calendarDaysBetween(block.startAt, block.endAt, input.timeZone),
      ...calendarDaysBetween(input.startAt, input.endAt, input.timeZone),
    ];
    await lockCalendarDays(transaction, input.tenantId, days);
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
        "Moving this occurrence would overlap an existing appointment.",
        409,
        { appointmentId: conflict.id },
      );
    }
    return transaction.timeBlock.update({
      where: { id: input.id },
      data: {
        startAt: input.startAt,
        endAt: input.endAt,
        occurrenceDate: databaseDateOnly(
          instantToLocalDateTime(input.startAt, input.timeZone).date,
        ),
      },
    });
  });
}

/** Remove a serie dali em diante (Goal009): so ocorrencias futuras, nunca passadas. */
export async function removeBlockSeriesFuture(
  prisma: PrismaClient,
  input: SeriesScope & { seriesId: string },
) {
  return runCalendarWrite(prisma, async (transaction) => {
    const series = await transaction.blockSeries.findFirst({
      where: { id: input.seriesId, tenantId: input.tenantId },
    });
    if (!series) blockSeriesNotFound();
    const now = await databaseNow(transaction);
    const today = instantToLocalDateTime(now, input.timeZone).date;
    const futureOccurrences = await transaction.timeBlock.findMany({
      where: {
        tenantId: input.tenantId,
        seriesId: input.seriesId,
        occurrenceDate: { gte: databaseDateOnly(today) },
      },
    });
    await lockCalendarDays(
      transaction,
      input.tenantId,
      futureOccurrences.map(
        (occurrence) => instantToLocalDateTime(occurrence.startAt, input.timeZone).date,
      ),
    );
    await transaction.timeBlock.deleteMany({
      where: {
        tenantId: input.tenantId,
        seriesId: input.seriesId,
        occurrenceDate: { gte: databaseDateOnly(today) },
      },
    });
    await transaction.blockSeries.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: series.id } },
      data: { status: "ENDED" },
    });
  });
}

function databaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function databaseDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function timeString(value: Date): string {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(
    value.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

function blockSeriesNotFound(): never {
  throw new AppError(
    "BLOCK_SERIES_NOT_FOUND",
    "Block series was not found.",
    404,
  );
}

function occurrenceNotFound(): never {
  throw new AppError(
    "TIME_BLOCK_NOT_FOUND",
    "Time block occurrence was not found.",
    404,
  );
}
