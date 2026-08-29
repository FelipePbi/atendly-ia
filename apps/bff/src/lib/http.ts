import type { FastifyRequest } from "fastify";
import { type z } from "zod";

import { AppError } from "./errors.js";

export function dataResponse<T>(request: FastifyRequest, data: T) {
  return {
    data,
    requestId: request.id,
  };
}

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid request body.",
      400,
      parsed.error.flatten(),
    );
  }

  return parsed.data;
}

export function parseParams<T>(schema: z.ZodSchema<T>, params: unknown): T {
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid route params.",
      400,
      parsed.error.flatten(),
    );
  }

  return parsed.data;
}
