import { createHash } from "node:crypto";

import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  CalendarMutationCommit,
  CalendarMutationEffect,
} from "./calendar-provider.js";

const staleLockMs = 5 * 60 * 1_000;

const responseSchema = z.record(z.string(), z.json());

type ClaimOutcome =
  | { id: string; state: "CLAIMED" }
  | { id: string; state: "COMPLETED"; response: unknown }
  | { id: string; state: "RECOVERABLE"; effect: CalendarMutationEffect };

/**
 * Idempotência das mutações da agenda (Goal008).
 *
 * A diferença em relação ao Goal007 é onde o resultado é gravado: a mutação
 * recebe um `commit` e o chama **de dentro da sua própria transação**, de
 * modo que o efeito, a resposta serializada e a referência ao efeito entram
 * no mesmo commit. Queda entre o commit do efeito e a gravação do resultado
 * deixou de ser um estado possível para a fonte oficial; quando ele existe
 * mesmo assim (registro anterior a este Goal, intervenção manual), o
 * `PENDING` vencido com referência de efeito é recuperado como sucesso pela
 * própria entidade, nunca reexecutado.
 */
export class CalendarMutationIdempotency {
  constructor(private readonly prisma: PrismaClient) {}

  async execute<TResult>(input: {
    tenantId: string;
    key: string;
    operation: string;
    request: unknown;
    /**
     * A mutação. Recebe o `commit` que grava o resultado junto com o efeito;
     * uma fonte que não participe de transação de banco simplesmente não o
     * chama e o resultado é gravado logo depois.
     */
    execute: (commit: CalendarMutationCommit<TResult>) => Promise<TResult>;
    parseResponse: (value: unknown) => TResult;
    /** Lê o efeito já existente para recuperar uma chave vencida. */
    recoverEffect?: (effect: CalendarMutationEffect) => Promise<TResult>;
  }): Promise<TResult> {
    const requestHash = hashRequest(input.request);
    const record = await this.claim({
      tenantId: input.tenantId,
      key: input.key,
      operation: input.operation,
      requestHash,
    });

    if (record.state === "COMPLETED") {
      return input.parseResponse(record.response);
    }
    if (record.state === "RECOVERABLE") {
      const recovered = await this.recover(record.id, record.effect, input);
      // Efeito referenciado que não existe mais: a chave segue reivindicada e
      // a mutação roda de novo sob a mesma política.
      if (recovered) return recovered.result;
    }

    let committed = false;
    const commit: CalendarMutationCommit<TResult> = async (
      transaction,
      outcome,
    ) => {
      await transaction.calendarMutationIdempotency.update({
        where: { id: record.id },
        data: {
          status: "COMPLETED",
          response: responseSchema.parse(outcome.result),
          effectEntityType: outcome.effect.entityType,
          effectEntityId: outcome.effect.entityId,
          lastErrorCode: null,
        },
      });
      committed = true;
    };

    try {
      const response = await input.execute(commit);
      if (!committed) {
        await this.prisma.calendarMutationIdempotency.update({
          where: { id: record.id },
          data: {
            status: "COMPLETED",
            response: responseSchema.parse(response),
            lastErrorCode: null,
          },
        });
      }
      return response;
    } catch (error) {
      // A gravação do `COMPLETED` feita dentro da transação caiu junto com o
      // efeito no rollback: o registro voltou a `PENDING` e a falha é
      // registrada como tal.
      await this.prisma.calendarMutationIdempotency.updateMany({
        where: { id: record.id, status: "PENDING" },
        data: {
          status: "FAILED",
          lastErrorCode:
            error instanceof AppError ? error.code : "UNEXPECTED_ERROR",
        },
      });
      throw error;
    }
  }

  private async recover<TResult>(
    id: string,
    effect: CalendarMutationEffect,
    input: {
      recoverEffect?: (effect: CalendarMutationEffect) => Promise<TResult>;
    },
  ): Promise<{ result: TResult } | null> {
    if (!input.recoverEffect) return null;
    let result: TResult;
    try {
      result = await input.recoverEffect(effect);
    } catch {
      return null;
    }
    await this.prisma.calendarMutationIdempotency.update({
      where: { id },
      data: {
        status: "COMPLETED",
        response: responseSchema.parse(result),
        lastErrorCode: null,
      },
    });
    return { result };
  }

  private async claim(input: {
    tenantId: string;
    key: string;
    operation: string;
    requestHash: string;
  }): Promise<ClaimOutcome> {
    try {
      const created = await this.prisma.calendarMutationIdempotency.create({
        data: {
          ...input,
          status: "PENDING",
        },
      });
      return { id: created.id, state: "CLAIMED" };
    } catch {
      const existing = await this.prisma.calendarMutationIdempotency.findUnique(
        {
          where: {
            tenantId_key: { tenantId: input.tenantId, key: input.key },
          },
        },
      );
      if (!existing) throw new Error("Failed to claim idempotency key.");
      if (
        existing.operation !== input.operation ||
        existing.requestHash !== input.requestHash
      ) {
        throw new AppError(
          "IDEMPOTENCY_KEY_REUSED",
          "Idempotency-Key was already used with a different request.",
          409,
        );
      }
      if (existing.status === "COMPLETED") {
        return {
          id: existing.id,
          state: "COMPLETED",
          response: existing.response,
        };
      }

      const staleBefore = new Date(Date.now() - staleLockMs);
      const reclaimed =
        await this.prisma.calendarMutationIdempotency.updateMany({
          where: {
            id: existing.id,
            OR: [
              { status: "FAILED" },
              { status: "PENDING", lockedAt: { lt: staleBefore } },
            ],
          },
          data: {
            status: "PENDING",
            lockedAt: new Date(),
            lastErrorCode: null,
          },
        });
      if (reclaimed.count === 1) {
        if (existing.effectEntityType && existing.effectEntityId) {
          return {
            id: existing.id,
            state: "RECOVERABLE",
            effect: {
              entityType: existing.effectEntityType,
              entityId: existing.effectEntityId,
            },
          };
        }
        return { id: existing.id, state: "CLAIMED" };
      }
      throw new AppError(
        "IDEMPOTENCY_REQUEST_IN_PROGRESS",
        "A request with this Idempotency-Key is still in progress.",
        409,
      );
    }
  }
}

function hashRequest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
