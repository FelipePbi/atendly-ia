import { env } from "../../config/env.js";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import {
  addDays,
  instantToLocalDateTime,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Política única de escrita da agenda (Goal008).
 *
 * Toda mutação que ocupa ou libera tempo — confirmar, remarcar, cancelar,
 * criar e remover bloqueio — roda por aqui: uma transação `Serializable`,
 * `pg_advisory_xact_lock` em **todos** os dias afetados em ordem estável, a
 * revalidação de disponibilidade **dentro** da transação e retry limitado de
 * aborto serializável. Um caminho de escrita que não passe por este módulo é,
 * por definição, uma segunda política.
 */

/** Cliente que aceita o corpo transacional; o próprio Prisma ou uma transação. */
type TransactionalClient = Pick<PrismaClient, "$transaction">;

export const CALENDAR_WRITE_RETRY_EXCEEDED = "CALENDAR_WRITE_RETRY_EXCEEDED";

/**
 * Trava os dias afetados **em ordem estável** (datas ordenadas, sem
 * repetição). A ordem é o que impede que duas transações que tocam os mesmos
 * dois dias — remarcação de A→B e de B→A, por exemplo — se travem em
 * deadlock; a deduplicação evita depender da reentrância do advisory lock.
 */
export async function lockCalendarDays(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  dates: string[],
): Promise<void> {
  for (const date of [...new Set(dates)].sort()) {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${date}`}))`,
    );
  }
}

/**
 * Dias locais cobertos por um intervalo, para travar todos eles. O fim é
 * exclusivo: um bloqueio que termina exatamente à meia-noite não ocupa — nem
 * trava — o dia seguinte.
 */
export function calendarDaysBetween(
  startAt: Date,
  endAt: Date,
  timeZone: string,
): string[] {
  const first = instantToLocalDateTime(startAt, timeZone).date;
  const lastInstant =
    endAt.getTime() > startAt.getTime()
      ? new Date(endAt.getTime() - 1)
      : startAt;
  const last = instantToLocalDateTime(lastInstant, timeZone).date;
  const dates = [first];
  for (let cursor = first; cursor < last;) {
    cursor = addDays(cursor, 1);
    dates.push(cursor);
  }
  return dates;
}

/**
 * Instante do **banco**, não do processo (Goal008).
 *
 * A vigência de um hold é decidida por `expiresAt > now()` avaliado no banco:
 * o relógio de quem escreve pode estar adiantado, atrasado ou em outro fuso, e
 * um horário reservado não pode depender disso. Ler `now()` e comparar em
 * seguida é equivalente a comparar dentro do `WHERE`, porque `now()` é o
 * instante de início da transação e não muda enquanto ela vive — dentro de
 * `runCalendarWrite`, todas as avaliações de vigência de uma mesma mutação
 * usam exatamente o mesmo instante.
 */
export async function databaseNow(
  client: Pick<PrismaClient, "$queryRaw"> | Prisma.TransactionClient,
): Promise<Date> {
  const rows = await client.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT now() AS now`,
  );
  const now = rows[0]?.now;
  if (!(now instanceof Date)) {
    throw new Error("The database did not return a usable current instant.");
  }
  return now;
}

/**
 * Executa o corpo em transação `Serializable`, repetindo abortos
 * serializáveis até o limite configurado. Excedido o limite, o erro é próprio
 * (`CALENDAR_WRITE_RETRY_EXCEEDED`) e não o erro cru do banco: quem chamou
 * precisa distinguir "a agenda estava disputada demais agora" de "o pedido
 * era inválido".
 *
 * O retry envolve a transação **inteira**, inclusive a gravação do resultado
 * idempotente: tudo o que a tentativa anterior escreveu foi desfeito pelo
 * rollback, então repetir não duplica efeito.
 */
export async function runCalendarWrite<TResult>(
  prisma: TransactionalClient,
  run: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  options: { maxAttempts?: number } = {},
): Promise<TResult> {
  const maxAttempts = options.maxAttempts ?? env.CALENDAR_WRITE_MAX_ATTEMPTS;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(run, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (!isSerializationFailure(error)) throw error;
      if (attempt >= maxAttempts) {
        throw new AppError(
          CALENDAR_WRITE_RETRY_EXCEEDED,
          "The calendar write could not be serialized after the configured number of attempts.",
          409,
          { attempts: attempt },
        );
      }
    }
  }
}

/**
 * Aborto serializável: `40001` (serialization_failure) e `40P01`
 * (deadlock_detected) do PostgreSQL, e o `P2034` com que o Prisma reporta os
 * dois. O código pode vir na causa (driver `pg` embrulhado pelo Prisma), daí
 * a descida limitada pela cadeia de `cause`.
 */
export function isSerializationFailure(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 4) return false;
  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown };
    cause?: unknown;
  };
  if (isSerializationCode(candidate.code)) return true;
  if (isSerializationCode(candidate.meta?.code)) return true;
  return isSerializationFailure(candidate.cause, depth + 1);
}

function isSerializationCode(code: unknown): boolean {
  return code === "P2034" || code === "40001" || code === "40P01";
}
