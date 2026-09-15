import type { FastifyInstance } from "fastify";

import { dataResponse, parseBody } from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import {
  applyRetentionPatch,
  loadRetentionState,
  retentionPatchSchema,
} from "./settings.js";

/**
 * Contrato público do prazo de retenção (Goal023/WU-01, G-29).
 *
 * As duas rotas vivem sob {@link requireTenantContext}: `tenantId` vem
 * sempre da sessão, nunca do corpo, da query ou de parâmetro de rota.
 */
export async function registerV1RetentionSettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/v1/settings/retention",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      return dataResponse(
        request,
        await loadRetentionState(getPrisma(), tenant.tenantId),
      );
    },
  );

  app.patch(
    "/v1/settings/retention",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const body = parseBody(retentionPatchSchema, request.body);
      return dataResponse(
        request,
        await applyRetentionPatch(
          getPrisma(),
          tenant.tenantId,
          body,
          tenant.userId,
        ),
      );
    },
  );
}
