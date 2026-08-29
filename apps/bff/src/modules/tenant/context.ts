import type { FastifyRequest } from "fastify";

import type { InternalRequestContext } from "../../clients/internal-http-client.js";
import { currentTenantContext } from "../../lib/tenant-context.js";

export function internalContext(
  request: FastifyRequest,
): InternalRequestContext {
  const tenant = currentTenantContext(request);
  return {
    tenantId: tenant.tenantId,
    userId: tenant.userId,
    requestId: request.id,
  };
}
