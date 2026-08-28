import { timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import { AppError } from "../errors/app-error.js";

const internalHeadersSchema = z.object({
  "x-tenant-id": z.string().trim().min(1).max(128),
  "x-user-id": z.string().trim().min(1).max(128),
  "x-request-id": z.string().trim().min(1).max(128),
});

export interface InternalRequestContext {
  tenantId: string;
  userId: string;
  requestId: string;
}

function tokenMatches(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function requireInternalAuth(
  request: FastifyRequest,
): Promise<void> {
  if (!env.INTERNAL_SERVICE_TOKEN) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      "Internal authentication is not configured.",
      500,
    );
  }

  const authorization = request.headers.authorization;
  const providedToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (
    !providedToken ||
    !tokenMatches(providedToken, env.INTERNAL_SERVICE_TOKEN)
  ) {
    throw new AppError("UNAUTHORIZED", "Invalid internal credentials.", 401);
  }

  const parsedHeaders = internalHeadersSchema.safeParse(request.headers);
  if (!parsedHeaders.success) {
    throw new AppError(
      "INVALID_INTERNAL_CONTEXT",
      "Tenant, user and request context headers are required.",
      400,
      z.flattenError(parsedHeaders.error).fieldErrors,
    );
  }

  request.internalContext = {
    tenantId: parsedHeaders.data["x-tenant-id"],
    userId: parsedHeaders.data["x-user-id"],
    requestId: parsedHeaders.data["x-request-id"],
  };
}

export function currentInternalContext(
  request: FastifyRequest,
): InternalRequestContext {
  if (!request.internalContext) {
    throw new AppError(
      "INVALID_INTERNAL_CONTEXT",
      "Internal request context is required.",
      400,
    );
  }

  return request.internalContext;
}
