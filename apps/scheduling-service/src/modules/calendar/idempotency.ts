import { createHash } from "node:crypto";

import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";

const staleLockMs = 5 * 60 * 1_000;

export class CalendarMutationIdempotency {
  constructor(private readonly prisma: PrismaClient) {}

  async execute<TResult>(input: {
    tenantId: string;
    key: string;
    operation: string;
    request: unknown;
    execute: () => Promise<TResult>;
    parseResponse: (value: unknown) => TResult;
  }): Promise<TResult> {
    const requestHash = hashRequest(input.request);
    const record = await this.claim({
      tenantId: input.tenantId,
      key: input.key,
      operation: input.operation,
      requestHash,
    });

    if (record.completed) {
      return input.parseResponse(record.response);
    }

    try {
      const response = await input.execute();
      await this.prisma.calendarMutationIdempotency.update({
        where: { id: record.id },
        data: {
          status: "COMPLETED",
          response: z.record(z.string(), z.json()).parse(response),
          lastErrorCode: null,
        },
      });
      return response;
    } catch (error) {
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

  private async claim(input: {
    tenantId: string;
    key: string;
    operation: string;
    requestHash: string;
  }): Promise<
    | { id: string; completed: false }
    | { id: string; completed: true; response: unknown }
  > {
    try {
      const created = await this.prisma.calendarMutationIdempotency.create({
        data: {
          ...input,
          status: "PENDING",
        },
      });
      return { id: created.id, completed: false };
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
          completed: true,
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
        return { id: existing.id, completed: false };
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
