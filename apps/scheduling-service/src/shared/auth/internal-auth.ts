import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../errors/app-error.js";
import {
  identifyInternalClient,
  internalAuthConfigured,
  type InternalClient,
  SERVICE_AUDIENCE,
} from "./internal-credentials.js";

const internalHeadersSchema = z.object({
  "x-tenant-id": z.string().trim().min(1).max(128),
  "x-user-id": z.string().trim().min(1).max(128),
  "x-request-id": z.string().trim().min(1).max(128),
});

export interface InternalRequestContext {
  tenantId: string;
  userId: string;
  requestId: string;
  caller: InternalClient["callerId"];
}

export async function requireInternalAuth(
  request: FastifyRequest,
): Promise<void> {
  if (!internalAuthConfigured()) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      "Internal authentication is not configured.",
      500,
    );
  }

  const authorization = request.headers.authorization;
  const providedToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  // Identidade vem da credencial; a audiência declarada é apenas conferida
  // contra este serviço e nunca substitui a verificação.
  const client = identifyInternalClient(providedToken);
  if (!client) {
    throw new AppError("UNAUTHORIZED", "Invalid internal credentials.", 401);
  }

  const audience = request.headers["x-service-audience"];
  const declaredAudience = Array.isArray(audience) ? audience[0] : audience;
  if (declaredAudience && declaredAudience.trim() !== SERVICE_AUDIENCE) {
    throw new AppError("FORBIDDEN", "Invalid internal audience.", 403);
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
    caller: client.callerId,
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
